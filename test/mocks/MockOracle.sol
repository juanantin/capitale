// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ICapitaleOracle} from "../../src/interfaces/ICapitaleOracle.sol";

contract MockOracle is ICapitaleOracle {
    uint256 public spot;
    uint256 public twap;
    uint256 public eth;
    mapping(address => uint256) public price;

    function setCapitale(uint256 spot_, uint256 twap_) external {
        spot = spot_;
        twap = twap_;
    }

    function setEthUsd(uint256 p) external {
        eth = p;
    }

    function setTokenUsd(address t, uint256 p) external {
        price[t] = p;
    }

    function capitaleUsdSpot() external view returns (uint256) {
        require(spot != 0, "no spot");
        return spot;
    }

    function capitaleUsdTwap() external view returns (uint256) {
        require(twap != 0, "no twap");
        return twap;
    }

    function ethUsd() external view returns (uint256) {
        require(eth != 0, "no eth");
        return eth;
    }

    function tokenUsd(address t) external view returns (uint256) {
        require(price[t] != 0, "no price");
        return price[t];
    }
}
