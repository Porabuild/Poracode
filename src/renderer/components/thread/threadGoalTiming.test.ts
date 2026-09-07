// @vitest-environment node

import { describe, expect, it } from "vitest";
import { resolveGoalElapsedSeconds } from "./threadGoalTiming";
import type { ThreadGoalDockState } from "./threadGoalState";

function activeGoal(overrides: Partial<ThreadGoalDockState> = {}): ThreadGoalDockState {
  return {
    sourceItemId: "goal-1",
    itemState: "completed",
    objective: "Ship the goal dock",
    status: "active",
    action: "set",
    ...overrides,
  };
}

describe("resolveGoalElapsedSeconds", () => {
  it("holds the current second until a full second elapses (no early flip)", () => {
    const state = activeGoal({ timeUsedSeconds: 0, updatedAt: 1000 });
    // 0.6s after the server timestamp: the bubble must still show 0s.
    // Math.round would flip to 1 here, so a re-render triggered by any
    // incoming chat message makes the timer tick faster than real time.
    expect(resolveGoalElapsedSeconds(state, 1000.6, 0)).toBe(0);
    expect(resolveGoalElapsedSeconds(state, 1001.0, 0)).toBe(1);
    expect(resolveGoalElapsedSeconds(state, 1001.6, 0)).toBe(1);
  });

  it("freezes an inactive goal at its reported total without rounding up", () => {
    const state = activeGoal({ status: "complete", timeUsedSeconds: 5.6 });
    expect(resolveGoalElapsedSeconds(state, 9999, 0)).toBe(5);
  });
});
