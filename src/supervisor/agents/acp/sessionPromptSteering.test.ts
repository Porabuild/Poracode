import { describe, expect, it, vi } from "vitest";
import type { ThreadConfig } from "@/shared/contracts";
import type { AcpPromptSteering } from "./promptSteering";
import { makeConfigSyncSession } from "./sessionTestFixture";

const config: ThreadConfig = { model: "model-a" };

const steering: AcpPromptSteering = {
  isSupported: (initialize) =>
    (initialize.agentCapabilities?._meta as { steer?: boolean } | undefined)?.steer === true,
  requestMeta: { vendor: { steer: true } },
};

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

async function advertisedSession() {
  const fixture = makeConfigSyncSession({ promptSteering: steering });
  fixture.connection.initialize.mockResolvedValueOnce({
    protocolVersion: 1,
    agentCapabilities: { _meta: { steer: true } },
  });
  await fixture.session.activate();
  return fixture;
}

describe("ACP prompt steering capability", () => {
  it("exposes steerTurn only when declared and advertised", async () => {
    const withoutOption = makeConfigSyncSession();
    await withoutOption.session.activate();
    expect(withoutOption.session.steerTurn).toBeUndefined();

    const notAdvertised = makeConfigSyncSession({ promptSteering: steering });
    await notAdvertised.session.activate();
    expect(notAdvertised.session.steerTurn).toBeUndefined();

    const advertised = await advertisedSession();
    expect(advertised.session.steerTurn).toBeTypeOf("function");
  });
});

