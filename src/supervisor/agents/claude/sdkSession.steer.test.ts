import { afterEach, expect, it, vi } from "vitest";
import type { Query, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { RuntimeEvent, ThreadConfig } from "@/shared/contracts";
import type { StructuredSessionUpdate } from "../base";
import { ClaudeSdkSession } from "./sdkSession";
import { createClaudeTestQuery, flushSdkMessages, resultMessage } from "./sdkSessionTestHarness";

const sdk = vi.hoisted(() => ({
  query: vi.fn<(input: { prompt: AsyncIterable<SDKUserMessage> }) => Query>(),
}));
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: sdk.query }));
vi.mock("../binaryResolver", () => ({ resolveAgentBinaryPath: () => "/test-bin/claude" }));

const config: ThreadConfig = { model: "sonnet", mode: "agent", approvalPolicy: "acceptEdits" };
const sessions: ClaudeSdkSession[] = [];
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.dispose()));
  vi.restoreAllMocks();
});

async function createSession(initialConfig = config) {
  const fake = createClaudeTestQuery();
  sdk.query.mockReturnValue(fake.runtime);
  const events: RuntimeEvent[] = [];
  const updates: StructuredSessionUpdate[] = [];
  const errors: string[] = [];
  const session = await ClaudeSdkSession.create({
    threadId: "claude-steer",
    projectLocation: { kind: "posix", path: process.cwd() },
    config: initialConfig,
    presentationMode: "gui",
  });
  sessions.push(session);
  session.setListener({
    onRuntimeEvent: (event) => events.push(event),
    onUpdate: (update) => updates.push(update),
    onError: (error) => errors.push(error),
    onClose: () => {},
  });
  const id = await session.openThread(initialConfig);
  const inputs = sdk.query.mock.calls.at(-1)![0].prompt[Symbol.asyncIterator]();
  return { ...fake, session, id, inputs, events, updates, errors };
}

it.each(["second prompt", "/compact", "/goal finish the task", "/clear"])(
  "preserves live Bash output before delivering %s",
  async (prompt) => {
    const h = await createSession();
    await h.session.startTurn("first", config);
    await h.inputs.next();
    h.output.write({
      type: "assistant",
      uuid: "bash-message",
      session_id: h.id,
      parent_tool_use_id: null,
      message: {
        id: "bash-message",
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "bash-tool",
            name: "Bash",
            input: { command: "sleep 1; echo done" },
          },
        ],
      },
    } as unknown as SDKMessage);
    await flushSdkMessages();
    const tool = h.events.find(
      (event) => event.type === "item.started" && event.itemType === "command_execution",
    );
    expect(tool).toBeDefined();
    const nextInput = vi.fn<(result: IteratorResult<SDKUserMessage>) => void>();
    void h.inputs.next().then(nextInput);
    await h.session.steerTurn(prompt, config, undefined, { userMessageItemId: "steer-row" });
    await flushSdkMessages();
    expect(nextInput).not.toHaveBeenCalled();
    expect(h.events.filter((event) => event.type === "turn.started")).toHaveLength(1);
    expect(
      h.events.filter((event) => event.type === "item.started" && event.itemId === "steer-row"),
    ).toHaveLength(1);
    expect(h.interrupt).not.toHaveBeenCalled();

    h.output.write({
      type: "user",
      session_id: h.id,
      parent_tool_use_id: null,
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "bash-tool",
            content: "done",
            is_error: prompt === "/clear",
          },
        ],
      },
    } as unknown as SDKMessage);
    h.output.write(resultMessage(h.id));
    await flushSdkMessages();
    expect(h.events).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        itemId: tool?.type === "item.started" ? tool.itemId : "",
        payload: expect.objectContaining({
          command: "sleep 1; echo done",
          ...(prompt === "/clear" ? { status: "error" } : {}),
        }),
      }),
    );
    expect(h.events).toContainEqual(
      expect.objectContaining({
        type: "content.delta",
        itemId: "bash-tool",
        stream: "command_output",
        delta: "done",
      }),
    );
    expect(h.events).toContainEqual(
      expect.objectContaining({ type: "item.completed", itemId: "bash-tool" }),
    );
    expect(nextInput.mock.calls[0]?.[0].value.message.content).toBe(prompt);
    expect(h.events.filter((event) => event.type === "turn.started")).toHaveLength(2);
    const userRows = h.events.filter(
      (event) => event.type === "item.started" && event.itemType === "user_message",
    );
    expect(
      new Set(userRows.flatMap((event) => (event.type === "item.started" ? [event.itemId] : [])))
        .size,
    ).toBe(2);
    expect(h.updates.every((update) => update.status !== "idle")).toBe(true);
    expect(
      h.events.filter(
        (event) => event.type === "item.started" && event.itemId.startsWith("compact-"),
      ),
    ).toHaveLength(prompt === "/compact" ? 1 : 0);
  },
);

it("uses normal turn accounting when steering an idle session", async () => {
  const h = await createSession();
  await h.session.steerTurn("first", config);
  expect((await h.inputs.next()).value?.message.content).toBe("first");
  expect(h.events.filter((event) => event.type === "turn.started")).toHaveLength(1);
});

