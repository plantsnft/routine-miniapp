# Revised Implementation Plan - NFT & Wheel Features (All Gaps Fixed)

## Overview

This is a revised, gap-free implementation plan that addresses all 10 critical gaps identified in the gap analysis. This plan is ready for implementation.

---

## Phase 1: Foundation (Database & Types)

### 1.1 Database Migration

**File:** `supabase_migration_nft_and_wheel.sql`

**Critical Fix:** Already added `game_prizes` to `VALID_POKER_TABLES` in `pokerDb.ts` ✅

```sql
-- Add game type and prize columns to poker.games
ALTER TABLE poker.games
ADD COLUMN IF NOT EXISTS game_type text DEFAULT 'poker', -- 'poker' | 'giveaway_wheel'
ADD COLUMN IF NOT EXISTS prize_type text DEFAULT 'tokens', -- 'tokens', 'nfts', 'mixed'
ADD COLUMN IF NOT EXISTS wheel_background_color text DEFAULT '#FF3B1A',
ADD COLUMN IF NOT EXISTS wheel_segment_type text DEFAULT 'equal', -- 'equal' | 'weighted'
ADD COLUMN IF NOT EXISTS wheel_image_urls text[], -- Array of image URLs for wheel decoration
ADD COLUMN IF NOT EXISTS wheel_participant_weights jsonb, -- Map of participant FID to weight: {"318447": 2, "123456": 1}
ADD COLUMN IF NOT EXISTS wheel_removed_participants bigint[], -- Array of FIDs removed before spin
ADD COLUMN IF NOT EXISTS wheel_winner_fid bigint, -- Winner FID (set after spin)
ADD COLUMN IF NOT EXISTS wheel_spun_at timestamptz; -- Timestamp when wheel was spun

-- Create game_prizes table (CRITICAL: Already added to VALID_POKER_TABLES)
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

### 1.2 TypeScript Types

**File:** `src/lib/types.ts`

**Add new types:**

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

// Update Game interface
export interface Game {
  // ... existing fields ...
  game_type?: GameType | null; // 'poker' | 'giveaway_wheel'
  prize_type?: PrizeType | null; // 'tokens' | 'nfts' | 'mixed'
  wheel_background_color?: string | null;
  wheel_segment_type?: 'equal' | 'weighted' | null;
  wheel_image_urls?: string[] | null;
  wheel_participant_weights?: Record<number, number> | null;
  wheel_removed_participants?: number[] | null;
  wheel_winner_fid?: number | null;
  wheel_spun_at?: string | null;
  // ... rest of existing fields ...
}
```

---

## Phase 2: Smart Contract

### 2.1 PrizeDistribution Contract

**File:** `contracts/PrizeDistribution.sol`

**Create new contract (Option B from plan - recommended):**

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

**Deployment:**
1. Deploy to Base Mainnet via Remix
2. Set environment variable: `PRIZE_DISTRIBUTION_CONTRACT=0x...`
3. Add ABI to `src/lib/contracts.ts`

---

## Phase 3: Game Creation Updates

### 3.1 Game Creation API Route

**File:** `src/app/api/games/route.ts` (POST handler)

**Critical Fixes:**
1. ✅ Skip on-chain game creation for wheel games without entry fees
2. ✅ Validate prize configuration
3. ✅ Handle image uploads (store URLs in database)

**Key Changes:**

