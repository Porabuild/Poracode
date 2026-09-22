import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureRendererException: vi.fn<() => void>(),
}));

vi.mock("@/renderer/diagnostics/sentry", () => ({
  captureRendererException: mocks.captureRendererException,
}));

import {
  __resetRendererEventInterestsForTest,
  noteRendererEventInterestWireCoverage,
  retainRendererEventInterest,
  snapshotRendererEventInterests,
  subscribeRendererEventInterests,
  type RendererEventInterestSnapshot,
} from "./rendererEventInterests";

/**
 * A2: the renderer registry is the loopback WS interest owner. Its only
 * publish path is the local subscriber set (the managed socket intake); the
 * removed `setRendererEventInterests` IPC sync is gone, so `ready` resolves
 * once subscribers have applied the snapshot.
 */
describe("rendererEventInterests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetRendererEventInterestsForTest();
    mocks.captureRendererException.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it("publishes ref-counted exact snapshots and delays final release for hand-offs", async () => {
    const applied: RendererEventInterestSnapshot[] = [];
    const unsubscribe = subscribeRendererEventInterests((snapshot) => applied.push(snapshot));

    const first = retainRendererEventInterest("terminal", "terminal-1");
    const second = retainRendererEventInterest("terminal", "terminal-1");
    expect(first.continuous).toBe(false);
    expect(second.continuous).toBe(true);
    await first.ready;
    await second.ready;

    expect(applied).toHaveLength(1);
    expect(applied[0]).toEqual({
      terminalThreadIds: ["terminal-1"],
      runtimeThreadIds: [],
    });

    first.release();
    await vi.advanceTimersByTimeAsync(250);
    expect(applied).toHaveLength(1);

    second.release();
    await vi.advanceTimersByTimeAsync(249);
    expect(applied).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(applied).toHaveLength(2));
    expect(applied[1]).toEqual({
      terminalThreadIds: [],
      runtimeThreadIds: [],
    });
    unsubscribe();
  });

  it("coalesces same-turn changes and publishes a trailing change separately", async () => {
    const applied: string[][] = [];
    const unsubscribe = subscribeRendererEventInterests((snapshot) => {
      applied.push([...snapshot.terminalThreadIds]);
    });

    const terminal = retainRendererEventInterest("terminal", "terminal-1");
    const runtime = retainRendererEventInterest("runtime", "runtime-1");
    await Promise.all([terminal.ready, runtime.ready]);
    expect(applied).toEqual([["terminal-1"]]);

    const trailing = retainRendererEventInterest("terminal", "terminal-2");
    await trailing.ready;
    expect(applied).toEqual([["terminal-1"], ["terminal-1", "terminal-2"]]);

    terminal.release();
    runtime.release();
    trailing.release();
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(applied.at(-1)).toEqual([]));
    expect(applied).toHaveLength(3);
    unsubscribe();
  });

  it("snapshots retained ids with newest-first runtime priority and sorted terminal ids", async () => {
    const first = retainRendererEventInterest("runtime", "runtime-a");
    const second = retainRendererEventInterest("runtime", "runtime-z");
    const prompt = retainRendererEventInterest("terminal", "terminal-b");
    const terminal = retainRendererEventInterest("terminal", "terminal-a");
    await Promise.all([first.ready, second.ready, prompt.ready, terminal.ready]);

    expect(snapshotRendererEventInterests()).toEqual({
      // Terminal consumers get a stable ordering; item-interests consumers get
      // recency so the newest (focused) panes win a bounded wire array.
      terminalThreadIds: ["terminal-a", "terminal-b"],
      runtimeThreadIds: ["runtime-z", "runtime-a"],
    });

    first.release();
    second.release();
    prompt.release();
    terminal.release();
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() =>
      expect(snapshotRendererEventInterests()).toEqual({
        terminalThreadIds: [],
        runtimeThreadIds: [],
      }),
    );
  });

  it("applies subscriber snapshots before an interest lease's ready resolves", async () => {
    const applied: string[][] = [];
    const unsubscribe = subscribeRendererEventInterests((snapshot) => {
      applied.push([...snapshot.runtimeThreadIds]);
    });

    const lease = retainRendererEventInterest("runtime", "runtime-1");
    let ready = false;
    void lease.ready.then(() => {
      ready = true;
    });
    await lease.ready;
    expect(applied).toEqual([["runtime-1"]]);
    expect(ready).toBe(true);
    lease.release();
    unsubscribe();
  });

  it("contains a throwing subscriber without blocking the rest of the flush", async () => {
    const applied: string[][] = [];
    const unsubscribeFirst = subscribeRendererEventInterests(() => {
      throw new Error("subscriber failed");
    });
    const unsubscribeSecond = subscribeRendererEventInterests((snapshot) => {
      applied.push([...snapshot.runtimeThreadIds]);
    });

    const lease = retainRendererEventInterest("runtime", "runtime-1");
    await lease.ready;

    expect(applied).toEqual([["runtime-1"]]);
    await vi.waitFor(() => expect(mocks.captureRendererException).toHaveBeenCalledOnce());
    lease.release();
    unsubscribeFirst();
    unsubscribeSecond();
  });

  it("re-retaining during the release grace keeps the id in the snapshot", async () => {
    noteRendererEventInterestWireCoverage(["runtime-1"]);
    const lease = retainRendererEventInterest("runtime", "runtime-1");
    await lease.ready;
    lease.release();
    const reacquired = retainRendererEventInterest("runtime", "runtime-1");
    expect(reacquired.continuous).toBe(true);
    await vi.advanceTimersByTimeAsync(250);
    expect(snapshotRendererEventInterests().runtimeThreadIds).toEqual(["runtime-1"]);

    reacquired.release();
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(snapshotRendererEventInterests().runtimeThreadIds).toEqual([]));
  });

  it("publishes a reprioritized retained thread and settles ready after it was applied", async () => {
    // Wire consumer simulation: the bounded first-200 selection is what the
    // socket carries, and the applied ids are reported back as coverage.
    const applied: string[][] = [];
    const unsubscribe = subscribeRendererEventInterests((snapshot) => {
      const bounded = snapshot.runtimeThreadIds.slice(0, 200);
      applied.push([...bounded]);
      noteRendererEventInterestWireCoverage(bounded);
    });
    const leases = Array.from({ length: 201 }, (_, index) =>
      retainRendererEventInterest("runtime", `t-${index}`),
    );
    await Promise.all(leases.map((lease) => lease.ready));
    expect(applied).toHaveLength(1);
    expect(applied[0]).not.toContain("t-0");

    // The defect: t-0 stayed retained but was cap-excluded; re-retaining it
    // moved it to the front of the priority list, yet the old code published
    // nothing and `ready` resolved against the previous (uncovered) snapshot.
    const restored = retainRendererEventInterest("runtime", "t-0");
    expect(restored.continuous).toBe(false);
    await restored.ready;
    expect(applied).toHaveLength(2);
    expect(applied[1]![0]).toBe("t-0");
    expect(applied[1]).toContain("t-0");
    expect(applied[1]).not.toContain("t-1");
    // Coverage was applied before ready resolved: continuous flips truthfully.
    expect(restored.continuous).toBe(true);

    restored.release();
    for (const lease of leases) lease.release();
    await vi.advanceTimersByTimeAsync(250);
    unsubscribe();
  });

  it("does not notify subscribers for a retain that leaves the published order unchanged", async () => {
    const applied: string[][] = [];
    const unsubscribe = subscribeRendererEventInterests((snapshot) => {
      applied.push([...snapshot.runtimeThreadIds]);
    });
    const first = retainRendererEventInterest("runtime", "runtime-1");
    await first.ready;
    noteRendererEventInterestWireCoverage(["runtime-1"]);
    const second = retainRendererEventInterest("runtime", "runtime-1");
    await second.ready;
    expect(applied).toEqual([["runtime-1"]]);
    // `ready` still settles for the unchanged retain: no subscriber call is
    // needed because the published snapshot already carries the id.
    expect(second.continuous).toBe(true);

    first.release();
    second.release();
    await vi.advanceTimersByTimeAsync(250);
    unsubscribe();
  });

  it("reports runtime continuity from the wire coverage, never ahead of it", async () => {
    const first = retainRendererEventInterest("runtime", "runtime-1");
    await first.ready;
    first.release();
    // Re-retain inside the grace: the hand-off is continuous, but the wire
    // coverage alone decides whether the stream is actually carried.
    const lease = retainRendererEventInterest("runtime", "runtime-1");
    expect(lease.continuous).toBe(false);
    noteRendererEventInterestWireCoverage(["runtime-other"]);
    expect(lease.continuous).toBe(false);
    noteRendererEventInterestWireCoverage(["runtime-1"]);
    expect(lease.continuous).toBe(true);
    // Leg down / disposed: coverage is gone even though the lease is retained.
    noteRendererEventInterestWireCoverage(null);
    expect(lease.continuous).toBe(false);
    lease.release();
    first.release();
    await vi.advanceTimersByTimeAsync(250);
  });

  it("keeps terminal continuity independent of item-interest wire coverage", async () => {
    noteRendererEventInterestWireCoverage([]);
    const first = retainRendererEventInterest("terminal", "terminal-1");
    await first.ready;
    first.release();
    const lease = retainRendererEventInterest("terminal", "terminal-1");
    expect(lease.continuous).toBe(true);
    lease.release();
    first.release();
    await vi.advanceTimersByTimeAsync(250);
  });
});
