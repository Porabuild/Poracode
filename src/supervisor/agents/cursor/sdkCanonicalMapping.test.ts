import { describe, expect, it } from "vitest";
import { runtimeEventSchema, type RuntimeEvent } from "@/shared/contracts";
import {
  classifyCursorSdkTool,
  closeCursorSdkOpenItems,
  createCursorSdkMapperState,
  mapCursorSdkInteractionUpdate,
  mapCursorSdkMessage,
  mapCursorSdkRunResult,
  startCursorSdkTurn,
} from "./sdkCanonicalMapping";
import type {
  CursorSdkAssistantMessage,
  CursorSdkMessage,
  CursorSdkToolCallMessage,
} from "./sdkProtocol";

const envelope = { agent_id: "agent-1", run_id: "run-1" } as const;

function assistant(
  content: CursorSdkAssistantMessage["message"]["content"],
): CursorSdkAssistantMessage {
  return {
    type: "assistant",
    ...envelope,
    message: { role: "assistant", content },
  };
}

function toolMessage(
  overrides: Omit<CursorSdkToolCallMessage, "type" | "agent_id" | "run_id">,
): CursorSdkToolCallMessage {
  return { type: "tool_call", ...envelope, ...overrides };
}

type ItemStartedEvent = Extract<RuntimeEvent, { type: "item.started" }>;
type ItemCompletedEvent = Extract<RuntimeEvent, { type: "item.completed" }>;
type ContentDeltaEvent = Extract<RuntimeEvent, { type: "content.delta" }>;

function started(events: RuntimeEvent[], itemType?: string): ItemStartedEvent[] {
  return events.filter(
    (event): event is ItemStartedEvent =>
      event.type === "item.started" && (itemType === undefined || event.itemType === itemType),
  );
}

function completed(events: RuntimeEvent[]): ItemCompletedEvent[] {
  return events.filter((event): event is ItemCompletedEvent => event.type === "item.completed");
}

function deltas(events: RuntimeEvent[], stream?: string): ContentDeltaEvent[] {
  return events.filter(
    (event): event is ContentDeltaEvent =>
      event.type === "content.delta" && (stream === undefined || event.stream === stream),
  );
}

function expectCanonical(events: RuntimeEvent[]) {
  for (const event of events) {
    expect(runtimeEventSchema.safeParse(event).success).toBe(true);
  }
}

describe("Cursor SDK canonical mapping — turn, system, and user lifecycle", () => {
  it("starts a turn and suppresses both SDK echoes of an optimistic user item", () => {
    const state = createCursorSdkMapperState("thread-1");
    expect(startCursorSdkTurn(state, "turn-1", "optimistic-user")).toEqual([
      { type: "turn.started", threadId: "thread-1", turnId: "turn-1" },
    ]);

    expect(
      mapCursorSdkInteractionUpdate(
        {
          type: "user-message-appended",
          userMessage: {
            type: "user_message",
            session_id: "agent-1",
            text: "hello",
          },
        },
        state,
      ),
    ).toEqual([]);
    expect(
      mapCursorSdkMessage(
        {
          type: "user",
          ...envelope,
          message: { role: "user", content: [{ type: "text", text: "hello" }] },
        },
        state,
      ),
    ).toEqual([]);
  });

  it("maps a user echo once when the session did not paint an optimistic item", () => {
    const state = createCursorSdkMapperState("thread-1");
    startCursorSdkTurn(state, "turn-1");
    const raw = mapCursorSdkInteractionUpdate(
      {
        type: "user-message-appended",
        userMessage: {
          type: "user_message",
          session_id: "agent-1",
          text: "hello",
        },
      },
      state,
    );
    expect(raw).toMatchObject([
      {
        type: "item.started",
        itemType: "user_message",
        payload: { content: [{ kind: "text", text: "hello" }] },
      },
      { type: "item.completed" },
    ]);
    expect(
      mapCursorSdkMessage(
        {
          type: "user",
          ...envelope,
          message: { role: "user", content: [{ type: "text", text: "hello" }] },
        },
        state,
      ),
    ).toEqual([]);
  });

  it("maps the first system init to session.started and remembers model identity", () => {
    const state = createCursorSdkMapperState("thread-1");
    startCursorSdkTurn(state, "turn-1");
    const init: CursorSdkMessage = {
      type: "system",
      ...envelope,
      subtype: "init",
      model: { id: "composer-2.5" },
      tools: ["shell"],
    };
    expect(mapCursorSdkMessage(init, state)).toEqual([
      {
        type: "session.started",
        threadId: "thread-1",
        turnId: "turn-1",
      },
    ]);
    expect(mapCursorSdkMessage(init, state)).toEqual([]);
    expect(state).toMatchObject({
      agentId: "agent-1",
      currentRunId: "run-1",
      model: "composer-2.5",
    });
  });
});

