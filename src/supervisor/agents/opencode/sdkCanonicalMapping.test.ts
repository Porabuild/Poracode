import { describe, expect, it } from "vitest";
import type { AssistantMessage, Event, Session, ToolPart, UserMessage } from "@opencode-ai/sdk/v2";
import {
  closeOpenItems,
  createOpenCodeMapperState,
  mapOpenCodeEvent,
  setOpenCodeMainSessionId,
} from "./sdkCanonicalMapping";

function assistantMessage(id: string, overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    id,
    sessionID: "ses_test",
    role: "assistant",
    parentID: "msg_user",
    mode: "build",
    agent: "build",
    path: { cwd: "/", root: "/" },
    cost: 0,
    tokens: {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
    modelID: "big-pickle",
    providerID: "opencode",
    time: { created: 0 },
    ...overrides,
  };
}

function userMessage(id: string, overrides: Partial<UserMessage> = {}): UserMessage {
  return {
    id,
    sessionID: "ses_test",
    role: "user",
    agent: "build",
    model: { providerID: "test", modelID: "test" },
    time: { created: 0 },
    ...overrides,
  };
}

function messageUpdatedEvent(info: AssistantMessage | UserMessage): Event {
  return {
    id: "evt-" + Math.random().toString(36).slice(2),
    type: "message.updated",
    properties: {
      sessionID: "ses_test",
      info,
    },
  };
}

function toolPartUpdatedEvent(part: ToolPart): Event {
  return {
    id: "evt-" + Math.random().toString(36).slice(2),
    type: "message.part.updated",
    properties: {
      sessionID: "ses_test",
      time: 0,
      part,
    },
  };
}

function deltaEvent(messageID: string, partID: string, delta: string): Event {
  return {
    id: "evt-" + Math.random().toString(36).slice(2),
    type: "message.part.delta",
    properties: {
      sessionID: "ses_test",
      messageID,
      partID,
      field: "text",
      delta,
    },
  };
}

function partUpdatedTextEvent(messageID: string, partID: string, text: string): Event {
  return {
    id: "evt-" + Math.random().toString(36).slice(2),
    type: "message.part.updated",
    properties: {
      sessionID: "ses_test",
      time: Date.now(),
      part: {
        id: partID,
        sessionID: "ses_test",
        messageID,
        type: "text",
        text,
      },
    },
  };
}

describe("sdkCanonicalMapping — text streaming", () => {
  it("opens an assistant item on the first delta and emits content.delta", () => {
    const state = createOpenCodeMapperState("thread-1");
    const events = mapOpenCodeEvent(deltaEvent("msg_1", "prt_1", "Hello"), state);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "item.started",
      threadId: "thread-1",
      itemType: "assistant_message",
    });
    expect(events[1]).toMatchObject({
      type: "content.delta",
      threadId: "thread-1",
      stream: "assistant_text",
      delta: "Hello",
    });
  });

  it("appends subsequent deltas to the same assistant item", () => {
    const state = createOpenCodeMapperState("thread-1");
    mapOpenCodeEvent(deltaEvent("msg_1", "prt_1", "Hel"), state);
    const second = mapOpenCodeEvent(deltaEvent("msg_1", "prt_1", "lo"), state);
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({
      type: "content.delta",
      delta: "lo",
    });
  });

  it("dedupes interleaved snapshot using suffixPrefixOverlap", () => {
    const state = createOpenCodeMapperState("thread-1");
    // Stream "Hello " via deltas.
    mapOpenCodeEvent(deltaEvent("msg_1", "prt_1", "Hel"), state);
    mapOpenCodeEvent(deltaEvent("msg_1", "prt_1", "lo "), state);

    // Snapshot arrives with the full text so far. Should NOT re-emit "Hello ".
    const snap = mapOpenCodeEvent(partUpdatedTextEvent("msg_1", "prt_1", "Hello "), state);
    expect(snap).toEqual([]);

    // Snapshot extends to "Hello world" — emit only " world" as the new tail.
    const ext = mapOpenCodeEvent(partUpdatedTextEvent("msg_1", "prt_1", "Hello world"), state);
    expect(ext).toHaveLength(1);
    expect(ext[0]).toMatchObject({
      type: "content.delta",
      delta: "world",
    });
  });

  it("treats parts on different message ids as different assistant items", () => {
    const state = createOpenCodeMapperState("thread-1");
    const a = mapOpenCodeEvent(deltaEvent("msg_a", "prt_1", "A"), state);
    const b = mapOpenCodeEvent(deltaEvent("msg_b", "prt_1", "B"), state);
    const aItemId = a.find((e) => e.type === "item.started")?.itemId;
    const bItemId = b.find((e) => e.type === "item.started")?.itemId;
    expect(aItemId).toBeDefined();
    expect(bItemId).toBeDefined();
    expect(aItemId).not.toBe(bItemId);
  });

  it("maps message token buckets into context usage", () => {
    const state = createOpenCodeMapperState("thread-1");
    const events = mapOpenCodeEvent(
      messageUpdatedEvent(
        assistantMessage("msg_asst", {
          tokens: {
            input: 60_000,
            output: 8_000,
            reasoning: 2_000,
            cache: { read: 1_000, write: 500 },
          },
        }),
      ),
      state,
    );

    expect(events[0]).toEqual({
      type: "context.updated",
      threadId: "thread-1",
      usage: {
        usedTokens: 71_500,
        breakdown: [
          { id: "input", label: "Input", tokens: 60_000 },
          { id: "output", label: "Output", tokens: 8_000 },
          { id: "reasoning", label: "Reasoning", tokens: 2_000 },
          { id: "cache-read", label: "Cache read", tokens: 1_000 },
          { id: "cache-write", label: "Cache write", tokens: 500 },
        ],
      },
    });
  });
});

