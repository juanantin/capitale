// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title RomeTime
/// @notice Weekly deadline "Sunday 20:00 Rome time", computed on-chain in UTC.
/// @dev Europe/Rome follows the EU rule: summer time (CEST, UTC+2) from the last Sunday of
///      March 01:00 UTC to the last Sunday of October 01:00 UTC; otherwise CET (UTC+1).
///      A Sunday-evening deadline is therefore 18:00 UTC in summer and 19:00 UTC in winter.
///      For a Sunday, "last Sunday of the month" (31-day months) means day >= 25.
library RomeTime {
    uint256 internal constant DAY = 1 days;

    /// @notice First deadline strictly after `t`.
    function nextDeadline(uint256 t) internal pure returns (uint256 deadline) {
        uint256 day = t / DAY;
        // 1970-01-01 was a Thursday, so (day + 4) % 7 == 0 on Sundays.
        uint256 sunday = day + (7 - ((day + 4) % 7)) % 7;
        deadline = sunday * DAY + deadlineHourUtc(sunday) * 1 hours;
        if (deadline <= t) {
            sunday += 7;
            deadline = sunday * DAY + deadlineHourUtc(sunday) * 1 hours;
        }
    }

    /// @notice 18 when the Sunday `dayIndex` (days since epoch) is in Rome summer time, else 19.
    function deadlineHourUtc(uint256 dayIndex) internal pure returns (uint256) {
        (, uint256 m, uint256 d) = civilFromDays(dayIndex);
        bool summer = (m >= 4 && m <= 9) || (m == 3 && d >= 25) || (m == 10 && d < 25);
        return summer ? 18 : 19;
    }

    /// @dev Howard Hinnant's days-to-civil algorithm, for days since 1970-01-01.
    function civilFromDays(uint256 z) internal pure returns (uint256 y, uint256 m, uint256 d) {
        z += 719468;
        uint256 era = z / 146097;
        uint256 doe = z - era * 146097;
        uint256 yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        y = yoe + era * 400;
        uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        uint256 mp = (5 * doy + 2) / 153;
        d = doy - (153 * mp + 2) / 5 + 1;
        m = mp < 10 ? mp + 3 : mp - 9;
        if (m <= 2) y += 1;
    }
}
