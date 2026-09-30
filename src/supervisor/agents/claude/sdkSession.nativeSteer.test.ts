import { afterEach, expect, it, vi } from "vitest";
import type { Query, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { RuntimeEvent, ThreadConfig } from "@/shared/contracts";
import type { StructuredSessionUpdate } from "../base";
import { ClaudeSdkSession } from "./sdkSession";
import * as prompts from "./sdkPrompt";
import {
  assistantMessage,
  createClaudeTestQuery,
  flushSdkMessages,
  resultMessage,
} from "./sdkSessionTestHarness";

const sdk = vi.hoisted(() => ({
  query: vi.fn<(input: { prompt: AsyncIterable<SDKUserMessage>; options: unknown }) => Query>(),
}));
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: sdk.query }));
vi.mock("../binaryResolver", () => ({ resolveAgentBinaryPath: () => "/test-bin/claude" }));
const config: ThreadConfig = { model: "sonnet", mode: "agent", approvalPolicy: "acceptEdits" };
const sessions: ClaudeSdkSession[] = [];
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((s) => s.dispose()));
  vi.restoreAllMocks();
});
async function createSession() {
  const fake = createClaudeTestQuery();
  sdk.query.mockReturnValue(fake.runtime);
  const events: RuntimeEvent[] = [];
  const updates: StructuredSessionUpdate[] = [];
  const session = await ClaudeSdkSession.create({
    threadId: "native-steer",
    projectLocation: { kind: "posix", path: process.cwd() },
    config,
    presentationMode: "gui",
  });
  sessions.push(session);
  session.setListener({
    onRuntimeEvent: (e) => events.push(e),
    onUpdate: (u) => updates.push(u),
    onError: () => {},
    onClose: () => {},
  });
  const id = await session.openThread(config);
  const inputs = sdk.query.mock.calls.at(-1)![0].prompt[Symbol.asyncIterator]();
  fake.output.write({
    type: "system",
    subtype: "init",
    session_id: id,
    capabilities: ["interrupt_cancel_queued_v1"],
  } as unknown as SDKMessage);
  await flushSdkMessages();
  await session.startTurn("first", config);
  await inputs.next();
  const echo = async (message: SDKUserMessage) => {
    fake.output.write({ ...message, session_id: id, isReplay: true } as SDKMessage);
    await flushSdkMessages();
  };
  return { ...fake, session, id, inputs, events, updates, echo };
}

it("delivers at the tool boundary and keeps one turn with intact live Bash output", async () => {
  const h = await createSession();
  h.output.write({
    type: "assistant",
    uuid: "bash",
    session_id: h.id,
    parent_tool_use_id: null,
    message: {
      id: "bash",
      role: "assistant",
      content: [
        { type: "tool_use", id: "tool", name: "Bash", input: { command: "sleep 3; echo done" } },
      ],
    },
  } as unknown as SDKMessage);
  await flushSdkMessages();
  await h.session.steerTurn("skip the remaining commands", config, undefined, {
    userMessageItemId: "steer-row",
  });
  const message = (await h.inputs.next()).value!;
  expect(message).toMatchObject({
    priority: "next",
    uuid: expect.any(String),
    message: { content: "skip the remaining commands" },
  });
  expect(h.interrupt).not.toHaveBeenCalled();
  h.output.write({
    type: "user",
    session_id: h.id,
    parent_tool_use_id: null,
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "tool", content: "done" }],
    },
  } as unknown as SDKMessage);
  await h.echo(message);
  h.output.write(assistantMessage(h.id, "steered response"));
  h.output.write(resultMessage(h.id));
  await flushSdkMessages();
  expect(h.events.filter((e) => e.type === "turn.started")).toHaveLength(1);
  expect(h.events.filter((e) => e.type === "turn.completed")).toHaveLength(1);
  expect(h.events).toContainEqual(
    expect.objectContaining({
      type: "content.delta",
      itemId: "tool",
      stream: "command_output",
      delta: "done",
    }),
  );
  expect(
    h.events.filter((e) => e.type === "item.started" && e.itemId === "steer-row"),
  ).toHaveLength(1);
  expect(h.updates.at(-1)?.status).toBe("idle");
});

