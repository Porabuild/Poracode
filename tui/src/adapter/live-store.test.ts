import { createRoot } from "solid-js";
import { describe, expect, test } from "bun:test";
import type {
  OpenCodeClient,
  OpenCodeEvent,
  SessionInfo,
  SessionMessageInfo,
} from "@opencode/client";
import { createData, type CreateDataInput } from "@opencode/client/solid";
import type { RuntimeEvent } from "@/shared/contracts/runtimeEvent";
import type { Thread } from "@/shared/contracts";
import type { PersistedRuntimeItem } from "@/shared/ipc/schemas";
import { createEventTranslator } from "./events";
import { historyMessages } from "./history";
import { formId } from "./ids";

const thread = "thread-1";
const sessionID = "ses_thread-1";
const context = new Map([
  [
    thread,
    {
      agent: "build",
      providerID: "agent-a",
      model: "model-a",
      location: { directory: "C:/repo" },
    },
  ],
]);

describe("live TUI projections", () => {
  test("keeps a reasoning/text/tool/text run in one assistant message without leaking tool output", async () => {
    const harness = await createHarness();
    const events = harness.translate([
      { type: "turn.started", threadId: thread, turnId: "turn-1" },
      {
        type: "item.started",
        threadId: thread,
        itemId: "reasoning-1",
        itemType: "reasoning",
        payload: { summary: "Thinking" },
      },
      {
        type: "content.delta",
        threadId: thread,
        itemId: "reasoning-1",
        stream: "reasoning_text",
        delta: "Thinking",
      },
      {
        type: "item.completed",
        threadId: thread,
        itemId: "reasoning-1",
        payload: { summary: "Thinking" },
      },
      {
        type: "item.started",
        threadId: thread,
        itemId: "text-1",
        itemType: "assistant_message",
      },
      {
        type: "content.delta",
        threadId: thread,
        itemId: "text-1",
        stream: "assistant_text",
        delta: "Before ",
      },
      {
        type: "item.completed",
        threadId: thread,
        itemId: "text-1",
      },
      {
        type: "item.started",
        threadId: thread,
        itemId: "command-1",
        itemType: "command_execution",
        payload: { command: "echo output", status: "running" },
      },
      {
        type: "content.delta",
        threadId: thread,
        itemId: "command-1",
        stream: "command_output",
        delta: "command output ",
      },
      {
        type: "content.delta",
        threadId: thread,
        itemId: "command-1",
        stream: "command_output",
        delta: "continued",
      },
      {
        type: "item.completed",
        threadId: thread,
        itemId: "command-1",
        payload: { command: "echo output", status: "completed", exitCode: 0 },
      },
      {
        type: "item.started",
        threadId: thread,
        itemId: "text-2",
        itemType: "assistant_message",
      },
      {
        type: "content.delta",
        threadId: thread,
        itemId: "text-2",
        stream: "assistant_text",
        delta: "After",
      },
      { type: "item.completed", threadId: thread, itemId: "text-2" },
      { type: "turn.completed", threadId: thread, turnId: "turn-1", state: "completed" },
    ]);
    const textStarts = events.filter(
      (event): event is Extract<OpenCodeEvent, { type: "session.text.started" }> =>
        event.type === "session.text.started",
    );
    expect(textStarts.map((event) => event.data.ordinal)).toEqual([1, 3]);

    const messages = harness.store.session.message.list(sessionID);
    const assistants = messages.filter((message) => message.type === "assistant");
    expect(assistants).toHaveLength(1);
    const assistant = assistants[0];
    if (!assistant || assistant.type !== "assistant") throw new Error("Assistant message missing");
    expect(assistant.content.map((part) => part.type)).toEqual([
      "reasoning",
      "text",
      "tool",
      "text",
    ]);
    const tool = assistant.content.find((part) => part.type === "tool");
    if (!tool || tool.type !== "tool" || tool.state.status !== "completed") {
      throw new Error("Completed command tool missing");
    }
    expect(tool.state.metadata?.output).toBe("command output continued");
    expect(tool.state.content).toContainEqual({
      type: "text",
      text: "command output continued",
    });
    expect(
      assistant.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join(""),
    ).not.toContain("command output");
    harness.close();
  });

  test("maps persisted reasoning and tools like live events through the Solid data layer", async () => {
    const historyThread: Thread = {
      id: thread,
      projectId: "project-1",
      title: "History fixture",
      agentKind: "agent-a",
      config: { model: "model-a" },
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:01.000Z",
      lastTurnStartedAt: "2026-01-01T00:00:00.100Z",
      lastTurnEndedAt: "2026-01-01T00:00:01.000Z",
      presentationMode: "gui",
    };
    const items: PersistedRuntimeItem[] = [
      {
        id: "user-1",
        type: "user_message",
        state: "completed",
        payload: { content: [{ kind: "text", text: "Run a command" }] },
        streams: {},
      },
      {
        id: "reasoning-1",
        type: "reasoning",
        state: "completed",
        payload: { summary: "Thinking" },
        streams: { reasoning_text: "Thinking" },
      },
      {
        id: "text-1",
        type: "assistant_message",
        state: "completed",
        payload: { content: [{ kind: "text", text: "Before " }] },
        streams: { assistant_text: "Before " },
      },
      {
        id: "command-1",
        type: "command_execution",
        state: "completed",
        payload: {
          command: "echo output",
          cwd: "C:/repo",
          status: "success",
          exitCode: 0,
        },
        streams: { command_output: "command output continued" },
      },
      {
        id: "text-2",
        type: "assistant_message",
        state: "completed",
        payload: { content: [{ kind: "text", text: "After" }] },
        streams: { assistant_text: "After" },
      },
    ];
    const history = await createHarness(historyMessages(historyThread, items));
    const live = await createHarness();
    live.translate([
      { type: "turn.started", threadId: thread, turnId: "turn-history" },
      {
        type: "item.started",
        threadId: thread,
        itemId: "user-1",
        itemType: "user_message",
        payload: { content: [{ kind: "text", text: "Run a command" }] },
      },
      {
        type: "item.started",
        threadId: thread,
        itemId: "reasoning-1",
        itemType: "reasoning",
        payload: { summary: "Thinking" },
      },
      {
        type: "content.delta",
        threadId: thread,
        itemId: "reasoning-1",
        stream: "reasoning_text",
        delta: "Thinking",
      },
      {
        type: "item.completed",
        threadId: thread,
        itemId: "reasoning-1",
        payload: { summary: "Thinking" },
      },
      {
        type: "item.started",
        threadId: thread,
        itemId: "text-1",
        itemType: "assistant_message",
      },
      {
        type: "content.delta",
        threadId: thread,
        itemId: "text-1",
        stream: "assistant_text",
        delta: "Before ",
      },
      {
        type: "item.completed",
        threadId: thread,
        itemId: "text-1",
        payload: { content: [{ kind: "text", text: "Before " }] },
      },
      {
        type: "item.started",
        threadId: thread,
        itemId: "command-1",
        itemType: "command_execution",
        payload: { command: "echo output", cwd: "C:/repo", status: "running" },
      },
      {
        type: "content.delta",
        threadId: thread,
        itemId: "command-1",
        stream: "command_output",
        delta: "command output continued",
      },
      {
        type: "item.updated",
        threadId: thread,
        itemId: "command-1",
        payload: {
          command: "echo output",
          cwd: "C:/repo",
          status: "success",
          exitCode: 0,
        },
      },
      {
        type: "item.completed",
        threadId: thread,
        itemId: "command-1",
        payload: {
          command: "echo output",
          cwd: "C:/repo",
          status: "success",
          exitCode: 0,
        },
      },
      {
        type: "item.started",
        threadId: thread,
        itemId: "text-2",
        itemType: "assistant_message",
      },
      {
        type: "content.delta",
        threadId: thread,
        itemId: "text-2",
        stream: "assistant_text",
        delta: "After",
      },
      {
        type: "item.completed",
        threadId: thread,
        itemId: "text-2",
        payload: { content: [{ kind: "text", text: "After" }] },
      },
      { type: "turn.completed", threadId: thread, turnId: "turn-history", state: "completed" },
    ]);

    const historyAssistant = history.store.session.message
      .list(sessionID)
      .find((message) => message.type === "assistant");
    const liveAssistant = live.store.session.message
      .list(sessionID)
      .find((message) => message.type === "assistant");
    if (
      !historyAssistant ||
      historyAssistant.type !== "assistant" ||
      !liveAssistant ||
      liveAssistant.type !== "assistant"
    )
      throw new Error("Assistant message missing");
    const content = (message: typeof historyAssistant) =>
      message.content.map((part) =>
        part.type === "tool"
          ? {
              type: part.type,
              id: part.id,
              name: part.name,
              executed: part.executed,
              state: part.state,
            }
          : { type: part.type, text: part.text },
      );
    expect(content(historyAssistant)).toEqual(content(liveAssistant));
    history.close();
    live.close();
  });

  test("projects an interrupted turn with a closed step and interrupted idle marker", async () => {
    const harness = await createHarness();
    harness.translate([
      { type: "turn.started", threadId: thread, turnId: "turn-interrupted" },
      {
        type: "item.started",
        threadId: thread,
        itemId: "assistant-interrupted",
        itemType: "assistant_message",
      },
      {
        type: "content.delta",
        threadId: thread,
        itemId: "assistant-interrupted",
        stream: "assistant_text",
        delta: "Partial",
      },
      {
        type: "turn.completed",
        threadId: thread,
        turnId: "turn-interrupted",
        state: "interrupted",
      },
    ]);
    const messages = harness.store.session.message.list(sessionID);
    const assistant = messages.find((message) => message.type === "assistant");
    const idle = messages.find((message) => message.type === "idle");
    expect(assistant?.time.completed).toBeDefined();
    expect(idle).toMatchObject({ type: "idle", outcome: "interrupted" });
    harness.close();
  });

  test("projects a failed turn with the runtime error", async () => {
    const harness = await createHarness();
    harness.translate([
      { type: "turn.started", threadId: thread, turnId: "turn-failed" },
      {
        type: "item.started",
        threadId: thread,
        itemId: "assistant-failed",
        itemType: "assistant_message",
      },
      { type: "error", threadId: thread, message: "provider failed" },
      { type: "turn.completed", threadId: thread, turnId: "turn-failed", state: "failed" },
    ]);
    expect(harness.store.session.message.list(sessionID)).toContainEqual(
      expect.objectContaining({
        type: "idle",
        outcome: "failed",
        error: { type: "provider_error", message: "provider failed" },
      }),
    );
    harness.close();
  });

  test("inserts a live user_message into the store", async () => {
    const harness = await createHarness();
    harness.translate([
      {
        type: "item.started",
        threadId: thread,
        itemId: "user-live",
        itemType: "user_message",
        payload: { content: [{ kind: "text", text: "Live prompt" }] },
      },
    ]);
    expect(harness.store.session.message.list(sessionID)).toContainEqual(
      expect.objectContaining({ id: "msg_user-live", type: "user", text: "Live prompt" }),
    );
    harness.close();
  });

  test("removes a surfaced permission after request.resolved", async () => {
    const harness = await createHarness();
    harness.translate([
      {
        type: "request.opened",
        threadId: thread,
        requestId: "request-1",
        requestType: "tool_call_approval",
        payload: { summary: "Approve command" },
      },
    ]);
    expect(harness.store.session.permission.list(sessionID)).toHaveLength(1);
    harness.translate([
      {
        type: "request.resolved",
        threadId: thread,
        requestId: "request-1",
        outcome: "accepted",
      },
    ]);
    expect(harness.store.session.permission.list(sessionID)).toHaveLength(0);
    harness.close();
  });

  test("projects an open question form and removes it after request resolution", async () => {
    const harness = await createHarness();
    const created = harness.translate([
      {
        type: "request.opened",
        threadId: thread,
        requestId: "question-1",
        requestType: "tool_user_input",
        payload: {
          summary: "Choose a color",
          options: [{ optionId: "blue", label: "Blue" }],
        },
      },
    ]);
    expect(created.map((event) => event.type)).toEqual(["form.created"]);
    const formID = formId(thread, "question-1");
    const createdForm = harness.store.session.form.list(sessionID)?.[0];
    expect(createdForm?.id).toBe(formID);
    expect(createdForm?.sessionID).toBe(sessionID);
    expect(createdForm?.title).toBe("Choose a color");
    const field = createdForm?.fields[0];
    if (!field || field.type !== "string") throw new Error("String form field missing");
    expect(field.key).toBe("answer");
    expect(field.options).toEqual([{ value: "blue", label: "Blue" }]);
    const resolved = harness.translate([
      {
        type: "request.resolved",
        threadId: thread,
        requestId: "question-1",
        outcome: "answered",
      },
    ]);
    expect(resolved.map((event) => event.type)).toEqual(["form.cancelled"]);
    const cancelled = resolved[0];
    if (!cancelled || cancelled.type !== "form.cancelled")
      throw new Error("Question form was not cancelled");
    expect(cancelled.data.id).toBe(formID);
    expect(cancelled.data.sessionID).toBe(sessionID);
    expect(cancelled.location).toEqual({ directory: "C:/repo" });
    expect(harness.store.session.form.list(sessionID)).toHaveLength(0);
    harness.close();
  });

  test("treats replace:true assistant deltas as the complete text snapshot", async () => {
    const harness = await createHarness();
    harness.translate([
      { type: "turn.started", threadId: thread, turnId: "turn-replace" },
      {
        type: "item.started",
        threadId: thread,
        itemId: "assistant-replace",
        itemType: "assistant_message",
      },
      {
        type: "content.delta",
        threadId: thread,
        itemId: "assistant-replace",
        stream: "assistant_text",
        delta: "Authoritative snapshot",
        replace: true,
      },
    ]);
    const assistant = harness.store.session.message
      .list(sessionID)
      .find((message) => message.type === "assistant");
    if (!assistant || assistant.type !== "assistant") throw new Error("Assistant message missing");
    expect(assistant.content).toContainEqual({ type: "text", text: "Authoritative snapshot" });
    harness.close();
  });

  test("resetThread clears the open run so a replayed item.started re-emits", () => {
    const translator = createEventTranslator(context, () => 1);
    translator.translate({
      type: "thread-runtime-events",
      threadId: thread,
      events: [
        { type: "turn.started", threadId: thread, turnId: "turn-1" },
        {
          type: "item.started",
          threadId: thread,
          itemId: "assistant-1",
          itemType: "assistant_message",
          payload: { content: [] },
        },
      ],
    });
    expect(translator.hasActiveRun(sessionID)).toBe(true);
    translator.resetThread(thread);
    expect(translator.hasActiveRun(sessionID)).toBe(false);
    const replayed = translator.translate({
      type: "thread-runtime-events",
      threadId: thread,
      events: [
        {
          type: "item.started",
          threadId: thread,
          itemId: "assistant-1",
          itemType: "assistant_message",
          payload: { content: [] },
        },
      ],
    });
    expect(replayed.some((event) => event.type === "session.text.started")).toBe(true);
  });

  test("a TUI-answered form emits no trailing form.cancelled on request.resolved", () => {
    const translator = createEventTranslator(context, () => 1);
    const opened = translator.translate({
      type: "thread-runtime-events",
      threadId: thread,
      events: [
        {
          type: "request.opened",
          threadId: thread,
          requestId: "question-1",
          requestType: "tool_user_input",
          payload: {
            summary: "Choose a color",
            details: {
              userInputForm: {
                questions: [
                  {
                    id: "color",
                    header: "Color",
                    question: "Choose one",
                    options: [{ optionId: "blue", label: "Blue" }],
                    multiSelect: false,
                  },
                ],
              },
            },
          },
        },
      ],
    });
    expect(opened.some((event) => event.type === "form.created")).toBe(true);
    // The reply route forgets the form request before resolveRequest, so the
    // resolved event must not emit a cancelled after the replied.
    translator.forgetFormRequest(thread, "question-1");
    const resolved = translator.translate({
      type: "thread-runtime-events",
      threadId: thread,
      events: [
        {
          type: "request.resolved",
          threadId: thread,
          requestId: "question-1",
          outcome: "answered",
        },
      ],
    });
    expect(resolved.filter((event) => event.type === "form.cancelled")).toEqual([]);
  });
});

async function createHarness(initial: SessionMessageInfo[] = []) {
  const api = {
    message: {
      list: async () => ({ data: initial, cursor: { previous: null, next: null } }),
    },
    permission: { list: async () => [] },
  } as unknown as OpenCodeClient;
  let publish: (event: OpenCodeEvent) => void = () => undefined;
  const root = createRoot((close) => {
    const event: CreateDataInput["event"] = {
      on: () => () => undefined,
      listen: (handler) => {
        publish = (value) => handler({ name: value.type, details: value });
        return () => undefined;
      },
    };
    const store = createData({ api: () => api, directory: "C:/repo", event });
    const session = {
      id: sessionID,
      projectID: "project-1",
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 1, updated: 1 },
      location: { directory: "C:/repo" },
    } satisfies SessionInfo;
    store.session.remember(session);
    return { store, close };
  });
  await root.store.session.message.sync(sessionID);
  let sequence = 0;
  const translator = createEventTranslator(context, () => ++sequence);
  return {
    store: root.store,
    close: root.close,
    translate(events: RuntimeEvent[]) {
      const translated = translator.translate({
        type: "thread-runtime-events",
        threadId: thread,
        events,
      });
      for (const event of translated) publish(event);
      return translated;
    },
  };
}
