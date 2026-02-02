# Fix: Hardhat Telemetry Prompt Issue

## Problem
Hardhat is trying to prompt for telemetry, causing the deployment to fail.

## Solution: Compile Manually First

Run these commands **one at a time**:

### Step 1: Compile the contract manually
```powershell
$env:HARDHAT_DISABLE_TELEMETRY="1"; npx hardhat compile
```

### Step 2: Then deploy
```powershell
node deploy-prize-distribution.js
```

---

## Alternative: One-Line Fix

If the above doesn't work, try this single command:

```powershell
$env:HARDHAT_DISABLE_TELEMETRY="1"; $env:CI="true"; npx hardhat compile; node deploy-prize-distribution.js
```

---

## Why This Happens

Hardhat tries to ask about telemetry on first run, but the enquirer library has issues in PowerShell. Setting the environment variable disables the prompt.