describe("sdkCanonicalMapping — permission/question events", () => {
  it("maps permission.asked → request.opened with command_execution_approval", () => {
    const state = createOpenCodeMapperState("thread-1");
    const events = mapOpenCodeEvent(
      {
        id: "evt-x",
        type: "permission.asked",
        properties: {
          id: "perm_1",
          sessionID: "ses_test",
          permission: "bash",
          patterns: ["rm -rf /tmp"],
          metadata: {},
          always: [],
        },
      },
      state,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "request.opened",
      requestId: "opencode-perm-perm_1",
      requestType: "command_execution_approval",
      payload: {
        summary: "Permission required",
        details: {
          toolName: "bash",
          displayName: "target",
          decisionReason: "OpenCode wants to run a command.",
          input: { command: "rm -rf /tmp" },
        },
        options: [
          { optionId: "reject", label: "Deny" },
          { optionId: "once", label: "Allow" },
        ],
      },
    });
  });

  it("keeps OpenCode tool-name permissions as approvals", () => {
    const state = createOpenCodeMapperState("thread-1");
    const events = mapOpenCodeEvent(
      {
        id: "evt-x",
        type: "permission.asked",
        properties: {
          id: "perm_1",
          sessionID: "ses_test",
          permission: "grep",
          patterns: ["TERM_PROGRAM"],
          metadata: { target: "TERM_PROGRAM" },
          always: [],
        },
      },
      state,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "request.opened",
      requestId: "opencode-perm-perm_1",
      requestType: "command_execution_approval",
      payload: {
        summary: "Permission required",
        details: {
          toolName: "grep",
          displayName: "target",
          decisionReason: "OpenCode wants to use grep.",
          input: { command: "TERM_PROGRAM" },
        },
        options: [
          { optionId: "reject", label: "Deny" },
          { optionId: "once", label: "Allow" },
        ],
      },
    });
  });

  it("maps question.asked → request.opened with multiSelect aggregation", () => {
    const state = createOpenCodeMapperState("thread-1");
    const events = mapOpenCodeEvent(
      {
        id: "evt-x",
        type: "question.asked",
        properties: {
          id: "q_1",
          sessionID: "ses_test",
          questions: [
            {
              question: "Pick frameworks",
              header: "Frameworks",
              multiple: true,
              options: [
                { label: "React", description: "UI lib" },
                { label: "Vue", description: "Reactive" },
              ],
            },
          ],
        },
      },
      state,
    );
    expect(events).toHaveLength(1);
    const ev = events[0];
    if (ev?.type !== "request.opened") throw new Error("unexpected event");
    expect(ev.requestId).toBe("opencode-q-q_1");
    expect(ev.requestType).toBe("tool_user_input");
    expect(ev.payload.multiSelect).toBe(true);
    expect(ev.payload.details).toEqual({
      userInputForm: {
        questions: [
          {
            id: "q0",
            question: "Pick frameworks",
            header: "Frameworks",
            options: [
              { optionId: "q0.0", label: "React", description: "UI lib" },
              { optionId: "q0.1", label: "Vue", description: "Reactive" },
            ],
            multiSelect: true,
          },
        ],
      },
    });
    expect(ev.payload.options).toHaveLength(2);
    expect(ev.payload.options?.[0]?.label).toBe("React");
  });

  it("maps multi-question question.asked to a structured user input form", () => {
    const state = createOpenCodeMapperState("thread-1");
    const events = mapOpenCodeEvent(
      {
        id: "evt-x",
        type: "question.asked",
        properties: {
          id: "q_2",
          sessionID: "ses_test",
          questions: [
            {
              question: "Which scope?",
              header: "Scope",
              options: [
                { label: "Scope A", description: "Minimal" },
                { label: "Scope B", description: "App only" },
              ],
            },
            {
              question: "Which validation?",
              header: "Validation",
              options: [{ label: "After each phase", description: "Incremental" }],
            },
          ],
        },
      },
      state,
    );
    expect(events).toHaveLength(1);
    const ev = events[0];
    if (ev?.type !== "request.opened") throw new Error("unexpected event");
    expect(ev.requestId).toBe("opencode-q-q_2");
    expect(ev.requestType).toBe("tool_user_input");
    expect(ev.payload.options).toBeUndefined();
    expect(ev.payload.details).toEqual({
      userInputForm: {
        questions: [
          {
            id: "q0",
            question: "Which scope?",
            header: "Scope",
            options: [
              { optionId: "q0.0", label: "Scope A", description: "Minimal" },
              { optionId: "q0.1", label: "Scope B", description: "App only" },
            ],
          },
          {
            id: "q1",
            question: "Which validation?",
            header: "Validation",
            options: [{ optionId: "q1.0", label: "After each phase", description: "Incremental" }],
          },
        ],
      },
    });
  });
});