it.each([
  { initial: config, next: { ...config, mode: "plan" as const }, permission: "plan" },
  { initial: { ...config, mode: "plan" as const }, next: config, permission: "acceptEdits" },
  { initial: config, next: { ...config, approvalPolicy: "default" }, permission: "default" },
])("applies $permission before delivering a follow-up", async ({ initial, next, permission }) => {
  const h = await createSession(initial);
  await h.session.startTurn("first", initial);
  await h.inputs.next();
  const changed = { ...next, model: "opus", effort: "ultracode", fast: true };
  await h.session.steerTurn("second", changed, [{ kind: "text", content: "second" }], {
    inlineInstructions: "private instructions",
  });
  h.output.write(resultMessage(h.id));
  const delivered = await h.inputs.next();
  expect(h.setPermissionMode).toHaveBeenLastCalledWith(permission);
  expect(h.setModel).toHaveBeenLastCalledWith("opus");
  expect(h.applyFlagSettings).toHaveBeenCalledWith({ ultracode: true });
  expect(h.applyFlagSettings).toHaveBeenCalledWith({ fastMode: true });
  expect(delivered.value?.message.content).toEqual([
    { type: "text", text: "second" },
    { type: "text", text: "private instructions" },
  ]);
  expect(JSON.stringify(h.events)).not.toContain("private instructions");
});

it("delivers multiple accepted steers in order without an idle gap", async () => {
  const h = await createSession();
  await h.session.startTurn("first", config);
  await h.inputs.next();
  await h.session.steerTurn("second", config);
  await h.session.steerTurn("third", config);
  for (const prompt of ["second", "third"]) {
    h.output.write(resultMessage(h.id));
    expect((await h.inputs.next()).value?.message.content).toBe(prompt);
    h.output.write({
      type: "system",
      subtype: "session_state_changed",
      state: "idle",
      session_id: h.id,
    } as unknown as SDKMessage);
    await flushSdkMessages();
    expect(h.updates.at(-1)?.status).toBe("working");
  }
  h.output.write(resultMessage(h.id));
  await flushSdkMessages();
  expect(h.updates.at(-1)?.status).toBe("idle");
});

it.each(["interruptTurn", "forceCompleteTurn", "dispose"] as const)(
  "%s cancels pending steers",
  async (action) => {
    const h = await createSession();
    await h.session.startTurn("first", config);
    await h.inputs.next();
    await h.session.steerTurn("cancelled", config);
    const nextInput = vi.fn<(result: IteratorResult<SDKUserMessage>) => void>();
    void h.inputs.next().then(nextInput);
    await h.session[action]();
    h.output.write(resultMessage(h.id));
    await flushSdkMessages();
    expect(nextInput.mock.calls.every(([result]) => result.done)).toBe(true);
    expect(h.events.filter((event) => event.type === "turn.started")).toHaveLength(1);
  },
);

it.each([false, true])(
  "Stop suppresses cancelled follow-up delivery and errors (missing attachment: %s)",
  async (missingAttachment) => {
    const h = await createSession();
    await h.session.startTurn("first", config);
    await h.inputs.next();
    let release!: () => void;
    h.setModel.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    await h.session.steerTurn(
      "cancelled",
      { ...config, model: "opus" },
      missingAttachment
        ? [{ kind: "attachment", path: "/missing-steer-fixture.png", mimeType: "image/png" }]
        : undefined,
    );
    const pendingBuild = vi.spyOn(h.session, "startTurn");
    h.output.write(resultMessage(h.id));
    await flushSdkMessages();
    expect(h.setModel).toHaveBeenCalledWith("opus");
    await h.session.interruptTurn();
    await h.session.startTurn("replacement", config);
    expect((await h.inputs.next()).value?.message.content).toBe("replacement");
    release();
    await pendingBuild.mock.results[0]!.value.catch(() => {});
    expect(h.errors).toEqual([]);
    expect(h.updates.at(-1)?.status).toBe("working");
    const nextInput = vi.fn<(result: IteratorResult<SDKUserMessage>) => void>();
    void h.inputs.next().then(nextInput);
    await flushSdkMessages();
    expect(nextInput).not.toHaveBeenCalled();
  },
);

it("drops pending steers when the active turn fails", async () => {
  const h = await createSession();
  await h.session.startTurn("first", config);
  await h.inputs.next();
  await h.session.steerTurn("cancelled", config);
  h.output.write({
    ...resultMessage(h.id),
    subtype: "error_during_execution",
    errors: ["upstream failure"],
    is_error: true,
  } as SDKMessage);
  await flushSdkMessages();
  expect(h.updates.at(-1)?.status).toBe("error");
  expect(h.events.filter((event) => event.type === "turn.started")).toHaveLength(1);
});

it("surfaces a failed follow-up attachment and discards later steers", async () => {
  const h = await createSession();
  await h.session.startTurn("first", config);
  await h.inputs.next();
  await h.session.steerTurn("second", config, [
    {
      kind: "attachment",
      path: "/missing-steer-fixture.png",
      mimeType: "image/png",
    },
  ]);
  await h.session.steerTurn("third", config);
  h.output.write(resultMessage(h.id));
  await vi.waitFor(() => expect(h.errors).toHaveLength(1));
  expect(h.updates.at(-1)?.status).toBe("error");
  expect(h.events.filter((event) => event.type === "turn.started")).toHaveLength(2);
});
