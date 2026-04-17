/**
 * Portfolio signal flags — pure functions over already-aggregated inputs.
 *
 * These are the three named operator signals from the redesign spec:
 *   1. Model Efficiency  — a cheaper model is performing within 5pp of an
 *      expensive one, so we are overpaying.
 *   2. Latency Regression — this week's p95 is > 25% above the trailing
 *      4-week baseline.
 *   3. Failing Agents     — a Forge agent has > 30% failure rate over 7d.
 *
 * Kept pure so the dashboard can unit-test the thresholds and sample-size
 * gates without a Supabase client in the loop. DB queries that feed these
 * live in `src/lib/feedback.ts` / existing aggregate helpers — this module
 * only contains logic.
 */

// ---- Model Efficiency -----------------------------------------------------

/**
 * Hardcoded expensive→cheaper tier pairs. Spec §Open Questions says to
 * hardcode for v1. Extend by appending; ordering within a provider is
 * from most expensive to least.
 */
export const MODEL_TIER_PAIRS: Array<{ expensive: string; cheap: string }> = [
  // Anthropic
  { expensive: "claude-opus-4-7", cheap: "claude-sonnet-4-6" },
  { expensive: "claude-opus-4-7", cheap: "claude-haiku-4-5-20251001" },
  { expensive: "claude-sonnet-4-6", cheap: "claude-haiku-4-5-20251001" },
  // Historical pairings we still see in the wild
  { expensive: "claude-3-opus", cheap: "claude-3-5-sonnet" },
  { expensive: "claude-3-5-sonnet", cheap: "claude-3-5-haiku" },
  // OpenAI
  { expensive: "gpt-4o", cheap: "gpt-4o-mini" },
];

export const MODEL_EFFICIENCY_MIN_VOTES = 30;
export const MODEL_EFFICIENCY_MAX_RATE_GAP = 0.05;

export type ModelFeedbackStats = {
  model: string;
  up: number;
  down: number;
};

export type ModelEfficiencyInputs = {
  /** Per-(app, model) feedback counts over the scoring window. */
  feedbackByModel: ModelFeedbackStats[];
  /** Trailing-30d request counts per model (used for savings estimate). */
  requestsByModel: Record<string, number>;
  /** Average $/request per model over the same window. */
  costPerRequestByModel: Record<string, number>;
};

export type ModelEfficiencyFlag = {
  kind: "model_efficiency";
  expensive_model: string;
  cheap_model: string;
  expensive_up_rate: number;
  cheap_up_rate: number;
  rate_gap: number;
  estimated_monthly_savings_usd: number;
};

function upRate(stats: ModelFeedbackStats | undefined): number | null {
  if (!stats) return null;
  const total = stats.up + stats.down;
  if (total < MODEL_EFFICIENCY_MIN_VOTES) return null;
  return stats.up / total;
}

export function modelEfficiencyFlag(
  inputs: ModelEfficiencyInputs,
): ModelEfficiencyFlag | null {
  const byModel = new Map(inputs.feedbackByModel.map((s) => [s.model, s]));

  for (const { expensive, cheap } of MODEL_TIER_PAIRS) {
    const expRate = upRate(byModel.get(expensive));
    const cheapRate = upRate(byModel.get(cheap));
    if (expRate == null || cheapRate == null) continue;

    // Flag fires if the cheaper model is performing WITHIN 5pp of the
    // expensive one — i.e. no meaningful quality penalty for downgrading.
    // We use |gap| to also cover the surprising case where the cheaper
    // model is actually outperforming.
    const gap = Math.abs(expRate - cheapRate);
    if (gap > MODEL_EFFICIENCY_MAX_RATE_GAP) continue;

    const expensiveReqs = inputs.requestsByModel[expensive] ?? 0;
    const expensiveCpr = inputs.costPerRequestByModel[expensive] ?? 0;
    const cheapCpr = inputs.costPerRequestByModel[cheap] ?? 0;
    const savings = Math.max(0, expensiveReqs * (expensiveCpr - cheapCpr));

    return {
      kind: "model_efficiency",
      expensive_model: expensive,
      cheap_model: cheap,
      expensive_up_rate: expRate,
      cheap_up_rate: cheapRate,
      rate_gap: gap,
      estimated_monthly_savings_usd: savings,
    };
  }

  return null;
}

// ---- Latency Regression ---------------------------------------------------

export const LATENCY_REGRESSION_THRESHOLD = 1.25;

export type LatencyRegressionInputs = {
  /** p95 latency (ms) over the last 7 days. */
  p95_last_7d: number;
  /** p95 latency (ms) over the trailing 4 weeks. */
  p95_baseline_4w: number;
};

export type LatencyRegressionFlag = {
  kind: "latency_regression";
  p95_last_7d: number;
  p95_baseline_4w: number;
  ratio: number;
  percent_over_baseline: number;
};

export function latencyRegressionFlag(
  inputs: LatencyRegressionInputs,
): LatencyRegressionFlag | null {
  const { p95_last_7d, p95_baseline_4w } = inputs;
  // No baseline = no regression claim. Avoid divide-by-zero and avoid
  // yelling about apps that just launched.
  if (p95_baseline_4w <= 0 || p95_last_7d <= 0) return null;
  const ratio = p95_last_7d / p95_baseline_4w;
  if (ratio <= LATENCY_REGRESSION_THRESHOLD) return null;
  return {
    kind: "latency_regression",
    p95_last_7d,
    p95_baseline_4w,
    ratio,
    percent_over_baseline: (ratio - 1) * 100,
  };
}

// ---- Failing Agents (Forge) -----------------------------------------------

export const FAILING_AGENT_FAILURE_RATE = 0.3;
export const FAILING_AGENT_MIN_RUNS = 5;

export type AgentRunStats = {
  agent_id: string;
  agent_name: string;
  runs_7d: number;
  failures_7d: number;
};

export type FailingAgentFlag = {
  kind: "failing_agent";
  agent_id: string;
  agent_name: string;
  runs_7d: number;
  failures_7d: number;
  failure_rate: number;
};

export function failingAgentsFlags(
  stats: AgentRunStats[],
): FailingAgentFlag[] {
  const out: FailingAgentFlag[] = [];
  for (const s of stats) {
    if (s.runs_7d < FAILING_AGENT_MIN_RUNS) continue;
    const rate = s.failures_7d / s.runs_7d;
    if (rate <= FAILING_AGENT_FAILURE_RATE) continue;
    out.push({
      kind: "failing_agent",
      agent_id: s.agent_id,
      agent_name: s.agent_name,
      runs_7d: s.runs_7d,
      failures_7d: s.failures_7d,
      failure_rate: rate,
    });
  }
  // Worst first so the UI can render a top-N and have it be meaningful.
  out.sort((a, b) => b.failure_rate - a.failure_rate);
  return out;
}

// ---- Union type -----------------------------------------------------------

export type PortfolioFlag =
  | ModelEfficiencyFlag
  | LatencyRegressionFlag
  | FailingAgentFlag;
