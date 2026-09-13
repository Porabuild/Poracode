import { describe, expect, it } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import type { V2Event } from "./clientTypes";
import {
  closeOpenCode2Items,
  createOpenCode2MapperState,
  mapOpenCode2Event,
  setOpenCode2SessionId,
  steerOpenCode2Turn,
} from "./eventMapping";

const SESSION = "ses_probe";
const ASSISTANT = "msg_assist";

let seq = 0;

function event(type: string, data: Record<string, unknown>): V2Event {
  seq += 1;
  return { id: `evt-${seq}`, created: 1, type, data } as unknown as V2Event;
}

function stateFor(sessionID = SESSION) {
  const state = createOpenCode2MapperState("thread-1");
  setOpenCode2SessionId(state, sessionID, { fresh: true });
  return state;
}

function mapAll(state: ReturnType<typeof stateFor>, events: V2Event[]): RuntimeEvent[] {
  return events.flatMap((entry) => mapOpenCode2Event(entry, state));
}

function typesOf(events: RuntimeEvent[]): string[] {
  return events.map((entry) => entry.type);
}

/** Full clean-turn sequence captured live from `tmp/probe-v2-clean.txt`. */
function probeTurnEvents(): V2Event[] {
  return [
    event("session.inbox.enqueued", {
      sessionID: SESSION,
      inboxID: "msg_user_1",
      item: { type: "user", payload: { text: "Say hello in one word." }, delivery: "steer" },
    }),
    event("session.execution.started", { sessionID: SESSION }),
    event("session.step.started", {
      sessionID: SESSION,
      assistantMessageID: ASSISTANT,
      agent: "build",
      model: { id: "deepseek-v4.1-flash", providerID: "opencode-go" },
    }),
    event("session.reasoning.started", {
      sessionID: SESSION,
      assistantMessageID: ASSISTANT,
      ordinal: 0,
    }),
    event("session.reasoning.delta", {
      sessionID: SESSION,
      assistantMessageID: ASSISTANT,
      ordinal: 0,
      delta: "The user asked to say hello in one word. ",
    }),
    event("session.text.started", {
      sessionID: SESSION,
      assistantMessageID: ASSISTANT,
      ordinal: 0,
    }),
    event("session.reasoning.ended", {
      sessionID: SESSION,
      assistantMessageID: ASSISTANT,
      ordinal: 0,
      text: 'The user asked to say hello in one word. Just say "Hello".',
    }),
    event("session.text.delta", {
      sessionID: SESSION,
      assistantMessageID: ASSISTANT,
      ordinal: 0,
      delta: "Hel",
    }),
    event("session.text.delta", {
      sessionID: SESSION,
      assistantMessageID: ASSISTANT,
      ordinal: 0,
      delta: "lo",
    }),
    event("session.text.ended", {
      sessionID: SESSION,
      assistantMessageID: ASSISTANT,
      ordinal: 0,
      text: "Hello",
    }),
    event("session.step.streamed", { sessionID: SESSION, assistantMessageID: ASSISTANT }),
    event("session.step.ended", {
      sessionID: SESSION,
      assistantMessageID: ASSISTANT,
      finish: "stop",
      cost: 0.00168105,
      tokens: { input: 10995, output: 2, reasoning: 51, cache: { read: 0, write: 0 } },
    }),
    event("session.usage.updated", {
      sessionID: SESSION,
      cost: 0.00168105,
      tokens: { input: 10995, output: 2, reasoning: 51, cache: { read: 0, write: 0 } },
    }),
    event("session.execution.succeeded", { sessionID: SESSION }),
  ];
}

