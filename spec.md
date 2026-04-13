# Observability Dashboard — Spec

## Overview

A persistent, model-agnostic observability dashboard for tracking usage, cost, latency, and content across any AI-powered app Cody builds. Events are sent from local apps and from a public portfolio chatbot into a centralized collector, stored in Postgres, and surfaced through a public-facing Next.js dashboard designed to double as a portfolio piece. The dashboard demonstrates that Cody takes observability into AI systems seriously — a trait of top operators and product thinkers working with LLMs — while also solving a real personal pain point: never having to check multiple provider billing pages again.

## Goals

- Answer "what did my AI apps cost this month, broken down by app and model" in a single glance, without logging into Anthropic or OpenAI billing.
- Provide one standard logging interface (TypeScript + Python SDKs) so any future app can be hooked in with a few lines of code.
- Serve as a public portfolio artifact that showcases Cody's interest in AI observability, cost discipline, and model evaluation.
- Capture enough detail (prompts, responses, latency, model choice) to answer product questions like "what are people asking my chatbot" and "which model is actually better for this use case."
- Remain low-cost ($0–$5/month) and low-maintenance (no infra babysitting) while supporting real public traffic.

## Core Features

### Event Collector API
- **What:** A single `POST /api/events` endpoint that accepts LLM call events from any app (local or public) and writes them to Postgres. Protected by a per-app API key passed as a header.
- **Why:** This is the foundation. A stable, language-agnostic HTTP ingestion endpoint means any future app in any runtime can integrate with a basic HTTP POST — no SDK lock-in.
- **How it works:** Next.js API route on Vercel. Validates API key against `apps` table, validates payload against schema, computes `cost_usd` at write-time using the current `model_pricing` table, inserts into `events`. Returns `{ id, cost_usd }` so calling apps can log their own cost locally if they want.
- **UI/UX:** No UI — server-side only. Surfaced indirectly via the Live Tail page.

### TypeScript SDK (`@cody/obs-js`)
- **What:** A thin npm package (local/private, unpublished is fine for v1) exposing a single function: `obs.log({ app, model, provider, inputTokens, outputTokens, latencyMs, status, prompt, response, sessionId, userId, metadata })`.
- **Why:** The portfolio chatbot is Next.js/TypeScript, so this is the first real consumer. A one-line import reduces friction to near-zero for future TS apps.
- **How it works:** Observe-only pattern — caller invokes the provider SDK normally (e.g., `anthropic.messages.create(...)`), measures latency, then calls `obs.log()` with the result. SDK handles API key injection, retry, and fire-and-forget async dispatch so observability never blocks the user-facing response.
- **UI/UX:** Developer-facing only. Docs live in the repo README.

### Python SDK (`cody_obs`)
- **What:** Same interface as the TypeScript SDK, Python flavor. Published locally or as a git-installable package.
- **Why:** RAG experiments, local scripts, and Python-side LLM work all need the same hookup. Symmetric API means no mental tax switching languages.
- **How it works:** Same observe-only pattern. Uses `httpx` for async HTTP, with a synchronous wrapper for scripts that don't want to care about async.
- **UI/UX:** Developer-facing only.

### Postgres Schema + Hardcoded Pricing Table
- **What:** Supabase Postgres with two main tables: `events` (the universal log) and `model_pricing` (seeded with current Claude and OpenAI prices per 1K tokens, updated quarterly). Also: `apps` (API keys, budget thresholds, display names).
- **Why:** Computing cost at write-time (vs. on read) keeps the dashboard fast and means historical events are immutable — price changes don't retroactively rewrite history. You get accurate-at-the-time cost tracking.
- **How it works:**
  - `events` table columns: `id`, `timestamp`, `app_id`, `model`, `provider`, `input_tokens`, `output_tokens`, `cost_usd` (computed at write), `latency_ms`, `user_id` (nullable), `session_id`, `status`, `prompt` (text), `response` (text), `metadata` (JSONB).
  - `model_pricing` columns: `provider`, `model`, `input_per_1k_usd`, `output_per_1k_usd`, `effective_from`. Lookup on write uses the most recent `effective_from <= now`.
  - `apps` columns: `id`, `slug`, `display_name`, `api_key_hash`, `monthly_budget_usd`, `created_at`.
