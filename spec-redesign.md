# Obs Dashboard Redesign — Spec

## Overview

Obs is the observability platform for a small portfolio of AI-powered apps (Chatbot, Forge, and future additions). This redesign reframes the dashboard from a generic metrics viewer into an **AI operator's cockpit**: one screen that answers "what value did our AI apps deliver this quarter, and where is money or quality leaking?" The dashboard is used by Cody (admin) and shown publicly so visitors can see what a thoughtful AI operator chooses to track.

Reference `/design` skill for visual system: dense, data-first, minimal chrome, color used sparingly so callouts pop.

This spec supplements the foundational project spec (`spec.md`); it does not replace it.

## Goals

- Replace count-based "what happened" metrics with outcome-based "was it worth it" metrics.
- Give visitors a clear "a-ha, that's smart to track" moment — the dashboard should read as operationally mature, not decorative.
- Establish cost-per-helpful-interaction and model-efficiency signals as first-class metrics.
- Instrument Chatbot and Forge with lightweight thumbs feedback so success is measurable, not inferred.
- Kill the Top Queries page — it's a log, not a signal.

## Core Features

### 1. Portfolio Scorecard (Overview redesign)

- **What:** Full-width hero "value delivered this quarter" number + a scorecard table with one row per app (status dot, 14d trend sparkline, thumbs-up rate, cost/helpful-interaction, open link).
- **Why:** Answers the pitch ("what value did our AI apps deliver") in one screen. Gives visitors the a-ha.
- **How it works:** Hero aggregates helpful interactions across apps × configurable per-app "est. deflected cost" proxy. Scorecard row status dot computed from rule set (see Technical Approach > Flag logic).
- **UI/UX:** Overview page, top to bottom: header + date range → hero band → app picker pill row → active flags strip (conditional) → scorecard table.

### 2. App Picker Toggle

- **What:** Pill/tab row at top of Overview: `[All] [Chatbot] [Forge]`. Non-`All` pills navigate to that app's per-app view.
- **Why:** Second entry point to per-app view so operators can deep-link the app they're worried about without menu-diving.
- **How it works:** Pure client-side navigation. `All` is the default scorecard; other pills are anchor links to `/apps/[slug]`.
- **UI/UX:** Sits directly under the hero band on Overview.

### 3. Per-App View — App-Aware, Not Generic

- **What:** Per-app page renders a **Chatbot shape** or **Forge shape** based on app type, not a shared template.
- **Why:** A FAQ bot and a scheduled-agent platform have different operational shapes; forcing them into the same widgets produces a generic dashboard.
- **How it works:** `/apps/[slug]` reads the app's `type` field (`chatbot` | `forge`) from config/DB and renders the matching React component tree.
- **UI/UX:**
  - **Chatbot shape:** header → 4 stat tiles → active flags → two-up charts (thumbs over time, model-mix donut) → Improvement Backlog → latency chart.
  - **Forge shape:** header → 4 stat tiles → active flags → per-agent table → Failing Agents callout (conditional) → Failed Run Inspector.

### 4. Cost Efficiency Signal

- **What:** Named metric `Cost per helpful interaction` = total spend ÷ thumbs-up count, shown on Overview scorecard AND as a stat tile on per-app view.
- **Why:** Cost-per-request is lazy. Cost-per-*valuable*-request is the metric an AI operator would put on a quarterly slide.
- **How it works:** Computed server-side per app over the selected date range. If no thumbs yet, display `— awaiting feedback` rather than `$0.00` or infinity.
- **UI/UX:** Scorecard column + top stat tile on per-app pages.

### 5. Kill Top Queries + Nav Cleanup

- **What:** Delete `/queries` route, remove nav entry, remove any links in.
- **Why:** Top queries is a log, not an operational signal.
- **How it works:** Delete files under `src/app/queries/`, remove nav entries, remove any references in other pages.
- **UI/UX:** Gone.

### 6. Sub-spec: Chatbot Feedback Instrumentation

- **What:** Handoff spec for the Chatbot repo. Adds thumbs up/down under each assistant message, emits feedback events to Obs.
- **Why:** Without feedback, "helpful interaction" has no ground truth and every downstream metric collapses to vibes.
- **How it works:** See `sub-specs/chatbot-feedback.md`.
- **UI/UX:** Icon-only thumbs pair under each message; one vote per message, server-enforced; locks after click.

