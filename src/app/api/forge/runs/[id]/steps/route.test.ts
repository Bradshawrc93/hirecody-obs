import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;

const state: {
  authedApp: Row | null;
  run: Row | null;
  maxSeq: number | null;
  inserted: Row | null;
  insertError: { message: string } | null;
  steps: Row[];
  lastInsert: Row | null;
  lastSinceFilter: number | null;
} = {
  authedApp: null,
  run: null,
  maxSeq: null,
  inserted: null,
  insertError: null,
  steps: [],
  lastInsert: null,
  lastSinceFilter: null,
};

function makeFakeDb() {
  return {
    from(table: string) {
      if (table === "forge_runs") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: state.run, error: null }),
            }),
          }),
        };
      }
      if (table === "forge_run_steps") {
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
          select: (_cols: string) => {
            const q = {
              _gt: 0,
              eq() {
                return this;
              },
              gt(_col: string, val: number) {
                this._gt = val;
                state.lastSinceFilter = val;
                return this;
              },
              order() {
                return this;
              },
              limit() {
                return this;
              },
              maybeSingle: async () => ({
                data:
                  state.maxSeq === null ? null : { seq: state.maxSeq },
                error: null,
              }),
              then(r: (x: { data: Row[] | null; error: unknown }) => unknown) {
                return Promise.resolve({
                  data: state.steps,
                  error: null,
                }).then(r);
              },
            };
            return q;
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

import { POST, GET } from "./route";

const params = Promise.resolve({ id: "run-1" });

function makeReq(
  method: "POST" | "GET",
  body?: unknown,
  headers: Record<string, string> = { "x-api-key": "k" },
  url = "http://x/api/forge/runs/run-1/steps",
) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  state.authedApp = { id: "app-1" };
  state.run = { id: "run-1", agent_id: "app-1", status: "running" };
  state.maxSeq = null;
  state.inserted = { id: "s-1", run_id: "run-1", seq: 1 };
  state.insertError = null;
  state.steps = [];
  state.lastInsert = null;
  state.lastSinceFilter = null;
});

describe("POST /api/forge/runs/[id]/steps", () => {
  const valid = { step_name: "call_llm", event_type: "start" as const };

  it("401 without api key", async () => {
    state.authedApp = null;
    const res = await POST(makeReq("POST", valid), { params });
    expect(res.status).toBe(401);
  });

  it("404 when run belongs to different agent", async () => {
    state.run = { id: "run-1", agent_id: "other", status: "running" };
    const res = await POST(makeReq("POST", valid), { params });
    expect(res.status).toBe(404);
  });

  it("assigns seq=1 for the first step", async () => {
    const res = await POST(makeReq("POST", valid), { params });
    expect(res.status).toBe(201);
    expect((state.lastInsert as Row).seq).toBe(1);
  });

  it("increments seq from existing max", async () => {
    state.maxSeq = 7;
    await POST(makeReq("POST", valid), { params });
    expect((state.lastInsert as Row).seq).toBe(8);
  });

  it("400 on invalid event_type", async () => {
    const res = await POST(
      makeReq("POST", { step_name: "x", event_type: "bogus" }),
      { params },
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/forge/runs/[id]/steps", () => {
  it("returns steps with last_seq and run_status", async () => {
    state.steps = [
      { id: "s1", seq: 1, step_name: "a", event_type: "start" },
      { id: "s2", seq: 2, step_name: "a", event_type: "complete" },
    ];
    const res = await GET(makeReq("GET"), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.steps).toHaveLength(2);
    expect(body.last_seq).toBe(2);
    expect(body.run_status).toBe("running");
  });

  it("applies since cursor filter", async () => {
    const res = await GET(
      makeReq(
        "GET",
        undefined,
        { "x-api-key": "k" },
        "http://x/api/forge/runs/run-1/steps?since=5",
      ),
      { params },
    );
    expect(res.status).toBe(200);
    expect(state.lastSinceFilter).toBe(5);
  });

  it("400 on invalid since", async () => {
    const res = await GET(
      makeReq(
        "GET",
        undefined,
        { "x-api-key": "k" },
        "http://x/api/forge/runs/run-1/steps?since=abc",
      ),
      { params },
    );
    expect(res.status).toBe(400);
  });

  it("last_seq preserves cursor when no new rows", async () => {
    state.steps = [];
    const res = await GET(
      makeReq(
        "GET",
        undefined,
        { "x-api-key": "k" },
        "http://x/api/forge/runs/run-1/steps?since=10",
      ),
      { params },
    );
    const body = await res.json();
    expect(body.last_seq).toBe(10);
  });
});
