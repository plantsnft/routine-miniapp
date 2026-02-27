muj# Remix IDE - Step-by-Step Deployment Guide

## Current Status
- ✅ You're logged into Remix with GitHub
- ✅ You have a `poker` folder created
- ⏭️ Next: Set up OpenZeppelin contracts and deploy

---

## Step 1: Set Up OpenZeppelin Contracts Folder Structure

### In Remix File Explorer (left sidebar):

1. **Right-click** on your `poker` folder
2. Select **"New Folder"**
3. Name it: `@openzeppelin`
4. Click inside the `@openzeppelin` folder
5. Create another folder inside it named: `contracts`

**Your structure should now be:**
```
poker/
  └── @openzeppelin/
      └── contracts/
```

---

## Step 2: Create OpenZeppelin Contract Files

### File 1: IERC20 Interface

1. Right-click on the `contracts` folder you just created
2. Select **"New File"**
3. Name it: `IERC20.sol`
4. Copy and paste this entire code:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}
```

5. Click the **save icon** (disk) or press `Ctrl+S` / `Cmd+S`

---

### File 2: SafeERC20 Library

1. Right-click on the `contracts` folder
2. Select **"New File"**
3. Name it: `SafeERC20.sol`
4. Copy and paste this entire code:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./IERC20.sol";

library SafeERC20 {
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        require(token.transfer(to, value), "SafeERC20: transfer failed");
    }
    
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        require(token.transferFrom(from, to, value), "SafeERC20: transferFrom failed");
    }
}
```

5. Save the file (`Ctrl+S` / `Cmd+S`)

---

### File 3: Ownable Contract

1. Right-click on the `contracts` folder
2. Select **"New File"**
3. Name it: `Ownable.sol`
4. Copy and paste this entire code:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Ownable {
    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address initialOwner) {
        _owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    modifier onlyOwner() {
        require(_owner == msg.sender, "Ownable: caller is not the owner");
        _;
    }

    function owner() public view returns (address) {
        return _owner;
    }

    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        emit OwnershipTransferred(_owner, newOwner);
        _owner = newOwner;
    }
}
```

5. Save the file

---

### File 4: ReentrancyGuard Contract

1. Right-click on the `contracts` folder
2. Select **"New File"**
3. Name it: `ReentrancyGuard.sol`
4. Copy and paste this entire code:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

    constructor() {
        _status = _NOT_ENTERED;
    }

    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}
```

5. Save the file

---

## Step 3: Add Your GameEscrow Contract

1. In Remix, click on your `poker` folder (not the @openzeppelin folder)
2. Right-click on `poker` folder
3. Select **"New File"**
4. Name it: `GameEscrow.sol`
5. Open the contract file from your local computer:
   - Path: `C:\miniapps\routine\poker\contracts\GameEscrow.sol`
   - Copy the ENTIRE contents (Ctrl+A, Ctrl+C)
6. Paste into Remix (Ctrl+V)
7. **IMPORTANT**: Update the import statements at the top to use relative paths:

   **Change this:**
   ```solidity
   import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
   import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
   import "@openzeppelin/contracts/access/Ownable.sol";
   import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
   ```

   **To this (use relative paths):**
   ```solidity
   import "../@openzeppelin/contracts/IERC20.sol";
   import "../@openzeppelin/contracts/SafeERC20.sol";
   import "../@openzeppelin/contracts/Ownable.sol";
   import "../@openzeppelin/contracts/ReentrancyGuard.sol";
   ```
   
   **OR if relative paths don't work, try absolute from root:**
   ```solidity
   import "./@openzeppelin/contracts/IERC20.sol";
   import "./@openzeppelin/contracts/SafeERC20.sol";
   import "./@openzeppelin/contracts/Ownable.sol";
   import "./@openzeppelin/contracts/ReentrancyGuard.sol";
   ```

8. Save the file

**Your final structure should look like:**
```
poker/
  ├── @openzeppelin/
  │   └── contracts/
  │       ├── IERC20.sol
  │       ├── SafeERC20.sol
  │       ├── Ownable.sol
  │       └── ReentrancyGuard.sol
  └── GameEscrow.sol
```

---

## Step 4: Compile the Contract

1. Click the **"Solidity Compiler"** icon in the left sidebar (looks like a green checkmark or gear)
2. In the compiler dropdown, select: **`0.8.31`** (or latest 0.8.x available - 0.8.20 or higher works)
   - ✅ **0.8.31 is recommended** - newer version with bug fixes
   - ✅ Any 0.8.x version from 0.8.20 to 0.8.31 will work
3. Check the box for **"Auto compile"** (optional, but helpful)
4. Click **"Compile GameEscrow.sol"** button
5. Wait for compilation...
6. Check the bottom panel:
   - ✅ **Green checkmark** = Success!
   - ❌ **Red X with errors** = See error messages below

