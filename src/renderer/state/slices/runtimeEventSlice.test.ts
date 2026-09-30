import { describe, expect, it, beforeEach } from "vitest";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { RuntimeEvent } from "@/shared/contracts";
import {
  createRuntimeEventSlice,
  type RuntimeChatItem,
  type RuntimeEventSlice,
} from "./runtimeEventSlice";
import {
  clearLiveObservedCrossagentItems,
  pruneLiveObservedCrossagentItems,
  terminateStaleSubAgentItems,
} from "./staleSubAgents";

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
    clearLiveObservedCrossagentItems();
    store = makeStore();
  });

  function apply(threadId: string, event: RuntimeEvent) {
    store.getState().applyRuntimeEvent(threadId, event);
  }

  function applyBatch(threadId: string, events: RuntimeEvent[]) {
    store.getState().applyRuntimeEvents(threadId, events);
  }

  it("replaces an existing reasoning stream and continues appending", () => {
    applyBatch("t1", [
      { type: "item.started", threadId: "t1", itemId: "i1", itemType: "reasoning" },
      {
        type: "content.delta",
        threadId: "t1",
        itemId: "i1",
        stream: "reasoning_text",
        delta: "partial",
      },
      {
        type: "content.delta",
        threadId: "t1",
        itemId: "i1",
        stream: "reasoning_text",
        delta: "correct",
        replace: true,
      },
      {
        type: "content.delta",
        threadId: "t1",
        itemId: "i1",
        stream: "reasoning_text",
        delta: " tail",
      },
    ]);
    expect(store.getState().runtimeItemsByIdByThread.t1?.i1?.streams.reasoning_text).toBe(
      "correct tail",
    );
  });

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
    // Hydrate a row persisted by a previous app session: its run died with
    // that session's supervisor, so reconciliation must terminate it.
    store.getState().hydrateThreadRuntimeItems("t1", [
      {
        id: "crossagent-tool",
        type: "tool_call",
        state: "updated",
        payload: {
          name: "Crossagent",
          status: "running",
          isCrossagent: true,
          crossagentStatus: "running",
        },
        streams: {},
      },
    ]);

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

  it("keeps a live-observed Crossagent row running through stale reconciliation", () => {
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "sub:run-live",
      itemType: "tool_call",
      payload: {
        name: "Crossagent · live run",
        status: "running",
        isCrossagent: true,
        crossagentStatus: "running",
      },
    });

    // Fires on parent thread-state error/inactive and on DB rehydration. The
    // supervisor still owns the run, so the row must not be painted failed.
    store.getState().reconcileStaleSubAgents("t1");

    expect(store.getState().runtimeItemsByIdByThread["t1"]?.["sub:run-live"]).toMatchObject({
      state: "started",
      payload: {
        status: "running",
        crossagentStatus: "running",
      },
    });
  });

  it("terminates Crossagent rows that were never observed live (prior app session)", () => {
    store.getState().hydrateThreadRuntimeItems("t1", [
      {
        id: "sub:run-old",
        type: "tool_call",
        state: "updated",
        payload: {
          name: "Crossagent · orphaned run",
          status: "running",
          isCrossagent: true,
          crossagentStatus: "running",
        },
        streams: {},
      },
    ]);

    store.getState().reconcileStaleSubAgents("t1", { preserveObservedLive: true });

    expect(store.getState().runtimeItemsByIdByThread["t1"]?.["sub:run-old"]).toMatchObject({
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

  it("keeps a live-observed Crossagent row across item eviction and rehydration", () => {
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "sub:run-evicted",
      itemType: "tool_call",
      payload: {
        name: "Crossagent · evicted run",
        status: "running",
        isCrossagent: true,
        crossagentStatus: "running",
      },
    });

    // Renderer cache pressure evicts the projection; reopening the thread
    // rehydrates the still-running tile from the DB (no `observedLive` flag).
    store.getState().evictThreadRuntimeItems("t1");
    store.getState().hydrateThreadRuntimeItems("t1", [
      {
        id: "sub:run-evicted",
        type: "tool_call",
        state: "updated",
        payload: {
          name: "Crossagent · evicted run",
          status: "running",
          isCrossagent: true,
          crossagentStatus: "running",
        },
        streams: {},
      },
    ]);
    store.getState().reconcileStaleSubAgents("t1", { preserveObservedLive: true });

    expect(store.getState().runtimeItemsByIdByThread["t1"]?.["sub:run-evicted"]).toMatchObject({
      state: "updated",
      payload: {
        status: "running",
        crossagentStatus: "running",
      },
    });
  });

  it("still terminates a live-observed Crossagent row on the force path (provider switch)", () => {
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "sub:run-switch",
      itemType: "tool_call",
      payload: {
        name: "Crossagent · switched-away run",
        status: "running",
        isCrossagent: true,
        crossagentStatus: "running",
      },
    });

    const items = store.getState().runtimeItemsByIdByThread["t1"]!;
    const settled = terminateStaleSubAgentItems("t1", items, { force: true });

    expect(settled?.["sub:run-switch"]).toMatchObject({
      state: "completed",
      payload: {
        status: "error",
        crossagentStatus: "failed",
      },
    });
  });

  it("marks a mid-run attach live from its first progress frame (item.updated)", () => {
    // A renderer that attaches mid-run never sees item.started again — the
    // snapshot seeds the row, and the first live frame is a progress update.
    store.getState().hydrateThreadRuntimeItems("t1", [
      {
        id: "sub:run-attached",
        type: "tool_call",
        state: "updated",
        payload: {
          name: "Crossagent · attached run",
          status: "running",
          isCrossagent: true,
          crossagentStatus: "running",
        },
        streams: {},
      },
    ]);

    apply("t1", {
      type: "item.updated",
      threadId: "t1",
      itemId: "sub:run-attached",
      payload: {
        status: "running",
        isCrossagent: true,
        crossagentStatus: "running",
      },
    });

    // Parent thread-state error/inactive must not fail a run the supervisor
    // is demonstrably still streaming progress for.
    store.getState().reconcileStaleSubAgents("t1");

    expect(store.getState().runtimeItemsByIdByThread["t1"]?.["sub:run-attached"]).toMatchObject({
      payload: {
        status: "running",
        crossagentStatus: "running",
      },
    });
  });

  it("keeps a Crossagent row live-marked through batch ingestion", () => {
    store.getState().applyRuntimeEventBatches([
      {
        threadId: "t1",
        events: [
          {
            type: "item.started",
            threadId: "t1",
            itemId: "sub:run-batch",
            itemType: "tool_call",
            payload: {
              name: "Crossagent · batched run",
              status: "running",
              isCrossagent: true,
              crossagentStatus: "running",
            },
          },
        ],
      },
    ]);

    store.getState().reconcileStaleSubAgents("t1");

    expect(store.getState().runtimeItemsByIdByThread["t1"]?.["sub:run-batch"]).toMatchObject({
      payload: {
        status: "running",
        crossagentStatus: "running",
      },
    });
  });

  it("force-settles every thread when the backend supervisor is replaced", () => {
    for (const threadId of ["t1", "t2"]) {
      apply(threadId, {
        type: "item.started",
        threadId,
        itemId: `sub:run-${threadId}`,
        itemType: "tool_call",
        payload: {
          name: "Crossagent · doomed run",
          status: "running",
          isCrossagent: true,
          crossagentStatus: "running",
        },
      });
    }

    // The reset handler drops the live-observation records first: the runs
    // died with the replaced supervisor child.
    clearLiveObservedCrossagentItems();
    store.getState().reconcileAllStaleSubAgents({ force: true });

    for (const threadId of ["t1", "t2"]) {
      expect(
        store.getState().runtimeItemsByIdByThread[threadId]?.[`sub:run-${threadId}`],
      ).toMatchObject({
        state: "completed",
        payload: {
          status: "error",
          crossagentStatus: "failed",
        },
      });
    }
  });

  it("prunes live-observation records only for threads under a removed host prefix", () => {
    for (const [threadId, itemId] of [
      ["remote:desk-1:thread:abc", "sub:run-remote"],
      ["t1", "sub:run-local"],
    ] as const) {
      apply(threadId, {
        type: "item.started",
        threadId,
        itemId,
        itemType: "tool_call",
        payload: {
          name: "Crossagent · prefix prune",
          status: "running",
          isCrossagent: true,
          crossagentStatus: "running",
        },
      });
    }

    pruneLiveObservedCrossagentItems((threadId) => threadId.startsWith("remote:desk-1:thread:"));

    store.getState().reconcileStaleSubAgents("remote:desk-1:thread:abc");
    store.getState().reconcileStaleSubAgents("t1");

    expect(
      store.getState().runtimeItemsByIdByThread["remote:desk-1:thread:abc"]?.["sub:run-remote"],
    ).toMatchObject({
      payload: { crossagentStatus: "failed" },
    });
    expect(store.getState().runtimeItemsByIdByThread["t1"]?.["sub:run-local"]).toMatchObject({
      payload: { crossagentStatus: "running" },
    });
  });

  it("terminates without clobbering an existing result payload", () => {
    store.getState().hydrateThreadRuntimeItems("t1", [
      {
        id: "sub:run-partial",
        type: "tool_call",
        state: "updated",
        payload: {
          name: "Crossagent · partial output",
          status: "running",
          isCrossagent: true,
          crossagentStatus: "running",
          result: { summary: "partial output before the interrupt" },
        },
        streams: {},
      },
    ]);

    store.getState().reconcileStaleSubAgents("t1");

    expect(store.getState().runtimeItemsByIdByThread["t1"]?.["sub:run-partial"]).toMatchObject({
      state: "completed",
      payload: {
        status: "error",
        crossagentStatus: "failed",
        result: { summary: "partial output before the interrupt" },
      },
    });
  });

  it("keeps unobserved Crossagent rows when the source host settles orphans itself", () => {
    // The local backend sweeps orphaned Crossagent rows at boot and on every
    // supervisor reset, so a running row hydrated from its database is a
    // live run — the hydration reconcile must keep it (native rows still go).
    store.getState().hydrateThreadRuntimeItems("t1", [
      {
        id: "sub:run-honest-source",
        type: "tool_call",
        state: "updated",
        payload: {
          name: "Crossagent · swept source",
          status: "running",
          isCrossagent: true,
          crossagentStatus: "running",
        },
        streams: {},
      },
      {
        id: "native-honest-source",
        type: "tool_call",
        state: "started",
        payload: { name: "Task", status: "running", isSubAgent: true },
        streams: {},
      },
    ]);

    store
      .getState()
      .reconcileStaleSubAgents("t1", { preserveObservedLive: true, preserveCrossagent: true });

    const items = store.getState().runtimeItemsByIdByThread["t1"]!;
    expect(items["sub:run-honest-source"]).toMatchObject({
      payload: { status: "running", crossagentStatus: "running" },
    });
    expect(items["native-honest-source"]).toMatchObject({
      state: "completed",
      payload: { status: "error" },
    });

    // The force path (provider switch, supervisor reset) still wins: those
    // paths cancelled the runs for real.
    store
      .getState()
      .reconcileAllStaleSubAgents({ force: true, matchesThread: (threadId) => threadId === "t1" });
    expect(
      store.getState().runtimeItemsByIdByThread["t1"]?.["sub:run-honest-source"],
    ).toMatchObject({
      payload: { crossagentStatus: "failed" },
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

  it("keeps warnings out of the transcript while preserving the final error", () => {
    apply("t1", { type: "turn.started", threadId: "t1", turnId: "turn-1" });
    applyBatch("t1", [
      { type: "warning", threadId: "t1", message: "boom" },
      { type: "warning", threadId: "t1", message: "boom" },
    ]);
    expect(store.getState().runtimeItemIdsByThread["t1"] ?? []).toEqual([]);
    expect(store.getState().runtimeOpenTurnByThread["t1"]).toBe(true);

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

  it.each(["checkpoint", "unloaded-checkpoint"])(
    "prunes only server-declared turn anchors when reverting %s",
    (checkpoint) => {
      for (const itemId of ["checkpoint", "removed"]) {
        apply("t1", {
          type: "item.started",
          threadId: "t1",
          itemId,
          itemType: "assistant_message",
        });
      }
      const older = { startedAt: 1, endedAt: 2, anchorItemId: "older-unloaded" };
      store
        .getState()
        .hydrateThreadCompletedTurns("t1", [
          older,
          { startedAt: 3, endedAt: 4, anchorItemId: "removed" },
        ]);
      apply("t1", {
        type: "runtime.truncated",
        threadId: "t1",
        itemId: checkpoint,
        removedCompletedTurnAnchors: ["removed"],
      });
      expect(store.getState().runtimeCompletedTurnsByThread.t1).toEqual([older]);
      expect(store.getState().runtimeItemIdsByThread.t1).toEqual(
        checkpoint === "checkpoint" ? ["checkpoint"] : ["checkpoint", "removed"],
      );
    },
  );

  it("prunes server-declared turns even when the checkpoint is already last", () => {
    apply("t1", {
      type: "item.started",
      threadId: "t1",
      itemId: "checkpoint",
      itemType: "assistant_message",
    });
    store
      .getState()
      .hydrateThreadCompletedTurns("t1", [{ startedAt: 1, endedAt: 2, anchorItemId: "removed" }]);
    apply("t1", {
      type: "runtime.truncated",
      threadId: "t1",
      itemId: "checkpoint",
      removedCompletedTurnAnchors: ["removed"],
    });
    expect(store.getState().runtimeCompletedTurnsByThread.t1).toEqual([]);
  });

  it("keeps events after a live truncation in the same batch", () => {
    for (const itemId of ["checkpoint", "removed"]) {
      apply("t1", { type: "item.started", threadId: "t1", itemId, itemType: "assistant_message" });
    }
    const previousVersion = store.getState().runtimeStructuralVersionByThread.t1 ?? 0;
    applyBatch("t1", [
      {
        type: "runtime.truncated",
        threadId: "t1",
        itemId: "checkpoint",
        removedCompletedTurnAnchors: [],
      },
      { type: "item.started", threadId: "t1", itemId: "new", itemType: "assistant_message" },
    ]);
    expect(store.getState().runtimeItemIdsByThread.t1).toEqual(["checkpoint", "new"]);
    expect(store.getState().runtimeItemsByIdByThread.t1?.removed).toBeUndefined();
    expect(store.getState().runtimeStructuralVersionByThread.t1).toBe(previousVersion + 1);
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

describe("runtimeEventSlice background tasks", () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
  });

  function apply(threadId: string, event: RuntimeEvent) {
    store.getState().applyRuntimeEvent(threadId, event);
  }

  it("replaces the live background task list and drops the key when it drains", () => {
    apply("t1", {
      type: "background_tasks.changed",
      threadId: "t1",
      tasks: [{ taskId: "b1", kind: "command", description: "pnpm test" }],
    });
    expect(store.getState().runtimeBackgroundTasksByThread["t1"]).toEqual([
      { taskId: "b1", kind: "command", description: "pnpm test" },
    ]);

    // REPLACE, never merge: b1 finished and b2 appeared in one level.
    apply("t1", {
      type: "background_tasks.changed",
      threadId: "t1",
      tasks: [{ taskId: "b2", kind: "other", description: "watch build" }],
    });
    expect(store.getState().runtimeBackgroundTasksByThread["t1"]).toEqual([
      { taskId: "b2", kind: "other", description: "watch build" },
    ]);

    // A repeated identical level is a no-op — no new map identity.
    const before = store.getState().runtimeBackgroundTasksByThread;
    apply("t1", {
      type: "background_tasks.changed",
      threadId: "t1",
      tasks: [{ taskId: "b2", kind: "other", description: "watch build" }],
    });
    expect(store.getState().runtimeBackgroundTasksByThread).toBe(before);

    // Draining drops the key instead of storing an empty list.
    apply("t1", { type: "background_tasks.changed", threadId: "t1", tasks: [] });
    expect("t1" in store.getState().runtimeBackgroundTasksByThread).toBe(false);
  });

  it("clears background tasks when the session exits", () => {
    apply("t1", {
      type: "background_tasks.changed",
      threadId: "t1",
      tasks: [{ taskId: "b1", kind: "command", description: "serve" }],
    });
    apply("t1", { type: "session.exited", threadId: "t1" });
    expect("t1" in store.getState().runtimeBackgroundTasksByThread).toBe(false);
  });
});
