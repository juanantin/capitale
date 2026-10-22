// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {CapitaleVault} from "../src/CapitaleVault.sol";

/// Dividends, early-bird pool, claims (incl. a failing token), height levels.
contract CapitaleVaultRewardsTest is BaseTest {
    function _buy(uint256 eth) internal {
        payTax(eth);
        vm.warp(block.timestamp + 10 minutes);
        require(vault.requestBuy(), "buy failed");
    }

    function _residentsOut(uint8 t, uint256 tax) internal view returns (uint256) {
        uint256 toBuy = tax - tax * 1500 / 10_000; // 85%
        uint256 out = fill(t, toBuy);
        return out * (tax * 7000 / 10_000) / toBuy;
    }

    function test_splitEquallyAmongExistingBuildings() public {
        goPublic();
        build(alice, 0);
        build(bob, 1);
        _buy(0.2 ether);
        uint256 res = _residentsOut(0, 0.2 ether);
        assertEq(vault.pending(1, 0), res / 2);
        assertEq(vault.pending(2, 0), res / 2);
        // A later building gets nothing from earlier purchases.
        build(carol, 2);
        assertEq(vault.pending(3, 0), 0);
        _buy(0.2 ether);
        assertEq(vault.pending(3, 0), res / 3);
        assertApproxEqAbs(vault.pending(1, 0), res / 2 + res / 3, 1);
    }

    function test_mayorGetsNothing() public {
        goPublic();
        build(alice, 0);
        _buy(0.2 ether);
        assertEq(vault.pending(0, 0), 0);
        vm.prank(mayor);
        vm.expectRevert(CapitaleVault.MayorExcluded.selector);
        vault.claim(0);
    }

    function test_noBuildingsCarriesOver() public {
        goPublic();
        _buy(0.2 ether);
        uint256 res = _residentsOut(0, 0.2 ether);
        assertEq(vault.carry(0), res);
        build(alice, 0);
        _buy(0.2 ether);
        assertApproxEqAbs(vault.pending(1, 0), 2 * res, 1);
    }

    function test_earlyBirdPool() public {
        vm.warp(START);
        build(alice, 0); // early bird
        build(bob, 1); // early bird
        _buy(0.2 ether); // during early bird: goes to the early-bird pool
        uint256 res = _residentsOut(0, 0.2 ether);
        assertEq(vault.earlyBirdPool(0), res);
        assertEq(vault.pending(1, 0), 0);

        goPublic();
        build(carol, 2); // not early bird, built after the window: settles the pool first
        assertTrue(vault.earlyBirdFinalized());
        assertEq(vault.pending(1, 0), res / 2);
        assertEq(vault.pending(2, 0), res / 2);
        assertEq(vault.pending(3, 0), 0);
    }

    function test_earlyBirdBuildingsShareEarlyBirdPoolEvenIfBoughtLate() public {
        vm.warp(START);
        _buy(0.2 ether); // bought before anyone built
        build(alice, 0);
        goPublic();
        vault.settle();
        assertEq(vault.pending(1, 0), _residentsOut(0, 0.2 ether));
    }

    function test_claimPaysAllFourTokens() public {
        goPublic();
        build(alice, 0);
        for (uint8 t; t < 4; ++t) {
            vm.prank(alice);
            vault.vote(ids1(1), t);
            vm.warp(vault.weekEnd());
            _buy(0.2 ether); // settles first, so it buys token t
        }
        uint256[4] memory p = vault.pendingAll(1);
        vm.prank(alice);
        vault.claim(1);
        for (uint8 t; t < 4; ++t) {
            assertGt(p[t], 0);
            assertEq(rewards[t].balanceOf(alice), p[t]);
            assertEq(vault.pending(1, t), 0);
        }
    }

    function test_claimSkipsFailingTokenAndKeepsItClaimable() public {
        goPublic();
        build(alice, 0);
        _buy(0.2 ether); // STOCKIFY
        vm.prank(alice);
        vault.vote(ids1(1), 1);
        vm.warp(vault.weekEnd());
        _buy(0.2 ether); // STONKEX
        uint256 p0 = vault.pending(1, 0);
        uint256 p1 = vault.pending(1, 1);

        rewards[0].setPaused(true);
        vm.prank(alice);
        vault.claim(1);
        assertEq(rewards[0].balanceOf(alice), 0);
        assertEq(rewards[1].balanceOf(alice), p1);
        assertEq(vault.pending(1, 0), p0); // still claimable

        rewards[0].setPaused(false);
        vm.prank(alice);
        vault.claim(1);
        assertEq(rewards[0].balanceOf(alice), p0);
    }

    function test_claimManyAndOwnership() public {
        goPublic();
        build(alice, 0);
        build(alice, 1);
        build(bob, 1);
        _buy(0.2 ether);
        uint256 each = vault.pending(1, 0);
        vm.prank(alice);
        vault.claimMany(ids2(1, 2));
        assertEq(rewards[0].balanceOf(alice), 2 * each);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CapitaleVault.NotBuildingOwner.selector, 3));
        vault.claim(3);
    }

    function test_rewardsFollowTheNft() public {
        goPublic();
        build(alice, 0);
        _buy(0.2 ether);
        uint256 p = vault.pending(1, 0);
        vm.prank(alice);
        nft.transferFrom(alice, bob, 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CapitaleVault.NotBuildingOwner.selector, 1));
        vault.claim(1);
        vm.prank(bob);
        vault.claim(1);
        assertEq(rewards[0].balanceOf(bob), p);
    }

    function test_pendingUsdAtPurchaseTimeValue() public {
        goPublic();
        build(alice, 0);
        _buy(0.2 ether); // 0.17 ETH * $3000 = $510 bought; residents 70/85 of it
        uint256 expected = uint256(510e18) * 0.14 ether / 0.17 ether;
        assertApproxEqAbs(vault.pendingUsd(1), expected, 1);
        // Later price moves do not change purchase-time value.
        oracle.setTokenUsd(address(rewards[0]), 5e18);
        assertApproxEqAbs(vault.pendingUsd(1), expected, 1);
    }

    function test_levels() public view {
        assertEq(vault.levelForUsd(0), 1);
        assertEq(vault.levelForUsd(5e18 - 1), 1);
        assertEq(vault.levelForUsd(5e18), 2);
        assertEq(vault.levelForUsd(20e18), 3);
        assertEq(vault.levelForUsd(50e18), 4);
        assertEq(vault.levelForUsd(100e18), 5);
        assertEq(vault.levelForUsd(150e18 - 1), 5);
        assertEq(vault.levelForUsd(150e18), 6);
        assertEq(vault.levelForUsd(1_100e18), 25);
    }

    function test_heightGrowsWithClaimsAndFollowsNft() public {
        goPublic();
        build(alice, 0);
        _buy(0.2 ether); // ~$420 to the only building
        assertEq(vault.levelOf(1), 1); // pending does not count, only claimed
        vm.prank(alice);
        vault.claim(1);
        uint256 usd = vault.claimedUsd(1);
        assertApproxEqAbs(usd, 420e18, 1);
        assertEq(vault.levelOf(1), 5 + (usd - 100e18) / 50e18);
        vm.prank(alice);
        nft.transferFrom(alice, bob, 1);
        assertEq(vault.levelOf(1), 5 + (usd - 100e18) / 50e18);
    }

    function testFuzz_dividendsNeverExceedPurchases(uint8 nBuildings, uint96 tax) public {
        goPublic();
        nBuildings = uint8(bound(nBuildings, 1, 40));
        tax = uint96(bound(tax, 0.2 ether, 50 ether));
        for (uint256 i; i < nBuildings; ++i) {
            build(i % 2 == 0 ? alice : bob, uint8(i % 4));
        }
        payTax(tax);
        for (uint256 k; k < 100 && vault.residentsEth() + vault.streetEth() >= 0.1 ether; ++k) {
            vm.warp(block.timestamp + 10 minutes);
            vault.requestBuy();
        }
        vm.warp(vault.weekEnd());
        vault.settle();
        uint256 sum;
        for (uint256 id = 1; id <= nBuildings; ++id) {
            sum += vault.pending(id, 0);
        }
        assertLe(sum, rewards[0].balanceOf(address(vault)));
        // Only rounding dust and carry stay behind.
        assertApproxEqAbs(sum + vault.carry(0), rewards[0].balanceOf(address(vault)), nBuildings * 2);
    }
}
