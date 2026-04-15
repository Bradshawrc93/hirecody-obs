import type { ForgeScheduleCadence } from "./types";

/**
 * Compute the next scheduled run timestamp for an agent.
 *
 * schedule_time is a wall-clock "HH:MM:SS" in UTC. The next run is the
 * earliest instant strictly after `from` whose time-of-day matches
 * schedule_time and whose date matches the cadence.
 *
 * Daily:   next occurrence of that time, today or tomorrow.
 * Weekly:  if `dayOfWeek` (0=Sun..6=Sat) is supplied, the next occurrence
 *          of that weekday at that time; otherwise legacy behavior — the
 *          first multiple of 7 days past `from` at that time.
 * Monthly: if `dayOfMonth` (1..28) is supplied, the next occurrence of
 *          that day-of-month at that time; otherwise legacy behavior —
 *          same day-of-month as `from`, clamped to the last day of the
 *          target month when it doesn't exist.
 *
 * dayOfMonth is capped at 28 at the schema level so we never need to
 * short-month-fallback in the explicit-day path.
 *
 * Returns null if cadence or time are missing.
 */
export function computeNextRun(
  cadence: ForgeScheduleCadence | null,
  scheduleTime: string | null,
  from: Date = new Date(),
  dayOfWeek: number | null = null,
  dayOfMonth: number | null = null,
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
    if (dayOfWeek !== null && dayOfWeek >= 0 && dayOfWeek <= 6) {
      const currentDow = from.getUTCDay();
      const diff = (dayOfWeek - currentDow + 7) % 7;
      let next = new Date(
        Date.UTC(
          from.getUTCFullYear(),
          from.getUTCMonth(),
          from.getUTCDate() + diff,
          hh,
          mm,
          ss,
        ),
      );
      if (next.getTime() <= from.getTime()) {
        next = new Date(next.getTime() + 7 * 24 * 60 * 60 * 1000);
      }
      return next;
    }
    let next = base;
    while (next.getTime() <= from.getTime()) {
      next = new Date(next.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    return next;
  }

  // monthly
  if (dayOfMonth !== null && dayOfMonth >= 1 && dayOfMonth <= 28) {
    const year = from.getUTCFullYear();
    const month = from.getUTCMonth();
    let next = new Date(Date.UTC(year, month, dayOfMonth, hh, mm, ss));
    if (next.getTime() <= from.getTime()) {
      next = new Date(Date.UTC(year, month + 1, dayOfMonth, hh, mm, ss));
    }
    return next;
  }

  if (base.getTime() > from.getTime()) return base;
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const desiredDay = base.getUTCDate();
  const lastOfNext = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
  const actualDay = Math.min(desiredDay, lastOfNext);
  return new Date(Date.UTC(year, month + 1, actualDay, hh, mm, ss));
}
