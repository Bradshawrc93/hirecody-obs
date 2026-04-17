# Chatbot — Feedback Instrumentation Sub-spec

## Context

This spec is a handoff from the Obs (observability dashboard) project. Obs needs a per-message success signal from Chatbot so it can compute cost-per-helpful-answer, thumbs-up rate, and an "Improvement Backlog" of thumbs-down messages.

You (the implementer) do not need Obs context beyond this document. Everything Obs needs is captured in the event contract below.

## Goal

Add a minimal thumbs-up / thumbs-down control under each assistant message. Record the vote server-side, enforce one vote per message, and emit a feedback event to Obs.

## Non-goals (v1)

- No user identity, no IP tracking. Votes are anonymous.
- No "change your vote" / "remove your vote" UX. First vote wins and locks.
- No aggregated feedback UI inside Chatbot itself — Chatbot emits, Obs displays.
- No feedback on user messages — only on assistant responses.

## UX

- Under each assistant message, render an icon-only thumbs-up / thumbs-down pair, right-aligned, subtle gray.
- Before vote: both icons present, both clickable.
- On click: the clicked icon fills in (visual state = voted), the *other* icon disappears, the filled icon becomes disabled/non-interactive.
- No toast, no "thanks" message. The visual state change is the confirmation.
- If the Obs POST fails (network, 409, 5xx): log the error, keep the UI in its voted state, do not retry automatically. Do not show an error to the user — this is non-critical telemetry.
- Earlier messages in a loaded thread that were never voted remain unvoted — do not persist a "locked, no vote" state for old messages unless the server says one exists.

## Data & contract

### Local persistence

Each assistant message already has a stable `message_id` (UUID or equivalent). If not, add one. The vote state is persisted on the message record:

- `feedback_vote`: `null` | `'up'` | `'down'` (nullable; `null` means no vote yet).
- `feedback_voted_at`: nullable timestamp.

On render, if `feedback_vote` is non-null, show the locked/voted UI for that message.

### Server enforcement

The server-side handler for "record vote" must:

1. Reject if `feedback_vote` is already non-null for that `message_id` (return a 409 or equivalent to the client).
2. Otherwise, set `feedback_vote` and `feedback_voted_at` in a single transaction.
3. Fire the Obs emission (below) *after* the local write succeeds. If Obs returns 409, that's fine — the local state is the source of truth for UI; Obs returning 409 just means something already posted on behalf of this message (shouldn't happen, but don't crash).

### Obs emission

`POST https://<obs-host>/api/feedback`

Headers:
- `Content-Type: application/json`
- `x-api-key: <CHATBOT_OBS_API_KEY>` — store in env, not in code.

Body:

```json
{
  "app_slug": "chatbot",
  "entity_type": "chatbot_message",
  "entity_id": "<message_id>",
  "vote": "up" | "down",
  "model": "<model_name_used_for_the_assistant_reply>"
}
```

Expected responses:
- `201` — recorded. Done.
- `409` — Obs already has a vote for this entity. Log and move on; do not surface to user.
- `401` — bad/missing API key. Log loudly, alert. Do NOT retry with a different key.
- `400` — schema mismatch. Log loudly — this is a contract break that needs code fixing.

Timeouts: 5s. On timeout, log and move on. Do not block the user's next message on Obs availability.

## Environment

- `CHATBOT_OBS_API_KEY` — provisioned by Obs. Add to `.env.local`, `.env.example`, and deployment secrets.
- `OBS_BASE_URL` — e.g. `https://obs.example.com`. Add to env.

## Testing

- Unit test the vote handler: 409 on double-vote, 200 on first vote, correct payload shape sent to Obs (mock the fetch).
- UI test: clicking thumb locks the UI. Clicking again does nothing. Other thumb disappears.
- E2E happy path: send message → assistant replies → click thumb → message record has `feedback_vote` set → mocked Obs endpoint received correct payload.
- Error path: Obs returns 500 → local state still shows voted → no user-visible error.

## Out of scope

- Vote changing / undoing.
- Aggregated feedback display inside Chatbot.
- Per-user or per-session dedupe (not possible without identity, and v1 explicitly doesn't want it).
- Feedback on tool calls, system messages, or streaming partials — only the final assistant message.

## Handoff deliverables

When done:
1. Env vars `CHATBOT_OBS_API_KEY` and `OBS_BASE_URL` in `.env.example`.
2. Schema migration adding `feedback_vote` + `feedback_voted_at` to the messages table (or equivalent).
3. Updated message rendering with thumbs UI.
4. Server handler that enforces one-vote and emits to Obs.
5. Tests covering the above.
6. A one-line note back to Cody confirming the Obs API key is in the deployment secret store.
