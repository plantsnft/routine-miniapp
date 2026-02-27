# Burrfriends Game Setup - Source of Truth

**Last Updated:** 2026-02-26  
**Status:** Source of truth for Burrfriends app and Betr Games NFT

---

## Overview

This document is the source of truth for the Burrfriends mini app (Betr Games). Future AI agents should refer to this document to understand the app's setup, the Betr Games Season 1 Winner NFT, the app gate, and how it was minted.

---

## Betr Games Season 1 Winner NFT

### Purpose

A commemorative ERC721 NFT minted to celebrate the winner of Betr Games Season 1. The NFT image is the BETR GAMES neon winner graphic featuring "Tracy".

### NFT Details

| Field | Value |
|-------|-------|
| **Contract Address** | `0x6568F5F7Dc0fe06AE353496d4e43BB41Ea21Bd60` |
| **Contract Name** | Betr Games Season 1 Winner |
| **Symbol** | BETR1 |
| **Token ID** | 0 (first and only token) |
| **Owner** | `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012` |
| **Chain** | Base (Chain ID 8453) |

### Mint Transaction

| Field | Value |
|-------|-------|
| **Transaction Hash** | `0xc7a64701b2e7c08c42f9287bb1513caa884a69b9e6f044c71cc14fb8e0d0b9ed` |
| **Block** | 42680082 |

### Asset Locations

| Asset | Location | CID / URL |
|-------|----------|-----------|
| **Image** | `burrfriends/public/betrgameswinner.png` | IPFS: `bafybeiajrnbotbdd4z34zbrqpmqo5fkzps2j3plauxuwc3xs4gyoemdety` |
| **Metadata JSON** | `burrfriends/public/betrgameswinner-metadata.json` | IPFS: `bafkreifomrfzbfejmea4eian7jjpjgbwqkinxnrt2nosudh2eet3cg55oe` |
| **Metadata URI** (used in mint) | — | `ipfs://bafkreifomrfzbfejmea4eian7jjpjgbwqkinxnrt2nosudh2eet3cg55oe` |

### Metadata Schema

```json
{
  "name": "Betr Games Season 1 Winner",
  "description": "Betr Games Season 1 winner NFT by Doodle Day Darlings. Celebrating Tracy and 90 players.",
  "image": "https://gateway.pinata.cloud/ipfs/bafybeiajrnbotbdd4z34zbrqpmqo5fkzps2j3plauxuwc3xs4gyoemdety",
  "attributes": [
    { "trait_type": "Artist", "value": "Doodle Day Darlings" },
    { "trait_type": "Betr Games Season", "value": "1" },
    { "trait_type": "Number of Players", "value": "90" },
    { "trait_type": "Winning FID", "value": "417851" }
  ]
}
```

### Links

- **Contract on BaseScan:** https://basescan.org/address/0x6568F5F7Dc0fe06AE353496d4e43BB41Ea21Bd60
- **Owner wallet on BaseScan:** https://basescan.org/address/0xd942a322Fa7d360F22C525a652F51cA0FC4aF012
- **Mint transaction:** https://basescan.org/tx/0xc7a64701b2e7c08c42f9287bb1513caa884a69b9e6f044c71cc14fb8e0d0b9ed

---

## How the NFT Was Minted (For AI Agents)

This section documents the exact process used so future agents can reproduce or understand the workflow.

### Prerequisites

1. **Wallet:** `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012` (same wallet used for mini app game payouts)
2. **Chain:** Base mainnet (Chain ID 8453)
3. **Tools:** Remix IDE (remix.ethereum.org), Pinata (pinata.cloud)

### Step 1: Host Assets on IPFS (Pinata)

1. Upload `burrfriends/public/betrgameswinner.png` to Pinata → get image CID
2. Create metadata JSON (see schema above) with `image` pointing to the image gateway URL
3. Upload metadata JSON to Pinata → get metadata CID
4. Metadata URI for minting: `ipfs://{metadata_cid}`

### Step 2: Deploy ERC721 Contract (Remix)

1. Go to https://remix.ethereum.org
2. Create contract `BetrGamesWinner.sol` with the code below
3. Use OpenZeppelin imports (ERC721URIStorage, Ownable)
4. Compile with Solidity 0.8.20
5. Connect MetaMask (Base network, wallet above)
6. Deploy → copy contract address

**Contract Code Used:**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BetrGamesWinner is ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;

    constructor() ERC721("Betr Games Season 1 Winner", "BETR1") Ownable(msg.sender) {}

    function mint(address to, string memory uri) public onlyOwner returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        return tokenId;
    }
}
```

**Note:** Extend only `ERC721URIStorage` (not both ERC721 and ERC721URIStorage) to avoid override errors with some OpenZeppelin versions.

### Step 3: Mint Token

1. In Remix Deploy & Run, expand the deployed contract
2. Call `mint` with:
   - `to`: `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`
   - `uri`: `ipfs://bafkreifomrfzbfejmea4eian7jjpjgbwqkinxnrt2nosudh2eet3cg55oe`
3. Sign transaction in MetaMask

### Wallet Consistency

The mint wallet (`0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`) is the same master wallet used for poker/mini app game payouts. See `poker/NFT_AND_WHEEL_FEATURE_PLAN.md` and `poker/CONTRACT_DEPLOYMENT_REMIX.md` for context.

---

## App Gate (BETR WITH BURR Access Control)

The entire app is gated. Users can access only if they meet at least one of:

1. **Neynar score ≥ 0.60**
2. **Staking 50M+ $BETR** (on-chain – same source as lobby chat, BETR Games, Super Bowl staking)

Users who qualify for neither see a full-screen overlay with no dismiss option:

> "A neynar score of 0.60 is required BETR WITH BURR app unless you are staking 50m $BETR"

### Implementation

| Component | Path | Purpose |
|-----------|------|---------|
| Gate API | `burrfriends/src/app/api/auth/gate/route.ts` | POST with `{ token }`; verifies JWT, checks Neynar score and on-chain stake; returns `{ allowed: true/false, message? }` |
| AppGate | `burrfriends/src/components/AppGate.tsx` | Client component that calls gate API and shows overlay when denied |
| Constants | `burrfriends/src/lib/constants.ts` | `BETR_APP_GATE_MIN_STAKE = 50_000_000`, `NEYNAR_SCORE_GATE_MIN = 0.6` |

### Stake Check Source

The stake check uses `checkUserStakeByFid` from `burrfriends/src/lib/staking.ts` (on-chain BETR staking contract). No pool ID or game lookup. Same source as lobby chat (1M), BETR Games, and Super Bowl staking tiers.

### Fail-Open Behavior

If Neynar or staking checks fail (API error, timeout, etc.), access is **allowed** to avoid blocking users when external services are down.

### Integration with Game Gating

The app gate uses the same `checkUserStakeByFid` from `burrfriends/src/lib/staking.ts` as lobby chat, BETR Games registration, and Super Bowl staking. The 50M amount is shared via `BETR_APP_GATE_MIN_STAKE`.

---

## Deployment Rules

- Burrfriends is a separate app (excluded from root build per `tsconfig.json`)
- Changes to `burrfriends/` do not trigger root/Catwalk deployment
- For Vercel: Burrfriends has its own deployment configuration if applicable

---

## Future Reference

When adding new Betr Games NFTs (e.g., Season 2):
1. Use the same workflow: Pinata for image + metadata, Remix for deploy + mint
2. Deploy from the same master wallet if prizes flow through it
3. Update this document with the new contract address and mint transaction
4. Keep metadata schema consistent (artist, season, number of players, winning FID)