it("holds working across the first result until a queued steer is replayed and answered", async () => {
  const h = await createSession();
  await h.session.steerTurn("second", config);
  const message = (await h.inputs.next()).value!;
  h.output.write(resultMessage(h.id));
  h.output.write({
    type: "system",
    subtype: "session_state_changed",
    state: "idle",
    session_id: h.id,
  } as unknown as SDKMessage);
  await flushSdkMessages();
  expect(h.updates.at(-1)?.status).toBe("working");
  await h.echo(message);
  h.output.write(assistantMessage(h.id, "second reply"));
  h.output.write(resultMessage(h.id));
  await flushSdkMessages();
  expect(h.events.filter((e) => e.type === "turn.started")).toHaveLength(2);
  expect(h.events.filter((e) => e.type === "turn.completed")).toHaveLength(2);
  expect(h.updates.filter((u) => u.status === "idle")).toHaveLength(1);
});

it("accounts for multiple steers coalesced into one subsequent SDK turn", async () => {
  const h = await createSession();
  await Promise.all([h.session.steerTurn("second", config), h.session.steerTurn("third", config)]);
  const second = (await h.inputs.next()).value!;
  const third = (await h.inputs.next()).value!;
  expect(second.message.content).toBe("second");
  expect(third.message.content).toBe("third");
  h.output.write(resultMessage(h.id));
  await flushSdkMessages();
  await h.echo(second);
  await h.echo(third);
  h.output.write(assistantMessage(h.id, "combined"));
  h.output.write(resultMessage(h.id));
  await flushSdkMessages();
  expect(h.events.filter((e) => e.type === "turn.started")).toHaveLength(2);
  expect(h.updates.at(-1)?.status).toBe("idle");
});

it("Stop cancels SDK-queued steers and clears input not yet read by the SDK", async () => {
  const h = await createSession();
  await h.session.steerTurn("already delivered", config);
  await h.inputs.next();
  await h.session.steerTurn("not read yet", config);
  await h.session.interruptTurn();
  expect(h.interrupt).toHaveBeenCalledWith({ cancelQueued: true });
  h.output.write(resultMessage(h.id));
  await flushSdkMessages();
  expect(h.updates.at(-1)?.status).toBe("idle");
  await h.session.startTurn("replacement", config);
  expect((await h.inputs.next()).value?.message.content).toBe("replacement");
});

it.each(["/compact", "config"])(
  "keeps %s and later input behind previously delivered steers",
  async (barrier) => {
    const h = await createSession();
    await h.session.steerTurn("native", config);
    const native = (await h.inputs.next()).value!;
    const changed = barrier === "config" ? { ...config, model: "opus" } : config;
    await h.session.steerTurn(barrier, changed);
    await h.session.steerTurn("after barrier", changed);
    h.output.write(resultMessage(h.id));
    await flushSdkMessages();
    expect(h.setModel).not.toHaveBeenCalledWith("opus");
    await h.echo(native);
    h.output.write(resultMessage(h.id));
    expect((await h.inputs.next()).value?.message.content).toBe(barrier);
    h.output.write(resultMessage(h.id));
    expect((await h.inputs.next()).value?.message.content).toBe("after barrier");
    h.output.write(resultMessage(h.id));
    await flushSdkMessages();
    expect(h.updates.at(-1)?.status).toBe("idle");
  },
);

