# Beacon — Obs Admin Tab Handoff

This doc is for the Obs team. It describes the **Beacon** admin tab you will add inside Obs's existing admin section. The Beacon app exposes all required capabilities as HTTP endpoints — your job is to render the UI against them.

Companion: `beacon-spec.md` in the Beacon repo has the full product spec. This doc is concise and scoped to the Obs-side build.

---

## 1. Where it lives

Inside the existing Obs admin (same auth + chrome as `/admin/apps`, `/admin/pricing`). Add a new nav entry **Beacon** that points to `/admin/beacon`.

## 2. Auth

The Beacon admin surface is **Obs-admin only**. Reuse Obs's existing admin session. When calling Beacon's API:

- Option A (preferred): Obs attaches the signed-in admin's email to the outbound request (server-side), and Beacon checks `ADMIN_EMAILS` env for a match.
- Option B: A shared service API key between the two apps. Keep this decision consistent with how Obs already calls other internal services.

All Beacon admin endpoints below require an authenticated Obs admin.

## 3. Screens to build

### Screen 1 — Products (`/admin/beacon`)

Table of products Beacon tracks.

| Column | Source |
|---|---|
| Product slug | `products[].slug` |
| Display name | `products[].name` |
| Tagline | `products[].tagline` |
| GitHub repo URL | `products[].github_repo_url` |
| Current version | `products[].current_version` |
| Last scanned | `products[].last_scanned_at` |

Actions:
- **Add product** — modal, POST `/api/admin/products`
- **Edit product** — PATCH `/api/admin/products/:slug`
- **Archive product** — DELETE `/api/admin/products/:slug` (soft-delete; hides from Beacon but preserves training history)
- **Scan for new commits** — POST `/api/admin/products/:slug/scan` — returns `{ draftId, draft }`. On non-empty `draftId`, navigate to Release Builder for that draft.

### Screen 2 — Release Builder (`/admin/beacon/drafts/:id`)

Loaded from GET `/api/admin/drafts/:id`. Three columns (or stacked on narrow screens):

**A. Unassigned commits**

For each `draft.commits[i]`:
- SHA (short) + link to `commit.url`
- First line of `commit.message`, author, date
- LLM suggestion badge (`llm_suggestion`) + rationale (`llm_rationale`)
- Radio: Accept suggestion / `Include as major` / `Include as minor` / `Ignore`
- On change: PATCH `/api/admin/drafts/:id` with `{ commits: [...] }` (updated `classification` on the affected commit).

**B. Draft release**

Derived from current state:
- Version number — editable; default `draft.proposed_version`. Auto-proposal: if any classified `major`, bump major; else bump minor.
- Release type — `draft.release_type`. Auto-set: major if any commits classified major, else minor.
- Commits grouped by classification.
- **Generate release content** — POST `/api/admin/drafts/:id/generate`. Polls/awaits response; result arrives at `draft.generated_content`.

**C. Generated content** (after generate)

- **Release notes** — markdown editor bound to `draft.generated_content.release_notes`. Persist with PATCH `/api/admin/drafts/:id`.
- **Overview sections** (major only) — fields for `problem`, `features[]`, `functionality`.
- **Quiz** — 3 MCQs from `draft.generated_content.quiz`. Edit stem, 4 options, `correctIndex`. Buttons:
  - **Regenerate this question** — call POST `/api/admin/drafts/:id/generate` (server regenerates whole set in v1). Later versions may accept a `{ questionId }` param.
  - **Regenerate all** — same endpoint, discard current quiz first via PATCH.

Footer actions:
- **Save draft** — PATCH `/api/admin/drafts/:id` with all current edits.
- **Publish release** — POST `/api/admin/drafts/:id/publish`. Confirmation modal. On success, training-due status updates for all users, nav updates if major.
- **Discard draft** — DELETE `/api/admin/drafts/:id` with confirm.

### Screen 3 — Published history (`/admin/beacon/releases`)

