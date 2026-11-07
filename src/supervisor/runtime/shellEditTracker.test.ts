import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DirtySetSnapshot } from "../git/dirtySetSnapshot";
import {
  SHELL_SNAPSHOT_INTERVAL_MS,
  ShellEditTracker,
  type MemberRunActivity,
} from "./shellEditTracker";

function harness(initial: Record<string, string> = {}) {
  let snapshot: DirtySetSnapshot | undefined = new Map(Object.entries(initial));
  let failing = false;
  let activity: MemberRunActivity = { active: 0, started: 0 };
  let duringRead: (() => void) | undefined;
  const readSnapshot = vi.fn<() => Promise<DirtySetSnapshot | undefined>>(async () => {
    duringRead?.();
    if (failing) throw new Error("git status failed");
    return snapshot;
  });
  const onLeadEdit = vi.fn<() => void>();
  const tracker = new ShellEditTracker({
    readSnapshot,
    memberActivity: () => activity,
    onLeadEdit,
  });
  return {
    tracker,
    readSnapshot,
    onLeadEdit,
    setWorktree(next: Record<string, string> | undefined) {
      snapshot = next ? new Map(Object.entries(next)) : undefined;
    },
    setActivity(next: MemberRunActivity) {
      activity = next;
    },
    failReads() {
      failing = true;
    },
    whileReading(effect: (() => void) | undefined) {
      duringRead = effect;
    },
  };
}