- **UI/UX:** Managed via the Admin config pages. Public views read from `events` + `apps` only (never expose API keys).

### Public Overview Dashboard
- **What:** Landing view (`/`) showing total cost MTD, total tokens, total calls, active apps, daily cost time-series (stacked by app), cost by model bar chart, cost by app donut chart, and a latency overview (p50/p95) chart.
- **Why:** This is the "flex" view — what a recruiter or visitor sees. It's also the "I never have to check billing pages again" view for Cody. Both use cases collapse into one page.
- **How it works:** Server-rendered Next.js page pulls aggregates from Postgres on every load (cached ~30s). Charts rendered client-side with Recharts.
- **UI/UX:** See **Layout Details → Overview page**. Dark mode default, tabular numerals on all metrics, provider-colored accents.

### Per-App Detail View
- **What:** `/apps/[slug]` — drilldown showing calls over time, cost over time, model breakdown, error rate, latency histogram (p50/p95/p99), and an auto-rendered metadata panel for app-specific fields.
- **Why:** Aggregate views can't answer "is my chatbot slow today?" or "did the RAG app spike in cost last week?" — you need per-app drilldown.
- **How it works:** Dynamic route, reads events filtered by `app_id` and selected date range. The metadata panel introspects the `metadata` JSONB column to auto-render the most common keys as stat tiles — so a new app logging new metadata fields shows up without dashboard code changes.
- **UI/UX:** See **Layout Details → App Detail page**.

### Admin-Only Event Inspector
- **What:** `/admin/events` — login-gated searchable table of every event, with full prompt, response, and metadata visible. Filters by app, model, date range, status, min cost. CSV export.
- **Why:** Debugging, deep inspection, and the "commonly asked questions" detail analysis all require full content access. Keeping this behind auth protects user privacy on the public chatbot.
- **How it works:** Supabase Auth session required. Server-side authz check on the API route before returning full prompt/response fields.
- **UI/UX:** Dense table, click-row-to-expand drawer with full content.

### Top Queries View
- **What:** `/queries` — ranked table of most common user inputs, filterable by app and date range. Shows query text, count, avg latency, avg cost, most-used model.
- **Why:** Core "what are people actually asking my bot" feature — directly answers the RAG and chatbot observability goals.
- **How it works:** Aggregates events by normalized prompt text (trimmed, lowercased) grouped by `app_id`. Public view shows query text + stats; admin view adds a drawer with full prompt/response pairs for the latest N occurrences.
- **UI/UX:** See **Layout Details → Top Queries page**. Public-safe by default because the public chatbot's inputs are already public-by-nature.

## Suggested Features (Approved)

### Model Comparison View
- **What:** `/compare` — side-by-side comparison of models used in a given app, showing calls, avg cost/call, avg latency, p95 latency, error rate, with win/lose color coding and an auto-generated narrative summary sentence.
- **Why:** The public chatbot lets users swap models mid-conversation, which organically generates exact A/B data. This view turns that data into a portfolio story — "I ran Claude vs GPT-4o on my own chatbot, here's what I found." Screenshot-ready for LinkedIn.
- **How it works:** Query events filtered by app + date range, group by model, compute aggregates per group, render side-by-side columns. Narrative sentence template fills in the biggest deltas (cost, latency).
- **UI/UX:** See **Layout Details → Model Comparison page**.

