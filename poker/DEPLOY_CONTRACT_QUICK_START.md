# Quick Start: Deploy PrizeDistribution Contract

## 🚀 Fastest Method (Copy-Paste Ready)

### Step 1: Prepare Environment
Open PowerShell and run:

```powershell
cd c:\miniapps\routine
```

### Step 2: Check Your .env.local
**IMPORTANT:** The script checks **both** locations, but prefers the poker app's `.env.local`.

Make sure **ONE** of these files has your private key:

**For Giveaway Games App (Recommended):**
`c:\miniapps\routine\poker\.env.local`

**OR for Catwalk App:**
`c:\miniapps\routine\.env.local`

The file should contain:
```bash
PRIVATE_KEY=0xYourPrivateKeyHere
BASE_RPC_URL=https://mainnet.base.org
```

**⚠️ Important:** 
- `PRIVATE_KEY` is the private key of a wallet with ETH on Base
- This wallet will be the contract owner (you can transfer ownership later)
- **Use the poker folder's `.env.local` if deploying for Giveaway Games app**

### Step 3: Copy Contract to Root
```powershell
copy poker\contracts\PrizeDistribution.sol contracts\PrizeDistribution.sol
```

### Step 4: Install OpenZeppelin (if needed)
```powershell
npm install @openzeppelin/contracts
```

### Step 5: Deploy!
```powershell
node deploy-prize-distribution.js
```

### Step 6: Copy the Contract Address
After deployment, you'll see:
```
✅ DEPLOYMENT SUCCESSFUL!
Contract Address: 0x...
```

**Copy this address** and save it!

---

## 📋 What You'll See

```
============================================================
Deploying PrizeDistribution Contract to Base
============================================================

Deployer Address: 0x...
Balance: 0.05 ETH
Network: Base Mainnet (Chain ID: 8453)

✓ Using existing compiled contract

📝 Deploying contract...
⏳ Waiting for transaction confirmation...

============================================================
✅ DEPLOYMENT SUCCESSFUL!
============================================================

Contract Address: 0x1234567890abcdef...
Transaction Hash: 0xabcdef1234567890...
Block Number: 12345678
Gas Used: 234567

📋 Next Steps:
1. Copy the contract address above
2. Add to Vercel environment variables:
   PRIZE_DISTRIBUTION_CONTRACT=0x1234567890abcdef...
3. Verify contract on BaseScan:
   https://basescan.org/address/0x1234567890abcdef...

⚠️  IMPORTANT:
- Master wallet must approve this contract to transfer tokens
- Master wallet must approve this contract to transfer NFTs
- Contract owner should be set to master wallet for security
```

---

## ✅ After Deployment

### 1. Save the Contract Address
Copy the address from the output above.

### 2. Add to Vercel Environment Variables
- Go to Vercel → Your Project → Settings → Environment Variables
- Add: `PRIZE_DISTRIBUTION_CONTRACT` = `0x...` (your address)
- Apply to: Production, Preview, Development

### 3. Verify on BaseScan (Optional but Recommended)
- Go to: https://basescan.org/address/YOUR_CONTRACT_ADDRESS
- Click "Contract" → "Verify and Publish"
- This makes the contract code public and verifiable

---

## 🐛 Troubleshooting

**Error: "PRIVATE_KEY missing"**
- Check `.env.local` exists in `c:\miniapps\routine\`
- Make sure it has `PRIVATE_KEY=0x...` (no quotes)

**Error: "Insufficient funds"**
- Your wallet needs ETH on Base network
- Get Base ETH: https://bridge.base.org

**Error: "Cannot find module"**
- Run: `npm install` in the root directory

**Contract not compiling?**
- Make sure OpenZeppelin is installed: `npm install @openzeppelin/contracts`

---

## 🎯 That's It!

Once you have the contract address, you're ready for:
- ✅ **Step 1:** Deploy Contract (DONE!)
- ⏭️ **Step 2:** Run Database Migration (Next)
- ⏭️ **Step 3:** Set Environment Variable (Next)

---

**Need more details?** See `DEPLOY_PRIZE_DISTRIBUTION_STEP_BY_STEP.md` for the full guide with Remix option.
