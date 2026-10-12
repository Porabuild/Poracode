import { describe, expect, it } from "vitest";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import { createAcpMapperState, mapAcpSessionUpdate } from "../acp/canonicalMapping";
import { PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY } from "../acp/canonicalMapping/subagents";
import { PORACODE_ACP_USAGE_BREAKDOWN_META_KEY } from "../acp/canonicalMapping/usageMeta";
import { createDevinAcpTransform, pickDevinSubagentCompletion } from "./acpTransform";
import foreground from "./fixtures/subagent.json";
import background from "./fixtures/subagent-background.json";

describe("partial assistant message correlation", () => {
  it("keeps root boundaries separate from an active foreground child's content", () => {
    const transform = createDevinAcpTransform();
    const state = createAcpMapperState("thread");
    for (const note of foreground.slice(0, 3))
      mapAcpSessionUpdate(transform(note as SessionNotification), state);
    const chunk = (id: string, parent?: string): SessionNotification => ({
      sessionId: "fixture-session",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: id },
        _meta: {
          "cognition.ai/streamingMessageId": id,
          ...(parent ? { "cognition.ai/subagent_context": { parentAgentId: parent } } : {}),
        },
      },
    });
    const childEvents = mapAcpSessionUpdate(transform(chunk("child", "a0c86937")), state);
    const child = childEvents
      .filter((event) => event.type === "item.started")
      .find((event) => event.itemType === "assistant_message");
    expect(child).toHaveProperty("parentItemId");
    const rootEvents = mapAcpSessionUpdate(transform(chunk("root-a")), state);
    const root = rootEvents
      .filter((event) => event.type === "item.started")
      .find((event) => event.itemType === "assistant_message");
    expect(root).not.toHaveProperty("parentItemId");
    const nextRoot = mapAcpSessionUpdate(transform(chunk("root-b")), state);
    expect(
      nextRoot.filter((event) => event.type === "item.completed").map((event) => event.itemId),
    ).toContain(root?.itemId);
    expect(
      nextRoot.filter((event) => event.type === "item.completed").map((event) => event.itemId),
    ).not.toContain(child?.itemId);
    const childContinuation = mapAcpSessionUpdate(transform(chunk("child", "a0c86937")), state);
    expect(childContinuation.find((event) => event.type === "content.delta")?.itemId).toBe(
      child?.itemId,
    );
  });

  it("does not introduce a boundary when an owner's correlation entry was evicted", () => {
    const transform = createDevinAcpTransform();
    const note = (id: string, parent?: string): SessionNotification => ({
      sessionId: "native",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "chunk" },
        _meta: {
          "cognition.ai/streamingMessageId": id,
          ...(parent ? { "cognition.ai/subagent_context": { parentAgentId: parent } } : {}),
        },
      },
    });
    transform(note("root-message"));
    for (let index = 0; index < 257; index++) transform(note("child-message", `child-${index}`));
    expect(transform(note("root-message")).update._meta).not.toHaveProperty(
      "poracodeNewAssistantItem",
    );
  });

  it.each(["agent_message_chunk", "agent_thought_chunk"] as const)(
    "keeps repeated %s chunks in one item and separates native message ids",
    (sessionUpdate) => {
      const transform = createDevinAcpTransform();
      const state = createAcpMapperState("thread");
      const notes = [
        ["a", "alpha"],
        ["a", " one"],
        ["b", "beta"],
      ].map(([id, text]) => ({
        sessionId: "native",
        update: {
          sessionUpdate,
          content: { type: "text", text },
          _meta: { "cognition.ai/streamingMessageId": id },
        },
      })) as SessionNotification[];
      const events = notes.flatMap((note) => mapAcpSessionUpdate(transform(note), state));
      const starts = events.filter((event) => event.type === "item.started");
      expect(starts).toHaveLength(2);
      const deltas = events.filter((event) => event.type === "content.delta");
      expect(deltas[0]?.itemId).toBe(deltas[1]?.itemId);
      expect(deltas[2]?.itemId).not.toBe(deltas[0]?.itemId);
    },
  );
});

