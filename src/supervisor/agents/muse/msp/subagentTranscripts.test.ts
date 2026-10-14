import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { applyRuntimeEventsToState } from "@/renderer/state/slices/runtimeEventReducer";
import { createMuseMspItemMapperState } from "./canonicalMapping";
import { MuseSubagentTranscripts } from "./subagentTranscripts";
import { MuseSubagentDiscovery } from "./subagentDiscovery";

const readSessionFileText = vi.hoisted(() => vi.fn<() => Promise<string | undefined>>());
const statSessionPaths = vi.hoisted(() =>
  vi.fn<() => Promise<Map<string, { mtimeMs?: number }>>>(),
);
vi.mock("../../base", () => ({ readSessionFileText, statSessionPaths }));
vi.mock("../sessionFiles", () => ({
  resolveMuseSessionLogPath: vi.fn<() => Promise<string>>(
    async () => "/muse/sessions/root/session.jsonl",
  ),
}));

function record(kind: string, fields: Record<string, unknown>): string {
  return `${JSON.stringify({ payload_type: `subagent.control.${kind}`, payload: { kind, record: fields } })}\n`;
}

function binding(id = "agent-1", sessionId = "child-1"): string {
  return record("child_session_bound", { subagent_id: id, child_session_id: sessionId });
}

function spawn(id = "agent-1", itemId = "spawn-1") {
  return {
    itemId,
    kind: "toolCall",
    status: "completed",
    tool: "subagent_spawn",
    args: JSON.stringify({
      role: "reviewer",
      task_name: `Review ${id}`,
      objective: "Inspect files",
    }),
    visibleOutput: JSON.stringify({ status: "accepted", subagent_id: id }),
  };
}

function history(items: Record<string, unknown>[], viewCursor = "cursor-1") {
  return { history: { mode: "inline", items, snapshot: null }, viewCursor };
}

const message = {
  itemId: "message-1",
  kind: "agentMessage",
  revision: 1,
  status: "inProgress",
  text: "Hello",
};
const managers: MuseSubagentTranscripts[] = [];

function renderEvents(events: RuntimeEvent[]) {
  const state = {
    threads: [],
    runtimeItemIdsByThread: {},
    runtimeItemsByIdByThread: {},
    runtimeRequestsByThread: {},
    runtimeContextByThread: {},
    runtimeBackgroundTasksByThread: {},
    runtimeStructuralVersionByThread: {},
    runtimeCompletedTurnsByThread: {},
    runtimeOpenTurnByThread: {},
  } as unknown as Parameters<typeof applyRuntimeEventsToState>[0];
  return applyRuntimeEventsToState(state, "thread-1", events).runtimeItemsByIdByThread?.[
    "thread-1"
  ];
}

function setup() {
  const events: RuntimeEvent[] = [];
  const request = vi.fn<
    (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>
  >(async (method) =>
    method === "session/read" ? history([message]) : { viewCursor: "cursor-1" },
  );
  const manager = new MuseSubagentTranscripts(
    { kind: "posix", path: "/fixture" },
    { request },
    createMuseMspItemMapperState("thread-1"),
    (batch) => events.push(...batch),
  );
  managers.push(manager);
  return { manager, events, request };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  readSessionFileText.mockResolvedValue(binding());
  statSessionPaths.mockResolvedValue(new Map());
});

