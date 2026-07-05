import type { SessionNotification } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import { transformCursorAcpSessionUpdate } from "./acpTransform";

function toolCall(overrides: Record<string, unknown>): SessionNotification {
  return {
    sessionId: "ses-1",
    update: {
      sessionUpdate: "tool_call",
      toolCallId: "tc-task",
      status: "pending",
      ...overrides,
    },
  } as unknown as SessionNotification;
}

describe("transformCursorAcpSessionUpdate — task tools", () => {
  it("enriches Cursor task tool_call rawInput from the title description", () => {
    const input = toolCall({
      kind: "other",
      title: "Task: Count words in hello.txt",
      rawInput: { _toolName: "task" },
    });
    const rawInput = (transformCursorAcpSessionUpdate(input).update as { rawInput?: unknown })
      .rawInput as Record<string, unknown>;
    expect(rawInput).toMatchObject({
      _toolName: "task",
      description: "Count words in hello.txt",
      name: "Count words in hello.txt",
      prompt: "Count words in hello.txt",
    });
  });

  it("leaves generic Subagent task titles untouched until cursor/task arrives", () => {
    const input = toolCall({
      kind: "other",
      title: "Task: Subagent task",
      rawInput: { _toolName: "task" },
    });
    expect(transformCursorAcpSessionUpdate(input).update).toMatchObject({
      rawInput: { _toolName: "task" },
    });
  });
});
