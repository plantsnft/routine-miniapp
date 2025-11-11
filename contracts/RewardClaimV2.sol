// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract RewardClaimV2 is Ownable {
    using ECDSA for bytes32;

    // Reward tiers map directly to the indexes used by the backend signature payload:
    // 0 -> Starter, 1 -> Growth, 2 -> Legend, 3 -> Creator
    enum RewardTier {
        Starter,
        Growth,
        Legend,
        Creator
    }

    IERC20 public immutable token;
    address public rewardWallet;
    address public signer;

    mapping(uint256 => mapping(uint256 => bool)) public claimed;

    uint256 public constant TIER_STARTER = 10_000 ether;
    uint256 public constant TIER_GROWTH  = 20_000 ether;
    uint256 public constant TIER_LEGEND  = 333_333 ether;
    uint256 public constant TIER_CREATOR = 1_000_000 ether;

    event RewardClaimed(
        uint256 indexed fid,
        address indexed user,
        RewardTier tier,
        uint256 amount,
        uint256 dayId
    );

    constructor(address rewardToken, address rewardWallet_, address signer_) Ownable(msg.sender) {
        require(rewardToken != address(0), "Invalid token");
        require(rewardWallet_ != address(0), "Invalid reward wallet");
        require(signer_ != address(0), "Invalid signer");

        token = IERC20(rewardToken);
        rewardWallet = rewardWallet_;
        signer = signer_;
    }

    function setSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "Invalid signer");
        signer = newSigner;
    }

    function setRewardWallet(address newWallet) external onlyOwner {
        require(newWallet != address(0), "Invalid reward wallet");
        rewardWallet = newWallet;
    }

    function withdrawTokens(address to, uint256 amount) external onlyOwner {
        require(token.transfer(to, amount), "Withdraw failed");
    }

    function claim(
        uint256 fid,
        uint256 dayId,
        RewardTier tier,
        bytes calldata signature
    ) external {
        require(!claimed[fid][dayId], "Already claimed");
        _verifySignature(fid, dayId, tier, msg.sender, signature);
        claimed[fid][dayId] = true;

        uint256 rewardAmount = _payoutForTier(tier);
        require(token.allowance(rewardWallet, address(this)) >= rewardAmount, "Insufficient allowance");
        require(token.transferFrom(rewardWallet, msg.sender, rewardAmount), "Transfer failed");

        emit RewardClaimed(fid, msg.sender, tier, rewardAmount, dayId);
    }

    function hasClaimed(uint256 fid, uint256 dayId) external view returns (bool) {
        return claimed[fid][dayId];
    }

    function _payoutForTier(RewardTier tier) internal pure returns (uint256) {
        if (tier == RewardTier.Starter) return TIER_STARTER;
        if (tier == RewardTier.Growth)  return TIER_GROWTH;
        if (tier == RewardTier.Legend)  return TIER_LEGEND;
        return TIER_CREATOR;
    }

    /**
     * Verify backend-issued authorization:
     * keccak256(contract, fid, dayId, tier, claimant) signed by `signer`.
     */
    function _verifySignature(
        uint256 fid,
        uint256 dayId,
        RewardTier tier,
        address claimant,
        bytes calldata signature
    ) internal view {
        bytes32 digest = keccak256(
            abi.encodePacked(address(this), fid, dayId, tier, claimant)
        );

        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(digest);
        address recovered = ECDSA.recover(ethHash, signature);
        require(recovered == signer, "Invalid signer");
    }
}