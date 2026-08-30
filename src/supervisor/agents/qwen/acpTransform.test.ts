import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import {
  createAcpMapperState,
  mapAcpSessionUpdate,
  PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY,
  PORACODE_ACP_GOAL_META_KEY,
  PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY,
  PORACODE_ACP_SYNTHESIZE_SUBAGENT_RESULT_META_KEY,
  PORACODE_ACP_SUBAGENT_STATUS_META_KEY,
  PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY,
} from "../acp/canonicalMapping";
import { AcpStructuredSession } from "../acp/session";
import { createQwenAcpSessionBridge, createQwenAcpSessionUpdateTransform } from "./acpTransform";

function note(update: Record<string, unknown>): SessionNotification {
  return { sessionId: "qwen-session", update: update as SessionNotification["update"] };
}

function transformedUpdate(
  transform: ReturnType<typeof createQwenAcpSessionUpdateTransform>,
  update: Record<string, unknown>,
): Record<string, unknown> {
  return transform(note(update)).update as Record<string, unknown>;
}

afterEach(() => vi.restoreAllMocks());

describe("createQwenAcpSessionUpdateTransform", () => {
  it("normalizes Qwen native goal lifecycle metadata", () => {
    const transform = createQwenAcpSessionUpdateTransform();

    const set = transformedUpdate(transform, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "" },
      _meta: {
        goalStatus: {
          kind: "set",
          condition: "Ship goal support",
          setAt: 1_784_627_753_997,
        },
      },
    });
    expect(set._meta).toMatchObject({
      goalStatus: { kind: "set" },
      [PORACODE_ACP_GOAL_META_KEY]: {
        action: "set",
        objective: "Ship goal support",
        status: "active",
        updatedAt: 1_784_627_753.997,
      },
    });

    const checking = transformedUpdate(transform, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "" },
      _meta: {
        goalStatus: {
          kind: "checking",
          condition: "Ship goal support",
          iterations: 2,
          durationMs: 12_500,
          lastReason: "One test remains",
        },
      },
    });
    expect(checking._meta).toMatchObject({
      [PORACODE_ACP_GOAL_META_KEY]: {
        action: "updated",
        objective: "Ship goal support",
        status: "active",
        iterations: 2,
        timeUsedSeconds: 12.5,
        lastReason: "One test remains",
      },
    });

    for (const [kind, status] of [
      ["achieved", "complete"],
      ["failed", "failed"],
      ["aborted", "cancelled"],
    ] as const) {
      const terminal = transformedUpdate(transform, {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "" },
        _meta: {
          goalTerminal: {
            kind,
            condition: "Ship goal support",
            iterations: 3,
            durationMs: 15_000,
            lastReason: `${kind} reason`,
          },
        },
      });
      expect(terminal._meta).toMatchObject({
        [PORACODE_ACP_GOAL_META_KEY]: {
          action: "updated",
          objective: "Ship goal support",
          status,
          iterations: 3,
          timeUsedSeconds: 15,
          lastReason: `${kind} reason`,
        },
      });
    }

    const cleared = transformedUpdate(transform, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "" },
      _meta: {
        goalStatus: { kind: "cleared", condition: "Ship goal support" },
      },
    });
    expect(cleared._meta).toMatchObject({
      [PORACODE_ACP_GOAL_META_KEY]: {
        action: "cleared",
        objective: "Ship goal support",
      },
    });
  });

  it("normalizes Qwen Agent tools and explicit foreground child parents", () => {
    const transform = createQwenAcpSessionUpdateTransform();
    const parent = transformedUpdate(transform, {
      sessionUpdate: "tool_call",
      toolCallId: "agent-1",
      title: "Agent",
      status: "pending",
      rawInput: {},
      _meta: { toolName: "agent", provenance: "builtin" },
    });
    expect(parent.rawInput).toEqual({ _toolName: "task", subagent_type: "agent" });
    expect(parent._meta).toMatchObject({
      [PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY]: true,
    });

    const nestedAgent = transformedUpdate(transform, {
      sessionUpdate: "tool_call",
      toolCallId: "agent-2",
      title: "Agent",
      status: "pending",
      rawInput: {},
      _meta: {
        toolName: "agent",
        provenance: "subagent",
        parentToolCallId: "agent-1",
      },
    });
    expect(nestedAgent._meta).toMatchObject({
      [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: "agent-1",
    });
    expect(nestedAgent._meta).not.toHaveProperty(PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY);

    const child = transformedUpdate(transform, {
      sessionUpdate: "tool_call",
      toolCallId: "read-1",
      title: "Read file",
      status: "in_progress",
      _meta: {
        toolName: "read_file",
        provenance: "subagent",
        parentToolCallId: "agent-1",
        subagentType: "Explore",
      },
    });
    expect(child._meta).toMatchObject({
      parentToolCallId: "agent-1",
      [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: "agent-1",
    });

    const completed = transformedUpdate(transform, {
      sessionUpdate: "tool_call_update",
      toolCallId: "agent-1",
      status: "completed",
      rawOutput: {
        type: "task_execution",
        subagentName: "Explore",
        taskDescription: "Inspect the mapper",
        status: "completed",
      },
      _meta: { toolName: "agent", provenance: "builtin" },
    });
    expect(completed.rawInput).toEqual({
      _toolName: "task",
      subagent_type: "Explore",
      description: "Inspect the mapper",
    });
  });

  it("keeps background agents open and synthesizes their missing terminal update", () => {
    const transform = createQwenAcpSessionUpdateTransform();
    transformedUpdate(transform, {
      sessionUpdate: "tool_call",
      toolCallId: "agent-bg",
      title: "Agent",
      status: "pending",
      _meta: { toolName: "agent", provenance: "builtin" },
    });

    const launched = transformedUpdate(transform, {
      sessionUpdate: "tool_call_update",
      toolCallId: "agent-bg",
      status: "completed",
      content: [
        {
          type: "content",
          content: {
            type: "text",
            text: "Background agent launched successfully.\ntask_id: Explore-abcd1234 (internal ID)",
          },
        },
      ],
      rawOutput: {
        type: "task_execution",
        subagentName: "Explore",
        taskDescription: "Inspect ACP mapping",
        status: "background",
      },
      _meta: { toolName: "agent", provenance: "builtin" },
    });
    expect(launched).toMatchObject({
      status: "in_progress",
      rawInput: {
        _toolName: "task",
        subagent_type: "Explore",
        description: "Inspect ACP mapping",
        background: true,
      },
    });

    const completionNotice = transformedUpdate(transform, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: 'Background agent "Explore" completed.' },
      _meta: {
        source: "background_notification",
        backgroundTask: { taskId: "Explore-abcd1234", status: "completed", kind: "agent" },
      },
    });
    expect(completionNotice._meta).toMatchObject({
      [PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY]: "agent-bg",
    });

    const reasoning = transformedUpdate(transform, {
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text: "Preparing the child result." },
    });
    expect(reasoning._meta).toEqual({
      [PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY]: "agent-bg",
    });

    transformedUpdate(transform, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "The background agent result." },
      _meta: {
        source: "background_notification_response",
        backgroundTask: { taskId: "Explore-abcd1234", status: "completed", kind: "agent" },
      },
    });

    const finalBoundary = transformedUpdate(transform, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "" },
      _meta: { usage: { totalTokens: 42 }, durationMs: 1200 },
    });
    expect(finalBoundary).toMatchObject({
      sessionUpdate: "tool_call_update",
      toolCallId: "agent-bg",
      status: "completed",
      rawOutput: "The background agent result.",
      rawInput: {
        _toolName: "task",
        subagent_type: "Explore",
        description: "Inspect ACP mapping",
        background: true,
      },
      _meta: {
        usage: { totalTokens: 42 },
        [PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY]: "agent-bg",
        [PORACODE_ACP_SYNTHESIZE_SUBAGENT_RESULT_META_KEY]: true,
      },
    });
  });

  it("maps the Qwen 0.21 background result into a child transcript before completion", () => {
    const bridge = createQwenAcpSessionBridge();
    const state = createAcpMapperState("qwen-thread");
    const mapUpdate = (update: Record<string, unknown>) =>
      mapAcpSessionUpdate(bridge.sessionUpdateTransform(note(update)), state);

    const started = mapUpdate({
      sessionUpdate: "tool_call",
      toolCallId: "agent-real",
      title: "Agent: Inspect ACP mapping",
      status: "pending",
      _meta: { toolName: "agent" },
    });
    const parentItemId = (
      started.find((event) => event.type === "item.started") as {
        itemId: string;
      }
    ).itemId;

    mapUpdate({
      sessionUpdate: "tool_call_update",
      toolCallId: "agent-real",
      status: "completed",
      content: [
        {
          type: "content",
          content: {
            type: "text",
            text: "Background agent launched successfully.\ntask_id: Explore-real123 (internal ID)",
          },
        },
      ],
      rawOutput: {
        status: "background",
        subagentName: "Explore",
        taskDescription: "Inspect ACP mapping",
      },
      _meta: { toolName: "agent" },
    });
    mapUpdate({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: 'Background agent "Explore" completed.' },
      _meta: {
        source: "background_notification",
        backgroundTask: { taskId: "Explore-real123", status: "completed" },
      },
    });
    mapUpdate({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "The background agent found the mapper." },
      _meta: {
        source: "background_notification_response",
        backgroundTask: { taskId: "Explore-real123", status: "completed" },
      },
    });

    const boundary = bridge.extensionSessionUpdateTransform("_qwencode/end_turn", {
      sessionId: "qwen-session",
      reason: "end_turn",
      source: "background_notification",
    });
    const terminalEvents = mapAcpSessionUpdate(
      bridge.sessionUpdateTransform(boundary as SessionNotification),
      state,
    );
    const childStart = terminalEvents.find(
      (event) => event.type === "item.started" && event.parentItemId === parentItemId,
    );
    expect(childStart).toMatchObject({
      type: "item.started",
      itemType: "assistant_message",
      parentItemId,
    });
    expect(terminalEvents).toContainEqual(
      expect.objectContaining({
        type: "content.delta",
        itemId: childStart && "itemId" in childStart ? childStart.itemId : "",
        stream: "assistant_text",
        delta: "The background agent found the mapper.",
      }),
    );
    const childCompletedIndex = terminalEvents.findIndex(
      (event) =>
        event.type === "item.completed" &&
        childStart &&
        "itemId" in childStart &&
        event.itemId === childStart.itemId,
    );
    const parentCompletedIndex = terminalEvents.findIndex(
      (event) => event.type === "item.completed" && event.itemId === parentItemId,
    );
    expect(childCompletedIndex).toBeGreaterThanOrEqual(0);
    expect(parentCompletedIndex).toBeGreaterThan(childCompletedIndex);
    expect(state.activeSubAgents).toEqual([]);
  });

  it("negotiates active-work snapshots and maps live progress plus lost completion", async () => {
    const now = 1_800_000_000_000;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now);
    const bridge = createQwenAcpSessionBridge();
    expect(bridge.initializeMeta).toEqual({
      "qwen.daemon.activeWorkHeartbeat": {
        v: 1,
        intervalMs: 5_000,
        categories: ["agent", "notification"],
      },
    });

    const state = createAcpMapperState("qwen-thread");
    const mapUpdate = (update: Record<string, unknown>) =>
      mapAcpSessionUpdate(bridge.sessionUpdateTransform(note(update)), state);
    const started = mapUpdate({
      sessionUpdate: "tool_call",
      toolCallId: "agent-live",
      title: "Agent: Inspect tracking",
      status: "pending",
      _meta: { toolName: "agent" },
    });
    const parentItemId = (
      started.find((event) => event.type === "item.started") as { itemId: string }
    ).itemId;
    mapUpdate({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "" },
      _meta: { goalStatus: { kind: "set", condition: "Track the background task" } },
    });
    mapUpdate({
      sessionUpdate: "tool_call_update",
      toolCallId: "agent-live",
      status: "completed",
      content: [
        {
          type: "content",
          content: { type: "text", text: "task_id: Explore-live123 (internal ID)" },
        },
      ],
      rawOutput: {
        status: "background",
        subagentName: "Explore",
        taskDescription: "Inspect tracking",
      },
      _meta: { toolName: "agent" },
    });

    const request = vi
      .fn<(method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>>()
      .mockResolvedValueOnce({
        v: 1,
        sessionId: "qwen-session",
        now,
        tasks: [
          {
            kind: "agent",
            id: "Explore-live123",
            label: "Explore: Inspect tracking",
            description: "Inspect tracking",
            status: "running",
            startTime: now - 2_000,
            runtimeMs: 2_000,
            stats: { totalTokens: 1_200, toolUses: 4 },
            recentActivities: [{ name: "read_file", description: "Read acpTransform.ts", at: now }],
            toolUseId: "agent-live",
          },
        ],
      });
    const liveResult = await bridge.extensionSessionUpdateTransform(
      "qwen/notify/channel/active-work",
      {
        v: 1,
        seq: 1,
        sessions: [
          {
            sessionId: "qwen-session",
            holds: [{ category: "agent", id: "Explore-live123" }],
          },
        ],
      },
      { request },
    );
    const liveNotifications = Array.isArray(liveResult) ? liveResult : [liveResult!];
    const liveEvents = liveNotifications.flatMap((notification) =>
      mapAcpSessionUpdate(bridge.sessionUpdateTransform(notification), state),
    );
    expect(request).toHaveBeenCalledWith("qwen/status/session/tasks", {
      sessionId: "qwen-session",
    });
    expect(liveEvents).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: parentItemId,
        payload: expect.objectContaining({
          status: "running",
          progress: expect.objectContaining({
            description: "Read acpTransform.ts",
            lastToolName: "read_file",
            tokens: 1_200,
            toolUses: 4,
            durationMs: 2_000,
            stepCount: 4,
          }),
        }),
      }),
    );

    const terminalSnapshot = {
      v: 1,
      sessionId: "qwen-session",
      now,
      tasks: [
        {
          kind: "agent",
          id: "Explore-live123",
          label: "Explore: Inspect tracking",
          description: "Inspect tracking",
          status: "completed",
          startTime: now - 20_000,
          endTime: now - 11_000,
          runtimeMs: 9_000,
          stats: { totalTokens: 2_400, toolUses: 7 },
          toolUseId: "agent-live",
        },
      ],
    };
    request.mockResolvedValue(terminalSnapshot);

    const heldResult = await bridge.extensionSessionUpdateTransform(
      "qwen/notify/channel/active-work",
      {
        v: 1,
        seq: 2,
        sessions: [
          {
            sessionId: "qwen-session",
            holds: [{ category: "notification", id: "Explore-live123" }],
          },
        ],
      },
      { request },
    );
    const heldNotifications = Array.isArray(heldResult) ? heldResult : [heldResult!];
    const heldEvents = heldNotifications.flatMap((notification) =>
      mapAcpSessionUpdate(bridge.sessionUpdateTransform(notification), state),
    );
    expect(heldEvents).not.toContainEqual(
      expect.objectContaining({ type: "item.completed", itemId: parentItemId }),
    );

    const observedResult = await bridge.extensionSessionUpdateTransform(
      "qwen/notify/channel/active-work",
      { v: 1, seq: 3, sessions: [{ sessionId: "qwen-session", holds: [] }] },
      { request },
    );
    const observedNotifications = Array.isArray(observedResult)
      ? observedResult
      : [observedResult!];
    const observedEvents = observedNotifications.flatMap((notification) =>
      mapAcpSessionUpdate(bridge.sessionUpdateTransform(notification), state),
    );
    expect(observedEvents).not.toContainEqual(
      expect.objectContaining({ type: "item.completed", itemId: parentItemId }),
    );

    nowSpy.mockReturnValue(now + 10_001);
    const terminalResult = await bridge.extensionSessionUpdateTransform(
      "qwen/notify/channel/active-work",
      { v: 1, seq: 4, sessions: [{ sessionId: "qwen-session", holds: [] }] },
      { request },
    );
    const terminalNotifications = Array.isArray(terminalResult)
      ? terminalResult
      : [terminalResult!];
    const terminalEvents = terminalNotifications.flatMap((notification) =>
      mapAcpSessionUpdate(bridge.sessionUpdateTransform(notification), state),
    );
    expect(terminalEvents).toContainEqual(
      expect.objectContaining({ type: "item.completed", itemId: parentItemId }),
    );
    expect(
      terminalNotifications.find((notification) =>
        ["completed", "failed"].includes(
          String((notification.update as Record<string, unknown>).status),
        ),
      )?.update,
    ).toMatchObject({
      _meta: {
        [PORACODE_ACP_GOAL_META_KEY]: {
          status: "paused",
          objective: "Track the background task",
        },
      },
    });
    expect(state.activeSubAgents).toEqual([]);
  });

  it("rejects unsupported heartbeat and task snapshot schemas", async () => {
    const bridge = createQwenAcpSessionBridge();
    const request = vi
      .fn<(method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>>()
      .mockResolvedValueOnce({ v: 2, sessionId: "qwen-session", tasks: [] })
      .mockResolvedValueOnce({ v: 1, sessionId: "other-session", tasks: [] })
      .mockResolvedValueOnce({ v: 1, sessionId: "qwen-session", tasks: "invalid" });

    const unsupportedHeartbeat = await bridge.extensionSessionUpdateTransform(
      "qwen/notify/channel/active-work",
      { v: 2, sessions: [{ sessionId: "qwen-session", holds: [] }] },
      { request },
    );
    expect(unsupportedHeartbeat).toEqual([]);
    expect(request).not.toHaveBeenCalled();

    for (let seq = 1; seq <= 3; seq += 1) {
      const result = await bridge.extensionSessionUpdateTransform(
        "qwen/notify/channel/active-work",
        {
          v: 1,
          seq,
          sessions: [
            {
              sessionId: "qwen-session",
              holds: [{ category: "agent", id: "Explore-schema" }],
            },
          ],
        },
        { request },
      );
      expect(result).toEqual([]);
    }
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("settles a paused Qwen task without presenting it as running or failed", async () => {
    const bridge = createQwenAcpSessionBridge();
    const state = createAcpMapperState("qwen-thread");
    const mapUpdate = (update: Record<string, unknown>) =>
      mapAcpSessionUpdate(bridge.sessionUpdateTransform(note(update)), state);
    const started = mapUpdate({
      sessionUpdate: "tool_call",
      toolCallId: "agent-paused",
      title: "Agent",
      status: "pending",
      _meta: { toolName: "agent" },
    });
    const parentItemId = (
      started.find((event) => event.type === "item.started") as { itemId: string }
    ).itemId;
    mapUpdate({
      sessionUpdate: "tool_call_update",
      toolCallId: "agent-paused",
      status: "completed",
      content: [{ type: "content", content: { type: "text", text: "task_id: Explore-paused" } }],
      rawOutput: { status: "background", subagentName: "Explore" },
      _meta: { toolName: "agent" },
    });

    const request = vi
      .fn<(method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>>()
      .mockResolvedValueOnce({
        v: 1,
        sessionId: "qwen-session",
        tasks: [{ kind: "agent", id: "Explore-paused", status: "running", runtimeMs: 1 }],
      })
      .mockResolvedValueOnce({
        v: 1,
        sessionId: "qwen-session",
        tasks: [
          {
            kind: "agent",
            id: "Explore-paused",
            status: "paused",
            runtimeMs: 2,
            resumeBlockedReason: "Waiting for a fresh request",
          },
        ],
      });
    await bridge.extensionSessionUpdateTransform(
      "qwen/notify/channel/active-work",
      {
        v: 1,
        sessions: [
          {
            sessionId: "qwen-session",
            holds: [{ category: "agent", id: "Explore-paused" }],
          },
        ],
      },
      { request },
    );
    const pausedResult = await bridge.extensionSessionUpdateTransform(
      "qwen/notify/channel/active-work",
      { v: 1, sessions: [{ sessionId: "qwen-session", holds: [] }] },
      { request },
    );
    const pausedNotifications = Array.isArray(pausedResult) ? pausedResult : [pausedResult!];
    const pausedEvents = pausedNotifications.flatMap((notification) =>
      mapAcpSessionUpdate(bridge.sessionUpdateTransform(notification), state),
    );

    expect(pausedEvents).toContainEqual(
      expect.objectContaining({
        type: "item.completed",
        itemId: parentItemId,
        payload: expect.objectContaining({
          status: "success",
          subAgentStatus: "paused",
        }),
      }),
    );
    expect(state.activeSubAgents).toEqual([]);
  });

  it("lets a normal completion inside the local grace period win without fallback duplication", async () => {
    const now = 1_800_000_000_000;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now);
    const bridge = createQwenAcpSessionBridge();
    transformedUpdate(bridge.sessionUpdateTransform, {
      sessionUpdate: "tool_call",
      toolCallId: "agent-normal-wins",
      title: "Agent",
      status: "pending",
      _meta: { toolName: "agent" },
    });
    transformedUpdate(bridge.sessionUpdateTransform, {
      sessionUpdate: "tool_call_update",
      toolCallId: "agent-normal-wins",
      status: "completed",
      content: [{ type: "content", content: { type: "text", text: "task_id: Explore-normal" } }],
      rawOutput: { status: "background", subagentName: "Explore" },
      _meta: { toolName: "agent" },
    });

    const runningSnapshot = {
      v: 1,
      sessionId: "qwen-session",
      tasks: [{ kind: "agent", id: "Explore-normal", status: "running", runtimeMs: 1 }],
    };
    const terminalSnapshot = {
      v: 1,
      sessionId: "qwen-session",
      tasks: [{ kind: "agent", id: "Explore-normal", status: "completed", runtimeMs: 2 }],
    };
    const request = vi
      .fn<(method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>>()
      .mockResolvedValueOnce(runningSnapshot)
      .mockResolvedValue(terminalSnapshot);
    await bridge.extensionSessionUpdateTransform(
      "qwen/notify/channel/active-work",
      {
        v: 1,
        sessions: [
          {
            sessionId: "qwen-session",
            holds: [{ category: "agent", id: "Explore-normal" }],
          },
        ],
      },
      { request },
    );
    await bridge.extensionSessionUpdateTransform(
      "qwen/notify/channel/active-work",
      { v: 1, sessions: [{ sessionId: "qwen-session", holds: [] }] },
      { request },
    );

    transformedUpdate(bridge.sessionUpdateTransform, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Background completed." },
      _meta: {
        source: "background_notification",
        backgroundTask: { taskId: "Explore-normal", status: "completed" },
      },
    });
    transformedUpdate(bridge.sessionUpdateTransform, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Normal result" },
      _meta: {
        source: "background_notification_response",
        backgroundTask: { taskId: "Explore-normal", status: "completed" },
      },
    });
    const boundary = bridge.extensionSessionUpdateTransform("_qwencode/end_turn", {
      sessionId: "qwen-session",
      source: "background_notification",
    });
    const completed = bridge.sessionUpdateTransform(boundary as SessionNotification);
    expect(completed.update).toMatchObject({
      sessionUpdate: "tool_call_update",
      toolCallId: "agent-normal-wins",
      status: "completed",
      rawOutput: "Normal result",
    });

    nowSpy.mockReturnValue(now + 20_000);
    const lateFallback = await bridge.extensionSessionUpdateTransform(
      "qwen/notify/channel/active-work",
      { v: 1, sessions: [{ sessionId: "qwen-session", holds: [] }] },
      { request },
    );
    expect(lateFallback).toEqual([]);
  });

  it("clears partial normal-completion state when snapshot fallback wins", async () => {
    const now = 1_800_000_000_000;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now);
    const bridge = createQwenAcpSessionBridge();
    transformedUpdate(bridge.sessionUpdateTransform, {
      sessionUpdate: "tool_call",
      toolCallId: "agent-fallback-wins",
      title: "Agent",
      status: "pending",
      _meta: { toolName: "agent" },
    });
    transformedUpdate(bridge.sessionUpdateTransform, {
      sessionUpdate: "tool_call_update",
      toolCallId: "agent-fallback-wins",
      status: "completed",
      content: [{ type: "content", content: { type: "text", text: "task_id: Explore-fallback" } }],
      rawOutput: { status: "background", subagentName: "Explore" },
      _meta: { toolName: "agent" },
    });

    const request = vi
      .fn<(method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>>()
      .mockResolvedValue({
        v: 1,
        sessionId: "qwen-session",
        tasks: [{ kind: "agent", id: "Explore-fallback", status: "completed", runtimeMs: 2 }],
      });
    await bridge.extensionSessionUpdateTransform(
      "qwen/notify/channel/active-work",
      { v: 1, sessions: [{ sessionId: "qwen-session", holds: [] }] },
      { request },
    );

    transformedUpdate(bridge.sessionUpdateTransform, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Background completed." },
      _meta: {
        source: "background_notification",
        backgroundTask: { taskId: "Explore-fallback", status: "completed" },
      },
    });
    transformedUpdate(bridge.sessionUpdateTransform, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Partially delivered result" },
      _meta: {
        source: "background_notification_response",
        backgroundTask: { taskId: "Explore-fallback", status: "completed" },
      },
    });

    nowSpy.mockReturnValue(now + 10_001);
    const fallbackResult = await bridge.extensionSessionUpdateTransform(
      "qwen/notify/channel/active-work",
      { v: 1, sessions: [{ sessionId: "qwen-session", holds: [] }] },
      { request },
    );
    const fallbackNotifications = Array.isArray(fallbackResult)
      ? fallbackResult
      : [fallbackResult!];
    expect(fallbackNotifications.at(-1)?.update).toMatchObject({
      sessionUpdate: "tool_call_update",
      toolCallId: "agent-fallback-wins",
      status: "completed",
      rawOutput: "Partially delivered result",
    });

    const lateChunk = bridge.sessionUpdateTransform(
      note({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Late unrelated assistant text" },
      }),
    );
    expect((lateChunk.update as Record<string, unknown>)._meta).not.toMatchObject({
      [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: "agent-fallback-wins",
    });
    const lateBoundary = bridge.extensionSessionUpdateTransform("_qwencode/end_turn", {
      sessionId: "qwen-session",
      source: "background_notification",
    }) as SessionNotification;
    expect(bridge.sessionUpdateTransform(lateBoundary).update).toMatchObject({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "" },
    });
  });

  it("uses Qwen's real background end-turn extension as the terminal boundary", () => {
    const bridge = createQwenAcpSessionBridge();
    const transform = bridge.sessionUpdateTransform;
    transformedUpdate(transform, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "" },
      _meta: { goalStatus: { kind: "set", condition: "Finish the background work" } },
    });
    transformedUpdate(transform, {
      sessionUpdate: "tool_call",
      toolCallId: "agent-real-boundary",
      title: "Agent",
      status: "pending",
      _meta: { toolName: "agent" },
    });
    transformedUpdate(transform, {
      sessionUpdate: "tool_call_update",
      toolCallId: "agent-real-boundary",
      status: "completed",
      content: [
        {
          type: "content",
          content: { type: "text", text: "agentId: Explore-real123 (internal ID)" },
        },
      ],
      rawOutput: { status: "background", subagentName: "Explore" },
      _meta: { toolName: "agent" },
    });
    transformedUpdate(transform, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Background completed." },
      _meta: {
        source: "background_notification",
        backgroundTask: { taskId: "Explore-real123", status: "cancelled" },
      },
    });
    transformedUpdate(transform, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Result from child." },
      _meta: {
        source: "background_notification_response",
        backgroundTask: { taskId: "Explore-real123", status: "cancelled" },
      },
    });

    const boundary = bridge.extensionSessionUpdateTransform("_qwencode/end_turn", {
      sessionId: "qwen-session",
      reason: "end_turn",
      source: "background_notification",
    });
    expect(boundary).toBeDefined();
    const completedBoundary = bridge.sessionUpdateTransform(boundary as SessionNotification);
    expect(completedBoundary.update).toMatchObject({
      sessionUpdate: "tool_call_update",
      toolCallId: "agent-real-boundary",
      status: "failed",
      rawOutput: "Result from child.",
      _meta: {
        [PORACODE_ACP_SUBAGENT_STATUS_META_KEY]: "cancelled",
        [PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY]: "agent-real-boundary",
        [PORACODE_ACP_GOAL_META_KEY]: {
          action: "updated",
          objective: "Finish the background work",
          status: "paused",
          timeUsedSeconds: expect.any(Number),
          updatedAt: expect.any(Number),
        },
      },
    });
  });

  it("marks the goal paused when Qwen reports that its judge loop stopped", () => {
    const transform = createQwenAcpSessionUpdateTransform();
    transformedUpdate(transform, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "" },
      _meta: { goalStatus: { kind: "set", condition: "Finish validation" } },
    });

    const paused = transformedUpdate(transform, {
      sessionUpdate: "agent_message_chunk",
      content: {
        type: "text",
        text: "Goal judge unavailable; the automatic /goal loop paused. The goal remains active.",
      },
    });
    expect(paused._meta).toMatchObject({
      [PORACODE_ACP_GOAL_META_KEY]: {
        action: "updated",
        objective: "Finish validation",
        status: "paused",
        timeUsedSeconds: expect.any(Number),
        updatedAt: expect.any(Number),
      },
    });
  });
});

