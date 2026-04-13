# @cody/obs-js

Tiny TypeScript client for the Cody observability collector.

## Install

This package is intentionally unpublished. Depend on it locally:

```json
{
  "dependencies": {
    "@cody/obs-js": "file:../observability-dashboard/packages/obs-js"
  }
}
```

## Use

```ts
import { createObs } from "@cody/obs-js";
import Anthropic from "@anthropic-ai/sdk";

const obs = createObs({
  endpoint: process.env.OBS_ENDPOINT!,          // e.g. https://obs.example.com/api/events
  apiKey:   process.env.OBS_API_KEY!,
  app:      "portfolio-chatbot",
});

const client = new Anthropic();

async function chat(userInput: string, sessionId: string) {
  const start = Date.now();
  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: userInput }],
    });

    obs.log({
      model: "claude-sonnet-4-6",
      provider: "anthropic",
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      latencyMs: Date.now() - start,
      prompt: userInput,
      response: res.content[0].type === "text" ? res.content[0].text : "",
      sessionId,
      status: "success",
    });

    return res;
  } catch (err) {
    obs.log({
      model: "claude-sonnet-4-6",
      provider: "anthropic",
      latencyMs: Date.now() - start,
      prompt: userInput,
      sessionId,
      status: "error",
      metadata: { error: String(err) },
    });
    throw err;
  }
}
```

## Shape

- `obs.log(event, { wait })` — fire-and-forget by default; pass `wait: true` to await.
- `obs.flush()` — await all pending dispatches. Call on serverless shutdown.

Failures never throw into your app. They're logged with `console.warn`.
