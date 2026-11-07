import { describe, expect, test } from "bun:test";
import type { Thread } from "@/shared/contracts";
import type { PersistedRuntimeItem } from "@/shared/ipc/schemas";
import { decodeHistoryCursor, historyMessagePage, historyMessages } from "./history";

const thread: Thread = {
  id: "thread-1",
  projectId: "project-1",
  title: "A conversation",
  agentKind: "agent-a",
  config: { model: "model-a" },
  status: "idle",
  attention: "none",
  canResumeWithConfig: false,
  archived: false,
  done: false,
  starred: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("runtime history projection", () => {
  test("groups canonical user and assistant items into OpenCode messages newest-first", () => {
    const items: PersistedRuntimeItem[] = [
      {
        id: "user-1",
        type: "user_message",
        state: "completed",
        payload: { content: [{ kind: "text", text: "Reply with exactly: OK" }] },
        streams: {},
      },
      {
        id: "assistant-1",
        type: "assistant_message",
        state: "completed",
        payload: { content: [{ kind: "text", text: "OK" }] },
        streams: { assistant_text: "OK" },
      },
    ];
    const result = historyMessages(thread, items);
    expect(result.map((message) => message.type)).toEqual(["assistant", "user"]);
    expect(result[0]).toMatchObject({
      id: "msg_assistant-1",
      type: "assistant",
      content: [{ type: "text", text: "OK" }],
    });
    expect(result[1]).toMatchObject({
      id: "msg_user-1",
      type: "user",
      text: "Reply with exactly: OK",
    });
  });

  test("fetches backward until a split run reaches its user-message boundary", async () => {
    const requests: Array<number | undefined> = [];
    const pages = [
      {
        items: [
          {
            id: "assistant-2",
            type: "assistant_message",
            state: "completed",
            payload: { content: [{ kind: "text", text: "Second answer" }] },
            streams: { assistant_text: "Second answer" },
          },
        ],
        nextCursor: 42,
      },
      {
        items: [
          {
            id: "user-2",
            type: "user_message",
            state: "completed",
            payload: { content: [{ kind: "text", text: "Second prompt" }] },
            streams: {},
          },
        ],
        nextCursor: 41,
      },
    ] satisfies Array<{
      items: PersistedRuntimeItem[];
      nextCursor: number | null;
    }>;
    const response = await historyMessagePage(thread, 2, undefined, async (beforePosition) => {
      requests.push(beforePosition);
      return pages.shift()!;
    });

    expect(requests).toEqual([undefined, 42]);
    expect(response.data.map((message) => message.type)).toEqual(["assistant", "user"]);
    expect(response.data[0]).toMatchObject({
      type: "assistant",
      content: [{ type: "text", text: "Second answer" }],
    });
    expect(response.data[1]).toMatchObject({ type: "user", text: "Second prompt" });
    expect(response.cursor.next).toMatch(/^rmi1\./u);
    expect(decodeHistoryCursor(response.cursor.next!, thread.id)).toBe(41);
  });

  test("exhausts the history cursor when the oldest runtime page is reached", async () => {
    const response = await historyMessagePage(thread, 20, undefined, async () => ({
      items: [
        {
          id: "assistant-oldest",
          type: "assistant_message",
          state: "completed",
          payload: { content: [{ kind: "text", text: "Oldest reply" }] },
          streams: { assistant_text: "Oldest reply" },
        },
      ],
      nextCursor: null,
    }));

    expect(response.data).toMatchObject([
      {
        type: "assistant",
        content: [{ type: "text", text: "Oldest reply" }],
      },
    ]);
    expect(response.cursor.next).toBeNull();
  });

  test("bounds persisted tool output and emits the latest completed idle marker", () => {
    const completedThread: Thread = {
      ...thread,
      status: "idle",
      lastTurnStartedAt: "2026-01-01T00:00:00.100Z",
      lastTurnEndedAt: "2026-01-01T00:00:01.000Z",
    };
    const messages = historyMessages(
      completedThread,
      [
        {
          id: "user-1",
          type: "user_message",
          state: "completed",
          payload: { content: [{ kind: "text", text: "Run a command" }] },
          streams: {},
        },
        {
          id: "command-1",
          type: "command_execution",
          state: "completed",
          payload: { command: "echo output", status: "success", exitCode: 0 },
          streams: { command_output: "o".repeat(65 * 1024) },
        },
      ],
      true,
    );
    const assistant = messages.find((message) => message.type === "assistant");
    const idle = messages.find((message) => message.type === "idle");
    if (!assistant || assistant.type !== "assistant") throw new Error("Assistant message missing");
    const tool = assistant.content.find((part) => part.type === "tool");
    if (!tool || tool.type !== "tool" || tool.state.status !== "completed")
      throw new Error("Completed command tool missing");
    expect(tool.state.content[0]?.type === "text" ? tool.state.content[0].text.length : 0).toBe(
      64 * 1024,
    );
    expect(assistant.time.completed).toBe(Date.parse("2026-01-01T00:00:01.000Z"));
    expect(idle).toMatchObject({ type: "idle", outcome: "succeeded" });
  });
});
