# NFT Prizes & Giveaway Wheel Feature - Comprehensive Plan

## Executive Summary

This plan adds two major features:
1. **NFT Prize Support**: Ability to give away NFTs (JPEGs) in addition to tokens
2. **Giveaway Wheel Game Type**: New game type with customizable wheel and random winner selection

**Key Requirements:**
- NFTs must be sent to master wallet first, then distributed on-chain via contract
- Wheel has random spin (no admin selection)
- Admin can remove participants before spin
- Mixed prizes (tokens + NFTs) supported
- Settlement prefills with usernames/FIDs for confirmation
- All prizes come from same master wallet

---

## Part 1: NFT Prize Support

### 1.1 Database Schema Changes

**New columns in `poker.games` table:**

```sql
-- Prize configuration (supports both tokens and NFTs)
ALTER TABLE poker.games
ADD COLUMN IF NOT EXISTS prize_type text DEFAULT 'tokens', -- 'tokens', 'nfts', 'mixed'
ADD COLUMN IF NOT EXISTS prize_token_amounts numeric[], -- Array of token amounts per winner
ADD COLUMN IF NOT EXISTS prize_token_currency text, -- Currency for token prizes (USDC, etc.)
ADD COLUMN IF NOT EXISTS prize_nft_contract_addresses text[], -- Array of NFT contract addresses
ADD COLUMN IF NOT EXISTS prize_nft_token_ids numeric[], -- Array of token IDs (parallel to contract addresses)
ADD COLUMN IF NOT EXISTS prize_nft_metadata jsonb, -- Store NFT metadata (name, image URL, etc.)
ADD COLUMN IF NOT EXISTS prize_distribution jsonb; -- Maps winner position to prizes: [{"position": 1, "tokens": 100, "nfts": [{"contract": "0x...", "tokenId": 123}]}]
```

**New table: `poker.game_prizes` (alternative approach - more normalized):**

```sql
CREATE TABLE IF NOT EXISTS poker.game_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.games(id) ON DELETE CASCADE,
  winner_position integer NOT NULL, -- 1 = first place, 2 = second place, etc.
  token_amount numeric, -- Token prize amount (null if no token prize)
  token_currency text, -- Currency (USDC, etc.)
  nft_contract_address text, -- NFT contract address (null if no NFT)
  nft_token_id numeric, -- NFT token ID (null if no NFT)
  nft_metadata jsonb, -- NFT metadata (name, image, etc.)
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(game_id, winner_position, nft_contract_address, nft_token_id) -- Prevent duplicate prizes
);

CREATE INDEX IF NOT EXISTS game_prizes_game_id_idx ON poker.game_prizes (game_id);
CREATE INDEX IF NOT EXISTS game_prizes_winner_position_idx ON poker.game_prizes (winner_position);
```

**Recommendation:** Use the `game_prizes` table approach for better normalization and flexibility.

---

### 1.2 Smart Contract Changes

**Option A: Extend Existing GameEscrow Contract**

Add NFT transfer function to existing contract:

```solidity
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

function distributeNFTs(
    string memory gameId,
    address[] memory nftContracts,
    uint256[] memory tokenIds,
    address[] memory recipients
) external onlyMasterOrOwner nonReentrant {
    require(nftContracts.length == tokenIds.length, "Mismatched NFT arrays");
    require(nftContracts.length == recipients.length, "Mismatched recipient array");
    
    for (uint256 i = 0; i < nftContracts.length; i++) {
        IERC721 nft = IERC721(nftContracts[i]);
        require(nft.ownerOf(tokenIds[i]) == address(this) || nft.ownerOf(tokenIds[i]) == MASTER_WALLET, "NFT not in contract or master wallet");
        nft.safeTransferFrom(MASTER_WALLET, recipients[i], tokenIds[i]);
        emit NFTDistributed(gameId, nftContracts[i], tokenIds[i], recipients[i]);
    }
}
```

**Option B: New Contract (Recommended)**

Create `PrizeDistribution.sol` contract that handles both tokens and NFTs:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract PrizeDistribution is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    address public constant MASTER_WALLET = 0xd942a322Fa7d360F22C525a652F51cA0FC4aF012;
    
    event TokenPrizeDistributed(
        string indexed gameId,
        address indexed recipient,
        address token,
        uint256 amount
    );
    
    event NFTPrizeDistributed(
        string indexed gameId,
        address indexed recipient,
        address nftContract,
        uint256 tokenId
    );
    
    modifier onlyMasterOrOwner() {
        require(
            msg.sender == MASTER_WALLET || msg.sender == owner(),
            "Not authorized"
        );
        _;
    }
    
    /**
     * @notice Distribute token prizes from master wallet
     */
    function distributeTokens(
        string memory gameId,
        address tokenContract,
        address[] memory recipients,
        uint256[] memory amounts
    ) external onlyMasterOrOwner nonReentrant {
        require(recipients.length == amounts.length, "Mismatched arrays");
        
        IERC20 token = IERC20(tokenContract);
        
        for (uint256 i = 0; i < recipients.length; i++) {
            if (amounts[i] > 0) {
                token.safeTransferFrom(MASTER_WALLET, recipients[i], amounts[i]);
                emit TokenPrizeDistributed(gameId, recipients[i], tokenContract, amounts[i]);
            }
        }
    }
    
    /**
     * @notice Distribute NFT prizes from master wallet
     */
    function distributeNFTs(
        string memory gameId,
        address[] memory nftContracts,
        uint256[] memory tokenIds,
        address[] memory recipients
    ) external onlyMasterOrOwner nonReentrant {
        require(nftContracts.length == tokenIds.length, "Mismatched NFT arrays");
        require(nftContracts.length == recipients.length, "Mismatched recipient array");
        
        for (uint256 i = 0; i < nftContracts.length; i++) {
            IERC721 nft = IERC721(nftContracts[i]);
            // Verify NFT is owned by master wallet
            require(nft.ownerOf(tokenIds[i]) == MASTER_WALLET, "NFT not owned by master wallet");
            nft.safeTransferFrom(MASTER_WALLET, recipients[i], tokenIds[i]);
            emit NFTPrizeDistributed(gameId, recipients[i], nftContracts[i], tokenIds[i]);
        }
    }
    
    /**
     * @notice Distribute mixed prizes (tokens + NFTs) in one transaction
     */
    function distributeMixedPrizes(
        string memory gameId,
        address tokenContract,
        address[] memory tokenRecipients,
        uint256[] memory tokenAmounts,
        address[] memory nftContracts,
        uint256[] memory nftTokenIds,
        address[] memory nftRecipients
    ) external onlyMasterOrOwner nonReentrant {
        // Distribute tokens
        if (tokenRecipients.length > 0) {
            distributeTokens(gameId, tokenContract, tokenRecipients, tokenAmounts);
        }
        
        // Distribute NFTs
        if (nftContracts.length > 0) {
            distributeNFTs(gameId, nftContracts, nftTokenIds, nftRecipients);
        }
    }
}
```

**Recommendation:** Option B (new contract) - cleaner separation, easier to test, doesn't risk breaking existing functionality.

---

### 1.3 TypeScript Types Updates

**Update `src/lib/types.ts`:**

```typescript
export type GameType = 'poker' | 'giveaway_wheel';
export type PrizeType = 'tokens' | 'nfts' | 'mixed';

