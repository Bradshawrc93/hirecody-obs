import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;

const state: {
  authedApp: Row | null;
  inserted: Row | null;
  insertError: { message: string } | null;
  lastInsert: Row | null;
} = {
  authedApp: null,
  inserted: null,
  insertError: null,
  lastInsert: null,
};

function makeFakeDb() {
  return {
    from(table: string) {
      if (table === "forge_runs") {
        return {
          insert: (payload: Row) => {
            state.lastInsert = payload;
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

vi.mock("@/lib/forge/agents", () => ({
  authenticateForgeAgent: async () => {
    if (!state.authedApp) return null;
    return { app: state.authedApp, agent: { app_id: state.authedApp.id, status: "active" } };
  },
}));

import { POST } from "./route";

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://x/api/forge/runs", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.authedApp = { id: "app-1" };
  state.inserted = { id: "run-1", agent_id: "app-1", status: "queued", run_type: "test" };
  state.insertError = null;
  state.lastInsert = null;
});

describe("POST /api/forge/runs", () => {
  it("401 without api key", async () => {
    state.authedApp = null;
    const res = await POST(makeReq({ run_type: "test" }));
    expect(res.status).toBe(401);
  });

  it("400 on invalid run_type", async () => {
    const res = await POST(
      makeReq({ run_type: "bogus" }, { "x-api-key": "k" }),
    );
    expect(res.status).toBe(400);
  });

  it("creates a run in queued status", async () => {
    const res = await POST(
      makeReq({ run_type: "test", input_text: "hello" }, { "x-api-key": "k" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.run.id).toBe("run-1");
    const insert = state.lastInsert as Row;
    expect(insert.status).toBe("queued");
    expect(insert.agent_id).toBe("app-1");
    expect(insert.input_text).toBe("hello");
  });
});
