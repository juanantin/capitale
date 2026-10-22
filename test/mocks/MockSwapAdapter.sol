// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISwapAdapter} from "../../src/interfaces/ISwapAdapter.sol";
import {MockERC20} from "./MockERC20.sol";

/// @notice Fills ETH -> token at `oracle price * qualityBps / 10000` by minting the token.
///         qualityBps < 10000 simulates a worse execution price (slippage / manipulation).
contract MockSwapAdapter is ISwapAdapter {
    uint256 public ethUsd; // 1e18
    mapping(address => uint256) public tokenUsd; // 1e18 per whole token
    uint256 public qualityBps = 10_000;
    bool public honourMinOut = true;
    bool public broken;

    function setPrices(uint256 ethUsd_, address token, uint256 tokenUsd_) external {
        ethUsd = ethUsd_;
        tokenUsd[token] = tokenUsd_;
    }

    function setQuality(uint256 q) external {
        qualityBps = q;
    }

    function setHonourMinOut(bool h) external {
        honourMinOut = h;
    }

    function setBroken(bool b) external {
        broken = b;
    }

    function swapEthForToken(address token, uint256 minOut, address recipient)
        external
        payable
        returns (uint256 out)
    {
        require(!broken, "broken");
        uint8 d = MockERC20(token).decimals();
        out = (msg.value * ethUsd * (10 ** d)) / (tokenUsd[token] * 1e18);
        out = (out * qualityBps) / 10_000;
        if (honourMinOut) require(out >= minOut, "slippage");
        MockERC20(token).mint(recipient, out);
    }
}
