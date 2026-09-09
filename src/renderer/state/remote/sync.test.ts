import { afterEach, describe, expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { RemoteThreadSnapshot } from "@/shared/remote";
import { useAppStore } from "@/renderer/state/appStore";
import type {
  OpenRuntimeRequest,
  RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
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
  overrides: {
    snapshotSeq?: number;
    remoteServerId?: string;
    status?: Thread["status"];
    presentationMode?: Thread["presentationMode"];
    runtimeItems?: RemoteThreadSnapshot["runtimeItems"];
    contextUsage?: RemoteThreadSnapshot["contextUsage"];
  } = {},
): RemoteThreadSnapshot {
  return {
    snapshotSeq: overrides.snapshotSeq ?? 1,
    thread: {
      ...thread,
      ...(overrides.remoteServerId ? { remoteServerId: overrides.remoteServerId } : {}),
      ...(overrides.status ? { status: overrides.status } : {}),
      ...(overrides.presentationMode ? { presentationMode: overrides.presentationMode } : {}),
    },
    runtimeItems: overrides.runtimeItems ?? [],
    completedTurns: [],
    contextUsage: overrides.contextUsage ?? null,
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

describe("remote thread stale-snapshot arbitration", () => {
  const remoteThread: Thread = {
    ...thread,
    remoteServerId: "desktop-1",
    presentationMode: "gui",
  };
  const openRequest: OpenRuntimeRequest = {
    requestId: "req-1",
    threadId: thread.id,
    requestType: "tool_call_approval",
    payload: { summary: "Allow rm -rf build?" },
    receivedAt: "2026-01-01T00:00:00.000Z",
  };

  afterEach(() => {
    useAppStore.setState({
      runtimeRequestsByThread: {},
      runtimeOpenTurnByThread: {},
      runtimeBackgroundTasksByThread: {},
    });
  });

  it("refuses a stale history snapshot that would clear a live request and regress the thread", () => {
    useAppStore.setState({
      threads: [{ ...remoteThread, status: "needs_approval" }],
      runtimeRequestsByThread: { [thread.id]: [openRequest] },
      runtimeOpenTurnByThread: { [thread.id]: true },
    });

    // The history GET was in flight when `request.opened` (seq 10) applied and
    // the row flipped to needs_approval; the snapshot (built at seq 5) still
    // shows the pre-request working state.
    applyThreadSnapshot(
      snapshot(undefined, {
        snapshotSeq: 5,
        remoteServerId: "desktop-1",
        status: "working",
        presentationMode: "gui",
      }),
      { fromServer: true, lastSeenEventSeq: 10 },
    );

    expect(useAppStore.getState().runtimeRequestsByThread[thread.id]).toEqual([openRequest]);
    expect(useAppStore.getState().threads[0]?.status).toBe("needs_approval");
    expect(useAppStore.getState().runtimeOpenTurnByThread[thread.id]).toBe(true);
  });

  it("still clears a resolved request and closes the turn once a snapshot is current", () => {
    useAppStore.setState({
      threads: [{ ...remoteThread, status: "needs_approval" }],
      runtimeRequestsByThread: { [thread.id]: [openRequest] },
      runtimeOpenTurnByThread: { [thread.id]: true },
    });

    applyThreadSnapshot(
      snapshot(undefined, {
        snapshotSeq: 10,
        remoteServerId: "desktop-1",
        status: "idle",
        presentationMode: "gui",
      }),
      { fromServer: true, lastSeenEventSeq: 10 },
    );

    expect(useAppStore.getState().runtimeRequestsByThread[thread.id]).toEqual([]);
    expect(useAppStore.getState().threads[0]?.status).toBe("idle");
    expect(useAppStore.getState().runtimeOpenTurnByThread[thread.id]).toBe(false);
  });

  it("still re-seeds an open request from persisted items on a fresh awaiting-user snapshot", () => {
    useAppStore.setState({
      threads: [{ ...remoteThread, status: "working" }],
    });

    applyThreadSnapshot(
      snapshot(undefined, {
        snapshotSeq: 10,
        remoteServerId: "desktop-1",
        status: "needs_approval",
        runtimeItems: [
          {
            id: "pending_request:req-1",
            type: "pending_request",
            state: "started",
            payload: {
              requestId: "req-1",
              requestType: "tool_user_input",
              payload: { summary: "Which framework?" },
            },
            streams: {},
          },
        ],
      }),
      { fromServer: true, lastSeenEventSeq: 10 },
    );

    expect(useAppStore.getState().runtimeRequestsByThread[thread.id]).toEqual([
      expect.objectContaining({ requestId: "req-1", threadId: thread.id }),
    ]);
  });
});

describe("remote thread stale transcript snapshots", () => {
  const liveItem = (id: string, state: "started" | "completed"): RuntimeChatItem => ({
    id,
    type: "user_message",
    state,
    payload: {},
    streams: {},
  });
  const snapshotItem = (
    id: string,
    state: "started" | "completed",
  ): RemoteThreadSnapshot["runtimeItems"][number] => ({
    id,
    type: "user_message",
    state,
    payload: {},
    streams: {},
  });
  /** Live tail: settled prompt plus an in-flight turn item streamed after it. */
  const seedLiveTail = (): void => {
    useAppStore.setState((state) => ({
      threads: [...state.threads.filter((candidate) => candidate.id !== thread.id), thread],
      runtimeItemIdsByThread: { ...state.runtimeItemIdsByThread, [thread.id]: ["u1", "t1"] },
      runtimeItemsByIdByThread: {
        ...state.runtimeItemsByIdByThread,
        [thread.id]: { u1: liveItem("u1", "completed"), t1: liveItem("t1", "started") },
      },
      runtimeStructuralVersionByThread: {
        ...state.runtimeStructuralVersionByThread,
        [thread.id]: 1,
      },
      runtimeContextByThread: {
        ...state.runtimeContextByThread,
        [thread.id]: { usedTokens: 9000 },
      },
    }));
  };
  const itemIds = () => useAppStore.getState().runtimeItemIdsByThread[thread.id];

  afterEach(() => {
    useAppStore.setState({
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeStructuralVersionByThread: {},
      runtimeContextByThread: {},
    });
  });

  it("refuses a stale inactive snapshot from truncating the live transcript tail", () => {
    seedLiveTail();

    // Built at seq 5 (idle, before the turn): nonempty shorter history that
    // the fromServer guards would otherwise treat as an authoritative
    // truncate over the live needs_approval tail.
    applyThreadSnapshot(
      snapshot(undefined, {
        snapshotSeq: 5,
        remoteServerId: "desktop-1",
        status: "idle",
        runtimeItems: [snapshotItem("u1", "completed")],
      }),
      { fromServer: true, lastSeenEventSeq: 10 },
    );

    expect(itemIds()).toEqual(["u1", "t1"]);
    expect(useAppStore.getState().runtimeItemsByIdByThread[thread.id]?.t1?.state).toBe("started");
    expect(useAppStore.getState().runtimeStructuralVersionByThread[thread.id]).toBe(1);
  });

  it("still splices missing older history from a stale snapshot", () => {
    seedLiveTail();

    applyThreadSnapshot(
      snapshot(undefined, {
        snapshotSeq: 5,
        remoteServerId: "desktop-1",
        status: "idle",
        runtimeItems: [snapshotItem("u0", "completed"), snapshotItem("u1", "completed")],
      }),
      { fromServer: true, lastSeenEventSeq: 10 },
    );

    expect(itemIds()).toEqual(["u0", "u1", "t1"]);
    expect(useAppStore.getState().runtimeItemsByIdByThread[thread.id]?.t1?.state).toBe("started");
  });

  it("still applies a current authoritative truncate snapshot", () => {
    seedLiveTail();

    applyThreadSnapshot(
      snapshot(undefined, {
        snapshotSeq: 10,
        remoteServerId: "desktop-1",
        status: "idle",
        runtimeItems: [snapshotItem("u1", "completed")],
      }),
      { fromServer: true, lastSeenEventSeq: 10 },
    );

    expect(itemIds()).toEqual(["u1"]);
    expect(useAppStore.getState().runtimeItemsByIdByThread[thread.id]?.t1).toBeUndefined();
  });

  it("refuses a stale snapshot from regressing cached context usage", () => {
    seedLiveTail();

    applyThreadSnapshot(
      snapshot(undefined, {
        snapshotSeq: 5,
        remoteServerId: "desktop-1",
        status: "idle",
        contextUsage: { usedTokens: 100 },
      }),
      { fromServer: true, lastSeenEventSeq: 10 },
    );
    expect(useAppStore.getState().runtimeContextByThread[thread.id]).toEqual({
      usedTokens: 9000,
    });

    applyThreadSnapshot(
      snapshot(undefined, {
        snapshotSeq: 10,
        remoteServerId: "desktop-1",
        status: "idle",
        contextUsage: { usedTokens: 12000 },
      }),
      { fromServer: true, lastSeenEventSeq: 10 },
    );
    expect(useAppStore.getState().runtimeContextByThread[thread.id]).toEqual({
      usedTokens: 12000,
    });
  });
});
