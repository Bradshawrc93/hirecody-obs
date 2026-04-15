import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;

const state: {
  row: Row | null;
  lastUpdate: Row | null;
  compareResult: boolean;
} = { row: null, lastUpdate: null, compareResult: true };

function makeFakeDb() {
  return {
    from(table: string) {
      if (table === "forge_email_verifications") {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: state.row, error: null }),
                  }),
                }),
              }),
            }),
          }),
          update: (payload: Row) => {
            state.lastUpdate = payload;
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

vi.mock("bcryptjs", () => ({
  default: {
    compare: async () => state.compareResult,
    hash: async () => "hashed",
  },
}));

import { POST } from "./route";

function makeReq(body: unknown) {
  return new Request("http://x/api/forge/email/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.row = {
    id: "v1",
    email: "a@b.com",
    code_hash: "hashed",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    attempts: 0,
  };
  state.lastUpdate = null;
  state.compareResult = true;
});

describe("POST /api/forge/email/verify", () => {
  const valid = { email: "a@b.com", code: "123456" };

  it("400 on bad email", async () => {
    const res = await POST(makeReq({ email: "x", code: "123456" }));
    expect(res.status).toBe(400);
  });

  it("400 on non-6-digit code", async () => {
    const res = await POST(makeReq({ email: "a@b.com", code: "12" }));
    expect(res.status).toBe(400);
  });

  it("404 when no pending row", async () => {
    state.row = null;
    const res = await POST(makeReq(valid));
    expect(res.status).toBe(404);
  });

  it("410 when code expired", async () => {
    state.row = { ...(state.row as Row), expires_at: new Date(Date.now() - 60_000).toISOString() };
    const res = await POST(makeReq(valid));
    expect(res.status).toBe(410);
  });

  it("429 when attempts exhausted", async () => {
    state.row = { ...(state.row as Row), attempts: 5 };
    const res = await POST(makeReq(valid));
    expect(res.status).toBe(429);
  });

  it("401 on wrong code and increments attempts", async () => {
    state.compareResult = false;
    const res = await POST(makeReq(valid));
    expect(res.status).toBe(401);
    expect((state.lastUpdate as Row).attempts).toBe(1);
  });

  it("200 on correct code and marks consumed", async () => {
    const res = await POST(makeReq(valid));
    expect(res.status).toBe(200);
    expect((state.lastUpdate as Row).consumed_at).toBeTruthy();
  });
});
