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
  status: "working",
  attention: "none",
  canResumeWithConfig: false,
  archived: false,
  done: false,
  starred: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function snapshot(
  backgroundTasks?: RemoteThreadSnapshot["backgroundTasks"],
  overrides: { snapshotSeq?: number; remoteServerId?: string } = {},
): RemoteThreadSnapshot {
  return {
    snapshotSeq: overrides.snapshotSeq ?? 1,
    thread: {
      ...thread,
      ...(overrides.remoteServerId ? { remoteServerId: overrides.remoteServerId } : {}),
    },
    runtimeItems: [],
    completedTurns: [],
    contextUsage: null,
    ...(backgroundTasks ? { backgroundTasks } : {}),
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("remote thread background-task snapshots", () => {
  afterEach(() => {
    useAppStore.setState({ runtimeBackgroundTasksByThread: {} });
  });

  it("replaces live tasks and drops the key for a legacy empty snapshot", () => {
    useAppStore.setState({
      threads: [thread],
      runtimeBackgroundTasksByThread: {
        "thread-1": [{ taskId: "stale", kind: "other", description: "stale" }],
      },
    });

    applyThreadSnapshot(
      snapshot([{ taskId: "task-1", kind: "command", description: "pnpm test" }]),
    );
    expect(useAppStore.getState().runtimeBackgroundTasksByThread["thread-1"]).toEqual([
      { taskId: "task-1", kind: "command", description: "pnpm test" },
    ]);

    applyThreadSnapshot(snapshot());
    expect("thread-1" in useAppStore.getState().runtimeBackgroundTasksByThread).toBe(false);
  });

  it("refuses a snapshot older than an already-applied live level", () => {
    useAppStore.setState({
      threads: [{ ...thread, remoteServerId: "desktop-1" }],
      runtimeBackgroundTasksByThread: {
        [thread.id]: [{ taskId: "live", kind: "command", description: "drained level" }],
      },
    });

    // The history request was in flight when the drain event (seq 10) applied;
    // the snapshot (built at seq 5) still carries the pre-drain level.
    applyThreadSnapshot(
      snapshot([{ taskId: "stale", kind: "command", description: "in-flight level" }], {
        snapshotSeq: 5,
        remoteServerId: "desktop-1",
      }),
      { fromServer: true, lastSeenEventSeq: 10 },
    );
    expect(useAppStore.getState().runtimeBackgroundTasksByThread[thread.id]).toEqual([
      { taskId: "live", kind: "command", description: "drained level" },
    ]);

    // A snapshot at or past the applied seq is authoritative again.
    applyThreadSnapshot(snapshot([], { snapshotSeq: 10, remoteServerId: "desktop-1" }), {
      fromServer: true,
      lastSeenEventSeq: 10,
    });
    expect(thread.id in useAppStore.getState().runtimeBackgroundTasksByThread).toBe(false);
  });
});
