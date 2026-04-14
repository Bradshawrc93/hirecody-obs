# Hooking a new app into `obs`

This is the only doc you need to wire a new app into the observability collector. Drop it into a new project (or paste it to Claude) and you should have events flowing in a few minutes.

---

## TL;DR

1. Create the app at `https://<your-obs-domain>/admin/apps` → "New app". Copy the API key that appears once.
2. Store the key and the endpoint in your new app's env:
   ```
   OBS_ENDPOINT=https://<your-obs-domain>/api/events
   OBS_API_KEY=obs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   OBS_APP_SLUG=my-new-app
   ```
3. Install the SDK that matches your runtime (TS or Python — see below).
4. After every LLM call, call `obs.log({...})`. Observe-only — the SDK does **not** wrap the provider client.

That's it. Events show up in Live Tail within ~2 seconds.

---

## 1. Get an API key

- Sign in at `/admin/login` (magic link to the allowlisted admin email).
- Go to `/admin/apps` → **New app**.
- Fields:
  - **Slug** — URL-safe: `lowercase-with-dashes`. Shows up in `/apps/<slug>`.
  - **Display name** — human-readable label (what the dashboard shows).
  - **Monthly budget (USD, optional)** — if MTD cost exceeds this, a banner appears on every dashboard page.
- The modal then reveals the API key **exactly once**. Copy it immediately. Only a bcrypt hash is stored — there is no way to recover it later. If you lose it, use **Rotate key** on the same page.

Keys look like `obs_` followed by 32 hex characters.

---

## 2. Endpoint

```
POST  https://<your-obs-domain>/api/events
```

Headers:

| Header         | Value                        |
|----------------|------------------------------|
| `content-type` | `application/json`           |
| `x-api-key`    | Your `obs_...` key           |

Response on success (HTTP 200):

```json
{ "id": "e1b1f2...", "cost_usd": 0.00342 }
```

`cost_usd` is the computed cost the collector stored, using the current pricing table. The calling app can log this locally if it wants a second source of truth.

Error responses:

| Status | Meaning                                              |
|--------|------------------------------------------------------|
| 400    | Invalid JSON or payload schema                       |
| 401    | Missing or invalid `x-api-key`                       |
| 500    | Database insert failed (see response `details`)      |

---

## 2a. Spend read endpoint (hard cap enforcement)

For apps that need to enforce a hard daily spend cap with `obs` as the authoritative source of truth. Call this before each provider request and refuse the call if the returned cost has already crossed your cap.

```
GET  https://<your-obs-domain>/api/apps/<slug>/spend?window=today
```

Headers:

| Header      | Value              |
|-------------|--------------------|
| `x-api-key` | Your `obs_...` key |

The API key must belong to the app identified by `<slug>`. A valid key for a *different* app returns `401`.

Query params:

| Param    | Values    | Notes                                                                                |
|----------|-----------|--------------------------------------------------------------------------------------|
| `window` | `today`   | v1 supports `today` only. "Today" means the current UTC calendar day. `week` / `month` / `all` may be added later — unknown values return `400`, so callers should pin to `today`. |

Response on success (HTTP 200):

```json
{
  "app":         "portfolio-chatbot",
  "window":      "today",
  "windowStart": "2026-04-13T00:00:00.000Z",
  "cost_usd":    3.1842
}
```

`cost_usd` is the sum of `events.cost_usd` for the given app since `windowStart`. It reflects the same value the dashboard sees — there is no caching layer in front of it. At the scale this project targets, the query runs well under 50ms using the existing `(app_id, timestamp desc)` index.

Error responses:

| Status | Meaning                                                                |
|--------|------------------------------------------------------------------------|
| 400    | `window` query param is missing a supported value                      |
| 401    | Missing `x-api-key`, invalid key, or the key belongs to a different app |
| 404    | The `<slug>` in the URL does not correspond to any app                  |
| 500    | Database lookup or sum query failed                                    |

### Example: hard cap at $5/day

```ts
const DAILY_CAP_USD = 5.0;

const res = await fetch(
  `${process.env.OBS_ENDPOINT_BASE}/api/apps/${process.env.OBS_APP_SLUG}/spend?window=today`,
  { headers: { "x-api-key": process.env.OBS_API_KEY! } },
);
const { cost_usd } = await res.json();

if (cost_usd >= DAILY_CAP_USD) {
  return new Response("daily spend cap reached, try again tomorrow", { status: 429 });
}
// ...proceed with the LLM call, then POST /api/events as usual.
```

Important: the chatbot should **not** maintain its own running total. Always ask `obs` — it is the source of truth, and every call writes to the same `events` table this endpoint reads from.

---

## 3. Payload schema

All field names are **camelCase**. Unknown fields are rejected.

