import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadSessionResponse, SessionConfigOption } from "@agentclientprotocol/sdk";
import * as promptContent from "./sessionContentBlocks";
import {
  createReplaySession,
  REPLAY_CONFIG,
  REPLAY_OPEN_UPDATES,
  REPLAY_SESSION_ID,
  REPLAY_SESSION_REF,
} from "./sessionReplay.testFixtures";

const NOW = Date.parse("2026-10-09T12:00:00.000Z");
const OPTIMISTIC_ID = "optimistic-follow-up";
type Fixture = ReturnType<typeof createReplaySession>;

function thoughtOptions(value: string): SessionConfigOption[] {
  return [
    {
      id: "replayed-effort",
      name: "Thought level",
      category: "thought_level",
      type: "select",
      currentValue: value,
      options: [
        { value: "low", name: "Low" },
        { value: "high", name: "High" },
      ],
    },
  ];
}

function expectSuppressedActivity(fixture: Fixture, marker: string) {
  const events = fixture.listener.onRuntimeEvent.mock.calls.length;
  const updates = fixture.listener.onUpdate.mock.calls.length;
  fixture.activity(marker);
  expect(fixture.listener.onRuntimeEvent).toHaveBeenCalledTimes(events);
  expect(fixture.listener.onUpdate).toHaveBeenCalledTimes(updates);
}

function expectOpenMetadata(fixture: Fixture) {
  expect(fixture.listener.onUpdate.mock.calls.map(([update]) => update)).toEqual(
    REPLAY_OPEN_UPDATES,
  );
}

function replyImmediately(fixture: Fixture) {
  fixture.promptReply.mockImplementationOnce(async () => {
    expect(Date.now()).toBe(NOW);
    fixture.activity("live");
    return { stopReason: "end_turn" };
  });
}

function expectCanonicalReply(fixture: Fixture) {
  const events = fixture.listener.onRuntimeEvent.mock.calls.map(([event]) => event);
  expect(events.filter((event) => event.type === "turn.started")).toHaveLength(1);
  const userItems = events.filter(
    (event) => event.type === "item.started" && event.itemType === "user_message",
  );
  expect(userItems).toEqual([
    expect.objectContaining({
      itemId: OPTIMISTIC_ID,
      payload: { content: [{ kind: "text", text: "continue" }] },
    }),
  ]);
  expect(
    events.filter((event) => event.type === "item.completed" && event.itemId === OPTIMISTIC_ID),
  ).toEqual([expect.objectContaining({ type: "item.completed", itemId: OPTIMISTIC_ID })]);
  expect(events.filter((event) => event.type === "content.delta")).toEqual([
    expect.objectContaining({ stream: "assistant_text", delta: "live reply" }),
    expect.objectContaining({ stream: "reasoning_text", delta: "live thought" }),
  ]);
  const tools = events.filter(
    (event) => event.type === "item.started" && event.itemType === "tool_call",
  );
  expect(tools).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({
        name: "live tool",
        status: "running",
        args: { query: "live" },
      }),
    }),
  ]);
  const [tool] = tools;
  if (!tool || tool.type !== "item.started") throw new Error("Missing canonical tool start");
  expect(
    events.filter((event) => event.type === "item.completed" && event.itemId === tool.itemId),
  ).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({ status: "success", result: "live result" }),
    }),
  ]);
  expect(events.filter((event) => event.type === "turn.completed")).toEqual([
    expect.objectContaining({ state: "completed" }),
  ]);
  expect(events.at(-1)).toMatchObject({ type: "turn.completed", state: "completed" });
  expect(
    fixture.listener.onUpdate.mock.calls.filter(([update]) => update.status === "working"),
  ).toHaveLength(2);
  expect(fixture.listener.onUpdate).toHaveBeenLastCalledWith({ status: "idle", attention: "none" });
  expect(Date.now()).toBe(NOW);
}