export interface NFTPrize {
  contract_address: string;
  token_id: number;
  metadata?: {
    name?: string;
    image_url?: string;
    description?: string;
  };
}

export interface PrizeConfiguration {
  position: number; // 1 = first place, 2 = second place, etc.
  token_amount?: number | null;
  token_currency?: string | null;
  nfts?: NFTPrize[] | null;
}

export interface Game {
  // ... existing fields ...
  game_type?: GameType | null; // 'poker' | 'giveaway_wheel'
  prize_type?: PrizeType | null; // 'tokens' | 'nfts' | 'mixed'
  prize_configuration?: PrizeConfiguration[] | null; // Array of prizes per position
  // ... rest of existing fields ...
}
```

---

### 1.4 Game Creation Flow Updates

**File: `src/app/clubs/[slug]/games/new/page.tsx`**

**New UI Sections:**

1. **Game Type Selection** (first step):
   - Radio buttons: "Poker" or "Giveaway Wheel"
   - If "Giveaway Wheel" selected, show wheel customization options
   - If "Poker" selected, show existing poker game options

2. **Prize Configuration Section**:
   - Prize Type: "Tokens Only", "NFTs Only", "Mixed"
   - If Tokens or Mixed:
     - Token amounts per position (based on payout_bps)
     - Token currency selector
   - If NFTs or Mixed:
     - Upload NFT contract addresses
     - Upload token IDs (or fetch from contract)
     - Upload metadata (name, image URL) - optional, can fetch from contract
     - Show master wallet address for admin to send NFTs to
   - Display master wallet address prominently: `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`

3. **Wheel Customization** (only for giveaway_wheel):
   - Background color picker
   - Upload images (PNG/JPEG) - max 10 images, max 5MB each
   - Image positioning: "Random (Sticker Style)" (only option for MVP)
   - Segment type: "Equal" or "Weighted"
   - If weighted: Show input for weight per participant

**Form State Additions:**

```typescript
const [gameType, setGameType] = useState<'poker' | 'giveaway_wheel'>('poker');
const [prizeType, setPrizeType] = useState<'tokens' | 'nfts' | 'mixed'>('tokens');
const [prizeTokenAmounts, setPrizeTokenAmounts] = useState<Record<number, string>>({});
const [prizeNFTs, setPrizeNFTs] = useState<Array<{contract: string, tokenId: string, metadata?: any}>>([]);
const [wheelBackgroundColor, setWheelBackgroundColor] = useState('#FF3B1A');
const [wheelImages, setWheelImages] = useState<File[]>([]);
const [wheelSegmentType, setWheelSegmentType] = useState<'equal' | 'weighted'>('equal');
const [participantWeights, setParticipantWeights] = useState<Record<number, number>>({});
```

---

### 1.5 API Route Updates

**File: `src/app/api/games/route.ts` (POST handler)**

**New validation and storage:**

```typescript
// Validate game type
const gameType = body.game_type || 'poker';
if (gameType !== 'poker' && gameType !== 'giveaway_wheel') {
  throw new Error('Invalid game_type. Must be "poker" or "giveaway_wheel"');
}

// Validate prize configuration
if (body.prize_type) {
  const prizeType = body.prize_type;
  if (!['tokens', 'nfts', 'mixed'].includes(prizeType)) {
    throw new Error('Invalid prize_type. Must be "tokens", "nfts", or "mixed"');
  }
  
  // Validate token prizes
  if (prizeType === 'tokens' || prizeType === 'mixed') {
    if (!body.prize_token_amounts || !Array.isArray(body.prize_token_amounts)) {
      throw new Error('prize_token_amounts required for token or mixed prizes');
    }
    if (!body.prize_token_currency) {
      throw new Error('prize_token_currency required for token or mixed prizes');
    }
  }
  
  // Validate NFT prizes
  if (prizeType === 'nfts' || prizeType === 'mixed') {
    if (!body.prize_nft_contracts || !Array.isArray(body.prize_nft_contracts)) {
      throw new Error('prize_nft_contracts required for NFT or mixed prizes');
    }
    if (!body.prize_nft_token_ids || !Array.isArray(body.prize_nft_token_ids)) {
      throw new Error('prize_nft_token_ids required for NFT or mixed prizes');
    }
    if (body.prize_nft_contracts.length !== body.prize_nft_token_ids.length) {
      throw new Error('prize_nft_contracts and prize_nft_token_ids arrays must have same length');
    }
  }
}