```typescript
// After validating game type
const gameType = body.game_type || 'poker';

// CRITICAL FIX: Skip on-chain game creation for wheel games without entry fees
const isPaidGame = entry_fee_amount && parseFloat(String(entry_fee_amount)) > 0;
const needsOnChainCreation = isPaidGame && gameType !== 'giveaway_wheel';

// Validate prize configuration if provided
if (body.prize_type) {
  const prizeType = body.prize_type;
  if (!['tokens', 'nfts', 'mixed'].includes(prizeType)) {
    throw new Error('Invalid prize_type. Must be "tokens", "nfts", or "mixed"');
  }
  
  // Validate prize_configuration array
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
  }
}

// Store game data
const gameData: any = {
  // ... existing fields ...
  game_type: gameType,
  prize_type: body.prize_type || 'tokens',
  wheel_background_color: body.wheel_background_color || '#FF3B1A',
  wheel_segment_type: body.wheel_segment_type || 'equal',
  wheel_image_urls: body.wheel_image_urls || [], // URLs from image upload
  wheel_participant_weights: body.wheel_participant_weights || null,
};

// Insert game
const [game] = await pokerDb.insert('games', gameData);

// Store prize configuration in game_prizes table
if (body.prize_configuration && Array.isArray(body.prize_configuration)) {
  for (const prize of body.prize_configuration) {
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

// CRITICAL FIX: Only create on-chain if needed
if (needsOnChainCreation) {
  // Existing on-chain game creation logic
  await createGameOnContract(...);
}
```

---

## Phase 4: Wheel Spin API

### 4.1 Wheel Spin Route

**File:** `src/app/api/games/[id]/spin-wheel/route.ts` (NEW)

**Critical Fix:** Use `crypto.randomInt()` instead of `Math.random()`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'crypto'; // CRITICAL FIX: Use crypto.randomInt()
import { requireAuth } from '~/lib/auth';
import { pokerDb } from '~/lib/pokerDb';
import { getClubForGame, requireClubOwner } from '~/lib/pokerPermissions';
import { isGlobalAdmin } from '~/lib/permissions';
import type { ApiResponse, Game } from '~/lib/types';

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
  
  // CRITICAL FIX: Use crypto.randomInt() for secure random selection
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
    
    const randomIndex = randomInt(0, weightedList.length); // CRITICAL FIX
    winnerFid = weightedList[randomIndex];
  } else {
    // Equal probability
    const randomIndex = randomInt(0, eligibleParticipants.length); // CRITICAL FIX
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

## Phase 5: Settlement Updates (CRITICAL FIXES)

### 5.1 Settlement API Route

**File:** `src/app/api/games/[id]/settle-contract/route.ts`

**Critical Fixes:**
1. ✅ Handle wheel games differently (use `wheel_winner_fid`, not `winnerFids` from request)
2. ✅ Use Neynar API for wallet addresses when no payment transactions exist
3. ✅ Skip `payout_bps` validation for wheel games
4. ✅ Use `PrizeDistribution` contract for all prize distributions

**Key Changes:**

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
  
  // Fetch prize configuration for position 1 only
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
      const { amountToUnits } = await import('~/lib/amounts');
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
// (existing winnerFids pathway)
```

---

## Phase 6: Helper Functions

### 6.1 NFT Operations

**File:** `src/lib/nft-ops.ts` (NEW)

```typescript
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

---

## Implementation Order

1. ✅ **Fix Gap #1:** Add `game_prizes` to `VALID_POKER_TABLES` (DONE)
2. **Phase 1:** Database migration + Types
3. **Phase 2:** Smart contract (deploy separately)
4. **Phase 3:** Game creation API updates
5. **Phase 4:** Wheel spin API
6. **Phase 5:** Settlement API updates (CRITICAL)
7. **Phase 6:** Helper functions
8. **Phase 7:** UI components (wheel, game creation form)
9. **Phase 8:** Testing

---

## Verification Checklist

- [x] `game_prizes` added to `VALID_POKER_TABLES`
- [ ] Database migration created and tested
- [ ] Types updated
- [ ] Contract deployed and address configured
- [ ] Game creation handles new fields
- [ ] Wheel spin uses `crypto.randomInt()`
- [ ] Settlement handles wheel games differently
- [ ] Settlement uses Neynar API for wallet addresses when needed
- [ ] Settlement uses `PrizeDistribution` contract
- [ ] NFT ownership verification works
- [ ] All edge cases handled

---

**This revised plan addresses all 10 gaps and is ready for implementation.**
