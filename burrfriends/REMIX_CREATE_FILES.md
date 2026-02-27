# Creating OpenZeppelin Files in Remix - Step by Step

## Current Status
- ✅ You have `gameescrow.sol` 
- ❌ You don't have the OpenZeppelin files yet

## Step-by-Step: Create the OpenZeppelin Files

### Step 1: Create the Folder Structure

1. In Remix File Explorer, look at your `contracts` folder
2. Right-click on `contracts` folder
3. Select **"New Folder"**
4. Name it: `@openzeppelin`
5. Click inside the `@openzeppelin` folder (double-click it)
6. Right-click on `@openzeppelin` folder
7. Select **"New Folder"**
8. Name it: `contracts`

**You should now see:**
```
contracts/
  ├── @openzeppelin/
  │   └── contracts/
  └── gameescrow.sol
```

---

### Step 2: Create IERC20.sol

1. Click on `contracts/@openzeppelin/contracts/` folder
2. Right-click on `contracts` folder (the inner one)
3. Select **"New File"**
4. Name it: `IERC20.sol` (must be exactly this name, case-sensitive)
5. Copy and paste this ENTIRE code:

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

6. Click the **save icon** (💾) or press `Ctrl+S`

---

### Step 3: Create SafeERC20.sol

1. Right-click on `contracts/@openzeppelin/contracts/` folder again
2. Select **"New File"**
3. Name it: `SafeERC20.sol`
4. Copy and paste this ENTIRE code:

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

5. Save the file (`Ctrl+S`)

---

### Step 4: Create Ownable.sol

1. Right-click on `contracts/@openzeppelin/contracts/` folder
2. Select **"New File"**
3. Name it: `Ownable.sol`
4. Copy and paste this ENTIRE code:

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

### Step 5: Create ReentrancyGuard.sol

1. Right-click on `contracts/@openzeppelin/contracts/` folder
2. Select **"New File"**
3. Name it: `ReentrancyGuard.sol`
4. Copy and paste this ENTIRE code:

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

### Step 6: Update gameescrow.sol Imports

1. Open `gameescrow.sol` in Remix
2. Find the import lines at the top (after `pragma solidity ^0.8.20;`)
3. Replace them with:

```solidity
import "./@openzeppelin/contracts/IERC20.sol";
import "./@openzeppelin/contracts/SafeERC20.sol";
import "./@openzeppelin/contracts/Ownable.sol";
import "./@openzeppelin/contracts/ReentrancyGuard.sol";
```

4. Save the file

---

### Step 7: Verify Structure

Your File Explorer should show:

```
contracts/
  ├── @openzeppelin/
  │   └── contracts/
  │       ├── IERC20.sol
  │       ├── SafeERC20.sol
  │       ├── Ownable.sol
  │       └── ReentrancyGuard.sol
  └── gameescrow.sol
```

---

### Step 8: Try Compiling

1. Click "Solidity Compiler" (left sidebar)
2. Select compiler version `0.8.31`
3. Click "Compile gameescrow.sol"
4. Check for green checkmark ✅

If you get errors, let me know what they say!

---

## Quick Checklist

- [ ] Created `@openzeppelin` folder in `contracts/`
- [ ] Created `contracts` folder inside `@openzeppelin/`
- [ ] Created all 4 files with exact code above
- [ ] Updated imports in `gameescrow.sol`
- [ ] Saved all files
- [ ] Tried compiling

Good luck! 🚀

