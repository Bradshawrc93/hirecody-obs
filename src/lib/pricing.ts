import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Look up the active price for a (provider, model) pair and compute the
 * cost in USD for a given token count.
 *
 * "Active" means: the model_pricing row with the greatest effective_from
 * that is still <= now(). If no row matches we return 0 (the event is
 * still logged — we just can't price it). Consider surfacing unpriced
 * models in the admin UI later.
 */
export async function computeCostUsd(
  db: SupabaseClient,
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<number> {
  const { data, error } = await db
    .from("model_pricing")
    .select("input_per_1k_usd, output_per_1k_usd")
    .eq("provider", provider)
    .eq("model", model)
    .lte("effective_from", new Date().toISOString())
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return 0;

  const inCost = (inputTokens / 1000) * Number(data.input_per_1k_usd);
  const outCost = (outputTokens / 1000) * Number(data.output_per_1k_usd);
  // Round to 6 decimal places to match the DB column precision.
  return Math.round((inCost + outCost) * 1_000_000) / 1_000_000;
}
