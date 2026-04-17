import { describe, it, expect, vi, beforeEach } from "vitest";

type AppRow = { id: string } | null;

const state: {
  chatbotApp: AppRow;
  chatbotEventsCount: number | null;
  forgeRunsCount: number | null;
  appsCount: number | null;
} = {
  chatbotApp: null,
  chatbotEventsCount: null,
  forgeRunsCount: null,
  appsCount: null,
};

function makeFakeDb() {
  return {
    from(table: string) {
      if (table === "apps") {
        return {
          select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.head) {
              return Promise.resolve({ count: state.appsCount, error: null });
            }
            return {
              eq: () => ({
                maybeSingle: async () => ({
                  data: state.chatbotApp,
                  error: null,
                }),
              }),
            };
          },
        };
      }
      if (table === "forge_runs") {
        return {
          select: () =>
            Promise.resolve({ count: state.forgeRunsCount, error: null }),
        };
      }
      if (table === "events") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                count: state.chatbotEventsCount,
                error: null,
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

import { GET, OPTIONS } from "./route";

beforeEach(() => {
  state.chatbotApp = { id: "chatbot-id" };
  state.chatbotEventsCount = 0;
  state.forgeRunsCount = 0;
  state.appsCount = 0;
});

describe("GET /api/public/stats", () => {
  it("returns all three counts and an asOf timestamp", async () => {
    state.chatbotEventsCount = 42;
    state.forgeRunsCount = 17;
    state.appsCount = 5;

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chatbotMessages).toBe(42);
    expect(body.forgeRuns).toBe(17);
    expect(body.appsRegistered).toBe(5);
    expect(typeof body.asOf).toBe("string");
  });

  it("sets CORS and cache headers", async () => {
    const res = await GET();
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=60");
  });

  it("returns 0 chatbotMessages when the chatbot app is not registered", async () => {
    state.chatbotApp = null;
    state.chatbotEventsCount = 999; // should be ignored
    const res = await GET();
    const body = await res.json();
    expect(body.chatbotMessages).toBe(0);
  });

  it("coerces null counts to 0", async () => {
    state.forgeRunsCount = null;
    state.appsCount = null;
    const res = await GET();
    const body = await res.json();
    expect(body.forgeRuns).toBe(0);
    expect(body.appsRegistered).toBe(0);
  });

  it("OPTIONS returns 204 with CORS headers", async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