**If you get errors:**
- Make sure all OpenZeppelin files are saved
- Check that import paths match exactly
- Verify compiler version is 0.8.20 or higher (0.8.31 is perfect!)

---

## Step 5: Connect MetaMask to Base Network

### If Base network is NOT in your MetaMask:

1. Open MetaMask extension
2. Click the network dropdown (top of MetaMask, usually says "Ethereum Mainnet")
3. Click **"Add Network"** or **"Add a network manually"**
4. Fill in these details:
   - **Network Name**: `Base`
   - **RPC URL**: `https://mainnet.base.org`
   - **Chain ID**: `8453`
   - **Currency Symbol**: `ETH`
   - **Block Explorer URL**: `https://basescan.org`
5. Click **"Save"**
6. Switch to **Base** network in MetaMask

### Make sure your wallet has Base ETH:
- If not, bridge ETH from Ethereum to Base: https://bridge.base.org
- You'll need ~0.01 ETH for gas (very cheap on Base!)

---

## Step 6: Deploy the Contract

1. In Remix, click the **"Deploy & Run Transactions"** icon (left sidebar, looks like a rocket 🚀)
2. Under **"Environment"**, select: **"Injected Provider - MetaMask"**
   - MetaMask will pop up asking to connect
   - Click **"Next"** then **"Connect"**
3. **VERIFY** you're on **Base Mainnet**:
   - Check MetaMask - should say "Base" at the top
   - If not, switch networks in MetaMask first
4. **VERIFY** your account:
   - The account shown should be your master wallet: `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`
   - If not, switch accounts in MetaMask
5. Under **"Contract"**, select: **"GameEscrow"**
6. Under **"Deploy"** section, leave everything as default (no constructor parameters needed)
7. Click the **"Deploy"** button
8. MetaMask will pop up:
   - Review the gas fee (should be very low, ~$0.01-0.10)
   - Click **"Confirm"**
9. **Wait for confirmation** (usually 1-2 minutes on Base)
   - You'll see "pending" in Remix
   - Once confirmed, the contract will appear under "Deployed Contracts"

---

## Step 7: Get Your Contract Address

1. After deployment, look under **"Deployed Contracts"** section
2. You'll see something like:
   ```
   GameEscrow at 0x1234...5678
   ```
3. Click the **copy icon** (📋) next to the address
4. **SAVE THIS ADDRESS** - you'll need it for environment variables!

---

## Step 8: Verify Contract (Optional but Recommended)

1. Go to https://basescan.org
2. Paste your contract address in the search bar
3. Click on your contract
4. Click the **"Contract"** tab
5. Click **"Verify and Publish"**
6. Select:
   - **Compiler Type**: Solidity (Single file)
   - **Compiler Version**: `0.8.31` (or whatever version you used to compile)
   - **License**: MIT
7. Paste your entire `GameEscrow.sol` code (including imports)
8. Click **"Verify and Publish"**
9. Wait a minute, then refresh - you should see verified code!

---

## Step 9: Update Environment Variables

### For Local Development:

1. Open `C:\miniapps\routine\poker\.env.local`
2. Add or update:
```env
NEXT_PUBLIC_GAME_ESCROW_CONTRACT=0xYourContractAddressHere
NEXT_PUBLIC_BASE_RPC_URL=https://mainnet.base.org
```

### For Vercel:

1. Go to your Vercel project dashboard
2. Go to **Settings** → **Environment Variables**
3. Add:
   - `NEXT_PUBLIC_GAME_ESCROW_CONTRACT` = `0xYourContractAddressHere`
   - `NEXT_PUBLIC_BASE_RPC_URL` = `https://mainnet.base.org`
4. Redeploy your app

---

## 🎉 Done!

Your contract is now deployed and ready to use!

---

## Troubleshooting

**"Cannot find module @openzeppelin/contracts/..."**
- Check that your folder structure matches exactly
- Make sure imports use: `@openzeppelin/contracts/FileName.sol`

**"Compilation failed"**
- Check compiler version (must be 0.8.20 or higher - 0.8.31 is perfect!)
- Verify all OpenZeppelin files are saved
- Check for syntax errors (missing semicolons, etc.)

**"Insufficient funds"**
- Make sure your wallet has Base ETH
- Bridge from Ethereum: https://bridge.base.org

**"Network not found"**
- Make sure you added Base network correctly
- Chain ID must be exactly `8453`

**Transaction pending forever**
- Check MetaMask - might need to confirm
- Check Base network status: https://status.base.org

---

## Quick Reference

- **Remix IDE**: https://remix.ethereum.org
- **Base Bridge**: https://bridge.base.org
- **BaseScan**: https://basescan.org
- **Master Wallet**: `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`

Good luck! 🚀

