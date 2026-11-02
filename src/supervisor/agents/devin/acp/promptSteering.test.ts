import { describe, expect, it, vi } from "vitest";
import type { InitializeResponse } from "@agentclientprotocol/sdk";
import type { ThreadConfig } from "@/shared/contracts";
import { makeConfigSyncSession } from "../../acp/sessionTestFixture";
import { DEVIN_ACP_PROMPT_STEERING, devinAcpPromptUsageSampleId } from "./promptSteering";

const config: ThreadConfig = { model: "model-a" };

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type RuntimeEventRecord = { type: string; [key: string]: unknown };

function runtimeEvents(listener: {
  onRuntimeEvent: { mock: { calls: unknown[][] } };
}): RuntimeEventRecord[] {
  return listener.onRuntimeEvent.mock.calls.map((call) => call[0] as RuntimeEventRecord);
}

function turnEvents(listener: { onRuntimeEvent: { mock: { calls: unknown[][] } } }, type: string) {
  return runtimeEvents(listener).filter((event) => event.type === type);
}

const initialize = (meta: unknown): InitializeResponse =>
  ({
    protocolVersion: 1,
    agentCapabilities: { _meta: meta },
  }) as InitializeResponse;

describe("Devin ACP prompt steering declaration", () => {
  it("accepts only agentCapabilities._meta['cognition.ai/midTurnPrompts'] === true", () => {
    expect(
      DEVIN_ACP_PROMPT_STEERING.isSupported(initialize({ "cognition.ai/midTurnPrompts": true })),
    ).toBe(true);
  });

  it.each([
    ["absent meta", undefined],
    ["null meta", null],
    ["array meta", ["cognition.ai/midTurnPrompts"]],
    ["malformed meta", "midTurnPrompts"],
    ["false flag", { "cognition.ai/midTurnPrompts": false }],
    ["string flag", { "cognition.ai/midTurnPrompts": "true" }],
    ["number flag", { "cognition.ai/midTurnPrompts": 1 }],
    ["missing key", { "cognition.ai/other": true }],
  ])("rejects %s", (_label, meta) => {
    expect(DEVIN_ACP_PROMPT_STEERING.isSupported(initialize(meta))).toBe(false);
  });

  it("rejects the flag on the WRONG top-level result._meta location", () => {
    const response = {
      protocolVersion: 1,
      agentCapabilities: {},
      _meta: { "cognition.ai/midTurnPrompts": true },
    } as unknown as InitializeResponse;
    expect(DEVIN_ACP_PROMPT_STEERING.isSupported(response)).toBe(false);
  });

  it("carries an empty steering marker and replies in a new assistant item", () => {
    expect(DEVIN_ACP_PROMPT_STEERING.requestMeta).toEqual({});
    expect(DEVIN_ACP_PROMPT_STEERING.repliesInNewAssistantItem).toBe(true);
  });
});

describe("devinAcpPromptUsageSampleId", () => {
  const response = (meta: unknown) => ({ stopReason: "end_turn", _meta: meta }) as never;

  it("returns the namespaced native identity", () => {
    expect(devinAcpPromptUsageSampleId(response({ "cognition.ai/userMessageId": "msg-1" }))).toBe(
      "native:msg-1",
    );
  });

  it("maps identical input to the identical suffix", () => {
    const meta = { "cognition.ai/userMessageId": "same-id" };
    expect(devinAcpPromptUsageSampleId(response(meta))).toBe(
      devinAcpPromptUsageSampleId(response(meta)),
    );
  });

  it("maps distinct native identities to distinct suffixes", () => {
    expect(devinAcpPromptUsageSampleId(response({ "cognition.ai/userMessageId": "a" }))).not.toBe(
      devinAcpPromptUsageSampleId(response({ "cognition.ai/userMessageId": "b" })),
    );
  });

  it.each([
    ["missing _meta", undefined],
    ["null _meta", null],
    ["missing key", {}],
    ["null id", { "cognition.ai/userMessageId": null }],
    ["non-string id", { "cognition.ai/userMessageId": 42 }],
    ["empty id", { "cognition.ai/userMessageId": "" }],
    ["whitespace id", { "cognition.ai/userMessageId": "   " }],
    ["over-length id", { "cognition.ai/userMessageId": "x".repeat(201) }],
  ])("rejects %s", (_label, meta) => {
    expect(devinAcpPromptUsageSampleId(response(meta))).toBeUndefined();
  });
});