it("does not resurrect a completed call after its replay tombstone was evicted", () => {
  const transform = createDevinAcpTransform();
  const note = (update: Record<string, unknown>) =>
    ({ sessionId: "native", update }) as SessionNotification;
  const start = (id: string) => {
    transform(
      note({
        sessionUpdate: "tool_call",
        toolCallId: `call-${id}`,
        rawInput: { title: id, task: id, profile: "subagent_explore", is_background: true },
        _meta: { "cognition.ai/inferenceToolName": "run_subagent" },
      }),
    );
    transform(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: `agent-${id}`,
        status: "in_progress",
        _meta: {
          "cognition.ai/subagent_started": {
            agentId: `agent-${id}`,
            title: id,
            task: id,
            profile: "Explore",
            isBackground: true,
          },
        },
      }),
    );
  };
  const finish = (id: string, summary: string) =>
    transform(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: `agent-${id}`,
        status: "completed",
        _meta: {
          "cognition.ai/subagent_completed": { agentId: `agent-${id}`, success: true, summary },
        },
      }),
    );
  // Start older children first, then finish the newest call before those older
  // children. Its binding survives while its completed tombstone expires.
  for (let index = 0; index < 255; index++) start(String(index));
  start("target");
  expect(finish("target", "original").update).toMatchObject({ rawOutput: "original" });
  for (let index = 0; index < 255; index++) finish(String(index), "older");
  start("later");
  finish("later", "later");
  const replay = finish("target", "ghost");
  expect(replay.update).toMatchObject({ toolCallId: "agent-target" });
  expect(replay.update).not.toHaveProperty("rawOutput");
});

describe("Devin native subagents (3000.10.21 wire fixtures)", () => {
  it.each([
    ["foreground", foreground, 1],
    ["parallel background", background, 2],
  ] as const)(
    "renders %s calls as sibling subagents with nested results",
    (_name, fixture, count) => {
      const transform = createDevinAcpTransform();
      const state = createAcpMapperState("thread");
      const notifications = fixture.map((note) => transform(note as SessionNotification));
      const events = notifications.flatMap((note) => mapAcpSessionUpdate(note, state));
      const starts = events.filter(
        (e) =>
          e.type === "item.started" &&
          e.itemType === "tool_call" &&
          (e.payload as { args?: Record<string, unknown> } | undefined)?.args?._toolName === "task",
      );
      expect(starts).toHaveLength(count);
      for (const start of starts) expect(start).not.toHaveProperty("parentItemId");
      const completions = notifications.filter(
        (note) =>
          (note.update._meta as Record<string, unknown>)?.poracodeSubAgentStatus === "completed",
      );
      expect(completions).toHaveLength(count);
      expect(
        completions.map((n) => (n.update as { rawOutput?: unknown }).rawOutput).sort(),
      ).toEqual(count === 1 ? ["143"] : ["143", "168"]);
      expect(
        events.some(
          (e) => e.type === "item.started" && e.itemType === "assistant_message" && e.parentItemId,
        ),
      ).toBe(true);
    },
  );
  it("keeps background launch acknowledgement open until its native completion", () => {
    const transform = createDevinAcpTransform();
    const outputs = background.map((note) => transform(note as SessionNotification));
    const acknowledgement = outputs.find(
      (n) =>
        n.update.sessionUpdate === "tool_call_update" &&
        n.update.toolCallId === "call_HEcSHR9hna4Kb0wwPtLGieVR" &&
        (n.update as { rawInput?: Record<string, unknown> }).rawInput?.background,
    );
    expect(acknowledgement?.update).toMatchObject({ status: "in_progress" });
  });
});

