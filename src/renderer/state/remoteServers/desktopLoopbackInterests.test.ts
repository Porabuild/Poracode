import { describe, expect, it } from "vitest";
import {
  boundManagedItemInterests,
  createManagedItemInterestTracker,
  MANAGED_ITEM_INTERESTS_MAX,
  normalizeManagedItemInterests,
  sameItemInterests,
} from "./desktopLoopbackInterests";

const CAP = MANAGED_ITEM_INTERESTS_MAX;

/** Priority list with `t-0` last: it is the least recently retained id. */
function overflowingPriorityList(): string[] {
  return [...Array.from({ length: CAP }, (_, index) => `t-${index + 1}`), "t-0"];
}

describe("managed item-interest wire contract", () => {
  it("normalizes malformed and duplicate ids without reordering", () => {
    expect(normalizeManagedItemInterests(["b", "", 7 as unknown as string, "a", "b", "c"])).toEqual(
      ["b", "a", "c"],
    );
  });

  it("bounds to the wire cap and reports the overflow", () => {
    const ids = Array.from({ length: CAP + 6 }, (_, index) => `runtime-${index}`);
    expect(boundManagedItemInterests(ids)).toEqual({
      threadIds: ids.slice(0, CAP),
      droppedCount: 6,
    });
  });

  it("compares applied and next selections order-sensitively", () => {
    expect(sameItemInterests(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameItemInterests(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameItemInterests(["a"], null)).toBe(false);
  });
});

describe("managed item-interest tracker (A1 coverage restoration)", () => {
  it("reports a previously cap-excluded retained thread when it re-enters the selection", () => {
    const tracker = createManagedItemInterestTracker();
    const first = tracker.select(overflowingPriorityList());
    expect(first.threadIds).toHaveLength(CAP);
    expect(first.droppedCount).toBe(1);
    expect(first.threadIds).not.toContain("t-0");
    expect(first.restoredThreadIds).toEqual([]);

    // Re-retain moves t-0 to the front of the priority list.
    const reprioritized = tracker.select([
      "t-0",
      ...Array.from({ length: CAP }, (_, i) => `t-${i + 1}`),
    ]);
    expect(reprioritized.threadIds[0]).toBe("t-0");
    expect(reprioritized.threadIds).not.toContain(`t-${CAP}`);
    expect(reprioritized.restoredThreadIds).toEqual(["t-0"]);
  });

  it("reports a dropped thread re-admitted because another pane released capacity", () => {
    const tracker = createManagedItemInterestTracker();
    tracker.select(overflowingPriorityList());

    // t-200 leaves the retained set; t-0 is admitted without being re-retained.
    const afterRelease = tracker.select(
      overflowingPriorityList().filter((threadId) => threadId !== `t-${CAP}`),
    );
    expect(afterRelease.threadIds).toContain("t-0");
    expect(afterRelease.droppedCount).toBe(0);
    expect(afterRelease.restoredThreadIds).toEqual(["t-0"]);
  });

  it("never treats a freshly retained thread or a released thread as restored", () => {
    const tracker = createManagedItemInterestTracker();
    tracker.select(overflowingPriorityList());

    // A brand-new id that pushes t-0 out again: t-200 was released (not
    // retained), and t-new was never retained — neither is a restoration.
    const overflowed = tracker.select([
      ...Array.from({ length: CAP }, (_, index) => `t-${index + 1}`),
      "t-0",
    ]);
    expect(overflowed.threadIds).not.toContain("t-0");
    expect(overflowed.restoredThreadIds).toEqual([]);

    const fresh = tracker.select([
      "t-new",
      ...Array.from({ length: CAP }, (_, index) => `t-${index + 1}`),
    ]);
    expect(fresh.threadIds).toContain("t-new");
    expect(fresh.restoredThreadIds).toEqual([]);
  });

  it("forgets prior coverage on reset so a re-open rebuilds instead of inferring restoration", () => {
    const tracker = createManagedItemInterestTracker();
    tracker.select(overflowingPriorityList());
    tracker.reset();
    const reopened = tracker.select(overflowingPriorityList());
    expect(reopened.restoredThreadIds).toEqual([]);
  });
});
