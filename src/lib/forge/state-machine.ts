import type { ForgeAgentStatus, ForgeRunStatus } from "./types";

// Agent lifecycle state machine.
//
// building ─► build_failed (retry → building) ─► awaiting_test
//                                                   │
//                                                   ▼
//                                            test_failed (retry → building)
//                                                   │
//                                                   ▼
//                                                 active ◄──► paused
//                                                   │
//                                                   ▼
//                                                expired ─► deleted
//
// A deleted row is terminal. An expired row can be reactivated only via
// an owner override (not exposed through the public API).

const AGENT_TRANSITIONS: Record<ForgeAgentStatus, ForgeAgentStatus[]> = {
  building: ["awaiting_test", "build_failed"],
  build_failed: ["building", "deleted"],
  awaiting_test: ["active", "test_failed", "deleted"],
  test_failed: ["building", "deleted"],
  active: ["paused", "expired", "deleted"],
  paused: ["active", "expired", "deleted"],
  expired: ["deleted"],
  deleted: [],
};

export function canTransitionAgent(
  from: ForgeAgentStatus,
  to: ForgeAgentStatus,
): boolean {
  return AGENT_TRANSITIONS[from]?.includes(to) ?? false;
}

// Run lifecycle: queued → running → (completed | failed).
// A run cannot go back to an earlier state and completed/failed are terminal.
const RUN_TRANSITIONS: Record<ForgeRunStatus, ForgeRunStatus[]> = {
  queued: ["running", "failed"],
  running: ["completed", "failed"],
  completed: [],
  failed: [],
};

export function canTransitionRun(
  from: ForgeRunStatus,
  to: ForgeRunStatus,
): boolean {
  return RUN_TRANSITIONS[from]?.includes(to) ?? false;
}
