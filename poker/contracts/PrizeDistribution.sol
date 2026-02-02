// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PrizeDistribution
 * @notice Contract for distributing token and NFT prizes from master wallet
 * @dev All prizes are sent from MASTER_WALLET address
 *      This contract is separate from GameEscrow to handle prize-based games (no entry fees)
 */
contract PrizeDistribution is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    /**
     * @notice Master wallet that holds prizes
     * @dev CRITICAL: This wallet must hold all tokens and NFTs before distribution
     *      This is a HOT WALLET with LIMITED FUNDS - not cold storage.
     */
    address public constant MASTER_WALLET = 0xd942a322Fa7d360F22C525a652F51cA0FC4aF012;
    
    event TokenPrizeDistributed(
        string indexed gameId,
        address indexed recipient,
        address token,
        uint256 amount
    );
    
    event NFTPrizeDistributed(
        string indexed gameId,
        address indexed recipient,
        address nftContract,
        uint256 tokenId
    );
    
    modifier onlyMasterOrOwner() {
        require(
            msg.sender == MASTER_WALLET || msg.sender == owner(),
            "Not authorized"
        );
        _;
    }
    
    /**
     * @notice Constructor - deploys contract
     * @dev In production, owner() should equal MASTER_WALLET for consistency
     */
    constructor() Ownable(msg.sender) {
        // Emit event for verification
        // In production, owner() should equal MASTER_WALLET
    }
    
    /**
     * @notice Internal: distribute token prizes (no modifier; caller must enforce auth + reentrancy)
     */
    function _distributeTokens(
        string memory gameId,
        address tokenContract,
        address[] memory recipients,
        uint256[] memory amounts
    ) internal {
        require(recipients.length == amounts.length, "Mismatched arrays");
        require(recipients.length > 0, "No recipients");
        IERC20 token = IERC20(tokenContract);
        for (uint256 i = 0; i < recipients.length; i++) {
            if (amounts[i] > 0) {
                token.safeTransferFrom(MASTER_WALLET, recipients[i], amounts[i]);
                emit TokenPrizeDistributed(gameId, recipients[i], tokenContract, amounts[i]);
            }
        }
    }

    /**
     * @notice Internal: distribute NFT prizes (no modifier; caller must enforce auth + reentrancy)
     */
    function _distributeNFTs(
        string memory gameId,
        address[] memory nftContracts,
        uint256[] memory tokenIds,
        address[] memory recipients
    ) internal {
        require(nftContracts.length == tokenIds.length, "Mismatched NFT arrays");
        require(nftContracts.length == recipients.length, "Mismatched recipient array");
        require(nftContracts.length > 0, "No NFTs to distribute");
        for (uint256 i = 0; i < nftContracts.length; i++) {
            IERC721 nft = IERC721(nftContracts[i]);
            require(nft.ownerOf(tokenIds[i]) == MASTER_WALLET, "NFT not owned by master wallet");
            nft.safeTransferFrom(MASTER_WALLET, recipients[i], tokenIds[i]);
            emit NFTPrizeDistributed(gameId, recipients[i], nftContracts[i], tokenIds[i]);
        }
    }

    /**
     * @notice Distribute token prizes from master wallet
     */
    function distributeTokens(
        string memory gameId,
        address tokenContract,
        address[] memory recipients,
        uint256[] memory amounts
    ) external onlyMasterOrOwner nonReentrant {
        _distributeTokens(gameId, tokenContract, recipients, amounts);
    }

    /**
     * @notice Distribute NFT prizes from master wallet
     */
    function distributeNFTs(
        string memory gameId,
        address[] memory nftContracts,
        uint256[] memory tokenIds,
        address[] memory recipients
    ) external onlyMasterOrOwner nonReentrant {
        _distributeNFTs(gameId, nftContracts, tokenIds, recipients);
    }

    /**
     * @notice Distribute mixed prizes (tokens + NFTs) in one transaction
     */
    function distributeMixedPrizes(
        string memory gameId,
        address tokenContract,
        address[] memory tokenRecipients,
        uint256[] memory tokenAmounts,
        address[] memory nftContracts,
        uint256[] memory nftTokenIds,
        address[] memory nftRecipients
    ) external onlyMasterOrOwner nonReentrant {
        if (tokenRecipients.length > 0) {
            _distributeTokens(gameId, tokenContract, tokenRecipients, tokenAmounts);
        }
        if (nftContracts.length > 0) {
            _distributeNFTs(gameId, nftContracts, nftTokenIds, nftRecipients);
        }
    }
}
