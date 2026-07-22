import { describe, expect, it } from "vitest";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import {
  PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY,
  PORACODE_ACP_GOAL_META_KEY,
  PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY,
  PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY,
} from "../acp/canonicalMapping";
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
            text: "Background agent launched successfully.\nagentId: Explore-abcd1234 (internal ID)",
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
      },
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
        backgroundTask: { taskId: "Explore-real123", status: "completed" },
      },
    });
    transformedUpdate(transform, {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Result from child." },
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
    expect(boundary).toBeDefined();
    const completedBoundary = bridge.sessionUpdateTransform(boundary!);
    expect(completedBoundary.update).toMatchObject({
      sessionUpdate: "tool_call_update",
      toolCallId: "agent-real-boundary",
      status: "completed",
      rawOutput: "Result from child.",
      _meta: {
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
