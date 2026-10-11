import { expect, it, vi } from "vitest";
import type {
  PermissionResult,
  Query,
  SDKMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import {
  createNativeSteerSession,
  nativeSteerConfig as config,
} from "./sdkSessionNativeSteerTestHarness";
import { assistantMessage, flushSdkMessages, resultMessage } from "./sdkSessionTestHarness";

const sdk = vi.hoisted(() => ({
  query: vi.fn<(input: { prompt: AsyncIterable<SDKUserMessage>; options: unknown }) => Query>(),
}));
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: sdk.query }));
vi.mock("../binaryResolver", () => ({ resolveAgentBinaryPath: () => "/test-bin/claude" }));
const createSession = () => createNativeSteerSession(sdk.query);

it.each([false, true])(
  "keeps the steer alive across an aborted generation (echo first: %s)",
  async (echoFirst) => {
    const h = await createSession();
    await h.session.steerTurn("replacement", config);
    const message = (await h.inputs.next()).value!;
    if (echoFirst) await h.echo(message);
    h.output.write({
      ...resultMessage(h.id),
      subtype: "error_during_execution",
      is_error: true,
      user_message_uuid: "original-input",
      errors: ["[ede_diagnostic] result_type=user last_content_type=n/a stop_reason=null"],
    } as SDKMessage);
    h.output.write({
      type: "system",
      subtype: "session_state_changed",
      state: "idle",
      session_id: h.id,
    } as SDKMessage);
    await flushSdkMessages();
    expect(h.updates.at(-1)?.status).toBe("working");
    expect(h.events.filter((e) => e.type === "turn.completed")).toHaveLength(0);
    expect(h.events.filter((e) => e.type === "error")).toHaveLength(0);
    if (!echoFirst) await h.echo(message);
    h.output.write(assistantMessage(h.id, "replacement reply"));
    h.output.write({ ...resultMessage(h.id), user_message_uuid: message.uuid } as SDKMessage);
    await flushSdkMessages();
    expect(h.events.filter((e) => e.type === "turn.started")).toHaveLength(1);
    expect(h.events.filter((e) => e.type === "turn.completed")).toHaveLength(1);
    expect(h.updates.filter((u) => u.status === "idle")).toHaveLength(1);
    expect(h.interrupt).toHaveBeenCalledWith();
  },
);

it("waits for every steer's correlated result before admitting a command barrier", async () => {
  const h = await createSession();
  await h.session.steerTurn("second", config);
  await h.session.steerTurn("third", config);
  const second = (await h.inputs.next()).value!;
  const third = (await h.inputs.next()).value!;
  await h.echo(second);
  await h.echo(third);
  await h.session.steerTurn("/compact", config);
  h.output.write({ ...resultMessage(h.id), user_message_uuid: "original-input" } as SDKMessage);
  h.output.write({ ...resultMessage(h.id), user_message_uuid: second.uuid } as SDKMessage);
  await flushSdkMessages();
  expect(h.events.filter((e) => e.type === "turn.completed")).toHaveLength(0);
  expect(h.setModel).not.toHaveBeenCalled();
  h.output.write({
    ...resultMessage(h.id),
    user_message_uuid: third.uuid,
    user_message_uuids: [second.uuid, third.uuid],
  } as SDKMessage);
  expect((await h.inputs.next()).value?.message.content).toBe("/compact");
  expect(h.events.filter((e) => e.type === "turn.completed")).toHaveLength(1);
});

it.each(["AskUserQuestion", "Bash"])(
  "preserves an open %s callback while admitting a steer",
  async (toolName) => {
    const h = await createSession();
    const options = sdk.query.mock.calls.at(-1)![0].options as {
      canUseTool: import("@anthropic-ai/claude-agent-sdk").CanUseTool;
    };
    const controller = new AbortController();
    const callback = options.canUseTool(
      toolName,
      toolName === "Bash"
        ? { command: "pwd" }
        : {
            questions: [
              {
                question: "Pick one",
                header: "Choice",
                options: [
                  { label: "One", description: "First" },
                  { label: "Two", description: "Second" },
                ],
                multiSelect: false,
              },
            ],
          },
      { signal: controller.signal, toolUseID: "waiting-tool", requestId: "waiting-request" },
    );
    const resolved = vi.fn<(result: PermissionResult | null) => void>();
    void callback.then(resolved);
    await h.session.steerTurn("follow-up", config);
    expect((await h.inputs.next()).value?.priority).toBe("later");
    expect(resolved).not.toHaveBeenCalled();
    expect(h.interrupt).not.toHaveBeenCalled();
    controller.abort();
    await callback;
  },
);

