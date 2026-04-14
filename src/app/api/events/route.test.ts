import { describe, it, expect, vi, beforeEach } from "vitest";

const state: {
  authedApp: { id: string } | null;
  insertError: { message: string } | null;
  inserted: { id: string; cost_usd: number } | null;
  lastInsertPayload: Record<string, unknown> | null;
  computedCost: number;
} = {
  authedApp: null,
  insertError: null,
  inserted: null,
  lastInsertPayload: null,
  computedCost: 0,
};

function makeFakeDb() {
  return {
    from(table: string) {
      if (table === "events") {
        return {
          insert: (payload: Record<string, unknown>) => {
            state.lastInsertPayload = payload;
            return {
              select: () => ({
                single: async () => ({
                  data: state.inserted,
                  error: state.insertError,
                }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => makeFakeDb(),
}));

vi.mock("@/lib/api-keys", () => ({
  authenticateApiKey: async () => state.authedApp,
}));

vi.mock("@/lib/pricing", () => ({
  computeCostUsd: async () => state.computedCost,
}));

import { POST } from "./route";

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://x/api/events", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  state.authedApp = { id: "app-id" };
  state.insertError = null;
  state.inserted = { id: "event-id", cost_usd: 0.5 };
  state.lastInsertPayload = null;
  state.computedCost = 0.5;
});

describe("POST /api/events", () => {
  it("returns 401 when x-api-key is missing", async () => {
    const res = await POST(makeReq({ model: "gpt-4", provider: "openai" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when api key is invalid", async () => {
    state.authedApp = null;
    const res = await POST(
      makeReq({ model: "gpt-4", provider: "openai" }, { "x-api-key": "k" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on malformed JSON", async () => {
    const res = await POST(makeReq("not-json", { "x-api-key": "k" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid json");
  });

  it("returns 400 when payload fails zod validation", async () => {
    const res = await POST(
      makeReq({ provider: "openai" }, { "x-api-key": "k" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid payload");
  });

  it("returns 400 when inputTokens is negative", async () => {
    const res = await POST(
      makeReq(
        { model: "gpt-4", provider: "openai", inputTokens: -1 },
        { "x-api-key": "k" },
      ),
    );
    expect(res.status).toBe(400);
  });

  it("inserts with computed cost and returns id + cost_usd", async () => {
    state.computedCost = 0.42;
    state.inserted = { id: "event-123", cost_usd: 0.42 };
    const res = await POST(
      makeReq(
        {
          model: "gpt-4",
          provider: "openai",
          inputTokens: 100,
          outputTokens: 50,
          latencyMs: 250,
        },
        { "x-api-key": "k" },
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("event-123");
    expect(body.cost_usd).toBe(0.42);

    const payload = state.lastInsertPayload!;
    expect(payload.app_id).toBe("app-id");
    expect(payload.cost_usd).toBe(0.42);
    expect(payload.input_tokens).toBe(100);
    expect(payload.output_tokens).toBe(50);
    expect(payload.latency_ms).toBe(250);
    expect(payload.status).toBe("success");
  });

  it("returns 500 when insert fails", async () => {
    state.insertError = { message: "db down" };
    state.inserted = null;
    const res = await POST(
      makeReq(
        { model: "gpt-4", provider: "openai" },
        { "x-api-key": "k" },
      ),
    );
    expect(res.status).toBe(500);
  });

  it("defaults metadata to {} and status to success", async () => {
    await POST(
      makeReq(
        { model: "gpt-4", provider: "openai" },
        { "x-api-key": "k" },
      ),
    );
    const payload = state.lastInsertPayload!;
    expect(payload.metadata).toEqual({});
    expect(payload.status).toBe("success");
    expect(payload.latency_ms).toBeNull();
  });
});