### 7. Sub-spec: Forge Feedback Instrumentation

- **What:** Handoff spec for the Forge repo. Adds a single thumbs pair next to each agent's latest run.
- **Why:** Same reason — Forge needs a success signal per run.
- **How it works:** See `sub-specs/forge-feedback.md`.
- **UI/UX:** Single thumbs pair on the latest-run card; first click wins, no auth, locked after vote.

### 8. Obs Feedback Ingestion

- **What:** New endpoint `POST /api/feedback` in Obs. Accepts feedback events from sibling apps. Writes to a unified `feedback` table keyed by `(app_slug, entity_type, entity_id)` so Chatbot messages and Forge runs coexist without schema duplication.
- **Why:** Both sub-specs need a target. One endpoint, one table, one contract.
- **How it works:** Auth via the same app API-key pattern already used by `/api/apps/[slug]/spend`. Validates payload, enforces one-vote-per-entity at the DB layer (unique constraint on `(app_slug, entity_type, entity_id)` — the *first* write wins; subsequent POSTs return 409).
- **UI/UX:** No UI. Contract is defined in Technical Approach.

## Suggested Features (Approved)

### S1. Model Efficiency Flag

- **What:** Per-app callout: *"Sonnet is performing within 3% of Opus on this app — est. $240/mo savings if downgraded."*
- **Why:** The single smartest-looking widget. Directly addresses the "paying too much for the wrong model" concern.
- **How it works:** For each app, group feedback by model, compute thumbs-up rate per model, and compare expensive-tier models against cheaper tiers. If the cheaper model's rate is within 5 percentage points AND has sample size ≥ 30 votes, emit the flag. Est. savings = (requests on expensive model × (expensive $/req − cheap $/req)) over trailing 30d.
- **UI/UX:** Callout card on Overview active-flags strip + on per-app view active-flags row. `View →` deep-links to per-app view.

### S2. Latency Regression Flag

- **What:** Callout when this week's p95 latency is >25% above the trailing 4-week baseline.
- **Why:** Cody named latency as a watch-item; naming the signal (not just plotting a line) reads as operational maturity.
- **How it works:** Daily compute per app: `p95_7d / p95_baseline_4w`. If ratio > 1.25, flag active.
- **UI/UX:** Same callout placement as S1. Per-app view also renders a shaded-baseline latency chart so the regression is visually obvious.

### S3. Improvement Backlog (Chatbot only)

- **What:** List of the last ~10 thumbs-down messages on the Chatbot per-app view, with question + response preview, model used, expandable in place.
- **Why:** Turns feedback into a work queue instead of a number. Concrete, tangible, reviewable.
- **How it works:** Query: last 10 `feedback` rows where `app_slug='chatbot' AND vote='down'`, joined to the message content.
- **UI/UX:** Section on Chatbot per-app view. No modal — expand in place.

### S4. Failing Agents Callout (Forge only)

- **What:** Surface any Forge agent with >30% failure rate in the last 7d.
- **Why:** Gives the status dot real teeth.
- **How it works:** Daily compute per agent: failures / total_runs over 7d. If > 0.30 AND total_runs ≥ 5, flag active.
- **UI/UX:** Called out on Forge per-app view with `Inspect runs →` link that scrolls to Failed Run Inspector filtered to that agent. Rolls up to app status dot on Overview.

### S5. Value Delivered Hero Math Popover

- **What:** Hero number shows `$X value delivered this quarter`; info icon reveals the math: `N helpful interactions × $Y avg deflected cost = $X`.
- **Why:** The pitch framing demands a number that isn't vibes. Showing the math sells it as thoughtful.
- **How it works:** Per-app config: `est_deflected_cost_per_helpful_interaction` (e.g. chatbot=$14.65 avg support ticket; forge=$TBD avg analyst-hour). Hero = sum across apps.
- **UI/UX:** Hero band on Overview. Hover/click info icon → popover with per-app breakdown and assumptions.

## UX & UI

### Page Structure

