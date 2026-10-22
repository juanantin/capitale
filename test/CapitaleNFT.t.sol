// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CapitaleNFT} from "../src/CapitaleNFT.sol";
import {CapitalePricing} from "../src/CapitalePricing.sol";
import {ICapitalePricing} from "../src/interfaces/ICapitalePricing.sol";
import {ICapitaleVault} from "../src/interfaces/ICapitaleVault.sol";

contract CapitaleNFTTest is BaseTest {
    function setUp() public override {
        super.setUp();
        vm.warp(START);
    }

    function test_metadataAndMayor() public view {
        assertEq(nft.name(), "Capitale");
        assertEq(nft.symbol(), "PALAZZO");
        assertEq(nft.ownerOf(0), mayor);
        assertEq(nft.totalResidents(), 0);
        assertEq(nft.totalSupply(), 1);
        // No royalties (ERC-2981 not supported).
        assertFalse(nft.supportsInterface(0x2a55205a));
        assertTrue(nft.supportsInterface(0x780e9d63)); // enumerable
    }

    function test_mintSequentialAndBurnsToDead() public {
        uint256 dead0 = capitale.balanceOf(nft.DEAD());
        uint256 a = build(alice, 0);
        uint256 b = build(bob, 3);
        assertEq(a, 1);
        assertEq(b, 2);
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.totalResidents(), 2);
        // Early bird: $40 at $0.001 = 40,000 tokens each, sent to the dead address.
        assertEq(capitale.balanceOf(nft.DEAD()) - dead0, 80_000e18);
        assertEq(nft.totalBurned(), 80_000e18);
    }

    function test_plotsNearestFirstPerDistrict() public {
        build(alice, 1); // id 1, Roma plot 0
        build(alice, 2); // id 2, Napoli plot 0
        build(alice, 1); // id 3, Roma plot 1
        build(alice, 1); // id 4, Roma plot 2
        assertEq(nft.buildingOf(1).plot, 0);
        assertEq(nft.buildingOf(2).plot, 0);
        assertEq(nft.buildingOf(3).plot, 1);
        assertEq(nft.buildingOf(4).plot, 2);
        assertEq(nft.districtCount(1), 3);
        assertEq(nft.buildingOf(4).district, 1);
    }

    function test_districtAndStylePermanentAndValidated() public {
        uint256 id = build(alice, 3, 2, 0);
        CapitaleNFT.Building memory b = nft.buildingOf(id);
        assertEq(b.district, 3);
        assertEq(b.style, 2);
        assertTrue(b.earlyBird);
        capitale.mint(alice, 1e24);
        vm.startPrank(alice);
        capitale.approve(address(nft), type(uint256).max);
        vm.expectRevert(CapitaleNFT.BadDistrict.selector);
        nft.mint(4, 0, 0, type(uint256).max);
        vm.expectRevert(CapitaleNFT.BadStyle.selector);
        nft.mint(0, 3, 0, type(uint256).max);
        vm.stopPrank();
    }

    function test_maxPriceGuard() public {
        capitale.mint(alice, 1e24);
        vm.startPrank(alice);
        capitale.approve(address(nft), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(CapitaleNFT.PriceAboveMax.selector, 40_000e18, 39_999e18));
        nft.mint(0, 0, 0, 39_999e18);
        nft.mint(0, 0, 0, 40_000e18);
        vm.stopPrank();
    }

    function test_notStarted() public {
        vm.warp(START - 1);
        capitale.mint(alice, 1e24);
        vm.startPrank(alice);
        capitale.approve(address(nft), type(uint256).max);
        vm.expectRevert(CapitalePricing.NotStarted.selector);
        nft.mint(0, 0, 0, type(uint256).max);
        vm.stopPrank();
    }

    function test_invitesCosmetic() public {
        uint256 a = build(alice, 0);
        uint256 b = build(bob, 1, 0, a);
        assertEq(nft.buildingOf(a).invites, 1);
        assertEq(nft.buildingOf(b).inviter, a);
        // Self-invite and future/unknown inviters are ignored, not reverted.
        build(alice, 1, 0, a);
        build(carol, 1, 0, 999);
        assertEq(nft.buildingOf(a).invites, 1);
        // Inviting gives nothing financial: no balance changes for the inviter.
        assertEq(capitale.balanceOf(alice), 2 * 1_000_000e18 - 80_000e18);
    }

    function test_transferable() public {
        uint256 a = build(alice, 0);
        vm.prank(alice);
        nft.transferFrom(alice, bob, a);
        assertEq(nft.ownerOf(a), bob);
        assertEq(nft.tokenOfOwnerByIndex(bob, 0), a);
    }

    function test_tokenURI() public {
        uint256 a = build(alice, 2, 1, 0);
        string memory uri = nft.tokenURI(a);
        assertEq(_prefix(uri, 29), "data:application/json;base64,");
        nft.tokenURI(0); // Mayor renders too
        vm.expectRevert();
        nft.tokenURI(99);
    }

    function test_setVaultOnlyOnceByDeployer() public {
        vm.expectRevert(CapitaleNFT.VaultAlreadySet.selector);
        nft.setVault(ICapitaleVault(address(1)));
        CapitaleNFT n2 = new CapitaleNFT(IERC20(address(capitale)), ICapitalePricing(address(pricing)), mayor);
        vm.prank(alice);
        vm.expectRevert(CapitaleNFT.NotDeployer.selector);
        n2.setVault(ICapitaleVault(address(1)));
    }

    function test_mintRequiresVault() public {
        CapitaleNFT n2 = new CapitaleNFT(IERC20(address(capitale)), ICapitalePricing(address(pricing)), mayor);
        vm.expectRevert(CapitaleNFT.VaultNotSet.selector);
        n2.mint(0, 0, 0, 1);
    }

    function test_cityLocksAt3000() public {
        // Early bird: 300 sold out, then building pauses until the 6h window ends.
        buildMany(alice, 0, 300);
        capitale.mint(bob, 1e24);
        vm.startPrank(bob);
        capitale.approve(address(nft), type(uint256).max);
        vm.expectRevert(CapitalePricing.EarlyBirdSoldOut.selector);
        nft.mint(0, 0, 0, type(uint256).max);
        vm.stopPrank();

        goPublic();
        buildMany(alice, 1, 1000);
        buildMany(alice, 2, 1000);
        buildMany(alice, 3, 700);
        assertEq(nft.totalResidents(), 3000);
        assertTrue(nft.isLocked());
        vm.startPrank(bob);
        vm.expectRevert(CapitaleNFT.CityLocked.selector);
        nft.mint(0, 0, 0, type(uint256).max);
        vm.stopPrank();
        assertEq(vault.residents(), 3000);
    }

    function _prefix(string memory s, uint256 n) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory out = new bytes(n);
        for (uint256 i; i < n; ++i) {
            out[i] = b[i];
        }
        return string(out);
    }
}
