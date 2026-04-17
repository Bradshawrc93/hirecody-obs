// Shared types used by the collector and the dashboard.

export type EventStatus = "success" | "error";

export interface AppRow {
  id: string;
  slug: string;
  display_name: string;
  api_key_hash: string;
  monthly_budget_usd: number | null;
  est_deflected_cost: number | null;
  created_at: string;
}

export interface ModelPricingRow {
  id: string;
  provider: string;
  model: string;
  input_per_1k_usd: number;
  output_per_1k_usd: number;
  effective_from: string;
}

export interface EventRow {
  id: string;
  timestamp: string;
  app_id: string;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number | null;
  user_id: string | null;
  session_id: string | null;
  status: EventStatus;
  prompt: string | null;
  response: string | null;
  metadata: Record<string, unknown>;
}

// Event row joined with the app's display name/slug, which is what most
// dashboard pages actually want to render.
export type EventWithApp = EventRow & {
  app_slug: string;
  app_display_name: string;
};
