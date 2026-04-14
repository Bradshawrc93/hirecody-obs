import { describe, it, expect, vi, beforeEach } from "vitest";

type AppRow = { id: string; slug: string };

const state: {
  app: AppRow | null;
  slugError: { message: string } | null;
  events: { cost_usd: number | string | null }[];
  eventsError: { message: string } | null;
  authedAppId: string | null;
} = {
  app: null,
  slugError: null,
  events: [],
  eventsError: null,
  authedAppId: null,
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
      if (table === "events") {
        return {
          select: () => ({
            eq: () => ({
              gte: async () => ({
                data: state.events,
                error: state.eventsError,
              }),
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

vi.mock("@/lib/api-keys", () => ({
  authenticateApiKey: async () =>
    state.authedAppId ? { id: state.authedAppId } : null,
}));

import { GET } from "./route";

function makeReq(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

const params = Promise.resolve({ slug: "app-a" });

beforeEach(() => {
  state.app = { id: "app-a-id", slug: "app-a" };
  state.slugError = null;
  state.events = [];
  state.eventsError = null;
  state.authedAppId = "app-a-id";
});

describe("GET /api/apps/[slug]/spend", () => {
  it("rejects unsupported window with 400", async () => {
    const res = await GET(
      makeReq("http://x/api/apps/app-a/spend?window=month", {
        "x-api-key": "k",
      }),
      { params },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid window");
  });

  it("returns 401 when x-api-key is missing", async () => {
    const res = await GET(
      makeReq("http://x/api/apps/app-a/spend"),
      { params },
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when app slug is not found", async () => {
    state.app = null;
    const res = await GET(
      makeReq("http://x/api/apps/app-a/spend", { "x-api-key": "k" }),
      { params },
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 when api key belongs to a different app", async () => {
    state.authedAppId = "different-app-id";
    const res = await GET(
      makeReq("http://x/api/apps/app-a/spend", { "x-api-key": "k" }),
      { params },
    );
    expect(res.status).toBe(401);
  });

  it("sums cost_usd across events for the window", async () => {
    state.events = [
      { cost_usd: 0.25 },
      { cost_usd: "0.75" },
      { cost_usd: null },
      { cost_usd: 1 },
    ];
    const res = await GET(
      makeReq("http://x/api/apps/app-a/spend?window=today", {
        "x-api-key": "k",
      }),
      { params },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.app).toBe("app-a");
    expect(body.window).toBe("today");
    expect(body.cost_usd).toBeCloseTo(2.0, 5);
    expect(typeof body.windowStart).toBe("string");
  });

  it("returns 0 when there are no events", async () => {
    const res = await GET(
      makeReq("http://x/api/apps/app-a/spend", { "x-api-key": "k" }),
      { params },
    );
    const body = await res.json();
    expect(body.cost_usd).toBe(0);
  });
});
