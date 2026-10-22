// Same rule as contracts/src/libraries/RomeTime.sol: the week ends Sunday 20:00 Rome time,
// i.e. 18:00 UTC in summer (CEST) and 19:00 UTC in winter (CET).

const DAY = 86_400;

function civilFromDays(z0: number): [number, number, number] {
  const z = z0 + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  let y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  if (m <= 2) y += 1;
  return [y, m, d];
}

function deadlineHourUtc(dayIndex: number): number {
  const [, m, d] = civilFromDays(dayIndex);
  const summer = (m >= 4 && m <= 9) || (m === 3 && d >= 25) || (m === 10 && d < 25);
  return summer ? 18 : 19;
}

/** Next weekly deadline strictly after `t` (unix seconds). */
export function nextDeadline(t: number): number {
  const day = Math.floor(t / DAY);
  let sunday = day + ((7 - ((day + 4) % 7)) % 7);
  let dl = sunday * DAY + deadlineHourUtc(sunday) * 3600;
  if (dl <= t) {
    sunday += 7;
    dl = sunday * DAY + deadlineHourUtc(sunday) * 3600;
  }
  return dl;
}

export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / DAY);
  const h = Math.floor((s % DAY) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d > 0 ? `${d}d ` : ""}${pad(h)}:${pad(m)}:${pad(sec)}`;
}
