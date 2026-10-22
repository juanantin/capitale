// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ICapitaleOracle} from "./interfaces/ICapitaleOracle.sol";
import {ICapitalePricing} from "./interfaces/ICapitalePricing.sol";

/// @title CapitalePricing
/// @notice Price of a new building, set in USD and paid by burning $CAPITALE.
///
///         Early bird: the first 300 buildings cost $40 during the 6 hours after `startTime`.
///         If they sell out sooner, building pauses until the 6 hours are over.
///         Then tiers by building number: #<=800 $52, #<=1500 $68, #<=2300 $88, #<=3000 $120.
///
///         Tokens to burn = USD target / $CAPITALE price.
///         - Early bird: a reference price that follows drops immediately and follows rises
///           only after the higher price has held for 60 seconds.
///         - Afterwards: the LOWER of spot and the 30-60 min TWAP (so a pump never makes
///           building cheaper).
///
/// @dev    The owner is meant to be a 48h TimelockController: oracle and USD target changes
///         are therefore publicly announced 48h ahead.
contract CapitalePricing is ICapitalePricing, Ownable2Step {
    uint256 public constant EARLY_BIRD_DURATION = 6 hours;
    uint256 public constant RISE_HOLD = 60 seconds;
    uint256 public constant MAX_BUILDINGS = 3000;

    uint256 public immutable startTime;
    uint256 public immutable earlyBirdUnits;

    address public nft;
    ICapitaleOracle public oracle;

    /// USD targets, 1e18 = $1.
    uint256 public earlyBirdUsd;
    uint256[4] public tierUsd;
    /// Last building number of each tier (inclusive).
    uint256[4] public tierEnd = [uint256(800), 1500, 2300, 3000];

    // Early-bird reference price state.
    uint256 public refPrice;
    uint256 public riseCandidate; // lowest price seen since the price first went above refPrice
    uint256 public riseSince; // 0 = no rise in progress

    event NftSet(address nft);
    event OracleSet(address oracle);
    event UsdTargetsSet(uint256 earlyBirdUsd, uint256[4] tierUsd);
    event ReferenceUpdated(uint256 refPrice);

    error NotNft();
    error NftAlreadySet();
    error BadConfig();
    error NotStarted();
    error EarlyBirdSoldOut();
    error CityLocked();
    error BadPrice();

    constructor(
        address owner_,
        ICapitaleOracle oracle_,
        uint256 startTime_,
        uint256 earlyBirdUnits_,
        uint256 earlyBirdUsd_,
        uint256[4] memory tierUsd_
    ) Ownable(owner_) {
        if (address(oracle_) == address(0) || earlyBirdUnits_ == 0 || earlyBirdUnits_ > tierEnd[0]) revert BadConfig();
        oracle = oracle_;
        startTime = startTime_;
        earlyBirdUnits = earlyBirdUnits_;
        _setUsdTargets(earlyBirdUsd_, tierUsd_);
    }

    /// @notice One-time link to the NFT contract (done by the deployer right after deployment).
    function setNft(address nft_) external onlyOwner {
        if (nft != address(0)) revert NftAlreadySet();
        if (nft_ == address(0)) revert BadConfig();
        nft = nft_;
        emit NftSet(nft_);
    }

    // ─────────────────────────── Views ───────────────────────────

    function earlyBirdEnd() public view returns (uint256) {
        return startTime + EARLY_BIRD_DURATION;
    }

    function isEarlyBird() public view returns (bool) {
        return block.timestamp >= startTime && block.timestamp < earlyBirdEnd();
    }

    /// @notice USD target for building number `id` (reverts if it cannot be built right now).
    function usdFor(uint256 id) public view returns (uint256) {
        if (block.timestamp < startTime) revert NotStarted();
        if (id == 0 || id > MAX_BUILDINGS) revert CityLocked();
        if (isEarlyBird()) {
            if (id > earlyBirdUnits) revert EarlyBirdSoldOut();
            return earlyBirdUsd;
        }
        for (uint256 i; i < 4; ++i) {
            if (id <= tierEnd[i]) return tierUsd[i];
        }
        revert CityLocked();
    }

    /// @notice $CAPITALE price used for building right now (USD per token, 1e18).
    function buildPrice() public view returns (uint256 price) {
        if (isEarlyBird()) {
            (price,,) = _nextRef(oracle.capitaleUsdSpot());
        } else {
            uint256 spot = oracle.capitaleUsdSpot();
            uint256 twap = oracle.capitaleUsdTwap();
            price = spot < twap ? spot : twap;
        }
        if (price == 0) revert BadPrice();
    }

    /// @notice Tokens to burn (and USD target) for building number `id`.
    function quote(uint256 id) public view returns (uint256 tokens, uint256 usd) {
        usd = usdFor(id);
        tokens = _tokensFor(usd, buildPrice());
    }

    // ─────────────────────────── NFT hook ───────────────────────────

    /// @notice Same as quote() but also stores the early-bird reference price.
    function quoteAndUpdate(uint256 id) external returns (uint256 tokens, uint256 usd) {
        if (msg.sender != nft) revert NotNft();
        usd = usdFor(id);
        uint256 price;
        if (isEarlyBird()) {
            price = _pokeRef();
        } else {
            price = buildPrice();
        }
        if (price == 0) revert BadPrice();
        tokens = _tokensFor(usd, price);
    }

    /// @notice Anyone may refresh the early-bird reference price (lets a held rise register).
    function poke() external returns (uint256) {
        return _pokeRef();
    }

    // ─────────────────────────── Admin (timelocked) ───────────────────────────

    function setOracle(ICapitaleOracle oracle_) external onlyOwner {
        if (address(oracle_) == address(0)) revert BadConfig();
        oracle = oracle_;
        emit OracleSet(address(oracle_));
    }

    function setUsdTargets(uint256 earlyBirdUsd_, uint256[4] calldata tierUsd_) external onlyOwner {
        _setUsdTargets(earlyBirdUsd_, tierUsd_);
    }

    // ─────────────────────────── Internals ───────────────────────────

    function _setUsdTargets(uint256 eb, uint256[4] memory tiers) internal {
        if (eb == 0) revert BadConfig();
        for (uint256 i; i < 4; ++i) {
            if (tiers[i] == 0) revert BadConfig();
        }
        earlyBirdUsd = eb;
        tierUsd = tiers;
        emit UsdTargetsSet(eb, tiers);
    }

    function _tokensFor(uint256 usd, uint256 price) internal pure returns (uint256) {
        // Round up so the burn is never below the USD target.
        return (usd * 1e18 + price - 1) / price;
    }

    function _pokeRef() internal returns (uint256 ref) {
        (ref, riseCandidate, riseSince) = _nextRef(oracle.capitaleUsdSpot());
        if (ref != refPrice) {
            refPrice = ref;
            emit ReferenceUpdated(ref);
        }
    }

    /// @dev Reference follows drops at once; a rise is adopted only once the price has stayed
    ///      above the reference for RISE_HOLD, and then at the lowest level seen during the hold.
    function _nextRef(uint256 spot) internal view returns (uint256 ref, uint256 cand, uint256 since) {
        ref = refPrice;
        cand = riseCandidate;
        since = riseSince;
        if (ref == 0) {
            // First reading: never start above the average, so a pre-launch pump cannot seed it.
            uint256 twap = oracle.capitaleUsdTwap();
            return (spot < twap ? spot : twap, 0, 0);
        }
        if (spot <= ref) {
            return (spot, 0, 0);
        }
        if (since == 0) {
            return (ref, spot, block.timestamp);
        }
        if (spot < cand) cand = spot;
        if (block.timestamp >= since + RISE_HOLD) {
            return (cand, 0, 0);
        }
    }
}
