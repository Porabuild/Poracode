import { type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough, Readable, Writable } from "node:stream";
import { ClientSideConnection, PROTOCOL_VERSION, type AnyMessage } from "@agentclientprotocol/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import type { StructuredSessionUpdate } from "../base";
import { AcpStructuredSession } from "./session";
import {
  replayActivityUpdates,
  REPLAY_CONFIG,
  REPLAY_SESSION_ID,
} from "./sessionReplay.testFixtures";

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn<typeof import("node:child_process").spawn>() }));
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn,
}));

const NOW = Date.parse("2026-10-09T12:00:00.000Z");
const OPTIMISTIC_ID = "transport-follow-up";
const cleanups: Array<() => Promise<void>> = [];

beforeEach(() => vi.spyOn(Date, "now").mockReturnValue(NOW));
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.restoreAllMocks();
});

/** Actual static-create wiring, installed SDK and framing; only OS byte endpoints are substituted. */
async function transportSession(method: "load" | "resume") {
  const encoder = new TextEncoder();
  let incoming!: ReadableStreamDefaultController<Uint8Array>;
  let inputClosed = false;
  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      incoming = controller;
    },
    cancel() {
      inputClosed = true;
    },
  });
  const send = (message: AnyMessage) =>
    incoming.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
  const received: Array<() => void> = [];
  const activity = async (marker: string) => {
    for (const update of replayActivityUpdates(marker, `${marker} reply 🙂 café`)) {
      const handled = Promise.withResolvers<void>();
      received.push(handled.resolve);
      send({
        jsonrpc: "2.0",
        method: "session/update",
        params: { sessionId: REPLAY_SESSION_ID, update },
      });
      await handled.promise;
    }
  };
  const messages: AnyMessage[] = [];
  const promptWrite = Promise.withResolvers<AnyMessage>();
  const promptWriteDone = Promise.withResolvers<void>();
  let promptWriteCompleted = false;
  let cancelHold: ReturnType<typeof Promise.withResolvers<void>> | undefined;
  const cancelWritten = Promise.withResolvers<void>();
  const output = new WritableStream<Uint8Array>({
    async write(bytes) {
      const message = JSON.parse(new TextDecoder().decode(bytes)) as AnyMessage;
      messages.push(message);
      if (!("method" in message)) return;
      if (message.method === "session/cancel" && cancelHold) {
        cancelWritten.resolve();
        await cancelHold.promise;
      } else if ("id" in message) {
        if (message.method === "initialize") {
          send({
            jsonrpc: "2.0",
            id: message.id,
            result: {
              protocolVersion: PROTOCOL_VERSION,
              agentCapabilities: { sessionCapabilities: method === "resume" ? { resume: {} } : {} },
              authMethods: [],
            },
          });
        } else if (message.method === `session/${method}`) {
          await activity("in-rpc-history");
          send({ jsonrpc: "2.0", id: message.id, result: {} });
        } else if (message.method === "session/prompt") {
          if (
            typeof message.params === "object" &&
            message.params !== null &&
            "sessionId" in message.params &&
            message.params.sessionId === REPLAY_SESSION_ID
          ) {
            promptWrite.resolve(message);
            await activity("live");
            send({ jsonrpc: "2.0", id: message.id, result: { stopReason: "end_turn" } });
            await promptWriteDone.promise;
            promptWriteCompleted = true;
          } else {
            send({ jsonrpc: "2.0", id: message.id, result: { stopReason: "end_turn" } });
          }
        } else {
          send({ jsonrpc: "2.0", id: message.id, result: {} });
        }
      }
    },
  });
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null,
  }) as unknown as ChildProcess;
  spawn.mockReturnValueOnce(child);
  vi.spyOn(Writable, "toWeb").mockReturnValueOnce(output);
  vi.spyOn(Readable, "toWeb").mockReturnValueOnce(
    input as unknown as ReturnType<typeof Readable.toWeb>,
  );
  const session = AcpStructuredSession.create(
    { command: "in-memory-only", args: [] },
    { kind: "windows", path: "C:\\repo" },
    "transport-thread",
  );
  const connection = (session as unknown as { connection: ClientSideConnection }).connection;
  const listener = {
    onClose: vi.fn<() => void>(),
    onError: vi.fn<(message: string) => void>(),
    onUpdate: vi.fn<(update: StructuredSessionUpdate) => void>(),
    onRuntimeEvent: vi.fn<(event: RuntimeEvent) => void>(),
  };
  session.setListener(listener);
  session.attachExternalSessionUpdateSource({
    onSessionUpdate() {
      received.shift()?.();
    },
    dispose() {},
  });
  cleanups.push(async () => {
    Object.assign(session, { isDisposed: true });
    cancelHold?.resolve();
    promptWriteDone.resolve();
    if (!inputClosed) {
      inputClosed = true;
      incoming.close();
    }
    await connection.closed;
    child.stdin?.destroy();
    child.stdout?.destroy();
    child.stderr?.destroy();
  });
  child.emit("spawn");
  await session.activate();
  await expect(
    session.openThread(REPLAY_CONFIG, {
      providerSessionId: REPLAY_SESSION_ID,
      discoveredAt: "2026-10-09T12:00:00.000Z",
    }),
  ).resolves.toBe(REPLAY_SESSION_ID);
  expect(
    messages.filter((message) => "method" in message && message.method === `session/${method}`),
  ).toEqual([
    {
      jsonrpc: "2.0",
      id: expect.any(Number),
      method: `session/${method}`,
      params: { sessionId: REPLAY_SESSION_ID, cwd: "C:\\repo", mcpServers: [] },
    },
  ]);
  expect(listener.onRuntimeEvent).not.toHaveBeenCalled();
  expect(listener.onUpdate).not.toHaveBeenCalled();
  return {
    session,
    connection,
    listener,
    messages,
    output,
    activity,
    promptWrite,
    promptWriteCompleted: () => promptWriteCompleted,
    holdCancel() {
      cancelHold = Promise.withResolvers<void>();
      const cancellation = connection.cancel({ sessionId: REPLAY_SESSION_ID });
      // Observe rejection immediately, including when the SDK closes a queued prompt.
      const outcome = cancellation.then(
        () => undefined,
        (error: unknown) => error,
      );
      return { ...cancelHold, written: cancelWritten.promise, outcome };
    },
    beginTurn() {
      const invoked = Promise.withResolvers<void>();
      const prompt = connection.prompt.bind(connection);
      vi.spyOn(connection, "prompt").mockImplementation((params) => {
        invoked.resolve();
        return prompt(params);
      });
      const turn = session.startTurn("continue", REPLAY_CONFIG, undefined, {
        userMessageItemId: OPTIMISTIC_ID,
      });
      return { invoked: invoked.promise, turn };
    },
    externalHistory() {
      for (const update of replayActivityUpdates(
        "after-write-failure",
        "after-write-failure reply 🙂 café",
      )) {
        session.ingestExternalSessionUpdate({ sessionId: REPLAY_SESSION_ID, update });
      }
    },
  };
}

