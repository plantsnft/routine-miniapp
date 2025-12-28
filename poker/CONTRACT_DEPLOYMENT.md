# Contract Deployment Guide - Base Mainnet

## Option 1: Deploy via Remix IDE (Easiest - Recommended for First Time)

### Prerequisites
1. MetaMask or another wallet with Base mainnet configured
2. Base ETH in your wallet for gas fees (get from: https://bridge.base.org or https://www.coinbase.com/price/base)
3. Master wallet `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012` should be funded and ready

### Steps

1. **Open Remix IDE**
   - Go to https://remix.ethereum.org
   - This is a browser-based IDE, no installation needed

2. **Set up OpenZeppelin Contracts**
   - In Remix, go to "File Explorer" tab
   - Create a new folder called `@openzeppelin`
   - Inside that, create `contracts` folder
   - We'll use Remix's GitHub import feature:
     - Click "Connect to Localhost" or use "Import from GitHub"
     - Or manually: Go to https://github.com/OpenZeppelin/openzeppelin-contracts
     - Copy the contracts you need, or use Remix's import feature

3. **Actually, easier way - Use Remix's built-in OpenZeppelin:**
   - In Remix, go to "Solidity Compiler" tab
   - Under "Compiler Configuration", click "Advanced Configurations"
   - Enable "Auto compile" and "Enable optimization"
   - Remix should auto-import OpenZeppelin contracts

4. **Add Your Contract**
   - In Remix File Explorer, create a new file: `GameEscrow.sol`
   - Copy the entire contents from `poker/contracts/GameEscrow.sol`
   - Paste into Remix

5. **Compile**
   - Go to "Solidity Compiler" tab
   - Select compiler version: `0.8.20` or latest 0.8.x
   - Click "Compile GameEscrow.sol"
   - Check for errors (should be none)

6. **Deploy**
   - Go to "Deploy & Run Transactions" tab
   - Under "Environment", select "Injected Provider - MetaMask"
   - This will connect to your MetaMask wallet
   - Make sure MetaMask is connected to **Base Mainnet**
     - If not, add Base network:
       - Network Name: Base
       - RPC URL: https://mainnet.base.org
       - Chain ID: 8453
       - Currency Symbol: ETH
       - Block Explorer: https://basescan.org

7. **Deploy Contract**
   - In Remix, under "Deploy", select "GameEscrow" contract
   - Click "Deploy"
   - MetaMask will pop up - confirm the transaction
   - Wait for confirmation (usually 1-2 minutes on Base)

8. **Get Contract Address**
   - After deployment, Remix will show the contract address
   - Copy this address - you'll need it for your environment variables
   - Also verify on BaseScan: https://basescan.org/address/YOUR_CONTRACT_ADDRESS

9. **Verify Contract (Optional but Recommended)**
   - Go to https://basescan.org/address/YOUR_CONTRACT_ADDRESS
   - Click "Contract" tab
   - Click "Verify and Publish"
   - Select "Solidity (Single file)" or "Solidity (Standard JSON Input)"
   - Enter compiler version (0.8.20)
   - Paste your contract code
   - Click "Verify and Publish"

---

## Option 2: Deploy via Hardhat (More Professional)

### Setup

1. **Install Hardhat**
   ```bash
   cd poker
   npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
   ```

2. **Initialize Hardhat**
   ```bash
   npx hardhat init
   ```
   - Select "Create a JavaScript project"
   - Accept defaults

3. **Install Dependencies**
   ```bash
   npm install --save-dev @openzeppelin/contracts
   npm install dotenv
   ```

4. **Create `hardhat.config.js`**
   ```javascript
   require("@nomicfoundation/hardhat-toolbox");
   require("dotenv").config();

   module.exports = {
     solidity: {
       version: "0.8.20",
       settings: {
         optimizer: {
           enabled: true,
           runs: 200,
         },
       },
     },
     networks: {
       base: {
         url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
         accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
         chainId: 8453,
       },
     },
   };
   ```

5. **Create `.env` file** (in `poker/` directory, add to `.gitignore`)
   ```env
   PRIVATE_KEY=your_master_wallet_private_key_here
   BASE_RPC_URL=https://mainnet.base.org
   ```

6. **Create deployment script** `scripts/deploy.js`:
   ```javascript
   const hre = require("hardhat");

   async function main() {
     const GameEscrow = await hre.ethers.getContractFactory("GameEscrow");
     const gameEscrow = await GameEscrow.deploy();

     await gameEscrow.waitForDeployment();
     const address = await gameEscrow.getAddress();

     console.log("GameEscrow deployed to:", address);
     console.log("Verify with:");
     console.log(`npx hardhat verify --network base ${address}`);
   }

   main()
     .then(() => process.exit(0))
     .catch((error) => {
       console.error(error);
       process.exit(1);
     });
   ```

7. **Deploy**
   ```bash
   npx hardhat run scripts/deploy.js --network base
   ```

8. **Verify Contract**
   ```bash
   npx hardhat verify --network base YOUR_CONTRACT_ADDRESS
   ```

---

## Option 3: Deploy via Foundry (Fastest)

1. **Install Foundry**
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

2. **Initialize Foundry**
   ```bash
   cd poker
   forge init --no-git
   ```

3. **Install OpenZeppelin**
   ```bash
   forge install OpenZeppelin/openzeppelin-contracts
   ```

4. **Move contract**
   ```bash
   cp contracts/GameEscrow.sol lib/forge-std/src/
   # Or just put it in src/
   ```

5. **Deploy**
   ```bash
   forge create GameEscrow \
     --rpc-url https://mainnet.base.org \
     --private-key $PRIVATE_KEY \
     --etherscan-api-key $BASESCAN_API_KEY \
     --verify
   ```

---

## After Deployment - Update Environment Variables

Once you have your contract address, update your environment variables:

### For Local Development (`.env.local` in `poker/`):
```env
NEXT_PUBLIC_GAME_ESCROW_CONTRACT=0xYourDeployedContractAddressHere
NEXT_PUBLIC_BASE_RPC_URL=https://mainnet.base.org
```

### For Vercel Deployment:
1. Go to your Vercel project settings
2. Go to "Environment Variables"
3. Add:
   - `NEXT_PUBLIC_GAME_ESCROW_CONTRACT` = `0xYourDeployedContractAddressHere`
   - `NEXT_PUBLIC_BASE_RPC_URL` = `https://mainnet.base.org`

---

## Important Notes

1. **Master Wallet**: The contract has a hardcoded master wallet address `0xd942a322Fa7d360F22C525a652F51cA0FC4aF012`. Make sure this wallet:
   - Has Base ETH for gas fees
   - Is the one you'll use to call refund/settle functions

2. **Gas Fees**: Base has very low gas fees (~$0.01-0.10 per transaction), but you still need ETH in your wallet

3. **Contract Verification**: Always verify your contract on BaseScan so users can read the code

4. **Test First**: Consider deploying to Base Sepolia testnet first to test everything

---

## Quick Start (Remix - Easiest)

If you want the fastest path:

1. Go to https://remix.ethereum.org
2. Create new file `GameEscrow.sol`
3. Copy contract code from `poker/contracts/GameEscrow.sol`
4. Compile (Solidity Compiler tab)
5. Deploy (Deploy & Run tab) - connect MetaMask to Base Mainnet
6. Copy contract address
7. Update environment variables

That's it! 🎉

