-- Forge agent email sends log
--
-- Tracks emails delivered by an agent to its verified address via
-- POST /api/forge/email/send-result. Used to enforce a per-agent
-- daily rate limit (10/day) so a runaway scheduled agent cannot
-- spam someone's inbox.

create table if not exists public.forge_agent_email_sends (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references public.forge_agents(app_id) on delete cascade,
  to_email    text not null,
  subject     text not null,
  message_id  text,
  created_at  timestamptz not null default now()
);

create index if not exists forge_agent_email_sends_agent_created_idx
  on public.forge_agent_email_sends (agent_id, created_at desc);
