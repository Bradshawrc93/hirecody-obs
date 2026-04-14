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
      if (table === "apps") {
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

vi.mock("@/lib/api-keys", () => ({
  generateApiKey: () => "plaintext-key-xyz",
  hashApiKey: async () => "hashed-key",
}));

import { POST } from "./route";

function makeReq(body: unknown) {
  return new Request("http://x/api/admin/apps", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.isAdmin = true;
  state.insertError = null;
  state.inserted = {
    id: "new-id",
    slug: "new-app",
    display_name: "New App",
    monthly_budget_usd: null,
    created_at: "2026-04-14T00:00:00Z",
  };
  state.lastInsertPayload = null;
});

describe("POST /api/admin/apps", () => {
  it("returns 403 when caller is not admin", async () => {
    state.isAdmin = false;
    const res = await POST(makeReq({ slug: "a", display_name: "A" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid slug (uppercase)", async () => {
    const res = await POST(makeReq({ slug: "BadSlug", display_name: "A" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when display_name is missing", async () => {
    const res = await POST(makeReq({ slug: "ok" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is not JSON", async () => {
    const req = new Request("http://x/api/admin/apps", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates an app and returns plaintext key + row", async () => {
    const res = await POST(
      makeReq({
        slug: "new-app",
        display_name: "New App",
        monthly_budget_usd: 100,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.api_key).toBe("plaintext-key-xyz");
    expect(body.app.slug).toBe("new-app");

    const payload = state.lastInsertPayload!;
    expect(payload.slug).toBe("new-app");
    expect(payload.api_key_hash).toBe("hashed-key");
    expect(payload.monthly_budget_usd).toBe(100);
  });

  it("defaults monthly_budget_usd to null when omitted", async () => {
    await POST(makeReq({ slug: "new-app", display_name: "New App" }));
    expect(state.lastInsertPayload!.monthly_budget_usd).toBeNull();
  });

  it("returns 500 when insert fails", async () => {
    state.insertError = { message: "unique violation" };
    state.inserted = null;
    const res = await POST(
      makeReq({ slug: "new-app", display_name: "New App" }),
    );
    expect(res.status).toBe(500);
  });
});
