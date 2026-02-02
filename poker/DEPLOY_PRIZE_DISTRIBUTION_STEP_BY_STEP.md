# Step-by-Step: Deploy PrizeDistribution Contract

## Overview
This guide will help you deploy the `PrizeDistribution.sol` contract to Base network. You have **two options**:

1. **Option A: Using Hardhat Script** (Recommended - Automated)
2. **Option B: Using Remix IDE** (Browser-based - No setup needed)

---

## Prerequisites

### Required Environment Variables
**IMPORTANT:** The deployment script checks **both** locations, but prefers the poker app's `.env.local`.

You need these in **ONE** of these `.env.local` files:

**Option A (Recommended - For Giveaway Games App):**
`c:\miniapps\routine\poker\.env.local`

**Option B (Alternative - For Catwalk App):**
`c:\miniapps\routine\.env.local`

The file should contain:
```bash
PRIVATE_KEY=your_private_key_here
BASE_RPC_URL=https://mainnet.base.org
```

**⚠️ SECURITY WARNING:** 
- `PRIVATE_KEY` should be the private key of a wallet that:
  - Has ETH on Base network (for gas fees)
  - You trust to deploy contracts
  - Is NOT your master wallet (unless you want the contract owner to be the master wallet)

**💡 For Giveaway Games app deployment, use the poker folder's `.env.local` file.**

### Required Funds
- **Gas fees:** ~0.001-0.01 ETH on Base (very cheap)
- **Check your balance:** https://basescan.org/address/YOUR_WALLET_ADDRESS

---

## Option A: Deploy Using Hardhat Script (Recommended)

### Step 1: Navigate to Root Directory
```powershell
cd c:\miniapps\routine
```

### Step 2: Verify Environment Variables
**IMPORTANT:** Check **ONE** of these `.env.local` files:

**For Giveaway Games App (Recommended):**
`c:\miniapps\routine\poker\.env.local`

**OR for Catwalk App:**
`c:\miniapps\routine\.env.local`

The file should have:
```bash
PRIVATE_KEY=0x...
BASE_RPC_URL=https://mainnet.base.org
```

**💡 The script will check both locations, but prefers the poker folder's file.**

### Step 3: Install Dependencies (if not already installed)
```powershell
npm install
```

### Step 4: Copy Contract to Contracts Directory
The contract is already in `poker/contracts/PrizeDistribution.sol`, but Hardhat expects it in `contracts/` at the root. Copy it:

```powershell
copy poker\contracts\PrizeDistribution.sol contracts\PrizeDistribution.sol
```

### Step 5: Install OpenZeppelin Contracts (if needed)
```powershell
npm install @openzeppelin/contracts
```

### Step 6: Run Deployment Script
```powershell
node deploy-prize-distribution.js
```

### Step 7: Copy the Contract Address
After successful deployment, you'll see:
```
✅ DEPLOYMENT SUCCESSFUL!
Contract Address: 0x...
```

**Copy this address** - you'll need it for the next step (setting environment variable).

---

## Option B: Deploy Using Remix IDE (Browser-based)

### Step 1: Open Remix
Go to: https://remix.ethereum.org

### Step 2: Create New File
1. Click "File Explorer" in the left sidebar
2. Click the "+" button to create a new file
3. Name it: `PrizeDistribution.sol`

### Step 3: Copy Contract Code
1. Open `poker/contracts/PrizeDistribution.sol` in your editor
2. Copy the entire file contents
3. Paste into Remix editor

### Step 4: Install OpenZeppelin in Remix
1. In Remix, go to "File Explorer"
2. Click "Create new file"
3. Name it: `@openzeppelin/contracts/token/ERC20/IERC20.sol`
4. Go to: https://github.com/OpenZeppelin/openzeppelin-contracts
5. Navigate to: `contracts/token/ERC20/IERC20.sol`
6. Copy the file content and paste into Remix
7. Repeat for:
   - `@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol`
   - `@openzeppelin/contracts/token/ERC721/IERC721.sol`
   - `@openzeppelin/contracts/access/Ownable.sol`
   - `@openzeppelin/contracts/security/ReentrancyGuard.sol`

**OR** use Remix's import feature:
```solidity
// At the top of PrizeDistribution.sol, Remix will auto-import:
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// etc.
```

### Step 5: Compile Contract
1. Click "Solidity Compiler" in left sidebar
2. Set compiler version to `0.8.20`
3. Click "Compile PrizeDistribution.sol"
4. Check for errors (should be none)

