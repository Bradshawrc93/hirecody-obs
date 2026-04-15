import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;

const state: {
  inserted: Row | null;
  insertError: { message: string } | null;
  lastInsert: Row | null;
} = { inserted: null, insertError: null, lastInsert: null };

function makeFakeDb() {
  return {
    from(table: string) {
      if (table === "forge_feedback") {
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

import { POST } from "./route";

function makeReq(body: unknown) {
  return new Request("http://x/api/forge/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.inserted = { id: "f1", created_at: "2026-04-14T00:00:00Z" };
  state.insertError = null;
  state.lastInsert = null;
});

describe("POST /api/forge/feedback", () => {
  it("400 when feedback_text missing", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("400 when feedback_text empty", async () => {
    const res = await POST(makeReq({ feedback_text: "" }));
    expect(res.status).toBe(400);
  });

  it("inserts and returns 201", async () => {
    const res = await POST(
      makeReq({ feedback_text: "thing broke", email: "a@b.com" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.feedback.id).toBe("f1");
    expect((state.lastInsert as Row).email).toBe("a@b.com");
  });

  it("allows null email and agent_id", async () => {
    const res = await POST(makeReq({ feedback_text: "anon" }));
    expect(res.status).toBe(201);
    expect((state.lastInsert as Row).email).toBeNull();
    expect((state.lastInsert as Row).agent_id).toBeNull();
  });
});
