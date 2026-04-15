import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;

const state: {
  authedApp: Row | null;
  authedAgent: Row | null;
  updatedAgent: Row | null;
  updateError: { message: string } | null;
  lastUpdatePayload: Row | null;
  builds: Row[];
} = {
  authedApp: null,
  authedAgent: null,
  updatedAgent: null,
  updateError: null,
  lastUpdatePayload: null,
  builds: [],
};

function makeFakeDb() {
  return {
    from(table: string) {
      if (table === "forge_agents") {
        const chain: Record<string, unknown> = {
          eq() {
            return chain;
          },
          select() {
            return chain;
          },
          maybeSingle: async () => ({
            data: state.updatedAgent,
            error: state.updateError,
          }),
          single: async () => ({
            data: state.updatedAgent,
            error: state.updateError,
          }),
          then(r: (v: { error: unknown }) => unknown) {
            return Promise.resolve({ error: state.updateError }).then(r);
          },
        };
        return {
          update: (payload: Row) => {
            state.lastUpdatePayload = payload;
            return chain;
          },
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: state.authedAgent, error: null }) }),
          }),
        };
      }
      if (table === "forge_builds") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: state.builds, error: null }),
            }),
          }),
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
    if (!state.authedApp || !state.authedAgent) return null;
    return { app: state.authedApp, agent: state.authedAgent };
  },
}));

import { GET, PATCH, DELETE } from "./route";

function makeReq(
  method: "GET" | "PATCH" | "DELETE",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request("http://x/api/forge/agents/app-1", {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const params = Promise.resolve({ id: "app-1" });

beforeEach(() => {
  state.authedApp = { id: "app-1", slug: "agent-one" };
  state.authedAgent = {
    app_id: "app-1",
    status: "active",
    schedule_cadence: null,
    schedule_time: null,
  };
  state.updatedAgent = { app_id: "app-1", status: "paused" };
  state.updateError = null;
  state.lastUpdatePayload = null;
  state.builds = [];
});

describe("GET /api/forge/agents/[id]", () => {
  it("returns 401 without api key", async () => {
    state.authedApp = null;
    const res = await GET(makeReq("GET"), { params });
    expect(res.status).toBe(401);
  });

  it("returns 401 when key does not match id", async () => {
    state.authedApp = { id: "other-app" };
    const res = await GET(makeReq("GET", undefined, { "x-api-key": "k" }), {
      params,
    });
    expect(res.status).toBe(401);
  });

  it("returns agent detail plus builds", async () => {
    state.builds = [{ id: "b1", attempt_number: 1, status: "success" }];
    const res = await GET(makeReq("GET", undefined, { "x-api-key": "k" }), {
      params,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agent.app_id).toBe("app-1");
    expect(body.builds).toHaveLength(1);
  });
});

describe("PATCH /api/forge/agents/[id]", () => {
  it("rejects invalid status transition with 409", async () => {
    state.authedAgent = { ...(state.authedAgent as Row), status: "expired" };
    const res = await PATCH(
      makeReq("PATCH", { status: "active" }, { "x-api-key": "k" }),
      { params },
    );
    expect(res.status).toBe(409);
  });

  it("allows valid transition active → paused", async () => {
    const res = await PATCH(
      makeReq("PATCH", { status: "paused" }, { "x-api-key": "k" }),
      { params },
    );
    expect(res.status).toBe(200);
    expect((state.lastUpdatePayload as Row).status).toBe("paused");
  });

  it("recomputes next_run_at when schedule fields change", async () => {
    const res = await PATCH(
      makeReq(
        "PATCH",
        { schedule_cadence: "daily", schedule_time: "09:00:00" },
        { "x-api-key": "k" },
      ),
      { params },
    );
    expect(res.status).toBe(200);
    const payload = state.lastUpdatePayload as Row;
    expect(payload.next_run_at).toBeTruthy();
  });

  it("returns 400 on invalid payload", async () => {
    const res = await PATCH(
      makeReq("PATCH", { schedule_time: "bad" }, { "x-api-key": "k" }),
      { params },
    );
    expect(res.status).toBe(400);
  });

  it("rejects user-set status='expired' at schema level", async () => {
    const res = await PATCH(
      makeReq("PATCH", { status: "expired" }, { "x-api-key": "k" }),
      { params },
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 when TOCTOU guard catches a stale status PATCH", async () => {
    // updatedAgent=null simulates the row having moved states under us:
    // the `.eq("status", <old>)` guard matches zero rows.
    state.updatedAgent = null;
    const res = await PATCH(
      makeReq("PATCH", { status: "paused" }, { "x-api-key": "k" }),
      { params },
    );
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/forge/agents/[id]", () => {
  it("soft-deletes by flipping status", async () => {
    const res = await DELETE(
      makeReq("DELETE", undefined, { "x-api-key": "k" }),
      { params },
    );
    expect(res.status).toBe(200);
    expect((state.lastUpdatePayload as Row).status).toBe("deleted");
  });

  it("returns 401 without valid auth", async () => {
    state.authedApp = null;
    const res = await DELETE(makeReq("DELETE"), { params });
    expect(res.status).toBe(401);
  });
});
