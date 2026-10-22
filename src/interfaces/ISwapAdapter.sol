// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice A whitelisted route that turns ETH into one reward token. The vault sends ETH as
///         msg.value; the adapter must deliver at least `minOut` tokens to `recipient` or revert.
interface ISwapAdapter {
    function swapEthForToken(address token, uint256 minOut, address recipient)
        external
        payable
        returns (uint256 amountOut);
}
