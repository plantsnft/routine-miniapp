# Installing ethers.js - Windows Instructions

## PowerShell Execution Policy Issue

If you're getting an error about scripts being disabled, use one of these solutions:

---

## ✅ Solution 1: Use Command Prompt (CMD) Instead (Easiest)

1. Open **Command Prompt** (not PowerShell):
   - Press `Win + R`
   - Type `cmd` and press Enter
   - Or search for "Command Prompt" in Start menu

2. Navigate to the poker directory:
   ```cmd
   cd C:\miniapps\routine\poker
   ```

3. Run the install command:
   ```cmd
   npm install ethers@^6.0.0
   ```

---

## ✅ Solution 2: Change PowerShell Execution Policy (One-Time Setup)

Run PowerShell **as Administrator**, then:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Then try the install command again:
```powershell
cd C:\miniapps\routine\poker
npm install ethers@^6.0.0
```

---

## ✅ Solution 3: Use npm.cmd Directly

In PowerShell, use the full path:
```powershell
cd C:\miniapps\routine\poker
& "C:\Program Files\nodejs\npm.cmd" install ethers@^6.0.0
```

---

## ✅ Solution 4: Use npx Instead

```powershell
cd C:\miniapps\routine\poker
npx npm install ethers@^6.0.0
```

---

## Verify Installation

After installation, verify it worked:

```cmd
cd C:\miniapps\routine\poker
npm list ethers
```

You should see `ethers@6.x.x` listed.

---

## What This Does

Installs `ethers.js` version 6.x.x which is needed for:
- Encoding smart contract function calls
- Transaction data preparation
- ABI encoding for `joinGame()` and `approve()` functions

The package is already added to `package.json`, this just installs it.

