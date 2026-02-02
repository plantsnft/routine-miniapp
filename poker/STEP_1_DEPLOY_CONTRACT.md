# Step 1: Deploy PrizeDistribution Contract

## 📋 Quick Copy-Paste Instructions

### Prerequisites Check
1. You have a wallet with ETH on Base network
2. You have the private key for that wallet
3. Your `.env.local` file is in `c:\miniapps\routine\`

---

## 🚀 Deployment Steps (Copy-Paste)

### Step 1: Open PowerShell
**IMPORTANT:** The deployment script is in the **root directory**, so we need to run it from there.

Open PowerShell and navigate to the root directory:

```powershell
cd c:\miniapps\routine
```

**Why root directory?**
- The `deploy-prize-distribution.js` script is in the root
- The `hardhat.config.cjs` is in the root
- The `contracts\` folder (where we copy the contract) is in the root
- But the script will read from `poker\.env.local` automatically!

### Step 2: Check Your .env.local File
**IMPORTANT:** Even though we run the script from the root directory, it will automatically check the **poker app's** `.env.local` first!

Make sure this file exists and has your private key:

**For Giveaway Games (Poker) App:**
`c:\miniapps\routine\poker\.env.local`

The file should contain:
```bash
PRIVATE_KEY=0xYourPrivateKeyHere
BASE_RPC_URL=https://mainnet.base.org
```

**⚠️ Replace `0xYourPrivateKeyHere` with your actual private key!**

**💡 The script automatically checks `poker\.env.local` first, then falls back to root `.env.local` if needed.**

### Step 3: Copy Contract to Contracts Folder
```powershell
copy poker\contracts\PrizeDistribution.sol contracts\PrizeDistribution.sol
```

### Step 4: Install OpenZeppelin Contracts (if needed)
```powershell
npm install @openzeppelin/contracts
```

### Step 5: Deploy the Contract
```powershell
node deploy-prize-distribution.js
```

---

## ✅ What Success Looks Like

You should see output like this:

```
============================================================
Deploying PrizeDistribution Contract to Base
============================================================

Deployer Address: 0xYourWalletAddress
Balance: 0.05 ETH
Network: Base Mainnet (Chain ID: 8453)

✓ Using existing compiled contract

📝 Deploying contract...
⏳ Waiting for transaction confirmation...

============================================================
✅ DEPLOYMENT SUCCESSFUL!
============================================================

Contract Address: 0x1234567890abcdef1234567890abcdef12345678
Transaction Hash: 0xabcdef1234567890abcdef1234567890abcdef12
Block Number: 12345678
Gas Used: 234567

📋 Next Steps:
1. Copy the contract address above
2. Add to Vercel environment variables:
   PRIZE_DISTRIBUTION_CONTRACT=0x1234567890abcdef1234567890abcdef12345678
3. Verify contract on BaseScan:
   https://basescan.org/address/0x1234567890abcdef1234567890abcdef12345678
```

---

## 📝 Save This Information

**Copy and save the Contract Address** - you'll need it for Step 3!

Example:
```
Contract Address: 0x1234567890abcdef1234567890abcdef12345678
```

---

## 🐛 Common Issues

### "PRIVATE_KEY missing"
**Fix:** Make sure `.env.local` exists in **ONE** of these locations:
- `c:\miniapps\routine\poker\.env.local` (for giveaway games app - recommended)
- `c:\miniapps\routine\.env.local` (for catwalk app)

And it has:
```bash
PRIVATE_KEY=0xYourActualPrivateKey
BASE_RPC_URL=https://mainnet.base.org
```

### "Insufficient funds"
**Fix:** Your wallet needs ETH on Base network. Get some at: https://bridge.base.org

### "Cannot find module"
**Fix:** Run `npm install` in the root directory first.

### "Contract not found"
**Fix:** Make sure you copied the contract:
```powershell
copy poker\contracts\PrizeDistribution.sol contracts\PrizeDistribution.sol
```

### "stripAnsi is not a function" or Hardhat prompt error
**Fix:** This is a known issue with Hardhat prompts. The script has been updated to skip the prompt. If you still see this error, try compiling manually first:
```powershell
npx hardhat compile
```
Then run the deployment script again.

---

## ✅ Verification

After deployment, verify on BaseScan:
1. Go to: https://basescan.org/address/YOUR_CONTRACT_ADDRESS
2. You should see the contract with recent transactions
3. (Optional) Click "Contract" → "Verify and Publish" to make code public

---

## 🎯 Next Step

Once you have the contract address:
- ✅ **Step 1:** Deploy Contract ← **YOU ARE HERE**
- ⏭️ **Step 2:** Run Database Migration (Next)
- ⏭️ **Step 3:** Set Environment Variable (After Step 2)

---

**Ready?** Copy-paste the commands above! 🚀
