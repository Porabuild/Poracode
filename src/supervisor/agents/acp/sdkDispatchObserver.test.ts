import {
  ClientSideConnection,
  type AnyMessage,
  type Client,
  type ClientSideConnectionOptions,
  type DispatchObserver,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
} from "@agentclientprotocol/sdk";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

afterEach(() => vi.restoreAllMocks());

function dispatchRecorder() {
  const started: unknown[] = [];
  const settled: unknown[] = [];
  const waiters = new Map<unknown, { promise: Promise<void>; resolve: () => void }>();
  const observer: DispatchObserver = {
    started(message) {
      started.push(message);
    },
    settled(message) {
      settled.push(message);
      waiters.get(message)?.resolve();
      waiters.delete(message);
    },
  };
  return {
    observer,
    started,
    settled,
    whenSettled(message: unknown) {
      if (settled.includes(message)) return Promise.resolve();
      let waiter = waiters.get(message);
      if (!waiter) {
        waiter = Promise.withResolvers<void>();
        waiters.set(message, waiter);
      }
      return waiter.promise;
    },
    expectOnce(message: unknown) {
      expect(started.filter((raw) => raw === message)).toHaveLength(1);
      expect(settled.filter((raw) => raw === message)).toHaveLength(1);
    },
  };
}

// Real SDK connections over the same TransformStream harness used by the
// nearby ACP integration tests. Drain outgoing writes so response dispatch can
// actually finish. Only malformed transport fixtures bypass the Stream type.
function testStream(
  overrides: Partial<Client> = {},
  options?: ClientSideConnectionOptions,
  wrapReadable?: (readable: ReadableStream<AnyMessage>) => ReadableStream<AnyMessage>,
) {
  const incoming = new TransformStream<AnyMessage>();
  const outgoing = new TransformStream<AnyMessage>();
  const writer = incoming.writable.getWriter();
  const reader = outgoing.readable.getReader();
  const sent: AnyMessage[] = [];
  const draining = (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      sent.push(value);
    }
  })();
  const client: Client = {
    sessionUpdate: async () => {},
    requestPermission: async () => ({ outcome: { outcome: "cancelled" } }),
    ...overrides,
  };
  const stream = {
    readable: wrapReadable ? wrapReadable(incoming.readable) : incoming.readable,
    writable: outgoing.writable,
  };
  const connection =
    options === undefined
      ? new ClientSideConnection(() => client, stream)
      : new ClientSideConnection(() => client, stream, options);
  return {
    connection,
    sent,
    write: (message: unknown) => writer.write(message as AnyMessage),
    async outputAt(index: number) {
      await vi.waitFor(() => expect(sent.length).toBeGreaterThan(index));
      const message = sent[index];
      if (!message) throw new Error("Missing SDK output");
      return message;
    },
    async close() {
      await Promise.allSettled([writer.close(), reader.cancel()]);
      await connection.closed;
      await draining;
      writer.releaseLock();
      reader.releaseLock();
    },
  };
}

function update(text: string): AnyMessage {
  return {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "session-1",
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } },
    },
  };
}

function permission(): AnyMessage {
  const params: RequestPermissionRequest = {
    sessionId: "session-1",
    toolCall: { toolCallId: "tool-1", title: "Wait for a decision", kind: "other" },
    options: [{ optionId: "once", name: "Allow once", kind: "allow_once" }],
  };
  return { jsonrpc: "2.0", id: "permission-1", method: "session/request_permission", params };
}

function requestId(message: AnyMessage) {
  if (!("id" in message) || !("method" in message)) throw new Error("Expected SDK request");
  return message.id;
}

