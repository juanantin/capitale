// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Price source for Capitale. All prices are USD per ONE WHOLE token, scaled to 1e18
///         (e.g. a token worth $0.002 returns 2e15). Implementations must revert rather than
///         return a stale or zero price.
interface ICapitaleOracle {
    /// @notice Current (spot) USD price of $CAPITALE.
    function capitaleUsdSpot() external view returns (uint256);

    /// @notice Time-weighted average USD price of $CAPITALE (30-60 min window).
    function capitaleUsdTwap() external view returns (uint256);

    /// @notice USD price of one ETH.
    function ethUsd() external view returns (uint256);

    /// @notice Reference (time-weighted average) USD price of a reward token.
    function tokenUsd(address token) external view returns (uint256);
}
