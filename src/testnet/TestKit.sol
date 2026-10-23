// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// TESTNET ONLY. Stand-ins for $CAPITALE, the four reward tokens, the price feed and the
// Uniswap route, so the whole city can be exercised on Base Sepolia. Never deploy to mainnet.

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICapitaleOracle} from "../interfaces/ICapitaleOracle.sol";
import {ISwapAdapter} from "../interfaces/ISwapAdapter.sol";

/// @notice Free-to-mint test token. `faucet()` gives anyone a fixed amount.
contract TestToken is ERC20 {
    uint8 private immutable _dec;
    uint256 public immutable faucetAmount;

    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 faucetAmount_)
        ERC20(name_, symbol_)
    {
        _dec = decimals_;
        faucetAmount = faucetAmount_;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function faucet() external {
        _mint(msg.sender, faucetAmount);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Price feed whose prices the tester sets by hand (stands in for the Uniswap TWAPs).
contract TestOracle is ICapitaleOracle, Ownable {
    uint256 public spot;
    uint256 public twap;
    uint256 public eth;
    mapping(address => uint256) public price;

    event PricesSet();

    constructor(address owner_) Ownable(owner_) {}

    function setCapitale(uint256 spot_, uint256 twap_) external onlyOwner {
        spot = spot_;
        twap = twap_;
        emit PricesSet();
    }

    function setEthUsd(uint256 p) external onlyOwner {
        eth = p;
        emit PricesSet();
    }

    function setTokenUsd(address token, uint256 p) external onlyOwner {
        price[token] = p;
        emit PricesSet();
    }

    function capitaleUsdSpot() external view returns (uint256) {
        require(spot != 0, "no price");
        return spot;
    }

    function capitaleUsdTwap() external view returns (uint256) {
        require(twap != 0, "no price");
        return twap;
    }

    function ethUsd() external view returns (uint256) {
        require(eth != 0, "no price");
        return eth;
    }

    function tokenUsd(address token) external view returns (uint256) {
        require(price[token] != 0, "no price");
        return price[token];
    }
}

/// @notice "Buys" a reward token by minting it at the oracle price. `qualityBps` below 10000
///         simulates a bad fill, to test the 4% rejection and the 6h pause.
contract TestSwapAdapter is ISwapAdapter, Ownable {
    TestOracle public immutable oracle;
    uint256 public qualityBps = 10_000;

    constructor(TestOracle oracle_, address owner_) Ownable(owner_) {
        oracle = oracle_;
    }

    function setQuality(uint256 q) external onlyOwner {
        require(q > 0 && q <= 20_000, "bad quality");
        qualityBps = q;
    }

    function swapEthForToken(address token, uint256 minOut, address recipient)
        external
        payable
        returns (uint256 out)
    {
        uint8 d = TestToken(token).decimals();
        out = (msg.value * oracle.ethUsd() * (10 ** d)) / (oracle.tokenUsd(token) * 1e18);
        out = (out * qualityBps) / 10_000;
        require(out >= minOut, "slippage");
        TestToken(token).mint(recipient, out);
    }
}

/// @notice Deploys every test stand-in in one transaction, with realistic starting prices.
contract TestKit {
    TestToken public immutable capitale;
    TestToken[4] public rewards;
    TestOracle public immutable oracle;
    TestSwapAdapter public immutable adapter;

    constructor() {
        capitale = new TestToken("Capitale (test)", "tCAPITALE", 18, 1_000_000e18);
        rewards[0] = new TestToken("Stockify (test)", "tSTFY", 18, 0);
        rewards[1] = new TestToken("Stonkex (test)", "tSTONKEX", 18, 0);
        rewards[2] = new TestToken("DGuy (test)", "tDGUY", 18, 0);
        rewards[3] = new TestToken("Temu (test)", "tTEMU", 18, 0);
        oracle = new TestOracle(address(this));
        oracle.setCapitale(0.001e18, 0.001e18); // $0.001
        oracle.setEthUsd(3000e18);
        oracle.setTokenUsd(address(rewards[0]), 0.42e18);
        oracle.setTokenUsd(address(rewards[1]), 3.1e18);
        oracle.setTokenUsd(address(rewards[2]), 0.0061e18);
        oracle.setTokenUsd(address(rewards[3]), 1.02e18);
        oracle.transferOwnership(msg.sender);
        adapter = new TestSwapAdapter(oracle, msg.sender);
    }

    function rewardTokens() external view returns (TestToken[4] memory) {
        return rewards;
    }
}
