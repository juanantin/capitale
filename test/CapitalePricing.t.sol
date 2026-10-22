// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {CapitalePricing} from "../src/CapitalePricing.sol";
import {ICapitaleOracle} from "../src/interfaces/ICapitaleOracle.sol";

contract CapitalePricingTest is BaseTest {
    function setUp() public override {
        super.setUp();
        vm.warp(START);
    }

    function test_earlyBirdWindow() public {
        assertTrue(pricing.isEarlyBird());
        assertEq(pricing.usdFor(1), 40e18);
        assertEq(pricing.usdFor(300), 40e18);
        vm.expectRevert(CapitalePricing.EarlyBirdSoldOut.selector);
        pricing.usdFor(301);
        vm.warp(START + 6 hours - 1);
        assertTrue(pricing.isEarlyBird());
        vm.warp(START + 6 hours);
        assertFalse(pricing.isEarlyBird());
    }

    function test_tiers() public {
        goPublic();
        assertEq(pricing.usdFor(1), 52e18); // unsold early-bird numbers go at tier 1
        assertEq(pricing.usdFor(800), 52e18);
        assertEq(pricing.usdFor(801), 68e18);
        assertEq(pricing.usdFor(1500), 68e18);
        assertEq(pricing.usdFor(1501), 88e18);
        assertEq(pricing.usdFor(2300), 88e18);
        assertEq(pricing.usdFor(2301), 120e18);
        assertEq(pricing.usdFor(3000), 120e18);
        vm.expectRevert(CapitalePricing.CityLocked.selector);
        pricing.usdFor(3001);
    }

    function test_tokensToBurnIsUsdOverPrice() public {
        goPublic();
        (uint256 tokens, uint256 usd) = pricing.quote(1);
        assertEq(usd, 52e18);
        assertEq(tokens, 52_000e18); // $52 / $0.001
        // Rounds up: never burns less than the USD target.
        oracle.setCapitale(3e15, 3e15);
        (tokens,) = pricing.quote(1);
        assertEq(tokens, 17_333_333_333_333_333_333_334);
        assertGe(tokens * 3e15 / 1e18, 52e18);
    }

    function test_publicUsesLowerOfSpotAndTwap() public {
        goPublic();
        oracle.setCapitale(2e15, 1e15); // pumped spot: TWAP (lower) is used -> more tokens
        (uint256 tokens,) = pricing.quote(1);
        assertEq(tokens, 52_000e18);
        oracle.setCapitale(0.5e15, 1e15); // dumped spot: spot (lower) is used
        (tokens,) = pricing.quote(1);
        assertEq(tokens, 104_000e18);
    }

    function test_earlyBirdReferenceFollowsDropsInstantly() public {
        build(alice, 0); // sets reference to $0.001
        assertEq(pricing.refPrice(), CAP_PRICE);
        oracle.setCapitale(0.8e15, 1e15);
        (uint256 tokens,) = pricing.quote(2);
        assertEq(tokens, 50_000e18); // $40 / $0.0008
        build(alice, 0);
        assertEq(pricing.refPrice(), 0.8e15);
    }

    function test_earlyBirdReferenceRisesOnlyAfter60s() public {
        build(alice, 0);
        oracle.setCapitale(2e15, 1e15); // pump
        build(alice, 0); // starts the 60s clock, still old reference
        assertEq(pricing.refPrice(), CAP_PRICE);
        assertEq(pricing.riseSince(), block.timestamp);
        vm.warp(block.timestamp + 59);
        (uint256 tokens,) = pricing.quote(3);
        assertEq(tokens, 40_000e18);
        vm.warp(block.timestamp + 1);
        (tokens,) = pricing.quote(3);
        assertEq(tokens, 20_000e18); // rise held for 60s: adopted
        pricing.poke();
        assertEq(pricing.refPrice(), 2e15);
    }

    function test_earlyBirdRiseAdoptsLowestLevelSeenDuringHold() public {
        build(alice, 0);
        oracle.setCapitale(2e15, 1e15);
        pricing.poke();
        vm.warp(block.timestamp + 30);
        oracle.setCapitale(1.5e15, 1e15);
        pricing.poke();
        vm.warp(block.timestamp + 30);
        oracle.setCapitale(3e15, 1e15);
        pricing.poke();
        assertEq(pricing.refPrice(), 1.5e15);
    }

    function test_earlyBirdRiseResetByDrop() public {
        build(alice, 0);
        oracle.setCapitale(2e15, 1e15);
        pricing.poke();
        vm.warp(block.timestamp + 30);
        oracle.setCapitale(0.9e15, 1e15); // drop below reference cancels the rise
        pricing.poke();
        assertEq(pricing.refPrice(), 0.9e15);
        assertEq(pricing.riseSince(), 0);
        oracle.setCapitale(2e15, 1e15);
        pricing.poke();
        vm.warp(block.timestamp + 59);
        pricing.poke();
        assertEq(pricing.refPrice(), 0.9e15);
    }

    function test_firstReferenceNeverAboveTwap() public {
        oracle.setCapitale(5e15, 1e15); // pre-launch pump
        build(alice, 0);
        assertEq(pricing.refPrice(), 1e15);
    }

    function test_quoteAndUpdateOnlyNft() public {
        vm.expectRevert(CapitalePricing.NotNft.selector);
        pricing.quoteAndUpdate(1);
    }

    function test_zeroPriceReverts() public {
        goPublic();
        oracle.setCapitale(0, 0);
        vm.expectRevert();
        pricing.quote(1);
    }

    function test_adminOnlyOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        pricing.setOracle(ICapitaleOracle(address(1)));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        pricing.setUsdTargets(1, [uint256(1), 1, 1, 1]);
        vm.prank(admin);
        vm.expectRevert(CapitalePricing.NftAlreadySet.selector);
        pricing.setNft(address(2));
        vm.prank(admin);
        pricing.setUsdTargets(41e18, [uint256(53e18), 69e18, 89e18, 121e18]);
        assertEq(pricing.earlyBirdUsd(), 41e18);
    }

    function testFuzz_quoteCoversUsdTarget(uint256 price, uint256 id) public {
        goPublic();
        price = bound(price, 1e6, 1e24);
        id = bound(id, 1, 3000);
        oracle.setCapitale(price, price);
        (uint256 tokens, uint256 usd) = pricing.quote(id);
        assertGe(tokens * price / 1e18 + 1, usd); // burn value >= target (up to 1 wei rounding)
        assertLe((tokens - 1) * price, usd * 1e18); // and not more than one unit above
    }

    function testFuzz_priceNonDecreasingInId(uint256 a, uint256 b) public {
        goPublic();
        a = bound(a, 1, 3000);
        b = bound(b, a, 3000);
        assertLe(pricing.usdFor(a), pricing.usdFor(b));
    }
}