### Budget Threshold Banner
- **What:** A soft pre-alerting banner: if any app's MTD cost exceeds a threshold set in `apps.monthly_budget_usd`, a dismissible yellow/red banner appears at the top of every page.
- **Why:** Gets 80% of alerting value with 10% of the work — no email/Slack infrastructure needed — and provides a foundation for real alerts later.
- **How it works:** Server-side check on layout render, passes a prop to the banner component. Dismissal stored in localStorage for 24h.
- **UI/UX:** Thin strip at top of every page, tappable to navigate to the offending app's detail view.

### Live Tail View
- **What:** `/live` — auto-refreshing stream of the 50 most recent events, with filter by app and pause/resume toggle.
- **Why:** Debugging a new app integration is much easier when you can watch events arrive in real time. Also serves as satisfying visual eye-candy on the public dashboard — "this is real traffic, right now."
- **How it works:** 2-second client-side polling against `GET /api/events/recent?since=<timestamp>`. New rows fade in at top. Public view truncates prompts to 60 chars; admin view shows full.
- **UI/UX:** See **Layout Details → Live Tail page**.

### API Key Auth on the Collector
- **What:** Per-app API keys stored in `apps.api_key_hash`, passed as `x-api-key` header on `POST /api/events`.
- **Why:** The collector is on the public internet. Without auth, anyone could spam fake events and trash cost data. ~20 minutes of work to prevent a real annoyance.
- **How it works:** Keys generated in admin UI, shown once, stored as bcrypt hash. Collector hashes the incoming header and looks up the app.
- **UI/UX:** Admin → Apps page, "New app" modal shows the generated key exactly once with a copy button.

### CSV Export (Admin)
- **What:** Button on `/admin/events` to export currently-filtered events as CSV.
- **Why:** When patterns emerge and deeper analysis is needed (or for a portfolio writeup), a clean export saves reinventing SQL queries.
- **How it works:** Server streams CSV response using the same filter as the current table view.
- **UI/UX:** Button in the filter toolbar on `/admin/events`.

## UX & UI

This project should apply Cody's `/design` skill for all visual decisions. Dark mode is the default. See design notes below for specifics.

### Visual Direction

- **Stack:** Tailwind + shadcn/ui + Recharts for charts.
- **Default theme:** Dark mode. Restrained monochrome base with provider-colored accents.
- **Provider colors:** Anthropic → warm orange/amber; OpenAI → teal/green; future providers → pre-assigned palette. Errors → red (reserved strictly for failure states).
- **Typography:** Tabular numerals on every metric. Generous whitespace. Inspiration: Linear, Vercel dashboards — tight information density, restrained palette.
- **Motion:** Subtle fade-in on new data (especially Live Tail). No bouncing, no celebratory animations.

### Page Structure

Persistent collapsible sidebar navigation:

1. **Overview** (`/`) — public landing
2. **Apps** (`/apps`) — list of registered apps
3. **App Detail** (`/apps/[slug]`) — per-app metrics
4. **Top Queries** (`/queries`) — most common user inputs
5. **Live Tail** (`/live`) — real-time event stream
6. **Model Comparison** (`/compare`) — A/B story view
7. **Admin** (`/admin`) — login-gated config + event inspector

Public pages: Overview, Apps, App Detail, Top Queries (redacted), Live Tail (redacted), Model Comparison.
Admin-only: full prompt/response content, API key management, pricing table edits, CSV export.

Sidebar "Admin" link reveals extra items (Events, Apps, Pricing) when logged in. When logged out, a small "Admin login" link appears in the footer.

### Layout Details

**Overview page (`/`)**
- Hero strip: four big stat cards (Total Cost MTD, Total Tokens MTD, Total Calls MTD, Active Apps). Each card has a huge tabular-numeral metric, a delta vs. last month in muted text, and a background sparkline.
- Full-width daily cost stacked area chart (last 30 days, stacked by app).
- Two-column below: Cost by model horizontal bar chart (60%) + Cost by app donut chart (40%). Donut slices navigate to app detail on click.
- Full-width latency overview: line chart with p50 (bold) and p95 (light) for the last 30 days.
- Footer strip: "Updated N seconds ago · N events tracked all-time · Built by Cody · [portfolio link]".