describe("mapOpenCode2Event", () => {
  it("maps the live probe turn to reasoning, assistant text, usage, and turn bookkeeping", () => {
    const state = stateFor();
    const events = mapAll(state, probeTurnEvents());

    // The prompt was not painted by the runtime here, so the inbox echo opens
    // the user row; then reasoning streams, closes on its `ended`, the
    // assistant row opens on the first text delta and closes on step end.
    expect(typesOf(events)).toEqual([
      "item.started", // user_message (echo)
      "item.completed",
      "turn.started",
      "item.started", // reasoning
      "content.delta",
      "content.delta", // reasoning tail from `reasoning.ended`
      "item.completed", // reasoning closes on `ended`
      "item.started", // assistant_message
      "content.delta", // "Hel"
      "content.delta", // "lo"
      "item.completed", // assistant row closes on step.ended
      "context.updated",
      "usage.spent",
      "turn.completed",
    ]);

    const reasoningRows = events.filter(
      (e): e is Extract<RuntimeEvent, { type: "item.started" }> =>
        e.type === "item.started" && e.itemType === "reasoning",
    );
    expect(reasoningRows).toHaveLength(1);

    const deltas = events.filter(
      (e): e is Extract<RuntimeEvent, { type: "content.delta" }> => e.type === "content.delta",
    );
    const reasoningText = deltas
      .filter((e) => e.stream === "reasoning_text")
      .map((e) => e.delta)
      .join("");
    expect(reasoningText).toBe('The user asked to say hello in one word. Just say "Hello".');
    const assistantText = deltas
      .filter((e) => e.stream === "assistant_text")
      .map((e) => e.delta)
      .join("");
    expect(assistantText).toBe("Hello");

    const spent = events.find((e) => e.type === "usage.spent") as Extract<
      RuntimeEvent,
      { type: "usage.spent" }
    >;
    expect(spent.usage).toMatchObject({
      counterKind: "per-call",
      counter: 11048,
      scopeId: SESSION,
      epoch: 0,
      fresh: true,
      sampleId: ASSISTANT,
    });

    expect(events.at(-1)).toEqual({
      type: "turn.completed",
      threadId: "thread-1",
      turnId: "opencode2-ses_probe-1",
      state: "completed",
    });
    expect(state.turnActive).toBe(false);
    expect(state.messages.size).toBe(0);
  });

  it("reuses the runtime's optimistic user id and paints unprompted ones", () => {
    const state = stateFor();
    state.pendingUserMessageItemIds.push("user-optimistic");

    const echoed = mapAll(state, [
      event("session.inbox.enqueued", {
        sessionID: SESSION,
        inboxID: "msg_user_1",
        item: { type: "user", payload: { text: "hi" }, delivery: "queue" },
      }),
    ]);
    expect(echoed).toEqual([]);
    expect(state.userItems.get("msg_user_1")).toBe("user-optimistic");

    const external = mapAll(state, [
      event("session.inbox.enqueued", {
        sessionID: SESSION,
        inboxID: "msg_user_2",
        item: { type: "user", payload: { text: "from elsewhere" }, delivery: "queue" },
      }),
    ]);
    expect(typesOf(external)).toEqual(["item.started", "item.completed"]);
    expect(external[0]).toMatchObject({
      itemType: "user_message",
      payload: { content: [{ kind: "text", text: "from elsewhere" }] },
    });

    const nonUser = mapAll(state, [
      event("session.inbox.enqueued", {
        sessionID: SESSION,
        inboxID: "msg_synth",
        item: { type: "synthetic", payload: { text: "compaction" }, delivery: "queue" },
      }),
    ]);
    expect(nonUser).toEqual([]);
  });

  it("streams a tool from input through progress to success", () => {
    const state = stateFor();
    const events = mapAll(state, [
      event("session.execution.started", { sessionID: SESSION }),
      event("session.tool.input.started", {
        sessionID: SESSION,
        assistantMessageID: ASSISTANT,
        id: "tool_1",
        name: "bash",
      }),
      event("session.tool.input.delta", {
        sessionID: SESSION,
        assistantMessageID: ASSISTANT,
        id: "tool_1",
        delta: '{"command":"ls',
      }),
      event("session.tool.input.delta", {
        sessionID: SESSION,
        assistantMessageID: ASSISTANT,
        id: "tool_1",
        delta: ' -la"}',
      }),
      event("session.tool.input.ended", {
        sessionID: SESSION,
        assistantMessageID: ASSISTANT,
        id: "tool_1",
        text: '{"command":"ls -la"}',
      }),
      event("session.tool.called", {
        sessionID: SESSION,
        assistantMessageID: ASSISTANT,
        id: "tool_1",
        input: { command: "ls -la" },
        executed: true,
      }),
      event("session.tool.progress", {
        sessionID: SESSION,
        assistantMessageID: ASSISTANT,
        id: "tool_1",
        metadata: { description: "listing files", stepCount: 2 },
      }),
      event("session.tool.success", {
        sessionID: SESSION,
        assistantMessageID: ASSISTANT,
        id: "tool_1",
        content: [{ type: "text", text: "file-a\nfile-b" }],
        executed: true,
      }),
      event("session.execution.succeeded", { sessionID: SESSION }),
    ]);

    expect(typesOf(events)).toEqual([
      "turn.started",
      "item.started",
      "item.updated", // input.ended parses the streamed JSON
      "item.updated", // tool.called
      "item.updated", // progress
      "item.updated", // success payload
      "item.completed",
      "turn.completed",
    ]);

    const started = events[1] as Extract<RuntimeEvent, { type: "item.started" }>;
    expect(started.itemType).toBe("command_execution");
    expect(started.payload).toMatchObject({ name: "bash", status: "running", command: "" });

    const updated = events.filter(
      (e): e is Extract<RuntimeEvent, { type: "item.updated" }> => e.type === "item.updated",
    );
    expect(updated[2]?.payload).toMatchObject({
      command: "ls -la",
      status: "running",
      progress: { description: "listing files", stepCount: 2 },
    });
    expect(updated[3]?.payload).toMatchObject({
      command: "ls -la",
      status: "success",
      result: "file-a\nfile-b",
      progress: { description: "listing files", stepCount: 2 },
    });
  });

  it("maps a failed tool call with an error message and no duplicate row", () => {
    const state = stateFor();
    const events = mapAll(state, [
      event("session.tool.failed", {
        sessionID: SESSION,
        assistantMessageID: ASSISTANT,
        id: "tool_1",
        error: { type: "ToolError", message: "boom" },
        content: [{ type: "text", text: "partial output" }],
        executed: true,
      }),
    ]);

    // Late results still open the row before closing it so the renderer sees
    // a typed item.
    expect(typesOf(events)).toEqual(["item.started", "item.completed"]);
    const started = events[0] as Extract<RuntimeEvent, { type: "item.started" }>;
    expect(started.payload).toMatchObject({ status: "error", errorMessage: "boom" });
    const completed = events[1] as Extract<RuntimeEvent, { type: "item.completed" }>;
    expect(completed.payload).toMatchObject({ status: "error", errorMessage: "boom" });
  });

  it("does not treat cumulative session billing totals as current context", () => {
    const state = stateFor();
    expect(
      mapOpenCode2Event(
        event("session.usage.updated", {
          sessionID: SESSION,
          tokens: { input: 54536, output: 2782, reasoning: 623, cache: { read: 139724, write: 0 } },
        }),
        state,
      ),
    ).toEqual([]);
  });

  it("reports step usage once per step and feeds the context dock", () => {
    const state = stateFor();
    const tokens = { input: 100, output: 10, reasoning: 5, cache: { read: 3, write: 1 } };
    const first = mapAll(state, [
      event("session.step.ended", { sessionID: SESSION, assistantMessageID: ASSISTANT, tokens }),
      event("session.step.ended", { sessionID: SESSION, assistantMessageID: ASSISTANT, tokens }),
    ]);

    const spent = first.filter((e) => e.type === "usage.spent");
    expect(spent).toEqual([
      {
        type: "usage.spent",
        threadId: "thread-1",
        usage: {
          counterKind: "per-call",
          counter: 119,
          scopeId: SESSION,
          epoch: 0,
          fresh: true,
          sampleId: ASSISTANT,
        },
      },
    ]);
    expect(first.filter((e) => e.type === "context.updated")).toHaveLength(2);

    expect(state.usageSpentMessages.has(ASSISTANT)).toBe(true);
    expect(state.usageScopeSampled).toBe(true);
  });

  it("opens a permission request and resolves it by reply kind", () => {
    const state = stateFor();
    const opened = mapAll(state, [
      event("permission.asked", {
        id: "perm_1",
        sessionID: SESSION,
        action: "bash",
        resources: ["ls -la", "rm -rf /"],
        save: ["ls *"],
        metadata: { description: "list the repo" },
      }),
    ]);
    expect(opened).toEqual([
      {
        type: "request.opened",
        threadId: "thread-1",
        requestId: "opencode2-perm-perm_1",
        requestType: "command_execution_approval",
        payload: {
          summary: "Permission required",
          details: {
            toolName: "bash",
            displayName: "command",
            decisionReason: "OpenCode 2 wants to run a command.",
            input: { command: "ls -la", commands: ["ls -la", "rm -rf /"] },
          },
          options: [
            { optionId: "reject", label: "Deny" },
            { optionId: "once", label: "Allow" },
            { optionId: "always", label: "Allow always" },
          ],
        },
      },
    ]);

    const replied = mapAll(state, [
      event("permission.replied", { sessionID: SESSION, requestID: "perm_1", reply: "once" }),
    ]);
    expect(replied).toEqual([
      {
        type: "request.resolved",
        threadId: "thread-1",
        requestId: "opencode2-perm-perm_1",
        outcome: "accepted",
      },
    ]);
  });

  it("opens an edit permission as a file-change request without a save option", () => {
    const state = stateFor();
    const opened = mapAll(state, [
      event("permission.asked", {
        id: "perm_2",
        sessionID: SESSION,
        action: "edit",
        resources: ["src/a.ts"],
        metadata: {},
      }),
    ]);
    const request = opened[0] as Extract<RuntimeEvent, { type: "request.opened" }>;
    expect(request.requestType).toBe("file_change_approval");
    expect(request.payload.details).toMatchObject({
      toolName: "edit",
      input: { path: "src/a.ts" },
    });
    expect(request.payload.options).toEqual([
      { optionId: "reject", label: "Deny" },
      { optionId: "once", label: "Allow" },
    ]);
  });

  it("maps a V2 form into the shared typed form contract", () => {
    const state = stateFor();
    const opened = mapAll(state, [
      event("form.created", {
        sessionID: SESSION,
        form: {
          id: "form_1",
          sessionID: SESSION,
          title: "Deploy target",
          fields: [
            {
              key: "env",
              title: "Environment",
              description: "Where should this deploy?",
              type: "string",
              options: [
                { value: "prod", label: "Production", description: "Live site" },
                { value: "staging", label: "Staging" },
              ],
            },
          ],
        },
      }),
    ]);
    expect(opened).toEqual([
      {
        type: "request.opened",
        threadId: "thread-1",
        requestId: "opencode2-form-form_1",
        requestType: "tool_user_input",
        payload: {
          summary: "Deploy target",
          details: {
            structuredElicitation: {
              mode: "form",
              message: "Deploy target",
              sourceText: "OpenCode 2",
              links: [],
              requestedSchema: {
                type: "object",
                required: ["env"],
                properties: {
                  env: {
                    type: "string",
                    title: "Environment",
                    description: "Where should this deploy?",
                    allowCustom: false,
                    oneOf: [
                      { const: "prod", title: "Production" },
                      { const: "staging", title: "Staging" },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    ]);

    expect(
      mapAll(state, [
        event("form.replied", { sessionID: SESSION, id: "form_1", answer: { env: "prod" } }),
      ]),
    ).toEqual([
      {
        type: "request.resolved",
        threadId: "thread-1",
        requestId: "opencode2-form-form_1",
        outcome: "answered",
      },
    ]);
    expect(mapAll(state, [event("form.cancelled", { sessionID: SESSION, id: "form_1" })])).toEqual([
      {
        type: "request.resolved",
        threadId: "thread-1",
        requestId: "opencode2-form-form_1",
        outcome: "cancelled",
      },
    ]);
  });

  it("settles interrupted and failed executions with their open rows", () => {
    const state = stateFor();
    const interrupted = mapAll(state, [
      event("session.execution.started", { sessionID: SESSION }),
      event("session.text.delta", {
        sessionID: SESSION,
        assistantMessageID: ASSISTANT,
        ordinal: 0,
        delta: "partial",
      }),
      event("session.execution.interrupted", { sessionID: SESSION, reason: "user" }),
    ]);
    expect(typesOf(interrupted)).toEqual([
      "turn.started",
      "item.started",
      "content.delta",
      "item.completed", // assistant row closed
      "turn.completed",
    ]);
    expect(interrupted.at(-1)).toMatchObject({ state: "interrupted" });

    const failed = mapAll(state, [
      event("session.execution.started", { sessionID: SESSION }),
      event("session.execution.failed", {
        sessionID: SESSION,
        error: { type: "ProviderAuthError", message: "auth expired" },
      }),
    ]);
    expect(typesOf(failed)).toEqual(["turn.started", "turn.completed", "error"]);
    expect(failed.at(-1)).toMatchObject({ message: "auth expired" });

    // A new turn surfaces the same message again — the dedup is per turn.
    const repeat = mapAll(state, [
      event("session.execution.started", { sessionID: SESSION }),
      event("session.execution.failed", {
        sessionID: SESSION,
        error: { type: "ProviderAuthError", message: "auth expired" },
      }),
    ]);
    expect(typesOf(repeat)).toEqual(["turn.started", "turn.completed", "error"]);
  });

  it("surfaces a retry notice once, even when the turn then fails identically", () => {
    const state = stateFor();
    const events = mapAll(state, [
      event("session.execution.started", { sessionID: SESSION }),
      event("session.retry.scheduled", {
        sessionID: SESSION,
        assistantMessageID: ASSISTANT,
        attempt: 2,
        at: 123,
        error: { type: "RateLimit", message: "slow down" },
      }),
      event("session.execution.failed", {
        sessionID: SESSION,
        error: { type: "RateLimit", message: "slow down" },
      }),
    ]);
    // The retry paints the row; the terminal execution failure of the same
    // problem settles the turn without a duplicate row.
    expect(typesOf(events)).toEqual(["turn.started", "error", "turn.completed"]);
  });

  it("tolerates a stream that settles before its deltas (beta reordering)", () => {
    const state = stateFor();
    // `ended` without `started` or deltas: the assistant row still opens and
    // the full text lands.
    const first = mapAll(state, [
      event("session.text.ended", {
        sessionID: SESSION,
        assistantMessageID: ASSISTANT,
        ordinal: 0,
        text: "done",
      }),
    ]);
    expect(typesOf(first)).toEqual(["item.started", "content.delta"]);
    expect(first[1]).toMatchObject({ delta: "done", stream: "assistant_text" });

    // A repeated `ended` for the same ordinal is fully deduped.
    expect(
      mapAll(state, [
        event("session.text.ended", {
          sessionID: SESSION,
          assistantMessageID: ASSISTANT,
          ordinal: 0,
          text: "done",
        }),
      ]),
    ).toEqual([]);
  });

  it("tolerates out-of-order tools and unknown or foreign events", () => {
    const state = stateFor();

    // Progress for an unknown tool is dropped.
    expect(
      mapAll(state, [
        event("session.tool.progress", {
          sessionID: SESSION,
          assistantMessageID: ASSISTANT,
          id: "tool_missing",
          metadata: { description: "nope" },
        }),
      ]),
    ).toEqual([]);

    // Unknown event types fall through.
    expect(mapAll(state, [event("session.brand.new.event", { sessionID: SESSION })])).toEqual([]);

    // Another session's traffic on the shared server is ignored.
    expect(
      mapAll(state, [
        event("session.execution.started", { sessionID: "ses_other" }),
        event("permission.asked", {
          id: "perm_x",
          sessionID: "ses_other",
          action: "bash",
          resources: [],
        }),
      ]),
    ).toEqual([]);

    // Catalog/environment chrome carries no session id at all.
    expect(mapAll(state, [event("catalog.updated", {})])).toEqual([]);
  });

  it("closes open items and the turn on forced completion", () => {
    const state = stateFor();
    mapAll(state, [
      event("session.execution.started", { sessionID: SESSION }),
      event("session.tool.input.started", {
        sessionID: SESSION,
        assistantMessageID: ASSISTANT,
        id: "tool_1",
        name: "bash",
      }),
    ]);
    const events = closeOpenCode2Items(state);
    expect(typesOf(events)).toEqual(["item.completed", "turn.completed"]);
    expect(events[0]).toMatchObject({ payload: { status: "error" } });
    expect(events[1]).toMatchObject({ state: "interrupted" });
    expect(state.turnActive).toBe(false);
  });

  it("paints a steer message without touching the open turn", () => {
    const state = stateFor();
    mapAll(state, [event("session.execution.started", { sessionID: SESSION })]);
    const events = steerOpenCode2Turn(state, "focus on tests", undefined, "user-steer");
    expect(events).toEqual([
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "user-steer",
        itemType: "user_message",
        payload: { content: [{ kind: "text", text: "focus on tests" }] },
      },
      { type: "item.completed", threadId: "thread-1", itemId: "user-steer" },
    ]);
    expect(state.turnActive).toBe(true);
  });
});