- **Overview** (`/`) — redesigned. Default landing.
- **Per-app view** (`/apps/[slug]`) — routes to Chatbot shape or Forge shape based on app type.
- **Live tail** (`/live`) — unchanged.
- **Model comparison** (`/compare`) — unchanged.
- **Queries** — deleted.

### Layout Details

**Overview — top to bottom:**

1. Page header — `Fleet Overview` title left, date range selector right (7d / 30d / 90d / Quarter / YTD; default Quarter).
2. Hero band — centered card. Giant number: `$X value delivered this quarter`. Subtitle: `N helpful interactions × $Y est. deflected cost`. Info icon → math popover.
3. App picker pill row — `[All] [Chatbot] [Forge]`. Default `All`. Other pills navigate to per-app.
4. Active flags strip (conditional) — compact callout cards for any live Model Efficiency, Latency Regression, or Failing Agents flags. Each has `View →`.
5. Portfolio Scorecard table — columns: App, Status (dot + tooltip reason), 14d trend (sparkline), Thumbs-up rate (percent + bar), Cost / helpful interaction, Actions (`Open →`). Empty state for apps without feedback yet: `— awaiting feedback`.

**Per-app view — Chatbot shape:**

1. Header — `← Back to fleet` left, app name + status dot center, date range selector right.
2. Stat tiles row — `Messages`, `Thumbs-up rate`, `Cost / helpful answer`, `p95 latency`. Each shows delta vs prior period.
3. Active flags row (conditional).
4. Two-up charts — Left: thumbs up/down stacked area over time. Right: model mix donut (sized by spend).
5. Improvement Backlog — list of last ~10 thumbs-down messages, expandable in place.
6. Latency chart — p95 trend with shaded 4-week baseline band.

**Per-app view — Forge shape:**

1. Header — same pattern.
2. Stat tiles row — `Runs`, `Thumbs-up rate`, `Cost / successful run`, `Scheduled vs manual`. Deltas vs prior period.
3. Active flags row (conditional).
4. Per-agent table — columns: agent name, runs (period), thumbs ratio, cost/run, avg latency, last run status, last run time. Sortable. Row click expands to show last 10 runs.
5. Failing Agents section (conditional) — `Inspect runs →` deep-links to inspector filtered to that agent.
6. Failed Run Inspector — collapsible. Rows: timestamp, agent, error snippet, cost before failure. Expand → full error + prompt.

### Key Interactions

- Hover value-delivered hero → math popover.
- Hover any status dot → tooltip with reason.
- Click app pill (non-`All`) → per-app view.
- Click `Open →` on scorecard row → per-app view.
- Click `View →` on a flag callout → per-app view scrolled to relevant section (anchor link).
- Click thumbs-down row in Improvement Backlog → expands in place.
- Click agent row in Forge table → expands to show last 10 runs.
- Change date range selector on any page → refetches and updates all widgets on that page.

## Technical Approach

### Stack

- Existing Next.js app. Breaking-change Next.js rules apply — always check `node_modules/next/dist/docs/` before writing new route handlers or conventions (per `AGENTS.md`).
- Supabase for storage. Reuse existing API-key auth pattern (see `src/lib/api-keys`, `/api/apps/[slug]/spend`).

### New data model

**`feedback` table (Supabase):**

```
feedback (
  id           uuid primary key default uuid_generate_v4(),
  app_slug     text not null,
  entity_type  text not null,         -- 'chatbot_message' | 'forge_run'
  entity_id    text not null,         -- message_id or run_id
  vote         text not null,         -- 'up' | 'down'
  model        text,                  -- nullable
  created_at   timestamptz not null default now(),
  unique (app_slug, entity_type, entity_id)  -- enforces one-vote-per-entity
)
```

The unique constraint is load-bearing — it's the enforcement point for "one vote per message" (Chatbot) and "first vote wins, locked" (Forge). Do not rely on app-layer dedupe.

**Per-app config (add to existing apps table or config source):**

- `type`: `'chatbot'` | `'forge'` — drives per-app view shape.
- `est_deflected_cost`: numeric — drives Value Delivered hero math.

### New endpoints

**`POST /api/feedback`** — ingestion endpoint for sibling apps.

Request (auth via `x-api-key` header, matching `/api/apps/[slug]/spend` pattern):