describe("Cursor SDK canonical mapping — text reconciliation", () => {
  it("appends normalized-only assistant chunks to one fallback item until a boundary", () => {
    const state = createCursorSdkMapperState("thread-1");
    const events = [
      ...mapCursorSdkMessage(assistant([{ type: "text", text: "Hello " }]), state),
      ...mapCursorSdkMessage(assistant([{ type: "text", text: "from Cursor" }]), state),
      ...mapCursorSdkMessage(
        {
          type: "usage",
          ...envelope,
          usage: {
            inputTokens: 1,
            outputTokens: 2,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalTokens: 3,
          },
        },
        state,
      ),
    ];
    expect(events.slice(0, 4)).toMatchObject([
      { type: "item.started", itemType: "assistant_message" },
      { type: "content.delta", stream: "assistant_text", delta: "Hello " },
      { type: "content.delta", stream: "assistant_text", delta: "from Cursor" },
      { type: "item.completed" },
    ]);
    expectCanonical(events);
  });

  it("streams raw assistant deltas and consumes each normalized chunk echo", () => {
    const state = createCursorSdkMapperState("thread-1");
    const events = [
      ...mapCursorSdkInteractionUpdate({ type: "text-delta", text: "Hel" }, state),
      ...mapCursorSdkMessage(assistant([{ type: "text", text: "Hel" }]), state),
      ...mapCursorSdkInteractionUpdate({ type: "text-delta", text: "lo" }, state),
      ...mapCursorSdkMessage(assistant([{ type: "text", text: "lo" }]), state),
      ...mapCursorSdkInteractionUpdate(
        { type: "step-completed", stepId: 1, stepDurationMs: 10 },
        state,
      ),
    ];
    expect(started(events, "assistant_message")).toHaveLength(1);
    expect(
      deltas(events, "assistant_text").map(
        (event) => event.type === "content.delta" && event.delta,
      ),
    ).toEqual(["Hel", "lo"]);
    expect(completed(events)).toHaveLength(1);
  });

  it("consumes normalized batching and splitting without repainting raw content", () => {
    const state = createCursorSdkMapperState("thread-1");
    mapCursorSdkInteractionUpdate({ type: "text-delta", text: "Hel" }, state);
    mapCursorSdkInteractionUpdate({ type: "text-delta", text: "lo" }, state);
    expect(mapCursorSdkMessage(assistant([{ type: "text", text: "H" }]), state)).toEqual([]);
    expect(mapCursorSdkMessage(assistant([{ type: "text", text: "ello" }]), state)).toEqual([]);

    mapCursorSdkInteractionUpdate({ type: "text-delta", text: " " }, state);
    mapCursorSdkInteractionUpdate({ type: "text-delta", text: "world" }, state);
    expect(mapCursorSdkMessage(assistant([{ type: "text", text: " world" }]), state)).toEqual([]);
  });

  it("streams thinking and consumes the SDK's delta and completion echoes", () => {
    const state = createCursorSdkMapperState("thread-1");
    const events = [
      ...mapCursorSdkInteractionUpdate({ type: "thinking-delta", text: "Check " }, state),
      ...mapCursorSdkMessage({ type: "thinking", ...envelope, text: "Check " }, state),
      ...mapCursorSdkInteractionUpdate({ type: "thinking-delta", text: "types" }, state),
      ...mapCursorSdkMessage({ type: "thinking", ...envelope, text: "types" }, state),
      ...mapCursorSdkInteractionUpdate(
        { type: "thinking-completed", thinkingDurationMs: 325 },
        state,
      ),
      ...mapCursorSdkMessage(
        {
          type: "thinking",
          ...envelope,
          text: "",
          thinking_duration_ms: 325,
        },
        state,
      ),
    ];
    expect(started(events, "reasoning")).toHaveLength(1);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        payload: { summary: "Check types", durationMs: 325 },
      }),
    );
    expect(completed(events)).toHaveLength(1);
  });

  it("maps normalized-only thinking with duration", () => {
    const state = createCursorSdkMapperState("thread-1");
    const events = [
      ...mapCursorSdkMessage({ type: "thinking", ...envelope, text: "Reason" }, state),
      ...mapCursorSdkMessage({ type: "thinking", ...envelope, text: "ing" }, state),
      ...mapCursorSdkMessage(
        {
          type: "thinking",
          ...envelope,
          text: "",
          thinking_duration_ms: 50,
        },
        state,
      ),
    ];
    expect(events).toMatchObject([
      { type: "item.started", itemType: "reasoning" },
      { type: "content.delta", stream: "reasoning_text", delta: "Reason" },
      { type: "content.delta", stream: "reasoning_text", delta: "ing" },
      { type: "item.updated", payload: { summary: "Reasoning", durationMs: 50 } },
      { type: "item.completed" },
    ]);
  });
});