| Field          | Type                         | Required | Notes                                                      |
|----------------|------------------------------|----------|------------------------------------------------------------|
| `app`          | string                       | No       | Your app slug. Used as a friendly cross-check only.         |
| `model`        | string                       | **Yes**  | Exact model id, e.g. `claude-sonnet-4-6`, `gpt-4o-mini`.    |
| `provider`     | string                       | **Yes**  | `anthropic` or `openai` in v1.                              |
| `inputTokens`  | integer ≥ 0                  | No (0)   | From the provider's usage object.                           |
| `outputTokens` | integer ≥ 0                  | No (0)   | Same.                                                       |
| `latencyMs`    | integer ≥ 0                  | No       | Wall-clock elapsed time around the provider call.           |
| `status`       | `"success"` / `"error"`      | No (✓)   | Default `success`.                                          |
| `prompt`       | string                       | No       | The user input. Stored as-is; never redacted.               |
| `response`     | string                       | No       | The model's text output.                                    |
| `sessionId`    | string                       | No       | Your conversation/session id. Anonymous is fine.            |
| `userId`       | string                       | No       | Optional end-user identifier.                               |
| `metadata`     | object                       | No       | Arbitrary JSONB — keys auto-render on the App Detail page.  |
| `timestamp`    | ISO-8601 string              | No       | For backfills. Omit for "now".                              |

### A note on `metadata`

Anything you put here will be **auto-rendered** as stat tiles on `/apps/<slug>` — the dashboard introspects the JSONB column and surfaces the most common `(key, value)` pairs per app. You don't have to touch the dashboard to add a new field. Good things to log:

- `retrieval_docs_count` (for a RAG app)
- `prompt_template_version`
- `user_plan` (free / paid / trial)
- `feature_flag` values
- `error_code` (on failure)

Keep values small and low-cardinality — it's for at-a-glance stat tiles, not full logs.

---

## 4. TypeScript / Node (the `@cody/obs-js` SDK)

### Install

The package is intentionally unpublished. Depend on it by relative path:

```json
{
  "dependencies": {
    "@cody/obs-js": "file:../observability-dashboard/packages/obs-js"
  }
}
```

Adjust the path for wherever your observability repo lives relative to the new app.

### Use

```ts
import { createObs } from "@cody/obs-js";
import Anthropic from "@anthropic-ai/sdk";

const obs = createObs({
  endpoint: process.env.OBS_ENDPOINT!,
  apiKey:   process.env.OBS_API_KEY!,
  app:      process.env.OBS_APP_SLUG!,
});

const client = new Anthropic();

export async function chat(userInput: string, sessionId: string) {
  const start = Date.now();
  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: userInput }],
    });

    // Fire-and-forget; does not block the user response.
    obs.log({
      model:        "claude-sonnet-4-6",
      provider:     "anthropic",
      inputTokens:  res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      latencyMs:    Date.now() - start,
      prompt:       userInput,
      response:     res.content[0].type === "text" ? res.content[0].text : "",
      sessionId,
      status:       "success",
      metadata: {
        feature: "chat",
        locale:  "en",
      },
    });

    return res;
  } catch (err) {
    obs.log({
      model:     "claude-sonnet-4-6",
      provider:  "anthropic",
      latencyMs: Date.now() - start,
      prompt:    userInput,
      sessionId,
      status:    "error",
      metadata:  { error: String(err) },
    });
    throw err;
  }
}
```

### Fire-and-forget vs. awaited

- **Default:** `obs.log(event)` returns immediately. The POST runs in the background. Failures are swallowed and logged to `console.warn` — telemetry should never crash your app.
- **Serverless (Vercel functions, Lambda):** the function may exit before the background POST finishes. Two options:
  - `await obs.log(event, { wait: true })` — blocks until the POST completes.
  - `await obs.flush()` — awaits *all* in-flight dispatches. Call this right before returning your response.

### Retry + timeout

One automatic retry on network or 5xx failure, 5-second timeout per attempt. No backoff — this is best-effort telemetry.

---

## 5. Python (the `cody_obs` SDK)

### Install

```bash
pip install -e /path/to/observability-dashboard/packages/cody_obs
```

### Use (async)

```python
import os, time
from anthropic import AsyncAnthropic
from cody_obs import ObsConfig, ObsEvent, create_obs

obs = create_obs(ObsConfig(
    endpoint=os.environ["OBS_ENDPOINT"],
    api_key=os.environ["OBS_API_KEY"],
    app=os.environ["OBS_APP_SLUG"],
))

client = AsyncAnthropic()

async def chat(prompt: str, session_id: str):
    start = time.monotonic()
    try:
        resp = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        await obs.log(ObsEvent(
            model="claude-sonnet-4-6",
            provider="anthropic",
            input_tokens=resp.usage.input_tokens,
            output_tokens=resp.usage.output_tokens,
            latency_ms=int((time.monotonic() - start) * 1000),
            prompt=prompt,
            response=resp.content[0].text,
            session_id=session_id,
            metadata={"feature": "chat"},
        ))
        return resp
    except Exception as err:
        await obs.log(ObsEvent(
            model="claude-sonnet-4-6",
            provider="anthropic",
            latency_ms=int((time.monotonic() - start) * 1000),
            prompt=prompt,
            session_id=session_id,
            status="error",
            metadata={"error": str(err)},
        ))
        raise
```

