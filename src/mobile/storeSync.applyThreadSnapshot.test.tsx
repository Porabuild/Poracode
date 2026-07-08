import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { PersistedRuntimeItem } from "@/shared/ipc/schemas";
import type { RemoteThreadSnapshot } from "@/shared/remote";
import { useAppStore } from "@/renderer/state/appStore";
import { applyThreadSnapshot, dispatchRemoteSupervisorEvent, resetRemoteStores } from "./storeSync";

// storeSync coalesces live runtime deltas onto an animation frame; drive that
// frame deterministically so we can assert ordering around applyThreadSnapshot.
let rafCallbacks: FrameRequestCallback[] = [];

const THREAD_ID = "thread-1";

function makeThread(status: Thread["status"]): Thread {
  return {
    id: THREAD_ID,
    projectId: "proj-1",
    title: "Demo",
    agentKind: "codex",
    config: { model: "gpt-5.4" },
    status,
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
  };
}

function makeItem(input: { id: string; assistantText?: string }): PersistedRuntimeItem {
  return {
    id: input.id,
    type: "assistant_message",
    state: "completed",
    payload: {},
    streams: input.assistantText === undefined ? {} : { assistant_text: input.assistantText },
  };
}

function makeSnapshot(input: {
  status: Thread["status"];
  items: PersistedRuntimeItem[];
}): RemoteThreadSnapshot {
  return {
    snapshotSeq: 1,
    thread: makeThread(input.status),
    runtimeItems: input.items,
    completedTurns: [],
    contextUsage: null,
    updatedAt: "2026-03-21T10:00:00.000Z",
  };
}

function assistantStreamText(itemId: string): string | undefined {
  return useAppStore.getState().runtimeItemsByIdByThread[THREAD_ID]?.[itemId]?.streams
    .assistant_text;
}