/** Lets the single-flight snapshot chain settle. */
async function settle(): Promise<void> {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

/** Runs out the throttle window, so a trailing snapshot starts and settles. */
async function nextWindow(): Promise<void> {
  await vi.advanceTimersByTimeAsync(SHELL_SNAPSHOT_INTERVAL_MS);
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("ShellEditTracker", () => {
  it("reports a path that became dirty after a lead command", async () => {
    const h = harness({ "src/a.ts": "10:1" });
    h.tracker.start();
    await settle();
    h.setWorktree({ "src/a.ts": "10:1", "src/b.ts": "4:2" });
    h.tracker.commandCompleted();
    await nextWindow();
    expect(h.onLeadEdit).toHaveBeenCalledTimes(1);
  });

  it("reports a dirty path whose size or mtime changed", async () => {
    const h = harness({ "src/a.ts": "10:1" });
    h.tracker.start();
    await settle();
    h.setWorktree({ "src/a.ts": "10:5" });
    h.tracker.commandCompleted();
    await nextWindow();
    expect(h.onLeadEdit).toHaveBeenCalledTimes(1);

    const sized = harness({ "src/a.ts": "10:1" });
    sized.tracker.start();
    await settle();
    sized.setWorktree({ "src/a.ts": "12:1" });
    sized.tracker.commandCompleted();
    await nextWindow();
    expect(sized.onLeadEdit).toHaveBeenCalledTimes(1);
  });

  it("ignores removals such as a commit, stash or checkout", async () => {
    const h = harness({ "src/a.ts": "10:1", "src/b.ts": "4:2" });
    h.tracker.start();
    await settle();
    h.setWorktree({ "src/a.ts": "10:1" });
    h.tracker.commandCompleted();
    await nextWindow();
    h.setWorktree({});
    h.tracker.commandCompleted();
    await nextWindow();
    expect(h.onLeadEdit).not.toHaveBeenCalled();
    expect(h.readSnapshot).toHaveBeenCalledTimes(3);
  });

  it("takes no snapshot while other work is active, and counts again once it is idle", async () => {
    const h = harness();
    h.setActivity({ active: 1, started: 1 });
    h.tracker.start();
    await settle();
    h.setWorktree({ "src/a.ts": "1:1" });
    h.tracker.commandCompleted();
    await nextWindow();
    expect(h.readSnapshot).not.toHaveBeenCalled();

    // The work finished: the next snapshot is a fresh baseline, not a
    // comparison with a state the work may have changed.
    h.setActivity({ active: 0, started: 1 });
    h.setWorktree({ "src/a.ts": "1:2" });
    h.tracker.commandCompleted();
    await nextWindow();
    expect(h.readSnapshot).toHaveBeenCalledTimes(1);
    expect(h.onLeadEdit).not.toHaveBeenCalled();

    // A clean interval afterwards counts.
    h.setWorktree({ "src/a.ts": "1:3" });
    h.tracker.commandCompleted();
    await nextWindow();
    expect(h.onLeadEdit).toHaveBeenCalledTimes(1);
  });

  it("ignores an interval in which other work started and finished", async () => {
    const h = harness();
    h.tracker.start();
    await settle();
    // Started and settled between the two snapshots: only the counter moved.
    h.setActivity({ active: 0, started: 1 });
    h.setWorktree({ "src/a.ts": "1:1" });
    h.tracker.commandCompleted();
    await nextWindow();
    expect(h.onLeadEdit).not.toHaveBeenCalled();

    // Work that starts while the snapshot is being read disqualifies it too.
    h.whileReading(() => h.setActivity({ active: 1, started: 2 }));
    h.setWorktree({ "src/a.ts": "1:2" });
    h.tracker.commandCompleted();
    await nextWindow();
    expect(h.onLeadEdit).not.toHaveBeenCalled();
  });

  it("stops quietly when a snapshot fails or the cwd is not a git worktree", async () => {
    const notRepo = harness();
    notRepo.setWorktree(undefined);
    notRepo.tracker.start();
    await settle();
    notRepo.tracker.commandCompleted();
    await nextWindow();
    expect(notRepo.onLeadEdit).not.toHaveBeenCalled();
    expect(notRepo.readSnapshot).toHaveBeenCalledTimes(1);

    const failing = harness();
    failing.tracker.start();
    await settle();
    failing.failReads();
    failing.setWorktree({ "src/a.ts": "1:1" });
    failing.tracker.commandCompleted();
    await nextWindow();
    failing.tracker.commandCompleted();
    await nextWindow();
    expect(failing.onLeadEdit).not.toHaveBeenCalled();
    expect(failing.readSnapshot).toHaveBeenCalledTimes(2);
  });

  it("stops for good after reporting", async () => {
    const h = harness();
    h.tracker.start();
    await settle();
    h.setWorktree({ "src/a.ts": "1:1" });
    h.tracker.commandCompleted();
    await nextWindow();
    expect(h.onLeadEdit).toHaveBeenCalledTimes(1);

    h.setWorktree({ "src/a.ts": "1:2", "src/b.ts": "1:1" });
    h.tracker.commandCompleted();
    await nextWindow();
    expect(h.readSnapshot).toHaveBeenCalledTimes(2);
    expect(h.onLeadEdit).toHaveBeenCalledTimes(1);
  });

  it("starts at most one snapshot per interval, with one trailing snapshot", async () => {
    const h = harness();
    h.tracker.start();
    await settle();
    expect(h.readSnapshot).toHaveBeenCalledTimes(1);

    h.tracker.commandCompleted();
    await vi.advanceTimersByTimeAsync(SHELL_SNAPSHOT_INTERVAL_MS - 1);
    h.tracker.commandCompleted();
    expect(h.readSnapshot).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    // Both completions in the window share the trailing snapshot.
    expect(h.readSnapshot).toHaveBeenCalledTimes(2);

    // After a quiet window a completion snapshots right away.
    await vi.advanceTimersByTimeAsync(SHELL_SNAPSHOT_INTERVAL_MS);
    h.tracker.commandCompleted();
    await settle();
    expect(h.readSnapshot).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("runs one snapshot at a time and coalesces a burst into one follow-up", async () => {
    const h = harness();
    const reads: Array<() => void> = [];
    h.readSnapshot.mockImplementation(
      () =>
        new Promise<DirtySetSnapshot>((resolve) => {
          reads.push(() => resolve(new Map()));
        }),
    );
    h.tracker.start();
    h.tracker.commandCompleted();
    h.tracker.commandCompleted();
    h.tracker.commandCompleted();
    expect(reads).toHaveLength(1);
    reads[0]!();
    await nextWindow();
    expect(reads).toHaveLength(2);
    reads[1]!();
    await nextWindow();
    expect(reads).toHaveLength(2);
  });

  it("drops a snapshot that was still in flight when tracking stopped", async () => {
    const h = harness();
    const reads: Array<(snapshot: DirtySetSnapshot) => void> = [];
    h.tracker.start();
    await settle();
    h.readSnapshot.mockImplementation(
      () => new Promise<DirtySetSnapshot>((resolve) => reads.push(resolve)),
    );
    h.tracker.commandCompleted();
    await nextWindow();
    h.tracker.stop();
    reads[0]!(new Map([["src/a.ts", "1:1"]]));
    await settle();
    expect(h.onLeadEdit).not.toHaveBeenCalled();
  });

  it("clears a pending trailing snapshot when tracking stops", async () => {
    const h = harness();
    h.tracker.start();
    await settle();
    h.tracker.commandCompleted();
    expect(vi.getTimerCount()).toBe(1);
    h.tracker.stop();
    expect(vi.getTimerCount()).toBe(0);
    await nextWindow();
    expect(h.readSnapshot).toHaveBeenCalledTimes(1);
  });
});
