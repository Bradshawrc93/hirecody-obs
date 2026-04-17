/**
 * Value Delivered math — spec §Value Delivered math.
 *
 *   value = Σ_apps ( helpful_interactions_in_range × est_deflected_cost )
 *
 * Apps with a null `est_deflected_cost` are excluded from the hero total
 * and omitted from the popover breakdown. This is a pure function so the
 * dashboard can unit-test the edge cases (no apps, no feedback, one app
 * missing config) without touching the DB.
 *
 * Also: `cost per helpful interaction` lives here rather than in
 * utils.ts because it encodes an intent ("don't show $0 / ∞ when there
 * are no thumbs yet") that the generic formatter doesn't know about.
 */

export type ValueDeliveredInput = {
  app_slug: string;
  display_name: string;
  helpful_interactions: number;
  est_deflected_cost: number | null;
};

export type ValueDeliveredBreakdown = {
  app_slug: string;
  display_name: string;
  helpful_interactions: number;
  est_deflected_cost: number;
  value_usd: number;
};

export type ValueDeliveredResult = {
  total_usd: number;
  total_helpful_interactions: number;
  breakdown: ValueDeliveredBreakdown[];
};

export function valueDelivered(
  apps: ValueDeliveredInput[],
): ValueDeliveredResult {
  const breakdown: ValueDeliveredBreakdown[] = [];
  for (const a of apps) {
    if (a.est_deflected_cost == null) continue;
    breakdown.push({
      app_slug: a.app_slug,
      display_name: a.display_name,
      helpful_interactions: a.helpful_interactions,
      est_deflected_cost: a.est_deflected_cost,
      value_usd: a.helpful_interactions * a.est_deflected_cost,
    });
  }
  return {
    total_usd: breakdown.reduce((s, b) => s + b.value_usd, 0),
    total_helpful_interactions: breakdown.reduce(
      (s, b) => s + b.helpful_interactions,
      0,
    ),
    breakdown,
  };
}

/**
 * Cost per helpful interaction.
 * Returns null when there are no helpful interactions yet — caller
 * should render `— awaiting feedback` instead of $0.00 or Infinity.
 */
export function costPerHelpfulInteraction(
  total_spend_usd: number,
  helpful_interactions: number,
): number | null {
  if (helpful_interactions <= 0) return null;
  return total_spend_usd / helpful_interactions;
}
