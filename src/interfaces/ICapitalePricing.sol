// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICapitalePricing {
    function startTime() external view returns (uint256);
    function earlyBirdEnd() external view returns (uint256);
    function isEarlyBird() external view returns (bool);
    function quote(uint256 id) external view returns (uint256 tokens, uint256 usd);
    function quoteAndUpdate(uint256 id) external returns (uint256 tokens, uint256 usd);
}
