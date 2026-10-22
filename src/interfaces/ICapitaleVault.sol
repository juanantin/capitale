// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICapitaleVault {
    function onMint(uint256 id, uint8 district, bool earlyBird) external;
    function levelOf(uint256 id) external view returns (uint256);
    function claimedUsd(uint256 id) external view returns (uint256);
}