```json
{
  "app_slug": "chatbot",
  "entity_type": "chatbot_message",
  "entity_id": "msg_abc123",
  "vote": "up",
  "model": "claude-sonnet-4-6"
}
```

Responses:
- `201` — first vote recorded.
- `409` — entity already has a vote (unique constraint violation). Sub-spec apps treat this as "already voted" and lock the UI.
- `401` — missing/bad API key.
- `400` — invalid payload.

**Contract stability:** this endpoint is called from external codebases (Chatbot, Forge). Contract changes require updating all sibling apps. Colocate route tests (`route.test.ts`) following the pattern in `src/app/api/apps/[slug]/spend/route.test.ts`.

### Flag logic

Computed server-side on page load (not precomputed) for v1. Cache later if needed.

- **Model Efficiency:** per app, for each pair `(expensive_model, cheaper_model)`, if `|up_rate(expensive) − up_rate(cheaper)| ≤ 0.05` and both have ≥30 votes, flag active. Savings estimate uses trailing 30d request counts.
- **Latency Regression:** per app, if `p95_last_7d / p95_trailing_4w > 1.25`, flag active.
- **Failing Agents:** per Forge agent, if `failures_7d / runs_7d > 0.30` and `runs_7d ≥ 5`, flag active. Rolls up to Forge app status dot on Overview.

Extract flag logic to `src/lib/flags.ts` with unit tests — pure functions, easy to cover.

### Value Delivered math

```
value_delivered = Σ_apps (helpful_interactions_in_range × est_deflected_cost)
```

Where `helpful_interactions = count of feedback rows with vote='up' in range`. If an app has no `est_deflected_cost` configured, exclude from total and omit from popover breakdown.

### Routing change

`/apps/[slug]` currently renders one template. Update to branch on `config.type`:

- `'chatbot'` → `<ChatbotView />`
- `'forge'` → `<ForgeView />`
- else → existing generic view (fallback, kept for apps without a custom shape yet).

### Deletions

- `src/app/queries/` — delete entire directory.
- Nav entries referencing queries — remove.
- Any imports/links to the queries page — grep before deleting.

### Testing (follows `CLAUDE.md` workflow)

- Baseline green (`npm run test:run`) before any edits.
- Unit tests for `src/lib/flags.ts` and any value-delivered math additions.
- Route test for `/api/feedback` — copy pattern from `src/app/api/apps/[slug]/spend/route.test.ts`. Cover: 201 happy path, 409 duplicate, 401 missing key, 400 invalid payload.
- E2E smoke in `tests/e2e/` for the Overview scorecard rendering and the per-app view branching.
- Reviewer sub-agent pass: required (new endpoint, schema change, cross-app contract).

## Out of Scope (v1)

- **User identity, leaderboards, cohort retention.** No per-user tracking. No IP-based pseudo-identity. Revisit only if and when Chatbot/Forge add real auth.
- **Per-message/per-run deep linking from Obs back into the sibling app.** Nice-to-have but not load-bearing.
- **Precomputed flag tables / background jobs.** v1 computes flags on request.
- **Multi-vote / vote-changing UX.** One vote per entity, first wins, locked.
- **Top Queries page.** Explicitly killed.
- **Real-time updates on Overview/per-app.** Live tail stays, everything else is pull-on-load.

## Open Questions

- **`est_deflected_cost` values per app** — Chatbot proxy (avg support ticket cost) is defensible; Forge equivalent (analyst-hour, report-generation cost) needs a per-agent justification. Resolve during implementation or use a single portfolio-wide placeholder with a visible `est.` qualifier.
- **Model tier pairing for Model Efficiency flag** — Hardcode known tiers (Opus > Sonnet > Haiku; GPT-4 > GPT-4-mini) in v1, or make configurable? Hardcode for v1.
- **Value Delivered time basis** — "This quarter" default, but day 3 of a new quarter looks tiny. Likely: label hero dynamically from the date selector (`$X value delivered — last 90 days`). Confirm during build.

---

## Handoff

Sub-specs live under `sub-specs/`:

- `sub-specs/chatbot-feedback.md` — hand to a fresh Claude Code session in the Chatbot repo.
- `sub-specs/forge-feedback.md` — hand to a fresh Claude Code session in the Forge repo.

Each sub-spec is self-contained — the receiving session has no Obs context.