type Fixture = Awaited<ReturnType<typeof transportSession>>;
const events = (fixture: Fixture) =>
  fixture.listener.onRuntimeEvent.mock.calls.map(([event]) => event);
const promptMessages = (fixture: Fixture) =>
  fixture.messages.filter((message) => "method" in message && message.method === "session/prompt");

function expectLiveCanonical(fixture: Fixture) {
  const canonical = events(fixture);
  expect(canonical.filter((event) => event.type === "turn.started")).toHaveLength(1);
  expect(
    canonical.filter((event) => event.type === "item.started" && event.itemType === "user_message"),
  ).toEqual([
    expect.objectContaining({
      itemId: OPTIMISTIC_ID,
      payload: { content: [{ kind: "text", text: "continue" }] },
    }),
  ]);
  expect(canonical).toContainEqual(
    expect.objectContaining({ type: "item.completed", itemId: OPTIMISTIC_ID }),
  );
  expect(canonical.filter((event) => event.type === "content.delta")).toEqual([
    expect.objectContaining({ stream: "assistant_text", delta: "live reply 🙂 café" }),
    expect.objectContaining({ stream: "reasoning_text", delta: "live thought" }),
  ]);
  const tool = canonical.find(
    (event) => event.type === "item.started" && event.itemType === "tool_call",
  );
  expect(tool).toMatchObject({
    payload: { name: "live tool", status: "running", args: { query: "live" } },
  });
  if (!tool || tool.type !== "item.started") throw new Error("Missing live tool start");
  expect(
    canonical.filter((event) => event.type === "item.completed" && event.itemId === tool.itemId),
  ).toEqual([
    expect.objectContaining({
      payload: expect.objectContaining({ status: "success", result: "live result" }),
    }),
  ]);
  expect(canonical.filter((event) => event.type === "turn.completed")).toEqual([
    expect.objectContaining({ state: "completed" }),
  ]);
  expect(fixture.listener.onUpdate).toHaveBeenLastCalledWith({ status: "idle", attention: "none" });
  expect(promptMessages(fixture)).toEqual([
    {
      jsonrpc: "2.0",
      id: expect.any(Number),
      method: "session/prompt",
      params: { sessionId: REPLAY_SESSION_ID, prompt: [{ type: "text", text: "continue" }] },
    },
  ]);
  expect(fixture.promptWriteCompleted()).toBe(false);
  expect(Date.now()).toBe(NOW);
}

