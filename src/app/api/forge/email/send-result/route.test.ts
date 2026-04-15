import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;

const state: {
  authed: { app: Row; agent: Row } | null;
  sendCount: number;
  countError: { message: string } | null;
  sendThrows: Error | null;
  sendResult: string;
  insertedRows: Row[];
} = {
  authed: null,
  sendCount: 0,
  countError: null,
  sendThrows: null,
  sendResult: "msg_123",
  insertedRows: [],
};

function makeFakeDb() {
  return {
    from(table: string) {
      if (table === "forge_agent_email_sends") {
        return {
          select: () => ({
            eq: () => ({
              gte: async () => ({
                count: state.sendCount,
                error: state.countError,
                data: null,
              }),
            }),
          }),
          insert: async (row: Row) => {
            state.insertedRows.push(row);
            return { error: null };
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
  authenticateForgeAgent: async () => state.authed,
}));

vi.mock("@/lib/forge/email", () => ({
  sendAgentResultEmail: async (
    _to: string,
    _subject: string,
    _body: string,
    _format: string,
  ) => {
    if (state.sendThrows) throw state.sendThrows;
    return state.sendResult;
  },
}));

import { POST } from "./route";

function makeReq(body: unknown, apiKey: string | null = "k1") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;
  return new Request("http://x/api/forge/email/send-result", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.authed = {
    app: { id: "a1", type: "forge" },
    agent: {
      app_id: "a1",
      can_send_email: true,
      verified_email: "owner@example.com",
    },
  };
  state.sendCount = 0;
  state.countError = null;
  state.sendThrows = null;
  state.sendResult = "msg_123";
  state.insertedRows = [];
});

const valid = { subject: "hi", body: "hello" };

describe("POST /api/forge/email/send-result", () => {
  it("401 when api key is missing / auth returns null", async () => {
    state.authed = null;
    const res = await POST(makeReq(valid, null));
    expect(res.status).toBe(401);
  });

  it("400 on missing subject", async () => {
    const res = await POST(makeReq({ body: "hi" }));
    expect(res.status).toBe(400);
  });

  it("400 on empty body", async () => {
    const res = await POST(makeReq({ subject: "s", body: "" }));
    expect(res.status).toBe(400);
  });

  it("403 when can_send_email is false", async () => {
    state.authed!.agent.can_send_email = false;
    const res = await POST(makeReq(valid));
    expect(res.status).toBe(403);
  });

  it("403 when verified_email is null", async () => {
    state.authed!.agent.verified_email = null;
    const res = await POST(makeReq(valid));
    expect(res.status).toBe(403);
  });

  it("429 when daily limit already reached", async () => {
    state.sendCount = 10;
    const res = await POST(makeReq(valid));
    expect(res.status).toBe(429);
  });

  it("502 when Resend delivery fails", async () => {
    state.sendThrows = new Error("resend failed: 500");
    const res = await POST(makeReq(valid));
    expect(res.status).toBe(502);
  });

  it("200 on success and logs the send", async () => {
    const res = await POST(makeReq(valid));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; message_id: string };
    expect(json.ok).toBe(true);
    expect(json.message_id).toBe("msg_123");
    expect(state.insertedRows).toHaveLength(1);
    expect(state.insertedRows[0]).toMatchObject({
      agent_id: "a1",
      to_email: "owner@example.com",
      subject: "hi",
      message_id: "msg_123",
    });
  });

  it("accepts html format", async () => {
    const res = await POST(makeReq({ ...valid, format: "html" }));
    expect(res.status).toBe(200);
  });

  it("400 on invalid format value", async () => {
    const res = await POST(makeReq({ ...valid, format: "markdown" }));
    expect(res.status).toBe(400);
  });
});