it("correlates reversed native starts by profile and background, never just description", () => {
  const transform = createDevinAcpTransform();
  const note = (update: Record<string, unknown>) =>
    ({ sessionId: "session", update }) as SessionNotification;
  for (const [id, isBackground] of [
    ["foreground", false],
    ["background", true],
  ] as const)
    transform(
      note({
        sessionUpdate: "tool_call",
        toolCallId: id,
        rawInput: {
          title: "Same",
          task: "Same task",
          profile: "subagent_explore",
          is_background: isBackground,
        },
        _meta: { "cognition.ai/inferenceToolName": "run_subagent" },
      }),
    );
  const start = transform(
    note({
      sessionUpdate: "tool_call_update",
      toolCallId: "native-background",
      status: "in_progress",
      _meta: {
        "cognition.ai/subagent_started": {
          agentId: "native-background",
          title: "Same",
          task: "Same task",
          profile: "Explore",
          isBackground: true,
        },
      },
    }),
  );
  expect(start.update).toMatchObject({ toolCallId: "background" });
  const end = transform(
    note({
      sessionUpdate: "tool_call_update",
      toolCallId: "native-background",
      status: "completed",
      _meta: {
        "cognition.ai/subagent_completed": {
          agentId: "native-background",
          success: true,
          summary: "Correct result",
        },
      },
    }),
  );
  expect(end.update).toMatchObject({ toolCallId: "background", rawOutput: "Correct result" });
});

it("does not strand ambiguous background launches awaiting an unresolvable completion", () => {
  const transform = createDevinAcpTransform();
  const note = (update: Record<string, unknown>) =>
    ({ sessionId: "session", update }) as SessionNotification;
  for (const id of ["first", "second"])
    transform(
      note({
        sessionUpdate: "tool_call",
        toolCallId: id,
        rawInput: { title: "Same", task: "Same", profile: "subagent_explore", is_background: true },
        _meta: { "cognition.ai/inferenceToolName": "run_subagent" },
      }),
    );
  transform(
    note({
      sessionUpdate: "tool_call_update",
      toolCallId: "native",
      status: "in_progress",
      _meta: {
        "cognition.ai/subagent_started": {
          agentId: "native",
          title: "Same",
          task: "Same",
          profile: "Explore",
          isBackground: true,
        },
      },
    }),
  );
  for (const id of ["first", "second"])
    expect(
      transform(
        note({
          sessionUpdate: "tool_call_update",
          toolCallId: id,
          status: "completed",
          _meta: { "cognition.ai/inferenceToolName": "run_subagent" },
        }),
      ).update,
    ).toMatchObject({ toolCallId: id, status: "completed" });
});

it("marks a failed native completion and keeps duplicate completions from double-finishing", () => {
  const transform = createDevinAcpTransform();
  const note = (update: Record<string, unknown>) =>
    ({ sessionId: "session", update }) as SessionNotification;
  transform(
    note({
      sessionUpdate: "tool_call",
      toolCallId: "call-fail",
      rawInput: { title: "Probe", task: "Task", profile: "subagent_explore" },
      _meta: { "cognition.ai/inferenceToolName": "run_subagent" },
    }),
  );
  transform(
    note({
      sessionUpdate: "tool_call_update",
      toolCallId: "agent-fail",
      status: "in_progress",
      _meta: {
        "cognition.ai/subagent_started": {
          agentId: "agent-fail",
          title: "Probe",
          task: "Task",
          profile: "Explore",
        },
      },
    }),
  );
  const failure = transform(
    note({
      sessionUpdate: "tool_call_update",
      toolCallId: "agent-fail",
      status: "completed",
      _meta: {
        "cognition.ai/subagent_completed": {
          agentId: "agent-fail",
          success: false,
          summary: "Child crashed",
        },
      },
    }),
  );
  expect(failure.update).toMatchObject({
    toolCallId: "call-fail",
    status: "failed",
    rawOutput: "Child crashed",
  });
  const replay = transform(
    note({
      sessionUpdate: "tool_call_update",
      toolCallId: "agent-fail",
      status: "completed",
      _meta: {
        "cognition.ai/subagent_completed": {
          agentId: "agent-fail",
          success: true,
          summary: "Replayed ghost result",
        },
      },
    }),
  );
  // The duplicate passes through unmodified instead of rewriting the failure.
  expect(replay.update).toMatchObject({ toolCallId: "agent-fail" });
  expect((replay.update as { rawOutput?: unknown }).rawOutput).toBeUndefined();
});

