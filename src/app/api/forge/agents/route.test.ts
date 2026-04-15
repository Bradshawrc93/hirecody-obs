import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;

const state: {
  insertedApp: Row | null;
  insertAppError: { message: string } | null;
  insertedAgent: Row | null;
  insertAgentError: { message: string } | null;
  listAgents: Row[];
  listError: { message: string } | null;
  lastAppInsert: Row | null;
  lastAgentInsert: Row | null;
  lastAppDeleteId: string | null;
  lastListFilter: Record<string, unknown>;
} = {
  insertedApp: null,
  insertAppError: null,
  insertedAgent: null,
  insertAgentError: null,
  listAgents: [],
  listError: null,
  lastAppInsert: null,
  lastAgentInsert: null,
  lastAppDeleteId: null,
  lastListFilter: {},
};

function makeFakeDb() {
  return {
    from(table: string) {
      if (table === "apps") {
        return {
          insert: (payload: Row) => {
            state.lastAppInsert = payload;
            return {
              select: () => ({
                single: async () => ({
                  data: state.insertedApp,
                  error: state.insertAppError,
                }),
              }),
            };
          },
          delete: () => ({
            eq: async (_col: string, id: string) => {
              state.lastAppDeleteId = id;
              return { error: null };
            },
          }),
        };
      }
      if (table === "forge_agents") {
        return {
          insert: (payload: Row) => {
            state.lastAgentInsert = payload;
            return {
              select: () => ({
                single: async () => ({
                  data: state.insertedAgent,
                  error: state.insertAgentError,
                }),
              }),
            };
          },
          select: () => {
            const q = {
              _filter: {} as Record<string, unknown>,
              neq(col: string, val: unknown) {
                this._filter[`neq_${col}`] = val;
                return this;
              },
              order() {
                return this;
              },
              eq(col: string, val: unknown) {
                this._filter[col] = val;
                return this;
              },
              then(resolve: (r: { data: Row[]; error: unknown }) => unknown) {
                state.lastListFilter = this._filter;
                return Promise.resolve({
                  data: state.listAgents,
                  error: state.listError,
                }).then(resolve);
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

vi.mock("@/lib/api-keys", () => ({
  generateApiKey: () => "obs_fake_key",
  hashApiKey: async () => "hashed",
}));

import { POST, GET } from "./route";

function makeReq(
  method: "POST" | "GET",
  body?: unknown,
  url = "http://x/api/forge/agents",
) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  state.insertedApp = {
    id: "app-1",
    slug: "agent-one",
    display_name: "Agent One",
    created_at: "2026-04-14T00:00:00Z",
  };
  state.insertAppError = null;
  state.insertedAgent = { app_id: "app-1", description: "Test agent", status: "building" };
  state.insertAgentError = null;
  state.listAgents = [];
  state.listError = null;
  state.lastAppInsert = null;
  state.lastAgentInsert = null;
  state.lastAppDeleteId = null;
  state.lastListFilter = {};
});

describe("POST /api/forge/agents", () => {
  const validBody = {
    slug: "agent-one",
    display_name: "Agent One",
    description: "A test agent",
  };

  it("returns 400 on invalid slug", async () => {
    const res = await POST(makeReq("POST", { ...validBody, slug: "Bad Slug" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on missing required fields", async () => {
    const res = await POST(makeReq("POST", { slug: "agent-one" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on malformed json", async () => {
    const req = new Request("http://x/api/forge/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates app + agent and returns api_key once", async () => {
    const res = await POST(makeReq("POST", validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.api_key).toBe("obs_fake_key");
    expect(body.app.id).toBe("app-1");
    expect(body.agent).toBeTruthy();
    expect((state.lastAppInsert as Row).type).toBe("forge");
    expect((state.lastAgentInsert as Row).app_id).toBe("app-1");
  });

  it("rolls back app when agent insert fails", async () => {
    state.insertAgentError = { message: "constraint violation" };
    state.insertedAgent = null;
    const res = await POST(makeReq("POST", validBody));
    expect(res.status).toBe(500);
    expect(state.lastAppDeleteId).toBe("app-1");
  });

  it("returns 500 when app insert fails", async () => {
    state.insertAppError = { message: "duplicate slug" };
    state.insertedApp = null;
    const res = await POST(makeReq("POST", validBody));
    expect(res.status).toBe(500);
  });

  it("computes next_run_at when schedule provided", async () => {
    await POST(
      makeReq("POST", {
        ...validBody,
        schedule_cadence: "daily",
        schedule_time: "09:00:00",
      }),
    );
    const insert = state.lastAgentInsert as Row;
    expect(insert.next_run_at).toBeTruthy();
  });

  it("leaves next_run_at null when no schedule", async () => {
    await POST(makeReq("POST", validBody));
    const insert = state.lastAgentInsert as Row;
    expect(insert.next_run_at).toBeNull();
  });

  it("ignores client-supplied creator_type and forces 'visitor'", async () => {
    await POST(
      makeReq("POST", { ...validBody, creator_type: "owner" }),
    );
    const insert = state.lastAgentInsert as Row;
    expect(insert.creator_type).toBe("visitor");
  });
});

describe("GET /api/forge/agents", () => {
  it("returns agents and excludes deleted", async () => {
    state.listAgents = [{ app_id: "a", description: "x", status: "active" }];
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agents).toHaveLength(1);
    expect(state.lastListFilter.neq_status).toBe("deleted");
  });

  it("filters by creator_type", async () => {
    const res = await GET(
      makeReq("GET", undefined, "http://x/api/forge/agents?creator_type=owner"),
    );
    expect(res.status).toBe(200);
    expect(state.lastListFilter.creator_type).toBe("owner");
  });
});
