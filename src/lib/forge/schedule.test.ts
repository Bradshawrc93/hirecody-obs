import { describe, it, expect } from "vitest";
import { computeNextRun } from "./schedule";

describe("computeNextRun", () => {
  it("returns null when cadence or time missing", () => {
    expect(computeNextRun(null, "09:00:00")).toBeNull();
    expect(computeNextRun("daily", null)).toBeNull();
  });

  it("daily: schedules today if time hasn't passed yet", () => {
    const from = new Date("2026-04-14T06:00:00Z");
    const next = computeNextRun("daily", "09:00:00", from);
    expect(next?.toISOString()).toBe("2026-04-14T09:00:00.000Z");
  });

  it("daily: schedules tomorrow if time already passed today", () => {
    const from = new Date("2026-04-14T10:00:00Z");
    const next = computeNextRun("daily", "09:00:00", from);
    expect(next?.toISOString()).toBe("2026-04-15T09:00:00.000Z");
  });

  it("weekly: first occurrence at/after the boundary", () => {
    const from = new Date("2026-04-14T10:00:00Z");
    const next = computeNextRun("weekly", "09:00:00", from);
    // Today's 9am already passed → jump 7 days
    expect(next?.toISOString()).toBe("2026-04-21T09:00:00.000Z");
  });

  it("monthly: schedules next month same day", () => {
    const from = new Date("2026-04-14T10:00:00Z");
    const next = computeNextRun("monthly", "09:00:00", from);
    expect(next?.toISOString()).toBe("2026-05-14T09:00:00.000Z");
  });

  it("monthly: clamps to last day when target day doesn't exist", () => {
    const from = new Date("2026-01-31T10:00:00Z");
    const next = computeNextRun("monthly", "09:00:00", from);
    // Feb 2026 has 28 days
    expect(next?.toISOString()).toBe("2026-02-28T09:00:00.000Z");
  });
});