**Apps list page (`/apps`)**
- Card grid. Each card: app name, status dot (green = events in last hour, yellow = last 24h, gray otherwise), MTD cost, MTD calls, primary model, click-through.
- Admin-only "New app" button in header → modal for name + generated key (shown once).

**App Detail page (`/apps/[slug]`)**
- Top bar: app name, status dot, date range picker (Today / 7d / 30d / MTD / Custom), breadcrumb back to Apps.
- Stat strip: Calls, Tokens, Cost, Avg Latency (scoped to selected range).
- Chart row 1: Calls over time (line) + Cost over time (line), side by side.
- Chart row 2: Model breakdown (donut) + Error rate over time (line with red fill above threshold).
- Latency panel: histogram + p50/p95/p99 callouts.
- Metadata panel: auto-renders most common keys from the `metadata` JSONB as stat tiles. New metadata fields appear without any dashboard code changes.

**Top Queries page (`/queries`)**
- Top controls: app selector, date range picker, search filter textbox.
- Ranked table: rank, query text (truncated to 80 chars, hover to expand), count, avg latency, avg cost, most-used model.
- Default sort: count descending. Columns clickable to re-sort.
- Public mode: query text visible.
- Admin mode: click a row → right drawer with full prompt/response for latest N occurrences.

**Live Tail page (`/live`)**
- Top strip: Pause/Resume toggle, app filter dropdown, events-per-second meter.
- Main area: log-style stream, newest at top, one row per event: timestamp, provider dot, app, model, tokens (in→out), latency, cost (¢), prompt preview (60 chars public / full admin).
- New rows fade in at top; max 50 visible.
- 2-second polling, not websockets.
- Click row → right drawer with full event detail.

**Model Comparison page (`/compare`)**
- Top controls: app selector (only shows apps with multi-model usage), date range.
- Two or more columns side-by-side (one per model). Each column: total calls, avg cost/call, avg latency, p95 latency, error rate — color-coded green/red per row.
- Below: overlaid line chart — "Cost per call over time" per model.
- Narrative footer: auto-generated summary sentence (e.g., "Over the last 30 days, GPT-4o handled 60% of calls but Claude Sonnet was 23% cheaper per call and 15% faster on average.").

**Admin pages (login-gated)**
- `/admin` — landing with three cards: Events Inspector, Apps & API Keys, Pricing Table.
- `/admin/events` — searchable table of every event, filters (app/model/date/status/min cost), click-row drawer with full prompt/response/metadata, CSV export button.
- `/admin/apps` — CRUD for apps, API key regeneration, per-app budget thresholds.
- `/admin/pricing` — edit model pricing rows (provider, model, input $/1K, output $/1K, effective_from). Changes apply to future events only.

### Key Interactions

- **Landing → drill in:** Overview → click donut slice for an app → App Detail. Primary public flow.
- **Date range switching:** Every metric page has a top-right date picker. Changing it refetches all charts/stats client-side. Range persists in URL query params so links are shareable.
- **Admin login:** Footer "Admin login" → Supabase Auth email magic link → redirect to `/admin`. Session persists via Supabase cookies. Logout clears session and hides admin-only items.
- **Budget banner:** If any app exceeds threshold, dismissible banner appears at top of every page. Tap to navigate to that app.
- **Top Queries drill-in (admin):** Click row → right drawer slides in with full prompts/responses for latest N matches.
- **Live Tail interaction:** Pause freezes the stream. Click row → drawer with full event detail.
- **New app registration:** Admin → Apps → "New app" modal → enter name → modal reveals generated API key once with copy button and "this is the only time you'll see this key" warning.

### Responsive Behavior

- Desktop-first (main demo target is laptop).
- Mobile: sidebar collapses to hamburger, stat strips stack vertically, charts scale but stay readable.
- Live Tail on mobile: simplified one-line-per-event format.

## Technical Approach