### Step 6: Connect Wallet
1. Click "Deploy & Run Transactions" in left sidebar
2. Under "Environment", select "Injected Provider - MetaMask"
3. Connect your MetaMask wallet
4. **Switch MetaMask to Base network** (Chain ID: 8453)

### Step 7: Deploy Contract
1. Under "Contract", select "PrizeDistribution"
2. Click "Deploy" button
3. Confirm transaction in MetaMask
4. Wait for confirmation

### Step 8: Copy Contract Address
1. After deployment, you'll see the contract in "Deployed Contracts"
2. Click the copy icon next to the contract address
3. **Save this address** - you'll need it for the next step

---

## After Deployment (Both Options)

### Step 1: Verify Contract on BaseScan
1. Go to: https://basescan.org/address/YOUR_CONTRACT_ADDRESS
2. Click "Contract" tab
3. Click "Verify and Publish"
4. Follow the verification wizard

### Step 2: Set Environment Variable
Add to Vercel environment variables:

**Variable Name:** `PRIZE_DISTRIBUTION_CONTRACT`  
**Value:** `0x...` (your deployed contract address)

**How to add:**
1. Go to Vercel dashboard
2. Select your project
3. Go to Settings → Environment Variables
4. Add new variable:
   - Key: `PRIZE_DISTRIBUTION_CONTRACT`
   - Value: `0x...` (your contract address)
   - Environment: Production, Preview, Development (all)
5. Save and redeploy

### Step 3: Transfer Ownership (Optional but Recommended)
The contract owner should be the master wallet for security:

1. Go to BaseScan: https://basescan.org/address/YOUR_CONTRACT_ADDRESS
2. Click "Contract" → "Write Contract"
3. Connect wallet (the deployer wallet)
4. Find `transferOwnership` function
5. Enter master wallet address: `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`
6. Click "Write" and confirm

### Step 4: Approve Contract for Token Transfers
The master wallet must approve the contract to transfer tokens:

**For USDC:**
1. Go to USDC contract on BaseScan: https://basescan.org/address/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
2. Click "Contract" → "Write Contract"
3. Connect master wallet
4. Find `approve` function
5. Enter:
   - `spender`: Your PrizeDistribution contract address
   - `amount`: Maximum (e.g., `115792089237316195423570985008687907853269984665640564039457584007913129639935`)
6. Click "Write" and confirm

**For NFTs:**
- Each NFT contract needs separate approval
- Use `setApprovalForAll` function on each NFT contract
- Approve the PrizeDistribution contract address

---

## Troubleshooting

### Error: "PRIVATE_KEY missing"
- Make sure `.env.local` exists in **ONE** of these locations:
  - `c:\miniapps\routine\poker\.env.local` (for giveaway games app - recommended)
  - `c:\miniapps\routine\.env.local` (for catwalk app)
- Check that `PRIVATE_KEY=0x...` is set (no quotes)
- The script checks both locations, so either will work

### Error: "Insufficient funds"
- Add ETH to your deployer wallet on Base network
- Get Base ETH from: https://bridge.base.org

### Error: "Contract compilation failed"
- Make sure OpenZeppelin contracts are installed
- Check Solidity version matches (0.8.20)

### Error: "Transaction failed"
- Check you're on Base network (not Ethereum mainnet)
- Verify you have enough ETH for gas
- Check transaction on BaseScan for error details

---

## Verification Checklist

After deployment, verify:
- [ ] Contract deployed successfully
- [ ] Contract address copied
- [ ] Contract verified on BaseScan
- [ ] Environment variable set in Vercel
- [ ] Ownership transferred to master wallet (optional)
- [ ] USDC approval set (if using token prizes)
- [ ] NFT approvals set (if using NFT prizes)

---

## Next Steps

Once deployment is complete:
1. ✅ **Done:** Contract deployed
2. ⏭️ **Next:** Run database migration (Step 2)
3. ⏭️ **Next:** Set environment variable (Step 3)

---

## Quick Copy-Paste Commands

### For Hardhat Deployment:
```powershell
# Navigate to root
cd c:\miniapps\routine

# Copy contract (if not already there)
copy poker\contracts\PrizeDistribution.sol contracts\PrizeDistribution.sol

# Install dependencies (if needed)
npm install @openzeppelin/contracts

# Deploy
node deploy-prize-distribution.js
```

### After Deployment:
```powershell
# Copy the contract address from output
# Then add to Vercel environment variables:
# PRIZE_DISTRIBUTION_CONTRACT=0x...
```

---

**Ready to deploy?** Choose Option A (Hardhat) or Option B (Remix) above! 🚀
