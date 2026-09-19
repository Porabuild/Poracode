import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_ENGINE_MAX_PENDING,
  CLIENT_ENGINE_PROTOCOL_VERSION,
  CLIENT_ENGINE_TIMEOUT_MS,
  type ClientEngineRequest,
  type ClientEngineResponse,
} from "./protocol";
import {
  ClientEngineOverflowError,
  ClientEngineProtocolMismatchError,
  getPersistJsonEngine,
  getRemoteSocketEngine,
  resetClientEngineHostForTests,
} from "./clientEngineHost";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<ClientEngineResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  readonly posted: ClientEngineRequest[] = [];

  constructor(_url: URL | string, _options?: WorkerOptions) {
    FakeWorker.instances.push(this);
  }

  postMessage(data: ClientEngineRequest): void {
    this.posted.push(data);
  }

  terminate(): void {}

  respond(data: ClientEngineResponse): void {
    this.onmessage?.({ data } as MessageEvent<ClientEngineResponse>);
  }
}

/** A valid remote WS frame used as the decode workload in these tests. */
const remoteFrameRaw = JSON.stringify({
  type: "event",
  seq: 1,
  event: { type: "thread-state", threadId: "t-1" },
});
const remoteFrameExpected = {
  ok: true as const,
  message: { type: "event", seq: 1, event: { type: "thread-state", threadId: "t-1" } },
};

beforeEach(() => {
  FakeWorker.instances.length = 0;
  resetClientEngineHostForTests();
});