describe.each(["load", "resume"] as const)("ACP session/%s replay boundary", (method) => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("delivers an immediate reply and tools after openThread without advancing the clock", async () => {
    const fixture = createReplaySession(method);
    await expect(fixture.open()).resolves.toBe(REPLAY_SESSION_ID);
    expectOpenMetadata(fixture);
    expect(fixture.openRpc).toHaveBeenCalledExactlyOnceWith({
      sessionId: REPLAY_SESSION_ID,
      cwd: "C:\\repo",
      mcpServers: [],
    });
    const unusedRpc =
      method === "load" ? fixture.connection.resumeSession : fixture.connection.loadSession;
    expect(unusedRpc).not.toHaveBeenCalled();
    expectSuppressedActivity(fixture, "late-idle");
    replyImmediately(fixture);

    await fixture.session.startTurn("continue", REPLAY_CONFIG, undefined, {
      userMessageItemId: OPTIMISTIC_ID,
    });

    expectCanonicalReply(fixture);
  });

  it("suppresses in-RPC history and late idle replay without opening a work turn", async () => {
    const fixture = createReplaySession(method);
    const entered = Promise.withResolvers<void>();
    const opened = Promise.withResolvers<LoadSessionResponse>();
    fixture.openRpc.mockImplementationOnce(() => {
      expectSuppressedActivity(fixture, "in-rpc");
      entered.resolve();
      return opened.promise;
    });
    const opening = fixture.open();
    await entered.promise;
    vi.mocked(Date.now).mockReturnValue(NOW + 750);
    expectSuppressedActivity(fixture, "still-in-rpc");
    opened.resolve({});
    await opening;
    expectSuppressedActivity(fixture, "late-idle");
    vi.mocked(Date.now).mockReturnValue(NOW + 1_249);
    expectSuppressedActivity(fixture, "idle-tail");
    expect(fixture.listener.onRuntimeEvent).not.toHaveBeenCalled();
    expectOpenMetadata(fixture);
    expect(fixture.connection.prompt).not.toHaveBeenCalled();
  });

  it("keeps replay suppressed through config sync and asynchronous prompt preparation", async () => {
    const fixture = createReplaySession(method);
    fixture.openRpc.mockImplementationOnce(async () => {
      fixture.update({
        sessionUpdate: "config_option_update",
        configOptions: thoughtOptions("low"),
      });
      return {};
    });
    await fixture.open();
    expectOpenMetadata(fixture);
    expect(fixture.connection.setSessionConfigOption).not.toHaveBeenCalled();
    const configEntered = Promise.withResolvers<void>();
    const configured = Promise.withResolvers<{ configOptions: SessionConfigOption[] }>();
    fixture.connection.setSessionConfigOption.mockImplementationOnce(() => {
      expectSuppressedActivity(fixture, "config-replay");
      configEntered.resolve();
      return configured.promise;
    });
    const contentEntered = Promise.withResolvers<void>();
    const prepared = Promise.withResolvers<void>();
    const realPrepare = promptContent.segmentsToContentBlocks;
    const prepare = vi
      .spyOn(promptContent, "segmentsToContentBlocks")
      .mockImplementationOnce(async (...args) => {
        contentEntered.resolve();
        await prepared.promise;
        return realPrepare(...args);
      });
    replyImmediately(fixture);

    const turn = fixture.session.startTurn(
      "continue",
      { ...REPLAY_CONFIG, effort: "high" },
      undefined,
      {
        userMessageItemId: OPTIMISTIC_ID,
        inlineInstructions: "extra instructions",
      },
    );
    await configEntered.promise;
    expect(fixture.connection.setSessionConfigOption).toHaveBeenCalledExactlyOnceWith({
      sessionId: REPLAY_SESSION_ID,
      configId: "replayed-effort",
      value: "high",
    });
    expectSuppressedActivity(fixture, "pending-config");
    expect(fixture.listener.onRuntimeEvent).not.toHaveBeenCalled();
    expectOpenMetadata(fixture);
    expect(prepare).not.toHaveBeenCalled();
    expect(fixture.connection.prompt).not.toHaveBeenCalled();

    configured.resolve({ configOptions: thoughtOptions("high") });
    await contentEntered.promise;
    expectSuppressedActivity(fixture, "pending-content");
    expect(fixture.listener.onUpdate.mock.calls.map(([update]) => update)).toEqual([
      ...REPLAY_OPEN_UPDATES,
      {
        status: "idle",
        attention: "none",
        config: { ...REPLAY_CONFIG, effort: "high" },
        sessionRef: REPLAY_SESSION_REF,
      },
      { status: "working", attention: "working" },
    ]);
    expect(fixture.connection.prompt).not.toHaveBeenCalled();
    prepared.resolve();
    await turn;

    expect(fixture.connection.prompt).toHaveBeenCalledExactlyOnceWith({
      sessionId: REPLAY_SESSION_ID,
      prompt: [{ type: "text", text: "continue\n\nextra instructions" }],
    });
    expectCanonicalReply(fixture);
  });

  it("keeps replay suppressed after setup Stop until a fresh prompt is dispatched", async () => {
    const fixture = createReplaySession(method);
    await fixture.open();
    expectOpenMetadata(fixture);
    const contentEntered = Promise.withResolvers<void>();
    const prepared = Promise.withResolvers<void>();
    const realPrepare = promptContent.segmentsToContentBlocks;
    vi.spyOn(promptContent, "segmentsToContentBlocks").mockImplementationOnce(async (...args) => {
      contentEntered.resolve();
      await prepared.promise;
      return realPrepare(...args);
    });
    const stoppedItemId = "optimistic-stopped";
    const turn = fixture.session.startTurn("continue", REPLAY_CONFIG, undefined, {
      userMessageItemId: stoppedItemId,
    });
    await contentEntered.promise;
    expectSuppressedActivity(fixture, "before-setup-stop");
    await fixture.session.interruptTurn();
    expect(fixture.connection.cancel).not.toHaveBeenCalled();
    expectSuppressedActivity(fixture, "stopped-setup");
    expect(fixture.connection.prompt).not.toHaveBeenCalled();
    prepared.resolve();
    await turn;

    expect(fixture.connection.prompt).not.toHaveBeenCalled();
    expect(fixture.listener.onRuntimeEvent.mock.calls.map(([event]) => event)).toEqual([
      expect.objectContaining({ type: "turn.started" }),
      expect.objectContaining({
        type: "item.started",
        itemId: stoppedItemId,
        itemType: "user_message",
        payload: { content: [{ kind: "text", text: "continue" }] },
      }),
      expect.objectContaining({ type: "item.completed", itemId: stoppedItemId }),
      expect.objectContaining({ type: "turn.completed", state: "cancelled" }),
    ]);
    expect(fixture.listener.onUpdate.mock.calls.map(([update]) => update)).toEqual([
      ...REPLAY_OPEN_UPDATES,
      { status: "working", attention: "working" },
      { status: "idle", attention: "none" },
    ]);
    expectSuppressedActivity(fixture, "after-setup-stop");
    // The stopped turn is fully asserted above; isolate the fresh turn's proof.
    fixture.listener.onRuntimeEvent.mockClear();
    fixture.listener.onUpdate.mockClear();
    replyImmediately(fixture);
    await fixture.session.startTurn("continue", REPLAY_CONFIG, undefined, {
      userMessageItemId: OPTIMISTIC_ID,
    });
    expect(fixture.connection.prompt).toHaveBeenCalledOnce();
    expectCanonicalReply(fixture);
  });

  it("keeps idle Stop from cancelling or admitting replay before a subsequent fresh prompt", async () => {
    const fixture = createReplaySession(method);
    await fixture.open();
    expectOpenMetadata(fixture);
    await fixture.session.interruptTurn();
    expect(fixture.connection.cancel).not.toHaveBeenCalled();
    expect(fixture.connection.prompt).not.toHaveBeenCalled();
    expect(fixture.listener.onRuntimeEvent).not.toHaveBeenCalled();
    expectSuppressedActivity(fixture, "after-idle-stop");
    expectOpenMetadata(fixture);
    replyImmediately(fixture);
    await fixture.session.startTurn("continue", REPLAY_CONFIG, undefined, {
      userMessageItemId: OPTIMISTIC_ID,
    });
    expect(fixture.connection.cancel).not.toHaveBeenCalled();
    expect(fixture.connection.prompt).toHaveBeenCalledOnce();
    expectCanonicalReply(fixture);
  });
});
