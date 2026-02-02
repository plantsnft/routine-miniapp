/**
 * Smart contract ABIs and utilities for Base network
 */

// GameEscrow contract ABI (minimal interface for frontend)
export const GAME_ESCROW_ABI = [
  {
    inputs: [
      { internalType: 'string', name: 'gameId', type: 'string' },
      { internalType: 'address', name: 'currency', type: 'address' },
      { internalType: 'uint256', name: 'entryFee', type: 'uint256' },
    ],
    name: 'createGame',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'string', name: 'gameId', type: 'string' }],
    name: 'joinGame',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'string', name: 'gameId', type: 'string' },
      { internalType: 'address', name: 'player', type: 'address' },
    ],
    name: 'refundPlayer',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'string', name: 'gameId', type: 'string' },
      { internalType: 'address[]', name: 'recipients', type: 'address[]' },
      { internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' },
    ],
    name: 'settleGame',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'string', name: 'gameId', type: 'string' }],
    name: 'getGame',
    outputs: [
      {
        components: [
          { internalType: 'string', name: 'gameId', type: 'string' },
          { internalType: 'address', name: 'currency', type: 'address' },
          { internalType: 'uint256', name: 'entryFee', type: 'uint256' },
          { internalType: 'uint256', name: 'totalCollected', type: 'uint256' },
          { internalType: 'bool', name: 'isActive', type: 'bool' },
          { internalType: 'bool', name: 'isSettled', type: 'bool' },
        ],
        internalType: 'struct GameEscrow.Game',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'string', name: 'gameId', type: 'string' }],
    name: 'getParticipantCount',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'string', name: 'gameId', type: 'string' },
      { internalType: 'address', name: '', type: 'address' },
    ],
    name: 'participants',
    outputs: [
      { internalType: 'address', name: 'player', type: 'address' },
      { internalType: 'uint256', name: 'amountPaid', type: 'uint256' },
      { internalType: 'bool', name: 'hasPaid', type: 'bool' },
      { internalType: 'bool', name: 'hasRefunded', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Base USDC ERC20 ABI (for approve/transfer)
export const ERC20_ABI = [
  {
    constant: false,
    inputs: [
      { name: '_spender', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [
      { name: '_owner', type: 'address' },
      { name: '_spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function',
  },
] as const;

// PrizeDistribution contract ABI (for NFT and token prize distribution)
export const PRIZE_DISTRIBUTION_ABI = [
  {
    inputs: [
      { internalType: 'string', name: 'gameId', type: 'string' },
      { internalType: 'address', name: 'tokenContract', type: 'address' },
      { internalType: 'address[]', name: 'recipients', type: 'address[]' },
      { internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' },
    ],
    name: 'distributeTokens',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'string', name: 'gameId', type: 'string' },
      { internalType: 'address[]', name: 'nftContracts', type: 'address[]' },
      { internalType: 'uint256[]', name: 'tokenIds', type: 'uint256[]' },
      { internalType: 'address[]', name: 'recipients', type: 'address[]' },
    ],
    name: 'distributeNFTs',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'string', name: 'gameId', type: 'string' },
      { internalType: 'address', name: 'tokenContract', type: 'address' },
      { internalType: 'address[]', name: 'tokenRecipients', type: 'address[]' },
      { internalType: 'uint256[]', name: 'tokenAmounts', type: 'uint256[]' },
      { internalType: 'address[]', name: 'nftContracts', type: 'address[]' },
      { internalType: 'uint256[]', name: 'nftTokenIds', type: 'uint256[]' },
      { internalType: 'address[]', name: 'nftRecipients', type: 'address[]' },
    ],
    name: 'distributeMixedPrizes',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

