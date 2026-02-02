/**
 * NFT Operations - Verify ownership and handle NFT-related operations
 */

import { ethers } from 'ethers';
import { BASE_RPC_URL, MASTER_WALLET_ADDRESS } from './constants';

const ERC721_ABI = [
  {
    constant: true,
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    type: 'function',
  },
] as const;

/**
 * Verify that an NFT is owned by the master wallet
 * @param contractAddress NFT contract address
 * @param tokenId NFT token ID
 * @returns true if NFT is owned by master wallet, false otherwise
 */
export async function verifyNFTOwnership(
  contractAddress: string,
  tokenId: number
): Promise<boolean> {
  if (!BASE_RPC_URL) {
    console.error('[nft-ops] BASE_RPC_URL not configured');
    return false;
  }

  if (!MASTER_WALLET_ADDRESS) {
    console.error('[nft-ops] MASTER_WALLET_ADDRESS not configured');
    return false;
  }

  try {
    const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
    const contract = new ethers.Contract(contractAddress, ERC721_ABI, provider);
    
    const owner = await contract.ownerOf(tokenId);
    const isOwned = owner.toLowerCase() === MASTER_WALLET_ADDRESS.toLowerCase();
    
    if (!isOwned) {
      console.warn('[nft-ops] NFT not owned by master wallet', {
        contractAddress,
        tokenId,
        owner,
        masterWallet: MASTER_WALLET_ADDRESS,
      });
    }
    
    return isOwned;
  } catch (error) {
    console.error('[nft-ops] Error verifying ownership:', error, {
      contractAddress,
      tokenId,
    });
    return false;
  }
}

/**
 * Verify that all NFTs in a list are owned by the master wallet
 * @param nfts Array of NFT contract addresses and token IDs
 * @returns Object with allOwned flag and list of missing NFTs
 */
export async function verifyAllNFTsOwned(
  nfts: Array<{contract: string, tokenId: number}>
): Promise<{allOwned: boolean, missing: Array<{contract: string, tokenId: number}>}> {
  const missing: Array<{contract: string, tokenId: number}> = [];
  
  for (const nft of nfts) {
    const owned = await verifyNFTOwnership(nft.contract, nft.tokenId);
    if (!owned) {
      missing.push(nft);
    }
  }
  
  return {
    allOwned: missing.length === 0,
    missing,
  };
}
