import { describe, expect, it } from "vitest";
import {
  asPermissionRequestDetails,
  commandExecutionPayloadSchema,
  fileChangePayloadSchema,
  goalItemPayloadSchema,
  messageItemPayloadSchema,
  planItemPayloadSchema,
  questionAnswerItemPayloadSchema,
  runtimeEventSchema,
  toolCallPayloadSchema,
  webSearchPayloadSchema,
} from "./runtimeEvent";
import { promptSegmentSchema } from "./thread";

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("runtimeEventSchema discriminated union", () => {
  it("keeps pre-thread message blocks valid and accepts thread blocks", () => {
    const oldShape = { content: [{ kind: "mcp", name: "Browser" }] };
    expect(messageItemPayloadSchema.parse(roundTrip(oldShape))).toEqual(oldShape);
    // Pre-flag payloads (no `displayAuthoritative`) and flagged ones both
    // round-trip; readers treat a missing flag as stream-first.
    const flagged = { content: [{ kind: "text", text: "" }], displayAuthoritative: true };
    expect(messageItemPayloadSchema.parse(roundTrip(flagged))).toEqual(flagged);
    expect(promptSegmentSchema.parse({ kind: "mcp", id: "browser", name: "Browser" })).toEqual({
      kind: "mcp",
      id: "browser",
      name: "Browser",
    });
    expect(
      messageItemPayloadSchema.parse({
        content: [{ kind: "thread", threadId: "thread-1", title: "Source thread" }],
      }),
    ).toEqual({
      content: [{ kind: "thread", threadId: "thread-1", title: "Source thread" }],
    });
  });

  it("accepts session.started with and without turnId", () => {
    expect(runtimeEventSchema.parse(roundTrip({ type: "session.started", threadId: "t" }))).toEqual(
      { type: "session.started", threadId: "t" },
    );
    const withTurn = { type: "session.started", threadId: "t", turnId: "turn-1" };
    expect(runtimeEventSchema.parse(roundTrip(withTurn))).toEqual(withTurn);
  });

  it("accepts session.exited with optional reason", () => {
    const withReason = { type: "session.exited", threadId: "t", reason: "ctrl-c" };
    expect(runtimeEventSchema.parse(roundTrip(withReason))).toEqual(withReason);
    expect(runtimeEventSchema.parse(roundTrip({ type: "session.exited", threadId: "t" }))).toEqual({
      type: "session.exited",
      threadId: "t",
    });
  });

  it("requires turnId on turn.started and turn.completed", () => {
    expect(runtimeEventSchema.safeParse({ type: "turn.started", threadId: "t" }).success).toBe(
      false,
    );
    expect(
      runtimeEventSchema.safeParse({
        type: "turn.completed",
        threadId: "t",
        turnId: "x",
        state: "not-a-real-state",
      }).success,
    ).toBe(false);
    expect(
      runtimeEventSchema.parse(
        roundTrip({ type: "turn.completed", threadId: "t", turnId: "x", state: "completed" }),
      ),
    ).toEqual({ type: "turn.completed", threadId: "t", turnId: "x", state: "completed" });
  });

  it("round-trips every item.* event with a representative payload", () => {
    const started = {
      type: "item.started",
      threadId: "t",
      itemId: "i",
      itemType: "assistant_message",
      payload: { content: [{ kind: "text", text: "hi" }] },
      parentItemId: "parent-1",
    };
    expect(runtimeEventSchema.parse(roundTrip(started))).toEqual(started);

    const updated = {
      type: "item.updated",
      threadId: "t",
      itemId: "i",
      payload: { content: [{ kind: "text", text: "hi world" }] },
    };
    expect(runtimeEventSchema.parse(roundTrip(updated))).toEqual(updated);

    const completed = {
      type: "item.completed",
      threadId: "t",
      itemId: "i",
      payload: { content: [{ kind: "text", text: "done" }] },
    };
    expect(runtimeEventSchema.parse(roundTrip(completed))).toEqual(completed);
  });

  it("rejects unknown itemType on item.started", () => {
    const result = runtimeEventSchema.safeParse({
      type: "item.started",
      threadId: "t",
      itemId: "i",
      itemType: "definitely-not-a-real-item-type",
    });
    expect(result.success).toBe(false);
  });

  it("requires stream and delta on content.delta", () => {
    const valid = {
      type: "content.delta",
      threadId: "t",
      itemId: "i",
      stream: "assistant_text",
      delta: "tok",
    };
    expect(runtimeEventSchema.parse(roundTrip(valid))).toEqual(valid);

    expect(
      runtimeEventSchema.safeParse({
        type: "content.delta",
        threadId: "t",
        itemId: "i",
        stream: "bogus_stream",
        delta: "tok",
      }).success,
    ).toBe(false);
  });

  it("round-trips context.updated with breakdown entries", () => {
    const event = {
      type: "context.updated",
      threadId: "t",
      usage: {
        usedTokens: 1024,
        maxTokens: 200_000,
        breakdown: [
          { id: "system", label: "System", tokens: 500 },
          { id: "history", label: "History", tokens: 524 },
        ],
      },
    };
    expect(runtimeEventSchema.parse(roundTrip(event))).toEqual(event);
  });

  it("rejects context.updated with maxTokens=0 (positive constraint)", () => {
    expect(
      runtimeEventSchema.safeParse({
        type: "context.updated",
        threadId: "t",
        usage: { maxTokens: 0 },
      }).success,
    ).toBe(false);
  });

  it("round-trips request.opened with a full requestPayload including options", () => {
    const event = {
      type: "request.opened",
      threadId: "t",
      requestId: "r1",
      requestType: "tool_user_input",
      payload: {
        summary: "Pick one",
        details: { freeform: true },
        options: [
          { optionId: "a", label: "A", description: "first" },
          { optionId: "b", label: "B" },
        ],
        multiSelect: true,
      },
    };
    expect(runtimeEventSchema.parse(roundTrip(event))).toEqual(event);
  });

  it("rejects request.opened with an unknown requestType", () => {
    expect(
      runtimeEventSchema.safeParse({
        type: "request.opened",
        threadId: "t",
        requestId: "r1",
        requestType: "not-a-real-request-type",
        payload: { summary: "" },
      }).success,
    ).toBe(false);
  });

  it("round-trips request.resolved with each outcome value", () => {
    for (const outcome of ["accepted", "declined", "answered", "cancelled"] as const) {
      const event = { type: "request.resolved", threadId: "t", requestId: "r1", outcome };
      expect(runtimeEventSchema.parse(roundTrip(event))).toEqual(event);
    }
  });

  it("round-trips warning and error events", () => {
    const warn = { type: "warning", threadId: "t", message: "be careful" };
    const err = { type: "error", threadId: "t", message: "broke" };
    expect(runtimeEventSchema.parse(roundTrip(warn))).toEqual(warn);
    expect(runtimeEventSchema.parse(roundTrip(err))).toEqual(err);
  });

  it("rejects an event without a discriminator", () => {
    expect(runtimeEventSchema.safeParse({ threadId: "t" }).success).toBe(false);
  });

  it("rejects an event with an unknown discriminator", () => {
    expect(runtimeEventSchema.safeParse({ type: "unicorn.spotted", threadId: "t" }).success).toBe(
      false,
    );
  });
});

