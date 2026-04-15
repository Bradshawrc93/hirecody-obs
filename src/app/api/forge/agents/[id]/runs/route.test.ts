import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;

const state: {
  authedApp: Row | null;
  authedAgent: Row | null;
  listRows: Row[];
  listError: { message: string } | null;
  lastFilter: Record<string, unknown>;
  lastRange: [number, number] | null;
  lastOrder: { col: string; ascending: boolean } | null;
  lastSelectCols: string | null;
} = {
  authedApp: null,
  authedAgent: null,
  listRows: [],
  listError: null,
  lastFilter: {},
  lastRange: null,
  lastOrder: null,
  lastSelectCols: null,
};

function makeFakeDb() {
  return {
    from(table: string) {
      if (table !== "forge_runs") {
        throw new Error(`unexpected table: ${table}`);
      }
      const q = {
        _cols: "" as string,
        select(cols: string) {
          state.lastSelectCols = cols;
          this._cols = cols;
          return this;
        },
        eq(col: string, val: unknown) {
          state.lastFilter[col] = val;
          return this;
        },
        order(col: string, opts: { ascending: boolean }) {
          state.lastOrder = { col, ascending: opts.ascending };
          return this;
        },
        range(a: number, b: number) {
          state.lastRange = [a, b];
          return this;
        },
        then(resolve: (r: { data: Row[]; error: unknown }) => unknown) {
          return Promise.resolve({
            data: state.listRows,
            error: state.listError,
          }).then(resolve);
        },
      };
      return q;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => makeFakeDb(),
}));

vi.mock("@/lib/forge/agents", () => ({
  authenticateForgeAgent: async () => {
    if (!state.authedApp || !state.authedAgent) return null;
    return { app: state.authedApp, agent: state.authedAgent };
  },
}));

import { GET } from "./route";

const params = Promise.resolve({ id: "app-1" });

function makeReq(url = "http://x/api/forge/agents/app-1/runs") {
  return new Request(url, {
    method: "GET",
    headers: { "x-api-key": "k" },
  });
}

beforeEach(() => {
  state.authedApp = { id: "app-1" };
  state.authedAgent = { app_id: "app-1", status: "active" };
  state.listRows = [
    { id: "r1", run_type: "scheduled", status: "completed" },
    { id: "r2", run_type: "test", status: "failed" },
  ];
  state.listError = null;
  state.lastFilter = {};
  state.lastRange = null;
  state.lastOrder = null;
  state.lastSelectCols = null;
});

describe("GET /api/forge/agents/[id]/runs", () => {
  it("401 when unauthenticated", async () => {
    state.authedApp = null;
    const res = await GET(makeReq(), { params });
    expect(res.status).toBe(401);
  });

  it("401 when caller owns a different agent", async () => {
    state.authedApp = { id: "other" };
    const res = await GET(makeReq(), { params });
    expect(res.status).toBe(401);
  });

  it("returns runs scoped to the agent, newest first, default paging", async () => {
    const res = await GET(makeReq(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runs).toHaveLength(2);
    expect(body.limit).toBe(20);
    expect(body.offset).toBe(0);
    expect(state.lastFilter.agent_id).toBe("app-1");
    expect(state.lastOrder).toEqual({ col: "created_at", ascending: false });
    expect(state.lastRange).toEqual([0, 19]);
  });

  it("omits input/output blobs from the select projection", async () => {
    await GET(makeReq(), { params });
    expect(state.lastSelectCols).not.toContain("input_text");
    expect(state.lastSelectCols).not.toContain("output");
    expect(state.lastSelectCols).toContain("duration_ms");
    expect(state.lastSelectCols).toContain("cost_usd");
  });

  it("filters by status and run_type", async () => {
    const res = await GET(
      makeReq(
        "http://x/api/forge/agents/app-1/runs?status=completed&run_type=scheduled",
      ),
      { params },
    );
    expect(res.status).toBe(200);
    expect(state.lastFilter.status).toBe("completed");
    expect(state.lastFilter.run_type).toBe("scheduled");
  });

  it("400 on invalid status filter", async () => {
    const res = await GET(
      makeReq("http://x/api/forge/agents/app-1/runs?status=bogus"),
      { params },
    );
    expect(res.status).toBe(400);
  });

  it("400 on invalid run_type filter", async () => {
    const res = await GET(
      makeReq("http://x/api/forge/agents/app-1/runs?run_type=bogus"),
      { params },
    );
    expect(res.status).toBe(400);
  });

  it("honors limit and offset, clamping limit to [1,100]", async () => {
    await GET(
      makeReq("http://x/api/forge/agents/app-1/runs?limit=50&offset=25"),
      { params },
    );
    expect(state.lastRange).toEqual([25, 74]);

    await GET(
      makeReq("http://x/api/forge/agents/app-1/runs?limit=9999&offset=0"),
      { params },
    );
    expect(state.lastRange).toEqual([0, 99]);

    await GET(
      makeReq("http://x/api/forge/agents/app-1/runs?limit=0&offset=-5"),
      { params },
    );
    expect(state.lastRange).toEqual([0, 0]);
  });

  it("500 on db error", async () => {
    state.listError = { message: "boom" };
    const res = await GET(makeReq(), { params });
    expect(res.status).toBe(500);
  });
});