async function expectHistorySuppressed(fixture: Fixture, marker: string) {
  const before = events(fixture);
  const updateCount = fixture.listener.onUpdate.mock.calls.length;
  await fixture.activity(marker);
  expect(events(fixture)).toEqual(before);
  expect(fixture.listener.onUpdate).toHaveBeenCalledTimes(updateCount);
}

describe.each(["load", "resume"] as const)(
  "ACP installed SDK session/%s outbound boundary",
  (method) => {
    it("accepts fast live text, reasoning and tools before the prompt write completes", async () => {
      const fixture = await transportSession(method);
      await expectHistorySuppressed(fixture, "idle-history");
      const { turn } = fixture.beginTurn();
      await expect(fixture.promptWrite.promise).resolves.toMatchObject({
        method: "session/prompt",
        params: { sessionId: REPLAY_SESSION_ID },
      });
      await turn;
      expectLiveCanonical(fixture);
    });

    it("suppresses history while the SDK queues the prompt behind a blocked cancel write", async () => {
      const fixture = await transportSession(method);
      const cancel = fixture.holdCancel();
      await cancel.written;
      const { invoked, turn } = fixture.beginTurn();
      await invoked;
      expect(promptMessages(fixture)).toEqual([]);
      await expectHistorySuppressed(fixture, "queued-history");
      expect(promptMessages(fixture)).toEqual([]);
      cancel.resolve();
      await cancel.outcome;
      await turn;
      expectLiveCanonical(fixture);
    });

    it("retains suppression if an earlier queued write fails before prompt dispatch", async () => {
      const fixture = await transportSession(method);
      const cancel = fixture.holdCancel();
      await cancel.written;
      const { invoked, turn } = fixture.beginTurn();
      await invoked;
      cancel.reject(new Error("Earlier write failed"));
      expect(await cancel.outcome).toBeInstanceOf(Error);
      await turn;
      expect(promptMessages(fixture)).toEqual([]);
      expect(events(fixture)).toContainEqual(
        expect.objectContaining({ type: "turn.completed", state: "failed" }),
      );
      const before = events(fixture);
      const updateCount = fixture.listener.onUpdate.mock.calls.length;
      fixture.externalHistory();
      expect(events(fixture)).toEqual(before);
      expect(fixture.listener.onUpdate).toHaveBeenCalledTimes(updateCount);
    });

    it("retains suppression if the byte writer cannot be acquired", async () => {
      const fixture = await transportSession(method);
      const writer = fixture.output.getWriter();
      try {
        await fixture.beginTurn().turn;
        expect(promptMessages(fixture)).toEqual([]);
        expect(events(fixture)).toContainEqual(
          expect.objectContaining({ type: "turn.completed", state: "failed" }),
        );
        const before = events(fixture);
        const updateCount = fixture.listener.onUpdate.mock.calls.length;
        fixture.externalHistory();
        expect(events(fixture)).toEqual(before);
        expect(fixture.listener.onUpdate).toHaveBeenCalledTimes(updateCount);
      } finally {
        writer.releaseLock();
      }
    });

    it("keeps replay suppressed after config, cancel and another session's prompt writes", async () => {
      const fixture = await transportSession(method);
      await fixture.connection.setSessionMode({ sessionId: REPLAY_SESSION_ID, modeId: "default" });
      await fixture.connection.setSessionConfigOption({
        sessionId: REPLAY_SESSION_ID,
        configId: "effort",
        value: "high",
      });
      await fixture.connection.cancel({ sessionId: REPLAY_SESSION_ID });
      await fixture.connection.prompt({
        sessionId: "another-session",
        prompt: [{ type: "text", text: "other" }],
      });
      await expectHistorySuppressed(fixture, "unrelated-writes-history");
      expect(fixture.listener.onRuntimeEvent).not.toHaveBeenCalled();
      expect(fixture.listener.onUpdate).not.toHaveBeenCalled();
    });
  },
);
