# Deployment Workaround - PowerShell Execution Policy

## Problem
PowerShell execution policy is blocking `npx`. 

## Solution: Use node_modules directly

Since `npx` is blocked, we'll use the locally installed hardhat directly.

### Step 1: Compile using local hardhat
```powershell
$env:HARDHAT_DISABLE_TELEMETRY="1"; node node_modules\.bin\hardhat compile
```

### Step 2: Deploy
```powershell
node deploy-prize-distribution.js
```

---

## Alternative: Use Remix IDE (Browser-based)

If PowerShell continues to have issues, use Remix IDE instead:

1. Go to: https://remix.ethereum.org
2. Create new file: `PrizeDistribution.sol`
3. Copy contract from: `poker\contracts\PrizeDistribution.sol`
4. Install OpenZeppelin contracts in Remix
5. Compile
6. Deploy to Base network
7. Copy the contract address

---

## Quick Fix: One Command

Try this single command:

```powershell
$env:HARDHAT_DISABLE_TELEMETRY="1"; node node_modules\.bin\hardhat compile; node deploy-prize-distribution.js
```