describe("applyThreadSnapshot", () => {
  beforeEach(() => {
    rafCallbacks = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", (handle: number): void => {
      // Handles are 1-based indices into rafCallbacks.
      delete rafCallbacks[handle - 1];
    });
    resetRemoteStores();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetRemoteStores();
  });

  it("flushes pending rAF-queued deltas before replacing items (no duplicated text)", () => {
    // Seed the store with a streaming assistant item ("hello ").
    const store = useAppStore.getState();
    store.applyRuntimeEvents(THREAD_ID, [
      { type: "item.started", threadId: THREAD_ID, itemId: "msg-1", itemType: "assistant_message" },
      {
        type: "content.delta",
        threadId: THREAD_ID,
        itemId: "msg-1",
        stream: "assistant_text",
        delta: "hello ",
      },
    ]);
    expect(assistantStreamText("msg-1")).toBe("hello ");

    // A live "world" delta arrives and is coalesced onto the next frame — it is
    // NOT applied yet (the rAF callback is queued but unrun).
    dispatchRemoteSupervisorEvent({
      type: "thread-runtime-event",
      threadId: THREAD_ID,
      event: {
        type: "content.delta",
        threadId: THREAD_ID,
        itemId: "msg-1",
        stream: "assistant_text",
        delta: "world",
      },
    });
    expect(rafCallbacks.filter(Boolean).length).toBe(1);
    // Still just "hello " — the queued delta has not landed.
    expect(assistantStreamText("msg-1")).toBe("hello ");

    // The desktop's debounced history snapshot resolves; its copy of msg-1
    // already includes the full "hello world" text. Because the thread is
    // inactive, the snapshot replaces items. The guard must flush the queued
    // delta FIRST so it can't re-append "world" after the replace.
    applyThreadSnapshot(
      makeSnapshot({
        status: "idle",
        items: [makeItem({ id: "msg-1", assistantText: "hello world" })],
      }),
    );

    // Draining any remaining frame must not re-append the already-flushed delta.
    for (const cb of rafCallbacks.filter(Boolean)) cb(0);

    expect(assistantStreamText("msg-1")).toBe("hello world");
    // The snapshot's structural version bumped exactly once for the replace.
    expect(useAppStore.getState().runtimeItemIdsByThread[THREAD_ID]).toEqual(["msg-1"]);
  });

  it("applies a shorter fresh server snapshot to an inactive thread (fromServer default)", () => {
    const store = useAppStore.getState();
    store.applyRuntimeEvents(THREAD_ID, [
      { type: "item.started", threadId: THREAD_ID, itemId: "a", itemType: "assistant_message" },
      { type: "item.started", threadId: THREAD_ID, itemId: "b", itemType: "assistant_message" },
      { type: "item.started", threadId: THREAD_ID, itemId: "c", itemType: "assistant_message" },
    ]);
    expect(useAppStore.getState().runtimeItemIdsByThread[THREAD_ID]).toHaveLength(3);

    // Fresh server snapshot after a checkpoint revert: only one item remains.
    applyThreadSnapshot(makeSnapshot({ status: "idle", items: [makeItem({ id: "a" })] }));

    expect(useAppStore.getState().runtimeItemIdsByThread[THREAD_ID]).toEqual(["a"]);
  });

  it("does not let an empty fresh server snapshot erase a streamed transcript", () => {
    const store = useAppStore.getState();
    store.applyRuntimeEvents(THREAD_ID, [
      { type: "item.started", threadId: THREAD_ID, itemId: "a", itemType: "assistant_message" },
      {
        type: "content.delta",
        threadId: THREAD_ID,
        itemId: "a",
        stream: "assistant_text",
        delta: "kept",
      },
      { type: "item.completed", threadId: THREAD_ID, itemId: "a" },
    ]);
    expect(useAppStore.getState().runtimeItemIdsByThread[THREAD_ID]).toEqual(["a"]);

    applyThreadSnapshot(makeSnapshot({ status: "idle", items: [] }));

    expect(useAppStore.getState().runtimeItemIdsByThread[THREAD_ID]).toEqual(["a"]);
    expect(assistantStreamText("a")).toBe("kept");
  });

  it("does not let a shorter cached snapshot clobber a longer transcript", () => {
    const store = useAppStore.getState();
    store.applyRuntimeEvents(THREAD_ID, [
      { type: "item.started", threadId: THREAD_ID, itemId: "a", itemType: "assistant_message" },
      { type: "item.started", threadId: THREAD_ID, itemId: "b", itemType: "assistant_message" },
    ]);

    // Cached preload (fromServer:false) with fewer items must be ignored.
    applyThreadSnapshot(makeSnapshot({ status: "idle", items: [makeItem({ id: "a" })] }), {
      fromServer: false,
    });

    expect(useAppStore.getState().runtimeItemIdsByThread[THREAD_ID]).toEqual(["a", "b"]);
  });

  it("keeps a settled GUI thread idle when a trailing runtime event arrives after a server snapshot", () => {
    useAppStore.setState({ threads: [makeThread("idle")] });

    applyThreadSnapshot(makeSnapshot({ status: "idle", items: [makeItem({ id: "msg-1" })] }));

    expect(useAppStore.getState().runtimeOpenTurnByThread[THREAD_ID]).toBe(false);

    dispatchRemoteSupervisorEvent({
      type: "thread-runtime-event",
      threadId: THREAD_ID,
      event: {
        type: "item.started",
        threadId: THREAD_ID,
        itemId: "late-reasoning",
        itemType: "reasoning",
      },
    });
    for (const cb of rafCallbacks.filter(Boolean)) cb(0);

    expect(useAppStore.getState().threads[0]?.status).toBe("idle");
    expect(useAppStore.getState().runtimeItemIdsByThread[THREAD_ID]).toContain("late-reasoning");
  });

  it("restores server-settled thread metadata if history arrives after a late runtime event reopened it", () => {
    useAppStore.setState({
      threads: [{ ...makeThread("working"), attention: "working" }],
    });

    applyThreadSnapshot(makeSnapshot({ status: "idle", items: [makeItem({ id: "msg-1" })] }));

    expect(useAppStore.getState().threads[0]?.status).toBe("idle");
    expect(useAppStore.getState().runtimeOpenTurnByThread[THREAD_ID]).toBe(false);
  });
});