// ⚠️ CRITICAL FIX: Validate prize configuration before storing
if (body.prize_configuration && Array.isArray(body.prize_configuration)) {
  // Sort by position
  const sorted = body.prize_configuration.sort((a, b) => a.position - b.position);
  
  // Validate positions are sequential (1, 2, 3, ...)
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].position !== i + 1) {
      throw new Error(`Prize positions must be sequential starting from 1. Found position ${sorted[i].position} at index ${i}`);
    }
  }
  
  // Validate each prize
  for (const prize of sorted) {
    // Validate token amounts
    if (prize.token_amount !== null && prize.token_amount !== undefined) {
      const amount = parseFloat(String(prize.token_amount));
      if (isNaN(amount) || amount <= 0) {
        throw new Error(`Invalid token_amount for position ${prize.position}: must be positive number`);
      }
    }
    
    // Validate NFTs
    if (prize.nfts && Array.isArray(prize.nfts)) {
      const { ethers } = await import('ethers');
      for (const nft of prize.nfts) {
        if (!ethers.isAddress(nft.contract_address)) {
          throw new Error(`Invalid NFT contract address for position ${prize.position}: ${nft.contract_address}`);
        }
        const tokenId = parseInt(String(nft.token_id), 10);
        if (isNaN(tokenId) || tokenId < 0) {
          throw new Error(`Invalid NFT token ID for position ${prize.position}: must be non-negative integer`);
        }
      }
    }
  }
  
  // Store prize configuration in game_prizes table
  for (const prize of sorted) {
    // Handle multiple NFTs per position
    if (prize.nfts && Array.isArray(prize.nfts)) {
      for (const nft of prize.nfts) {
        await pokerDb.insert('game_prizes', {
          game_id: game.id,
          winner_position: prize.position,
          token_amount: prize.token_amount || null,
          token_currency: prize.token_currency || null,
          nft_contract_address: nft.contract_address,
          nft_token_id: nft.token_id,
          nft_metadata: nft.metadata || null,
        });
      }
    } else {
      // No NFTs, just token prize
      await pokerDb.insert('game_prizes', {
        game_id: game.id,
        winner_position: prize.position,
        token_amount: prize.token_amount || null,
        token_currency: prize.token_currency || null,
        nft_contract_address: null,
        nft_token_id: null,
        nft_metadata: null,
      });
    }
  }
}

// Store wheel customization (for giveaway_wheel games)
if (gameType === 'giveaway_wheel') {
  gameData.wheel_background_color = body.wheel_background_color || '#FF3B1A';
  gameData.wheel_segment_type = body.wheel_segment_type || 'equal';
  gameData.wheel_image_urls = body.wheel_image_urls || []; // URLs from image upload
  gameData.wheel_participant_weights = body.wheel_participant_weights || null;
}

// ⚠️ CRITICAL FIX: Skip on-chain game creation for wheel games without entry fees
const isPaidGame = entry_fee_amount && parseFloat(String(entry_fee_amount)) > 0;
const needsOnChainCreation = isPaidGame && gameType !== 'giveaway_wheel';

// Only create on-chain if needed
if (needsOnChainCreation) {
  // Existing on-chain game creation logic
  await createGameOnContract(...);
}
```

---

### 1.6 Image Storage Strategy

**Option: Supabase Storage**

1. Create storage bucket: `wheel-images`
2. Upload images when game is created
3. Store image URLs in database

**Implementation:**

```typescript
// File: src/lib/storage.ts (new file)
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE } from './constants';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

