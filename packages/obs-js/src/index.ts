/**
 * @cody/obs-js — thin client for the Cody observability collector.
 *
 * Usage:
 *
 *   import { createObs } from "@cody/obs-js";
 *
 *   const obs = createObs({
 *     endpoint: "https://obs.codybradshaw.com/api/events",
 *     apiKey: process.env.OBS_API_KEY!,
 *     app: "portfolio-chatbot",
 *   });
 *
 *   const start = Date.now();
 *   const res = await anthropic.messages.create({ ... });
 *   obs.log({
 *     model: "claude-sonnet-4-6",
 *     provider: "anthropic",
 *     inputTokens: res.usage.input_tokens,
 *     outputTokens: res.usage.output_tokens,
 *     latencyMs: Date.now() - start,
 *     prompt: userInput,
 *     response: res.content[0].text,
 *     sessionId,
 *     status: "success",
 *   });
 *
 * Design notes:
 * - Observe-only: we do NOT wrap the provider SDK. The caller runs the
 *   provider call normally, measures latency, then calls obs.log().
 * - Fire-and-forget: log() kicks off a POST but does not await it by
 *   default, so observability can never block a user-facing response.
 *   Callers who want to await (e.g., serverless where the function may
 *   exit) can pass { wait: true } or await obs.flush().
 * - One retry on network/5xx. Failures are swallowed and logged to
 *   console.warn — we never want to crash a calling app for telemetry.
 */

export interface ObsConfig {
  endpoint: string;
  apiKey: string;
  app: string;
  /** Max ms to wait for the POST before giving up. Default 5000. */
  timeoutMs?: number;
}

export interface ObsEvent {
  model: string;
  provider: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  status?: "success" | "error";
  prompt?: string | null;
  response?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
  timestamp?: string;
}

export interface LogOptions {
  /** If true, await the POST before returning. Default false. */
  wait?: boolean;
}

export interface Obs {
  log(event: ObsEvent, opts?: LogOptions): Promise<void>;
  /** Await all pending fire-and-forget dispatches. Useful on shutdown. */
  flush(): Promise<void>;
}

export function createObs(config: ObsConfig): Obs {
  const inflight = new Set<Promise<void>>();
  const timeoutMs = config.timeoutMs ?? 5000;

  async function dispatch(event: ObsEvent): Promise<void> {
    const body = JSON.stringify({ app: config.app, ...event });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    const attempt = async () => {
      const res = await fetch(config.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": config.apiKey,
        },
        body,
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`obs: ${res.status} ${res.statusText}`);
    };

    try {
      try {
        await attempt();
      } catch {
        // One retry on failure. No backoff — this is best-effort telemetry.
        await attempt();
      }
    } catch (err) {
      console.warn("[obs] dispatch failed:", err);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async log(event, opts) {
      const p = dispatch(event);
      inflight.add(p);
      p.finally(() => inflight.delete(p));
      if (opts?.wait) await p;
    },
    async flush() {
      await Promise.all(Array.from(inflight));
    },
  };
}
