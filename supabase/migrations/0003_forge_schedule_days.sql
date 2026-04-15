-- Forge scheduling: day-of-week / day-of-month fields
--
-- Weekly and monthly cadences need to know *which* day to run on. Prior
-- to this migration, weekly was interpreted as "every 7 days from the
-- first run" and monthly as "same day-of-month as the first run", which
-- is not what most users actually want.
--
-- schedule_day_of_week:  0..6 (Sunday..Saturday), used when cadence='weekly'
-- schedule_day_of_month: 1..28, used when cadence='monthly'
--                        (capped at 28 to sidestep Feb/short-month fallback)
--
-- Both are nullable. Existing weekly/monthly rows keep their prior
-- behavior until the caller sends a value.

alter table public.forge_agents
  add column if not exists schedule_day_of_week integer
    check (schedule_day_of_week is null or (schedule_day_of_week between 0 and 6));

alter table public.forge_agents
  add column if not exists schedule_day_of_month integer
    check (schedule_day_of_month is null or (schedule_day_of_month between 1 and 28));
