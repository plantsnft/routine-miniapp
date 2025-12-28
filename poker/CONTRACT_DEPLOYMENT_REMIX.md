# Quick Deployment Guide - Using Remix IDE (Easiest Method)

## Step-by-Step Instructions

### Step 1: Prepare Your Wallet

⚠️ **CRITICAL SECURITY REQUIREMENT**: 
- **The contract MUST be deployed from the same address that is configured as MASTER_WALLET in the app.**
- **Deployer address MUST equal: `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`**
- **This wallet is a HOT WALLET with LIMITED FUNDS - treat it as such.**
- **Only keep minimal ETH for gas and escrowed game funds in this wallet.**
- **This is NOT cold storage - private key is stored in environment variables.**

1. Make sure your master wallet `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012` has:
   - Base ETH for gas fees (get from https://bridge.base.org)
   - At least 0.01 ETH should be enough for deployment

### Step 2: Open Remix IDE
1. Go to https://remix.ethereum.org in your browser
2. No installation needed - it runs in your browser

### Step 3: Set Up OpenZeppelin Contracts
1. In Remix, click the "File Explorer" icon (left sidebar)
2. Right-click in the file explorer area
3. Select "New Folder" and name it `@openzeppelin`
4. Inside that folder, create another folder called `contracts`
5. Inside `contracts`, create these files:

**File: `@openzeppelin/contracts/token/ERC20/IERC20.sol`**
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

**File: `@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol`**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "../IERC20.sol";

library SafeERC20 {
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        require(token.transfer(to, value), "SafeERC20: transfer failed");
    }
    
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        require(token.transferFrom(from, to, value), "SafeERC20: transferFrom failed");
    }
}
```

**File: `@openzeppelin/contracts/access/Ownable.sol`**
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

**File: `@openzeppelin/contracts/security/ReentrancyGuard.sol`**
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

### Step 4: Add Your Contract
1. In Remix File Explorer, create a new file: `GameEscrow.sol`
2. Copy the entire contents from `poker/contracts/GameEscrow.sol`
3. Paste into Remix

### Step 5: Compile
1. Click the "Solidity Compiler" icon (left sidebar, looks like a checkmark)
2. Select compiler version: `0.8.20` (or latest 0.8.x available)
3. Make sure "Auto compile" is checked
4. Click "Compile GameEscrow.sol"
5. Check the bottom panel for any errors (should be none if everything is set up correctly)

### Step 6: Connect MetaMask to Base Mainnet
1. Open MetaMask extension
2. Click the network dropdown (top of MetaMask)
3. Click "Add Network" or "Add a network manually"
4. Enter these details:
   - **Network Name**: Base
   - **RPC URL**: https://mainnet.base.org
   - **Chain ID**: 8453
   - **Currency Symbol**: ETH
   - **Block Explorer URL**: https://basescan.org
5. Click "Save"
6. Switch to Base network in MetaMask

### Step 7: Deploy Contract
1. In Remix, click "Deploy & Run Transactions" icon (left sidebar, looks like a rocket)
2. Under "Environment", select **"Injected Provider - MetaMask"**
3. MetaMask will pop up asking to connect - click "Connect"
4. Make sure you're connected to **Base Mainnet** (check MetaMask)
5. Make sure the account shown is your master wallet `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`
6. Under "Contract", select **"GameEscrow"**
7. Click the **"Deploy"** button
8. MetaMask will pop up with the deployment transaction
9. Review the gas fee (should be very low on Base, ~$0.01-0.10)
10. Click "Confirm" in MetaMask
11. Wait for confirmation (usually 1-2 minutes on Base)

### Step 8: Get Contract Address
1. After deployment, Remix will show the contract in the "Deployed Contracts" section
2. Click the copy icon next to the contract address
3. **Save this address** - you'll need it for environment variables!

### Step 9: Verify Contract (Recommended)
1. Go to https://basescan.org
2. Paste your contract address in the search bar
3. Click on your contract
4. Click the "Contract" tab
5. Click "Verify and Publish"
6. Select:
   - **Compiler Type**: Solidity (Single file)
   - **Compiler Version**: 0.8.20
   - **License**: MIT
7. Paste your entire `GameEscrow.sol` code (including OpenZeppelin imports)
8. Click "Verify and Publish"
9. Wait a minute, then refresh - you should see the verified contract code

### Step 10: Update Environment Variables

**For Local Development:**
1. Create/update `poker/.env.local`:
```env
NEXT_PUBLIC_GAME_ESCROW_CONTRACT=0xYourContractAddressHere
NEXT_PUBLIC_BASE_RPC_URL=https://mainnet.base.org
```

**For Vercel:**
1. Go to your Vercel project dashboard
2. Go to Settings → Environment Variables
3. Add:
   - `NEXT_PUBLIC_GAME_ESCROW_CONTRACT` = `0xYourContractAddressHere`
   - `NEXT_PUBLIC_BASE_RPC_URL` = `https://mainnet.base.org`
4. Redeploy your app

## Troubleshooting

**Problem: "Contract not found" error**
- Make sure you compiled the contract first
- Check that compiler version matches (0.8.20)

**Problem: "Insufficient funds" error**
- Make sure your wallet has Base ETH
- Get Base ETH from https://bridge.base.org

**Problem: "Network not found" in MetaMask**
- Make sure you added Base network correctly
- Chain ID must be exactly 8453

**Problem: OpenZeppelin import errors**
- Make sure you created the folder structure exactly as shown
- Check that file names match exactly (case-sensitive)

## Next Steps

After deployment:
1. ✅ Contract deployed
2. ⏭️ Set up Neynar app wallet (Step 2)
3. ⏭️ Complete Neynar payment integration (Step 3)
4. ⏭️ Test payment flow

---

**Need help?** Check the full deployment guide in `CONTRACT_DEPLOYMENT.md` for alternative methods (Hardhat, Foundry).

