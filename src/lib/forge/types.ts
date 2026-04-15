// Types for Forge agent/build/run/step rows. Snake_case matches the DB.

export type ForgeAgentStatus =
  | "building"
  | "build_failed"
  | "awaiting_test"
  | "test_failed"
  | "active"
  | "paused"
  | "expired"
  | "deleted";

export type ForgeInputType = "none" | "text" | "file" | "both";
export type ForgeOutputType =
  | "text"
  | "file"
  | "email"
  | "notification"
  | "side-effect";
export type ForgeCreatorType = "owner" | "visitor";
export type ForgeScheduleCadence = "daily" | "weekly" | "monthly";
export type ForgeRunType = "test" | "scheduled" | "manual";
export type ForgeRunStatus = "queued" | "running" | "completed" | "failed";
export type ForgeBuildStatus = "pending" | "success" | "failed";
export type ForgeStepEventType = "start" | "complete" | "fail";

export interface ForgeAgentRow {
  app_id: string;
  description: string;
  config: Record<string, unknown>;
  needs_llm: boolean;
  model: string | null;
  input_type: ForgeInputType;
  can_send_email: boolean;
  has_web_access: boolean;
  success_criteria: string | null;
  output_type: ForgeOutputType;
  context_text: string | null;
  schedule_cadence: ForgeScheduleCadence | null;
  schedule_time: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  creator_type: ForgeCreatorType;
  verified_email: string | null;
  status: ForgeAgentStatus;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface ForgeBuildRow {
  id: string;
  agent_id: string;
  attempt_number: 1 | 2;
  prompt: string;
  form_snapshot: Record<string, unknown>;
  generated_config: Record<string, unknown> | null;
  builder_model: string | null;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number | null;
  status: ForgeBuildStatus;
  error_message: string | null;
  user_feedback: string | null;
  created_at: string;
}

export interface ForgeRunRow {
  id: string;
  agent_id: string;
  run_type: ForgeRunType;
  status: ForgeRunStatus;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  input_text: string | null;
  input_file_path: string | null;
  output: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  user_rating: "up" | "down" | null;
  success_criteria_met: boolean | null;
  error_message: string | null;
  created_at: string;
}

export interface ForgeRunStepRow {
  id: string;
  run_id: string;
  seq: number;
  step_name: string;
  service: string | null;
  event_type: ForgeStepEventType;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  event_ref: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
