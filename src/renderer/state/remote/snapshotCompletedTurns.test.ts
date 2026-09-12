import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RemoteThreadSnapshot } from "@/shared/remote";
import { useAppStore } from "@/renderer/state/appStore";
import { applyThreadSnapshot } from "./sync";

const threadId = "turn-snapshot-thread";
const retained = { startedAt: 1, endedAt: 2, anchorItemId: "retained" };
const removed = { startedAt: 3, endedAt: 4, anchorItemId: "removed" };

function snapshot(turns: (typeof retained)[], snapshotSeq = 10): RemoteThreadSnapshot {
  return {
    snapshotSeq,
    thread: {
      id: threadId,
      projectId: "project-1",
      remoteServerId: "server-1",
      title: "Thread",
      agentKind: "claude",
      config: { model: "default" },
      presentationMode: "gui",
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(10).toISOString(),
    },
    runtimeItems: [],
    completedTurns: turns.map((turn) => ({
      ...turn,
      startedAt: new Date(turn.startedAt).toISOString(),
      endedAt: new Date(turn.endedAt).toISOString(),
    })),
    contextUsage: null,
    updatedAt: new Date(10).toISOString(),
  };
}

describe("remote completed-turn snapshot recovery", () => {
  const original = useAppStore.getState();
  beforeEach(() => {
    useAppStore.setState({
      threads: [snapshot([]).thread],
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeRequestsByThread: {},
      runtimeOpenTurnByThread: {},
      runtimeCompletedTurnsByThread: { [threadId]: [retained, removed] },
    });
  });
  afterEach(() => useAppStore.setState(original, true));

  it("removes reverted turns when a fresh server snapshot is applied", () => {
    applyThreadSnapshot(snapshot([retained]), { fromServer: true, lastSeenEventSeq: 10 });
    expect(useAppStore.getState().runtimeCompletedTurnsByThread[threadId]).toEqual([retained]);
  });

  it("clears every completed turn when the authoritative list is empty", () => {
    applyThreadSnapshot(snapshot([]), { fromServer: true, lastSeenEventSeq: 10 });
    expect(useAppStore.getState().runtimeCompletedTurnsByThread[threadId]).toEqual([]);
  });

  it("does not resurrect a reverted turn from a stale response", () => {
    useAppStore.setState({ runtimeCompletedTurnsByThread: { [threadId]: [retained] } });
    applyThreadSnapshot(snapshot([retained, removed], 5), {
      fromServer: true,
      lastSeenEventSeq: 10,
    });
    expect(useAppStore.getState().runtimeCompletedTurnsByThread[threadId]).toEqual([retained]);
    applyThreadSnapshot(snapshot([], 5), { fromServer: true, lastSeenEventSeq: 10 });
    expect(useAppStore.getState().runtimeCompletedTurnsByThread[threadId]).toEqual([retained]);
  });

  it("keeps full-list turns whose anchors are outside the paged item window", () => {
    const paged: RemoteThreadSnapshot = {
      ...snapshot([retained]),
      runtimeNextCursor: 1,
      runtimeItems: [
        {
          id: "recent-item",
          type: "user_message",
          state: "completed",
          payload: {},
          streams: {},
        },
      ],
    };
    applyThreadSnapshot(paged, { fromServer: true, lastSeenEventSeq: 10 });
    expect(useAppStore.getState().runtimeCompletedTurnsByThread[threadId]).toEqual([retained]);
  });

  it("keeps additive hydration for a local offline cache", () => {
    applyThreadSnapshot(snapshot([retained]), { fromServer: false });
    expect(useAppStore.getState().runtimeCompletedTurnsByThread[threadId]).toEqual([
      retained,
      removed,
    ]);
  });
});
