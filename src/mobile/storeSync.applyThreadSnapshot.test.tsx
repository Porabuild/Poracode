import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { PersistedRuntimeItem } from "@/shared/ipc/schemas";
import type { RemoteThreadSnapshot } from "@/shared/remote";
import { useAppStore } from "@/renderer/state/appStore";
import { applyThreadSnapshot, dispatchRemoteSupervisorEvent, resetRemoteStores } from "./storeSync";

// storeSync coalesces live runtime deltas onto an animation frame; drive that
// frame deterministically so we can assert ordering around applyThreadSnapshot.
let rafCallbacks: Array<FrameRequestCallback | null> = [];
let timeoutCallbacks: Array<{ callback: () => void; delay: number } | null> = [];

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

function makeItem(input: {
  id: string;
  assistantText?: string;
  payload?: unknown;
}): PersistedRuntimeItem {
  return {
    id: input.id,
    type: "assistant_message",
    state: "completed",
    payload: input.payload ?? {},
    streams: input.assistantText === undefined ? {} : { assistant_text: input.assistantText },
  };
}

function makeSnapshot(input: {
  status: Thread["status"];
  items: PersistedRuntimeItem[];
  snapshotSeq?: number;
  runtimeNextCursor?: number | null;
}): RemoteThreadSnapshot {
  return {
    snapshotSeq: input.snapshotSeq ?? 1,
    thread: makeThread(input.status),
    runtimeItems: input.items,
    ...(input.runtimeNextCursor !== undefined
      ? { runtimeNextCursor: input.runtimeNextCursor }
      : {}),
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
    timeoutCallbacks = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", (handle: number): void => {
      // Handles are 1-based indices into rafCallbacks.
      rafCallbacks[handle - 1] = null;
    });
    vi.stubGlobal("setTimeout", (callback: () => void, delay = 0): number => {
      timeoutCallbacks.push({ callback, delay });
      return timeoutCallbacks.length;
    });
    vi.stubGlobal("clearTimeout", (handle: number): void => {
      timeoutCallbacks[handle - 1] = null;
    });
    resetRemoteStores();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetRemoteStores();
  });

  it("flushes pending rAF-queued deltas before replacing items (no duplicated text)", () => {
    useAppStore.setState({ view: { kind: "thread", panes: [THREAD_ID] } });
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
    expect(rafCallbacks.filter((callback) => callback !== null).length).toBe(1);
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
    for (const callback of rafCallbacks) callback?.(0);

    expect(assistantStreamText("msg-1")).toBe("hello world");
    // The snapshot's structural version bumped exactly once for the replace.
    expect(useAppStore.getState().runtimeItemIdsByThread[THREAD_ID]).toEqual(["msg-1"]);
  });

  it("catches up text appended to the same item while Safari was suspended", () => {
    const store = useAppStore.getState();
    store.applyRuntimeEvents(THREAD_ID, [
      { type: "item.started", threadId: THREAD_ID, itemId: "msg-1", itemType: "assistant_message" },
      {
        type: "content.delta",
        threadId: THREAD_ID,
        itemId: "msg-1",
        stream: "assistant_text",
        delta: "before background",
      },
    ]);

    applyThreadSnapshot(
      makeSnapshot({
        status: "working",
        items: [makeItem({ id: "msg-1", assistantText: "before background and after resume" })],
      }),
    );

    expect(assistantStreamText("msg-1")).toBe("before background and after resume");
    expect(
      useAppStore.getState().runtimeItemsByIdByThread[THREAD_ID]?.["msg-1"]?.observedLive,
    ).toBe(true);
  });

  it("keeps newer live text when an active recovery snapshot is behind", () => {
    const store = useAppStore.getState();
    store.applyRuntimeEvents(THREAD_ID, [
      { type: "item.started", threadId: THREAD_ID, itemId: "msg-1", itemType: "assistant_message" },
      {
        type: "content.delta",
        threadId: THREAD_ID,
        itemId: "msg-1",
        stream: "assistant_text",
        delta: "newer live text",
      },
    ]);

    applyThreadSnapshot(
      makeSnapshot({
        status: "working",
        items: [makeItem({ id: "msg-1", assistantText: "newer" })],
      }),
    );

    expect(assistantStreamText("msg-1")).toBe("newer live text");
  });

  it("does not overwrite a newer live payload with an active recovery snapshot", () => {
    const store = useAppStore.getState();
    store.applyRuntimeEvents(THREAD_ID, [
      {
        type: "item.started",
        threadId: THREAD_ID,
        itemId: "msg-1",
        itemType: "assistant_message",
        payload: { phase: "old" },
      },
      {
        type: "item.updated",
        threadId: THREAD_ID,
        itemId: "msg-1",
        payload: { phase: "new" },
      },
    ]);

    applyThreadSnapshot(
      makeSnapshot({
        status: "working",
        items: [makeItem({ id: "msg-1", payload: { phase: "old" } })],
      }),
    );

    expect(useAppStore.getState().runtimeItemsByIdByThread[THREAD_ID]?.["msg-1"]?.payload).toEqual({
      phase: "new",
    });
  });

  it("flushes a just-received delta before judging an active recovery snapshot", () => {
    useAppStore.setState({ view: { kind: "thread", panes: [THREAD_ID] } });
    const store = useAppStore.getState();
    store.applyRuntimeEvents(THREAD_ID, [
      { type: "item.started", threadId: THREAD_ID, itemId: "msg-1", itemType: "assistant_message" },
      {
        type: "content.delta",
        threadId: THREAD_ID,
        itemId: "msg-1",
        stream: "assistant_text",
        delta: "base",
      },
    ]);
    dispatchRemoteSupervisorEvent({
      type: "thread-runtime-event",
      threadId: THREAD_ID,
      event: {
        type: "content.delta",
        threadId: THREAD_ID,
        itemId: "msg-1",
        stream: "assistant_text",
        delta: " live",
      },
    });

    applyThreadSnapshot(
      makeSnapshot({
        status: "working",
        items: [makeItem({ id: "msg-1", assistantText: "base stale" })],
      }),
    );

    expect(assistantStreamText("msg-1")).toBe("base live");
  });

  it("frame-paces the visible thread and batches concurrent background streams", () => {
    const applyRuntimeEventBatches = vi.spyOn(useAppStore.getState(), "applyRuntimeEventBatches");
    useAppStore.setState({ view: { kind: "thread", panes: [THREAD_ID] } });

    for (let index = 0; index < 10; index += 1) {
      const threadId = index === 0 ? THREAD_ID : `background-${index}`;
      for (let eventIndex = 0; eventIndex < 5; eventIndex += 1) {
        dispatchRemoteSupervisorEvent({
          type: "thread-runtime-event",
          threadId,
          event: {
            type: "item.started",
            threadId,
            itemId: `${threadId}-${eventIndex}`,
            itemType: "reasoning",
          },
        });
      }
    }

    expect(rafCallbacks.filter((callback) => callback !== null)).toHaveLength(1);
    rafCallbacks.find((callback) => callback !== null)?.(0);
    expect(applyRuntimeEventBatches).toHaveBeenCalledTimes(1);
    expect(applyRuntimeEventBatches.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ threadId: THREAD_ID, events: expect.any(Array) }),
    ]);

    const backgroundFlush = timeoutCallbacks.find((pending) => pending?.delay === 250);
    expect(backgroundFlush?.delay).toBe(250);
    backgroundFlush?.callback();
    expect(applyRuntimeEventBatches).toHaveBeenCalledTimes(2);
    expect(applyRuntimeEventBatches.mock.calls[1]?.[0]).toHaveLength(9);

    applyRuntimeEventBatches.mockRestore();
    resetRemoteStores();
  });

  it("promotes queued background events when their thread becomes visible", () => {
    const applyRuntimeEventBatches = vi.spyOn(useAppStore.getState(), "applyRuntimeEventBatches");
    useAppStore.setState({ view: { kind: "home" } });
    dispatchRemoteSupervisorEvent({
      type: "thread-runtime-event",
      threadId: THREAD_ID,
      event: {
        type: "item.started",
        threadId: THREAD_ID,
        itemId: "promoted",
        itemType: "reasoning",
      },
    });
    expect(rafCallbacks.filter((callback) => callback !== null)).toHaveLength(0);

    useAppStore.setState({ view: { kind: "thread", panes: [THREAD_ID] } });
    expect(rafCallbacks.filter((callback) => callback !== null)).toHaveLength(1);
    rafCallbacks.find((callback) => callback !== null)?.(0);
    expect(applyRuntimeEventBatches).toHaveBeenCalledTimes(1);

    applyRuntimeEventBatches.mockRestore();
    resetRemoteStores();
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

  it("refreshes a paged tail without discarding older pages already loaded", () => {
    const store = useAppStore.getState();
    store.applyRuntimeEvents(THREAD_ID, [
      { type: "item.started", threadId: THREAD_ID, itemId: "old-a", itemType: "assistant_message" },
      { type: "item.started", threadId: THREAD_ID, itemId: "old-b", itemType: "assistant_message" },
      {
        type: "item.started",
        threadId: THREAD_ID,
        itemId: "tail-a",
        itemType: "assistant_message",
      },
      {
        type: "item.started",
        threadId: THREAD_ID,
        itemId: "tail-b",
        itemType: "assistant_message",
      },
    ]);

    applyThreadSnapshot(
      makeSnapshot({
        status: "idle",
        items: [makeItem({ id: "tail-a", assistantText: "updated" }), makeItem({ id: "tail-b" })],
        runtimeNextCursor: 10,
      }),
    );

    expect(useAppStore.getState().runtimeItemIdsByThread[THREAD_ID]).toEqual([
      "old-a",
      "old-b",
      "tail-a",
      "tail-b",
    ]);
    expect(assistantStreamText("tail-a")).toBe("updated");
  });

  it("splices a missed initial user_message ahead of a fresher live transcript", () => {
    // Launch race: the thread's first events broadcast before this client's
    // mirrored thread list contained the id, so the live filter dropped the
    // user_message; everything after applied normally.
    const store = useAppStore.getState();
    store.applyRuntimeEvents(THREAD_ID, [
      { type: "item.started", threadId: THREAD_ID, itemId: "msg-1", itemType: "assistant_message" },
      {
        type: "content.delta",
        threadId: THREAD_ID,
        itemId: "msg-1",
        stream: "assistant_text",
        delta: "streamed live text",
      },
      { type: "item.started", threadId: THREAD_ID, itemId: "cmd-1", itemType: "command_execution" },
    ]);

    // History fetched mid-turn: knows the missed user_message but is behind on
    // the streaming tail (same length as local → active snapshot is rejected).
    applyThreadSnapshot(
      makeSnapshot({
        status: "working",
        items: [
          {
            id: "user-1",
            type: "user_message",
            state: "completed",
            payload: { content: [{ type: "text", text: "the prompt" }] },
            streams: {},
          },
          makeItem({ id: "msg-1", assistantText: "streamed" }),
        ],
      }),
    );

    expect(useAppStore.getState().runtimeItemIdsByThread[THREAD_ID]).toEqual([
      "user-1",
      "msg-1",
      "cmd-1",
    ]);
    // The fresher live tail is untouched.
    expect(assistantStreamText("msg-1")).toBe("streamed live text");
  });

  it("does not splice a missed prefix from a cached (non-server) snapshot", () => {
    const store = useAppStore.getState();
    store.applyRuntimeEvents(THREAD_ID, [
      { type: "item.started", threadId: THREAD_ID, itemId: "msg-1", itemType: "assistant_message" },
      { type: "item.started", threadId: THREAD_ID, itemId: "msg-2", itemType: "assistant_message" },
    ]);

    applyThreadSnapshot(
      makeSnapshot({
        status: "working",
        items: [
          {
            id: "user-1",
            type: "user_message",
            state: "completed",
            payload: {},
            streams: {},
          },
          makeItem({ id: "msg-1" }),
        ],
      }),
      { fromServer: false },
    );

    expect(useAppStore.getState().runtimeItemIdsByThread[THREAD_ID]).toEqual(["msg-1", "msg-2"]);
  });

  it("does not splice when the local head is absent from the snapshot window", () => {
    const store = useAppStore.getState();
    store.applyRuntimeEvents(THREAD_ID, [
      { type: "item.started", threadId: THREAD_ID, itemId: "msg-9", itemType: "assistant_message" },
      {
        type: "item.started",
        threadId: THREAD_ID,
        itemId: "msg-10",
        itemType: "assistant_message",
      },
    ]);

    // Stale snapshot from before msg-9 existed: no safe alignment point.
    applyThreadSnapshot(
      makeSnapshot({
        status: "working",
        items: [
          {
            id: "user-1",
            type: "user_message",
            state: "completed",
            payload: {},
            streams: {},
          },
          makeItem({ id: "msg-8" }),
        ],
      }),
    );

    expect(useAppStore.getState().runtimeItemIdsByThread[THREAD_ID]).toEqual(["msg-9", "msg-10"]);
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
    useAppStore.setState({
      threads: [makeThread("idle")],
      view: { kind: "thread", panes: [THREAD_ID] },
    });

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
    for (const callback of rafCallbacks) callback?.(0);

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

  it("does not restore a finished badge after the thread has been opened", () => {
    useAppStore.setState({
      threads: [makeThread("finished")],
      view: { kind: "thread", panes: [THREAD_ID] },
    });

    applyThreadSnapshot(makeSnapshot({ status: "finished", items: [] }));

    expect(useAppStore.getState().threads[0]?.status).toBe("idle");
  });

  it("keeps a finished badge from history while the thread is not visible", () => {
    useAppStore.setState({
      threads: [makeThread("idle")],
      view: { kind: "home" },
    });

    applyThreadSnapshot(makeSnapshot({ status: "finished", items: [] }));

    expect(useAppStore.getState().threads[0]?.status).toBe("finished");
  });
});