it("parents a nested subagent launch to its running parent agent", () => {
  const transform = createDevinAcpTransform();
  const note = (update: Record<string, unknown>) =>
    ({ sessionId: "session", update }) as SessionNotification;
  // Outer subagent: launch → native start.
  transform(
    note({
      sessionUpdate: "tool_call",
      toolCallId: "call-outer",
      rawInput: { title: "Outer", task: "Outer task", profile: "subagent_explore" },
      _meta: { "cognition.ai/inferenceToolName": "run_subagent" },
    }),
  );
  transform(
    note({
      sessionUpdate: "tool_call_update",
      toolCallId: "agent-outer",
      status: "in_progress",
      _meta: {
        "cognition.ai/subagent_started": {
          agentId: "agent-outer",
          title: "Outer",
          task: "Outer task",
          profile: "Explore",
        },
      },
    }),
  );
  // The outer agent launches a child; the launch carries its parent context.
  const nested = transform(
    note({
      sessionUpdate: "tool_call",
      toolCallId: "call-inner",
      rawInput: { title: "Inner", task: "Inner task", profile: "subagent_explore" },
      _meta: {
        "cognition.ai/inferenceToolName": "run_subagent",
        "cognition.ai/subagent_context": { parentAgentId: "agent-outer" },
      },
    }),
  );
  expect((nested.update as Record<string, unknown>)._meta).toMatchObject({
    [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: "call-outer",
  });
  transform(
    note({
      sessionUpdate: "tool_call_update",
      toolCallId: "agent-inner",
      status: "in_progress",
      _meta: {
        "cognition.ai/subagent_started": {
          agentId: "agent-inner",
          title: "Inner",
          task: "Inner task",
          profile: "Explore",
        },
      },
    }),
  );
  // Child output correlates to the inner call, not the outer one.
  const childChunk = transform(
    note({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "partial" },
      _meta: { "cognition.ai/subagent_context": { parentAgentId: "agent-inner" } },
    }),
  );
  expect((childChunk.update as Record<string, unknown>)._meta).toMatchObject({
    [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: "call-inner",
  });
});

it("passes notifications with unobserved vendor metadata through untouched", () => {
  const transform = createDevinAcpTransform();
  const note = (update: Record<string, unknown>) =>
    ({ sessionId: "session", update }) as SessionNotification;
  const unobserved = note({
    sessionUpdate: "tool_call_update",
    toolCallId: "call-x",
    status: "in_progress",
    _meta: { "cognition.ai/chain": { id: "unobserved" } },
  });
  expect(transform(unobserved)).toEqual(unobserved);
});

it("keeps the terminal completion when the coordinator emits child chunks first", () => {
  const note = (update: Record<string, unknown>) =>
    ({ sessionId: "session", update }) as SessionNotification;
  const batch = [
    note({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "child output" },
      _meta: { [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: "call-1" },
    }),
    note({
      sessionUpdate: "tool_call_update",
      toolCallId: "call-1",
      status: "completed",
      rawOutput: "done",
      _meta: { poracodeSubAgentStatus: "completed" },
    }),
  ];
  const terminal = pickDevinSubagentCompletion(
    batch,
    note({ sessionUpdate: "agent_thought_chunk" }),
  );
  expect(terminal.update).toMatchObject({ toolCallId: "call-1", status: "completed" });
  // An empty batch falls back rather than losing the completion entirely.
  const fallback = note({ sessionUpdate: "agent_thought_chunk" });
  expect(pickDevinSubagentCompletion([], fallback)).toBe(fallback);
});

describe("usage_update breakdown annotation", () => {
  const usageNote = (update: Record<string, unknown>) =>
    ({ sessionId: "session", update }) as SessionNotification;

  it("annotates a vendor token split that sums exactly to the authoritative used count", () => {
    const transform = createDevinAcpTransform();
    const transformed = transform(
      usageNote({
        sessionUpdate: "usage_update",
        used: 12_733,
        size: 262_000,
        _meta: { "cognition.ai/inputTokens": 12_659, "cognition.ai/outputTokens": 74 },
      }),
    );
    expect((transformed.update as Record<string, unknown>)._meta).toMatchObject({
      "cognition.ai/inputTokens": 12_659,
      "cognition.ai/outputTokens": 74,
      [PORACODE_ACP_USAGE_BREAKDOWN_META_KEY]: { inputTokens: 12_659, outputTokens: 74 },
    });
  });

  it("annotates an all-zero split against a zero used count", () => {
    const transform = createDevinAcpTransform();
    const transformed = transform(
      usageNote({
        sessionUpdate: "usage_update",
        used: 0,
        size: 262_000,
        _meta: { "cognition.ai/inputTokens": 0, "cognition.ai/outputTokens": 0 },
      }),
    );
    expect((transformed.update as Record<string, unknown>)._meta).toMatchObject({
      [PORACODE_ACP_USAGE_BREAKDOWN_META_KEY]: { inputTokens: 0, outputTokens: 0 },
    });
  });

  it("passes usage_update through untouched when the split is missing, mismatched, or malformed", () => {
    const transform = createDevinAcpTransform();
    const cases = [
      // No vendor metadata at all.
      { sessionUpdate: "usage_update", used: 12_733, size: 262_000 },
      // Sum mismatch must drop the annotation, never fabricate a breakdown.
      {
        sessionUpdate: "usage_update",
        used: 12_733,
        size: 262_000,
        _meta: { "cognition.ai/inputTokens": 12_000, "cognition.ai/outputTokens": 74 },
      },
      // Non-integer / negative / partial vendor fields are rejected strictly.
      {
        sessionUpdate: "usage_update",
        used: 12_733,
        size: 262_000,
        _meta: { "cognition.ai/inputTokens": 12_659.5, "cognition.ai/outputTokens": 73.5 },
      },
      {
        sessionUpdate: "usage_update",
        used: 12_733,
        size: 262_000,
        _meta: { "cognition.ai/inputTokens": -12_659, "cognition.ai/outputTokens": 25_392 },
      },
      {
        sessionUpdate: "usage_update",
        used: 12_733,
        size: 262_000,
        _meta: { "cognition.ai/inputTokens": 12_659 },
      },
      // No authoritative `used`: the split cannot be validated, so no annotation.
      {
        sessionUpdate: "usage_update",
        size: 262_000,
        _meta: { "cognition.ai/inputTokens": 12_659, "cognition.ai/outputTokens": 74 },
      },
    ];
    for (const update of cases) {
      const original = usageNote(update);
      const transformed = transform(original);
      expect(transformed).toEqual(original);
      expect(transformed.update).not.toHaveProperty(
        `_meta.${PORACODE_ACP_USAGE_BREAKDOWN_META_KEY}`,
      );
    }
  });

  it("feeds the annotated breakdown through the shared mapper without changing occupancy", () => {
    const transform = createDevinAcpTransform();
    const state = createAcpMapperState("t-usage-seam");
    const events = mapAcpSessionUpdate(
      transform(
        usageNote({
          sessionUpdate: "usage_update",
          used: 12_733,
          size: 262_000,
          _meta: { "cognition.ai/inputTokens": 12_659, "cognition.ai/outputTokens": 74 },
        }),
      ),
      state,
    );
    expect(events).toEqual([
      {
        type: "context.updated",
        threadId: "t-usage-seam",
        usage: {
          usedTokens: 12_733,
          maxTokens: 262_000,
          breakdown: [
            { id: "input", label: "Input", tokens: 12_659 },
            { id: "output", label: "Output", tokens: 74 },
          ],
        },
      },
    ]);
  });
});
