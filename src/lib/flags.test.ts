import { describe, it, expect } from "vitest";
import {
  modelEfficiencyFlag,
  latencyRegressionFlag,
  failingAgentsFlags,
  MODEL_EFFICIENCY_MIN_VOTES,
} from "./flags";

describe("modelEfficiencyFlag", () => {
  const baseInputs = {
    feedbackByModel: [
      { model: "claude-opus-4-7", up: 60, down: 10 }, // ~85.7%
      { model: "claude-sonnet-4-6", up: 52, down: 8 }, // ~86.7%
    ],
    requestsByModel: {
      "claude-opus-4-7": 10000,
      "claude-sonnet-4-6": 5000,
    },
    costPerRequestByModel: {
      "claude-opus-4-7": 0.05,
      "claude-sonnet-4-6": 0.01,
    },
  };

  it("fires when cheaper model is within 5pp of expensive model", () => {
    const flag = modelEfficiencyFlag(baseInputs);
    expect(flag).not.toBeNull();
    expect(flag!.kind).toBe("model_efficiency");
    expect(flag!.expensive_model).toBe("claude-opus-4-7");
    expect(flag!.cheap_model).toBe("claude-sonnet-4-6");
    expect(flag!.rate_gap).toBeLessThanOrEqual(0.05);
    // 10000 * (0.05 - 0.01) = 400
    expect(flag!.estimated_monthly_savings_usd).toBeCloseTo(400, 5);
  });

  it("does not fire if gap is wider than 5pp", () => {
    const flag = modelEfficiencyFlag({
      ...baseInputs,
      feedbackByModel: [
        { model: "claude-opus-4-7", up: 70, down: 10 }, // 87.5%
        { model: "claude-sonnet-4-6", up: 40, down: 40 }, // 50%
      ],
    });
    expect(flag).toBeNull();
  });

  it("does not fire if either model is under the sample-size gate", () => {
    const flag = modelEfficiencyFlag({
      ...baseInputs,
      feedbackByModel: [
        { model: "claude-opus-4-7", up: 60, down: 10 },
        { model: "claude-sonnet-4-6", up: 5, down: 2 }, // 7 < 30
      ],
    });
    expect(flag).toBeNull();
  });

  it("pins sample-size gate to the documented minimum", () => {
    // Exactly 30 votes should pass, 29 should not.
    const passes = modelEfficiencyFlag({
      ...baseInputs,
      feedbackByModel: [
        { model: "claude-opus-4-7", up: 60, down: 10 },
        { model: "claude-sonnet-4-6", up: 26, down: 4 },
      ],
    });
    expect(passes).not.toBeNull();

    const fails = modelEfficiencyFlag({
      ...baseInputs,
      feedbackByModel: [
        { model: "claude-opus-4-7", up: 60, down: 10 },
        { model: "claude-sonnet-4-6", up: 25, down: 4 },
      ],
    });
    expect(fails).toBeNull();
    expect(MODEL_EFFICIENCY_MIN_VOTES).toBe(30);
  });

  it("clamps negative savings to 0 (cheap model somehow more expensive)", () => {
    const flag = modelEfficiencyFlag({
      ...baseInputs,
      costPerRequestByModel: {
        "claude-opus-4-7": 0.01,
        "claude-sonnet-4-6": 0.05,
      },
    });
    expect(flag).not.toBeNull();
    expect(flag!.estimated_monthly_savings_usd).toBe(0);
  });

  it("returns null when no tier pair has data for both sides", () => {
    const flag = modelEfficiencyFlag({
      feedbackByModel: [{ model: "some-other-model", up: 50, down: 5 }],
      requestsByModel: {},
      costPerRequestByModel: {},
    });
    expect(flag).toBeNull();
  });
});

describe("latencyRegressionFlag", () => {
  it("fires when this week is >25% above baseline", () => {
    const flag = latencyRegressionFlag({
      p95_last_7d: 1600,
      p95_baseline_4w: 1000,
    });
    expect(flag).not.toBeNull();
    expect(flag!.ratio).toBeCloseTo(1.6, 5);
    expect(flag!.percent_over_baseline).toBeCloseTo(60, 5);
  });

  it("does not fire at exactly 25% over (strict >)", () => {
    const flag = latencyRegressionFlag({
      p95_last_7d: 1250,
      p95_baseline_4w: 1000,
    });
    expect(flag).toBeNull();
  });

  it("returns null when baseline is zero (new app)", () => {
    const flag = latencyRegressionFlag({
      p95_last_7d: 500,
      p95_baseline_4w: 0,
    });
    expect(flag).toBeNull();
  });

  it("returns null when this week is zero (no traffic)", () => {
    const flag = latencyRegressionFlag({
      p95_last_7d: 0,
      p95_baseline_4w: 500,
    });
    expect(flag).toBeNull();
  });
});

describe("failingAgentsFlags", () => {
  it("flags only agents over 30% fail rate with >=5 runs, sorted worst-first", () => {
    const flags = failingAgentsFlags([
      { agent_id: "a", agent_name: "Alpha", runs_7d: 10, failures_7d: 4 },  // 40% — flag
      { agent_id: "b", agent_name: "Beta",  runs_7d: 20, failures_7d: 12 }, // 60% — flag, worse
      { agent_id: "c", agent_name: "Gamma", runs_7d: 10, failures_7d: 2 },  // 20% — skip
      { agent_id: "d", agent_name: "Delta", runs_7d: 3,  failures_7d: 3 },  // sample < 5 — skip
    ]);
    expect(flags.map((f) => f.agent_id)).toEqual(["b", "a"]);
    expect(flags[0].failure_rate).toBeCloseTo(0.6, 5);
  });

  it("treats exactly 30% as not-failing (strict >)", () => {
    const flags = failingAgentsFlags([
      { agent_id: "a", agent_name: "Alpha", runs_7d: 10, failures_7d: 3 },
    ]);
    expect(flags).toEqual([]);
  });

  it("treats exactly 5 runs as meeting the minimum", () => {
    const flags = failingAgentsFlags([
      { agent_id: "a", agent_name: "Alpha", runs_7d: 5, failures_7d: 4 }, // 80%
    ]);
    expect(flags).toHaveLength(1);
  });

  it("returns an empty array when nothing qualifies", () => {
    expect(failingAgentsFlags([])).toEqual([]);
  });
});
