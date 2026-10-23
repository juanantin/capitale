// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TestKit, TestToken, TestSwapAdapter as TestKitAdapter} from "../src/testnet/TestKit.sol";
import {CapitaleNFT} from "../src/CapitaleNFT.sol";
import {CapitalePricing} from "../src/CapitalePricing.sol";
import {CapitaleVault, ICapitaleNFTView, IWETH} from "../src/CapitaleVault.sol";
import {ICapitaleOracle} from "../src/interfaces/ICapitaleOracle.sol";
import {ICapitalePricing} from "../src/interfaces/ICapitalePricing.sol";
import {ICapitaleVault} from "../src/interfaces/ICapitaleVault.sol";
import {ISwapAdapter} from "../src/interfaces/ISwapAdapter.sol";

/// The exact deploy sequence the website's "Deploy test city" button runs, end to end.
contract TestKitTest is Test {
    address juan = makeAddr("juan");

    function test_fullTestnetFlow() public {
        vm.warp(1_793_613_600);
        vm.startPrank(juan);
        TestKit kit = new TestKit();
        CapitalePricing pricing = new CapitalePricing(
            juan, ICapitaleOracle(address(kit.oracle())), block.timestamp, 300, 40e18, [uint256(52e18), 68e18, 88e18, 120e18]
        );
        CapitaleNFT nft = new CapitaleNFT(IERC20(address(kit.capitale())), ICapitalePricing(address(pricing)), juan);
        TestToken[4] memory r = kit.rewardTokens();
        ISwapAdapter a = ISwapAdapter(address(kit.adapter()));
        CapitaleVault vault = new CapitaleVault(
            juan,
            ICapitaleNFTView(address(nft)),
            pricing.earlyBirdEnd(),
            [IERC20(address(r[0])), IERC20(address(r[1])), IERC20(address(r[2])), IERC20(address(r[3]))],
            [a, a, a, a],
            ICapitaleOracle(address(kit.oracle())),
            juan,
            IWETH(address(0)),
            1,
            CapitaleVault.BuyParams({minOrder: 0.001 ether, maxOrder: 0.01 ether, minInterval: 10 minutes, rejectPause: 6 hours, maxDeviationBps: 400})
        );
        pricing.setNft(address(nft));
        nft.setVault(ICapitaleVault(address(vault)));

        // Get test tokens, approve once, build.
        kit.capitale().faucet();
        kit.capitale().approve(address(nft), type(uint256).max);
        uint256 id = nft.mint(1, 2, 0, type(uint256).max);
        assertEq(id, 1);
        assertEq(kit.capitale().balanceOf(juan), 1_000_000e18 - 40_000e18);
        vm.stopPrank();

        // Tax arrives, anyone buys; after early bird the pool is paid out and claimable.
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(vault).call{value: 0.01 ether}("");
        assertTrue(ok);
        assertTrue(vault.requestBuy());
        vm.warp(block.timestamp + 6 hours);
        vault.settle();
        assertGt(vault.pending(1, 1), 0);
        vm.prank(juan);
        vault.claim(1);
        assertGt(r[1].balanceOf(juan), 0);

        // Bad fill is rejected and pauses buying.
        TestKitAdapter adapter = kit.adapter();
        vm.prank(juan);
        adapter.setQuality(9_000);
        (ok,) = address(vault).call{value: 0.01 ether}("");
        vm.warp(block.timestamp + 10 minutes);
        assertFalse(vault.requestBuy());
        assertGt(vault.pausedUntil(), block.timestamp);
    }
}
