-- Forge integration schema
-- Adds a sidecar table set for Forge-created agents. Every Forge agent is
-- also a row in public.apps (so it shows up in the Obs dashboard alongside
-- manually-created apps), with extra agent-specific state kept here.
--
-- Run this in the Supabase SQL editor after 0001_init.sql.

-- apps.type ------------------------------------------------------------------
-- Distinguishes manually-created apps from Forge-generated agents.
-- Existing rows default to 'manual'.
alter table public.apps
  add column if not exists type text not null default 'manual'
    check (type in ('manual', 'forge'));

-- forge_agents ---------------------------------------------------------------
-- One row per Forge-built agent. Keyed on app_id (1:1 with apps).
-- Auth uses the paired apps.api_key_hash — no separate token.
create table if not exists public.forge_agents (
  app_id              uuid primary key references public.apps(id) on delete cascade,
  description         text not null,
  config              jsonb not null default '{}'::jsonb,
  -- Capability flags
  needs_llm           boolean not null default true,
  model               text,
  input_type          text not null default 'none'
                        check (input_type in ('none', 'text', 'file', 'both')),
  can_send_email      boolean not null default false,
  has_web_access      boolean not null default false,
  -- User-defined
  success_criteria    text,
  output_type         text not null default 'text'
                        check (output_type in ('text', 'file', 'email', 'notification', 'side-effect')),
  context_text        text check (context_text is null or char_length(context_text) <= 1000),
  -- Scheduling
  schedule_cadence    text check (schedule_cadence is null or schedule_cadence in ('daily', 'weekly', 'monthly')),
  schedule_time       time,
  last_run_at         timestamptz,
  next_run_at         timestamptz,
  -- Provenance
  creator_type        text not null default 'visitor'
                        check (creator_type in ('owner', 'visitor')),
  verified_email      text,
  -- Lifecycle
  status              text not null default 'building'
                        check (status in (
                          'building',
                          'build_failed',
                          'awaiting_test',
                          'test_failed',
                          'active',
                          'paused',
                          'expired',
                          'deleted'
                        )),
  expires_at          timestamptz not null default (now() + interval '6 months'),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_forge_agents_status       on public.forge_agents (status);
create index if not exists idx_forge_agents_next_run     on public.forge_agents (next_run_at) where status = 'active' and next_run_at is not null;
create index if not exists idx_forge_agents_expires      on public.forge_agents (expires_at) where status not in ('expired', 'deleted');
create index if not exists idx_forge_agents_creator      on public.forge_agents (creator_type);

-- forge_builds ---------------------------------------------------------------
-- Up to 2 build attempts per agent. attempt_number enforces the cap.
create table if not exists public.forge_builds (
  id                  uuid primary key default gen_random_uuid(),
  agent_id            uuid not null references public.forge_agents(app_id) on delete cascade,
  attempt_number      integer not null check (attempt_number in (1, 2)),
  prompt              text not null,
  form_snapshot       jsonb not null default '{}'::jsonb,
  generated_config    jsonb,
  builder_model       text,
  input_tokens        integer not null default 0,
  output_tokens       integer not null default 0,
  duration_ms         integer,
  status              text not null default 'pending'
                        check (status in ('pending', 'success', 'failed')),
  error_message       text,
  user_feedback       text,
  created_at          timestamptz not null default now(),
  unique (agent_id, attempt_number)
);
create index if not exists idx_forge_builds_agent on public.forge_builds (agent_id, attempt_number);

-- forge_runs -----------------------------------------------------------------
-- One row per agent execution (test, scheduled, manual).
create table if not exists public.forge_runs (
  id                  uuid primary key default gen_random_uuid(),
  agent_id            uuid not null references public.forge_agents(app_id) on delete cascade,
  run_type            text not null check (run_type in ('test', 'scheduled', 'manual')),
  status              text not null default 'queued'
                        check (status in ('queued', 'running', 'completed', 'failed')),
  started_at          timestamptz,
  completed_at        timestamptz,
  duration_ms         integer,
  input_text          text,
  input_file_path     text,
  output              text,
  input_tokens        integer not null default 0,
  output_tokens       integer not null default 0,
  cost_usd            numeric(12,6) not null default 0,
  user_rating         text check (user_rating is null or user_rating in ('up', 'down')),
  success_criteria_met boolean,
  error_message       text,
  created_at          timestamptz not null default now()
);
create index if not exists idx_forge_runs_agent_time on public.forge_runs (agent_id, created_at desc);
create index if not exists idx_forge_runs_status     on public.forge_runs (status);

-- forge_run_steps ------------------------------------------------------------
-- Step-level telemetry for a run. This is the source for the waterfall view
-- and is what Forge polls via ?since= for live progress.
--
-- seq is a monotonically increasing counter scoped to (run_id). Clients
-- poll with ?since=<last_seq> to get only new steps. The combination of
-- (run_id, seq) is unique.
create table if not exists public.forge_run_steps (
  id                  uuid primary key default gen_random_uuid(),
  run_id              uuid not null references public.forge_runs(id) on delete cascade,
  seq                 bigint not null,
  step_name           text not null,
  service             text,
  event_type          text not null check (event_type in ('start', 'complete', 'fail')),
  started_at          timestamptz,
  completed_at        timestamptz,
  duration_ms         integer,
  input_tokens        integer,
  output_tokens       integer,
  event_ref           uuid references public.events(id) on delete set null,
  error_message       text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  unique (run_id, seq)
);
create index if not exists idx_forge_run_steps_run_seq on public.forge_run_steps (run_id, seq);

-- forge_daily_metrics --------------------------------------------------------
-- Pre-aggregated per-agent daily rollup. Populated by a nightly cron job.
create table if not exists public.forge_daily_metrics (
  agent_id            uuid not null references public.forge_agents(app_id) on delete cascade,
  day                 date not null,
  total_runs          integer not null default 0,
  success_runs        integer not null default 0,
  failed_runs         integer not null default 0,
  avg_duration_ms     numeric(12,2),
  total_input_tokens  integer not null default 0,
  total_output_tokens integer not null default 0,
  total_cost_usd      numeric(12,6) not null default 0,
  avg_rating          numeric(3,2),
  updated_at          timestamptz not null default now(),
  primary key (agent_id, day)
);
create index if not exists idx_forge_daily_metrics_day on public.forge_daily_metrics (day desc);

-- forge_feedback -------------------------------------------------------------
-- Collected when a user's build attempts exhaust (after 2 failures).
create table if not exists public.forge_feedback (
  id                  uuid primary key default gen_random_uuid(),
  agent_id            uuid references public.forge_agents(app_id) on delete set null,
  email               text,
  feedback_text       text not null,
  created_at          timestamptz not null default now()
);
create index if not exists idx_forge_feedback_created on public.forge_feedback (created_at desc);

-- forge_email_verifications --------------------------------------------------
-- Short-TTL one-time 6-digit codes for verifying email addresses.
-- The code is stored as a bcrypt hash so a DB leak doesn't reveal it.
create table if not exists public.forge_email_verifications (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null,
  code_hash           text not null,
  expires_at          timestamptz not null,
  consumed_at         timestamptz,
  attempts            integer not null default 0,
  created_at          timestamptz not null default now()
);
create index if not exists idx_forge_email_verif_lookup on public.forge_email_verifications (email, created_at desc);

-- Row Level Security ---------------------------------------------------------
-- Same posture as the rest of the schema: enabled with no public policies.
-- All access is via service-role from Next.js server routes.
alter table public.forge_agents              enable row level security;
alter table public.forge_builds              enable row level security;
alter table public.forge_runs                enable row level security;
alter table public.forge_run_steps           enable row level security;
alter table public.forge_daily_metrics       enable row level security;
alter table public.forge_feedback            enable row level security;
alter table public.forge_email_verifications enable row level security;