describe("sdkCanonicalMapping — todowrite → plan", () => {
  it("classifies `todowrite` as a plan item and extracts steps from input.todos", () => {
    // OpenCode's todowrite tool mirrors Claude's: `{ todos: [{ content, status,
    // priority }] }`. The mapper must surface this as a canonical `plan` item
    // so ThreadTodoDock picks it up instead of rendering a generic accordion.
    const state = createOpenCodeMapperState("thread-1");
    const events = mapOpenCodeEvent(
      toolPartUpdatedEvent({
        id: "prt_todo_1",
        sessionID: "ses_test",
        messageID: "msg_1",
        type: "tool",
        tool: "todowrite",
        callID: "call_todo_1",
        state: {
          status: "running",
          input: {
            todos: [
              { content: "First task", status: "in_progress", priority: "high" },
              { content: "Second task", status: "pending", priority: "high" },
              { content: "Third task", status: "completed", priority: "medium" },
            ],
          },
          time: { start: 0 },
        },
      }),
      state,
    );
    const started = events.find((e) => e.type === "item.started");
    if (started?.type !== "item.started") throw new Error("expected item.started");
    expect(started.itemType).toBe("plan");
    expect(started.payload).toEqual({
      steps: [
        { step: "First task", status: "in_progress" },
        { step: "Second task", status: "pending" },
        { step: "Third task", status: "completed" },
      ],
    });
  });

  it("treats unknown statuses as pending and falls back to 'Task' for empty content", () => {
    const state = createOpenCodeMapperState("thread-1");
    const events = mapOpenCodeEvent(
      toolPartUpdatedEvent({
        id: "prt_todo_2",
        sessionID: "ses_test",
        messageID: "msg_2",
        type: "tool",
        tool: "todowrite",
        callID: "call_todo_2",
        state: {
          status: "running",
          input: {
            todos: [
              { content: "   ", status: "weird-unknown" },
              { content: "Real one", status: "in_progress" },
            ],
          },
          time: { start: 0 },
        },
      }),
      state,
    );
    const started = events.find((e) => e.type === "item.started");
    if (started?.type !== "item.started") throw new Error("expected item.started");
    expect(started.payload).toEqual({
      steps: [
        { step: "Task", status: "pending" },
        { step: "Real one", status: "in_progress" },
      ],
    });
  });
});

