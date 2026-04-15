import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;

const state: {
  authedApp: Row | null;
  authedAgent: Row | null;
  insertedBuild: Row | null;
  insertError: { message: string } | null;
  lastAgentUpdate: Row | null;
} = {
  authedApp: null,
  authedAgent: null,
  insertedBuild: null,
  insertError: null,
  lastAgentUpdate: null,
};

function makeFakeDb() {
  return {
    from(table: string) {
      if (table === "forge_builds") {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: state.insertedBuild,
                error: state.insertError,
              }),
            }),
          }),
        };
      }
      if (table === "forge_agents") {
        return {
          update: (payload: Row) => {
            state.lastAgentUpdate = payload;
            return { eq: async () => ({ error: null }) };
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
    if (!state.authedApp || !state.authedAgent) return null;
    return { app: state.authedApp, agent: state.authedAgent };
  },
}));

import { POST } from "./route";

const params = Promise.resolve({ id: "app-1" });

function makeReq(body: unknown) {
  return new Request("http://x/api/forge/agents/app-1/builds", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": "k" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.authedApp = { id: "app-1" };
  state.authedAgent = { app_id: "app-1", status: "building" };
  state.insertedBuild = { id: "b-1", attempt_number: 1, status: "success" };
  state.insertError = null;
  state.lastAgentUpdate = null;
});

describe("POST /api/forge/agents/[id]/builds", () => {
  const valid = { attempt_number: 1, prompt: "p", status: "success" as const };

  it("401 when caller owns a different agent", async () => {
    state.authedApp = { id: "other" };
    const res = await POST(makeReq(valid), { params });
    expect(res.status).toBe(401);
  });

  it("400 when attempt_number is invalid", async () => {
    const res = await POST(makeReq({ ...valid, attempt_number: 3 }), { params });
    expect(res.status).toBe(400);
  });

  it("inserts a successful build and advances agent to awaiting_test", async () => {
    const res = await POST(makeReq(valid), { params });
    expect(res.status).toBe(201);
    expect((state.lastAgentUpdate as Row).status).toBe("awaiting_test");
  });

  it("inserts a failed build and advances agent to build_failed", async () => {
    const res = await POST(
      makeReq({ ...valid, status: "failed", error_message: "oops" }),
      { params },
    );
    expect(res.status).toBe(201);
    expect((state.lastAgentUpdate as Row).status).toBe("build_failed");
  });

  it("does not change agent status when build is pending", async () => {
    await POST(makeReq({ ...valid, status: "pending" }), { params });
    expect(state.lastAgentUpdate).toBeNull();
  });

  it("500 on insert failure", async () => {
    state.insertError = { message: "db" };
    state.insertedBuild = null;
    const res = await POST(makeReq(valid), { params });
    expect(res.status).toBe(500);
  });
});