/**
 * Wire-level regression for the missing working status on Qwen threads.
 *
 * Qwen resolves `session/prompt` the instant a backgrounded subagent reports,
 * then opens a turn of its own — under a `notification<epoch>` prompt id — that
 * can run for tens of minutes doing real main-agent work. Those follow-up
 * notifications carry no subagent tag, so the shared session has to recognise
 * them as live work on its own. This drives the real transform into a real
 * `AcpStructuredSession` to prove the whole path, not just the transform.
 */
describe("Qwen background-notification turns drive shared session status", () => {
  function makeSession(transform: ReturnType<typeof createQwenAcpSessionUpdateTransform>) {
    const listener = {
      onClose: vi.fn<() => void>(),
      onError: vi.fn<(message: string) => void>(),
      onUpdate: vi.fn<(update: unknown) => void>(),
      onRuntimeEvent: vi.fn<(event: unknown) => void>(),
    };
    // Only the fields `handleSessionUpdate` reaches; the constructor spawns a
    // child process, which this path does not need.
    const session = Object.create(AcpStructuredSession.prototype) as Record<string, unknown>;
    Object.assign(session, {
      threadId: "thread-qwen",
      sessionId: "qwen-session",
      projectLocation: { kind: "posix", path: "/repo" },
      cwd: "/repo",
      listener,
      sessionUpdateTransform: transform,
      acpToolCallIdToItemId: new Map(),
      detachedTurnParentToolCallIds: new Set(),
      bufferedRuntimeEvents: [],
      currentStatus: "idle",
      currentAttention: "none",
      isDisposed: false,
      isReplayingHistory: false,
      promptInFlight: false,
      foregroundTurnOpen: false,
      stderrChunks: [],
      mapperState: undefined,
    });
    return {
      listener,
      feed: (update: Record<string, unknown>) =>
        (
          session as unknown as { handleSessionUpdate(n: SessionNotification): void }
        ).handleSessionUpdate(note(update)),
    };
  }

  it("paints working for main-agent work that follows a background subagent report", () => {
    const bridge = createQwenAcpSessionBridge();
    const { listener, feed } = makeSession(bridge.sessionUpdateTransform);

    // The backgrounded subagent launches and reports out of band. Our prompt has
    // already settled by this point, so nothing is in flight.
    feed({
      sessionUpdate: "tool_call",
      toolCallId: "agent-bg",
      title: "Agent",
      status: "pending",
      _meta: { toolName: "agent" },
    });
    feed({
      sessionUpdate: "tool_call_update",
      toolCallId: "agent-bg",
      status: "completed",
      content: [
        { type: "content", content: { type: "text", text: "agentId: Explore-bg1 (internal ID)" } },
      ],
      rawOutput: { status: "background", subagentName: "Explore" },
      _meta: { toolName: "agent" },
    });
    feed({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Background completed." },
      _meta: {
        source: "background_notification",
        backgroundTask: { taskId: "Explore-bg1", status: "completed" },
      },
    });

    // Qwen's real terminal boundary for the background report.
    const boundary = bridge.extensionSessionUpdateTransform("_qwencode/end_turn", {
      sessionId: "qwen-session",
      reason: "end_turn",
      source: "background_notification",
    });
    expect(boundary).toBeDefined();
    feed((boundary as SessionNotification).update as Record<string, unknown>);

    listener.onUpdate.mockClear();
    listener.onRuntimeEvent.mockClear();

    // Everything from here is Qwen's self-started turn: untagged main-agent
    // reasoning and edits. This is the stretch that used to run with no turn.
    feed({
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text: "Now let me apply the fix." },
    });
    feed({
      sessionUpdate: "tool_call",
      toolCallId: "edit-1",
      title: "Edit runtimeItems.ts",
      kind: "edit",
      status: "in_progress",
    });

    expect(listener.onUpdate).toHaveBeenCalledWith({ status: "working", attention: "working" });
    expect(
      listener.onRuntimeEvent.mock.calls
        .map(([event]) => event as { type?: string })
        .filter((event) => event.type === "turn.started"),
    ).toHaveLength(1);
  });
});