describe("item payload schemas", () => {
  it("messageItemPayload round-trips text + image + file blocks", () => {
    const payload = {
      content: [
        { kind: "text", text: "hello" },
        {
          kind: "image",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,xx",
          path: "/p",
          name: "shot.png",
          source: "attachment",
        },
        { kind: "file", path: "/etc/hosts", source: "mention" },
      ],
    };
    expect(messageItemPayloadSchema.parse(roundTrip(payload))).toEqual(payload);
  });

  it("messageItemPayload rejects an unknown content kind", () => {
    expect(
      messageItemPayloadSchema.safeParse({ content: [{ kind: "video", url: "x" }] }).success,
    ).toBe(false);
  });

  it("planItemPayload accepts each step status", () => {
    const payload = {
      steps: [
        { step: "scout", status: "pending" },
        { step: "build", status: "in_progress" },
        { step: "land", status: "completed" },
      ],
    };
    expect(planItemPayloadSchema.parse(roundTrip(payload))).toEqual(payload);
  });

  it("goalItemPayload allows nullable tokenBudget and rejects negative tokensUsed", () => {
    const payload = {
      action: "set",
      objective: "ship it",
      status: "active",
      tokenBudget: null,
      tokensUsed: 0,
    };
    expect(goalItemPayloadSchema.parse(roundTrip(payload))).toEqual(payload);
    expect(goalItemPayloadSchema.parse({ status: "failed" })).toEqual({ status: "failed" });
    expect(goalItemPayloadSchema.parse({ status: "cancelled" })).toEqual({
      status: "cancelled",
    });
    expect(goalItemPayloadSchema.safeParse({ tokensUsed: -1 }).success).toBe(false);
  });

  it("commandExecutionPayload requires command and optionally carries exitCode", () => {
    const payload = {
      command: "ls -la",
      cwd: "/tmp",
      exitCode: 0,
      durationMs: 12,
      status: "success",
    };
    expect(commandExecutionPayloadSchema.parse(roundTrip(payload))).toEqual(payload);
    expect(commandExecutionPayloadSchema.safeParse({ cwd: "/tmp" }).success).toBe(false);
  });

  it("fileChangePayload enforces nonnegative diff counts", () => {
    const payload = {
      path: "src/x.ts",
      changeKind: "edit",
      diffSummary: { added: 3, removed: 0 },
      status: "success",
    };
    expect(fileChangePayloadSchema.parse(roundTrip(payload))).toEqual(payload);
    expect(
      fileChangePayloadSchema.safeParse({
        path: "src/x.ts",
        changeKind: "edit",
        diffSummary: { added: -1, removed: 0 },
      }).success,
    ).toBe(false);
  });

  it("toolCallPayload requires status and accepts optional sub-agent progress", () => {
    const payload = {
      name: "Bash",
      title: "list files",
      kind: "execute",
      args: { command: "ls" },
      result: "ok",
      status: "success",
      progress: {
        description: "running",
        model: "opus",
        effort: "high",
        tokens: 100,
        stepCount: 2,
      },
      isSubAgent: true,
    };
    expect(toolCallPayloadSchema.parse(roundTrip(payload))).toEqual(payload);
    expect(
      toolCallPayloadSchema.parse({
        name: "Crossagent",
        status: "error",
        isCrossagent: true,
        crossagentStatus: "cancelled",
      }),
    ).toEqual({
      name: "Crossagent",
      status: "error",
      isCrossagent: true,
      crossagentStatus: "cancelled",
    });
    expect(toolCallPayloadSchema.safeParse({ name: "Bash" }).success).toBe(false);
  });

  it("toolCallPayload rejects an unknown kind", () => {
    expect(
      toolCallPayloadSchema.safeParse({ name: "X", status: "success", kind: "compile" }).success,
    ).toBe(false);
  });

  it("webSearchPayload requires query", () => {
    expect(webSearchPayloadSchema.parse({ query: "hello", resultCount: 5 })).toEqual({
      query: "hello",
      resultCount: 5,
    });
    expect(webSearchPayloadSchema.safeParse({ resultCount: 1 }).success).toBe(false);
  });

  it("questionAnswerItemPayload round-trips with empty selections", () => {
    const payload = {
      questions: [
        { header: "h", question: "?", selected: [] },
        {
          header: "h2",
          question: "?2",
          selected: [{ label: "yes" }, { label: "no", description: "skip" }],
          customAnswer: "maybe",
        },
      ],
    };
    expect(questionAnswerItemPayloadSchema.parse(roundTrip(payload))).toEqual(payload);
  });
});