afterEach(() => {
  resetClientEngineHostForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ClientEngineHost", () => {
  it("uses the sync fallback when Worker is unavailable", async () => {
    const host = getRemoteSocketEngine();
    expect(host.isWorkerActive()).toBe(false);
    const sync = await host.decodeRemote(remoteFrameRaw);
    expect(sync).toEqual(remoteFrameExpected);
    await expect(host.decodeRemote("{")).resolves.toEqual({ ok: false, error: "invalid" });
  });

  it("scopes the engine per consumer: resetting one leaves another's in-flight work untouched", async () => {
    // V5 2.2: resetting the remote-socket engine (a loopback socket close)
    // must never reject a persist-JSON hydration read in flight on another
    // consumer's engine.
    vi.stubGlobal("Worker", FakeWorker);
    const remoteEngine = getRemoteSocketEngine();
    const persistEngine = getPersistJsonEngine();
    expect(persistEngine).not.toBe(remoteEngine);

    const persistRaw = JSON.stringify({ kept: true });
    const inFlight = persistEngine.parseJson(persistRaw);
    const persistWorker = FakeWorker.instances.at(-1)!;
    const request = persistWorker.posted[0];
    if (!request || request.type !== "parse-json") throw new Error("expected parse request");

    remoteEngine.reset(new Error("remote engine reset"));

    persistWorker.respond({
      v: CLIENT_ENGINE_PROTOCOL_VERSION,
      generation: request.generation,
      id: request.id,
      type: "parse-json",
      ok: true,
      value: JSON.parse(persistRaw),
    });
    await expect(inFlight).resolves.toEqual({ kept: true });

    // Same-consumer reset semantics are preserved: an engine reset rejects
    // its OWN pending work.
    const ownPending = remoteEngine.decodeRemote(remoteFrameRaw);
    remoteEngine.reset();
    await expect(ownPending).rejects.toThrow(/reset/);
  });

  it("gives each consumer engine its own worker and overflow handlers", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const remoteEngine = getRemoteSocketEngine();
    const persistEngine = getPersistJsonEngine();
    // Materialize both workers.
    expect(remoteEngine.isWorkerActive()).toBe(true);
    expect(persistEngine.isWorkerActive()).toBe(true);
    const onOverflow = vi.fn<() => void>();
    remoteEngine.setOnOverflow(onOverflow);
    expect(FakeWorker.instances).toHaveLength(2);
    // Overflow on one consumer's engine must not fire another's handlers nor
    // reset the other engine's worker generation.
    const remotePending = remoteEngine.decodeRemote(remoteFrameRaw);
    const remoteWorker = FakeWorker.instances.find((worker) =>
      worker.posted.some((message) => message.type === "decode-remote"),
    )!;
    remoteWorker.respond({
      v: CLIENT_ENGINE_PROTOCOL_VERSION,
      generation: 0,
      type: "overflow",
    });
    expect(onOverflow).toHaveBeenCalledOnce();
    await expect(remotePending).rejects.toBeInstanceOf(ClientEngineOverflowError);
    const persistWorker = FakeWorker.instances.find((worker) => worker !== remoteWorker)!;
    expect(persistWorker).toBeDefined();
    const persistPending = persistEngine.parseJson("{}");
    const persistRequest = persistWorker.posted.find((message) => message.type === "parse-json");
    expect(persistRequest).toMatchObject({ generation: 0 });
    void persistPending.catch(() => undefined);
  });

  it("rejects overflow, notifies the host, and resets generation", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const onOverflow = vi.fn<() => void>();
    const host = getRemoteSocketEngine();
    host.setOnOverflow(onOverflow);
    expect(host.isWorkerActive()).toBe(true);

    const pending = Array.from({ length: CLIENT_ENGINE_MAX_PENDING }, () =>
      host.decodeRemote(remoteFrameRaw),
    );
    const overflow = host.decodeRemote(remoteFrameRaw);
    await expect(overflow).rejects.toBeInstanceOf(ClientEngineOverflowError);
    expect(onOverflow).toHaveBeenCalledOnce();
    const settled = await Promise.allSettled(pending);
    expect(settled.every((result) => result.status === "rejected")).toBe(true);

    const worker = FakeWorker.instances[0]!;
    expect(worker.posted.some((message) => message.type === "reset")).toBe(true);
    const reset = worker.posted.find((message) => message.type === "reset");
    expect(reset).toMatchObject({
      v: CLIENT_ENGINE_PROTOCOL_VERSION,
      type: "reset",
      generation: 1,
    });
  });

  it("drops stale replies after a generation reset", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const host = getRemoteSocketEngine();
    const promise = host.decodeRemote(remoteFrameRaw);
    const worker = FakeWorker.instances[0]!;
    const request = worker.posted[0];
    expect(request).toMatchObject({
      type: "decode-remote",
      generation: 0,
      raw: remoteFrameRaw,
    });
    if (!request || request.type !== "decode-remote") throw new Error("expected decode request");

    host.reset();
    worker.respond({
      v: CLIENT_ENGINE_PROTOCOL_VERSION,
      generation: request.generation,
      id: request.id,
      type: "decode-remote",
      ok: true,
      message: { hijacked: true },
    });
    await expect(promise).rejects.toThrow(/reset/);

    const next = host.decodeRemote(remoteFrameRaw);
    const nextRequest = worker.posted.find(
      (message) => message.type === "decode-remote" && message.generation === 1,
    );
    expect(nextRequest).toMatchObject({ type: "decode-remote", generation: 1 });
    if (!nextRequest || nextRequest.type !== "decode-remote") {
      throw new Error("expected next decode request");
    }
    worker.respond({
      v: CLIENT_ENGINE_PROTOCOL_VERSION,
      generation: nextRequest.generation,
      id: nextRequest.id,
      type: "decode-remote",
      ok: true,
      message: remoteFrameExpected.message,
    });
    await expect(next).resolves.toEqual(remoteFrameExpected);
  });

  it("falls back to sync decode when the worker times out", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", FakeWorker);
    const host = getRemoteSocketEngine();
    const promise = host.decodeRemote(remoteFrameRaw);
    await vi.advanceTimersByTimeAsync(CLIENT_ENGINE_TIMEOUT_MS);
    await expect(promise).resolves.toEqual(remoteFrameExpected);
    const worker = FakeWorker.instances[0]!;
    expect(worker.posted.some((message) => message.type === "ack")).toBe(true);
  });

  describe("protocol version mismatch (V5 2.6: typed rejection, never a silent drop)", () => {
    it("rejects pending work typed when a reply carries a foreign version", async () => {
      vi.stubGlobal("Worker", FakeWorker);
      const host = getRemoteSocketEngine();
      const promise = host.decodeRemote(remoteFrameRaw);
      const worker = FakeWorker.instances[0]!;
      const request = worker.posted[0];
      if (!request || request.type !== "decode-remote") throw new Error("expected decode request");

      // A worker speaking a NEWER protocol answers with its own version.
      worker.respond({
        v: CLIENT_ENGINE_PROTOCOL_VERSION + 1,
        generation: request.generation,
        id: request.id,
        type: "decode-remote",
        ok: true,
        message: remoteFrameExpected.message,
      } as unknown as ClientEngineResponse);
      await expect(promise).rejects.toBeInstanceOf(ClientEngineProtocolMismatchError);
      // The mismatched worker is retired: later work takes the sync fallback
      // instead of feeding it more requests.
      expect(host.isWorkerActive()).toBe(false);
      await expect(host.decodeRemote(remoteFrameRaw)).resolves.toEqual(remoteFrameExpected);
    });

    it("rejects pending work typed on an explicit protocol-mismatch response", async () => {
      vi.stubGlobal("Worker", FakeWorker);
      const host = getRemoteSocketEngine();
      const promise = host.decodeRemote(remoteFrameRaw);
      const worker = FakeWorker.instances[0]!;
      worker.respond({
        v: CLIENT_ENGINE_PROTOCOL_VERSION,
        type: "protocol-mismatch",
        receivedV: 0,
      });
      await expect(promise).rejects.toBeInstanceOf(ClientEngineProtocolMismatchError);
      expect(host.isWorkerActive()).toBe(false);
    });

    it("worker answers a foreign-version request with a typed protocol-mismatch", async () => {
      // Old-reader test for the worker side: a worker speaking version 1 that
      // receives a request it cannot interpret must ANSWER typed instead of
      // dropping the request (the old behavior starved the caller until its
      // timeout fell back silently).
      vi.resetModules();
      const posted: ClientEngineResponse[] = [];
      const fakeSelf: {
        postMessage: (data: ClientEngineResponse) => void;
        onmessage: ((event: { data: ClientEngineRequest }) => void) | null;
      } = {
        postMessage: (data) => posted.push(data),
        onmessage: null,
      };
      vi.stubGlobal("self", fakeSelf);
      await import("./clientEngineWorker");
      expect(fakeSelf.onmessage).toBeTypeOf("function");

      fakeSelf.onmessage?.({
        data: {
          v: 0,
          generation: 0,
          id: 1,
          type: "decode-remote",
          raw: "{}",
        } as unknown as ClientEngineRequest,
      });
      expect(posted).toEqual([
        { v: CLIENT_ENGINE_PROTOCOL_VERSION, type: "protocol-mismatch", receivedV: 0 },
      ]);

      posted.length = 0;
      fakeSelf.onmessage?.({
        data: {
          v: CLIENT_ENGINE_PROTOCOL_VERSION + 3,
          generation: 0,
          id: 2,
          type: "parse-json",
          raw: "{}",
        } as unknown as ClientEngineRequest,
      });
      expect(posted).toEqual([
        {
          v: CLIENT_ENGINE_PROTOCOL_VERSION,
          type: "protocol-mismatch",
          receivedV: CLIENT_ENGINE_PROTOCOL_VERSION + 3,
        },
      ]);

      // Regression: a current-version request is still processed normally.
      posted.length = 0;
      const frame = JSON.stringify({ type: "event", seq: 1, event: { type: "thread-state" } });
      fakeSelf.onmessage?.({
        data: {
          v: CLIENT_ENGINE_PROTOCOL_VERSION,
          generation: 0,
          id: 3,
          type: "decode-remote",
          raw: frame,
        },
      });
      expect(posted).toHaveLength(1);
      const response = posted[0]!;
      expect(response).toMatchObject({
        v: CLIENT_ENGINE_PROTOCOL_VERSION,
        generation: 0,
        id: 3,
        type: "decode-remote",
        ok: true,
      });
      if (response.type !== "decode-remote" || !response.ok)
        throw new Error("expected decode reply");
      expect(response.message).toEqual({ type: "event", seq: 1, event: { type: "thread-state" } });
    });
  });
});
