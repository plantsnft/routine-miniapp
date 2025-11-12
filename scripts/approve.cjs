const hre = require("hardhat");
require("dotenv").config();

async function main() {
  const CATWALK_TOKEN_ADDRESS = process.env.CATWALK_TOKEN_ADDRESS || "0xa5eb1cAD0dFC1c4f8d4f84f995aeDA9a7A047B07";
  const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
  const SERVER_WALLET_PRIVATE_KEY = process.env.REWARD_WALLET_PRIVATE_KEY;
  
  if (!CONTRACT_ADDRESS) {
    throw new Error("CONTRACT_ADDRESS environment variable is required");
  }
  
  if (!SERVER_WALLET_PRIVATE_KEY) {
    throw new Error("REWARD_WALLET_PRIVATE_KEY environment variable is required");
  }
  
  const provider = new hre.ethers.JsonRpcProvider(
    process.env.BASE_RPC_URL || "https://mainnet.base.org"
  );
  const wallet = new hre.ethers.Wallet(SERVER_WALLET_PRIVATE_KEY, provider);
  
  console.log("Approving contract to spend tokens...");
  console.log("Contract address:", CONTRACT_ADDRESS);
  console.log("Server wallet:", wallet.address);
  
  // ERC20 ABI - just approve function
  const tokenAbi = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
  ];
  
  const token = new hre.ethers.Contract(CATWALK_TOKEN_ADDRESS, tokenAbi, wallet);
  
  // Check current allowance
  const currentAllowance = await token.allowance(wallet.address, CONTRACT_ADDRESS);
  console.log("Current allowance:", hre.ethers.formatEther(currentAllowance), "tokens");
  
  // Approve max amount
  const maxApproval = hre.ethers.MaxUint256;
  
  console.log("\nSending approval transaction...");
  const tx = await token.approve(CONTRACT_ADDRESS, maxApproval);
  console.log("Transaction hash:", tx.hash);
  console.log("Waiting for confirmation...");
  
  await tx.wait();
  console.log("✅ Approval confirmed!");
  
  // Verify allowance
  const newAllowance = await token.allowance(wallet.address, CONTRACT_ADDRESS);
  console.log("New allowance:", hre.ethers.formatEther(newAllowance), "tokens");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


