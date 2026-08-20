import { describe, expect, it } from "vitest";
import {
  PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY,
  PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY,
  PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY,
} from "./canonicalMapping";
import { createAcpSubagentCoordinator } from "./subagentCoordinator";

describe("createAcpSubagentCoordinator", () => {
  it("merges provider descriptors into one canonical task input", () => {
    const coordinator = createAcpSubagentCoordinator();
    coordinator.updateCall("tool-1", {
      rawInput: { prompt: "Inspect the mapper", providerField: "preserved" },
    });
    coordinator.updateCall("tool-1", {
      subagentType: "Explore",
      description: "Inspect ACP mapping",
      background: true,
    });

    expect(coordinator.canonicalInput("tool-1")).toEqual({
      prompt: "Inspect the mapper",
      providerField: "preserved",
      _toolName: "task",
      subagent_type: "Explore",
      description: "Inspect ACP mapping",
      background: true,
    });
  });

  it("correlates and deduplicates background launches", () => {
    const coordinator = createAcpSubagentCoordinator();
    coordinator.updateCall("tool-1", {
      subagentType: "Explore",
      description: "Inspect ACP mapping",
      background: true,
    });
    const launch = {
      sessionId: "session-1",
      toolCallId: "tool-1",
      taskId: "task-1",
      agentId: "agent-1",
    };

    expect(coordinator.registerBackgroundLaunch(launch)).toEqual({
      ...launch,
      subagentType: "Explore",
      description: "Inspect ACP mapping",
    });
    expect(coordinator.hasBackgroundTasks()).toBe(true);
    expect(coordinator.registerBackgroundLaunch(launch)).toBeUndefined();
    expect(coordinator.resolveBackgroundToolCallId("task-1")).toBe("tool-1");
  });

  it("emits nested child output, a top-level parent reply, then terminal status", () => {
    const coordinator = createAcpSubagentCoordinator();
    coordinator.updateCall("tool-1", {
      subagentType: "Explore",
      description: "Inspect ACP mapping",
      background: true,
    });
    coordinator.registerBackgroundLaunch({
      sessionId: "session-1",
      toolCallId: "tool-1",
      taskId: "task-1",
    });

    const notifications = coordinator.complete({
      sessionId: "session-1",
      taskId: "task-1",
      status: "completed",
      result: "child result",
      childOutput: "child result",
      parentReply: "main-agent answer",
      terminalMeta: { usage: { totalTokens: 42 } },
    });

    expect(notifications.map(({ update }) => update.sessionUpdate)).toEqual([
      "agent_message_chunk",
      "agent_message_chunk",
      "tool_call_update",
    ]);
    expect(notifications[0]?.update).toMatchObject({
      content: { type: "text", text: "child result" },
      _meta: { [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: "tool-1" },
    });
    expect(notifications[1]?.update).toMatchObject({
      content: { type: "text", text: "main-agent answer" },
      _meta: {
        [PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY]: true,
        [PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY]: "tool-1",
      },
    });
    expect(notifications[1]?.update._meta).not.toHaveProperty(
      PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY,
    );
    expect(notifications[2]?.update).toMatchObject({
      toolCallId: "tool-1",
      status: "completed",
      rawOutput: "child result",
      rawInput: {
        _toolName: "task",
        subagent_type: "Explore",
        description: "Inspect ACP mapping",
        background: true,
      },
      _meta: {
        usage: { totalTokens: 42 },
        [PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY]: "tool-1",
      },
    });
    expect(coordinator.resolveBackgroundToolCallId("task-1")).toBeUndefined();
    expect(coordinator.hasBackgroundTasks()).toBe(false);
  });
});