**Stack:**
- **Frontend + API:** Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui + Recharts, deployed on Vercel.
- **Database:** Supabase Postgres (free tier to start).
- **Auth:** Supabase Auth (email magic link), single-user allowlist restricted to Cody's email.
- **SDKs:** TypeScript package (`@cody/obs-js`) using `fetch`; Python package (`cody_obs`) using `httpx`.

**Architecture:**
- Single Next.js app on Vercel hosts both the public dashboard UI and the collector API routes. Shared codebase, one deploy, one domain.
- Apps (local + public portfolio chatbot) POST events to the Vercel-hosted collector. The collector writes to Supabase Postgres.
- Dashboard pages render server-side from the same Postgres instance via the Supabase client.
- Auth gate wraps all `/admin/*` routes and any API route that returns full prompt/response content.

**Data model summary:**
- `events` — immutable log, one row per LLM call. Cost computed at write-time from `model_pricing`.
- `model_pricing` — price-per-1k tokens keyed by (provider, model, effective_from). Historical events keep their original cost.
- `apps` — per-app identity: slug, display name, hashed API key, monthly budget threshold.

**Key architectural decisions:**
- **Observe-only SDK pattern:** SDKs do not wrap provider clients — callers invoke providers normally and then call `obs.log()`. Lower magic, no version lock to provider SDKs, easier to add providers.
- **Cost computed at write-time:** Historical events are immutable even when prices change. Trades a small amount of write-time work for a huge gain in consistency and query speed.
- **Public-view / admin-view split:** Aggregates are public; individual prompt/response content is gated. Enforced at the API layer, not just the UI.
- **Metadata as JSONB + auto-rendered panel:** Dashboard renders common metadata keys per app without code changes. New apps can extend observability without touching the dashboard codebase.
- **Polling over websockets for Live Tail:** 2s polling is simpler, free on Vercel, and plenty for personal-scale traffic.

**Providers supported in v1:** Anthropic, OpenAI. (Gemini and local models deferred.)

**Hosting + cost:** Vercel Hobby + Supabase free tier = $0 to start. Expected ceiling at modest public-chatbot traffic: ~$5/month.

## Out of Scope (v1)

- Gemini and local model providers (Ollama, LM Studio) — add after Anthropic + OpenAI are proven.
- Real alerting (email, Slack, webhooks). The budget banner is the v1 substitute.
- Confidence score tracking — deferred until a use case actually produces confidence data.
- SDK wrapping of provider clients (observe-only for v1).
- Multi-user/multi-tenant — the admin view is single-user (Cody only).
- PII scrubbing / automatic redaction — full prompts/responses are logged as-is and only revealed in the admin view.
- Websocket-based live streaming.
- Mobile-first optimization (mobile works, but desktop is the primary target).
- Published public npm / PyPI packages — SDKs are local/private to start.
- Per-user drilldowns for authenticated end-users (the portfolio chatbot tracks anonymous session IDs only).

## Open Questions

- **Pricing table seeding:** Where is the canonical pricing source (Anthropic/OpenAI pricing pages, or a third-party aggregator)? Needs to be decided at first seed so the quarterly update process is simple.
- **Portfolio chatbot session ID strategy:** Anonymous session ID is the plan — is it generated client-side and persisted in localStorage, or server-side on first request? Affects how "returning visitor" analytics could work later.
- **Normalization for Top Queries:** Trimmed + lowercased is the starting plan — do near-duplicates ("how do I X", "how do i x?", "how to x") need fuzzier grouping (embeddings or Levenshtein) for the counts to feel right? Probably fine to start strict and revisit.
- **CSV export scale:** If the events table grows large, streaming the CSV is fine but the admin table view itself will need pagination. Worth a keep-an-eye-on note during implementation.
- **Next.js caching strategy:** Overview page aggregates are cached ~30s — confirm this is acceptable for both "fresh enough to feel live" and "cheap enough on Vercel/Supabase." May need to tune once real traffic arrives.
