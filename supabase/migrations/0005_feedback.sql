-- Feedback ingestion + value-delivered config for the Obs redesign.
-- Introduces a unified feedback table keyed by (app_slug, entity_type,
-- entity_id) so Chatbot messages and Forge runs coexist without schema
-- duplication. The unique constraint is load-bearing: it is the
-- enforcement point for "one vote per entity, first wins" behavior in
-- the sibling apps.
--
-- Run after 0004_forge_agent_email_sends.sql.

-- apps: widen type to include 'chatbot', add est_deflected_cost --------------
--
-- 0002 added `apps.type` with check (type in ('manual', 'forge')).
-- The redesign introduces a Chatbot shape, so the check constraint has to
-- grow. Drop + recreate is the simplest path since we can't ALTER CHECK
-- in place. `manual` is kept as the fallback for apps without a custom
-- per-app view shape.
alter table public.apps
  drop constraint if exists apps_type_check;

alter table public.apps
  add constraint apps_type_check
  check (type in ('manual', 'chatbot', 'forge'));

-- Per-app multiplier for Value Delivered hero math.
-- If null, the app is excluded from the hero total (spec §Value Delivered math).
alter table public.apps
  add column if not exists est_deflected_cost numeric(10,2);

-- feedback -------------------------------------------------------------------
-- One row per (app_slug, entity_type, entity_id). The unique constraint is
-- the enforcement point for "one vote per entity" at the DB layer. App
-- layer must treat 23505 (unique violation) as "already voted" and return
-- 409, which locks the caller's UI per the sub-specs.
create table if not exists public.feedback (
  id            uuid primary key default gen_random_uuid(),
  app_slug      text not null,
  entity_type   text not null check (entity_type in ('chatbot_message', 'forge_run')),
  entity_id     text not null,
  vote          text not null check (vote in ('up', 'down')),
  model         text,
  created_at    timestamptz not null default now(),
  unique (app_slug, entity_type, entity_id)
);

create index if not exists idx_feedback_app_time
  on public.feedback (app_slug, created_at desc);
create index if not exists idx_feedback_app_vote
  on public.feedback (app_slug, vote);
create index if not exists idx_feedback_app_model
  on public.feedback (app_slug, model) where model is not null;

-- RLS: same posture as every other table — enabled with no public
-- policies. Reads and writes go through the Next.js server with the
-- service role key.
alter table public.feedback enable row level security;
