import { describe, it, expect, vi, beforeEach } from "vitest";

const state: {
  isAdmin: boolean;
  insertError: { message: string } | null;
  inserted: Record<string, unknown> | null;
  lastInsertPayload: Record<string, unknown> | null;
} = {
  isAdmin: true,
  insertError: null,
  inserted: null,
  lastInsertPayload: null,
};

function makeFakeDb() {
  return {
    from(table: string) {
      if (table === "model_pricing") {
        return {
          insert: (payload: Record<string, unknown>) => {
            state.lastInsertPayload = payload;
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

vi.mock("@/lib/supabase/ssr", () => ({
  isAdmin: async () => state.isAdmin,
}));

import { POST } from "./route";

function makeReq(body: unknown) {
  return new Request("http://x/api/admin/pricing", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.isAdmin = true;
  state.insertError = null;
  state.inserted = {
    id: "pricing-id",
    provider: "openai",
    model: "gpt-4",
    input_per_1k_usd: 0.03,
    output_per_1k_usd: 0.06,
    effective_from: "2026-04-14T00:00:00Z",
  };
  state.lastInsertPayload = null;
});

describe("POST /api/admin/pricing", () => {
  it("returns 403 when caller is not admin", async () => {
    state.isAdmin = false;
    const res = await POST(
      makeReq({
        provider: "openai",
        model: "gpt-4",
        input_per_1k_usd: 0.03,
        output_per_1k_usd: 0.06,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(makeReq({ provider: "openai" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when prices are negative", async () => {
    const res = await POST(
      makeReq({
        provider: "openai",
        model: "gpt-4",
        input_per_1k_usd: -0.01,
        output_per_1k_usd: 0.06,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("inserts pricing row and defaults effective_from to now", async () => {
    const before = Date.now();
    const res = await POST(
      makeReq({
        provider: "openai",
        model: "gpt-4",
        input_per_1k_usd: 0.03,
        output_per_1k_usd: 0.06,
      }),
    );
    expect(res.status).toBe(200);
    const payload = state.lastInsertPayload!;
    expect(payload.provider).toBe("openai");
    expect(payload.model).toBe("gpt-4");
    expect(payload.input_per_1k_usd).toBe(0.03);
    const effectiveFrom = new Date(payload.effective_from as string).getTime();
    expect(effectiveFrom).toBeGreaterThanOrEqual(before);
    expect(effectiveFrom).toBeLessThanOrEqual(Date.now());
  });

  it("honors client-provided effective_from when valid", async () => {
    const iso = "2026-01-01T00:00:00.000Z";
    await POST(
      makeReq({
        provider: "openai",
        model: "gpt-4",
        input_per_1k_usd: 0.03,
        output_per_1k_usd: 0.06,
        effective_from: iso,
      }),
    );
    expect(state.lastInsertPayload!.effective_from).toBe(iso);
  });

  it("returns 500 when insert fails", async () => {
    state.insertError = { message: "db down" };
    state.inserted = null;
    const res = await POST(
      makeReq({
        provider: "openai",
        model: "gpt-4",
        input_per_1k_usd: 0.03,
        output_per_1k_usd: 0.06,
      }),
    );
    expect(res.status).toBe(500);
  });
});