GET `/api/admin/releases` → grouped per product.

| Column |
|---|
| Product |
| Version (with badge for major/minor) |
| Published at |
| Published by |
| Type |

Row actions:
- **View** — read-only detail pulled from GET `/api/admin/releases/:slug/:version`.
- **Edit** — form for release notes, overview (if major), and quiz. PATCH `/api/admin/releases/:slug/:version`. Does NOT create a new version and does NOT re-trigger training-due status.

## 4. API reference

Base URL is the Beacon deployment (e.g., `https://beacon.hirecody.dev`). All endpoints return JSON.

| Method | Path | Purpose |
|---|---|---|
| GET    | `/api/admin/products` | List products |
| POST   | `/api/admin/products` | Create product `{slug,name,tagline,github_repo_url,current_version?}` |
| GET    | `/api/admin/products/:slug` | Fetch one |
| PATCH  | `/api/admin/products/:slug` | Update fields |
| DELETE | `/api/admin/products/:slug` | Archive (soft delete) |
| POST   | `/api/admin/products/:slug/scan` | Fetch commits + classify → returns draft |
| GET    | `/api/admin/drafts` | List open drafts |
| GET    | `/api/admin/drafts/:id` | Draft detail |
| PATCH  | `/api/admin/drafts/:id` | Update commits, version, release_type, generated_content |
| POST   | `/api/admin/drafts/:id/generate` | Run LLM content generation |
| POST   | `/api/admin/drafts/:id/publish` | Publish live (requires generated_content) |
| DELETE | `/api/admin/drafts/:id` | Discard |
| GET    | `/api/admin/releases` | Published history across products |
| GET    | `/api/admin/releases/:slug/:version` | Single release detail |
| PATCH  | `/api/admin/releases/:slug/:version` | Corrections-only edit |

### Key shapes

`Product`:
```ts
{ slug, name, tagline, github_repo_url, current_version, last_scanned_at?, archived? }
```

`DraftCommit`:
```ts
{ sha, message, author, date, url,
  llm_suggestion: "major"|"minor"|"patch"|"chore"|"ignore",
  llm_rationale: string,
  classification: same-enum | null }
```

`Draft`:
```ts
{ id, product_slug, commits: DraftCommit[], proposed_version, release_type: "major"|"minor",
  generated_content?: { release_notes: string, overview?: {problem, features: [{title,description}], functionality}, quiz: QuizQuestion[] },
  updated_at }
```

`QuizQuestion`:
```ts
{ id, stem, options: [string,string,string,string], correctIndex: 0|1|2|3 }
```

`ReleaseContent` (what `/admin/releases/:slug/:version` returns and PATCH accepts):
```ts
{ product_slug, version, type, published_at, approved_by,
  release_notes: string, overview?: {problem, features[], functionality} }
```

## 5. UX expectations

- **Never block on LLM calls silently.** Generate is 3–15 seconds; show a spinner and disable the button.
- **Classification edits should feel instant.** PATCH locally-applied state, optimistic UI, reconcile on response.
- **Publish is a one-way gate.** Modal confirm, warn that it triggers training-due statuses.
- **Corrections (Published history edit) should NOT let the admin change the version number or publish date.** Only notes, overview, quiz.

## 6. Out of scope for Obs side (Beacon owns)

- Commit fetching from GitHub
- LLM calls
- Draft persistence
- Notification delivery (deferred)
- Everything on the user-facing Beacon app (home, training, product pages)

## 7. Environment / wiring

Only thing Obs needs locally:

```
BEACON_BASE_URL=https://beacon.hirecody.dev
# If using the shared-service-key auth model:
BEACON_ADMIN_KEY=xxxxxxxxxxxx
```

If using email-forwarding auth, ensure every outbound request includes the admin's email in a header Beacon can verify (e.g., `x-admin-email`). Align with Beacon on the exact header name before building.

---

**Questions / feedback:** open an issue in the Beacon repo or ping Cody.
