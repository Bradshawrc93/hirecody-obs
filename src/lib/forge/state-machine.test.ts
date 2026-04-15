import { describe, it, expect } from "vitest";
import { canTransitionAgent, canTransitionRun } from "./state-machine";

describe("canTransitionAgent", () => {
  it("allows building → awaiting_test", () => {
    expect(canTransitionAgent("building", "awaiting_test")).toBe(true);
  });

  it("allows building → build_failed", () => {
    expect(canTransitionAgent("building", "build_failed")).toBe(true);
  });

  it("rejects building → active (must pass through awaiting_test)", () => {
    expect(canTransitionAgent("building", "active")).toBe(false);
  });

  it("allows build_failed → building (retry)", () => {
    expect(canTransitionAgent("build_failed", "building")).toBe(true);
  });

  it("allows awaiting_test → active", () => {
    expect(canTransitionAgent("awaiting_test", "active")).toBe(true);
  });

  it("allows active → paused and paused → active", () => {
    expect(canTransitionAgent("active", "paused")).toBe(true);
    expect(canTransitionAgent("paused", "active")).toBe(true);
  });

  it("rejects expired → active", () => {
    expect(canTransitionAgent("expired", "active")).toBe(false);
  });

  it("allows any non-terminal → deleted except expired-only-to-deleted", () => {
    expect(canTransitionAgent("active", "deleted")).toBe(true);
    expect(canTransitionAgent("paused", "deleted")).toBe(true);
    expect(canTransitionAgent("expired", "deleted")).toBe(true);
  });

  it("rejects anything out of deleted", () => {
    expect(canTransitionAgent("deleted", "active")).toBe(false);
    expect(canTransitionAgent("deleted", "building")).toBe(false);
  });
});

describe("canTransitionRun", () => {
  it("allows queued → running", () => {
    expect(canTransitionRun("queued", "running")).toBe(true);
  });

  it("allows running → completed or failed", () => {
    expect(canTransitionRun("running", "completed")).toBe(true);
    expect(canTransitionRun("running", "failed")).toBe(true);
  });

  it("rejects going backwards", () => {
    expect(canTransitionRun("running", "queued")).toBe(false);
    expect(canTransitionRun("completed", "running")).toBe(false);
  });

  it("terminal states cannot transition", () => {
    expect(canTransitionRun("completed", "failed")).toBe(false);
    expect(canTransitionRun("failed", "completed")).toBe(false);
  });
});
