// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RomeTime} from "../src/libraries/RomeTime.sol";

contract RomeTimeTest is Test {
    function test_winterDeadlineIs19Utc() public pure {
        // Monday 2026-11-02 10:00 UTC -> Sunday 2026-11-08 19:00 UTC (20:00 CET)
        assertEq(RomeTime.nextDeadline(1793613600), 1794164400);
    }

    function test_summerDeadlineIs18Utc() public pure {
        // Wednesday 2026-07-01 12:00 UTC -> Sunday 2026-07-05 18:00 UTC (20:00 CEST)
        assertEq(RomeTime.nextDeadline(1782907200), 1783274400);
    }

    function test_dstStartSunday() public pure {
        // Last Sunday of March 2026 (29th): clocks went forward at 01:00 UTC -> 18:00 UTC
        assertEq(RomeTime.nextDeadline(1774699200), 1774807200);
        // The Sunday before (22 March) is still winter -> 19:00 UTC
        assertEq(RomeTime.nextDeadline(1773576000 + 2 days), 1774206000);
    }

    function test_dstEndSunday() public pure {
        // Last Sunday of October 2026 (25th): back to CET -> 19:00 UTC
        assertEq(RomeTime.nextDeadline(1792843200), 1792954800);
        // 18 October is still summer -> 18:00 UTC
        assertEq(RomeTime.nextDeadline(1792346400 - 1), 1792346400);
    }

    function test_exactlyAtDeadlineMovesToNextWeek() public pure {
        assertEq(RomeTime.nextDeadline(1794164400), 1794164400 + 7 days);
        assertEq(RomeTime.nextDeadline(1794164400 - 1), 1794164400);
    }

    function test_civil() public pure {
        (uint256 y, uint256 m, uint256 d) = RomeTime.civilFromDays(20759);
        assertEq(y, 2026);
        assertEq(m, 11);
        assertEq(d, 2);
        (y, m, d) = RomeTime.civilFromDays(11016); // 2000-02-29
        assertEq(y, 2000);
        assertEq(m, 2);
        assertEq(d, 29);
    }

    function testFuzz_deadlineIsNextSundayEvening(uint256 t) public pure {
        t = bound(t, 1, 4_102_444_800); // up to 2100
        uint256 dl = RomeTime.nextDeadline(t);
        assertGt(dl, t);
        assertLe(dl, t + 7 days + 1 hours);
        uint256 day = dl / 1 days;
        assertEq((day + 4) % 7, 0, "not a Sunday");
        uint256 h = (dl % 1 days) / 1 hours;
        assertTrue(h == 18 || h == 19);
        assertEq(dl % 1 hours, 0);
    }
}
