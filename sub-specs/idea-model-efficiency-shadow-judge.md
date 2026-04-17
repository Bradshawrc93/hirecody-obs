# Idea: Shadow A/B model-efficiency suggestions

**Status:** backlog / not scheduled — captured 2026-04-17
**Owner:** Cody
**Type:** backend feature idea

## The problem

The current `model_efficiency` flag (`src/lib/flags.ts`) only fires when an app is *already* running two models side-by-side in production and has ≥30 thumbs votes on each. It's a retrospective detector — it can confirm "the cheap model kept up" but it can't suggest a model an app isn't already using.

For single-model apps (like the chatbot, which is moving to one model), the flag is silent by design. That means operators get no guidance on whether they're overpaying or, conversely, *under*-serving users who could have gotten a better answer from a stronger model.

## The idea

A scheduled backend job (twice daily) that runs a shadow A/B replay against recent runs to produce **model tweak suggestions** per app.

### Rough shape

For each app, twice a day:

1. **Sample recent runs** from the trailing window:
   - A random-ish sample of successful runs (for *downgrade* candidates)
   - All thumbs-down runs since the last job (for *upgrade* candidates)
2. **Replay each sampled prompt** through 1–2 candidate models:
   - For downgrades: the next cheaper tier from `MODEL_TIER_PAIRS`
   - For thumbs-down: a stronger model than what was used
3. **Judge the replay** with an LLM-as-judge prompt that scores output similarity / quality against the original response:
   - Downgrade test → "did the cheaper model return a ≥90% semantic match?"
   - Upgrade test → "would this stronger response have been materially better?"
4. **Aggregate** judged results per (app, candidate model) pair and write a `model_suggestion` row.
5. **Surface** as a new flag kind (`model_suggestion`) on the app dashboard:
   - *"Haiku matched Sonnet on 92% of sampled prompts — est. $X/mo savings if you switch"*
   - *"12 of your last 20 thumbs-down would have been better on Opus — consider escalation routing"*

### Why it's better than today's flag

| Today | With this job |
|---|---|
| Needs both models live in prod | Works for single-model apps |
| Only detects what already happened | Predictive — tests models you're *not* running |
| Downgrade-only | Upgrade suggestions on thumbs-down |
| Zero ongoing cost | Recurring replay + judge API spend |

### Open questions to resolve before building

- **Sample size + cost envelope.** Replaying N prompts × M candidate models × judge call adds up. Need a per-app daily cap (e.g. $5/day) and a config knob.
- **Judge model + prompt.** LLM-as-judge quality varies a lot. Probably want Sonnet as the judge with a tight rubric; validate manually on a seed set before trusting it.
- **Schema.** New table `model_suggestions` keyed on (app_slug, candidate_model, window) with sample counts, match rate, estimated savings, last_run_at.
- **Staleness.** Suggestions should expire if the app's model mix or prompt template changes — probably tie to a content hash of the system prompt.
- **Trust floor.** Don't surface a suggestion below some sample size (mirror the 30-vote floor on today's flag).
- **Cold start.** Apps with zero thumbs-down in the window — still run the downgrade test, skip the upgrade test.

### Rough build shape

- New Supabase table: `model_suggestions`
- Scheduled function (Vercel cron or Supabase edge function) running 2x/day
- Shared `judge()` helper that wraps Anthropic SDK with cache-control on the rubric prompt
- Extend `Flag` union in `src/lib/flags.ts` with a `model_suggestion` kind
- Extend `flag-callouts.tsx` with a new case + anchor

### Out of scope for v1

- Auto-switching models (this is *suggestion-only*; operator stays in the loop)
- Multi-turn conversation replay (v1 = single prompt/response)
- Streaming judge evaluation
