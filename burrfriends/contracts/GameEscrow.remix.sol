// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ⚠️ IMPORTANT: This version is for Remix IDE
// Use relative paths for imports based on folder structure:
// poker/@openzeppelin/contracts/FileName.sol
// poker/GameEscrow.sol

import "../@openzeppelin/contracts/IERC20.sol";
import "../@openzeppelin/contracts/SafeERC20.sol";
import "../@openzeppelin/contracts/Ownable.sol";
import "../@openzeppelin/contracts/ReentrancyGuard.sol";

/**
 * @title GameEscrow
 * @notice Escrow contract for poker game entry fees and payouts on Base
 * @dev All funds are held in this contract until settlement or refund
 */
contract GameEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Base USDC address: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
    address public constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    
    // Master wallet that controls this contract
    address public constant MASTER_WALLET = 0xd942a322Fa7d360F22C525a652F51cA0FC4aF012;

    struct Game {
        string gameId;
        address currency; // address(0) for ETH, or USDC address
        uint256 entryFee;
        uint256 totalCollected;
        bool isActive;
        bool isSettled;
    }

    struct Participant {
        address player;
        uint256 amountPaid;
        bool hasPaid;
        bool hasRefunded;
    }

    // gameId => Game
    mapping(string => Game) public games;
    
    // gameId => player address => Participant
    mapping(string => mapping(address => Participant)) public participants;
    
    // gameId => address[] (list of participants)
    mapping(string => address[]) public participantList;

    event GameCreated(string indexed gameId, address currency, uint256 entryFee);
    event PlayerJoined(string indexed gameId, address indexed player, uint256 amount, bool isETH);
    event RefundIssued(string indexed gameId, address indexed player, uint256 amount, bool isETH);
    event GameSettled(string indexed gameId, address[] winners, uint256[] amounts);
    event PayoutSent(string indexed gameId, address indexed recipient, uint256 amount, bool isETH);

    modifier onlyMasterOrOwner() {
        require(
            msg.sender == MASTER_WALLET || msg.sender == owner(),
            "Not authorized"
        );
        _;
    }

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Create a new game (called by backend with master wallet)
     * @param gameId Unique game identifier
     * @param currency Address of token (address(0) for ETH)
     * @param entryFee Entry fee amount in RAW TOKEN UNITS:
     *                  - For ETH: amount in wei (18 decimals, e.g., 0.1 ETH = 100000000000000000 wei)
     *                  - For USDC: amount in token units (6 decimals, e.g., 20 USDC = 20000000 units)
     *                  
     * ⚠️ CRITICAL: Do NOT pass human-readable amounts. Convert first:
     *    - ETH: multiply by 10^18
     *    - USDC: multiply by 10^6
     */
    function createGame(
        string memory gameId,
        address currency,
        uint256 entryFee
    ) external onlyMasterOrOwner {
        require(bytes(gameId).length > 0, "Invalid gameId");
        require(entryFee > 0, "Entry fee must be > 0");
        require(currency == address(0) || currency == BASE_USDC, "Invalid currency");
        require(!games[gameId].isActive, "Game already exists");

        games[gameId] = Game({
            gameId: gameId,
            currency: currency,
            entryFee: entryFee,
            totalCollected: 0,
            isActive: true,
            isSettled: false
        });

        emit GameCreated(gameId, currency, entryFee);
    }

    /**
     * @notice Join a game by paying entry fee
     * @param gameId Game identifier
     * 
     * For ETH: Send msg.value equal to entryFee (in wei)
     * For USDC: Must approve contract first, then call this with msg.value = 0
     * 
     * ⚠️ CRITICAL: entryFee must be in raw token units (wei for ETH, 6-decimals for USDC)
     */
    function joinGame(string memory gameId) external payable nonReentrant {
        Game storage game = games[gameId];
        require(game.isActive, "Game not active");
        require(!game.isSettled, "Game already settled");
        require(!participants[gameId][msg.sender].hasPaid, "Already joined");

        if (game.currency == address(0)) {
            // ETH payment
            require(msg.value == game.entryFee, "Incorrect ETH amount");
        } else {
            // ERC20 token payment (USDC)
            require(msg.value == 0, "No ETH needed for token payment");
            IERC20 token = IERC20(game.currency);
            token.safeTransferFrom(msg.sender, address(this), game.entryFee);
        }

        participants[gameId][msg.sender] = Participant({
            player: msg.sender,
            amountPaid: game.entryFee,
            hasPaid: true,
            hasRefunded: false
        });

        participantList[gameId].push(msg.sender);
        game.totalCollected += game.entryFee;

        emit PlayerJoined(
            gameId,
            msg.sender,
            game.entryFee,
            game.currency == address(0)
        );
    }

    /**
     * @notice Refund a player's entry fee (owner only)
     * @param gameId Game identifier
     * @param player Address to refund
     */
    function refundPlayer(
        string memory gameId,
        address player
    ) external onlyMasterOrOwner nonReentrant {
        Game storage game = games[gameId];
        Participant storage participant = participants[gameId][player];
        
        require(participant.hasPaid, "Player has not paid");
        require(!participant.hasRefunded, "Already refunded");
        require(!game.isSettled, "Cannot refund after settlement");

        participant.hasRefunded = true;
        game.totalCollected -= participant.amountPaid;

        if (game.currency == address(0)) {
            // Refund ETH
            (bool success, ) = payable(player).call{value: participant.amountPaid}("");
            require(success, "ETH refund failed");
        } else {
            // Refund ERC20
            IERC20 token = IERC20(game.currency);
            token.safeTransfer(player, participant.amountPaid);
        }

        emit RefundIssued(
            gameId,
            player,
            participant.amountPaid,
            game.currency == address(0)
        );
    }

    /**
     * @notice Settle game and distribute payouts (owner only)
     * @param gameId Game identifier
     * @param recipients Array of winner addresses
     * @param amounts Array of payout amounts (must sum to total or less)
     */
    function settleGame(
        string memory gameId,
        address[] memory recipients,
        uint256[] memory amounts
    ) external onlyMasterOrOwner nonReentrant {
        Game storage game = games[gameId];
        require(game.isActive, "Game not active");
        require(!game.isSettled, "Already settled");
        require(recipients.length == amounts.length, "Mismatched arrays");

        uint256 totalPayout = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalPayout += amounts[i];
        }
        require(totalPayout <= game.totalCollected, "Payout exceeds collected");

        game.isSettled = true;
        game.isActive = false;

        bool isETH = game.currency == address(0);
        
        for (uint256 i = 0; i < recipients.length; i++) {
            if (amounts[i] > 0) {
                if (isETH) {
                    (bool success, ) = payable(recipients[i]).call{value: amounts[i]}("");
                    require(success, "ETH payout failed");
                } else {
                    IERC20 token = IERC20(game.currency);
                    token.safeTransfer(recipients[i], amounts[i]);
                }
                emit PayoutSent(gameId, recipients[i], amounts[i], isETH);
            }
        }

        emit GameSettled(gameId, recipients, amounts);
    }

    /**
     * @notice Get participant count for a game
     */
    function getParticipantCount(string memory gameId) external view returns (uint256) {
        return participantList[gameId].length;
    }

    /**
     * @notice Get participant list for a game
     */
    function getParticipants(string memory gameId) external view returns (address[] memory) {
        return participantList[gameId];
    }

    /**
     * @notice Get game details
     */
    function getGame(string memory gameId) external view returns (Game memory) {
        return games[gameId];
    }

    /**
     * @notice Emergency withdraw (owner only, for stuck funds)
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            (bool success, ) = payable(owner()).call{value: amount}("");
            require(success, "ETH withdrawal failed");
        } else {
            IERC20(token).safeTransfer(owner(), amount);
        }
    }

    // Allow contract to receive ETH
    receive() external payable {}
}