describe("installed ACP SDK dispatch observer", () => {
  // Fail before constructing a gated reader on an older SDK that would silently
  // ignore the third argument and never notify settlement.
  beforeAll(() => {
    if (ClientSideConnection.dispatchObserverVersion !== 1) {
      throw new Error("The installed SDK lacks dispatch observer compatibility version 1");
    }
  });

  it("exposes a readonly compatibility marker before creating any gated stream", () => {
    const version: 1 = ClientSideConnection.dispatchObserverVersion;
    expect(version).toBe(1);
    expect(Object.hasOwn(ClientSideConnection, "dispatchObserverVersion")).toBe(true);
    expect(Reflect.set(ClientSideConnection, "dispatchObserverVersion", 0)).toBe(false);
    expect(ClientSideConnection.dispatchObserverVersion).toBe(1);
  });

  it("exports the public third-argument options and settles the original frame after an async handler", async () => {
    const recorder = dispatchRecorder();
    const entered = Promise.withResolvers<void>();
    const handler = Promise.withResolvers<void>();
    const frame = update("delayed");
    const options: ClientSideConnectionOptions = { dispatchObserver: recorder.observer };
    const stream = testStream(
      {
        sessionUpdate() {
          entered.resolve();
          return handler.promise;
        },
      },
      options,
    );
    try {
      await stream.write(frame);
      await entered.promise;
      expect(recorder.started[0]).toBe(frame);
      expect(recorder.settled).toEqual([]);
      handler.resolve();
      await recorder.whenSettled(frame);
      expect(recorder.settled[0]).toBe(frame);
      recorder.expectOnce(frame);
      expect(stream.connection.signal.aborted).toBe(false);
    } finally {
      handler.resolve();
      await stream.close();
    }
  });

  it.each<{ name: string; frame: unknown; errorCode?: number; handlerCalls?: number }>([
    { name: "an unknown notification", frame: { jsonrpc: "2.0", method: "_unhandled" } },
    {
      name: "a schema-rejected notification",
      frame: { jsonrpc: "2.0", method: "session/update", params: {} },
    },
    { name: "a throwing notification handler", frame: update("throw"), handlerCalls: 1 },
    { name: "a non-object frame", frame: 42, errorCode: -32600 },
    { name: "a null frame", frame: null, errorCode: -32600 },
    {
      name: "a malformed call",
      frame: { jsonrpc: "2.0", id: "invalid", method: 42 },
      errorCode: -32600,
    },
    { name: "an unknown response", frame: { jsonrpc: "2.0", id: "unknown", result: {} } },
    { name: "a malformed response", frame: { jsonrpc: "2.0", id: "unknown" } },
    {
      name: "an unknown request",
      frame: { jsonrpc: "2.0", id: "unknown", method: "_unhandled" },
      errorCode: -32601,
    },
    {
      name: "a schema-rejected request",
      frame: { jsonrpc: "2.0", id: "invalid", method: "session/request_permission", params: {} },
      errorCode: -32602,
    },
    {
      name: "a throwing request handler",
      frame: permission(),
      errorCode: -32603,
      handlerCalls: 1,
    },
  ])("settles $name exactly once, including paths that never reach a handler", async (fixture) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const recorder = dispatchRecorder();
    let handlerCalls = 0;
    const fail = () => {
      handlerCalls += 1;
      throw new Error("Fixture handler failure");
    };
    const stream = testStream(
      { sessionUpdate: fail, requestPermission: fail },
      { dispatchObserver: recorder.observer },
    );
    try {
      await stream.write(fixture.frame);
      await recorder.whenSettled(fixture.frame);
      expect(recorder.started[0]).toBe(fixture.frame);
      expect(recorder.settled[0]).toBe(fixture.frame);
      recorder.expectOnce(fixture.frame);
      expect(handlerCalls).toBe(fixture.handlerCalls ?? 0);
      expect(
        stream.sent.map((message) => ("error" in message ? message.error.code : undefined)),
      ).toEqual(fixture.errorCode === undefined ? [] : [fixture.errorCode]);
      expect(stream.connection.signal.aborted).toBe(false);
    } finally {
      await stream.close();
    }
  });

  it.each(["notification", "request"] as const)(
    "settles an asynchronously rejected %s handler after rejection without escaping a receive task",
    async (kind) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const recorder = dispatchRecorder();
      const entered = Promise.withResolvers<void>();
      const handler = Promise.withResolvers<never>();
      const rejectLater = () => {
        entered.resolve();
        return handler.promise;
      };
      const frame = kind === "notification" ? update("reject later") : permission();
      const stream = testStream(
        { sessionUpdate: rejectLater, requestPermission: rejectLater },
        { dispatchObserver: recorder.observer },
      );
      try {
        await stream.write(frame);
        await entered.promise;
        expect(recorder.settled).toEqual([]);
        handler.reject(new Error("Asynchronous fixture failure"));
        await recorder.whenSettled(frame);
        recorder.expectOnce(frame);
        expect(
          stream.sent.map((message) => ("error" in message ? message.error.code : undefined)),
        ).toEqual(kind === "request" ? [-32603] : []);
        expect(stream.connection.signal.aborted).toBe(false);
      } finally {
        handler.reject(new Error("Fixture cleanup"));
        await stream.close();
      }
    },
  );

  it.each(["error", "malformed"] as const)(
    "settles a matching %s response and preserves SDK request rejection",
    async (kind) => {
      const recorder = dispatchRecorder();
      const stream = testStream({}, { dispatchObserver: recorder.observer });
      try {
        const pending = stream.connection.request("_reply", {});
        const id = requestId(await stream.outputAt(0));
        const frame =
          kind === "error"
            ? { jsonrpc: "2.0", id, error: { code: -32001, message: "Fixture error" } }
            : { jsonrpc: "2.0", id };
        await stream.write(frame);
        await expect(pending).rejects.toMatchObject({ code: kind === "error" ? -32001 : -32600 });
        await recorder.whenSettled(frame);
        recorder.expectOnce(frame);
        expect(stream.sent).toHaveLength(1);
        expect(stream.connection.signal.aborted).toBe(false);
      } finally {
        await stream.close();
      }
    },
  );

  it("keeps reading RPC responses and cancellation while a permission request waits for a human", async () => {
    const recorder = dispatchRecorder();
    const entered = Promise.withResolvers<void>();
    const answer = Promise.withResolvers<RequestPermissionResponse>();
    const blocked = permission();
    const stream = testStream(
      {
        requestPermission() {
          entered.resolve();
          return answer.promise;
        },
      },
      { dispatchObserver: recorder.observer },
    );
    try {
      await stream.write(blocked);
      await entered.promise;
      const pending = stream.connection.request("_control", {});
      const id = requestId(await stream.outputAt(0));
      const cancelled = {
        jsonrpc: "2.0",
        method: "$/cancel_request",
        params: { requestId: "permission-1" },
      };
      const response = { jsonrpc: "2.0", id, result: { ready: true } };
      const notification = update("still reading");
      await stream.write(cancelled);
      await stream.write(response);
      await stream.write(notification);
      await expect(pending).resolves.toEqual({ ready: true });
      await Promise.all([
        recorder.whenSettled(cancelled),
        recorder.whenSettled(response),
        recorder.whenSettled(notification),
      ]);
      expect(recorder.settled).not.toContain(blocked);
      // SDK cancellation is cooperative; this handler may return normally.
      answer.resolve({ outcome: { outcome: "cancelled" } });
      await recorder.whenSettled(blocked);
      expect(await stream.outputAt(1)).toEqual({
        jsonrpc: "2.0",
        id: "permission-1",
        result: { outcome: { outcome: "cancelled" } },
      });
      for (const frame of [blocked, cancelled, response, notification]) recorder.expectOnce(frame);
      expect(recorder.started).toHaveLength(4);
      expect(recorder.settled).toHaveLength(4);
    } finally {
      answer.resolve({ outcome: { outcome: "cancelled" } });
      await stream.close();
    }
  });

  it("reports observer failure on close and settles an earlier non-cooperative request only when it finishes", async () => {
    const recorder = dispatchRecorder();
    const entered = Promise.withResolvers<void>();
    const answer = Promise.withResolvers<RequestPermissionResponse>();
    const blocked = permission();
    const failing = update("observer failure");
    const failure = new Error("Fixture observer failure with an active request");
    const stream = testStream(
      {
        requestPermission() {
          entered.resolve();
          return answer.promise;
        },
      },
      {
        dispatchObserver: {
          started(message) {
            recorder.observer.started(message);
            if (message === failing) throw failure;
          },
          settled: recorder.observer.settled,
        },
      },
    );
    try {
      await stream.write(blocked);
      await entered.promise;
      await stream.write(failing);
      await stream.connection.closed;
      await recorder.whenSettled(failing);
      expect(stream.connection.signal.reason).toBe(failure);
      expect(recorder.settled).toEqual([failing]);
      answer.resolve({ outcome: { outcome: "cancelled" } });
      await recorder.whenSettled(blocked);
      recorder.expectOnce(blocked);
      recorder.expectOnce(failing);
      expect(stream.sent).toEqual([]);
    } finally {
      answer.resolve({ outcome: { outcome: "cancelled" } });
      await stream.close();
    }
  });

  it("emits one lifecycle per delivery even when two frames reuse the same object identity", async () => {
    const recorder = dispatchRecorder();
    const twice = Promise.withResolvers<void>();
    const frame = update("reused identity");
    const stream = testStream(
      {},
      {
        dispatchObserver: {
          started: recorder.observer.started,
          settled(message) {
            recorder.observer.settled(message);
            if (recorder.settled.length === 2) twice.resolve();
          },
        },
      },
    );
    try {
      await stream.write(frame);
      await recorder.whenSettled(frame);
      await stream.write(frame);
      await twice.promise;
      expect(recorder.started).toHaveLength(2);
      expect(recorder.settled).toHaveLength(2);
      expect(recorder.started.every((message) => message === frame)).toBe(true);
      expect(recorder.settled.every((message) => message === frame)).toBe(true);
    } finally {
      await stream.close();
    }
  });

  it("lets an external reader gate the next frame on delayed notification settlement", async () => {
    const recorder = dispatchRecorder();
    const handler = Promise.withResolvers<void>();
    const releasePermit = Promise.withResolvers<void>();
    const waitingRead = Promise.withResolvers<void>();
    const first = update("first");
    const second = update("second");
    let permit = Promise.resolve();
    const observer: DispatchObserver = {
      started(message) {
        recorder.observer.started(message);
        if (message === first) permit = releasePermit.promise;
      },
      settled(message) {
        recorder.observer.settled(message);
        if (message === first) releasePermit.resolve();
      },
    };
    const stream = testStream(
      {
        sessionUpdate(notification) {
          return notification.update.sessionUpdate === "agent_message_chunk" &&
            notification.update.content.type === "text" &&
            notification.update.content.text === "first"
            ? handler.promise
            : Promise.resolve();
        },
      },
      { dispatchObserver: observer },
      (readable) => {
        const source = readable.getReader();
        return new ReadableStream<AnyMessage>(
          {
            async pull(controller) {
              if (permit === releasePermit.promise) waitingRead.resolve();
              await permit;
              const { value, done } = await source.read();
              if (done) controller.close();
              else controller.enqueue(value);
            },
            async cancel(reason) {
              releasePermit.resolve();
              await source.cancel(reason);
              source.releaseLock();
            },
          },
          { highWaterMark: 0 },
        );
      },
    );
    try {
      await stream.write(first);
      const writeSecond = stream.write(second);
      await waitingRead.promise;
      // The SDK has asked for another frame, but the caller's reader owns the
      // permit. Assertions use that read barrier, not a guessed time delay.
      expect(recorder.started).toEqual([first]);
      expect(recorder.settled).toEqual([]);
      handler.resolve();
      await writeSecond;
      await recorder.whenSettled(second);
      recorder.expectOnce(first);
      recorder.expectOnce(second);
      expect(recorder.started[1]).toBe(second);
      expect(recorder.settled[0]).toBe(first);
      expect(stream.connection.signal.aborted).toBe(false);
    } finally {
      handler.resolve();
      releasePermit.resolve();
      await stream.close();
    }
  });

  it.each(["started", "settled"] as const)(
    "closes on a throwing %s observer, attempts settlement exactly once and never retries",
    async (phase) => {
      const recorder = dispatchRecorder();
      const failure = new Error(`Fixture ${phase} observer failure`);
      let handlerCalls = 0;
      const frame = update("observer failure");
      const observer: DispatchObserver = {
        started(message) {
          recorder.observer.started(message);
          if (phase === "started") throw failure;
        },
        settled(message) {
          recorder.observer.settled(message);
          if (phase === "settled") throw failure;
        },
      };
      const stream = testStream(
        {
          sessionUpdate() {
            handlerCalls += 1;
            return Promise.resolve();
          },
        },
        { dispatchObserver: observer },
      );
      try {
        await stream.write(frame);
        await stream.connection.closed;
        await recorder.whenSettled(frame);
        recorder.expectOnce(frame);
        expect(handlerCalls).toBe(phase === "started" ? 0 : 1);
        expect(stream.connection.signal.reason).toBe(failure);
        await expect(stream.connection.request("_after_failure", {})).rejects.toBe(failure);
        expect(stream.sent).toEqual([]);
      } finally {
        await stream.close();
      }
    },
  );

  it.each(["started", "settled"] as const)(
    "does not await accidental %s callback promises and contains their rejection",
    async (phase) => {
      const recorder = dispatchRecorder();
      const callback = Promise.withResolvers<void>();
      const failure = new Error("Rejected observer return");
      const first = update("first");
      const second = update("second");
      const observer: DispatchObserver = {
        started(message) {
          recorder.observer.started(message);
          // Deliberately violate the synchronous hook contract to qualify the
          // defensive rejection handling against an actual caller mistake.
          if (message === first && phase === "started") return callback.promise as unknown as void;
        },
        settled(message) {
          recorder.observer.settled(message);
          if (message === first && phase === "settled") return callback.promise as unknown as void;
        },
      };
      const stream = testStream({}, { dispatchObserver: observer });
      try {
        await stream.write(first);
        await stream.write(second);
        await recorder.whenSettled(second);
        recorder.expectOnce(first);
        recorder.expectOnce(second);
        callback.reject(failure);
        await stream.connection.closed;
        expect(stream.connection.signal.reason).toBe(failure);
      } finally {
        callback.resolve();
        await stream.close();
      }
    },
  );

  it.each([
    { name: "empty", frame: [] },
    { name: "nonempty", frame: [update("batch member")] },
  ])(
    "preserves stable API $name batch rejection while observing the whole raw frame",
    async ({ frame }) => {
      const recorder = dispatchRecorder();
      let handlerCalls = 0;
      const stream = testStream(
        {
          sessionUpdate() {
            handlerCalls += 1;
            return Promise.resolve();
          },
        },
        { dispatchObserver: recorder.observer },
      );
      try {
        await stream.write(frame);
        await stream.connection.closed;
        await recorder.whenSettled(frame);
        recorder.expectOnce(frame);
        expect(recorder.started[0]).toBe(frame);
        expect(recorder.settled[0]).toBe(frame);
        expect(recorder.started).toHaveLength(1);
        expect(handlerCalls).toBe(0);
        expect(stream.connection.signal.reason).toEqual(
          new TypeError("JSON-RPC batches are not supported on this connection"),
        );
      } finally {
        await stream.close();
      }
    },
  );

  it("preserves two-argument, empty-options and observed request/response/cancellation behavior", async () => {
    const transcripts: { sent: AnyMessage[]; updates: SessionNotification[] }[] = [];
    const recorder = dispatchRecorder();
    for (const options of [undefined, {}, { dispatchObserver: recorder.observer }]) {
      const updates: SessionNotification[] = [];
      const frame = update("parity");
      const stream = testStream(
        {
          async sessionUpdate(notification) {
            updates.push(notification);
          },
        },
        options,
      );
      try {
        const cancellation = new AbortController();
        const pending = stream.connection.request(
          "_cooperative",
          { value: 1 },
          { cancellationSignal: cancellation.signal },
        );
        const id = requestId(await stream.outputAt(0));
        cancellation.abort();
        expect(await stream.outputAt(1)).toEqual({
          jsonrpc: "2.0",
          method: "$/cancel_request",
          params: { requestId: id },
        });
        const response = { jsonrpc: "2.0", id, result: { completed: true } };
        await stream.write(response);
        await expect(pending).resolves.toEqual({ completed: true });
        await stream.write(frame);
        const unknown = { jsonrpc: "2.0", id: "unknown", method: "_unhandled" };
        await stream.write(unknown);
        expect(await stream.outputAt(2)).toMatchObject({
          id: "unknown",
          error: { code: -32601 },
        });
        await vi.waitFor(() => expect(updates).toHaveLength(1));
        if (options?.dispatchObserver) {
          await Promise.all([
            recorder.whenSettled(response),
            recorder.whenSettled(frame),
            recorder.whenSettled(unknown),
          ]);
          for (const raw of [response, frame, unknown]) recorder.expectOnce(raw);
        }
        expect(stream.connection.signal.aborted).toBe(false);
        transcripts.push({ sent: [...stream.sent], updates });
      } finally {
        await stream.close();
      }
    }
    expect(ClientSideConnection.length).toBe(2);
    expect(transcripts[1]).toEqual(transcripts[0]);
    expect(transcripts[2]).toEqual(transcripts[0]);
  });
});