describe("ACP prompt steering turn", () => {
  it("sends a marked prompt while the turn runs and completes after its answer", async () => {
    const { connection, listener, session } = await advertisedSession();
    const main = deferred<{ stopReason: string }>();
    const steer = deferred<{ stopReason: string }>();
    connection.prompt.mockReturnValueOnce(main.promise).mockReturnValueOnce(steer.promise);

    const turn = session.startTurn("first prompt", config);
    await vi.waitFor(() => expect(connection.prompt).toHaveBeenCalledTimes(1));

    await session.steerTurn?.("steer text", config, undefined, { userMessageItemId: "user-steer" });
    expect(connection.prompt).toHaveBeenCalledTimes(2);
    expect(connection.prompt.mock.calls[1]?.[0]).toEqual({
      sessionId: "session-1",
      prompt: [{ type: "text", text: "steer text" }],
      _meta: steering.requestMeta,
    });
    expect(turnEvents(listener, "turn.started")).toHaveLength(1);
    expect(turnEvents(listener, "turn.completed")).toHaveLength(0);

    main.resolve({ stopReason: "end_turn" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(turnEvents(listener, "turn.completed")).toHaveLength(0);

    steer.resolve({ stopReason: "end_turn" });
    await turn;
    const completed = turnEvents(listener, "turn.completed");
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ state: "completed" });
    expect(turnEvents(listener, "turn.started")).toHaveLength(1);
  });

  it("falls back to an ordinary turn when nothing is in flight", async () => {
    const { connection, listener, session } = await advertisedSession();

    await session.steerTurn?.("fresh prompt", config);

    expect(connection.prompt).toHaveBeenCalledTimes(1);
    expect(connection.prompt.mock.calls[0]?.[0]).not.toHaveProperty("_meta");
    expect(turnEvents(listener, "turn.started")).toHaveLength(1);
    expect(turnEvents(listener, "turn.completed")).toHaveLength(1);
  });

  it("resends a rejected steer as an ordinary prompt", async () => {
    const { connection, listener, session } = await advertisedSession();
    const main = deferred<{ stopReason: string }>();
    const steer = deferred<{ stopReason: string }>();
    connection.prompt.mockReturnValueOnce(main.promise).mockReturnValueOnce(steer.promise);

    const turn = session.startTurn("first prompt", config);
    await vi.waitFor(() => expect(connection.prompt).toHaveBeenCalledTimes(1));
    await session.steerTurn?.("steer text", config);

    main.resolve({ stopReason: "end_turn" });
    steer.reject(new Error("turn closed"));
    await turn;

    expect(connection.prompt).toHaveBeenCalledTimes(3);
    expect(connection.prompt.mock.calls[2]?.[0]).toEqual({
      sessionId: "session-1",
      prompt: [{ type: "text", text: "steer text" }],
    });
    expect(turnEvents(listener, "turn.completed")).toHaveLength(1);
  });

  it("does not resend a steer after Stop cancels the turn", async () => {
    const { connection, listener, session } = await advertisedSession();
    const main = deferred<{ stopReason: string }>();
    const steer = deferred<{ stopReason: string }>();
    connection.prompt.mockReturnValueOnce(main.promise).mockReturnValueOnce(steer.promise);

    const turn = session.startTurn("first prompt", config);
    await vi.waitFor(() => expect(connection.prompt).toHaveBeenCalledTimes(1));
    await session.steerTurn?.("steer text", config);
    await session.interruptTurn();

    main.resolve({ stopReason: "cancelled" });
    steer.reject(new Error("cancelled"));
    await turn;

    expect(connection.prompt).toHaveBeenCalledTimes(2);
    const completed = turnEvents(listener, "turn.completed");
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ state: "cancelled" });
  });

  it("defers non-text steers until the running turn ends", async () => {
    const { connection, listener, session } = await advertisedSession();
    const main = deferred<{ stopReason: string }>();
    connection.prompt.mockReturnValueOnce(main.promise);

    const turn = session.startTurn("first prompt", config);
    await vi.waitFor(() => expect(connection.prompt).toHaveBeenCalledTimes(1));
    await session.steerTurn?.("see attachment", config, [
      { kind: "attachment", path: "C:\\repo\\notes.txt", mimeType: "text/plain" },
    ]);

    // No marked prompt is sent while the non-text steer waits.
    expect(connection.prompt).toHaveBeenCalledTimes(1);

    main.resolve({ stopReason: "end_turn" });
    await turn;

    expect(connection.prompt).toHaveBeenCalledTimes(2);
    const resent = connection.prompt.mock.calls[1]?.[0];
    expect(resent).not.toHaveProperty("_meta");
    expect(resent?.prompt).toEqual([
      {
        type: "resource_link",
        uri: expect.stringContaining("notes.txt"),
        name: "notes.txt",
        mimeType: "text/plain",
      },
      { type: "text", text: "see attachment" },
    ]);
    expect(turnEvents(listener, "turn.completed")).toHaveLength(1);
  });

  it("paints the user row after closing open assistant content", async () => {
    const { connection, listener, session } = await advertisedSession();
    const main = deferred<{ stopReason: string }>();
    connection.prompt.mockReturnValueOnce(main.promise);

    const turn = session.startTurn("first prompt", config);
    await vi.waitFor(() => expect(connection.prompt).toHaveBeenCalledTimes(1));
    session.handleSessionUpdate({
      sessionId: "session-1",
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "partial" } },
    } as never);

    const assistantStart = runtimeEvents(listener).find(
      (event) => event.type === "item.started" && event["itemType"] === "assistant_message",
    );
    expect(assistantStart).toBeDefined();

    await session.steerTurn?.("steer text", config, undefined, { userMessageItemId: "user-steer" });

    const events = runtimeEvents(listener);
    const assistantCompletedIndex = events.findIndex(
      (event) => event.type === "item.completed" && event["itemId"] === assistantStart?.["itemId"],
    );
    const userStartedIndex = events.findIndex(
      (event) => event.type === "item.started" && event["itemId"] === "user-steer",
    );
    expect(assistantCompletedIndex).toBeGreaterThanOrEqual(0);
    expect(userStartedIndex).toBeGreaterThan(assistantCompletedIndex);

    main.resolve({ stopReason: "end_turn" });
    await turn;
  });
});