describe("sdkCanonicalMapping — tool parts", () => {
  it("classifies bash tool as command_execution and emits item.started", () => {
    const state = createOpenCodeMapperState("thread-1");
    const events = mapOpenCodeEvent(
      toolPartUpdatedEvent({
        id: "prt_tool_1",
        sessionID: "ses_test",
        messageID: "msg_1",
        type: "tool",
        tool: "bash",
        callID: "call_1",
        state: {
          status: "running",
          input: { command: "ls /" },
          time: { start: 0 },
        },
      }),
      state,
    );
    expect(events.find((e) => e.type === "item.started")).toMatchObject({
      itemType: "command_execution",
    });
  });

  it("maps lowercase read tools to categorized ACP-shaped tool calls", () => {
    const state = createOpenCodeMapperState("thread-1");
    const events = mapOpenCodeEvent(
      toolPartUpdatedEvent({
        id: "prt_read",
        sessionID: "ses_test",
        messageID: "msg_1",
        type: "tool",
        tool: "read",
        callID: "call_read",
        state: {
          status: "running",
          input: { filePath: "/repo/package.json" },
          time: { start: 0 },
        },
      }),
      state,
    );

    expect(events.find((e) => e.type === "item.started")).toMatchObject({
      itemType: "tool_call",
      payload: {
        name: "/repo/package.json",
        title: "/repo/package.json",
        kind: "read",
        locations: [{ path: "/repo/package.json" }],
        args: { filePath: "/repo/package.json" },
        status: "running",
      },
    });
  });

  it("maps view tools to categorized read tool calls", () => {
    const state = createOpenCodeMapperState("thread-1");
    const events = mapOpenCodeEvent(
      toolPartUpdatedEvent({
        id: "prt_view",
        sessionID: "ses_test",
        messageID: "msg_1",
        type: "tool",
        tool: "view",
        callID: "call_view",
        state: {
          status: "running",
          input: { path: "src/foo.ts" },
          time: { start: 0 },
        },
      }),
      state,
    );

    expect(events.find((e) => e.type === "item.started")).toMatchObject({
      itemType: "tool_call",
      payload: {
        name: "src/foo.ts",
        title: "src/foo.ts",
        kind: "read",
        locations: [{ path: "src/foo.ts" }],
        args: { path: "src/foo.ts" },
        status: "running",
      },
    });
  });

  it("maps grep/glob-style tools to categorized search tool calls", () => {
    const state = createOpenCodeMapperState("thread-1");
    const events = mapOpenCodeEvent(
      toolPartUpdatedEvent({
        id: "prt_grep",
        sessionID: "ses_test",
        messageID: "msg_1",
        type: "tool",
        tool: "grep",
        callID: "call_grep",
        state: {
          status: "running",
          input: { pattern: "packageManager", path: "package.json" },
          time: { start: 0 },
        },
      }),
      state,
    );

    expect(events.find((e) => e.type === "item.started")).toMatchObject({
      itemType: "tool_call",
      payload: {
        kind: "search",
        title: '"packageManager" in package.json',
        locations: [{ path: "package.json" }],
        args: { pattern: "packageManager", path: "package.json" },
        status: "running",
      },
    });
  });

  it("maps OpenCode local search tools as canonical search tool calls", () => {
    const state = createOpenCodeMapperState("thread-1");
    const args = {
      pattern: String.raw`\"document\"|\"image\"|\"other\"`,
      include: "*.ts",
      path: "/repo/src",
    };
    const events = mapOpenCodeEvent(
      toolPartUpdatedEvent({
        id: "prt_search",
        sessionID: "ses_test",
        messageID: "msg_1",
        type: "tool",
        tool: "search",
        callID: "call_search",
        state: {
          status: "running",
          input: args,
          time: { start: 0 },
        },
      }),
      state,
    );

    expect(events.find((e) => e.type === "item.started")).toMatchObject({
      itemType: "tool_call",
      payload: {
        kind: "search",
        title: `"${args.pattern}" in /repo/src`,
        locations: [{ path: "/repo/src" }],
        args,
        status: "running",
      },
    });
  });

  it("maps OpenCode task tools to sub-agent tool calls", () => {
    const state = createOpenCodeMapperState("thread-1");
    const events = mapOpenCodeEvent(
      toolPartUpdatedEvent({
        id: "prt_task",
        sessionID: "ses_test",
        messageID: "msg_1",
        type: "tool",
        tool: "task",
        callID: "call_task",
        state: {
          status: "running",
          input: { description: "Audit mapper parity", prompt: "Check OpenCode mapping" },
          time: { start: 0 },
        },
      }),
      state,
    );

    expect(events.find((e) => e.type === "item.started")).toMatchObject({
      itemType: "tool_call",
      payload: {
        name: "Agent",
        title: "Audit mapper parity",
        isSubAgent: true,
        args: { description: "Audit mapper parity", prompt: "Check OpenCode mapping" },
        status: "running",
      },
    });
  });

  it("counts child-session tool parts as subagent progress.stepCount", () => {
    const state = createOpenCodeMapperState("thread-1");
    setOpenCodeMainSessionId(state, "ses_main");

    // Parent task tool starts.
    const started = mapOpenCodeEvent(
      {
        id: "evt-1",
        type: "message.part.updated",
        properties: {
          sessionID: "ses_main",
          time: 0,
          part: {
            id: "prt_task",
            sessionID: "ses_main",
            messageID: "msg_assistant",
            type: "tool",
            tool: "task",
            callID: "call_task",
            state: {
              status: "running",
              input: { description: "Explore code" },
              time: { start: 0 },
            },
          } as ToolPart,
        },
      },
      state,
    );
    const startEvent = started.find((e) => e.type === "item.started");
    expect(startEvent).toBeDefined();
    const taskItemId = (startEvent as { itemId: string }).itemId;

    // Child session is created with parentID === main session.
    const childSession: Session = {
      id: "ses_child",
      slug: "child",
      projectID: "proj",
      directory: "/",
      parentID: "ses_main",
      title: "subagent",
      version: "1.0.0",
      time: { created: 1, updated: 1 },
    };
    const sessionCreated = mapOpenCodeEvent(
      {
        id: "evt-2",
        type: "session.created",
        properties: { sessionID: "ses_child", info: childSession },
      },
      state,
    );
    expect(sessionCreated).toHaveLength(0);

    // Two distinct tool parts in the child session → stepCount = 2.
    const step1 = mapOpenCodeEvent(
      {
        id: "evt-3",
        type: "message.part.updated",
        properties: {
          sessionID: "ses_child",
          time: 0,
          part: {
            id: "prt_child_read",
            sessionID: "ses_child",
            messageID: "msg_child_1",
            type: "tool",
            tool: "read",
            callID: "call_read",
            state: { status: "running", input: { filePath: "a.ts" }, time: { start: 0 } },
          } as ToolPart,
        },
      },
      state,
    );
    expect(step1.find((e) => e.type === "item.updated" && e.itemId === taskItemId)).toMatchObject({
      type: "item.updated",
      itemId: taskItemId,
      payload: {
        isSubAgent: true,
        progress: { stepCount: 1, lastToolName: "read" },
      },
    });
    // The child tool itself is surfaced as a canonical item tagged with the
    // parent task tool's id so the sub-agent overlay can list it.
    expect(step1.find((e) => e.type === "item.started")).toMatchObject({
      type: "item.started",
      parentItemId: taskItemId,
      itemType: "tool_call",
    });

    const step2 = mapOpenCodeEvent(
      {
        id: "evt-4",
        type: "message.part.updated",
        properties: {
          sessionID: "ses_child",
          time: 0,
          part: {
            id: "prt_child_grep",
            sessionID: "ses_child",
            messageID: "msg_child_1",
            type: "tool",
            tool: "grep",
            callID: "call_grep",
            state: {
              status: "running",
              input: { pattern: "foo" },
              time: { start: 0 },
            },
          } as ToolPart,
        },
      },
      state,
    );
    expect(step2[0]).toMatchObject({
      type: "item.updated",
      itemId: taskItemId,
      payload: { progress: { stepCount: 2, lastToolName: "grep" } },
    });

    // Same partID transitioning running → completed should not bump count.
    const same = mapOpenCodeEvent(
      {
        id: "evt-5",
        type: "message.part.updated",
        properties: {
          sessionID: "ses_child",
          time: 0,
          part: {
            id: "prt_child_grep",
            sessionID: "ses_child",
            messageID: "msg_child_1",
            type: "tool",
            tool: "grep",
            callID: "call_grep",
            state: {
              status: "completed",
              input: { pattern: "foo" },
              output: "result",
              title: "grep result",
              metadata: {},
              time: { start: 0, end: 1 },
            },
          } as ToolPart,
        },
      },
      state,
    );
    expect(same[0]).toMatchObject({
      type: "item.updated",
      payload: { progress: { stepCount: 2 } },
    });
  });

  it("links a child session that was announced before the parent task tool", () => {
    const state = createOpenCodeMapperState("thread-1");
    setOpenCodeMainSessionId(state, "ses_main");

    // Child session arrives first.
    const child: Session = {
      id: "ses_child",
      slug: "child",
      projectID: "proj",
      directory: "/",
      parentID: "ses_main",
      title: "subagent",
      version: "1.0.0",
      time: { created: 1, updated: 1 },
    };
    mapOpenCodeEvent(
      {
        id: "evt-1",
        type: "session.created",
        properties: { sessionID: "ses_child", info: child },
      },
      state,
    );

    // Then the parent task tool starts.
    mapOpenCodeEvent(
      {
        id: "evt-2",
        type: "message.part.updated",
        properties: {
          sessionID: "ses_main",
          time: 0,
          part: {
            id: "prt_task",
            sessionID: "ses_main",
            messageID: "msg_assistant",
            type: "tool",
            tool: "task",
            callID: "call_task",
            state: { status: "running", input: {}, time: { start: 0 } },
          } as ToolPart,
        },
      },
      state,
    );

    // A tool part in the child should now count toward parent progress.
    const step = mapOpenCodeEvent(
      {
        id: "evt-3",
        type: "message.part.updated",
        properties: {
          sessionID: "ses_child",
          time: 0,
          part: {
            id: "prt_child_read",
            sessionID: "ses_child",
            messageID: "msg_child_1",
            type: "tool",
            tool: "read",
            callID: "call_read",
            state: { status: "running", input: { filePath: "a.ts" }, time: { start: 0 } },
          } as ToolPart,
        },
      },
      state,
    );
    expect(step[0]).toMatchObject({
      type: "item.updated",
      payload: { progress: { stepCount: 1 } },
    });
  });

  it("uses webfetch urls as canonical web-search targets", () => {
    const state = createOpenCodeMapperState("thread-1");
    const events = mapOpenCodeEvent(
      toolPartUpdatedEvent({
        id: "prt_webfetch",
        sessionID: "ses_test",
        messageID: "msg_1",
        type: "tool",
        tool: "webfetch",
        callID: "call_webfetch",
        state: {
          status: "running",
          input: { url: "https://opencode.ai/docs" },
          time: { start: 0 },
        },
      }),
      state,
    );

    expect(events.find((e) => e.type === "item.started")).toMatchObject({
      itemType: "web_search",
      payload: {
        query: "https://opencode.ai/docs",
        kind: "fetch",
        args: { url: "https://opencode.ai/docs" },
        status: "running",
      },
    });
  });

  it("maps edit tools with file_path args as ACP-shaped file changes", () => {
    const state = createOpenCodeMapperState("thread-1");
    const args = {
      file_path: "src/renderer/components/composer/MentionInput.tsx",
      old_string: "before",
      new_string: "after",
    };
    const events = mapOpenCodeEvent(
      toolPartUpdatedEvent({
        id: "prt_edit",
        sessionID: "ses_test",
        messageID: "msg_1",
        type: "tool",
        tool: "edit",
        callID: "call_edit",
        state: {
          status: "running",
          input: args,
          time: { start: 0 },
        },
      }),
      state,
    );

    expect(events.find((e) => e.type === "item.started")).toMatchObject({
      itemType: "file_change",
      payload: {
        name: "edit",
        path: "src/renderer/components/composer/MentionInput.tsx",
        changeKind: "edit",
        args,
        status: "running",
      },
    });
  });

  it("maps running apply_patch edits with patchText paths and diff summaries", () => {
    const state = createOpenCodeMapperState("thread-1");
    const args = {
      patchText: [
        "*** Begin Patch",
        "*** Update File: src/renderer/components/thread/ChatPane/parts/items/toolDisplay.ts",
        "@@",
        "-before",
        "+after",
        "*** End Patch",
      ].join("\n"),
    };

    const events = mapOpenCodeEvent(
      toolPartUpdatedEvent({
        id: "prt_apply_patch",
        sessionID: "ses_test",
        messageID: "msg_1",
        type: "tool",
        tool: "apply_patch",
        callID: "call_apply_patch",
        state: {
          status: "running",
          input: args,
          time: { start: 0 },
        },
      }),
      state,
    );

    expect(events.find((e) => e.type === "item.started")).toMatchObject({
      itemType: "file_change",
      payload: {
        name: "apply_patch",
        path: "src/renderer/components/thread/ChatPane/parts/items/toolDisplay.ts",
        changeKind: "edit",
        diffSummary: { added: 1, removed: 1 },
        args,
        status: "running",
      },
    });
  });

  it("maps running apply_patch creates with patchText paths", () => {
    const state = createOpenCodeMapperState("thread-1");
    const args = {
      patchText: [
        "*** Begin Patch",
        "*** Add File: src/new-file.ts",
        "+export const value = 1;",
        "*** End Patch",
      ].join("\n"),
    };

    const events = mapOpenCodeEvent(
      toolPartUpdatedEvent({
        id: "prt_apply_patch_create",
        sessionID: "ses_test",
        messageID: "msg_1",
        type: "tool",
        tool: "apply_patch",
        callID: "call_apply_patch_create",
        state: {
          status: "running",
          input: args,
          time: { start: 0 },
        },
      }),
      state,
    );

    expect(events.find((e) => e.type === "item.started")).toMatchObject({
      itemType: "file_change",
      payload: {
        name: "apply_patch",
        path: "src/new-file.ts",
        changeKind: "create",
        diffSummary: { added: 1, removed: 0 },
        args,
        status: "running",
      },
    });
  });

  it("maps create tools with path args as running file changes", () => {
    const state = createOpenCodeMapperState("thread-1");
    const args = { path: "src/new-file.ts", content: "export const value = 1;\n" };

    const events = mapOpenCodeEvent(
      toolPartUpdatedEvent({
        id: "prt_create",
        sessionID: "ses_test",
        messageID: "msg_1",
        type: "tool",
        tool: "create",
        callID: "call_create",
        state: {
          status: "running",
          input: args,
          time: { start: 0 },
        },
      }),
      state,
    );

    expect(events.find((e) => e.type === "item.started")).toMatchObject({
      itemType: "file_change",
      payload: {
        name: "create",
        path: "src/new-file.ts",
        changeKind: "create",
        diffSummary: { added: 1, removed: 0 },
        args,
        status: "running",
      },
    });
  });

  it("uses completed edit changes arrays to heal path and diff summary", () => {
    const state = createOpenCodeMapperState("thread-1");
    const diff = "@@ -1 +1 @@\n-before\n+after\n";
    mapOpenCodeEvent(
      toolPartUpdatedEvent({
        id: "prt_edit_changes",
        sessionID: "ses_test",
        messageID: "msg_1",
        type: "tool",
        tool: "edit",
        callID: "call_edit_changes",
        state: {
          status: "running",
          input: { old_string: "before", new_string: "after" },
          time: { start: 0 },
        },
      }),
      state,
    );

    const events = mapOpenCodeEvent(
      toolPartUpdatedEvent({
        id: "prt_edit_changes",
        sessionID: "ses_test",
        messageID: "msg_1",
        type: "tool",
        tool: "edit",
        callID: "call_edit_changes",
        state: {
          status: "completed",
          title: "Success. Updated the following files:\nM src/foo.ts",
          input: { old_string: "before", new_string: "after" },
          output: "Success. Updated the following files:\nM src/foo.ts",
          metadata: {
            changes: [
              {
                path: "src/foo.ts",
                kind: { type: "update", move_path: null },
                diff,
              },
            ],
          },
          time: { start: 0, end: 20 },
        },
      }),
      state,
    );

    expect(events.find((e) => e.type === "item.completed")).toMatchObject({
      payload: {
        name: "edit",
        path: "src/foo.ts",
        diffSummary: { added: 1, removed: 1 },
        result: "Success. Updated the following files:\nM src/foo.ts",
      },
    });
  });

  it("normalizes completed apply_patch metadata files into canonical changes", () => {
    const state = createOpenCodeMapperState("thread-1");
    const patch = [
      "Index: /Users/serhiivecherenko/work/site-search-ui/README.md",
      "===================================================================",
      "--- /Users/serhiivecherenko/work/site-search-ui/README.md",
      "+++ /Users/serhiivecherenko/work/site-search-ui/README.md",
      "@@ -1,7 +1,7 @@",
      "-Preact-based embeddable widget that renders AI-powered, streaming search answers.",
      "+Preact-based embeddable search widget that renders AI-powered, streaming answers.",
      "@@ -24,9 +24,9 @@",
      "-The simplest integration uses a single script tag with query parameters:",
      "+The simplest integration uses one script tag with query parameters:",
      "@@ -201,5 +201,5 @@",
      "-Common env vars are described in `AGENTS.md`.",
      "+Common environment variables are described in `AGENTS.md`.",
      "",
    ].join("\n");
    const args = {
      patchText: [
        "*** Begin Patch",
        "*** Update File: /Users/serhiivecherenko/work/site-search-ui/README.md",
        "@@",
        "-Preact-based embeddable widget that renders AI-powered, streaming search answers.",
        "+Preact-based embeddable search widget that renders AI-powered, streaming answers.",
        "@@",
        "-The simplest integration uses a single script tag with query parameters:",
        "+The simplest integration uses one script tag with query parameters:",
        "@@",
        "-Common env vars are described in `AGENTS.md`.",
        "+Common environment variables are described in `AGENTS.md`.",
        "*** End Patch",
      ].join("\n"),
    };

    const events = mapOpenCodeEvent(
      toolPartUpdatedEvent({
        id: "prt_apply_patch_files",
        sessionID: "ses_test",
        messageID: "msg_1",
        type: "tool",
        tool: "apply_patch",
        callID: "call_apply_patch_files",
        state: {
          status: "completed",
          title: "Success. Updated the following files:\nM README.md",
          input: args,
          output: "Success. Updated the following files:\nM README.md",
          metadata: {
            files: [
              {
                filePath: "/Users/serhiivecherenko/work/site-search-ui/README.md",
                relativePath: "README.md",
                type: "update",
                patch,
                additions: 3,
                deletions: 3,
              },
            ],
          },
          time: { start: 0, end: 20 },
        },
      }),
      state,
    );

    expect(events.find((e) => e.type === "item.started")).toMatchObject({
      itemType: "file_change",
      payload: {
        name: "apply_patch",
        path: "README.md",
        diffSummary: { added: 3, removed: 3 },
        metadata: {
          changes: [
            {
              path: "README.md",
              kind: { type: "update", move_path: null },
              diff: patch.trim(),
            },
          ],
        },
      },
    });
  });
});