it("Stop cancels a replayed steer even after its original generation ended", async () => {
  const h = await createSession();
  await h.session.steerTurn("pending reply", config);
  const message = (await h.inputs.next()).value!;
  await h.echo(message);
  h.output.write({ ...resultMessage(h.id), user_message_uuid: "original-input" } as SDKMessage);
  await flushSdkMessages();
  await h.session.interruptTurn();
  h.output.write({ ...resultMessage(h.id), user_message_uuid: message.uuid } as SDKMessage);
  await flushSdkMessages();
  expect(h.interrupt).toHaveBeenCalledWith({ cancelQueued: true });
  expect(h.updates.at(-1)?.status).toBe("idle");
  expect(h.events.filter((e) => e.type === "turn.completed")).toHaveLength(1);
});

it("settles a merged replay batch when an older CLI names only its last input", async () => {
  const h = await createSession();
  await h.session.steerTurn("second", config);
  await h.session.steerTurn("third", config);
  const second = (await h.inputs.next()).value!;
  const third = (await h.inputs.next()).value!;
  await h.echo(second);
  await h.echo(third);
  h.output.write({ ...resultMessage(h.id), user_message_uuid: third.uuid } as SDKMessage);
  await flushSdkMessages();
  expect(h.events.filter((e) => e.type === "turn.completed")).toHaveLength(1);
  expect(h.updates.at(-1)?.status).toBe("idle");
});

it.each(["text", "thinking"])(
  "closes an interrupted %s block without retiring its logical turn or live tool",
  async (blockType) => {
    const h = await createSession();
    for (const event of [
      { type: "message_start", message: { id: "original-message" } },
      { type: "content_block_start", index: 0, content_block: { type: blockType } },
      {
        type: "content_block_start",
        index: 1,
        content_block: { type: "tool_use", id: "live-bash", name: "Bash", input: {} },
      },
      { type: "content_block_stop", index: 1 },
    ])
      h.output.write({
        type: "stream_event",
        event,
        session_id: h.id,
        parent_tool_use_id: null,
      } as SDKMessage);
    await flushSdkMessages();
    const item = h.events.find(
      (e) =>
        e.type === "item.started" &&
        e.itemType === (blockType === "text" ? "assistant_message" : "reasoning"),
    );
    expect(item).toBeDefined();
    await h.session.steerTurn("replacement", config);
    const message = (await h.inputs.next()).value!;
    h.output.write({
      ...resultMessage(h.id),
      subtype: "error_during_execution",
      is_error: true,
      user_message_uuid: "original-input",
      errors: ["aborted"],
    } as SDKMessage);
    await flushSdkMessages();
    expect(
      h.events.some(
        (e) =>
          e.type === "item.completed" && item?.type === "item.started" && e.itemId === item.itemId,
      ),
    ).toBe(true);
    expect(h.events.some((e) => e.type === "item.completed" && e.itemId === "live-bash")).toBe(
      false,
    );
    expect(h.events.filter((e) => e.type === "turn.completed")).toHaveLength(0);
    await h.echo(message);
    h.output.write({
      type: "user",
      session_id: h.id,
      parent_tool_use_id: null,
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "live-bash", content: "done" }],
      },
    } as SDKMessage);
    h.output.write(assistantMessage(h.id, "replacement reply"));
    h.output.write({ ...resultMessage(h.id), user_message_uuid: message.uuid } as SDKMessage);
    await flushSdkMessages();
    expect(
      h.events.some(
        (e) =>
          e.type === "content.delta" &&
          e.itemId === "live-bash" &&
          e.stream === "command_output" &&
          e.delta === "done",
      ),
    ).toBe(true);
    expect(h.updates.at(-1)?.status).toBe("idle");
  },
);

it.each([false, true])(
  "settles an unanswered steer on clean stream end (echoed: %s)",
  async (echoed) => {
    const h = await createSession();
    await h.session.steerTurn("unanswered", config);
    const message = (await h.inputs.next()).value!;
    if (echoed) await h.echo(message);
    h.output.write({ ...resultMessage(h.id), user_message_uuid: "original-input" } as SDKMessage);
    await flushSdkMessages();
    h.output.end();
    await flushSdkMessages();
    expect(h.updates.at(-1)?.status).toBe("idle");
    expect(h.events.filter((e) => e.type === "turn.completed")).toHaveLength(1);
  },
);

