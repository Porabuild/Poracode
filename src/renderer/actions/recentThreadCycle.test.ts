import { describe, expect, it } from "vitest";
import { computeRecentCycleTarget, type RecentCycleAnchor } from "./recentThreadCycle";

describe("computeRecentCycleTarget", () => {
  it("has nothing to cycle to when there are no candidates", () => {
    expect(
      computeRecentCycleTarget({
        candidateOrder: [],
        activeThreadId: null,
        anchor: null,
        direction: 1,
      }),
    ).toEqual({ targetThreadId: null, anchor: null });
  });

  it("steps to the next (older) recently-viewed chat on a fresh cycle", () => {
    // MRU: a (current) -> b -> c
    const result = computeRecentCycleTarget({
      candidateOrder: ["a", "b", "c"],
      activeThreadId: "a",
      anchor: null,
      direction: 1,
    });
    expect(result.targetThreadId).toBe("b");
    expect(result.anchor).toEqual({ order: ["a", "b", "c"], index: 1 });
  });

  it("steps to the previous (newer) chat, wrapping past the most-recent", () => {
    const result = computeRecentCycleTarget({
      candidateOrder: ["a", "b", "c"],
      activeThreadId: "a",
      anchor: null,
      direction: -1,
    });
    expect(result.targetThreadId).toBe("c");
    expect(result.anchor).toEqual({ order: ["a", "b", "c"], index: 2 });
  });

  it("walks the frozen order across a run of presses despite the MRU reshuffling", () => {
    // First press: a -> b
    let result = computeRecentCycleTarget({
      candidateOrder: ["a", "b", "c"],
      activeThreadId: "a",
      anchor: null,
      direction: 1,
    });
    expect(result.targetThreadId).toBe("b");

    // Switching made b most-recent, so the live MRU is now [b, a, c]. The frozen
    // anchor keeps walking the original order: b -> c.
    result = computeRecentCycleTarget({
      candidateOrder: ["b", "a", "c"],
      activeThreadId: "b",
      anchor: result.anchor,
      direction: 1,
    });
    expect(result.targetThreadId).toBe("c");

    // c -> wraps back to a.
    result = computeRecentCycleTarget({
      candidateOrder: ["c", "b", "a"],
      activeThreadId: "c",
      anchor: result.anchor,
      direction: 1,
    });
    expect(result.targetThreadId).toBe("a");
  });

  it("restarts the cycle after the user navigates away manually", () => {
    // Cursor points at b, but the user manually opened c since the last step.
    const anchor: RecentCycleAnchor = { order: ["a", "b", "c"], index: 1 };
    const result = computeRecentCycleTarget({
      candidateOrder: ["c", "a", "b"],
      activeThreadId: "c",
      anchor,
      direction: 1,
    });
    // Fresh cycle from the current MRU: c (0) -> a (1).
    expect(result.targetThreadId).toBe("a");
    expect(result.anchor).toEqual({ order: ["c", "a", "b"], index: 1 });
  });

  it("rebuilds when an anchored chat no longer exists", () => {
    const anchor: RecentCycleAnchor = { order: ["a", "b", "c"], index: 0 };
    // "c" was deleted/archived, so it is gone from the candidate set.
    const result = computeRecentCycleTarget({
      candidateOrder: ["a", "b"],
      activeThreadId: "a",
      anchor,
      direction: 1,
    });
    expect(result.targetThreadId).toBe("b");
    expect(result.anchor).toEqual({ order: ["a", "b"], index: 1 });
  });

  it("jumps to the most-recent or oldest chat from the home view (no active chat)", () => {
    expect(
      computeRecentCycleTarget({
        candidateOrder: ["a", "b", "c"],
        activeThreadId: null,
        anchor: null,
        direction: 1,
      }),
    ).toEqual({ targetThreadId: "a", anchor: { order: ["a", "b", "c"], index: 0 } });
    expect(
      computeRecentCycleTarget({
        candidateOrder: ["a", "b", "c"],
        activeThreadId: null,
        anchor: null,
        direction: -1,
      }),
    ).toEqual({ targetThreadId: "c", anchor: { order: ["a", "b", "c"], index: 2 } });
  });

  it("stays on the only candidate", () => {
    const result = computeRecentCycleTarget({
      candidateOrder: ["a"],
      activeThreadId: "a",
      anchor: null,
      direction: 1,
    });
    expect(result.targetThreadId).toBe("a");
  });
});
