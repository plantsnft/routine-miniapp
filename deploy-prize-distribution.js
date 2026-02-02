#!/usr/bin/env node
// Deploy the PrizeDistribution contract to Base network
// Requires PRIVATE_KEY and BASE_RPC_URL env vars
import { ethers } from "ethers";
import fs from "fs/promises";
import path from "path";
import url from "url";
import dotenv from "dotenv";
import { execSync } from "child_process";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
// Try poker app's .env.local first (for giveaway games app)
dotenv.config({ path: path.join(__dirname, "poker", ".env.local") });
// Fallback to root .env.local (for catwalk app)
dotenv.config({ path: path.join(__dirname, ".env.local") });
// Also try root .env
dotenv.config({ path: path.join(__dirname, ".env") });

const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error("\n❌ ERROR: PRIVATE_KEY missing!");
  console.error("\nPlease set PRIVATE_KEY in one of these files:");
  console.error("  1. c:\\miniapps\\routine\\poker\\.env.local  (for giveaway games app)");
  console.error("  2. c:\\miniapps\\routine\\.env.local  (for catwalk app)");
  console.error("\nExample:");
  console.error("  PRIVATE_KEY=0xYourPrivateKeyHere");
  console.error("  BASE_RPC_URL=https://mainnet.base.org");
  throw new Error("PRIVATE_KEY missing");
}

async function main() {
  console.log("=".repeat(60));
  console.log("Deploying PrizeDistribution Contract to Base");
  console.log("=".repeat(60));
  
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  
  const walletAddress = await wallet.getAddress();
  const balance = await provider.getBalance(walletAddress);
  const balanceEth = ethers.formatEther(balance);
  
  console.log(`\nDeployer Address: ${walletAddress}`);
  console.log(`Balance: ${balanceEth} ETH`);
  console.log(`Network: Base Mainnet (Chain ID: 8453)`);
  
  if (balance === 0n) {
    throw new Error("Deployer wallet has no ETH. Add funds to continue.");
  }
  
  // Check if contract is already compiled
  const artifactPath = path.join(
    __dirname,
    "artifacts",
    "contracts",
    "PrizeDistribution.sol",
    "PrizeDistribution.json"
  );
  
  let artifact;
  try {
    artifact = JSON.parse(await fs.readFile(artifactPath, "utf-8"));
    console.log("\n✓ Using existing compiled contract");
  } catch (err) {
    console.log("\n⚠ Contract not compiled. Compiling with Hardhat...");
    // Set HARDHAT_DISABLE_TELEMETRY to skip the prompt that causes issues
    // Also set CI=true to force non-interactive mode
    const env = { 
      ...process.env, 
      HARDHAT_DISABLE_TELEMETRY: "1",
      CI: "true"
    };
    try {
      execSync("npx hardhat compile", { 
        stdio: "pipe",  // Use pipe instead of inherit to avoid prompt issues
        cwd: __dirname,
        env: env
      });
      artifact = JSON.parse(await fs.readFile(artifactPath, "utf-8"));
      console.log("✓ Contract compiled successfully");
    } catch (compileError) {
      console.error("\n❌ Compilation failed. Try compiling manually first:");
      console.error("   npx hardhat compile --force");
      throw compileError;
    }
  }
  
  console.log("\n📝 Deploying contract...");
  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet
  );
  
  // PrizeDistribution has no constructor parameters
  const contract = await factory.deploy();
  
  console.log("⏳ Waiting for transaction confirmation...");
  const receipt = await contract.deploymentTransaction().wait();
  
  const contractAddress = await contract.getAddress();
  
  console.log("\n" + "=".repeat(60));
  console.log("✅ DEPLOYMENT SUCCESSFUL!");
  console.log("=".repeat(60));
  console.log(`\nContract Address: ${contractAddress}`);
  console.log(`Transaction Hash: ${receipt.hash}`);
  console.log(`Block Number: ${receipt.blockNumber}`);
  console.log(`Gas Used: ${receipt.gasUsed.toString()}`);
  
  console.log("\n📋 Next Steps:");
  console.log("1. Copy the contract address above");
  console.log("2. Add to Vercel environment variables:");
  console.log(`   PRIZE_DISTRIBUTION_CONTRACT=${contractAddress}`);
  console.log("3. Verify contract on BaseScan:");
  console.log(`   https://basescan.org/address/${contractAddress}`);
  
  console.log("\n⚠️  IMPORTANT:");
  console.log("- Master wallet must approve this contract to transfer tokens");
  console.log("- Master wallet must approve this contract to transfer NFTs");
  console.log("- Contract owner should be set to master wallet for security");
  
  console.log("\n" + "=".repeat(60));
}

main().catch((err) => {
  console.error("\n❌ Deployment failed:");
  console.error(err);
  process.exit(1);
});
