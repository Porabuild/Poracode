import { afterEach, describe, expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { RemoteThreadSnapshot } from "@/shared/remote";
import { useAppStore } from "@/renderer/state/appStore";
import { applyThreadSnapshot } from "./sync";

const thread: Thread = {
  id: "thread-1",
  projectId: "project-1",
  title: "Thread",
  agentKind: "claude",
  config: { model: "default" },
  status: "idle",
  attention: "none",
  canResumeWithConfig: false,
  archived: false,
  done: false,
  starred: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function snapshot(
  overrides: Partial<RemoteThreadSnapshot> & { snapshotSeq?: number } = {},
): RemoteThreadSnapshot {
  return {
    snapshotSeq: overrides.snapshotSeq ?? 10,
    thread,
    runtimeItems: [],
    completedTurns: [],
    contextUsage: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("applyThreadSnapshot authoritative install reporting", () => {
  afterEach(() => {
    useAppStore.setState({
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeStructuralVersionByThread: {},
    });
  });

  it("reports install for a fresh authoritative snapshot", () => {
    const result = applyThreadSnapshot(
      snapshot({ snapshotSeq: 10, remoteServerId: undefined } as unknown as RemoteThreadSnapshot),
      { fromServer: true },
    );
    expect(result.installedAuthoritativeHistory).toBe(true);
  });

  it("does not report install for a stale snapshot refused by per-thread seq", () => {
    useAppStore.setState({
      threads: [{ ...thread, remoteServerId: "desktop-1" }],
      runtimeItemIdsByThread: { [thread.id]: ["u1", "t1"] },
      runtimeItemsByIdByThread: {
        [thread.id]: {
          u1: { id: "u1", type: "user_message", state: "completed", payload: {}, streams: {} },
          t1: { id: "t1", type: "user_message", state: "started", payload: {}, streams: {} },
        },
      },
    });
    const result = applyThreadSnapshot(
      {
        ...snapshot({ snapshotSeq: 5 }),
        thread: { ...thread, remoteServerId: "desktop-1", status: "idle" },
        runtimeItems: [
          { id: "u1", type: "user_message", state: "completed", payload: {}, streams: {} },
        ],
      },
      { fromServer: true, lastSeenEventSeq: 10 },
    );
    expect(result.installedAuthoritativeHistory).toBe(false);
  });

  it("does not report install for an additive missing-older-history splice", () => {
    useAppStore.setState({
      threads: [{ ...thread, remoteServerId: "desktop-1" }],
      runtimeItemIdsByThread: { [thread.id]: ["u1", "t1"] },
      runtimeItemsByIdByThread: {
        [thread.id]: {
          u1: { id: "u1", type: "user_message", state: "completed", payload: {}, streams: {} },
          t1: { id: "t1", type: "user_message", state: "started", payload: {}, streams: {} },
        },
      },
    });
    const result = applyThreadSnapshot(
      {
        ...snapshot({ snapshotSeq: 5 }),
        thread: { ...thread, remoteServerId: "desktop-1", status: "idle" },
        runtimeItems: [
          { id: "u0", type: "user_message", state: "completed", payload: {}, streams: {} },
          { id: "u1", type: "user_message", state: "completed", payload: {}, streams: {} },
        ],
      },
      { fromServer: true, lastSeenEventSeq: 10 },
    );
    // Stale, but splices older history additively — not an authoritative install.
    expect(result.installedAuthoritativeHistory).toBe(false);
    expect(useAppStore.getState().runtimeItemIdsByThread[thread.id]).toEqual(["u0", "u1", "t1"]);
  });
});