describe("Devin ACP steering session", () => {
  const advertisedMeta = { "cognition.ai/midTurnPrompts": true };

  async function advertisedSession() {
    const fixture = makeConfigSyncSession({
      promptSteering: DEVIN_ACP_PROMPT_STEERING,
    });
    fixture.connection.initialize.mockResolvedValueOnce({
      protocolVersion: 1,
      agentCapabilities: { _meta: advertisedMeta },
    });
    await fixture.session.activate();
    return fixture;
  }

  function injectSurvivorToolCall(session: {
    handleSessionUpdate: (params: { update: unknown }) => void;
  }) {
    session.handleSessionUpdate({
      sessionId: "session-1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "survivor",
        title: "Steering survivor",
        kind: "task",
        status: "in_progress",
        rawInput: {
          _toolName: "task",
          subagent_type: "Explore",
          description: "Steering survivor",
          background: true,
        },
      },
    } as never);
  }

  function survivorItemId(listener: { onRuntimeEvent: { mock: { calls: unknown[][] } } }) {
    const started = runtimeEvents(listener).find(
      (event) =>
        event.type === "item.started" &&
        event["itemType"] === "tool_call" &&
        (event["payload"] as { isSubAgent?: boolean } | undefined)?.isSubAgent === true,
    );
    return started?.["itemId"] as string | undefined;
  }

  it("folds a mid-turn plain prompt into the running turn without touching the child", async () => {
    const { connection, listener, session } = await advertisedSession();
    const main = deferred<{ stopReason: string }>();
    const steer = deferred<{ stopReason: string }>();
    connection.prompt.mockReturnValueOnce(main.promise).mockReturnValueOnce(steer.promise);

    const turn = session.startTurn("main prompt", config);
    await vi.waitFor(() => expect(connection.prompt).toHaveBeenCalledTimes(1));

    // An active background explore subagent in the same session.
    injectSurvivorToolCall(session);
    const childItemId = survivorItemId(listener);
    expect(childItemId).toBeDefined();

    await session.steerTurn?.("steer text", config);
    expect(connection.prompt).toHaveBeenCalledTimes(2);
    // Same session, empty native steering marker, and no cancel anywhere.
    expect(connection.prompt.mock.calls[1]?.[0]).toEqual({
      sessionId: "session-1",
      prompt: [{ type: "text", text: "steer text" }],
      _meta: {},
    });
    expect(connection.cancel).not.toHaveBeenCalled();
    // The original child stays open; the turn has not completed.
    expect(
      runtimeEvents(listener).some(
        (event) => event.type === "item.completed" && event["itemId"] === childItemId,
      ),
    ).toBe(false);
    expect(turnEvents(listener, "turn.completed")).toHaveLength(0);
    expect(turnEvents(listener, "turn.started")).toHaveLength(1);

    // The child finishes under its original id — no relaunch.
    session.handleSessionUpdate({
      sessionId: "session-1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "survivor",
        status: "completed",
        rawOutput: "CHILD_OK",
      },
    } as never);

    // The receiving prompt settling first must not close the turn before the
    // accepted steer is answered.
    main.resolve({ stopReason: "end_turn" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(turnEvents(listener, "turn.completed")).toHaveLength(0);

    steer.resolve({ stopReason: "end_turn" });
    await turn;

    const completed = turnEvents(listener, "turn.completed");
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ state: "completed" });
    expect(turnEvents(listener, "turn.started")).toHaveLength(1);
    // The SAME child item finishes as a successful tool call.
    const childCompleted = runtimeEvents(listener).find(
      (event) => event.type === "item.completed" && event["itemId"] === childItemId,
    );
    expect(childCompleted).toMatchObject({ payload: { status: "success" } });
    // Still no cancel anywhere after the whole turn settled.
    expect(connection.cancel).not.toHaveBeenCalled();
    // Exactly one tool_call item for the survivor — no relaunch.
    expect(
      runtimeEvents(listener).filter(
        (event) =>
          event.type === "item.started" &&
          (event["payload"] as { isSubAgent?: boolean } | undefined)?.isSubAgent === true,
      ),
    ).toHaveLength(1);
    expect(connection.prompt).toHaveBeenCalledTimes(2);
  });

  it("cancels once on Stop after a native steer and never replays the rejected steer", async () => {
    const { connection, listener, session } = await advertisedSession();
    const main = deferred<{ stopReason: string }>();
    const steer = deferred<{ stopReason: string }>();
    connection.prompt.mockReturnValueOnce(main.promise).mockReturnValueOnce(steer.promise);

    const turn = session.startTurn("main prompt", config);
    await vi.waitFor(() => expect(connection.prompt).toHaveBeenCalledTimes(1));
    await session.steerTurn?.("steer text", config);
    expect(connection.prompt).toHaveBeenCalledTimes(2);

    await session.interruptTurn();
    expect(connection.cancel).toHaveBeenCalledTimes(1);

    main.resolve({ stopReason: "cancelled" });
    steer.reject(new Error("cancelled"));
    await turn;

    expect(connection.prompt).toHaveBeenCalledTimes(2);
    const completed = turnEvents(listener, "turn.completed");
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ state: "cancelled" });
  });

  it("leaves steerTurn undefined on an old handshake while ordinary turns still work", async () => {
    const fixture = makeConfigSyncSession({ promptSteering: DEVIN_ACP_PROMPT_STEERING });
    fixture.connection.initialize.mockResolvedValueOnce({ protocolVersion: 1 });
    await fixture.session.activate();
    expect(fixture.session.steerTurn).toBeUndefined();

    const { connection, listener, session } = fixture;
    connection.prompt.mockResolvedValueOnce({ stopReason: "end_turn" });
    await session.startTurn("fresh prompt", config);
    expect(connection.prompt).toHaveBeenCalledTimes(1);
    const completed = turnEvents(listener, "turn.completed");
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ state: "completed" });
  });
});
