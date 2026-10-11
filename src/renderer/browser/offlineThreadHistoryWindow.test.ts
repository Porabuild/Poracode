import { describe, expect, it } from "vitest";
import type { PersistedRuntimeItem } from "@/shared/ipc";
import type { RemoteThreadSnapshot } from "@/shared/remote";
import { mergeCachedThreadSnapshot, prependCachedRuntimePage } from "./offlineThreadHistoryWindow";

function item(
  id: string,
  type: PersistedRuntimeItem["type"] = "assistant_message",
): PersistedRuntimeItem {
  return { id, type, state: "completed", streams: {} };
}
function snapshot(items: PersistedRuntimeItem[], cursor: number | null = 20): RemoteThreadSnapshot {
  return {
    thread: { id: "thread" },
    snapshotSeq: 1,
    runtimeItems: items,
    runtimeNextCursor: cursor,
  } as RemoteThreadSnapshot;
}

describe("offline raw history windows", () => {
  it("locates a previously detached goal at its canonical page position", () => {
    const goal = item("goal", "goal");
    const cached = snapshot([goal, item("tail")]);
    const page = prependCachedRuntimePage(cached, {
      beforePosition: 20,
      nextCursor: null,
      items: [item("before-goal"), goal, item("after-goal")],
    });
    expect(page?.runtimeItems.map((row) => row.id)).toEqual([
      "before-goal",
      "goal",
      "after-goal",
      "tail",
    ]);
  });

  it("keeps an unlocated global goal detached at the front", () => {
    const page = prependCachedRuntimePage(snapshot([item("pin", "goal"), item("tail")]), {
      beforePosition: 20,
      nextCursor: 10,
      items: [item("older")],
    });
    expect(page?.runtimeItems.map((row) => row.id)).toEqual(["pin", "older", "tail"]);
  });

  it("refuses non-advancing cursors and deduplicates overlapping raw ids", () => {
    const cached = snapshot([item("tail")]);
    expect(
      prependCachedRuntimePage(cached, { beforePosition: 20, nextCursor: 20, items: [] }),
    ).toBeNull();
    const page = prependCachedRuntimePage(cached, {
      beforePosition: 20,
      nextCursor: 10,
      items: [item("older"), item("older"), item("tail")],
    });
    expect(page?.runtimeItems.map((row) => row.id)).toEqual(["older", "tail"]);
  });

  it("refuses a cache window beyond the existing logical content budget", () => {
    const large = { ...item("large"), streams: { text: "x".repeat(8 * 1024 * 1024) } };
    expect(
      prependCachedRuntimePage(snapshot([item("tail")]), {
        beforePosition: 20,
        nextCursor: null,
        items: [large],
      }),
    ).toBeNull();
  });

  it("replaces disjoint resets and sparse-control tails instead of guessing an overlap", () => {
    const cached = snapshot([item("older"), item("tail")], null);
    for (const incoming of [
      snapshot([item("reset")]),
      snapshot([item("pin", "goal"), item("tail")]),
    ]) {
      expect(mergeCachedThreadSnapshot(cached, incoming)).toBe(incoming);
    }
  });

  it("accepts an authoritative reset after a host restarts its event sequence", () => {
    const cached = { ...snapshot([item("new")]), snapshotSeq: 2 };
    const restarted = { ...snapshot([item("reset")], null), snapshotSeq: 0 };
    expect(mergeCachedThreadSnapshot(cached, restarted)).toBe(restarted);
  });
});