describe("asPermissionRequestDetails", () => {
  it("decodes a well-formed permission details object", () => {
    const decoded = asPermissionRequestDetails({
      toolName: "Bash",
      displayName: "Run command",
      input: { command: "rm -rf /" },
      suggestions: [
        {
          type: "setMode",
          mode: "acceptEdits",
          destination: "session",
        },
      ],
    });
    expect(decoded?.toolName).toBe("Bash");
    expect(decoded?.suggestions?.[0]).toEqual({
      type: "setMode",
      mode: "acceptEdits",
      destination: "session",
    });
  });

  it("returns undefined for non-object input", () => {
    expect(asPermissionRequestDetails(null)).toBeUndefined();
    expect(asPermissionRequestDetails(undefined)).toBeUndefined();
    expect(asPermissionRequestDetails("string")).toBeUndefined();
    expect(asPermissionRequestDetails(42)).toBeUndefined();
  });

  it("returns undefined when toolName is missing (does not throw)", () => {
    expect(asPermissionRequestDetails({ displayName: "X" })).toBeUndefined();
  });

  it("returns undefined when a suggestion has an unknown type", () => {
    expect(
      asPermissionRequestDetails({
        toolName: "Bash",
        suggestions: [{ type: "nuke", destination: "session" }],
      }),
    ).toBeUndefined();
  });
});
