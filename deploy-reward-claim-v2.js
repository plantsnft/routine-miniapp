#!/usr/bin/env node
// Deploy the hardened RewardClaimV2 contract.
// Requires PRIVATE_KEY, CATWALK_TOKEN_ADDRESS, SERVER_WALLET_ADDRESS, and REWARD_SIGNER_ADDRESS env vars.
import { ethers } from "ethers";
import fs from "fs/promises";
import path from "path";
import url from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.join(__dirname, ".env.local") });

const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CATWALK_TOKEN_ADDRESS = process.env.CATWALK_TOKEN_ADDRESS;
const REWARD_WALLET_ADDRESS = process.env.SERVER_WALLET_ADDRESS;
const AUTH_SIGNER_ADDRESS = process.env.REWARD_SIGNER_ADDRESS;

if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY missing");
if (!CATWALK_TOKEN_ADDRESS) throw new Error("CATWALK_TOKEN_ADDRESS missing");
if (!REWARD_WALLET_ADDRESS) throw new Error("SERVER_WALLET_ADDRESS missing");
if (!AUTH_SIGNER_ADDRESS) throw new Error("REWARD_SIGNER_ADDRESS missing");

async function main() {
  console.log("Deploying RewardClaimV2...");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(
    `Using token=${CATWALK_TOKEN_ADDRESS}, reward wallet=${REWARD_WALLET_ADDRESS}, signer=${AUTH_SIGNER_ADDRESS}`
  );

  const artifactPath = path.join(
    __dirname,
    "artifacts",
    "contracts",
    "RewardClaimV2.sol",
    "RewardClaimV2.json"
  );

  let artifact;
  try {
    artifact = JSON.parse(await fs.readFile(artifactPath, "utf-8"));
  } catch (err) {
    console.log("Compiling contract...");
    const { compile } = await import("hardhat-workspace/compile.cjs");
    await compile();
    artifact = JSON.parse(await fs.readFile(artifactPath, "utf-8"));
  }

  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet
  );

  const contract = await factory.deploy(
    CATWALK_TOKEN_ADDRESS,
    REWARD_WALLET_ADDRESS,
    AUTH_SIGNER_ADDRESS
  );

  console.log("Awaiting confirmation...");
  await contract.deploymentTransaction().wait();
  const address = await contract.getAddress();
  console.log(`RewardClaimV2 deployed to: ${address}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});