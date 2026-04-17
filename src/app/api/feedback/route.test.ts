import { describe, it, expect, vi, beforeEach } from "vitest";

type AppRow = { id: string; slug: string };
type PgErr = { message: string; code?: string };

const state: {
  app: AppRow | null;
  slugError: PgErr | null;
  authedAppId: string | null;
  insertError: PgErr | null;
  inserted: { id: string; created_at: string } | null;
  lastInsertPayload: Record<string, unknown> | null;
} = {
  app: null,
  slugError: null,
  authedAppId: null,
  insertError: null,
  inserted: null,
  lastInsertPayload: null,
};

function makeFakeDb() {
  return {
    from(table: string) {
      if (table === "apps") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: state.app,
                error: state.slugError,
              }),
            }),
          }),
        };
      }
      if (table === "feedback") {
        return {
          insert: (payload: Record<string, unknown>) => {
            state.lastInsertPayload = payload;
            return {
              select: () => ({
                single: async () => ({
                  data: state.insertError ? null : state.inserted,
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
  authenticateApiKey: async () =>
    state.authedAppId ? { id: state.authedAppId } : null,
}));

import { POST } from "./route";

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://x/api/feedback", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validBody = {
  app_slug: "chatbot",
  entity_type: "chatbot_message",
  entity_id: "msg_abc123",
  vote: "up",
  model: "claude-sonnet-4-6",
};

beforeEach(() => {
  state.app = { id: "chatbot-id", slug: "chatbot" };
  state.slugError = null;
  state.authedAppId = "chatbot-id";
  state.insertError = null;
  state.inserted = { id: "feedback-id", created_at: "2026-04-17T00:00:00Z" };
  state.lastInsertPayload = null;
});

describe("POST /api/feedback", () => {
  it("returns 401 when x-api-key is missing", async () => {
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("missing x-api-key");
  });

  it("returns 400 on invalid payload (missing fields)", async () => {
    const res = await POST(
      makeReq({ app_slug: "chatbot" }, { "x-api-key": "k" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid enum value", async () => {
    const res = await POST(
      makeReq(
        { ...validBody, vote: "maybe" },
        { "x-api-key": "k" },
      ),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is not valid JSON", async () => {
    const res = await POST(makeReq("not-json{", { "x-api-key": "k" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when app slug is not found", async () => {
    state.app = null;
    const res = await POST(makeReq(validBody, { "x-api-key": "k" }));
    expect(res.status).toBe(404);
  });

  it("returns 401 when api key belongs to a different app", async () => {
    state.authedAppId = "different-app-id";
    const res = await POST(makeReq(validBody, { "x-api-key": "k" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when api key is not recognized", async () => {
    state.authedAppId = null;
    const res = await POST(makeReq(validBody, { "x-api-key": "k" }));
    expect(res.status).toBe(401);
  });

  it("returns 201 on first vote (happy path) and persists payload", async () => {
    const res = await POST(makeReq(validBody, { "x-api-key": "k" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.feedback).toEqual(state.inserted);
    expect(state.lastInsertPayload).toEqual({
      app_slug: "chatbot",
      entity_type: "chatbot_message",
      entity_id: "msg_abc123",
      vote: "up",
      model: "claude-sonnet-4-6",
    });
  });

  it("accepts a null model (Forge runs may omit it)", async () => {
    const res = await POST(
      makeReq(
        {
          app_slug: "forge",
          entity_type: "forge_run",
          entity_id: "run_xyz",
          vote: "down",
          model: null,
        },
        { "x-api-key": "k" },
      ),
    );
    expect(res.status).toBe(201);
    expect((state.lastInsertPayload as { model: string | null })?.model).toBe(null);
  });

  it("returns 409 when the entity already has a vote (unique violation)", async () => {
    state.insertError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "feedback_app_slug_entity_type_entity_id_key"',
    };
    const res = await POST(makeReq(validBody, { "x-api-key": "k" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("already voted");
  });

  it("returns 500 on unexpected DB error", async () => {
    state.insertError = { message: "boom" };
    const res = await POST(makeReq(validBody, { "x-api-key": "k" }));
    expect(res.status).toBe(500);
  });
});
