import { describe, expect, it, beforeEach } from "vitest";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { RuntimeEvent } from "@/shared/contracts";
import {
  createRuntimeEventSlice,
  type RuntimeChatItem,
  type RuntimeEventSlice,
} from "./runtimeEventSlice";

/**
 * Reducer tests for the runtime event slice. Exercise it as a standalone
 * Zustand store so the rest of the app store doesn't have to be wired up.
 */
function makeStore() {
  return create<RuntimeEventSlice>()(
    subscribeWithSelector((set, get, store) =>
      // Cast — the slice's `SliceCreator<T>` parameter expects the full app
      // state, but the slice itself only touches its own keys. Safe in tests.
      createRuntimeEventSlice(set as never, get as never, store as never),
    ),
  );
}

describe("runtimeEventSlice.applyRuntimeEvent", () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
  });

  function apply(threadId: string, event: RuntimeEvent) {
    store.getState().applyRuntimeEvent(threadId, event);
  }

  function applyBatch(threadId: string, events: RuntimeEvent[]) {
    store.getState().applyRuntimeEvents(threadId, events);
  }

  it("appends a new item on item.started", () => {
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "i1",
      itemType: "assistant_message",
    });
    const state = store.getState();
    expect(state.runtimeItemIdsByThread["t1"]).toEqual(["i1"]);
    expect(state.runtimeItemsByIdByThread["t1"]?.["i1"]).toMatchObject({
      id: "i1",
      type: "assistant_message",
      state: "started",
    });
  });

  it("records a local completion timestamp without replacing the start timestamp", () => {
    const startedBefore = Date.now();
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "i1",
      itemType: "tool_call",
      payload: { name: "spawnAgent", status: "running", isSubAgent: true },
    });
    const startedAt = store.getState().runtimeItemsByIdByThread["t1"]?.["i1"]?.startedAt;
    expect(startedAt).toBeGreaterThanOrEqual(startedBefore);

    apply("t1", {
      type: "item.completed",
      threadId: "t1",
      itemId: "i1",
      payload: { status: "success" },
    });

    const item = store.getState().runtimeItemsByIdByThread["t1"]?.["i1"];
    expect(item?.startedAt).toBe(startedAt);
    expect(item?.completedAt).toBeGreaterThanOrEqual(startedAt ?? 0);
  });

  it("is idempotent for repeated item.started with the same id", () => {
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "i1",
      itemType: "assistant_message",
    });
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "i1",
      itemType: "assistant_message",
    });
    expect(store.getState().runtimeItemIdsByThread["t1"]).toEqual(["i1"]);
  });

  it("accumulates content.delta into the right stream bucket", () => {
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "i1",
      itemType: "assistant_message",
    });
    apply("t1", {
      type: "content.delta",
      threadId: "t1",
      itemId: "i1",
      stream: "assistant_text",
      delta: "Hello",
    });
    apply("t1", {
      type: "content.delta",
      threadId: "t1",
      itemId: "i1",
      stream: "assistant_text",
      delta: " world",
    });
    expect(store.getState().runtimeItemsByIdByThread["t1"]?.["i1"]?.streams.assistant_text).toBe(
      "Hello world",
    );
  });

  it("updates the streamed item without cloning the whole thread item map", () => {
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "i1",
      itemType: "assistant_message",
    });
    const beforeItems = store.getState().runtimeItemsByIdByThread["t1"];
    const beforeItem = beforeItems?.["i1"];

    apply("t1", {
      type: "content.delta",
      threadId: "t1",
      itemId: "i1",
      stream: "assistant_text",
      delta: "Hello",
    });

    const afterItems = store.getState().runtimeItemsByIdByThread["t1"];
    expect(afterItems).toBe(beforeItems);
    expect(afterItems?.["i1"]).not.toBe(beforeItem);
    expect(afterItems?.["i1"]?.streams.assistant_text).toBe("Hello");
  });

  it("applies structural item events without cloning the whole thread item map", () => {
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "i1",
      itemType: "assistant_message",
    });
    const beforeItems = store.getState().runtimeItemsByIdByThread["t1"];
    const beforeItem = beforeItems?.["i1"];

    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "i2",
      itemType: "assistant_message",
    });
    expect(store.getState().runtimeItemsByIdByThread["t1"]).toBe(beforeItems);

    apply("t1", {
      type: "item.updated",
      threadId: "t1",
      itemId: "i1",
      payload: { content: [] },
    });
    const updatedItems = store.getState().runtimeItemsByIdByThread["t1"];
    expect(updatedItems).toBe(beforeItems);
    expect(updatedItems?.["i1"]).not.toBe(beforeItem);

    apply("t1", {
      type: "item.completed",
      threadId: "t1",
      itemId: "i1",
    });
    expect(store.getState().runtimeItemsByIdByThread["t1"]).toBe(beforeItems);
    expect(store.getState().runtimeItemsByIdByThread["t1"]?.["i1"]?.state).toBe("completed");
  });

  it("notifies item selectors while preserving the thread item map", () => {
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "i1",
      itemType: "assistant_message",
    });
    const beforeItems = store.getState().runtimeItemsByIdByThread["t1"];
    const observed: string[] = [];
    const unsubscribe = store.subscribe(
      (state) => state.runtimeItemsByIdByThread["t1"]?.["i1"],
      (item) => observed.push(item?.state ?? "missing"),
    );

    apply("t1", {
      type: "item.completed",
      threadId: "t1",
      itemId: "i1",
    });

    unsubscribe();
    expect(store.getState().runtimeItemsByIdByThread["t1"]).toBe(beforeItems);
    expect(observed).toEqual(["completed"]);
  });

  it("stores context usage updates", () => {
    apply("t1", {
      type: "context.updated",
      threadId: "t1",
      usage: {
        usedTokens: 71_000,
        maxTokens: 200_000,
        breakdown: [{ id: "input", label: "Input", tokens: 71_000 }],
      },
    });

    expect(store.getState().runtimeContextByThread["t1"]).toEqual({
      usedTokens: 71_000,
      maxTokens: 200_000,
      breakdown: [{ id: "input", label: "Input", tokens: 71_000 }],
    });
  });

  it("preserves the context limit and replaces stale breakdown on partial updates", () => {
    apply("t1", {
      type: "context.updated",
      threadId: "t1",
      usage: {
        usedTokens: 71_000,
        maxTokens: 200_000,
        breakdown: [{ id: "input", label: "Input", tokens: 71_000 }],
      },
    });

    apply("t1", {
      type: "context.updated",
      threadId: "t1",
      usage: {
        usedTokens: 9_900,
        breakdown: [{ id: "current-context", label: "Current context", tokens: 9_900 }],
      },
    });

    expect(store.getState().runtimeContextByThread["t1"]).toEqual({
      usedTokens: 9_900,
      maxTokens: 200_000,
      breakdown: [{ id: "current-context", label: "Current context", tokens: 9_900 }],
    });
  });

  it("keeps compacted usage when a later refresh reports only the context limit", () => {
    apply("t1", {
      type: "context.updated",
      threadId: "t1",
      usage: {
        usedTokens: 15_000,
        breakdown: [{ id: "current-context", label: "Current context", tokens: 15_000 }],
      },
    });

    apply("t1", {
      type: "context.updated",
      threadId: "t1",
      usage: { maxTokens: 1_000_000 },
    });

    expect(store.getState().runtimeContextByThread["t1"]).toEqual({
      usedTokens: 15_000,
      maxTokens: 1_000_000,
      breakdown: [{ id: "current-context", label: "Current context", tokens: 15_000 }],
    });
  });

  // Streams are append-only: a delta boundary that lands on a repeated
  // character (e.g. "aws s" + "so login") must not be deduplicated. Both the
  // per-event reducer and the batch coalescer must preserve it.
  const repeatedCharChunks: RuntimeEvent[] = [
    { type: "item.started", threadId: "t1", itemId: "i1", itemType: "assistant_message" },
    {
      type: "content.delta",
      threadId: "t1",
      itemId: "i1",
      stream: "assistant_text",
      delta: "aws s",
    },
    {
      type: "content.delta",
      threadId: "t1",
      itemId: "i1",
      stream: "assistant_text",
      delta: "so login --profile DataScience-Team-228",
    },
    {
      type: "content.delta",
      threadId: "t1",
      itemId: "i1",
      stream: "assistant_text",
      delta: "889582725",
    },
  ];
  const repeatedCharResult = "aws sso login --profile DataScience-Team-228889582725";

  it.each([
    ["applied one at a time", (events: RuntimeEvent[]) => events.forEach((e) => apply("t1", e))],
    ["coalesced as a batch", (events: RuntimeEvent[]) => applyBatch("t1", events)],
  ])("preserves repeated characters across streamed chunk boundaries (%s)", (_label, deliver) => {
    deliver(repeatedCharChunks);
    expect(store.getState().runtimeItemsByIdByThread["t1"]?.["i1"]?.streams.assistant_text).toBe(
      repeatedCharResult,
    );
  });

  it("locks state at 'completed' even after later updates land", () => {
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "i1",
      itemType: "assistant_message",
    });
    apply("t1", { type: "item.completed", threadId: "t1", itemId: "i1" });
    apply("t1", {
      type: "content.delta",
      threadId: "t1",
      itemId: "i1",
      stream: "assistant_text",
      delta: "late",
    });
    const item = store.getState().runtimeItemsByIdByThread["t1"]?.["i1"];
    expect(item?.state).toBe("completed");
    expect(item?.streams.assistant_text).toBe("late"); // delta still appends, but state stays completed
  });

  it("drops a reasoning item on item.completed when no text was streamed", () => {
    // Some agents emit a reasoning bracket that never produces text. Keeping
    // it in the timeline would split otherwise-adjacent tool calls into
    // separate groups, so the slice prunes it on completion.
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "tool-1",
      itemType: "tool_call",
    });
    apply("t1", {
      type: "item.completed",
      threadId: "t1",
      itemId: "tool-1",
    });
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "reason-1",
      itemType: "reasoning",
    });
    apply("t1", {
      type: "item.completed",
      threadId: "t1",
      itemId: "reason-1",
    });
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "tool-2",
      itemType: "tool_call",
    });
    const state = store.getState();
    expect(state.runtimeItemIdsByThread["t1"]).toEqual(["tool-1", "tool-2"]);
    expect(state.runtimeItemsByIdByThread["t1"]?.["reason-1"]).toBeUndefined();
  });

  it("keeps a reasoning item that completed with text", () => {
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "reason-1",
      itemType: "reasoning",
    });
    apply("t1", {
      type: "content.delta",
      threadId: "t1",
      itemId: "reason-1",
      stream: "reasoning_text",
      delta: "thinking…",
    });
    apply("t1", {
      type: "item.completed",
      threadId: "t1",
      itemId: "reason-1",
    });
    const state = store.getState();
    expect(state.runtimeItemIdsByThread["t1"]).toEqual(["reason-1"]);
    expect(state.runtimeItemsByIdByThread["t1"]?.["reason-1"]?.streams.reasoning_text).toBe(
      "thinking…",
    );
  });

  it("drops trailing reasoning when a turn is interrupted before the agent finishes it", () => {
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "tool-1",
      itemType: "command_execution",
    });
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "reason-1",
      itemType: "reasoning",
    });
    apply("t1", {
      type: "content.delta",
      threadId: "t1",
      itemId: "reason-1",
      stream: "reasoning_text",
      delta: "still thinking",
    });
    apply("t1", {
      type: "item.completed",
      threadId: "t1",
      itemId: "reason-1",
    });
    apply("t1", {
      type: "turn.completed",
      threadId: "t1",
      turnId: "turn-1",
      state: "interrupted",
    });
    const state = store.getState();
    expect(state.runtimeItemIdsByThread["t1"]).toEqual(["tool-1"]);
    expect(state.runtimeItemsByIdByThread["t1"]?.["reason-1"]).toBeUndefined();
  });

  it("keeps completed reasoning that is followed by real agent output on interrupted turns", () => {
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "reason-1",
      itemType: "reasoning",
    });
    apply("t1", {
      type: "content.delta",
      threadId: "t1",
      itemId: "reason-1",
      stream: "reasoning_text",
      delta: "finished thought",
    });
    apply("t1", {
      type: "item.completed",
      threadId: "t1",
      itemId: "reason-1",
    });
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "asst-1",
      itemType: "assistant_message",
    });
    apply("t1", {
      type: "turn.completed",
      threadId: "t1",
      turnId: "turn-1",
      state: "cancelled",
    });
    const state = store.getState();
    expect(state.runtimeItemIdsByThread["t1"]).toEqual(["reason-1", "asst-1"]);
    expect(state.runtimeItemsByIdByThread["t1"]?.["reason-1"]).toBeDefined();
  });

  it("preserves Copilot-style subagent children when the parent completes", () => {
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "tool-parent",
      itemType: "tool_call",
      payload: {
        name: "Critiquing path fixes",
        title: "Critiquing path fixes",
        status: "running",
        isSubAgent: true,
        args: {
          description: "Critiquing path fixes",
          agent_type: "rubber-duck",
          name: "path-fix-duck",
          prompt: "We need to get a clean green run.",
        },
      },
    });
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "child-1",
      itemType: "assistant_message",
      parentItemId: "tool-parent",
    });
    apply("t1", {
      type: "item.completed",
      threadId: "t1",
      itemId: "tool-parent",
      payload: { status: "success" },
    });
    const state = store.getState();
    expect(state.runtimeItemIdsByThread["t1"]).toEqual(["tool-parent", "child-1"]);
    expect(state.runtimeItemsByIdByThread["t1"]?.["child-1"]).toMatchObject({
      id: "child-1",
      parentItemId: "tool-parent",
    });
  });

  it("does not force-complete non-subagent nested tool calls during stale reconciliation", () => {
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "parent-tool",
      itemType: "tool_call",
      payload: {
        name: "Parent",
        status: "running",
      },
    });
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "nested-tool",
      itemType: "tool_call",
      parentItemId: "parent-tool",
      payload: {
        name: "Nested",
        status: "running",
      },
    });

    store.getState().reconcileStaleSubAgents("t1");

    expect(store.getState().runtimeItemsByIdByThread["t1"]?.["nested-tool"]).toMatchObject({
      id: "nested-tool",
      state: "started",
      payload: {
        status: "running",
      },
    });
  });

  it("force-completes explicitly tagged stale subagent tool calls", () => {
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "subagent-tool",
      itemType: "tool_call",
      payload: {
        name: "Task",
        status: "running",
        isSubAgent: true,
      },
    });

    store.getState().reconcileStaleSubAgents("t1");

    expect(store.getState().runtimeItemsByIdByThread["t1"]?.["subagent-tool"]).toMatchObject({
      id: "subagent-tool",
      state: "completed",
      payload: {
        status: "error",
        result: {
          error: "Interrupted: agent session ended before completion.",
        },
      },
    });
  });

  it("marks a stale Crossagent terminal in both status fields", () => {
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "crossagent-tool",
      itemType: "tool_call",
      payload: {
        name: "Crossagent",
        status: "running",
        isCrossagent: true,
        crossagentStatus: "running",
      },
    });

    store.getState().reconcileStaleSubAgents("t1");

    expect(store.getState().runtimeItemsByIdByThread["t1"]?.["crossagent-tool"]).toMatchObject({
      state: "completed",
      payload: {
        status: "error",
        crossagentStatus: "failed",
        result: {
          error: "Interrupted: agent session ended before completion.",
        },
      },
    });
  });

  it("does not force-complete stale Crossagents MCP calls tagged by older mappers", () => {
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "raw-crossagents-mcp",
      itemType: "tool_call",
      payload: {
        name: "mcp__crossagents__spawn_agent",
        status: "running",
        isSubAgent: true,
      },
    });

    store.getState().reconcileStaleSubAgents("t1");

    expect(store.getState().runtimeItemsByIdByThread["t1"]?.["raw-crossagents-mcp"]).toMatchObject({
      state: "started",
      payload: { status: "running" },
    });
  });

  it("opens and resolves runtime requests", () => {
    apply("t1", {
      type: "request.opened",
      threadId: "t1",
      requestId: "r1",
      requestType: "command_execution_approval",
      payload: { summary: "Run script.sh" },
    });
    expect(store.getState().runtimeRequestsByThread["t1"]).toHaveLength(1);

    apply("t1", { type: "request.resolved", threadId: "t1", requestId: "r1", outcome: "accepted" });
    expect(store.getState().runtimeRequestsByThread["t1"]).toHaveLength(0);
  });

  it("synthesises an inline error item on error events", () => {
    apply("t1", { type: "error", threadId: "t1", message: "boom" });
    const state = store.getState();
    expect(state.runtimeItemIdsByThread["t1"]).toHaveLength(1);
    const errorItemId = state.runtimeItemIdsByThread["t1"]?.[0];
    expect(errorItemId).toBeTruthy();
    expect(state.runtimeItemsByIdByThread["t1"]?.[errorItemId!]).toMatchObject({
      type: "error",
      state: "completed",
      payload: { message: "boom" },
    });
  });

  it("clearThreadRuntimeEvents drops items and requests for that thread only", () => {
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "i1",
      itemType: "user_message",
    });
    apply("t2", {
      type: "item.started",
      threadId: "t2",
      itemId: "i2",
      itemType: "user_message",
    });
    apply("t1", {
      type: "request.opened",
      threadId: "t1",
      requestId: "r1",
      requestType: "tool_user_input",
      payload: { summary: "Pick" },
    });

    store.getState().clearThreadRuntimeEvents("t1");

    expect(store.getState().runtimeItemIdsByThread["t1"]).toBeUndefined();
    expect(store.getState().runtimeItemsByIdByThread["t1"]).toBeUndefined();
    expect(store.getState().runtimeRequestsByThread["t1"]).toBeUndefined();
    expect(store.getState().runtimeItemIdsByThread["t2"]).toEqual(["i2"]);
  });

  it("truncates a thread transcript to a checkpoint item", () => {
    for (const itemId of ["user-1", "assistant-1", "user-2", "assistant-2"]) {
      apply("t1", {
        type: "item.started",
        threadId: "t1",
        itemId,
        itemType: itemId.startsWith("user") ? "user_message" : "assistant_message",
      });
    }
    apply("t1", {
      type: "request.opened",
      threadId: "t1",
      requestId: "r1",
      requestType: "tool_user_input",
      payload: { summary: "Pick" },
    });
    store.getState().hydrateThreadCompletedTurns("t1", [
      { startedAt: 1, endedAt: 2, anchorItemId: "assistant-1" },
      { startedAt: 3, endedAt: 4, anchorItemId: "assistant-2" },
    ]);

    store.getState().truncateThreadRuntimeAfter("t1", "assistant-1");

    expect(store.getState().runtimeItemIdsByThread["t1"]).toEqual(["user-1", "assistant-1"]);
    expect(store.getState().runtimeItemsByIdByThread["t1"]?.["user-2"]).toBeUndefined();
    expect(store.getState().runtimeRequestsByThread["t1"]).toEqual([]);
    expect(store.getState().runtimeCompletedTurnsByThread["t1"]).toEqual([
      { startedAt: 1, endedAt: 2, anchorItemId: "assistant-1" },
    ]);
  });

  it("merges persisted completed turns with live turns during hydration", () => {
    store
      .getState()
      .hydrateThreadCompletedTurns("t1", [{ startedAt: 20, endedAt: 30, anchorItemId: "live" }]);
    store.getState().hydrateThreadCompletedTurns("t1", [
      { startedAt: 1, endedAt: 10, anchorItemId: "old" },
      { startedAt: 20, endedAt: 30, anchorItemId: "live" },
    ]);

    expect(store.getState().runtimeCompletedTurnsByThread["t1"]).toEqual([
      { startedAt: 1, endedAt: 10, anchorItemId: "old" },
      { startedAt: 20, endedAt: 30, anchorItemId: "live" },
    ]);
  });

  it("collapses the same completed-turn window stored under two anchors", () => {
    store
      .getState()
      .hydrateThreadCompletedTurns("t1", [
        { startedAt: 20, endedAt: 42, anchorItemId: "assistant-1" },
      ]);
    store
      .getState()
      .hydrateThreadCompletedTurns("t1", [{ startedAt: 20, endedAt: 42, anchorItemId: "goal-1" }]);

    expect(store.getState().runtimeCompletedTurnsByThread["t1"]).toEqual([
      { startedAt: 20, endedAt: 42, anchorItemId: "assistant-1" },
    ]);
  });

  it("flags live-streamed items as observedLive for session-scoped liveness", () => {
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "i1",
      itemType: "tool_call",
    });
    expect(store.getState().runtimeItemsByIdByThread["t1"]?.["i1"]?.observedLive).toBe(true);
  });

  it("does not flag DB-hydrated items as observedLive (replayed on thread open)", () => {
    const seeded: RuntimeChatItem = {
      id: "i1",
      type: "tool_call",
      state: "completed",
      streams: {},
    };
    store.getState().hydrateThreadRuntimeItems("t1", [seeded]);
    expect(store.getState().runtimeItemsByIdByThread["t1"]?.["i1"]?.observedLive).toBeUndefined();
  });

  it("prepends an older page without replacing newer or live items", () => {
    const newer: RuntimeChatItem = {
      id: "newer",
      type: "assistant_message",
      state: "completed",
      streams: { assistant_text: "newer" },
    };
    store.getState().hydrateThreadRuntimeItems("t1", [newer]);
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "live",
      itemType: "assistant_message",
    });

    store.getState().prependThreadRuntimeItems("t1", [
      {
        id: "older",
        type: "user_message",
        state: "completed",
        streams: {},
      },
      {
        ...newer,
        streams: { assistant_text: "stale duplicate" },
      },
    ]);

    expect(store.getState().runtimeItemIdsByThread["t1"]).toEqual(["older", "newer", "live"]);
    expect(store.getState().runtimeItemsByIdByThread["t1"]?.["newer"]).toBe(newer);
    expect(store.getState().runtimeItemsByIdByThread["t1"]?.["live"]?.observedLive).toBe(true);
  });

  it("applies concurrent thread batches in a single store update", () => {
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "a1",
      itemType: "assistant_message",
    });
    apply("t2", {
      type: "item.started",
      threadId: "t2",
      itemId: "b1",
      itemType: "assistant_message",
    });

    let setCount = 0;
    const unsub = store.subscribe(() => {
      setCount += 1;
    });

    store.getState().applyRuntimeEventBatches([
      {
        threadId: "t1",
        events: [
          {
            type: "content.delta",
            threadId: "t1",
            itemId: "a1",
            stream: "assistant_text",
            delta: "hello",
          },
        ],
      },
      {
        threadId: "t2",
        events: [
          {
            type: "content.delta",
            threadId: "t2",
            itemId: "b1",
            stream: "assistant_text",
            delta: "world",
          },
        ],
      },
    ]);
    unsub();

    expect(setCount).toBe(1);
    expect(store.getState().runtimeItemsByIdByThread["t1"]?.["a1"]?.streams.assistant_text).toBe(
      "hello",
    );
    expect(store.getState().runtimeItemsByIdByThread["t2"]?.["b1"]?.streams.assistant_text).toBe(
      "world",
    );
  });

  it("hydrates a large subagent lifecycle batch with final item state intact", () => {
    const events: RuntimeEvent[] = Array.from({ length: 250 }, (_item, index) => {
      const itemId = `child-${index}`;
      return [
        {
          type: "item.started" as const,
          threadId: "t1",
          itemId,
          itemType: "tool_call" as const,
          parentItemId: "subagent-1",
          payload: { name: `tool-${index}`, status: "running" as const },
        },
        {
          type: "item.updated" as const,
          threadId: "t1",
          itemId,
          payload: { title: `Tool ${index}` },
        },
        {
          type: "item.completed" as const,
          threadId: "t1",
          itemId,
          payload: { status: "success" as const },
        },
      ];
    }).flat();

    applyBatch("t1", events);

    const state = store.getState();
    expect(state.runtimeItemIdsByThread["t1"]).toHaveLength(250);
    expect(state.runtimeItemsByIdByThread["t1"]?.["child-249"]).toMatchObject({
      state: "completed",
      parentItemId: "subagent-1",
      payload: { name: "tool-249", title: "Tool 249", status: "success" },
    });
    expect(state.runtimeStructuralVersionByThread["t1"]).toBe(1);
  });

  it("keeps lifecycle runs batched around an interleaved usage event", () => {
    const events: RuntimeEvent[] = Array.from({ length: 250 }, (_item, index) => {
      const itemId = `child-${index}`;
      return [
        {
          type: "item.started" as const,
          threadId: "t1",
          itemId,
          itemType: "tool_call" as const,
          parentItemId: "subagent-1",
          payload: { name: `tool-${index}`, status: "running" as const },
        },
        {
          type: "item.completed" as const,
          threadId: "t1",
          itemId,
          payload: { status: "success" as const },
        },
      ];
    }).flat();
    events.splice(250, 0, {
      type: "usage.spent",
      threadId: "t1",
      usage: {
        counterKind: "cumulative",
        counter: 1,
        scopeId: "child-thread",
        epoch: 0,
        sampleId: "sample-1",
      },
    });

    applyBatch("t1", events);

    const state = store.getState();
    expect(state.runtimeItemIdsByThread["t1"]).toHaveLength(250);
    expect(state.runtimeItemsByIdByThread["t1"]?.["child-0"]?.state).toBe("completed");
    expect(state.runtimeItemsByIdByThread["t1"]?.["child-249"]?.state).toBe("completed");
    expect(state.runtimeStructuralVersionByThread["t1"]).toBe(1);
  });

  it("preserves item edge cases within one mutable batch draft", () => {
    applyBatch("t1", [
      {
        type: "item.started",
        threadId: "t1",
        itemId: "empty-reasoning",
        itemType: "reasoning",
      },
      {
        type: "item.started",
        threadId: "t1",
        itemId: "empty-reasoning",
        itemType: "reasoning",
      },
      {
        type: "item.updated",
        threadId: "t1",
        itemId: "missing",
        payload: { ignored: true },
      },
      {
        type: "item.completed",
        threadId: "t1",
        itemId: "empty-reasoning",
      },
      {
        type: "item.started",
        threadId: "t1",
        itemId: "assistant",
        itemType: "assistant_message",
      },
      {
        type: "content.delta",
        threadId: "t1",
        itemId: "assistant",
        stream: "assistant_text",
        delta: "preserved",
      },
      {
        type: "item.completed",
        threadId: "t1",
        itemId: "assistant",
      },
    ]);

    const state = store.getState();
    expect(state.runtimeItemIdsByThread["t1"]).toEqual(["assistant"]);
    expect(state.runtimeItemsByIdByThread["t1"]?.["empty-reasoning"]).toBeUndefined();
    expect(state.runtimeItemsByIdByThread["t1"]?.assistant).toMatchObject({
      state: "completed",
      streams: { assistant_text: "preserved" },
    });
    expect(state.runtimeStructuralVersionByThread["t1"]).toBe(1);
  });

  it("does not mark a multi-item delta batch as structurally changed", () => {
    for (const itemId of ["child-1", "child-2"]) {
      apply("t1", {
        type: "item.started",
        threadId: "t1",
        itemId,
        itemType: "assistant_message",
      });
    }
    const before = store.getState();
    const structuralVersion = before.runtimeStructuralVersionByThread["t1"];
    const itemIds = before.runtimeItemIdsByThread["t1"];

    applyBatch("t1", [
      {
        type: "content.delta",
        threadId: "t1",
        itemId: "child-1",
        stream: "assistant_text",
        delta: "one",
      },
      {
        type: "item.started",
        threadId: "t1",
        itemId: "child-1",
        itemType: "assistant_message",
      },
      {
        type: "item.completed",
        threadId: "t1",
        itemId: "missing-child",
      },
      {
        type: "content.delta",
        threadId: "t1",
        itemId: "child-2",
        stream: "assistant_text",
        delta: "two",
      },
    ]);

    const after = store.getState();
    expect(after.runtimeItemIdsByThread["t1"]).toBe(itemIds);
    expect(after.runtimeStructuralVersionByThread["t1"]).toBe(structuralVersion);
  });
});
