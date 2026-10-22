// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {CapitaleVault} from "../src/CapitaleVault.sol";
import {ISwapAdapter} from "../src/interfaces/ISwapAdapter.sol";

/// Tax split, buy rules, rejection and pauses, ops payout.
contract CapitaleVaultBuyTest is BaseTest {
    function setUp() public override {
        super.setUp();
        goPublic();
        build(alice, 0);
    }

    function test_taxSplit70_15_15() public {
        payTax(1 ether);
        vault.settle();
        assertEq(vault.residentsEth(), 0.7 ether);
        assertEq(vault.streetEth(), 0.15 ether);
        assertEq(vault.opsEth(), 0.15 ether);
        assertEq(vault.totalTaxEth(), 1 ether);
    }

    function test_taxSplitNoDust(uint96 amount) public {
        payTax(amount);
        vault.settle();
        assertEq(vault.residentsEth() + vault.streetEth() + vault.opsEth(), amount);
    }

    function test_payOpsAnyone() public {
        payTax(1 ether);
        vm.prank(bob);
        vault.payOps();
        assertEq(opsSafe.balance, 0.15 ether);
        assertEq(vault.opsEth(), 0);
        vm.expectRevert(CapitaleVault.NothingToPay.selector);
        vault.payOps();
    }

    function test_buyBelowMinimumSkipped() public {
        payTax(0.1 ether); // 0.085 ETH to buy < 0.1 minimum
        assertFalse(vault.requestBuy());
        assertEq(vault.totalPurchases(), 0);
        payTax(0.1 ether); // 0.17 ETH
        assertTrue(vault.requestBuy());
        assertEq(vault.totalPurchases(), 1);
    }

    function test_buyCappedAtMaxOrderAndRemainderWaits() public {
        payTax(1 ether); // 0.85 ETH to buy
        vm.prank(bob); // anyone can trigger
        assertTrue(vault.requestBuy());
        assertEq(vault.residentsEth() + vault.streetEth(), 0.25 ether);
        assertEq(rewards[0].balanceOf(address(vault)), fill(0, 0.6 ether));
        // Interval: next order no sooner than 10 minutes.
        vm.warp(block.timestamp + 10 minutes - 1);
        assertFalse(vault.requestBuy());
        vm.warp(block.timestamp + 1);
        assertTrue(vault.requestBuy());
        assertEq(vault.residentsEth() + vault.streetEth(), 0);
    }

    function test_buySplitsResidentsAndStreet() public {
        payTax(0.2 ether); // 0.14 residents + 0.03 street
        vault.requestBuy();
        uint256 out = fill(0, 0.17 ether);
        uint256 outRes = out * 0.14 ether / 0.17 ether;
        assertEq(vault.pending(1, 0), outRes); // single building gets the whole residents share
        assertEq(vault.streetPool(0), out - outRes);
        assertEq(vault.totalBoughtUsd(), 0.17 ether * 3000);
    }

    function test_rejectionKeepsEthAndPauses6h() public {
        payTax(1 ether);
        adapter.setQuality(9_500); // 5% worse than reference > 4% allowed
        vm.expectEmit(false, false, false, false, address(vault));
        emit CapitaleVault.BuyRejected(0, 0, 0, 0, "");
        assertFalse(vault.requestBuy());
        assertEq(vault.residentsEth() + vault.streetEth(), 0.85 ether);
        assertEq(address(vault).balance, 1 ether);
        assertEq(vault.pausedUntil(), block.timestamp + 6 hours);

        adapter.setQuality(10_000);
        vm.warp(block.timestamp + 6 hours - 1);
        assertFalse(vault.requestBuy());
        vm.warp(block.timestamp + 1);
        assertTrue(vault.requestBuy());
    }

    function test_withinDeviationAccepted() public {
        payTax(1 ether);
        adapter.setQuality(9_601);
        assertTrue(vault.requestBuy());
    }

    function test_adapterIgnoringMinOutStillRejected() public {
        payTax(1 ether);
        adapter.setHonourMinOut(false);
        adapter.setQuality(5_000);
        assertFalse(vault.requestBuy());
        assertEq(rewards[0].balanceOf(address(vault)), 0);
        assertEq(vault.residentsEth() + vault.streetEth(), 0.85 ether);
    }

    function test_brokenOrMissingAdapterRejected() public {
        payTax(1 ether);
        adapter.setBroken(true);
        assertFalse(vault.requestBuy());
        vm.warp(block.timestamp + 6 hours);
        vm.prank(admin);
        vault.setAdapter(0, ISwapAdapter(address(0)));
        assertFalse(vault.requestBuy());
        assertEq(address(vault).balance, 1 ether);
    }

    function test_buysCurrentWeekToken() public {
        // Week 0 token is STOCKIFY (0). Vote STONKEX for next week.
        vm.prank(alice);
        vault.vote(ids1(1), 1);
        vm.warp(FIRST_DEADLINE);
        payTax(0.2 ether);
        vault.requestBuy(); // settles first: buys STONKEX
        assertEq(vault.currentToken(), 1);
        assertGt(rewards[1].balanceOf(address(vault)), 0);
        assertEq(rewards[0].balanceOf(address(vault)), 0);
    }

    function test_decimalsHandled() public {
        vm.prank(alice);
        vault.vote(ids1(1), 3); // TEMU has 6 decimals
        vm.warp(FIRST_DEADLINE);
        payTax(0.2 ether);
        assertTrue(vault.requestBuy());
        assertEq(rewards[3].balanceOf(address(vault)), fill(3, 0.17 ether));
        assertEq(fill(3, 0.17 ether), 510e6); // 0.17 ETH * $3000 / $1
    }

    function test_schedulerIdleAfter24hAndRestartedByRequest() public {
        assertTrue(vault.schedulerActive());
        vm.warp(block.timestamp + 24 hours + 1);
        assertFalse(vault.schedulerActive());
        vm.prank(carol);
        vault.requestBuy(); // nothing to buy, but restarts the scheduler
        assertTrue(vault.schedulerActive());
    }

    function test_executeBuyOnlySelf() public {
        vm.expectRevert(CapitaleVault.NotSelf.selector);
        vault.executeBuy(0, 1, 1, 0, 0);
    }

    function test_refundedEthBecomesTax() public {
        payTax(1 ether);
        vault.settle();
        // ETH sent directly (e.g. a router refund) is treated as new tax, never lost.
        payTax(0.1 ether);
        vault.settle();
        assertEq(vault.totalTaxEth(), 1.1 ether);
    }
}
