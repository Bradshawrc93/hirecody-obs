import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;

const state: {
  runs: Row[];
  queryError: { message: string } | null;
  upsertError: { message: string } | null;
  lastUpsert: Row[] | null;
} = { runs: [], queryError: null, upsertError: null, lastUpsert: null };

function makeFakeDb() {
  return {
    from(table: string) {
      if (table === "forge_runs") {
        return {
          select: () => ({
            gte: () => ({
              lt: async () => ({
                data: state.runs,
                error: state.queryError,
              }),
            }),
          }),
        };
      }
      if (table === "forge_daily_metrics") {
        return {
          upsert: (rows: Row[]) => {
            state.lastUpsert = rows;
            return Promise.resolve({ error: state.upsertError });
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

vi.mock("@/lib/forge/cron-auth", () => ({
  isAuthorizedCron: (req: Request) => req.headers.get("x-cron-key") === "ok",
}));

import { POST } from "./route";

function makeReq(headers: Record<string, string> = { "x-cron-key": "ok" }) {
  return new Request("http://x/api/forge/cron/rollup", { method: "POST", headers });
}

beforeEach(() => {
  state.runs = [];
  state.queryError = null;
  state.upsertError = null;
  state.lastUpsert = null;
});

describe("POST /api/forge/cron/rollup", () => {
  it("403 without cron auth", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(403);
  });

  it("rolls up runs per agent", async () => {
    state.runs = [
      {
        agent_id: "a1",
        status: "completed",
        duration_ms: 1000,
        input_tokens: 100,
        output_tokens: 50,
        cost_usd: 0.1,
        user_rating: "up",
      },
      {
        agent_id: "a1",
        status: "failed",
        duration_ms: 500,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        user_rating: "down",
      },
      {
        agent_id: "a2",
        status: "completed",
        duration_ms: 2000,
        input_tokens: 200,
        output_tokens: 100,
        cost_usd: 0.25,
        user_rating: null,
      },
    ];
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const rows = state.lastUpsert as Row[];
    expect(rows).toHaveLength(2);
    const a1 = rows.find((r) => r.agent_id === "a1") as Row;
    expect(a1.total_runs).toBe(2);
    expect(a1.success_runs).toBe(1);
    expect(a1.failed_runs).toBe(1);
    expect(a1.avg_duration_ms).toBe(750);
    expect(a1.avg_rating).toBe(0.5);
    expect(a1.total_cost_usd).toBeCloseTo(0.1);
    const a2 = rows.find((r) => r.agent_id === "a2") as Row;
    expect(a2.avg_rating).toBeNull();
  });

  it("no-op when no runs", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agents_rolled_up).toBe(0);
    expect(state.lastUpsert).toBeNull();
  });
});