export async function uploadWheelImage(
  gameId: string,
  imageFile: File,
  imageIndex: number
): Promise<string> {
  const fileExt = imageFile.name.split('.').pop();
  const fileName = `${gameId}/${imageIndex}-${Date.now()}.${fileExt}`;
  
  const { data, error } = await supabase.storage
    .from('wheel-images')
    .upload(fileName, imageFile, {
      contentType: imageFile.type,
      upsert: false,
    });
  
  if (error) throw error;
  
  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('wheel-images')
    .getPublicUrl(fileName);
  
  return publicUrl;
}
```

**Database storage:**

```sql
-- Add wheel image URLs to games table
ALTER TABLE poker.games
ADD COLUMN IF NOT EXISTS wheel_image_urls text[]; -- Array of image URLs
```

**File size limits:**
- Max 5MB per image
- Max 10 images per wheel
- Formats: PNG, JPEG

---

## Part 2: Giveaway Wheel Game Type

### 2.1 Database Schema for Wheel

**Add to `poker.games` table:**

```sql
ALTER TABLE poker.games
ADD COLUMN IF NOT EXISTS game_type text DEFAULT 'poker', -- 'poker' | 'giveaway_wheel'
ADD COLUMN IF NOT EXISTS wheel_background_color text DEFAULT '#FF3B1A',
ADD COLUMN IF NOT EXISTS wheel_segment_type text DEFAULT 'equal', -- 'equal' | 'weighted'
ADD COLUMN IF NOT EXISTS wheel_image_urls text[], -- Array of image URLs for wheel decoration
ADD COLUMN IF NOT EXISTS wheel_participant_weights jsonb, -- Map of participant FID to weight: {"318447": 2, "123456": 1}
ADD COLUMN IF NOT EXISTS wheel_removed_participants bigint[], -- Array of FIDs removed before spin
ADD COLUMN IF NOT EXISTS wheel_winner_fid bigint, -- Winner FID (set after spin)
ADD COLUMN IF NOT EXISTS wheel_spun_at timestamptz; -- Timestamp when wheel was spun
```

---

### 2.2 Wheel Component

**File: `src/components/GiveawayWheel.tsx` (new file)**

**Features:**
- Canvas-based wheel rendering
- Random positioning of uploaded images (sticker style)
- Smooth spin animation
- Weighted or equal segments
- Winner selection on spin completion

**Props:**
```typescript
interface GiveawayWheelProps {
  participants: Array<{fid: number, username?: string, weight?: number}>;
  backgroundColor: string;
  imageUrls: string[];
  segmentType: 'equal' | 'weighted';
  onSpinComplete?: (winnerFid: number) => void;
  disabled?: boolean; // Disable if already spun
  removedParticipants?: number[]; // FIDs to exclude
}
```

**Implementation approach:**
- Use HTML5 Canvas for wheel rendering
- Calculate segment angles based on weights (if weighted) or equal division
- Overlay images randomly positioned and sized
- Animate spin with easing function
- Select winner based on final pointer position

---

### 2.3 Wheel Spin API

**File: `src/app/api/games/[id]/spin-wheel/route.ts` (new file)**

**⚠️ CRITICAL FIX:** Use `crypto.randomInt()` instead of `Math.random()` for secure random selection.

```typescript
import { randomInt } from 'crypto'; // CRITICAL FIX: Use crypto.randomInt()

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: gameId } = await params;
  const { fid } = await requireAuth(req);
  
  // Verify admin/club owner
  const clubId = await getClubForGame(gameId);
  if (!isGlobalAdmin(fid)) {
    await requireClubOwner(fid, clubId);
  }
  
  // Fetch game
  const games = await pokerDb.fetch<Game>('games', {
    filters: { id: gameId },
    limit: 1,
  });
  
  if (games.length === 0) {
    return NextResponse.json({ ok: false, error: 'Game not found' }, { status: 404 });
  }
  
  const game = games[0];
  
  if (game.game_type !== 'giveaway_wheel') {
    return NextResponse.json({ ok: false, error: 'Not a giveaway wheel game' }, { status: 400 });
  }
  
  if (game.wheel_winner_fid) {
    return NextResponse.json({ ok: false, error: 'Wheel already spun' }, { status: 400 });
  }
  
  // Fetch participants (status='joined')
  const participants = await pokerDb.fetch('participants', {
    filters: { game_id: gameId, status: 'joined' },
    select: 'fid',
  });
  
  // Filter out removed participants
  const removedFids = game.wheel_removed_participants || [];
  const eligibleParticipants = participants.filter((p: any) => 
    !removedFids.includes(p.fid)
  );
  
  if (eligibleParticipants.length === 0) {
    return NextResponse.json({ ok: false, error: 'No eligible participants' }, { status: 400 });
  }
  
  // Select winner based on segment type
  let winnerFid: number;
  
  if (game.wheel_segment_type === 'weighted') {
    // Weighted selection
    const weights = game.wheel_participant_weights || {};
    const weightedList: number[] = [];
    
    eligibleParticipants.forEach((p: any) => {
      const weight = weights[p.fid] || 1;
      for (let i = 0; i < weight; i++) {
        weightedList.push(p.fid);
      }
    });
    
    // CRITICAL FIX: Use crypto.randomInt() for secure random selection
    const randomIndex = randomInt(0, weightedList.length);
    winnerFid = weightedList[randomIndex];
  } else {
    // Equal probability
    // CRITICAL FIX: Use crypto.randomInt() for secure random selection
    const randomIndex = randomInt(0, eligibleParticipants.length);
    winnerFid = eligibleParticipants[randomIndex].fid;
  }
  
  // Update game with winner
  await pokerDb.update('games', { id: gameId }, {
    wheel_winner_fid: winnerFid,
    wheel_spun_at: new Date().toISOString(),
  });
  
  return NextResponse.json({
    ok: true,
    data: { winnerFid },
  });
}
```

---

### 2.4 Remove Participants API

**File: `src/app/api/games/[id]/remove-participant/route.ts` (new file)**

```typescript
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: gameId } = await params;
  const { fid } = await requireAuth(req);
  const { participantFid } = await req.json();
  
  // Verify admin/club owner
  const clubId = await getClubForGame(gameId);
  if (!isGlobalAdmin(fid)) {
    await requireClubOwner(fid, clubId);
  }
  
  // Fetch game
  const games = await pokerDb.fetch<Game>('games', {
    filters: { id: gameId },
    limit: 1,
  });
  
  if (games.length === 0 || games[0].game_type !== 'giveaway_wheel') {
    return NextResponse.json({ ok: false, error: 'Game not found or not a wheel game' }, { status: 404 });
  }
  
  const game = games[0];
  
  // Check if wheel already spun
  if (game.wheel_winner_fid) {
    return NextResponse.json({ ok: false, error: 'Cannot remove participants after wheel is spun' }, { status: 400 });
  }
  
  // Add to removed list
  const removed = game.wheel_removed_participants || [];
  if (!removed.includes(participantFid)) {
    removed.push(participantFid);
    await pokerDb.update('games', { id: gameId }, {
      wheel_removed_participants: removed,
    });
  }
  
  return NextResponse.json({ ok: true });
}
```

---

## Part 3: Settlement Flow Updates

### 3.1 Settlement API Updates

**File: `src/app/api/games/[id]/settle-contract/route.ts`**

**⚠️ CRITICAL FIXES:**
1. Handle wheel games differently (use `wheel_winner_fid`, not `winnerFids` from request)
2. Use Neynar API for wallet addresses when no payment transactions exist
3. Skip `payout_bps` validation for wheel games
4. Use `PrizeDistribution` contract for all prize distributions (not `GameEscrow.settleGame`)

**Updated settlement flow:**

```typescript
// After fetching game
const game = games[0];