afterEach(() => {
  for (const manager of managers) manager.dispose();
  managers.length = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Muse subagent owner-log discovery", () => {
  it("keeps partial lines for the next read and ignores unrelated or malformed records", () => {
    const discovery = new MuseSubagentDiscovery();
    const text = `${record("unknown", { subagent_id: "ignored" })}{broken}\n${binding()}`;
    discovery.ingest(text.slice(0, -5));
    expect(discovery.children.size).toBe(0);
    discovery.ingest(text);
    expect(discovery.children.get("agent-1")).toEqual({
      sessionId: "child-1",
      status: "inProgress",
    });
    discovery.ingest(text);
    expect(discovery.children.size).toBe(1);
  });

  it("rebinds a later attempt and clears the previous terminal result", () => {
    const discovery = new MuseSubagentDiscovery();
    const first =
      binding() +
      record("result_ready", { subagent_id: "agent-1", summary: "Failed", error_kind: "failed" });
    discovery.ingest(first);
    expect(discovery.children.get("agent-1")).toMatchObject({ status: "failed", result: "Failed" });
    discovery.ingest(first + binding("agent-1", "child-2"));
    expect(discovery.children.get("agent-1")).toEqual({
      sessionId: "child-2",
      status: "inProgress",
    });
  });
});

describe("Muse subagent transcripts", () => {
  it("keeps an admitted launch running, loads child history, then subscribes at the read cursor", async () => {
    const { manager, events, request } = setup();
    const launch = manager.mapItem(spawn(), "completed");
    expect(launch).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        payload: expect.objectContaining({ title: "Review agent-1", status: "running" }),
      }),
    );
    expect(launch.some((event) => event.type === "item.completed")).toBe(false);
    manager.open("root", {});
    await manager.sync();
    expect(request.mock.calls.map(([method]) => method)).toEqual([
      "session/read",
      "view/subscribe",
    ]);
    expect(request).toHaveBeenCalledWith("view/subscribe", {
      sessionId: "child-1",
      after: "cursor-1",
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemId: "spawn-1/child-1/message-1",
        parentItemId: "spawn-1",
        itemType: "assistant_message",
      }),
    );
    expect(manager.owns("child-1")).toBe(true);
    manager.handleNotification("item/delta", {
      sessionId: "child-1",
      itemId: "message-1",
      delta: " world",
    });
    expect(events.at(-1)).toMatchObject({
      type: "content.delta",
      itemId: "spawn-1/child-1/message-1",
      delta: " world",
    });
    const before = events.length;
    expect(
      manager.handleNotification("turn/completed", {
        sessionId: "child-1",
        turnId: "child-turn",
        terminal: "completed",
      }),
    ).toBe(true);
    expect(
      manager.handleNotification("session/modelChanged", {
        sessionId: "child-1",
        model: { modelId: "other" },
      }),
    ).toBe(true);
    expect(events.length).toBe(before);
    expect(
      manager.handleNotification("item/delta", {
        sessionId: "foreign",
        itemId: "message-1",
        delta: "wrong",
      }),
    ).toBe(false);
  });

  it("isolates parallel children even when their provider item ids match", async () => {
    const { manager, events } = setup();
    manager.mapItem(spawn(), "completed");
    manager.mapItem(spawn("agent-2", "spawn-2"), "completed");
    readSessionFileText.mockResolvedValue(binding() + binding("agent-2", "child-2"));
    manager.open("root", {});
    await manager.sync();
    const starts = events.filter((event) => event.type === "item.started");
    expect(starts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemId: "spawn-1/child-1/message-1", parentItemId: "spawn-1" }),
        expect.objectContaining({ itemId: "spawn-2/child-2/message-1", parentItemId: "spawn-2" }),
      ]),
    );
    const before = events.length;
    manager.handleNotification("item/delta", {
      sessionId: "child-2",
      itemId: "message-1",
      field: "text",
      delta: "second",
    });
    expect(events.slice(before)).toEqual([
      expect.objectContaining({ itemId: "spawn-2/child-2/message-1", delta: "second" }),
    ]);
  });

  it("gives a companion invocation its own history and live stream without repeating old revisions", async () => {
    const { manager, events } = setup();
    manager.mapItem(spawn(), "completed");
    manager.open("root", {});
    await manager.sync();
    manager.handleNotification("item/delta", {
      sessionId: "child-1",
      itemId: "message-1",
      field: "text",
      delta: " world",
    });
    const companion = {
      itemId: "result-1",
      kind: "toolCall",
      status: "inProgress",
      tool: "subagent_read_result",
      args: '{"subagent_id":"agent-1"}',
    };
    const replay = manager.mapItem(companion, "started");
    expect(replay).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemId: "result-1/child-1/message-1",
        parentItemId: "result-1",
        payload: { content: [{ kind: "text", text: "Hello world" }] },
      }),
    );
    expect(
      manager
        .mapItem({ ...companion }, "updated")
        .filter((event) => event.type === "item.started" && event.parentItemId),
    ).toEqual([]);
    const before = events.length;
    manager.handleNotification("item/delta", {
      sessionId: "child-1",
      itemId: "message-1",
      field: "text",
      delta: "!",
    });
    expect(events.slice(before).map((event) => "itemId" in event && event.itemId)).toEqual([
      "spawn-1/child-1/message-1",
      "result-1/child-1/message-1",
    ]);
  });

  it("drains a failed child's transcript and native failure result before completing its launch", async () => {
    const { manager, events, request } = setup();
    manager.mapItem(spawn(), "completed");
    manager.open("root", {});
    request.mockResolvedValue(
      history([
        {
          itemId: "user-1",
          kind: "userMessage",
          revision: 1,
          status: "completed",
          text: "Inspect files",
        },
      ]),
    );
    readSessionFileText.mockResolvedValue(
      binding() +
        record("result_ready", {
          subagent_id: "agent-1",
          error_kind: "failed",
          summary: "Child task failed: API request rejected",
        }),
    );
    await manager.sync();
    const resultIndex = events.findIndex(
      (event) => event.type === "item.started" && event.itemId.endsWith("agent-1/result"),
    );
    const completionIndex = events.findIndex(
      (event) => event.type === "item.completed" && event.itemId === "spawn-1",
    );
    expect(resultIndex).toBeGreaterThan(-1);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "user_message",
        parentItemId: "spawn-1",
        itemId: "spawn-1/child-1/user-1",
      }),
    );
    expect(completionIndex).toBeGreaterThan(resultIndex);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: "spawn-1",
        payload: expect.objectContaining({
          status: "error",
          subAgentStatus: "failed",
          result: "Child task failed: API request rejected",
        }),
      }),
    );
    const before = events.length;
    await manager.sync();
    expect(events.length).toBe(before);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("updates previous-version persisted launch ids when resume supplies a snapshot", async () => {
    const { manager, events } = setup();
    manager.open("root", {
      history: { mode: "snapshot", items: null, snapshot: { state: { items: [spawn()] } } },
    });
    await manager.sync();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: "spawn-1",
        payload: expect.objectContaining({ isSubAgent: true, title: "Review agent-1" }),
      }),
    );
    expect(
      events
        .filter((event) => event.type === "item.started" && !event.parentItemId)
        .map((event) => "itemId" in event && event.itemId),
    ).toEqual(["spawn-1"]);
  });

  it("uses native MSP child links when present without creating a duplicate launch row", async () => {
    const { manager, events } = setup();
    manager.mapItem(spawn(), "completed");
    manager.mapItem(
      {
        itemId: "native-1",
        kind: "subagent",
        subagentId: "agent-1",
        childSessionId: "child-1",
        status: "inProgress",
      },
      "started",
    );
    readSessionFileText.mockResolvedValue(undefined);
    manager.open("root", {});
    await manager.sync();
    expect(events).toContainEqual(
      expect.objectContaining({ type: "item.started", parentItemId: "spawn-1" }),
    );
    expect(events.some((event) => "itemId" in event && event.itemId === "native-1")).toBe(false);
  });

  it("does not publish a pending read or subscribe after disposal", async () => {
    const { manager, events, request } = setup();
    manager.mapItem(spawn(), "completed");
    manager.open("root", {});
    let resolveRead!: (value: ReturnType<typeof history>) => void;
    request.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    const sync = manager.sync();
    await vi.waitFor(() => expect(request).toHaveBeenCalled());
    manager.dispose();
    resolveRead(history([message]));
    await sync;
    expect(events).toEqual([]);
    expect(request.mock.calls.map(([method]) => method)).toEqual(["session/read"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retries a terminal child's transient read failure without replaying its completion", async () => {
    const { manager, events, request } = setup();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    manager.mapItem(spawn(), "completed");
    manager.open("root", {});
    readSessionFileText.mockResolvedValue(
      binding() + record("result_ready", { subagent_id: "agent-1", summary: "Done" }),
    );
    request.mockRejectedValueOnce(new Error("read not ready"));
    await manager.sync();
    expect(warning).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(request).toHaveBeenCalledTimes(2);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemId: "spawn-1/child-1/message-1",
        parentItemId: "spawn-1",
      }),
    );
    expect(
      events.filter((event) => event.type === "item.completed" && event.itemId === "spawn-1"),
    ).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("replays streamed reasoning and tool output into a late companion", async () => {
    const { manager, events, request } = setup();
    const reasoning = {
      itemId: "thought-1",
      kind: "reasoning",
      revision: 1,
      status: "inProgress",
      summary: ["Initial"],
    };
    const tool = {
      itemId: "tool-1",
      kind: "toolCall",
      tool: "bash",
      status: "inProgress",
      revision: 1,
      args: "{}",
      visibleOutput: "one",
    };
    request.mockImplementation(async (method) =>
      method === "session/read" ? history([message, reasoning, tool]) : { viewCursor: "cursor-1" },
    );
    manager.mapItem(spawn(), "completed");
    manager.open("root", {});
    await manager.sync();
    manager.handleNotification("item/delta", {
      sessionId: "child-1",
      itemId: "message-1",
      delta: " world",
    });
    manager.handleNotification("item/delta", {
      sessionId: "child-1",
      itemId: "thought-1",
      field: "summary.0",
      delta: " first",
    });
    manager.handleNotification("item/delta", {
      sessionId: "child-1",
      itemId: "thought-1",
      field: "summary.1",
      delta: "Second",
    });
    manager.handleNotification("item/delta", {
      sessionId: "child-1",
      itemId: "tool-1",
      field: "output",
      delta: " two",
    });
    const replay = manager.mapItem(
      {
        itemId: "wait-1",
        kind: "toolCall",
        tool: "subagent_wait",
        status: "inProgress",
        args: { subagent_id: "agent-1" },
      },
      "started",
    );
    expect(replay).toContainEqual(
      expect.objectContaining({
        type: "content.delta",
        itemId: "wait-1/child-1/message-1",
        delta: "Hello world",
      }),
    );
    const before = events.length;
    manager.handleNotification("item/delta", {
      sessionId: "child-1",
      itemId: "thought-1",
      field: "summary.2",
      delta: "Third",
    });
    expect(
      events
        .slice(before)
        .filter((event) => event.type === "content.delta" && event.stream === "reasoning_text")
        .map((event) => "delta" in event && event.delta),
    ).toEqual(["\n\nThird", "\n\nThird"]);
    expect(replay).toContainEqual(
      expect.objectContaining({
        type: "content.delta",
        itemId: "wait-1/child-1/thought-1",
        stream: "reasoning_text",
        delta: "Initial first\n\nSecond",
      }),
    );
    expect(replay).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemId: "wait-1/child-1/tool-1",
        payload: expect.objectContaining({ result: "one two" }),
      }),
    );
  });

  it("hydrates native links from resumed history when the owner log is unavailable", async () => {
    const { manager, events, request } = setup();
    readSessionFileText.mockResolvedValue(undefined);
    manager.open(
      "root",
      history([
        spawn(),
        {
          itemId: "native-1",
          kind: "subagent",
          subagentId: "agent-1",
          childSessionId: "child-1",
          status: "inProgress",
        },
      ]),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledWith("session/read", {
      sessionId: "child-1",
      excludeItems: false,
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        parentItemId: "spawn-1",
        itemId: "spawn-1/child-1/message-1",
      }),
    );
  });

  it.each([
    { errorKind: undefined, status: "success", subAgentStatus: "completed" },
    { errorKind: "api_error", status: "error", subAgentStatus: "failed" },
    { errorKind: "cancelled", status: "error", subAgentStatus: "cancelled" },
  ])("drains a resultReady child's history before settling $subAgentStatus", async (result) => {
    const { manager, events, request } = setup();
    readSessionFileText.mockResolvedValue(undefined);
    request.mockResolvedValue(history([{ ...message, status: "completed" }]));
    manager.open(
      "root",
      history([
        spawn(),
        {
          itemId: "native-1",
          kind: "subagent",
          subagentId: "agent-1",
          childSessionId: "child-1",
          status: "inProgress",
          controlStatus: "resultReady",
          result: { summary: "Done", ...(result.errorKind ? { errorKind: result.errorKind } : {}) },
        },
      ]),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(request.mock.calls.map(([method]) => method)).toEqual(["session/read"]);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: "spawn-1",
        payload: expect.objectContaining({
          status: result.status,
          subAgentStatus: result.subAgentStatus,
        }),
      }),
    );
    const child = events.findIndex(
      (event) => event.type === "item.started" && event.parentItemId === "spawn-1",
    );
    const complete = events.findIndex(
      (event) => event.type === "item.completed" && event.itemId === "spawn-1",
    );
    expect(child).toBeGreaterThan(-1);
    expect(complete).toBeGreaterThan(child);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not let a previous attempt's pending subscribe mark a rebound child subscribed", async () => {
    const { manager, events, request } = setup();
    manager.mapItem(spawn(), "completed");
    const native = {
      itemId: "native-1",
      kind: "subagent",
      subagentId: "agent-1",
      status: "inProgress",
      childSessionId: "child-1",
    };
    manager.mapItem(native, "started");
    let resolveSubscribe!: (result: Record<string, unknown>) => void;
    request.mockImplementation(async (method, params) => {
      if (method === "session/read") return history([message]);
      if (params?.["sessionId"] === "child-1")
        return new Promise((resolve) => {
          resolveSubscribe = resolve;
        });
      return { viewCursor: "cursor-2" };
    });
    manager.open("root", {});
    const sync = manager.sync();
    await vi.waitFor(() => expect(resolveSubscribe).toBeDefined());
    manager.mapItem({ ...native, childSessionId: "child-2" }, "updated");
    resolveSubscribe({ viewCursor: "cursor-1" });
    await sync;
    await manager.sync();
    expect(request).toHaveBeenCalledWith("view/subscribe", {
      sessionId: "child-2",
      after: "cursor-1",
    });
    manager.handleNotification("item/delta", {
      sessionId: "child-2",
      itemId: "message-1",
      delta: " second attempt",
    });
    expect(events.at(-1)).toMatchObject({
      type: "content.delta",
      itemId: "spawn-1/child-2/message-1",
      delta: " second attempt",
    });
  });

  it("bounds subscription retries even when every snapshot read succeeds", async () => {
    const { manager, request } = setup();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    request.mockImplementation(async (method) => {
      if (method === "session/read") return history([message]);
      throw new Error("subscribe unavailable");
    });
    manager.mapItem(spawn(), "completed");
    manager.open("root", {});
    await manager.sync();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(request.mock.calls.filter(([method]) => method === "view/subscribe")).toHaveLength(3);
    expect(warning).toHaveBeenCalledTimes(3);
  });

  it("clears a failed result and reconciles the new final history when work restarts in the same child session", async () => {
    const { manager, events, request } = setup();
    manager.mapItem(spawn(), "completed");
    manager.open("root", {});
    const failed =
      binding() +
      record("result_ready", {
        subagent_id: "agent-1",
        summary: "Old failure",
        error_kind: "failed",
      });
    readSessionFileText.mockResolvedValue(failed);
    await manager.sync();
    const before = events.length;
    const running =
      failed + record("status_updated", { subagent_id: "agent-1", control_status: "running" });
    readSessionFileText.mockResolvedValue(running);
    await manager.sync();
    expect(events.slice(before)).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: "spawn-1",
        payload: expect.objectContaining({ status: "running" }),
      }),
    );
    expect(
      events
        .slice(before)
        .filter((event) => event.type === "item.updated" && event.itemId === "spawn-1")
        .some(
          (event) =>
            "payload" in event &&
            (event.payload as Record<string, unknown>)["result"] === "Old failure",
        ),
    ).toBe(false);
    request.mockResolvedValue(
      history([{ ...message, revision: 2, status: "completed", text: "New result" }]),
    );
    readSessionFileText.mockResolvedValue(
      running + record("result_ready", { subagent_id: "agent-1", summary: "New result" }),
    );
    await manager.sync();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: "spawn-1/child-1/message-1",
        payload: { content: [{ kind: "text", text: "New result" }] },
      }),
    );
  });

  it("preserves the supported cancellation state on the parent row", async () => {
    const { manager, events } = setup();
    manager.mapItem(spawn(), "completed");
    manager.mapItem(
      {
        itemId: "native-1",
        kind: "subagent",
        subagentId: "agent-1",
        childSessionId: "child-1",
        status: "cancelled",
        failureReason: "Stopped by owner",
      },
      "completed",
    );
    manager.open("root", {});
    await manager.sync();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: "spawn-1",
        payload: expect.objectContaining({
          subAgentStatus: "cancelled",
          result: "Stopped by owner",
        }),
      }),
    );
  });

  it("uses the host's session path and avoids rereading an unchanged owner log", async () => {
    const { manager } = setup();
    manager.mapItem(spawn(), "completed");
    const path = "/muse/current/session.jsonl";
    manager.open("root", { session: { path } });
    statSessionPaths.mockResolvedValue(new Map([[path, { mtimeMs: 10 }]]));
    await manager.sync();
    await manager.sync();
    expect(readSessionFileText).toHaveBeenCalledTimes(1);
    expect(readSessionFileText).toHaveBeenCalledWith({ kind: "posix", path: "/fixture" }, path);
  });

  it.each(["rejected", "timedOut", "futureTerminal"])(
    "settles native terminal status %s",
    async (status) => {
      const { manager, events } = setup();
      manager.mapItem(spawn(), "completed");
      manager.mapItem(
        {
          itemId: "native-1",
          kind: "subagent",
          subagentId: "agent-1",
          childSessionId: "child-1",
          status,
        },
        "completed",
      );
      manager.open("root", {});
      await manager.sync();
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "item.updated",
          itemId: "spawn-1",
          payload: expect.objectContaining({ status: "error", subAgentStatus: "failed" }),
        }),
      );
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("retries subscription from the observed cursor and preserves intervening text", async () => {
    const { manager, events, request } = setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let attempts = 0;
    request.mockImplementation(async (method) => {
      if (method === "session/read") return history([message]);
      if (++attempts === 1) throw new Error("subscribe unavailable");
      manager.handleNotification("item/delta", {
        sessionId: "child-1",
        itemId: "message-1",
        viewCursor: "cursor-2",
        delta: " world",
      });
      manager.handleNotification("item/completed", {
        sessionId: "child-1",
        viewCursor: "cursor-3",
        item: { ...message, status: "completed", revision: 2, text: "Hello world" },
      });
      return { viewCursor: "cursor-3" };
    });
    manager.mapItem(spawn(), "completed");
    manager.open("root", {});
    await manager.sync();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(request.mock.calls.filter(([method]) => method === "session/read")).toHaveLength(1);
    expect(
      request.mock.calls
        .filter(([method]) => method === "view/subscribe")
        .map(([, params]) => params?.["after"]),
    ).toEqual(["cursor-1", "cursor-1"]);
    expect(renderEvents(events)?.["spawn-1/child-1/message-1"]?.streams.assistant_text).toBe(
      "Hello world",
    );
  });

  it("reattaches active children after observer loss from the last observed view cursor", async () => {
    const { manager, events, request } = setup();
    manager.mapItem(spawn(), "completed");
    manager.open("root", {});
    await manager.sync();
    manager.handleNotification("item/delta", {
      sessionId: "child-1",
      itemId: "message-1",
      viewCursor: "cursor-2",
      delta: " world",
    });
    manager.onViewDisconnected();
    await vi.advanceTimersByTimeAsync(0);
    expect(request.mock.calls.map(([method]) => method)).toEqual([
      "session/read",
      "view/subscribe",
      "view/subscribe",
    ]);
    expect(request).toHaveBeenLastCalledWith("view/subscribe", {
      sessionId: "child-1",
      after: "cursor-2",
    });
    expect(renderEvents(events)?.["spawn-1/child-1/message-1"]?.streams.assistant_text).toBe(
      "Hello world",
    );
  });

  it("reads final history even after exhausting the child's startup lookup budget", async () => {
    const { manager, events, request } = setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    request.mockRejectedValue(new Error("sessionNotFound"));
    manager.mapItem(spawn(), "completed");
    manager.open("root", {});
    await manager.sync();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(request).toHaveBeenCalledTimes(3);
    request.mockResolvedValue(history([{ ...message, status: "completed", text: "Final answer" }]));
    readSessionFileText.mockResolvedValue(
      binding() + record("result_ready", { subagent_id: "agent-1", summary: "Final answer" }),
    );
    await manager.sync();
    expect(request).toHaveBeenCalledTimes(4);
    expect(renderEvents(events)?.["spawn-1/child-1/message-1"]?.streams.assistant_text).toBe(
      "Final answer",
    );
    expect(
      events.some((event) => event.type === "item.completed" && event.itemId === "spawn-1"),
    ).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reconciles a final snapshot when completion arrives during the initial read", async () => {
    const { manager, events, request } = setup();
    let finishRead!: (value: ReturnType<typeof history>) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRead = resolve;
        }),
    );
    manager.open("root", history([spawn()]));
    await vi.waitFor(() => expect(finishRead).toBeDefined());
    manager.mapItem(
      {
        itemId: "native-1",
        kind: "subagent",
        subagentId: "agent-1",
        childSessionId: "child-1",
        status: "completed",
      },
      "completed",
    );
    finishRead(history([message]));
    await vi.advanceTimersByTimeAsync(0);
    expect(
      events.some((event) => event.type === "item.completed" && event.itemId === "spawn-1"),
    ).toBe(false);
    request.mockResolvedValue(history([{ ...message, status: "completed", text: "Hello world" }]));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(request.mock.calls.map(([method]) => method)).toEqual(["session/read", "session/read"]);
    expect(renderEvents(events)?.["spawn-1/child-1/message-1"]?.streams.assistant_text).toBe(
      "Hello world",
    );
    expect(
      events.some((event) => event.type === "item.completed" && event.itemId === "spawn-1"),
    ).toBe(true);
  });

  it("rejects a pending final snapshot from work that restarted in the same session", async () => {
    const { manager, events, request } = setup();
    readSessionFileText.mockResolvedValue(undefined);
    const native = {
      itemId: "native-1",
      kind: "subagent",
      subagentId: "agent-1",
      childSessionId: "child-1",
    };
    let finishRead!: (value: ReturnType<typeof history>) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRead = resolve;
        }),
    );
    manager.open("root", history([spawn(), { ...native, status: "completed" }]));
    await vi.waitFor(() => expect(finishRead).toBeDefined());
    manager.mapItem({ ...native, status: "inProgress" }, "updated");
    finishRead(history([{ ...message, status: "completed", text: "Stale result" }]));
    await vi.advanceTimersByTimeAsync(0);
    expect(events.some((event) => event.type === "item.started" && event.parentItemId)).toBe(false);
    request.mockResolvedValue(
      history([{ ...message, status: "completed", text: "Current result" }]),
    );
    manager.mapItem({ ...native, status: "completed" }, "completed");
    await vi.advanceTimersByTimeAsync(0);
    expect(renderEvents(events)?.["spawn-1/child-1/message-1"]?.streams.assistant_text).toBe(
      "Current result",
    );
  });

  it.each(
    ["session/read", "view/subscribe"].flatMap((method) =>
      ["completed", "rebound", "restarted"].map((transition) => ({ method, transition })),
    ),
  )(
    "preserves the new retry budget when a pending $method rejects after work is $transition",
    async ({ method, transition }) => {
      const { manager, events, request } = setup();
      vi.spyOn(console, "warn").mockImplementation(() => {});
      readSessionFileText.mockResolvedValue(undefined);
      const native = {
        itemId: "native-1",
        kind: "subagent",
        subagentId: "agent-1",
        childSessionId: "child-1",
      };
      const sessionId = transition === "rebound" ? "child-2" : "child-1";
      const retryMethod =
        transition !== "restarted" || method === "session/read" ? "session/read" : "view/subscribe";
      let rejectPending!: (error: Error) => void;
      let changed = false;
      let attempts = 0;
      request.mockImplementation(async (requested) => {
        if (!changed && requested === method) {
          return new Promise((_, reject) => {
            rejectPending = reject;
          });
        }
        if (changed && requested === retryMethod) {
          attempts += 1;
          if (attempts < 3) throw new Error("temporarily unavailable");
          const answer = { ...message, status: "completed", text: "Current result" };
          if (requested === "session/read") return history([answer]);
          manager.handleNotification("item/started", {
            sessionId,
            item: { ...answer, status: "inProgress" },
          });
          manager.handleNotification("item/completed", {
            sessionId,
            item: { ...answer, revision: 2 },
          });
        }
        return requested === "session/read" ? history([]) : { viewCursor: "cursor-1" };
      });
      manager.open("root", history([spawn(), { ...native, status: "inProgress" }]));
      await vi.waitFor(() => expect(rejectPending).toBeDefined());
      changed = true;
      if (transition === "restarted")
        manager.mapItem({ ...native, status: "completed" }, "completed");
      manager.mapItem(
        {
          ...native,
          childSessionId: sessionId,
          status: transition === "completed" ? "completed" : "inProgress",
        },
        "updated",
      );
      rejectPending(new Error("stale attempt failed"));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(attempts).toBe(3);
      expect(renderEvents(events)?.[`spawn-1/${sessionId}/message-1`]?.streams.assistant_text).toBe(
        "Current result",
      );
    },
  );

  it("reconciles existing persisted text with authoritative snapshot text without duplicating it", async () => {
    const { manager, events, request } = setup();
    const itemId = "spawn-1/child-1/message-1";
    events.push(
      {
        type: "item.started",
        threadId: "thread-1",
        itemId,
        itemType: "assistant_message",
        parentItemId: "spawn-1",
        payload: { content: [{ kind: "text", text: "Hello" }] },
      },
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId,
        stream: "assistant_text",
        delta: "Hello",
      },
    );
    request.mockResolvedValue(history([{ ...message, status: "completed", text: "Hello world" }]));
    manager.mapItem(spawn(), "completed");
    manager.open("root", {});
    readSessionFileText.mockResolvedValue(
      binding() + record("result_ready", { subagent_id: "agent-1", summary: "Hello world" }),
    );
    await manager.sync();
    expect(renderEvents(events)?.[itemId]?.streams.assistant_text).toBe("Hello world");
    expect(
      events.filter(
        (event) => event.type === "content.delta" && event.itemId === itemId && event.replace,
      ),
    ).toHaveLength(1);
  });
});
