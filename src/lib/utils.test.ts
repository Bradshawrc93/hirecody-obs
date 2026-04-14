import { describe, it, expect } from "vitest";
import {
  formatUsd,
  formatCompact,
  formatMs,
  appColor,
  startOfMonthIso,
  providerColor,
} from "./utils";

describe("formatUsd", () => {
  it("returns $0.00 for null/undefined/NaN", () => {
    expect(formatUsd(null)).toBe("$0.00");
    expect(formatUsd(undefined)).toBe("$0.00");
    expect(formatUsd(Number.NaN)).toBe("$0.00");
  });

  it("uses 0 decimals for |value| >= 100", () => {
    expect(formatUsd(1234)).toBe("$1234");
    expect(formatUsd(100)).toBe("$100");
  });

  it("uses 2 decimals for 1 <= |value| < 100", () => {
    expect(formatUsd(12.345)).toBe("$12.35");
    expect(formatUsd(1)).toBe("$1.00");
  });

  it("uses 3 decimals for 0.01 <= |value| < 1", () => {
    expect(formatUsd(0.123)).toBe("$0.123");
  });

  it("uses 4 decimals for very small values", () => {
    expect(formatUsd(0.0009)).toBe("$0.0009");
  });
});

describe("formatCompact", () => {
  it("handles null/NaN", () => {
    expect(formatCompact(null)).toBe("0");
    expect(formatCompact(Number.NaN)).toBe("0");
  });
  it("uses M suffix above 1M", () => {
    expect(formatCompact(2_500_000)).toBe("2.5M");
  });
  it("uses K suffix above 1K", () => {
    expect(formatCompact(1500)).toBe("1.5K");
  });
  it("uses plain integer below 1K", () => {
    expect(formatCompact(42)).toBe("42");
  });
});

describe("formatMs", () => {
  it("returns em dash for null", () => {
    expect(formatMs(null)).toBe("—");
  });
  it("rounds sub-second to ms", () => {
    expect(formatMs(420)).toBe("420ms");
  });
  it("converts >= 1000ms to seconds", () => {
    expect(formatMs(1500)).toBe("1.50s");
  });
});

describe("appColor", () => {
  it("is deterministic for the same seed", () => {
    expect(appColor("app-a")).toBe(appColor("app-a"));
  });
  it("returns a hex color from the palette", () => {
    expect(appColor("app-a")).toMatch(/^#[0-9A-F]{6}$/i);
  });
});

describe("providerColor", () => {
  it("is case-insensitive", () => {
    expect(providerColor("Anthropic")).toBe(providerColor("anthropic"));
  });
  it("falls back for unknown providers", () => {
    expect(providerColor("mystery")).toBe("#6366F1");
  });
});

describe("startOfMonthIso", () => {
  it("returns the 1st of the given month", () => {
    const iso = startOfMonthIso(new Date(2026, 3, 14));
    expect(new Date(iso).getDate()).toBe(1);
    expect(new Date(iso).getMonth()).toBe(3);
  });
});