function userMessageUpdatedEvent(messageID: string): Event {
  return messageUpdatedEvent(userMessage(messageID, { time: { created: Date.now() } }));
}

describe("sdkCanonicalMapping — user message dedup", () => {
  it("reuses the runtime's optimistic user_message id when present", () => {
    const state = createOpenCodeMapperState("thread-1");
    state.pendingUserMessageItemIds.push("user-optimistic-1");

    const events = mapOpenCodeEvent(userMessageUpdatedEvent("msg_user_1"), state);

    // Should NOT emit item.started — the runtime already painted that bubble.
    expect(events).toEqual([]);
    expect(state.userItems.get("msg_user_1")).toBe("user-optimistic-1");
    expect(state.pendingUserMessageItemIds).toHaveLength(0);
  });

  it("emits item.started when no optimistic id is queued (e.g. resume/replay)", () => {
    const state = createOpenCodeMapperState("thread-1");

    const events = mapOpenCodeEvent(userMessageUpdatedEvent("msg_user_1"), state);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "item.started", itemType: "user_message" });
  });

  it("skips text parts that belong to a known user message", () => {
    const state = createOpenCodeMapperState("thread-1");
    state.pendingUserMessageItemIds.push("user-optimistic-1");
    mapOpenCodeEvent(userMessageUpdatedEvent("msg_user_1"), state);

    const partEvents = mapOpenCodeEvent(
      partUpdatedTextEvent("msg_user_1", "prt_user_1", "what you can do?"),
      state,
    );

    // No phantom assistant_message should be created from the user's own text.
    expect(partEvents).toEqual([]);
    expect(state.assistantItems.size).toBe(0);
  });

  it("still emits assistant text for parts on assistant messages", () => {
    const state = createOpenCodeMapperState("thread-1");
    // Assistant has no message.updated yet — fall back to current behaviour.
    const events = mapOpenCodeEvent(deltaEvent("msg_asst_1", "prt_1", "Hi"), state);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: "item.started", itemType: "assistant_message" });
  });
});