// CRITICAL FIX: Handle wheel games differently
if (game.game_type === 'giveaway_wheel') {
  // Wheel games: winner is already determined
  const winnerFid = game.wheel_winner_fid;
  if (!winnerFid) {
    return NextResponse.json({ 
      ok: false, 
      error: 'Wheel not spun yet. Spin the wheel before settling.' 
    }, { status: 400 });
  }
  
  // CRITICAL FIX: Use Neynar API for wallet address (no payment tx)
  const { getAllPlayerWalletAddresses } = await import('~/lib/neynar-wallet');
  const addresses = await getAllPlayerWalletAddresses(winnerFid);
  
  if (!addresses || addresses.length === 0) {
    return NextResponse.json({ 
      ok: false, 
      error: `Could not retrieve wallet address for winner FID ${winnerFid}` 
    }, { status: 400 });
  }
  
  // Filter out known contract addresses
  const knownContracts = [
    GAME_ESCROW_CONTRACT?.toLowerCase(),
    BASE_USDC_ADDRESS.toLowerCase(),
  ].filter(Boolean);
  
  const walletAddresses = addresses.filter(addr => 
    !knownContracts.includes(addr.toLowerCase())
  );
  
  if (walletAddresses.length === 0) {
    return NextResponse.json({ 
      ok: false, 
      error: `No valid wallet address found for winner FID ${winnerFid}` 
    }, { status: 400 });
  }
  
  const winnerAddress = walletAddresses[walletAddresses.length - 1]; // Prefer verified
  
  // Fetch prize configuration for position 1 only (wheel games always have one winner)
  const prizeConfig = await pokerDb.fetch('game_prizes', {
    filters: { game_id: gameId, winner_position: 1 },
    select: '*',
  });
  
  if (prizeConfig.length === 0) {
    return NextResponse.json({ 
      ok: false, 
      error: 'No prize configuration found for this game' 
    }, { status: 400 });
  }
  
  // Separate token and NFT prizes
  const tokenPrizes: Array<{recipient: string, amount: bigint, currency: string}> = [];
  const nftPrizes: Array<{recipient: string, contract: string, tokenId: number}> = [];
  
  for (const prize of prizeConfig) {
    if (prize.token_amount) {
      tokenPrizes.push({
        recipient: winnerAddress,
        amount: amountToUnits(prize.token_amount, prize.token_currency || 'USDC'),
        currency: prize.token_currency || 'USDC',
      });
    }
    
    if (prize.nft_contract_address && prize.nft_token_id) {
      nftPrizes.push({
        recipient: winnerAddress,
        contract: prize.nft_contract_address,
        tokenId: prize.nft_token_id,
      });
    }
  }
  
  // CRITICAL FIX: Use PrizeDistribution contract (not GameEscrow)
  const { PRIZE_DISTRIBUTION_CONTRACT } = await import('~/lib/constants');
  if (!PRIZE_DISTRIBUTION_CONTRACT) {
    return NextResponse.json({ 
      ok: false, 
      error: 'PrizeDistribution contract not configured' 
    }, { status: 500 });
  }
  
  // Verify NFT ownership before distribution
  if (nftPrizes.length > 0) {
    const { verifyAllNFTsOwned } = await import('~/lib/nft-ops');
    const verification = await verifyAllNFTsOwned(
      nftPrizes.map(p => ({ contract: p.contract, tokenId: p.tokenId }))
    );
    
    if (!verification.allOwned) {
      return NextResponse.json({ 
        ok: false, 
        error: `NFTs not in master wallet: ${JSON.stringify(verification.missing)}` 
      }, { status: 400 });
    }
  }
  
  // Distribute tokens
  if (tokenPrizes.length > 0) {
    const tokenContract = tokenPrizes[0].currency === 'USDC' 
      ? BASE_USDC_ADDRESS 
      : tokenPrizes[0].currency;
    
    const prizeContract = new ethers.Contract(
      PRIZE_DISTRIBUTION_CONTRACT,
      PRIZE_DISTRIBUTION_ABI,
      wallet
    );
    
    const recipients = tokenPrizes.map(p => p.recipient);
    const amounts = tokenPrizes.map(p => p.amount);
    
    const tx = await prizeContract.distributeTokens(
      gameId,
      tokenContract,
      recipients,
      amounts
    );
    await tx.wait();
  }
  
  // Distribute NFTs
  if (nftPrizes.length > 0) {
    const prizeContract = new ethers.Contract(
      PRIZE_DISTRIBUTION_CONTRACT,
      PRIZE_DISTRIBUTION_ABI,
      wallet
    );
    
    const nftContracts = nftPrizes.map(p => p.contract);
    const nftTokenIds = nftPrizes.map(p => p.tokenId);
    const nftRecipients = nftPrizes.map(p => p.recipient);
    
    const tx = await prizeContract.distributeNFTs(
      gameId,
      nftContracts,
      nftTokenIds,
      nftRecipients
    );
    await tx.wait();
  }
  
  // Update game status
  await pokerDb.update('games', { id: gameId }, {
    status: 'completed',
    settled_at: new Date().toISOString(),
  });
  
  return NextResponse.json({ ok: true, data: { winnerFid, winnerAddress } });
}