it("cancels queued SDK input on an upstream turn failure", async () => {
  const h = await createSession();
  await h.session.steerTurn("pending", config);
  await h.inputs.next();
  h.output.write({
    ...resultMessage(h.id),
    subtype: "error_during_execution",
    is_error: true,
    errors: ["upstream failure"],
  } as SDKMessage);
  await flushSdkMessages();
  expect(h.interrupt).toHaveBeenCalledWith({ cancelQueued: true });
  expect(h.updates.at(-1)?.status).toBe("error");
});

it.each(["failure", "stop", "stream-close", "stream-error"])(
  "%s invalidates a steer still preparing an attachment",
  async (outcome) => {
    const h = await createSession();
    const build = Promise.withResolvers<SDKUserMessage>();
    vi.spyOn(prompts, "buildSdkUserMessage").mockReturnValueOnce(build.promise);
    const submission = h.session.steerTurn("delayed attachment", config);
    await flushSdkMessages();
    if (outcome === "failure") {
      h.output.write({
        ...resultMessage(h.id),
        subtype: "error_during_execution",
        is_error: true,
        errors: ["upstream failure"],
      } as SDKMessage);
    } else if (outcome === "stop") {
      await h.session.interruptTurn();
      h.output.write(resultMessage(h.id));
    } else if (outcome === "stream-close") {
      h.output.end();
    } else {
      h.output.destroy(new Error("stream failed"));
    }
    await flushSdkMessages();
    build.resolve({
      type: "user",
      parent_tool_use_id: null,
      message: { role: "user", content: "must not run" },
    });
    await submission;
    const delivered = vi.fn<(result: IteratorResult<SDKUserMessage>) => void>();
    void h.inputs.next().then(delivered);
    await flushSdkMessages();
    expect(delivered).not.toHaveBeenCalled();
  },
);

it.each([false, true])(
  "a rejected steer settles error and discards later input (preceding result: %s)",
  async (precedingResult) => {
    const h = await createSession();
    const build = Promise.withResolvers<SDKUserMessage>();
    vi.spyOn(prompts, "buildSdkUserMessage").mockReturnValueOnce(build.promise);
    const submission = h.session.steerTurn("missing attachment", config);
    const rejected = submission.catch((error: unknown) => error);
    const later = h.session.steerTurn("must not run", config);
    await flushSdkMessages();
    if (precedingResult) {
      h.output.write(resultMessage(h.id));
      await flushSdkMessages();
    }
    build.reject(new Error("attachment missing"));
    expect(await rejected).toEqual(new Error("attachment missing"));
    await later;
    expect(h.updates.at(-1)?.status).toBe("error");
    expect(h.updates.some((u) => u.status === "idle")).toBe(false);
    expect(h.interrupt).toHaveBeenCalledWith({ cancelQueued: true });
    if (!precedingResult) {
      h.output.write(resultMessage(h.id));
      await flushSdkMessages();
    }
    expect(h.updates.at(-1)?.status).toBe("error");
    await h.session.startTurn("retry", config);
    expect((await h.inputs.next()).value?.message.content).toBe("retry");
  },
);

it("ignores a retired query closing after rollback has queued replacement input", async () => {
  const h = await createSession();
  vi.spyOn(h.runtime, "close").mockImplementation(() => {});
  h.output.write(assistantMessage(h.id, "first-anchor"));
  h.output.write(resultMessage(h.id));
  await flushSdkMessages();
  await h.session.startTurn("second", config);
  await h.inputs.next();
  h.output.write(assistantMessage(h.id, "second-anchor"));
  h.output.write(resultMessage(h.id));
  await flushSdkMessages();
  const replacement = createClaudeTestQuery();
  sdk.query.mockReturnValue(replacement.runtime);
  await h.session.rollbackThread(1);
  await h.session.startTurn("replacement input", config);
  h.output.end();
  await flushSdkMessages();
  const replacementInputs = sdk.query.mock.calls.at(-1)![0].prompt[Symbol.asyncIterator]();
  expect((await replacementInputs.next()).value?.message.content).toBe("replacement input");
  expect(h.updates.at(-1)?.status).toBe("working");
});