function reasoningPartUpdatedEvent(
  messageID: string,
  partID: string,
  text: string,
  end?: number,
): Event {
  return {
    id: "evt-" + Math.random().toString(36).slice(2),
    type: "message.part.updated",
    properties: {
      sessionID: "ses_test",
      time: Date.now(),
      part: {
        id: partID,
        sessionID: "ses_test",
        messageID,
        type: "reasoning",
        text,
        time: end !== undefined ? { start: 0, end } : { start: 0 },
      },
    },
  };
}

function assistantMessageUpdatedEvent(messageID: string, completed?: number): Event {
  return messageUpdatedEvent(
    assistantMessage(messageID, {
      modelID: "test",
      providerID: "test",
      time: completed !== undefined ? { created: 0, completed } : { created: 0 },
    }),
  );
}

describe("sdkCanonicalMapping — reasoning delta routing", () => {
  it("routes field='text' deltas on a known reasoning Part to the reasoning stream", () => {
    // OpenCode emits `field: "text"` for both TextPart and ReasoningPart deltas
    // because both Parts have a `text` property. Routing by field alone would
    // leak the chain-of-thought into the assistant_message bubble. Once the
    // snapshot has registered the Part as `reasoning`, deltas for that partID
    // must follow.
    const state = createOpenCodeMapperState("thread-1");
    // Snapshot first — registers the part as type=reasoning.
    mapOpenCodeEvent(reasoningPartUpdatedEvent("msg_a", "prt_r", ""), state);

    const events = mapOpenCodeEvent(deltaEvent("msg_a", "prt_r", "thinking..."), state);

    // Should NOT have created an assistant_message item.
    expect(
      events.find((e) => e.type === "item.started" && e.itemType === "assistant_message"),
    ).toBeUndefined();
    // Should have streamed into reasoning_text.
    const delta = events.find((e) => e.type === "content.delta");
    expect(delta).toMatchObject({ stream: "reasoning_text", delta: "thinking..." });
  });
});

