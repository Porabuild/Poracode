import { describe, expect, it } from "vitest";
import { createAcpMapperState, mapAcpSessionUpdate } from "../acp/canonicalMapping";
import { handleCursorAcpExtensionNotification } from "./acpExtension";

describe("Cursor ACP subagent end-to-end mapping", () => {
  it("maps tool_call + cursor/task extension into subagent row + child thread", () => {
    const threadId = "thread-probe";
    const state = createAcpMapperState(threadId);
    const toolCallId = "toolu_01Gz2XKWCQXLbKsWqND9L7FQ";

    const started = mapAcpSessionUpdate(
      {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call",
          toolCallId,
          title: "Task: Subagent task",
          kind: "other",
          status: "in_progress",
          rawInput: { _toolName: "task" },
        },
      },
      state,
    );
    const parentItemId = (started[0] as { itemId: string }).itemId;
    expect((started[0] as { payload: Record<string, unknown> }).payload.isSubAgent).toBe(true);

    mapAcpSessionUpdate(
      {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId,
          status: "completed",
          rawOutput: { durationMs: 28426, isBackground: false },
        },
      },
      state,
    );

    const extensionEvents = handleCursorAcpExtensionNotification(
      "cursor/task",
      {
        toolCallId,
        description: "Count words in hello.txt",
        prompt: "Read hello.txt and count the words in it.",
        model: "composer-2.5-fast",
        durationMs: 28426,
        subagentType: { custom: { explore: {} } },
      },
      {
        threadId,
        resolveToolCallItemId: () => parentItemId,
      },
    );

    expect(extensionEvents[0]).toMatchObject({
      type: "item.updated",
      itemId: parentItemId,
      payload: {
        isSubAgent: true,
        name: "Task: Count words in hello.txt",
        args: {
          _toolName: "task",
          description: "Count words in hello.txt",
          prompt: "Read hello.txt and count the words in it.",
          subagent_type: "explore",
        },
        progress: {
          model: "composer-2.5-fast",
          durationMs: 28426,
        },
      },
    });

    const childStarted = extensionEvents.find(
      (event) => event.type === "item.started" && event.itemType === "assistant_message",
    );
    expect(childStarted).toMatchObject({ parentItemId });
  });
});
