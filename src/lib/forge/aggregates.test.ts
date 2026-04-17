import { describe, it, expect } from "vitest";
import {
  errorSignature,
  percentile,
  dailyRunBuckets,
} from "./aggregates";

describe("percentile", () => {
  it("returns 0 for an empty array", () => {
    expect(percentile([], 95)).toBe(0);
  });

  it("picks the p95 of a small sorted array", () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(arr, 50)).toBe(6);
    expect(percentile(arr, 95)).toBe(10);
  });

  it("clamps out-of-range percentiles", () => {
    const arr = [1, 2, 3];
    expect(percentile(arr, 150)).toBe(3);
    expect(percentile(arr, 0)).toBe(1);
  });
});

describe("errorSignature", () => {
  it("handles null/empty", () => {
    expect(errorSignature(null)).toBe("(no error captured)");
    expect(errorSignature("")).toBe("(no error captured)");
  });

  it("collapses variable numbers and ips into placeholders", () => {
    const a = errorSignature("connection to 10.0.0.4:5432 timed out after 30s");
    const b = errorSignature("connection to 10.0.0.7:5432 timed out after 15s");
    expect(a).toBe(b);
  });

  it("collapses uuids", () => {
    const a = errorSignature(
      "run aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee failed to start",
    );
    const b = errorSignature(
      "run 11111111-2222-3333-4444-555555555555 failed to start",
    );
    expect(a).toBe(b);
  });

  it("collapses quoted strings", () => {
    const a = errorSignature('unknown tool "search_orders"');
    const b = errorSignature('unknown tool "search_refunds"');
    expect(a).toBe(b);
  });

  it("only uses the first line of multi-line errors", () => {
    const sig = errorSignature(
      "TypeError: foo is not a function\n  at file:12:3\n  at other:4:1",
    );
    expect(sig).toBe("TypeError: foo is not a function");
  });

  it("truncates extremely long messages", () => {
    const long = "x".repeat(500);
    expect(errorSignature(long).length).toBe(200);
  });
});

describe("dailyRunBuckets", () => {
  it("returns `days` entries in chronological order ending today", () => {
    const out = dailyRunBuckets([], 14);
    expect(out).toHaveLength(14);
    const last = out[out.length - 1].date;
    expect(last).toBe(new Date().toISOString().slice(0, 10));
  });

  it("counts runs on the correct day", () => {
    const today = new Date().toISOString();
    const out = dailyRunBuckets([today, today, today], 3);
    const todayKey = today.slice(0, 10);
    const todayRow = out.find((p) => p.date === todayKey);
    expect(todayRow?.runs).toBe(3);
  });
});