describe("Cursor SDK canonical mapping — tool lifecycle and payloads", () => {
  it.each([
    ["shell", "command_execution"],
    ["bash_command", "command_execution"],
    ["write", "file_change"],
    ["edit", "file_change"],
    ["delete", "file_change"],
    ["mcp", "mcp_tool_call"],
    ["mcp__github__search", "mcp_tool_call"],
    ["webSearch", "web_search"],
    ["generateImage", "image_view"],
    ["createPlan", "plan"],
    ["updateTodos", "plan"],
    ["task", "tool_call"],
    ["read", "dynamic_tool_call"],
    ["glob", "dynamic_tool_call"],
    ["grep", "dynamic_tool_call"],
    ["ls", "dynamic_tool_call"],
    ["readLints", "dynamic_tool_call"],
    ["semSearch", "dynamic_tool_call"],
    ["recordScreen", "dynamic_tool_call"],
    ["futureTool", "dynamic_tool_call"],
  ] as const)("classifies %s as %s", (name, expected) => {
    expect(classifyCursorSdkTool(name)).toBe(expected);
  });

  it("closes preceding normalized text before an assistant tool_use block", () => {
    const state = createCursorSdkMapperState("thread-1");
    const events = mapCursorSdkMessage(
      assistant([
        { type: "text", text: "I will inspect it." },
        {
          type: "tool_use",
          id: "read-mixed",
          name: "read",
          input: { path: "src/app.ts" },
        },
      ]),
      state,
    );
    const assistantCompletionIndex = events.findIndex((event) => event.type === "item.completed");
    const toolStartIndex = events.findIndex(
      (event) => event.type === "item.started" && event.itemType === "dynamic_tool_call",
    );
    expect(assistantCompletionIndex).toBeGreaterThanOrEqual(0);
    expect(toolStartIndex).toBeGreaterThan(assistantCompletionIndex);
  });

  it("reconciles raw shell partial/output/completion with normalized lifecycle", () => {
    const state = createCursorSdkMapperState("thread-1");
    const start = mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-started",
        callId: "call-shell",
        modelCallId: "model-1",
        toolCall: {
          type: "shell",
          args: { command: "pnpm test", workingDirectory: "/repo" },
        },
      },
      state,
    );
    expect(start[0]).toMatchObject({
      type: "item.started",
      itemType: "command_execution",
      payload: {
        command: "pnpm test",
        cwd: "/repo",
        status: "running",
      },
    });
    const itemId = start[0]?.type === "item.started" ? start[0].itemId : "";

    const partial = mapCursorSdkInteractionUpdate(
      {
        type: "partial-tool-call",
        callId: "call-shell",
        modelCallId: "model-1",
        toolCall: {
          type: "shell",
          args: { command: "pnpm test --run", workingDirectory: "/repo" },
        },
      },
      state,
    );
    expect(started(partial)).toHaveLength(0);
    expect(partial).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId,
        payload: expect.objectContaining({ command: "pnpm test --run" }),
      }),
    );

    expect(
      mapCursorSdkInteractionUpdate(
        {
          type: "shell-output-delta",
          event: { callId: "call-shell", stdout: "ok" },
        },
        state,
      ),
    ).toEqual([
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId,
        stream: "command_output",
        delta: "ok",
      },
    ]);

    const done = mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-completed",
        callId: "call-shell",
        modelCallId: "model-1",
        toolCall: {
          type: "shell",
          args: { command: "pnpm test --run", workingDirectory: "/repo" },
          result: {
            status: "success",
            value: {
              stdout: "ok\n",
              stderr: "",
              exitCode: 0,
              executionTime: 42,
            },
          },
        },
      },
      state,
    );
    expect(deltas(done, "command_output")).toMatchObject([{ type: "content.delta", delta: "\n" }]);
    expect(done).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId,
        payload: expect.objectContaining({
          command: "pnpm test --run",
          status: "success",
          exitCode: 0,
          durationMs: 42,
        }),
      }),
    );
    expect(done.at(-1)).toMatchObject({ type: "item.completed", itemId });

    expect(
      mapCursorSdkMessage(
        toolMessage({
          call_id: "call-shell",
          name: "shell",
          status: "completed",
          args: { command: "pnpm test --run" },
          result: { stdout: "ok\n", exitCode: 0 },
        }),
        state,
      ),
    ).toEqual([]);
  });

  it("maps normalized-only tool start and completion onto one item", () => {
    const state = createCursorSdkMapperState("thread-1");
    const running = mapCursorSdkMessage(
      toolMessage({
        call_id: "read-1",
        name: "read",
        status: "running",
        args: { path: "src/app.ts" },
      }),
      state,
    );
    expect(started(running, "dynamic_tool_call")).toHaveLength(1);
    const itemId = started(running)[0]?.itemId ?? "";
    const done = mapCursorSdkMessage(
      toolMessage({
        call_id: "read-1",
        name: "read",
        status: "completed",
        args: { path: "src/app.ts" },
        result: { content: "source" },
      }),
      state,
    );
    expect(started(done)).toHaveLength(0);
    expect(done).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId,
        payload: expect.objectContaining({ status: "success" }),
      }),
    );
    expect(done.at(-1)).toMatchObject({ type: "item.completed", itemId });
  });

  it("routes shell output without a call id to the latest open command", () => {
    const state = createCursorSdkMapperState("thread-1");
    const running = mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-started",
        callId: "shell-latest",
        modelCallId: "model-1",
        toolCall: { type: "shell", args: { command: "echo ok" } },
      },
      state,
    );
    const itemId = started(running)[0]?.itemId;
    expect(
      mapCursorSdkInteractionUpdate(
        { type: "shell-output-delta", event: { stdout: "ok\n" } },
        state,
      ),
    ).toEqual([
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId,
        stream: "command_output",
        delta: "ok\n",
      },
    ]);
  });

  it("appends repeated and overlapping shell deltas without snapshot deduplication", () => {
    const state = createCursorSdkMapperState("thread-1");
    const running = mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-started",
        callId: "shell-incremental",
        modelCallId: "model-1",
        toolCall: { type: "shell", args: { command: "stream" } },
      },
      state,
    );
    const itemId = started(running)[0]?.itemId;

    const chunks = [".", ".", "foo", "oobar"].flatMap((stdout) =>
      mapCursorSdkInteractionUpdate(
        {
          type: "shell-output-delta",
          event: { callId: "shell-incremental", stdout },
        },
        state,
      ),
    );

    expect(deltas(chunks, "command_output")).toEqual([
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId,
        stream: "command_output",
        delta: ".",
      },
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId,
        stream: "command_output",
        delta: ".",
      },
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId,
        stream: "command_output",
        delta: "foo",
      },
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId,
        stream: "command_output",
        delta: "oobar",
      },
    ]);
  });

  it("does not guess which parallel command owns an uncorrelated shell delta", () => {
    const state = createCursorSdkMapperState("thread-1");
    for (const callId of ["shell-one", "shell-two"]) {
      mapCursorSdkInteractionUpdate(
        {
          type: "tool-call-started",
          callId,
          modelCallId: "model-1",
          toolCall: { type: "shell", args: { command: callId } },
        },
        state,
      );
    }

    expect(
      mapCursorSdkInteractionUpdate(
        { type: "shell-output-delta", event: { stdout: "ambiguous" } },
        state,
      ),
    ).toEqual([]);

    const completedEvents = mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-completed",
        callId: "shell-one",
        modelCallId: "model-1",
        toolCall: {
          type: "shell",
          args: { command: "shell-one" },
          result: { status: "success", value: { stdout: "one\n" } },
        },
      },
      state,
    );
    expect(deltas(completedEvents, "command_output")).toEqual([
      expect.objectContaining({ delta: "one\n" }),
    ]);
  });

  it("reconciles a large rewritten command snapshot without a quadratic scan", () => {
    const state = createCursorSdkMapperState("thread-1");
    mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-started",
        callId: "shell-big",
        modelCallId: "model-1",
        toolCall: { type: "shell", args: { command: "cat big.log" } },
      },
      state,
    );
    const streamed = `${"x".repeat(300_000)}shared-tail`;
    mapCursorSdkInteractionUpdate(
      { type: "shell-output-delta", event: { callId: "shell-big", stdout: streamed } },
      state,
    );

    const startedAt = Date.now();
    const snapshot = `shared-tail${"y".repeat(300_000)}`;
    const events = mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-completed",
        callId: "shell-big",
        modelCallId: "model-1",
        toolCall: {
          type: "shell",
          args: { command: "cat big.log" },
          result: { status: "success", value: { stdout: snapshot } },
        },
      },
      state,
    );

    expect(deltas(events, "command_output")).toEqual([
      expect.objectContaining({ delta: "y".repeat(300_000) }),
    ]);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  it("dedupes assistant tool_use blocks against the tool_call lifecycle", () => {
    const state = createCursorSdkMapperState("thread-1");
    const assistantEvents = mapCursorSdkMessage(
      assistant([
        {
          type: "tool_use",
          id: "read-1",
          name: "read",
          input: { path: "src/app.ts" },
        },
      ]),
      state,
    );
    expect(started(assistantEvents, "dynamic_tool_call")).toHaveLength(1);
    const running = mapCursorSdkMessage(
      toolMessage({
        call_id: "read-1",
        name: "read",
        status: "running",
        args: { path: "src/app.ts" },
      }),
      state,
    );
    expect(started(running)).toHaveLength(0);
  });

  // Diff summaries follow the shared cross-provider normalization: a create
  // reports no removals and a delete reports no additions.
  it.each([
    ["write", "create", { added: 1, removed: 0 }],
    ["edit", "edit", { added: 1, removed: 1 }],
    ["delete", "delete", { added: 0, removed: 1 }],
  ] as const)("maps %s as a %s file change with diff output", (type, changeKind, diffSummary) => {
    const state = createCursorSdkMapperState("thread-1");
    const events = mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-completed",
        callId: `file-${type}`,
        modelCallId: "model-1",
        toolCall: {
          type,
          args: { path: "src/file.ts" },
          result: {
            status: "success",
            value: { diffString: "@@ -1 +1 @@\n-old\n+new" },
          },
        },
      },
      state,
    );
    expect(started(events, "file_change")[0]).toMatchObject({
      payload: {
        path: "src/file.ts",
        changeKind,
      },
    });
    expect(deltas(events, "file_change_output")).toMatchObject([
      { delta: "@@ -1 +1 @@\n-old\n+new" },
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        payload: expect.objectContaining({
          status: "success",
          diffSummary,
        }),
      }),
    );
  });

  it("normalizes updateTodos and createPlan into canonical plan steps", () => {
    const todos = createCursorSdkMapperState("thread-1");
    const todoEvents = mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-started",
        callId: "todos",
        modelCallId: "model-1",
        toolCall: {
          type: "updateTodos",
          args: {
            todos: [
              { content: "Inspect", status: "completed" },
              { content: "Implement", status: "inProgress" },
              { content: "Verify", status: "pending" },
            ],
          },
        },
      },
      todos,
    );
    expect(started(todoEvents, "plan")[0]).toMatchObject({
      payload: {
        steps: [
          { step: "Inspect", status: "completed" },
          { step: "Implement", status: "in_progress" },
          { step: "Verify", status: "pending" },
        ],
      },
    });

    const plan = createCursorSdkMapperState("thread-2");
    const planEvents = mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-started",
        callId: "plan",
        modelCallId: "model-1",
        toolCall: {
          type: "createPlan",
          args: { plan: "# Plan\n- [x] Read\n- [ ] Build" },
        },
      },
      plan,
    );
    expect(started(planEvents, "plan")[0]).toMatchObject({
      payload: {
        steps: [
          { step: "Plan", status: "pending" },
          { step: "Read", status: "completed" },
          { step: "Build", status: "pending" },
        ],
      },
    });
  });

  it("normalizes MCP identity, arguments, and inline result images", () => {
    const state = createCursorSdkMapperState("thread-1");
    const events = mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-completed",
        callId: "mcp-1",
        modelCallId: "model-1",
        toolCall: {
          type: "mcp",
          args: {
            providerIdentifier: "images",
            toolName: "render",
            args: { prompt: "owl" },
          },
          result: {
            status: "success",
            value: {
              content: [{ image: { data: "YWJj", mimeType: "image/webp" } }],
              isError: false,
            },
          },
        },
      },
      state,
    );
    expect(started(events, "mcp_tool_call")[0]).toMatchObject({
      payload: {
        name: "render",
        serverId: "images",
        args: { prompt: "owl" },
        status: "running",
      },
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        payload: expect.objectContaining({
          status: "success",
          images: ["data:image/webp;base64,YWJj"],
        }),
      }),
    );
  });

  it("maps generateImage output to an inline image_view data URL", () => {
    const state = createCursorSdkMapperState("thread-1");
    const events = mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-completed",
        callId: "image-1",
        modelCallId: "model-1",
        toolCall: {
          type: "generateImage",
          args: { description: "owl" },
          result: {
            status: "success",
            value: { filePath: "owl.png", imageData: "YWJj" },
          },
        },
      },
      state,
    );
    expect(started(events, "image_view")).toHaveLength(1);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        payload: expect.objectContaining({
          images: ["data:image/png;base64,YWJj"],
          status: "success",
        }),
      }),
    );
  });

  it("surfaces tool errors as completed error payloads", () => {
    const state = createCursorSdkMapperState("thread-1");
    const events = mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-completed",
        callId: "shell-error",
        modelCallId: "model-1",
        toolCall: {
          type: "shell",
          args: { command: "false" },
          result: { status: "error", error: { message: "exit 1" } },
        },
      },
      state,
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        payload: expect.objectContaining({ status: "error", errorMessage: "exit 1" }),
      }),
    );
    expect(events.at(-1)).toMatchObject({
      type: "item.completed",
      payload: expect.objectContaining({ status: "error" }),
    });
  });

  it("infers a normalized completion error from its wrapped result", () => {
    const state = createCursorSdkMapperState("thread-1");
    const events = mapCursorSdkMessage(
      toolMessage({
        call_id: "normalized-error",
        name: "shell",
        status: "completed",
        args: { command: "false" },
        result: { status: "error", error: { message: "exit 1" } },
      }),
      state,
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        payload: expect.objectContaining({ status: "error", errorMessage: "exit 1" }),
      }),
    );
    expect(events.at(-1)).toMatchObject({
      type: "item.completed",
      payload: expect.objectContaining({ status: "error" }),
    });
  });

  it("treats an MCP success envelope with isError content as a tool error", () => {
    const state = createCursorSdkMapperState("thread-1");
    const events = mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-completed",
        callId: "mcp-content-error",
        modelCallId: "model-1",
        toolCall: {
          type: "mcp",
          args: { providerIdentifier: "github", toolName: "search", args: {} },
          result: {
            status: "success",
            value: { content: [{ text: { text: "failed" } }], isError: true },
          },
        },
      },
      state,
    );
    expect(events.at(-1)).toMatchObject({
      type: "item.completed",
      payload: expect.objectContaining({ status: "error" }),
    });
  });
});

