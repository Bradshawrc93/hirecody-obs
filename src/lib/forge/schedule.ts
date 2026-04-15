import type { ForgeScheduleCadence } from "./types";

/**
 * Compute the next scheduled run timestamp for an agent.
 *
 * schedule_time is a wall-clock "HH:MM:SS" in UTC. The next run is the
 * earliest instant strictly after `from` whose time-of-day matches
 * schedule_time and whose date matches the cadence.
 *
 * Daily:   next occurrence of that time, today or tomorrow.
 * Weekly:  same weekday as `from`'s current week anchor — we interpret
 *          "weekly" as "every 7 days from the first run", so we just add
 *          7d increments until we exceed `from`.
 * Monthly: same day-of-month. If the day doesn't exist in the next month
 *          (e.g. Jan 31 → Feb), fall back to the last day of that month.
 *
 * Returns null if cadence or time are missing.
 */
export function computeNextRun(
  cadence: ForgeScheduleCadence | null,
  scheduleTime: string | null,
  from: Date = new Date(),
): Date | null {
  if (!cadence || !scheduleTime) return null;

  const [hh, mm, ss] = scheduleTime.split(":").map((n) => parseInt(n, 10));
  if ([hh, mm, ss].some((n) => Number.isNaN(n))) return null;

  const base = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate(),
      hh,
      mm,
      ss,
    ),
  );

  if (cadence === "daily") {
    if (base.getTime() > from.getTime()) return base;
    return new Date(base.getTime() + 24 * 60 * 60 * 1000);
  }

  if (cadence === "weekly") {
    let next = base;
    while (next.getTime() <= from.getTime()) {
      next = new Date(next.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    return next;
  }

  // monthly
  if (base.getTime() > from.getTime()) return base;
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const desiredDay = base.getUTCDate();
  // Last day of next month
  const lastOfNext = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
  const actualDay = Math.min(desiredDay, lastOfNext);
  return new Date(Date.UTC(year, month + 1, actualDay, hh, mm, ss));
}
