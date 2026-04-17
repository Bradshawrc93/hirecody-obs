import { describe, it, expect, vi, beforeEach } from "vitest";

const state: {
  isAdmin: boolean;
  email: string | null;
  fetchImpl: (input: string, init: RequestInit) => Promise<Response>;
  lastUrl: string | null;
  lastInit: RequestInit | null;
} = {
  isAdmin: true,
  email: "admin@example.com",
  fetchImpl: async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  lastUrl: null,
  lastInit: null,
};

vi.mock("@/lib/supabase/ssr", () => ({
  isAdmin: async () => state.isAdmin,
}));

vi.mock("@/lib/beacon", async () => {
  const actual = await vi.importActual<typeof import("@/lib/beacon")>("@/lib/beacon");
  return {
    ...actual,
    getAdminEmail: async () => state.email,
    beaconFetch: async (path: string, init: { adminEmail?: string; method?: string; headers?: Record<string, string>; body?: BodyInit }) => {
      const url = `https://beacon.test${path}`;
      state.lastUrl = url;
      state.lastInit = init as RequestInit;
      return state.fetchImpl(url, init as RequestInit);
    },
  };
});

import { GET, POST, PATCH, DELETE } from "./route";

function ctx(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

beforeEach(() => {
  state.isAdmin = true;
  state.email = "admin@example.com";
  state.lastUrl = null;
  state.lastInit = null;
  state.fetchImpl = async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
});

describe("/api/admin/beacon/[...path] proxy", () => {
  it("rejects non-admin callers with 403", async () => {
    state.isAdmin = false;
    const res = await GET(new Request("http://x/api/admin/beacon/products"), ctx(["products"]));
    expect(res.status).toBe(403);
    expect(state.lastUrl).toBeNull();
  });

  it("rejects when admin email cannot be resolved", async () => {
    state.email = null;
    const res = await GET(new Request("http://x/api/admin/beacon/products"), ctx(["products"]));
    expect(res.status).toBe(403);
  });

  it("forwards GET with query string preserved", async () => {
    const res = await GET(
      new Request("http://x/api/admin/beacon/releases?limit=10"),
      ctx(["releases"]),
    );
    expect(res.status).toBe(200);
    expect(state.lastUrl).toBe("https://beacon.test/api/admin/releases?limit=10");
    expect(state.lastInit?.method).toBe("GET");
  });

  it("forwards nested paths joined by slash", async () => {
    await GET(
      new Request("http://x/api/admin/beacon/products/foo/scan"),
      ctx(["products", "foo", "scan"]),
    );
    expect(state.lastUrl).toBe("https://beacon.test/api/admin/products/foo/scan");
  });

  it("forwards POST body verbatim", async () => {
    const body = JSON.stringify({ slug: "x", name: "X" });
    await POST(
      new Request("http://x/api/admin/beacon/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
      ctx(["products"]),
    );
    const init = state.lastInit as RequestInit & { body?: string };
    expect(init.method).toBe("POST");
    expect(init.body).toBe(body);
  });

  it("forwards PATCH body verbatim", async () => {
    const body = JSON.stringify({ tagline: "new" });
    await PATCH(
      new Request("http://x/api/admin/beacon/products/foo", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body,
      }),
      ctx(["products", "foo"]),
    );
    const init = state.lastInit as RequestInit & { body?: string };
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(body);
  });

  it("forwards DELETE without a body", async () => {
    await DELETE(
      new Request("http://x/api/admin/beacon/drafts/abc", { method: "DELETE" }),
      ctx(["drafts", "abc"]),
    );
    const init = state.lastInit as RequestInit & { body?: string };
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });

  it("returns upstream status and body on error", async () => {
    state.fetchImpl = async () =>
      new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    const res = await GET(
      new Request("http://x/api/admin/beacon/products/missing"),
      ctx(["products", "missing"]),
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("not found");
  });

  it("returns 502 when upstream throws", async () => {
    state.fetchImpl = async () => {
      throw new Error("boom");
    };
    const res = await GET(
      new Request("http://x/api/admin/beacon/products"),
      ctx(["products"]),
    );
    expect(res.status).toBe(502);
  });

  it("ignores caller-supplied x-admin-email and uses the verified one", async () => {
    state.email = "real@example.com";
    await GET(
      new Request("http://x/api/admin/beacon/products", {
        headers: { "x-admin-email": "attacker@evil.com" },
      }),
      ctx(["products"]),
    );
    const init = state.lastInit as { adminEmail?: string; headers?: Record<string, string> };
    expect(init.adminEmail).toBe("real@example.com");
    // The catch-all only forwards content-type; no admin/auth headers from the caller leak through.
    const headers = init.headers ?? {};
    const keys = Object.keys(headers).map((k) => k.toLowerCase());
    expect(keys).not.toContain("x-admin-email");
    expect(keys).not.toContain("authorization");
    expect(keys).not.toContain("cookie");
  });

  it("returns 404 when path is empty", async () => {
    const res = await GET(new Request("http://x/api/admin/beacon/"), ctx([]));
    expect(res.status).toBe(404);
    expect(state.lastUrl).toBeNull();
  });

  it("forwards empty-body POST (e.g. /scan, /publish)", async () => {
    await POST(
      new Request("http://x/api/admin/beacon/products/foo/scan", { method: "POST" }),
      ctx(["products", "foo", "scan"]),
    );
    const init = state.lastInit as RequestInit & { body?: string };
    expect(init.method).toBe("POST");
    expect(init.body).toBe("");
  });

  it("does not leak upstream details when fetch throws", async () => {
    state.fetchImpl = async () => {
      throw new Error("ECONNREFUSED beacon.test:443");
    };
    const res = await GET(
      new Request("http://x/api/admin/beacon/products"),
      ctx(["products"]),
    );
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe("upstream unavailable");
    expect(JSON.stringify(json)).not.toContain("beacon.test");
  });

  it("forwards admin email so beacon trusts the call", async () => {
    state.email = "cody@example.com";
    await GET(new Request("http://x/api/admin/beacon/products"), ctx(["products"]));
    expect((state.lastInit as { adminEmail?: string }).adminEmail).toBe("cody@example.com");
  });
});
