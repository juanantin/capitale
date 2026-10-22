// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {CapitaleVault} from "../src/CapitaleVault.sol";

/// Pricing / protection changes go through a 48h public timelock.
contract TimelockTest is BaseTest {
    TimelockController internal tl;
    address internal safe = makeAddr("adminSafe");

    function setUp() public override {
        super.setUp();
        address[] memory list = new address[](1);
        list[0] = safe;
        tl = new TimelockController(48 hours, list, list, address(0));
        vm.startPrank(admin);
        vault.transferOwnership(address(tl));
        pricing.transferOwnership(address(tl));
        vm.stopPrank();
        bytes memory accept = abi.encodeCall(vault.acceptOwnership, ());
        vm.startPrank(safe);
        tl.schedule(address(vault), 0, accept, 0, 0, 48 hours);
        tl.schedule(address(pricing), 0, abi.encodeCall(pricing.acceptOwnership, ()), 0, 0, 48 hours);
        vm.warp(block.timestamp + 48 hours);
        tl.execute(address(vault), 0, accept, 0, 0);
        tl.execute(address(pricing), 0, abi.encodeCall(pricing.acceptOwnership, ()), 0, 0);
        vm.stopPrank();
    }

    function test_changeNeeds48h() public {
        assertEq(vault.owner(), address(tl));
        CapitaleVault.BuyParams memory p = defaultParams();
        p.minOrder = 0.2 ether;
        bytes memory call = abi.encodeCall(vault.setBuyParams, (p));
        vm.startPrank(safe);
        vm.expectRevert();
        tl.schedule(address(vault), 0, call, 0, bytes32("x"), 47 hours);
        tl.schedule(address(vault), 0, call, 0, bytes32("x"), 48 hours);
        vm.warp(block.timestamp + 48 hours - 1);
        vm.expectRevert();
        tl.execute(address(vault), 0, call, 0, bytes32("x"));
        vm.warp(block.timestamp + 1);
        tl.execute(address(vault), 0, call, 0, bytes32("x"));
        vm.stopPrank();
        (uint128 minOrder,,,,) = vault.buyParams();
        assertEq(minOrder, 0.2 ether);
    }

    function test_safeCannotBypassTimelock() public {
        vm.prank(safe);
        vm.expectRevert();
        vault.setBuyParams(defaultParams());
    }
}
