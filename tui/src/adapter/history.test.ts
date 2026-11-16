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

  test("an unfinished tool item projects terminal once its turn is no longer live", () => {
    const items: PersistedRuntimeItem[] = [
      {
        id: "user-1",
        type: "user_message",
        state: "completed",
        payload: { content: [{ kind: "text", text: "Run" }] },
        streams: {},
      },
      {
        id: "command-1",
        type: "command_execution",
        state: "started",
        payload: { command: "sleep 60", status: "running" },
        streams: {},
      },
    ];
    const idle = historyMessages(thread, items, true);
    const assistant = idle.find((message) => message.type === "assistant");
    if (!assistant || assistant.type !== "assistant") throw new Error("Assistant missing");
    const tool = assistant.content.find((part) => part.type === "tool");
    if (!tool || tool.type !== "tool") throw new Error("Tool part missing");
    expect(tool.state.status).toBe("completed");

    const working = historyMessages({ ...thread, status: "working" }, items, true);
    const liveAssistant = working.find((message) => message.type === "assistant");
    if (!liveAssistant || liveAssistant.type !== "assistant") throw new Error("Assistant missing");
    const liveTool = liveAssistant.content.find((part) => part.type === "tool");
    if (!liveTool || liveTool.type !== "tool") throw new Error("Tool part missing");
    expect(liveTool.state.status).toBe("running");
  });

  test("an unfinished tool item before the last user message stays terminal while running", () => {
    const items: PersistedRuntimeItem[] = [
      {
        id: "command-old",
        type: "command_execution",
        state: "started",
        payload: { command: "sleep 60", status: "running" },
        streams: {},
      },
      {
        id: "user-1",
        type: "user_message",
        state: "completed",
        payload: { content: [{ kind: "text", text: "Next" }] },
        streams: {},
      },
    ];
    const messages = historyMessages({ ...thread, status: "working" }, items, true);
    const assistant = messages.find((message) => message.type === "assistant");
    if (!assistant || assistant.type !== "assistant") throw new Error("Assistant missing");
    const tool = assistant.content.find((part) => part.type === "tool");
    if (!tool || tool.type !== "tool") throw new Error("Tool part missing");
    expect(tool.state.status).toBe("completed");
  });

  test("question_answer projects as a tool part carrying the runtime item", () => {
    const messages = historyMessages(thread, [
      {
        id: "user-1",
        type: "user_message",
        state: "completed",
        payload: { content: [{ kind: "text", text: "Pick" }] },
        streams: {},
      },
      {
        id: "qa-1",
        type: "question_answer",
        state: "completed",
        payload: {
          questions: [
            {
              header: "Color",
              question: "Which color?",
              selected: [{ label: "Blue", description: "Cool" }],
            },
          ],
        },
        streams: {},
      },
    ]);
    const assistant = messages.find((message) => message.type === "assistant");
    if (!assistant || assistant.type !== "assistant") throw new Error("Assistant missing");
    const tool = assistant.content.find((part) => part.type === "tool");
    if (!tool || tool.type !== "tool") throw new Error("Tool part missing");
    expect(tool.name).toBe("poracode_question_answer");
    expect(tool.state).toMatchObject({
      status: "completed",
      metadata: {
        poracode: {
          type: "question_answer",
          payload: { questions: [{ question: "Which color?" }] },
        },
      },
    });
    expect(messages.some((message) => message.type === "synthetic")).toBe(false);
  });

  test("provider_handoff carries the agent kinds in its Poracode metadata", () => {
    const messages = historyMessages(thread, [
      {
        id: "handoff-1",
        type: "provider_handoff",
        state: "completed",
        payload: {
          fromAgentKind: "claude",
          toAgentKind: "codex",
          at: "2026-01-01T00:00:00.500Z",
        },
        streams: {},
      },
    ]);
    const system = messages.find((message) => message.type === "system");
    expect(system?.metadata?.poracode).toEqual({
      type: "provider_handoff",
      payload: { fromAgentKind: "claude", toAgentKind: "codex" },
    });
  });

  test("completed turns stamp per-turn times and idle markers through history", () => {
    const text = (
      id: string,
      kind: "user_message" | "assistant_message",
      value: string,
    ): PersistedRuntimeItem => ({
      id,
      type: kind,
      state: "completed",
      payload: { content: [{ kind: "text", text: value }] },
      streams: kind === "assistant_message" ? { assistant_text: value } : {},
    });
    const items = [
      text("u1", "user_message", "One"),
      text("a1", "assistant_message", "First"),
      text("u2", "user_message", "Two"),
      text("a2", "assistant_message", "Second"),
      text("u3", "user_message", "Three"),
      text("a3", "assistant_message", "Third"),
    ];
    const turns = [
      {
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:00:42.000Z",
        anchorItemId: "a1",
      },
      {
        startedAt: "2026-01-01T00:01:00.000Z",
        endedAt: "2026-01-01T00:04:42.000Z",
        anchorItemId: "a2",
      },
      {
        startedAt: "2026-01-01T00:05:00.000Z",
        endedAt: "2026-01-01T00:05:04.000Z",
        anchorItemId: "a3",
      },
    ];
    const messages = historyMessages(thread, items, true, turns);
    // Newest-first: each turn's assistant carries its own end, each user
    // message its own start, and an idle marker closes every turn.
    const assistants = messages.filter((message) => message.type === "assistant");
    expect(assistants).toHaveLength(3);
    expect(
      assistants.map((message) =>
        message.type === "assistant" ? message.time.completed : undefined,
      ),
    ).toEqual([
      Date.parse("2026-01-01T00:05:04.000Z"),
      Date.parse("2026-01-01T00:04:42.000Z"),
      Date.parse("2026-01-01T00:00:42.000Z"),
    ]);
    expect(assistants.every((message) => message.finish === "stop")).toBe(true);
    const users = messages.filter((message) => message.type === "user");
    expect(
      users.map((message) => (message.type === "user" ? message.time.created : undefined)),
    ).toEqual([
      Date.parse("2026-01-01T00:05:00.000Z"),
      Date.parse("2026-01-01T00:01:00.000Z"),
      Date.parse("2026-01-01T00:00:00.000Z"),
    ]);
    const idles = messages.filter((message) => message.type === "idle");
    expect(idles).toHaveLength(3);
    expect(idles.map((message) => message.time.created)).toEqual([
      Date.parse("2026-01-01T00:05:04.000Z"),
      Date.parse("2026-01-01T00:04:42.000Z"),
      Date.parse("2026-01-01T00:00:42.000Z"),
    ]);
  });

  test("tool parts use their own turn's times, not the latest turn's", () => {
    const text = (
      id: string,
      kind: "user_message" | "assistant_message",
      value: string,
    ): PersistedRuntimeItem => ({
      id,
      type: kind,
      state: "completed",
      payload: { content: [{ kind: "text", text: value }] },
      streams: kind === "assistant_message" ? { assistant_text: value } : {},
    });
    const read = (id: string): PersistedRuntimeItem => ({
      id,
      type: "tool_call",
      state: "completed",
      payload: { name: "Read", kind: "read", status: "success", args: { path: "a.ts" } },
      streams: {},
    });
    const items = [
      text("u1", "user_message", "One"),
      text("a1", "assistant_message", "First"),
      read("t1"),
      text("u2", "user_message", "Two"),
      text("a2", "assistant_message", "Second"),
      read("t2"),
    ];
    const turns = [
      {
        startedAt: "2026-01-01T00:00:10.000Z",
        endedAt: "2026-01-01T00:00:40.000Z",
        anchorItemId: "a1",
      },
      {
        startedAt: "2026-01-01T00:01:10.000Z",
        endedAt: "2026-01-01T00:04:40.000Z",
        anchorItemId: "a2",
      },
    ];
    const latest = {
      ...thread,
      lastTurnStartedAt: "2026-01-01T00:01:10.000Z",
      lastTurnEndedAt: "2026-01-01T00:04:40.000Z",
    };
    const messages = historyMessages(latest, items, true, turns);
    const assistants = messages.filter((message) => message.type === "assistant");
    expect(assistants).toHaveLength(2);
    const toolOf = (message: (typeof assistants)[number]) =>
      message.type === "assistant"
        ? message.content.find((part) => part.type === "tool")
        : undefined;
    const [second, first] = assistants;
    // Newest-first: the second turn's tool carries the second turn's times…
    expect(toolOf(second!)?.time).toEqual({
      created: Date.parse("2026-01-01T00:01:10.000Z"),
      ran: Date.parse("2026-01-01T00:01:10.000Z"),
      completed: Date.parse("2026-01-01T00:04:40.000Z"),
    });
    // …and the first turn's tool its own, not the thread's lastTurn* values.
    expect(toolOf(first!)?.time).toEqual({
      created: Date.parse("2026-01-01T00:00:10.000Z"),
      ran: Date.parse("2026-01-01T00:00:10.000Z"),
      completed: Date.parse("2026-01-01T00:00:40.000Z"),
    });
  });

  test("historyMessagePage filters child items without tripping the cursor guard", async () => {
    const parent = { ...thread, status: "idle" as const };
    const child = (id: string): PersistedRuntimeItem => ({
      id,
      type: "tool_call",
      state: "completed",
      parentItemId: "task-1",
      payload: { name: "Read", status: "success" },
      streams: {},
    });
    const page = await historyMessagePage(
      parent,
      20,
      undefined,
      async () => ({
        items: [child("child-1"), child("child-2")],
        nextCursor: null,
      }),
      { includeItem: (item) => !item.parentItemId },
    );
    expect(page.data).toEqual([]);
    expect(page.cursor.next).toBeNull();
  });
});
