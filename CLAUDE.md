@AGENTS.md

# Change workflow — test-gated

Any change to this codebase (new feature, refactor, bug fix) must follow this loop:

1. **Baseline green.** Before editing, run `npm run test:run`. If it's red, stop and fix the baseline first — never build on top of a broken suite.
2. **Make the change.**
3. **Re-run `npm run test:run`.** Must stay green. If a previously-passing test now fails, the regression is yours — fix the code, not the test, unless the test encoded stale behavior (and say so explicitly).
4. **Add tests for the new behavior.** Unit tests for pure logic in `src/lib/`, API route tests colocated next to the handler (`route.test.ts`), smoke tests in `tests/e2e/` only for user-visible flows that matter.
5. **Reviewer pass — only for non-trivial changes.** Spawn a reviewer sub-agent when the change touches: new API routes, auth or api-key handling, database schema, cost/billing math, or anything with a blast radius beyond a single file. Skip the reviewer for cosmetic edits, copy tweaks, or small refactors — token cost isn't worth it.

## Test layout

- `src/**/*.test.ts(x)` — Vitest unit + API route tests. Run with `npm run test` (watch) or `npm run test:run` (one-shot).
- `tests/e2e/` — Playwright smoke tests. Run with `npm run test:e2e`. Requires a working `.env.local` (Supabase keys) since the dev server boots against real infra.

## Things the tests exist to catch

- Contract drift on `/api/apps/[slug]/spend` and other endpoints used by sibling apps — these are load-bearing for hard spend caps.
- Regressions in cost/format math in `src/lib/utils.ts` — the whole dashboard reads through these formatters.
- Auth shape: missing key, wrong key, wrong app.

When adding a new endpoint, copy the pattern in `src/app/api/apps/[slug]/spend/route.test.ts` — mock `@/lib/supabase/server` and `@/lib/api-keys` at the module boundary; do not try to stand up a real Supabase client.