### Use (sync / scripts)

```python
from cody_obs import ObsConfig, ObsEvent, create_sync_obs

obs = create_sync_obs(ObsConfig(
    endpoint=os.environ["OBS_ENDPOINT"],
    api_key=os.environ["OBS_API_KEY"],
    app="rag-experiments",
))

obs.log(ObsEvent(
    model="gpt-4o-mini",
    provider="openai",
    input_tokens=120,
    output_tokens=80,
    latency_ms=420,
    prompt="hello",
    response="hi",
))
obs.close()  # flushes pending dispatches
```

### Python field naming

The SDK takes **snake_case** on the Python side (`input_tokens`, `session_id`, `latency_ms`) and converts to the camelCase the collector expects. You don't have to think about it.

---

## 6. Raw HTTP (no SDK)

Any runtime that can do an HTTP POST can integrate. Use this for quick experiments or languages without an SDK:

```bash
curl -X POST "$OBS_ENDPOINT" \
  -H "x-api-key: $OBS_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "app":          "portfolio-chatbot",
    "model":        "claude-sonnet-4-6",
    "provider":     "anthropic",
    "inputTokens":  120,
    "outputTokens": 80,
    "latencyMs":    420,
    "status":       "success",
    "prompt":       "hello",
    "response":     "hi there",
    "sessionId":    "sess_abc",
    "metadata":     { "feature": "chat" }
  }'
```

---

## 7. How cost is computed

- The collector looks up `model_pricing` for the matching `(provider, model)` with the **greatest `effective_from <= now()`**.
- `cost_usd = (inputTokens/1000) * input_per_1k + (outputTokens/1000) * output_per_1k`.
- The computed value is stored on the event row at write time.
- **Historical events are immutable.** If a price changes later, old events keep their original cost. Update pricing at `/admin/pricing` → "Add row" — never edit existing rows.
- If a model is not in the pricing table, the event is still logged, but `cost_usd` is `0`. Add the row at `/admin/pricing` and future events will price correctly.

---

## 8. Checklist for a new app

- [ ] Create app at `/admin/apps` and copy the key
- [ ] Set `OBS_ENDPOINT`, `OBS_API_KEY`, `OBS_APP_SLUG` in the app's env
- [ ] Install the TS or Python SDK (or skip and use `fetch`/`httpx`)
- [ ] Wrap each provider call with a `start = now()` + `obs.log(...)` after
- [ ] Log both success and error paths (set `status: "error"` on failures)
- [ ] Pass any useful `metadata` fields — they'll auto-surface on `/apps/<slug>`
- [ ] For serverless runtimes, `await obs.flush()` before returning
- [ ] Verify events show up on `/live` within 2 seconds
- [ ] Confirm the model exists in `/admin/pricing` so cost isn't `0`
- [ ] (Optional) Set a monthly budget at `/admin/apps` — over-budget triggers the banner

---

## 9. Troubleshooting

| Symptom                              | Likely cause                                                                 |
|--------------------------------------|------------------------------------------------------------------------------|
| `401 missing x-api-key`              | Header not set on the request                                                |
| `401 invalid api key`                | Key typo, or the app was deleted / key rotated                               |
| `400 invalid payload`                | Check `details` in the response — usually a missing `model`/`provider` or a wrong type |
| Events show up but `cost_usd = 0`    | Model not in `model_pricing`. Add a row at `/admin/pricing`                  |
| Events missing from Live Tail        | Check `status` filter on the page, and that your POST returned 200           |
| Serverless function returns before POST completes | Use `{ wait: true }` or `await obs.flush()` before returning       |
| `console.warn [obs] dispatch failed` | Transient network or collector error. One retry already happened; the call is now dropped (by design — never block the app) |

---

## 10. What NOT to do

- **Don't wrap the provider SDK.** This project deliberately uses an observe-only pattern — the caller runs the provider call normally and logs after. Keeps magic low, no version lock to provider SDK releases.
- **Don't edit existing `model_pricing` rows.** Add new rows with a newer `effective_from`. This is what preserves historical cost accuracy.
- **Don't log secrets in `prompt`, `response`, or `metadata`.** Everything is stored as-is and shown in the admin view. There is no PII scrubbing in v1.
- **Don't rely on the banner for real alerts.** The budget banner is a soft pre-alert. There is no email/Slack in v1.