it.each(["Bash", "Edit"])(
  "closes an abandoned partial %s proposal during steering",
  async (toolName) => {
    const h = await createSession();
    for (const event of [
      { type: "message_start", message: { id: "original" } },
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "abandoned-proposal", name: toolName, input: {} },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '{"command": "sleep' },
      },
    ])
      h.output.write({
        type: "stream_event",
        event,
        session_id: h.id,
        parent_tool_use_id: null,
      } as SDKMessage);
    await flushSdkMessages();
    await h.session.steerTurn("replacement", config);
    const message = (await h.inputs.next()).value!;
    h.output.write({
      ...resultMessage(h.id),
      subtype: "error_during_execution",
      is_error: true,
      user_message_uuid: "original-input",
      errors: ["aborted"],
    } as SDKMessage);
    await h.echo(message);
    h.output.write({
      type: "stream_event",
      event: { type: "message_start", message: { id: "replacement" } },
      session_id: h.id,
      parent_tool_use_id: null,
    } as SDKMessage);
    h.output.write(assistantMessage(h.id, "replacement reply"));
    h.output.write({ ...resultMessage(h.id), user_message_uuid: message.uuid } as SDKMessage);
    await flushSdkMessages();
    expect(
      h.events.filter((e) => e.type === "item.completed" && e.itemId === "abandoned-proposal"),
    ).toEqual([expect.objectContaining({ payload: expect.objectContaining({ status: "error" }) })]);
    expect(h.updates.at(-1)?.status).toBe("idle");
  },
);

it("sends the replacement only after the old generation's interrupt is accepted", async () => {
  const h = await createSession();
  const accepted = Promise.withResolvers<void>();
  h.interrupt.mockReturnValueOnce(accepted.promise);
  const submission = h.session.steerTurn("replacement", config);
  await flushSdkMessages();
  expect(h.interrupt).toHaveBeenCalledWith();
  const delivered = vi.fn<(result: IteratorResult<SDKUserMessage>) => void>();
  void h.inputs.next().then(delivered);
  await flushSdkMessages();
  expect(delivered).not.toHaveBeenCalled();
  accepted.resolve();
  await submission;
  await flushSdkMessages();
  expect(delivered).toHaveBeenCalledWith(
    expect.objectContaining({
      value: expect.objectContaining({
        priority: "now",
        message: expect.objectContaining({ content: "replacement" }),
      }),
    }),
  );
});

it("Stop invalidates a steer waiting for interrupt acceptance", async () => {
  const h = await createSession();
  const accepted = Promise.withResolvers<void>();
  h.interrupt.mockReturnValueOnce(accepted.promise);
  const submission = h.session.steerTurn("must not run", config);
  await flushSdkMessages();
  await h.session.interruptTurn();
  accepted.resolve();
  await submission;
  await h.session.startTurn("replacement", config);
  expect((await h.inputs.next()).value?.message.content).toBe("replacement");
});

it("targets native Send now only after the matching command is admitted", async () => {
  const h = await createSession();
  const request = vi
    .fn<(input: unknown, options: { signal: AbortSignal }) => Promise<unknown>>()
    .mockResolvedValue({ response: { send_now: "stopped" } });
  Object.assign(h.runtime, { request });
  h.output.write({
    type: "system",
    subtype: "init",
    session_id: h.id,
    capabilities: ["interrupt_cancel_queued_v1", "interrupt_send_now_v1", "msg_lifecycle_v1"],
  } as unknown as SDKMessage);
  await flushSdkMessages();
  const submission = h.session.steerTurn("native replacement", config);
  const message = (await h.inputs.next()).value!;
  expect(request).not.toHaveBeenCalled();
  h.output.write({
    type: "command_lifecycle",
    state: "queued",
    command_uuid: message.uuid,
    uuid: "lifecycle-frame-uuid",
    session_id: h.id,
  } as unknown as SDKMessage);
  await submission;
  expect(request).toHaveBeenCalledWith(
    { subtype: "interrupt", send_now: true, message_uuid: message.uuid },
    { signal: expect.any(AbortSignal) },
  );
  expect(h.interrupt).not.toHaveBeenCalled();
});

it("Stop cancels a native steer still waiting for queue admission", async () => {
  const h = await createSession();
  const request = vi.fn<(input: unknown) => Promise<unknown>>().mockResolvedValue({});
  Object.assign(h.runtime, { request });
  h.output.write({
    type: "system",
    subtype: "init",
    session_id: h.id,
    capabilities: ["interrupt_cancel_queued_v1", "interrupt_send_now_v1", "msg_lifecycle_v1"],
  } as unknown as SDKMessage);
  await flushSdkMessages();
  const submission = h.session.steerTurn("must not run", config);
  const message = (await h.inputs.next()).value!;
  await h.session.interruptTurn();
  await submission;
  h.output.write({
    type: "command_lifecycle",
    state: "queued",
    command_uuid: message.uuid,
    session_id: h.id,
  } as unknown as SDKMessage);
  await flushSdkMessages();
  expect(request).not.toHaveBeenCalled();
  expect(h.interrupt).toHaveBeenCalledWith({ cancelQueued: true });
});