// For poker games, continue with existing logic...
// (existing winnerFids pathway with payout_bps validation)
```

---

### 3.2 Settlement UI Updates

**File: `src/app/games/[id]/page.tsx`**

**New settlement modal:**

1. **Prefill section:**
   - Show game type (Poker or Giveaway Wheel)
   - Show prize type (Tokens, NFTs, or Mixed)
   - For wheel games: Show winner FID and username
   - For poker games: Show winner selection (existing)
   - Show prize breakdown:
     - Position 1: 100 USDC + 1 NFT (Contract: 0x..., Token ID: 123)
     - Position 2: 50 USDC
     - etc.

2. **Confirmation section:**
   - List all winners with:
     - Username (fetch from Neynar)
     - FID
     - Wallet address (derived from payment tx or fetched)
     - Token amount (if any)
     - NFT details (if any): Contract address, Token ID, Name
   - "Confirm Settlement" button
   - Shows master wallet address for reference

**Implementation:**

```typescript
// Fetch usernames for all winners
const winnerFids = game.game_type === 'giveaway_wheel' 
  ? [game.wheel_winner_fid]
  : selectedWinnerFids;

const usernames = await fetchUsernamesForFids(winnerFids); // New helper function

// Fetch prize configuration
const prizeConfig = await authedFetch(`/api/games/${id}/prizes`, { method: 'GET' }, token);

// Display confirmation modal with:
// - Winner usernames and FIDs
// - Prize breakdown per winner
// - One-click confirm button
```

---

## Part 4: Implementation Phases

### Phase 1: Database & Types (Foundation)
1. Create database migration for new columns
2. Create `game_prizes` table
3. Update TypeScript types
4. Test migrations

### Phase 2: Smart Contract
1. Create `PrizeDistribution.sol` contract
2. Deploy to Base (via Remix)
3. Update contract ABIs in code
4. Test NFT transfers

### Phase 3: Game Creation UI
1. Add game type selector
2. Add prize configuration UI
3. Add wheel customization UI
4. Add image upload functionality
5. Update API route to handle new fields

### Phase 4: Wheel Component
1. Create `GiveawayWheel.tsx` component
2. Implement canvas rendering
3. Implement spin animation
4. Implement winner selection
5. Add remove participant functionality

### Phase 5: Settlement Updates
1. Update settlement API for NFT support
2. Update settlement UI with prefilled data
3. Add username/FID display
4. Add prize breakdown display
5. Test end-to-end settlement

### Phase 6: Testing & Polish
1. Test all flows end-to-end
2. Test edge cases (no NFTs, no tokens, mixed)
3. Test wheel with various configurations
4. Performance optimization
5. UI/UX polish

---

## Critical Questions & Decisions

### Q1: Image Storage
**Decision:** Use Supabase Storage
- Bucket: `wheel-images`
- Path: `{gameId}/{index}-{timestamp}.{ext}`
- Max 5MB per image, max 10 images
- Public URLs stored in database
- **Implementation:** Create bucket in Supabase Dashboard, set public access

### Q2: NFT Metadata
**Decision:** Store minimal metadata in database, fetch full metadata from contract when needed
- Store: contract address, token ID
- Optional: name, image URL (can fetch from contract)
- Use ERC721 `tokenURI()` function or OpenSea API
- **Implementation:** Create helper function `fetchNFTMetadata(contract, tokenId)`

### Q3: Master Wallet Display
**Decision:** Show master wallet address prominently in game creation
- Display: `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`
- Instructions: "Send NFTs to this wallet before creating game"
- Add copy-to-clipboard button
- **Location:** Show in prize configuration section when NFT or Mixed prize type selected

### Q4: Wheel Winner Selection
**Decision:** Server-side random selection (cryptographically secure)
- Use Node.js `crypto.randomInt()` for randomness
- Store winner immediately after selection
- No client-side selection (prevents manipulation)
- **Verification:** Winner selection happens in `/api/games/[id]/spin-wheel` route

### Q5: Prize Distribution Order
**Decision:** Distribute tokens first, then NFTs (sequential)
- If token distribution fails, don't distribute NFTs
- If NFT distribution fails, tokens already sent (log error, allow retry)
- All-or-nothing for each prize type
- **Error Handling:** Log which prizes succeeded/failed, allow partial retry

### Q6: NFT Ownership Verification
**Decision:** Verify NFTs are in master wallet before settlement
- Check on-chain ownership before distribution
- Fail settlement if NFT not owned by master wallet
- **Implementation:** Use `IERC721.ownerOf(tokenId)` in contract or ethers.js

### Q7: Username Fetching for Settlement
**Decision:** Use existing `/api/users/bulk` endpoint
- Already implemented in codebase
- Fetches usernames for multiple FIDs in one call
- Falls back to FID if username unavailable
- **Implementation:** Reuse existing pattern from `ParticipantListModal`

---

## Database Migration Script

**File: `supabase_migration_nft_and_wheel.sql`**

```sql
-- Add game type and prize columns
ALTER TABLE poker.games
ADD COLUMN IF NOT EXISTS game_type text DEFAULT 'poker',
ADD COLUMN IF NOT EXISTS prize_type text DEFAULT 'tokens',
ADD COLUMN IF NOT EXISTS wheel_background_color text DEFAULT '#FF3B1A',
ADD COLUMN IF NOT EXISTS wheel_segment_type text DEFAULT 'equal',
ADD COLUMN IF NOT EXISTS wheel_image_urls text[],
ADD COLUMN IF NOT EXISTS wheel_participant_weights jsonb,
ADD COLUMN IF NOT EXISTS wheel_removed_participants bigint[],
ADD COLUMN IF NOT EXISTS wheel_winner_fid bigint,
ADD COLUMN IF NOT EXISTS wheel_spun_at timestamptz;