describe("sdkCanonicalMapping — reasoning completion", () => {
  it("emits item.completed for the reasoning item when the part snapshot has time.end", () => {
    const state = createOpenCodeMapperState("thread-1");
    // Open a reasoning item via a streaming snapshot.
    mapOpenCodeEvent(reasoningPartUpdatedEvent("msg_a", "prt_r", "thinking..."), state);

    // Final snapshot arrives with time.end set.
    const closing = mapOpenCodeEvent(
      reasoningPartUpdatedEvent("msg_a", "prt_r", "thinking... done", 100),
      state,
    );

    expect(closing.find((e) => e.type === "item.completed")).toBeDefined();
  });

  it("closes any open reasoning items when the parent assistant message completes", () => {
    const state = createOpenCodeMapperState("thread-1");
    mapOpenCodeEvent(reasoningPartUpdatedEvent("msg_a", "prt_r", "thinking..."), state);
    // Reasoning never received time.end — assistant message wraps up anyway.
    const events = mapOpenCodeEvent(assistantMessageUpdatedEvent("msg_a", 200), state);

    const completes = events.filter((e) => e.type === "item.completed");
    expect(completes.length).toBeGreaterThanOrEqual(1);
  });
});

describe("sdkCanonicalMapping — closeOpenItems", () => {
  it("emits item.completed for every open assistant/reasoning/tool item", () => {
    const state = createOpenCodeMapperState("thread-1");
    mapOpenCodeEvent(deltaEvent("msg_1", "prt_1", "hi"), state);
    const closed = closeOpenItems(state);
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({ type: "item.completed", threadId: "thread-1" });
  });
});
