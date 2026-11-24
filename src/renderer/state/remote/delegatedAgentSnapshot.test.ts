import { afterEach, describe, expect, it } from "vitest";
import type { Thread, ToolCallPayload } from "@/shared/contracts";
import type { RemoteThreadSnapshot } from "@/shared/remote";
import { useAppStore } from "../appStore";
import { selectActiveSubAgentParentItemIds } from "../subAgentSelectors";
import { clearLiveObservedCrossagentItems } from "../slices/staleSubAgents";
import { applyThreadSnapshot, clearPendingRuntimeEvents } from "./sync";

const thread: Thread = {
  id: "remote:restart-test:thread:thread-1",
  remoteServerId: "restart-test",
  projectId: "project-1",
  title: "Snapshot reconciliation",
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

function seed(payload: ToolCallPayload): void {
  useAppStore.setState({ threads: [thread] });
  useAppStore.getState().applyRuntimeEvents(thread.id, [
    { type: "item.started", threadId: thread.id, itemId: "message", itemType: "assistant_message" },
    {
      type: "content.delta",
      threadId: thread.id,
      itemId: "message",
      stream: "assistant_text",
      delta: "newer live text",
    },
    {
      type: "item.started",
      threadId: thread.id,
      itemId: "delegated",
      itemType: "tool_call",
      payload,
    },
    {
      type: "content.delta",
      threadId: thread.id,
      itemId: "delegated",
      stream: "command_output",
      delta: "already streamed output",
    },
  ]);
}

function snapshot(payload: ToolCallPayload, seq = 50): RemoteThreadSnapshot {
  return {
    snapshotSeq: seq,
    thread,
    completedTurns: [],
    contextUsage: null,
    updatedAt: thread.updatedAt,
    runtimeItems: [
      {
        id: "message",
        type: "assistant_message",
        state: "started",
        payload: {},
        streams: { assistant_text: "older snapshot text" },
      },
      { id: "delegated", type: "tool_call", state: "completed", payload, streams: {} },
    ],
  };
}

function apply(
  incoming: RemoteThreadSnapshot,
  options: { fromServer?: boolean; seen?: number; current?: boolean; held?: boolean } = {},
): void {
  applyThreadSnapshot(incoming, {
    fromServer: options.fromServer ?? true,
    lastSeenEventSeq: options.seen ?? 45,
    ...(options.held ? { runtimeFramesHeld: true } : {}),
    committedPrefix: {
      threadId: thread.id,
      snapshotSeq: incoming.snapshotSeq,
      isCurrent: () => options.current ?? true,
      lastSeenEventSeq: () => options.seen ?? 45,
    },
  });
}

function items() {
  return useAppStore.getState().runtimeItemsByIdByThread[thread.id]!;
}

describe("delegated-agent terminal snapshot reconciliation", () => {
  afterEach(() => {
    clearPendingRuntimeEvents();
    clearLiveObservedCrossagentItems();
    useAppStore.getState().clearThreadRuntimeEvents(thread.id);
  });

  it.each(["native", "crossagent"] as const)(
    "settles a %s row while preserving live text, output and row identity",
    (kind) => {
      const payload: ToolCallPayload =
        kind === "crossagent"
          ? {
              name: "Crossagent",
              isCrossagent: true,
              crossagentStatus: "running",
              status: "running",
            }
          : { name: "Task", isSubAgent: true, subAgentStatus: "running", status: "running" };
      seed({ ...payload, args: { description: "Preserved launch details" } });
      const before = items();
      const beforeIds = useAppStore.getState().runtimeItemIdsByThread[thread.id];
      expect(selectActiveSubAgentParentItemIds(useAppStore.getState(), thread.id)).toContain(
        "delegated",
      );
      const terminal = snapshot({
        ...payload,
        status: "error",
        result: { error: "Interrupted: agent session ended before completion." },
        ...(kind === "crossagent" ? { crossagentStatus: "failed" } : { subAgentStatus: "failed" }),
      });
      apply(terminal);
      expect(items().message).toBe(before.message);
      expect(items().delegated).toMatchObject({
        state: "completed",
        payload: { status: "error", args: { description: "Preserved launch details" } },
      });
      expect(items().delegated!.streams).toBe(before.delegated!.streams);
      expect(items().delegated!.observedLive).toBe(true);
      expect(useAppStore.getState().runtimeItemIdsByThread[thread.id]).toBe(beforeIds);
      expect(selectActiveSubAgentParentItemIds(useAppStore.getState(), thread.id)).not.toContain(
        "delegated",
      );
      const settled = items();
      apply(terminal);
      expect(items()).toBe(settled);
    },
  );

  it.each([
    { name: "stale sequence", options: { seen: 51 } },
    { name: "retired connection", options: { current: false } },
    { name: "cached preload", options: { fromServer: false } },
  ])("rejects terminal updates from $name", ({ options }) => {
    seed({ name: "Task", isSubAgent: true, status: "running" });
    const before = items().delegated;
    apply(snapshot({ name: "Task", isSubAgent: true, status: "error" }), options);
    expect(items().delegated).toBe(before);
    expect(items().message!.streams.assistant_text).toBe("newer live text");
  });

  it("ends a running background agent row once its thread's session is gone", () => {
    const inactive = { ...thread, status: "inactive" as const, attention: "none" as const };
    useAppStore.setState({ threads: [inactive] });
    apply({
      snapshotSeq: 50,
      thread: inactive,
      completedTurns: [],
      contextUsage: null,
      updatedAt: inactive.updatedAt,
      runtimeItems: [
        {
          id: "background",
          type: "tool_call",
          state: "updated",
          payload: { name: "Agent", status: "running", isSubAgent: true, subAgentBackground: true },
          streams: {},
        },
      ],
    });
    expect(useAppStore.getState().runtimeItemsByIdByThread[thread.id]?.background).toMatchObject({
      state: "completed",
      payload: {
        status: "error",
        result: { error: "Interrupted: agent session ended before completion." },
      },
    });
  });

  it("keeps a running background agent row when only the resident row's status is stale", () => {
    // The client last saw this thread closed. It was relaunched elsewhere and
    // its agents are running; a cold open's live frames are still held behind
    // the read, so the snapshot has not refreshed the resident row's status.
    const inactive = { ...thread, status: "inactive" as const, attention: "none" as const };
    const live = { ...thread, status: "idle" as const, attention: "none" as const };
    useAppStore.setState({ threads: [inactive] });
    apply(
      {
        snapshotSeq: 50,
        thread: live,
        completedTurns: [],
        contextUsage: null,
        updatedAt: live.updatedAt,
        runtimeItems: [
          {
            id: "background",
            type: "tool_call",
            state: "updated",
            payload: {
              name: "Agent",
              status: "running",
              isSubAgent: true,
              subAgentBackground: true,
            },
            streams: {},
          },
        ],
      },
      { seen: 60, held: true },
    );
    expect(useAppStore.getState().runtimeItemsByIdByThread[thread.id]?.background).toMatchObject({
      state: "updated",
      payload: { status: "running", subAgentBackground: true },
    });
    expect(useAppStore.getState().threads.find((entry) => entry.id === thread.id)?.status).toBe(
      "inactive",
    );
  });

  it("keeps a running background agent row that an idle thread's snapshot carries", () => {
    const idle = { ...thread, status: "idle" as const, attention: "none" as const };
    useAppStore.setState({ threads: [idle] });
    apply({
      snapshotSeq: 50,
      thread: idle,
      completedTurns: [],
      contextUsage: null,
      updatedAt: idle.updatedAt,
      runtimeItems: [
        {
          id: "background",
          type: "tool_call",
          state: "updated",
          payload: { name: "Agent", status: "running", isSubAgent: true, subAgentBackground: true },
          streams: {},
        },
        {
          // Persisted by a build without the marker: nothing vouches for its run.
          id: "legacy",
          type: "tool_call",
          state: "updated",
          payload: { name: "Task", status: "running", isSubAgent: true },
          streams: {},
        },
      ],
    });
    const reconciled = useAppStore.getState().runtimeItemsByIdByThread[thread.id]!;
    expect(reconciled.background).toMatchObject({
      state: "updated",
      payload: { status: "running", subAgentBackground: true },
    });
    expect(reconciled.legacy).toMatchObject({ state: "completed", payload: { status: "error" } });
  });

  it.each([
    {
      name: "ordinary tool",
      old: { name: "Read", status: "running" },
      incoming: { name: "Read", status: "success" },
    },
    {
      name: "raw MCP plumbing",
      old: { name: "mcp__crossagents__spawn_agent", status: "running", isSubAgent: true },
      incoming: { name: "mcp__crossagents__spawn_agent", status: "error", isSubAgent: true },
    },
    {
      name: "different delegated kind",
      old: { name: "Task", status: "running", isSubAgent: true },
      incoming: { name: "Crossagent", status: "error", isCrossagent: true },
    },
    {
      name: "still-running row",
      old: { name: "Task", status: "running", isSubAgent: true },
      incoming: { name: "Task", status: "running", isSubAgent: true },
    },
  ] satisfies Array<{ name: string; old: ToolCallPayload; incoming: ToolCallPayload }>)(
    "leaves $name to its existing update path",
    ({ old, incoming }) => {
      seed(old);
      const before = items().delegated;
      apply(snapshot(incoming));
      expect(items().delegated).toBe(before);
    },
  );

  it("does not rewrite an already settled outcome", () => {
    seed({
      name: "Task",
      isSubAgent: true,
      status: "success",
      result: "Original completed result",
    });
    useAppStore.getState().applyRuntimeEvent(thread.id, {
      type: "item.completed",
      threadId: thread.id,
      itemId: "delegated",
    });
    const before = items().delegated;
    apply(
      snapshot({
        name: "Task",
        isSubAgent: true,
        status: "error",
        result: "Late conflicting result",
      }),
    );
    expect(items().delegated).toBe(before);
  });
});