-- Create game_prizes table
CREATE TABLE IF NOT EXISTS poker.game_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES poker.games(id) ON DELETE CASCADE,
  winner_position integer NOT NULL,
  token_amount numeric,
  token_currency text,
  nft_contract_address text,
  nft_token_id numeric,
  nft_metadata jsonb,
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(game_id, winner_position, nft_contract_address, nft_token_id)
);

CREATE INDEX IF NOT EXISTS game_prizes_game_id_idx ON poker.game_prizes (game_id);
CREATE INDEX IF NOT EXISTS game_prizes_winner_position_idx ON poker.game_prizes (winner_position);

-- Add comments
COMMENT ON COLUMN poker.games.game_type IS 'Game type: poker or giveaway_wheel';
COMMENT ON COLUMN poker.games.prize_type IS 'Prize type: tokens, nfts, or mixed';
COMMENT ON TABLE poker.game_prizes IS 'Prize configuration per winner position';
```

---

## File Structure

**New Files:**
- `src/components/GiveawayWheel.tsx` - Wheel component
- `src/lib/storage.ts` - Supabase Storage helpers
- `src/lib/nft-ops.ts` - NFT contract operations
- `src/app/api/games/[id]/spin-wheel/route.ts` - Wheel spin API
- `src/app/api/games/[id]/remove-participant/route.ts` - Remove participant API
- `src/app/api/games/[id]/prizes/route.ts` - Get prize configuration
- `contracts/PrizeDistribution.sol` - New contract for NFT/token distribution

**Modified Files:**
- `src/lib/types.ts` - Add new types
- `src/app/clubs/[slug]/games/new/page.tsx` - Add game type and prize UI
- `src/app/api/games/route.ts` - Handle new fields
- `src/app/games/[id]/page.tsx` - Add wheel display and settlement updates
- `src/app/api/games/[id]/settle-contract/route.ts` - Add NFT distribution
- `src/lib/contracts.ts` - Add PrizeDistribution ABI
- `src/lib/contract-ops.ts` - Add NFT distribution functions

---

## Verification Checklist

### Pre-Implementation
- [ ] Database migration script reviewed
- [ ] Contract design reviewed (can deploy to testnet first)
- [ ] Image storage bucket created in Supabase
- [ ] Master wallet has test NFTs for testing

### Post-Implementation
- [ ] Game creation with NFT prizes works
- [ ] Game creation with wheel customization works
- [ ] Wheel spin selects random winner
- [ ] Participants can be removed before spin
- [ ] Settlement distributes tokens correctly
- [ ] Settlement distributes NFTs correctly
- [ ] Settlement shows usernames and FIDs
- [ ] Mixed prizes (tokens + NFTs) work
- [ ] All edge cases handled

---

## Risk Assessment

### High Risk
- **NFT Contract Integration**: Need to verify NFT standard (ERC721), handle edge cases
- **Master Wallet Security**: NFTs must be in wallet before distribution
- **Random Selection**: Must be cryptographically secure

### Medium Risk
- **Image Upload**: File size limits, storage costs
- **Wheel Rendering**: Performance with many images
- **Settlement Complexity**: Mixed prizes add complexity

### Low Risk
- **UI Updates**: Mostly additive changes
- **Database Changes**: Well-isolated, backward compatible

---

## Next Steps

1. **Review this plan** - Verify all assumptions are correct
2. **Create database migration** - Test locally first
3. **Design contract** - Get feedback before deploying
4. **Implement Phase 1** - Database and types
5. **Implement Phase 2** - Contract deployment
6. **Implement remaining phases** - One at a time with testing

---

## Additional Implementation Details

### NFT Ownership Verification

**Before settlement, verify all NFTs are in master wallet:**

```typescript
// File: src/lib/nft-ops.ts (new file)
import { ethers } from 'ethers';
import { BASE_RPC_URL, MASTER_WALLET_ADDRESS } from './constants';

const ERC721_ABI = [
  {
    constant: true,
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    type: 'function',
  },
] as const;

export async function verifyNFTOwnership(
  contractAddress: string,
  tokenId: number
): Promise<boolean> {
  const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
  const contract = new ethers.Contract(contractAddress, ERC721_ABI, provider);
  
  try {
    const owner = await contract.ownerOf(tokenId);
    return owner.toLowerCase() === MASTER_WALLET_ADDRESS.toLowerCase();
  } catch (error) {
    console.error('[nft-ops] Error verifying ownership:', error);
    return false;
  }
}

export async function verifyAllNFTsOwned(
  nfts: Array<{contract: string, tokenId: number}>
): Promise<{allOwned: boolean, missing: Array<{contract: string, tokenId: number}>}> {
  const missing: Array<{contract: string, tokenId: number}> = [];
  
  for (const nft of nfts) {
    const owned = await verifyNFTOwnership(nft.contract, nft.tokenId);
    if (!owned) {
      missing.push(nft);
    }
  }
  
  return {
    allOwned: missing.length === 0,
    missing,
  };
}
```

### Username Fetching Helper

**Reuse existing pattern for settlement UI:**

```typescript
// File: src/lib/settlement-helpers.ts (new file)
export async function fetchUsernamesForFids(
  fids: number[],
  token: string
): Promise<Map<number, {username?: string, displayName?: string}>> {
  if (fids.length === 0) return new Map();
  
  try {
    const res = await authedFetch(`/api/users/bulk?fids=${fids.join(',')}`, {
      method: 'GET',
    }, token);
    
    if (!res.ok) return new Map();
    
    const data = await res.json();
    const userMap = new Map();
    
    if (data.ok && data.data) {
      data.data.forEach((user: any) => {
        userMap.set(user.fid, {
          username: user.username,
          displayName: user.display_name,
        });
      });
    }
    
    return userMap;
  } catch (error) {
    console.error('[settlement-helpers] Error fetching usernames:', error);
    return new Map();
  }
}
```

### Wheel Component Implementation Details

**Canvas-based wheel with image overlays:**

```typescript
// File: src/components/GiveawayWheel.tsx
// Key implementation points:

1. **Segment Calculation:**
   - Equal: 360 / participantCount degrees per segment
   - Weighted: Calculate angles based on weights, sum to 360

2. **Image Overlay:**
   - Load images as Image objects
   - Random position: Math.random() * wheelRadius
   - Random size: baseSize * (0.5 + Math.random() * 0.5) // 50-100% of base
   - Random rotation: Math.random() * 360
   - Draw on canvas with ctx.drawImage()

3. **Spin Animation:**
   - Use requestAnimationFrame
   - Easing function: easeOutCubic
   - Duration: 3-5 seconds
   - Final angle determines winner

4. **Winner Selection:**
   - Calculate final segment from finalAngle
   - Map to participant FID
   - Call onSpinComplete callback
```

### Game Creation UI Flow

**Step-by-step form flow:**

1. **Step 1: Game Type**
   - Radio: "Poker" or "Giveaway Wheel"
   - If Wheel: Show wheel-specific options
   - If Poker: Show existing poker options

2. **Step 2: Prize Configuration**
   - Prize Type: "Tokens Only" | "NFTs Only" | "Mixed"
   - **If Tokens or Mixed:**
     - Show payout structure (based on payout_bps)
     - Input token amount per position
     - Select currency (USDC, etc.)
   - **If NFTs or Mixed:**
     - Show master wallet: `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`
     - Instructions: "Send NFTs to this wallet first"
     - Add NFT button: "Add NFT Prize"
     - Modal: Contract address, Token ID, Position (1st, 2nd, etc.)
     - Optional: Fetch metadata button

3. **Step 3: Wheel Customization** (only if game_type === 'giveaway_wheel')
   - Background color picker
   - Upload images (drag & drop or file input)
   - Preview wheel with images
   - Segment type: "Equal" or "Weighted"
   - If weighted: Show weight inputs per participant (after participants join)

4. **Step 4: Game Details** (existing)
   - ClubGG link, scheduled time, etc.

### Settlement UI Flow

**Updated settlement modal:**

1. **Prefill Section:**
   ```
   Game Type: Giveaway Wheel
   Prize Type: Mixed
   
   Winners:
   ┌─────────────────────────────────────────┐
   │ Position 1: @username (FID: 318447)      │
   │   Wallet: 0x1234...5678                 │
   │   Prizes:                                │
   │     - 100 USDC                           │
   │     - NFT: Cool Art #123                 │
   │       Contract: 0xabc...def             │
   │       Token ID: 123                      │
   └─────────────────────────────────────────┘
   ```

2. **Confirmation Button:**
   - "Confirm Settlement" (one click)
   - Shows loading state during settlement
   - Shows success/error message

3. **Error Handling:**
   - If NFT not in master wallet: Show which NFTs are missing
   - If token transfer fails: Show error, allow retry
   - If NFT transfer fails: Show error, tokens already sent

---

## Contract Deployment Instructions

**For PrizeDistribution.sol contract:**

1. **Open Remix.ethereum.org**
2. **Create new file:** `PrizeDistribution.sol`
3. **Paste contract code** (from plan)
4. **Compile** with Solidity 0.8.20
5. **Deploy to Base:**
   - Network: Base Mainnet
   - Account: Master wallet (must match MASTER_WALLET constant)
   - Constructor: No parameters needed
6. **Verify contract** on Basescan
7. **Update environment variable:**
   - `PRIZE_DISTRIBUTION_CONTRACT=0x...` (new contract address)

---

## Testing Checklist

### NFT Prize Testing
- [ ] Create game with NFT prizes
- [ ] Verify master wallet display shows correct address
- [ ] Send test NFT to master wallet
- [ ] Create game with NFT contract address and token ID
- [ ] Verify NFT ownership before settlement
- [ ] Settle game and verify NFT transfer
- [ ] Verify NFT appears in winner's wallet

### Wheel Game Testing
- [ ] Create giveaway wheel game
- [ ] Upload wheel images
- [ ] Set background color
- [ ] Choose equal segments
- [ ] Choose weighted segments
- [ ] Remove participants before spin
- [ ] Spin wheel and verify random winner
- [ ] Verify winner stored in database
- [ ] Settle wheel game with prizes

### Mixed Prize Testing
- [ ] Create game with tokens + NFTs
- [ ] Verify prize configuration stored correctly
- [ ] Settle and verify both tokens and NFTs distributed
- [ ] Test error cases (NFT missing, token insufficient)

### Settlement UI Testing
- [ ] Verify usernames display correctly
- [ ] Verify FIDs display correctly
- [ ] Verify wallet addresses display correctly
- [ ] Verify prize breakdown displays correctly
- [ ] Test one-click confirmation
- [ ] Test error messages

---

---

## ⚠️ CRITICAL GAPS IDENTIFIED - MUST FIX BEFORE IMPLEMENTATION

**See `PLAN_GAP_ANALYSIS.md` for detailed gap analysis.**

### Critical Fixes Required:

1. **Add `game_prizes` to `VALID_POKER_TABLES`** in `src/lib/pokerDb.ts`
2. **Handle wheel games in settlement:** Use `wheel_winner_fid`, fetch wallet from Neynar (not payment tx)
3. **Use `crypto.randomInt()`** instead of `Math.random()` for wheel spin
4. **Clarify contract usage:** Use `PrizeDistribution` for all prize distributions (tokens + NFTs)
5. **Skip on-chain game creation** for wheel games without entry fees

**This plan is comprehensive but requires the above fixes before implementation.**