describe("Cursor SDK canonical mapping — nested task updates", () => {
  it("groups nested text, thinking, and tools under one task parent", () => {
    const state = createCursorSdkMapperState("thread-1");
    const parent = mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-started",
        callId: "task-1",
        modelCallId: "model-parent",
        toolCall: {
          type: "task",
          args: { description: "Audit code", model: "composer-2.5" },
        },
      },
      state,
    );
    const parentStarted = started(parent, "tool_call")[0];
    expect(parentStarted).toMatchObject({
      payload: {
        name: "task",
        isSubAgent: true,
        progress: { description: "Audit code", model: "composer-2.5" },
      },
    });
    const parentItemId = parentStarted?.type === "item.started" ? parentStarted.itemId : "";

    const text = mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-delta",
        callId: "task-1",
        modelCallId: "model-parent",
        taskUpdate: { type: "text-delta", text: "Found issue" },
      },
      state,
    );
    expect(started(text, "assistant_message")[0]).toMatchObject({ parentItemId });
    expect(text).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: parentItemId,
        payload: expect.objectContaining({
          progress: expect.objectContaining({ description: "Found issue" }),
        }),
      }),
    );

    const thinking = mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-delta",
        callId: "task-1",
        modelCallId: "model-parent",
        taskUpdate: { type: "thinking-delta", text: "Investigating" },
      },
      state,
    );
    expect(started(thinking, "reasoning")[0]).toMatchObject({ parentItemId });

    const childTool = mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-delta",
        callId: "task-1",
        modelCallId: "model-parent",
        taskUpdate: {
          type: "tool-call-started",
          callId: "read-child",
          modelCallId: "model-child",
          toolCall: { type: "read", args: { path: "src/app.ts" } },
        },
      },
      state,
    );
    expect(started(childTool, "dynamic_tool_call")[0]).toMatchObject({ parentItemId });
    expect(childTool).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: parentItemId,
        payload: expect.objectContaining({
          progress: expect.objectContaining({ lastToolName: "read", stepCount: 1 }),
        }),
      }),
    );

    mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-delta",
        callId: "task-1",
        modelCallId: "model-parent",
        taskUpdate: {
          type: "partial-tool-call",
          callId: "read-child",
          modelCallId: "model-child",
          toolCall: { type: "read", args: { path: "src/app.ts", offset: 10 } },
        },
      },
      state,
    );
    expect(state.toolItems.get("task-1")?.progress?.stepCount).toBe(1);

    const stepDone = mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-delta",
        callId: "task-1",
        modelCallId: "model-parent",
        taskUpdate: { type: "step-completed", stepId: 1, stepDurationMs: 25 },
      },
      state,
    );
    expect(completed(stepDone)).toHaveLength(2);

    const parentDone = mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-completed",
        callId: "task-1",
        modelCallId: "model-parent",
        toolCall: {
          type: "task",
          args: { description: "Audit code", model: "composer-2.5" },
          result: {
            status: "success",
            value: { durationMs: 100, resultSuffix: "Done" },
          },
        },
      },
      state,
    );
    // The still-open child tool is closed before its parent.
    expect(completed(parentDone).length).toBeGreaterThanOrEqual(2);
    expect(parentDone).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: parentItemId,
        payload: expect.objectContaining({
          progress: expect.objectContaining({ summary: "Done", durationMs: 100 }),
        }),
      }),
    );
    expect(parentDone.at(-1)).toMatchObject({ type: "item.completed", itemId: parentItemId });
  });

  it("synthesizes a task parent when a nested delta arrives before tool start", () => {
    const state = createCursorSdkMapperState("thread-1");
    const events = mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-delta",
        callId: "task-late",
        modelCallId: "model-parent",
        taskUpdate: { type: "text-delta", text: "Working" },
      },
      state,
    );
    const parent = started(events, "tool_call")[0];
    expect(parent).toMatchObject({
      payload: expect.objectContaining({ isSubAgent: true, status: "running" }),
    });
    const parentItemId = parent?.type === "item.started" ? parent.itemId : "";
    expect(started(events, "assistant_message")[0]).toMatchObject({ parentItemId });
  });

  it("ignores a late nested delta after its parent task completed", () => {
    const state = createCursorSdkMapperState("thread-1");
    mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-completed",
        callId: "task-finished",
        modelCallId: "model-parent",
        toolCall: {
          type: "task",
          args: { description: "Done" },
          result: { status: "success", value: { resultSuffix: "Done", isBackground: false } },
        },
      },
      state,
    );
    expect(
      mapCursorSdkInteractionUpdate(
        {
          type: "tool-call-delta",
          callId: "task-finished",
          modelCallId: "model-parent",
          taskUpdate: { type: "text-delta", text: "late" },
        },
        state,
      ),
    ).toEqual([]);
  });
});

