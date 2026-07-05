import { describe, expect, it } from "vitest";
import { createAcpMapperState, mapAcpSessionUpdate } from "../acp/canonicalMapping";
import {
  isCursorTaskExtension,
  mapCursorTaskExtension,
  parseCursorTaskExtensionParams,
} from "./acpTaskExtension";

describe("parseCursorTaskExtensionParams", () => {
  it("parses cursor/task wire payload", () => {
    expect(
      parseCursorTaskExtensionParams({
        toolCallId: "toolu_abc",
        description: "Count words in hello.txt",
        prompt: "Read hello.txt and count words.",
        model: "composer-2.5-fast",
        durationMs: 28426,
        subagentType: { custom: { explore: {} } },
      }),
    ).toMatchObject({
      toolCallId: "toolu_abc",
      description: "Count words in hello.txt",
      prompt: "Read hello.txt and count words.",
      model: "composer-2.5-fast",
      durationMs: 28426,
    });
  });
});

describe("mapCursorTaskExtension", () => {
  it("marks the parent tool as a subagent and opens a child prompt thread", () => {
    const events = mapCursorTaskExtension("thread-1", "tool-parent", {
      toolCallId: "toolu_abc",
      description: "Count words in hello.txt",
      prompt: "Read hello.txt and count words.",
      model: "composer-2.5-fast",
      durationMs: 1200,
      subagentType: { explore: {} },
    });

    expect(events[0]).toMatchObject({
      type: "item.updated",
      threadId: "thread-1",
      itemId: "tool-parent",
      payload: {
        isSubAgent: true,
        name: "Task: Count words in hello.txt",
        args: {
          _toolName: "task",
          description: "Count words in hello.txt",
          prompt: "Read hello.txt and count words.",
          subagent_type: "explore",
        },
        progress: {
          model: "composer-2.5-fast",
          durationMs: 1200,
          description: "Count words in hello.txt",
        },
      },
    });

    const childStarted = events.find(
      (event) => event.type === "item.started" && event.itemType === "assistant_message",
    );
    expect(childStarted).toMatchObject({
      parentItemId: "tool-parent",
    });
    expect(
      events.some(
        (event) =>
          event.type === "content.delta" &&
          event.stream === "assistant_text" &&
          event.delta === "Read hello.txt and count words.",
      ),
    ).toBe(true);
  });
});

describe("isCursorTaskExtension", () => {
  it("matches cursor/task only", () => {
    expect(isCursorTaskExtension("cursor/task")).toBe(true);
    expect(isCursorTaskExtension("cursor/update_todos")).toBe(false);
  });
});

describe("Cursor task tool_call ACP mapping", () => {
  it("treats Cursor `_toolName: task` tool calls as subagents", () => {
    const state = createAcpMapperState("thread-cursor");
    const events = mapAcpSessionUpdate(
      {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "toolu_task",
          title: "Task: Subagent task",
          kind: "other",
          status: "in_progress",
          rawInput: { _toolName: "task" },
        },
      },
      state,
    );

    expect(events[0]).toMatchObject({
      type: "item.started",
      itemType: "tool_call",
      payload: { isSubAgent: true },
    });
  });
});
