-- Observability Dashboard — initial schema
-- Run this once in the Supabase SQL editor.

-- Extensions -----------------------------------------------------------------
create extension if not exists "pgcrypto";

-- apps -----------------------------------------------------------------------
-- One row per app that sends events to the collector.
create table if not exists public.apps (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  display_name        text not null,
  api_key_hash        text not null,
  monthly_budget_usd  numeric(10,2),
  created_at          timestamptz not null default now()
);

-- model_pricing --------------------------------------------------------------
-- Price per 1K tokens, keyed by (provider, model, effective_from).
-- At write-time the collector selects the row with the greatest
-- effective_from <= now() for the matching (provider, model).
create table if not exists public.model_pricing (
  id                  uuid primary key default gen_random_uuid(),
  provider            text not null,
  model               text not null,
  input_per_1k_usd    numeric(12,6) not null,
  output_per_1k_usd   numeric(12,6) not null,
  effective_from      timestamptz not null default now(),
  created_at          timestamptz not null default now()
);
create index if not exists idx_model_pricing_lookup
  on public.model_pricing (provider, model, effective_from desc);

-- events ---------------------------------------------------------------------
-- Immutable log, one row per LLM call. cost_usd is computed at write-time so
-- historical events are never retroactively rewritten when prices change.
create table if not exists public.events (
  id                  uuid primary key default gen_random_uuid(),
  timestamp           timestamptz not null default now(),
  app_id              uuid not null references public.apps(id) on delete cascade,
  model               text not null,
  provider            text not null,
  input_tokens        integer not null default 0,
  output_tokens       integer not null default 0,
  cost_usd            numeric(12,6) not null default 0,
  latency_ms          integer,
  user_id             text,
  session_id          text,
  status              text not null default 'success', -- 'success' | 'error'
  prompt              text,
  response            text,
  metadata            jsonb not null default '{}'::jsonb
);
create index if not exists idx_events_app_time       on public.events (app_id, timestamp desc);
create index if not exists idx_events_time           on public.events (timestamp desc);
create index if not exists idx_events_model          on public.events (model);
create index if not exists idx_events_status         on public.events (status);
create index if not exists idx_events_metadata_gin   on public.events using gin (metadata);

-- Row Level Security ---------------------------------------------------------
-- We access the DB exclusively from the Next.js server (service role for
-- writes, anon + server-computed aggregates for reads). Enabling RLS with
-- no public policies ensures the anon key cannot read raw rows if it ever
-- leaks into client code. All dashboard reads go through server components
-- using the service-role key.
alter table public.apps          enable row level security;
alter table public.model_pricing enable row level security;
alter table public.events        enable row level security;