describe("Cursor SDK canonical mapping — auxiliary updates and usage", () => {
  it("maps summary snapshots into one reasoning item", () => {
    const state = createCursorSdkMapperState("thread-1");
    const events = [
      ...mapCursorSdkInteractionUpdate({ type: "summary-started" }, state),
      ...mapCursorSdkInteractionUpdate({ type: "summary", summary: "First" }, state),
      ...mapCursorSdkMessage({ type: "task", ...envelope, text: "First" }, state),
      ...mapCursorSdkInteractionUpdate({ type: "summary", summary: "First" }, state),
      ...mapCursorSdkMessage({ type: "task", ...envelope, text: "First" }, state),
      ...mapCursorSdkInteractionUpdate({ type: "summary", summary: "Final" }, state),
      ...mapCursorSdkMessage({ type: "task", ...envelope, text: "Final" }, state),
      ...mapCursorSdkInteractionUpdate({ type: "summary-completed" }, state),
    ];
    expect(started(events, "reasoning")).toHaveLength(1);
    expect(events.filter((event) => event.type === "item.updated")).toMatchObject([
      { payload: { summary: "First" } },
      { payload: { summary: "Final" } },
    ]);
    expect(completed(events)).toHaveLength(1);
  });

  it("maps task milestones into one reasoning item and closes terminal status", () => {
    const state = createCursorSdkMapperState("thread-1");
    const first = mapCursorSdkMessage(
      { type: "task", ...envelope, status: "running", text: "Reviewing" },
      state,
    );
    const done = mapCursorSdkMessage(
      { type: "task", ...envelope, status: "completed", text: "Reviewed" },
      state,
    );
    expect(started(first, "reasoning")).toHaveLength(1);
    expect(done).toMatchObject([
      { type: "item.updated", payload: { summary: "Reviewed" } },
      { type: "item.completed" },
    ]);
  });

  it("dedupes repeated statusless task summaries from the normalized fallback", () => {
    const state = createCursorSdkMapperState("thread-1");
    const first = mapCursorSdkMessage(
      { type: "task", ...envelope, text: "Compacting context" },
      state,
    );
    expect(started(first, "reasoning")).toHaveLength(1);
    expect(
      mapCursorSdkMessage({ type: "task", ...envelope, text: "Compacting context" }, state),
    ).toEqual([]);
  });

  it("deliberately ignores SDK request events because no response API exists", () => {
    const state = createCursorSdkMapperState("thread-1");
    const events = mapCursorSdkMessage(
      { type: "request", ...envelope, request_id: "request-1" },
      state,
    );
    expect(events).toEqual([]);
  });

  it("ignores token-delta because final usage is authoritative", () => {
    const state = createCursorSdkMapperState("thread-1");
    expect(mapCursorSdkInteractionUpdate({ type: "token-delta", tokens: 32 }, state)).toEqual([]);
  });

  it("maps raw turn usage to spend without claiming context-window occupancy", () => {
    const state = createCursorSdkMapperState("thread-1");
    startCursorSdkTurn(state, "turn-1");
    state.agentId = "agent-1";
    state.currentRunId = "run-1";
    state.model = "composer-2.5";
    const events = mapCursorSdkInteractionUpdate(
      {
        type: "turn-ended",
        usage: {
          inputTokens: 100,
          outputTokens: 25,
          cacheReadTokens: 10,
          cacheWriteTokens: 5,
          reasoningTokens: 7,
        },
      },
      state,
    );
    expect(events).toMatchObject([
      {
        type: "usage.spent",
        usage: {
          counterKind: "per-call",
          counter: 140,
          scopeId: "agent-1",
          sampleId: "run-1:turn-1",
          turnId: "turn-1",
          model: "composer-2.5",
        },
      },
    ]);
    expectCanonical(events);
  });

  it("dedupes the normalized usage message that follows an identical raw update", () => {
    const state = createCursorSdkMapperState("thread-1");
    const usage = {
      inputTokens: 10,
      outputTokens: 3,
      cacheReadTokens: 2,
      cacheWriteTokens: 1,
      reasoningTokens: 1,
    };
    expect(mapCursorSdkInteractionUpdate({ type: "turn-ended", usage }, state)).toHaveLength(1);
    expect(
      mapCursorSdkMessage(
        { type: "usage", ...envelope, usage: { ...usage, totalTokens: 16 } },
        state,
      ),
    ).toEqual([]);
  });

  it("dedupes the raw usage update that follows an identical normalized message", () => {
    const state = createCursorSdkMapperState("thread-1");
    const usage = {
      inputTokens: 10,
      outputTokens: 3,
      cacheReadTokens: 2,
      cacheWriteTokens: 1,
      reasoningTokens: 1,
    };
    expect(
      mapCursorSdkMessage(
        { type: "usage", ...envelope, usage: { ...usage, totalTokens: 16 } },
        state,
      ),
    ).toHaveLength(1);
    expect(mapCursorSdkInteractionUpdate({ type: "turn-ended", usage }, state)).toEqual([]);
  });

  it("maps distinct normalized per-turn usage samples independently", () => {
    const state = createCursorSdkMapperState("thread-1");
    const first = mapCursorSdkMessage(
      {
        type: "usage",
        ...envelope,
        usage: {
          inputTokens: 10,
          outputTokens: 2,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 12,
        },
      },
      state,
    );
    const second = mapCursorSdkMessage(
      {
        type: "usage",
        ...envelope,
        usage: {
          inputTokens: 20,
          outputTokens: 4,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 24,
        },
      },
      state,
    );
    expect(first.find((event) => event.type === "usage.spent")).toMatchObject({
      usage: { counter: 12, sampleId: "run-1:turn-1" },
    });
    expect(second.find((event) => event.type === "usage.spent")).toMatchObject({
      usage: { counter: 24, sampleId: "run-1:turn-2" },
    });
  });

  it("uses cumulative RunResult usage only as a no-stream fallback", () => {
    const state = createCursorSdkMapperState("thread-1");
    startCursorSdkTurn(state, "turn-1");
    const events = mapCursorSdkRunResult(
      {
        id: "run-fallback",
        status: "finished",
        model: { id: "composer-2.5" },
        usage: {
          inputTokens: 50,
          outputTokens: 10,
          cacheReadTokens: 5,
          cacheWriteTokens: 0,
          totalTokens: 65,
        },
      },
      state,
    );
    expect(events.find((event) => event.type === "usage.spent")).toMatchObject({
      usage: {
        counter: 65,
        sampleId: "run-fallback:turn-1",
        model: "composer-2.5",
      },
    });
    expect(events.some((event) => event.type === "context.updated")).toBe(false);
    expect(events.at(-1)).toEqual({
      type: "turn.completed",
      threadId: "thread-1",
      turnId: "turn-1",
      state: "completed",
    });

    const streamed = createCursorSdkMapperState("thread-2");
    mapCursorSdkMessage(
      {
        type: "usage",
        ...envelope,
        usage: {
          inputTokens: 5,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 6,
        },
      },
      streamed,
    );
    const result = mapCursorSdkRunResult(
      {
        id: "run-1",
        status: "finished",
        usage: {
          inputTokens: 50,
          outputTokens: 10,
          cacheReadTokens: 5,
          cacheWriteTokens: 0,
          totalTokens: 65,
        },
      },
      streamed,
    );
    expect(result.filter((event) => event.type === "usage.spent")).toEqual([]);
  });

  it("resets result-usage fallback accounting for each Poracode turn", () => {
    const state = createCursorSdkMapperState("thread-1");
    startCursorSdkTurn(state, "turn-1");
    const first = mapCursorSdkRunResult(
      {
        id: "run-1",
        status: "finished",
        usage: {
          inputTokens: 4,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 5,
        },
      },
      state,
    );
    expect(first.filter((event) => event.type === "usage.spent")).toHaveLength(1);

    startCursorSdkTurn(state, "turn-2");
    const second = mapCursorSdkRunResult(
      {
        id: "run-2",
        status: "finished",
        usage: {
          inputTokens: 8,
          outputTokens: 2,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 10,
        },
      },
      state,
    );
    expect(second.find((event) => event.type === "usage.spent")).toMatchObject({
      usage: { counter: 10, sampleId: "run-2:turn-1", turnId: "turn-2" },
    });
  });
});

describe("Cursor SDK canonical mapping — terminal outcomes and cleanup", () => {
  it("uses the RunResult text only when no assistant stream output arrived", () => {
    const fallback = createCursorSdkMapperState("thread-1");
    startCursorSdkTurn(fallback, "turn-1");
    const fallbackEvents = mapCursorSdkRunResult(
      { id: "run-1", status: "finished", result: "fallback answer" },
      fallback,
    );
    expect(deltas(fallbackEvents, "assistant_text")).toEqual([
      expect.objectContaining({ delta: "fallback answer" }),
    ]);
    expect(fallbackEvents.at(-1)).toMatchObject({
      type: "turn.completed",
      state: "completed",
    });

    const streamed = createCursorSdkMapperState("thread-2");
    startCursorSdkTurn(streamed, "turn-2");
    mapCursorSdkInteractionUpdate({ type: "text-delta", text: "streamed answer" }, streamed);
    const resultEvents = mapCursorSdkRunResult(
      { id: "run-2", status: "finished", result: "streamed answer" },
      streamed,
    );
    expect(deltas(resultEvents, "assistant_text")).toEqual([]);
  });

  it("maps a successful status and ignores the duplicate RunResult terminal", () => {
    const state = createCursorSdkMapperState("thread-1");
    startCursorSdkTurn(state, "turn-1");
    expect(mapCursorSdkMessage({ type: "status", ...envelope, status: "RUNNING" }, state)).toEqual(
      [],
    );
    expect(mapCursorSdkMessage({ type: "status", ...envelope, status: "FINISHED" }, state)).toEqual(
      [
        {
          type: "turn.completed",
          threadId: "thread-1",
          turnId: "turn-1",
          state: "completed",
        },
      ],
    );
    expect(mapCursorSdkRunResult({ id: "run-1", status: "finished" }, state)).toEqual([]);
  });

  it("maps errors and expired runs to failed exactly once", () => {
    const state = createCursorSdkMapperState("thread-1");
    startCursorSdkTurn(state, "turn-1");
    const events = mapCursorSdkMessage(
      { type: "status", ...envelope, status: "ERROR", message: "API failed" },
      state,
    );
    expect(events).toEqual([
      { type: "error", threadId: "thread-1", message: "API failed" },
      {
        type: "turn.completed",
        threadId: "thread-1",
        turnId: "turn-1",
        state: "failed",
      },
    ]);
    expect(
      mapCursorSdkRunResult(
        { id: "run-1", status: "error", error: { message: "API failed" } },
        state,
      ),
    ).toEqual([]);

    const expired = createCursorSdkMapperState("thread-2");
    expect(
      mapCursorSdkMessage(
        {
          type: "status",
          agent_id: "agent-2",
          run_id: "run-expired",
          status: "EXPIRED",
        },
        expired,
      ),
    ).toMatchObject([
      { type: "error", message: "EXPIRED" },
      { type: "turn.completed", turnId: "run-expired", state: "failed" },
    ]);
  });

  it("allows the same failure message to be reported again on a later turn", () => {
    const state = createCursorSdkMapperState("thread-1");
    startCursorSdkTurn(state, "turn-1");
    expect(
      mapCursorSdkMessage(
        { type: "status", ...envelope, status: "ERROR", message: "API failed" },
        state,
      ).filter((event) => event.type === "error"),
    ).toHaveLength(1);

    startCursorSdkTurn(state, "turn-2");
    expect(
      mapCursorSdkMessage(
        {
          type: "status",
          agent_id: "agent-1",
          run_id: "run-2",
          status: "ERROR",
          message: "API failed",
        },
        state,
      ).filter((event) => event.type === "error"),
    ).toHaveLength(1);
  });

  it("maps cancellation and closes every open item before turn completion", () => {
    const state = createCursorSdkMapperState("thread-1");
    startCursorSdkTurn(state, "turn-1");
    const beforeTerminal = [
      ...mapCursorSdkInteractionUpdate({ type: "text-delta", text: "partial" }, state),
      ...mapCursorSdkInteractionUpdate(
        {
          type: "tool-call-started",
          callId: "read-1",
          modelCallId: "model-1",
          toolCall: { type: "read", args: { path: "src/app.ts" } },
        },
        state,
      ),
    ];
    const events = mapCursorSdkRunResult({ id: "run-1", status: "cancelled" }, state);
    expect(completed([...beforeTerminal, ...events])).toHaveLength(2);
    expect(completed(events)).toHaveLength(1);
    expect(events.at(-1)).toEqual({
      type: "turn.completed",
      threadId: "thread-1",
      turnId: "turn-1",
      state: "cancelled",
    });
  });

  it("closes open items idempotently during disposal", () => {
    const state = createCursorSdkMapperState("thread-1");
    mapCursorSdkInteractionUpdate({ type: "text-delta", text: "partial" }, state);
    mapCursorSdkInteractionUpdate({ type: "thinking-delta", text: "reason" }, state);
    mapCursorSdkInteractionUpdate({ type: "summary-started" }, state);
    mapCursorSdkMessage({ type: "task", ...envelope, status: "running", text: "Working" }, state);
    mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-started",
        callId: "read-1",
        modelCallId: "model-1",
        toolCall: { type: "read", args: { path: "src/app.ts" } },
      },
      state,
    );
    const close = closeCursorSdkOpenItems(state);
    expect(completed(close)).toHaveLength(3);
    expect(closeCursorSdkOpenItems(state)).toEqual([]);
    expectCanonical(close);
  });

  it("closes nested tools before their parent and blocks late normalized reopens", () => {
    const state = createCursorSdkMapperState("thread-1");
    const parentEvents = mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-started",
        callId: "task-open",
        modelCallId: "model-parent",
        toolCall: { type: "task", args: { description: "Inspect" } },
      },
      state,
    );
    const parentItemId = started(parentEvents, "tool_call")[0]?.itemId;
    const childEvents = mapCursorSdkInteractionUpdate(
      {
        type: "tool-call-delta",
        callId: "task-open",
        modelCallId: "model-parent",
        taskUpdate: {
          type: "tool-call-started",
          callId: "read-open",
          modelCallId: "model-child",
          toolCall: { type: "read", args: { path: "src/app.ts" } },
        },
      },
      state,
    );
    const childItemId = started(childEvents, "dynamic_tool_call")[0]?.itemId;
    const close = closeCursorSdkOpenItems(state);
    expect(completed(close).map((event) => event.itemId)).toEqual([childItemId, parentItemId]);
    expect(
      mapCursorSdkMessage(
        toolMessage({
          call_id: "task-open",
          name: "task",
          status: "completed",
          result: { status: "success", value: {} },
        }),
        state,
      ),
    ).toEqual([]);
  });
});
