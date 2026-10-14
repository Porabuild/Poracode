import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_ENGINE_AUX_MAX_PENDING,
  CLIENT_ENGINE_AUX_STRINGIFY_MAX_BYTES,
  CLIENT_ENGINE_INLINE_FALLBACK_MAX_CHARS,
  CLIENT_ENGINE_PROTOCOL_VERSION,
  type ClientEngineRequest,
  type ClientEngineResponse,
} from "./protocol";
import { projectJsonBytes } from "./jsonProjection";
import {
  ClientEngineLaneOverflowError,
  ClientEngineProtocolMismatchError,
  ClientEngineTimeoutError,
  ClientEngineWorkerUnavailableError,
} from "./clientEngineErrors";
import {
  ClientEngineHost,
  getManagedLoopbackEngine,
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

  respond(data: ClientEngineResponse): void {
    this.onmessage?.({ data } as MessageEvent<ClientEngineResponse>);
  }

  fail(): void {
    this.onerror?.({} as ErrorEvent);
  }

  terminate(): void {}
}

/** A valid remote WS frame used as the decode workload in these tests. */
const remoteFrameRaw = JSON.stringify({
  type: "event",
  seq: 1,
  event: { type: "thread-state", threadId: "t-1" },
});
const remoteFrameFromWorker = {
  ok: true as const,
  message: {
    viaWorker: true,
    parsed: { type: "event", seq: 1, event: { type: "thread-state", threadId: "t-1" } },
  },
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
  it("runs work inline only when the platform has no Worker global at all", async () => {
    const host = getRemoteSocketEngine();
    expect(host.isWorkerSupported()).toBe(false);
    expect(host.workerMode()).toBe("unsupported");
    const sync = await host.decodeRemote(remoteFrameRaw);
    expect(sync).toEqual({
      ok: true,
      message: { type: "event", seq: 1, event: { type: "thread-state", threadId: "t-1" } },
    });
    await expect(host.decodeRemote("{")).resolves.toEqual({ ok: false, error: "invalid" });
  });

  it("gives the managed loopback leg its own engine", () => {
    expect(getManagedLoopbackEngine()).not.toBe(getRemoteSocketEngine());
    expect(getManagedLoopbackEngine()).not.toBe(getPersistJsonEngine());
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

  it("confines lane overflow to the overflowing lane, not the engine or other lanes", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const host = getRemoteSocketEngine();
    const flooded = host.createLane({ key: "host-a", maxPending: 2, maxBytes: 1_000_000 });
    const healthy = host.createLane({ key: "host-b" });
    const overflow = vi.fn<() => void>();
    flooded.addOverflowListener(overflow);

    expect(host.isWorkerActive()).toBe(true);
    const worker = FakeWorker.instances[0]!;
    const first = flooded.decodeRemote(remoteFrameRaw);
    const second = flooded.decodeRemote(remoteFrameRaw);
    void first.catch(() => undefined);
    void second.catch(() => undefined);
    // Third admission exceeds the lane count budget: only this lane rejects.
    await expect(flooded.decodeRemote(remoteFrameRaw)).rejects.toBeInstanceOf(
      ClientEngineLaneOverflowError,
    );
    expect(overflow).toHaveBeenCalledOnce();
    await expect(first).rejects.toBeInstanceOf(ClientEngineLaneOverflowError);
    await expect(second).rejects.toBeInstanceOf(ClientEngineLaneOverflowError);

    // The engine is NOT reset and the healthy lane still decodes: worker
    // generation is untouched by another lane's overflow.
    expect(worker.posted.some((message) => message.type === "reset")).toBe(false);
    const healthyRaw = JSON.stringify({ type: "event", seq: 9, event: { type: "noop" } });
    const healthyPromise = healthy.decodeRemote(healthyRaw);
    const healthyRequest = worker.posted.find(
      (message) => message.type === "decode-remote" && message.raw === healthyRaw,
    );
    if (!healthyRequest || healthyRequest.type !== "decode-remote") {
      throw new Error("expected healthy decode request");
    }
    worker.respond({
      v: CLIENT_ENGINE_PROTOCOL_VERSION,
      generation: healthyRequest.generation,
      id: healthyRequest.id,
      type: "decode-remote",
      ok: true,
      message: { viaWorker: true, parsed: { type: "event", seq: 9, event: { type: "noop" } } },
    });
    await expect(healthyPromise).resolves.toEqual({
      ok: true,
      message: { viaWorker: true, parsed: { type: "event", seq: 9, event: { type: "noop" } } },
    });
  });

  it("carries the lane byte budget as a UTF-16 upper bound of the raw frame", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const host = getRemoteSocketEngine();
    const lane = host.createLane({ key: "bytes", maxBytes: 64 });
    const small = lane.decodeRemote("{}");
    void small.catch(() => undefined);
    const bigRaw = JSON.stringify({ type: "event", seq: 1, event: { type: "x".repeat(64) } });
    await expect(lane.decodeRemote(bigRaw)).rejects.toBeInstanceOf(ClientEngineLaneOverflowError);
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
      message: { viaWorker: true, parsed: JSON.parse(remoteFrameRaw) },
    });
    await expect(next).resolves.toEqual(remoteFrameFromWorker);
  });

  it("rejects bulk decode with a typed timeout instead of parsing on the UI thread", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", FakeWorker);
    const host = getRemoteSocketEngine();
    const lane = host.createLane({ key: "timeout" });
    expect(host.isWorkerActive()).toBe(true);
    const worker = FakeWorker.instances[0]!;
    const promise = lane.decodeRemote(remoteFrameRaw);
    const timeoutSettled = promise.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(timeoutSettled).resolves.toBeInstanceOf(ClientEngineTimeoutError);
    expect(worker.posted.some((message) => message.type === "ack")).toBe(true);
  });

  it("keeps the bounded same-task fallback for persist JSON work", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", FakeWorker);
    const engine = getPersistJsonEngine();
    const inFlight = engine.parseJson('{"kept":true}');
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(inFlight).resolves.toEqual({ kept: true });
  });

  describe("retained-work bounds (A3 correction)", () => {
    it("charges posted frames to the lane byte budget instead of releasing at post time", async () => {
      vi.stubGlobal("Worker", FakeWorker);
      const host = new ClientEngineHost();
      try {
        const lane = host.createLane({ key: "posted-bytes", maxBytes: 64 });
        const overflow = vi.fn<() => void>();
        lane.addOverflowListener(overflow);
        const raw = "x".repeat(32);
        const first = lane.decodeRemote(raw);
        const firstSettled = first.catch((error: unknown) => error);
        // The posted frame still holds its payload: charge it.
        expect(lane.retainedBytes()).toBe(64);
        expect(host.retainedBytes()).toBe(64);
        const worker = FakeWorker.instances[0]!;
        await expect(lane.decodeRemote(raw)).rejects.toBeInstanceOf(ClientEngineLaneOverflowError);
        expect(overflow).toHaveBeenCalledOnce();
        // Overflowing the lane settles the callback immediately, but the
        // worker still holds the clone: the charge moves to the engine-level
        // transport ledger instead of vanishing.
        await expect(firstSettled).resolves.toBeInstanceOf(ClientEngineLaneOverflowError);
        expect(lane.retainedBytes()).toBe(0);
        expect(host.retainedBytes()).toBe(64);
        expect(host.outstandingTransportCount()).toBe(1);
        expect(worker.posted.filter((message) => message.type === "decode-remote")).toHaveLength(1);

        // The worker's reply for the discarded frame is the consumption proof
        // that releases the reservation; its result cannot resurrect anything.
        const discarded = worker.posted[0]!;
        if (discarded.type !== "decode-remote") throw new Error("expected decode request");
        worker.respond({
          v: CLIENT_ENGINE_PROTOCOL_VERSION,
          generation: discarded.generation,
          id: discarded.id,
          type: "decode-remote",
          ok: true,
          message: { hijacked: true },
        });
        expect(lane.retainedBytes()).toBe(0);
        expect(host.retainedBytes()).toBe(0);

        // A new connection (renew) admits and releases the same frame.
        lane.renew();
        const after = lane.decodeRemote(raw);
        const request = worker.posted.find(
          (message) => message.type === "decode-remote" && message.id !== discarded.id,
        );
        if (!request || request.type !== "decode-remote") throw new Error("expected next request");
        worker.respond({
          v: CLIENT_ENGINE_PROTOCOL_VERSION,
          generation: request.generation,
          id: request.id,
          type: "decode-remote",
          ok: true,
          message: { viaWorker: true, raw },
        });
        await expect(after).resolves.toMatchObject({ ok: true });
        expect(lane.retainedBytes()).toBe(0);
      } finally {
        host.dispose();
      }
    });

    it("enforces a per-engine global byte bound across lanes", async () => {
      vi.stubGlobal("Worker", FakeWorker);
      const host = new ClientEngineHost({ maxBytes: 96 });
      try {
        const laneA = host.createLane({ key: "global-a" });
        const laneB = host.createLane({ key: "global-b" });
        const raw = "x".repeat(16);
        const a1 = laneA.decodeRemote(raw);
        const a2 = laneA.decodeRemote(raw);
        const b1 = laneB.decodeRemote(raw);
        const b1Settled = b1.catch((error: unknown) => error);
        expect(host.retainedBytes()).toBe(96);

        // The fourth 32-byte frame would retain 128 > 96 engine-wide. Only the
        // admitting lane fails; host A's posted work is untouched, and B's
        // canceled frame stays charged as a transport reservation.
        await expect(laneB.decodeRemote(raw)).rejects.toBeInstanceOf(ClientEngineLaneOverflowError);
        await expect(b1Settled).resolves.toBeInstanceOf(ClientEngineLaneOverflowError);
        expect(host.retainedBytes()).toBe(96);
        expect(host.outstandingTransportBytes()).toBe(32);
        expect(host.outstandingTransportCount()).toBe(1);

        const worker = FakeWorker.instances[0]!;
        const posted = worker.posted.filter(
          (message): message is Extract<ClientEngineRequest, { type: "decode-remote" }> =>
            message.type === "decode-remote",
        );
        const [a1Request, a2Request, b1Request] = posted;
        if (!a1Request || !a2Request || !b1Request) throw new Error("expected three requests");
        for (const request of [a1Request, a2Request]) {
          worker.respond({
            v: CLIENT_ENGINE_PROTOCOL_VERSION,
            generation: request.generation,
            id: request.id,
            type: "decode-remote",
            ok: true,
            message: { viaWorker: true, raw: request.raw },
          });
        }
        await expect(a1).resolves.toMatchObject({ ok: true });
        await expect(a2).resolves.toMatchObject({ ok: true });
        expect(host.retainedBytes()).toBe(32);

        // B's worker reply releases the canceled frame's reservation.
        worker.respond({
          v: CLIENT_ENGINE_PROTOCOL_VERSION,
          generation: b1Request.generation,
          id: b1Request.id,
          type: "decode-remote",
          ok: true,
          message: { hijacked: true },
        });
        expect(host.retainedBytes()).toBe(0);

        // Freed budget is reusable after the failed lane is renewed.
        laneB.renew();
        const b2 = laneB.decodeRemote(raw);
        const bRequest = worker.posted
          .filter(
            (message): message is Extract<ClientEngineRequest, { type: "decode-remote" }> =>
              message.type === "decode-remote",
          )
          .at(-1);
        if (!bRequest) throw new Error("expected lane B request");
        worker.respond({
          v: CLIENT_ENGINE_PROTOCOL_VERSION,
          generation: bRequest.generation,
          id: bRequest.id,
          type: "decode-remote",
          ok: true,
          message: { viaWorker: true, raw },
        });
        await expect(b2).resolves.toMatchObject({ ok: true });
        expect(host.retainedBytes()).toBe(0);
      } finally {
        host.dispose();
      }
    });

    it("fences late replies so a stale id cannot release a replacement generation's charge", async () => {
      vi.stubGlobal("Worker", FakeWorker);
      const host = new ClientEngineHost();
      try {
        const lane = host.createLane({ key: "late-release", maxBytes: 64 });
        const raw = "x".repeat(32);
        const stale = lane.decodeRemote(raw);
        const staleSettled = stale.catch((error: unknown) => error);
        const worker = FakeWorker.instances[0]!;
        const staleRequest = worker.posted[0]!;
        if (staleRequest.type !== "decode-remote") throw new Error("expected decode request");

        host.reset();
        await expect(staleSettled).resolves.toBeInstanceOf(Error);

        const fresh = lane.decodeRemote(raw);
        expect(lane.retainedBytes()).toBe(64);
        // The reset did not free the stale clone: it is still reserved.
        expect(host.retainedBytes()).toBe(128);
        expect(host.outstandingTransportCount()).toBe(1);

        // Passes the worker generation gate, but its id is no longer pending:
        // it releases the stale reservation and must not touch the fresh
        // entry's charge.
        worker.respond({
          v: CLIENT_ENGINE_PROTOCOL_VERSION,
          generation: staleRequest.generation + 1,
          id: staleRequest.id,
          type: "decode-remote",
          ok: true,
          message: { hijacked: true },
        });
        expect(lane.retainedBytes()).toBe(64);
        expect(host.retainedBytes()).toBe(64);
        expect(host.outstandingTransportCount()).toBe(0);

        const freshRequest = worker.posted.find(
          (message) => message.type === "decode-remote" && message.id !== staleRequest.id,
        );
        if (!freshRequest || freshRequest.type !== "decode-remote") {
          throw new Error("expected fresh request");
        }
        worker.respond({
          v: CLIENT_ENGINE_PROTOCOL_VERSION,
          generation: freshRequest.generation,
          id: freshRequest.id,
          type: "decode-remote",
          ok: true,
          message: { viaWorker: true, raw },
        });
        await expect(fresh).resolves.toMatchObject({ ok: true });
        expect(lane.retainedBytes()).toBe(0);
      } finally {
        host.dispose();
      }
    });

    it("never parses a large persist payload inline when the worker dies", async () => {
      vi.stubGlobal("Worker", FakeWorker);
      const host = getPersistJsonEngine();
      const large = JSON.stringify({
        payload: "x".repeat(CLIENT_ENGINE_INLINE_FALLBACK_MAX_CHARS),
      });
      const inFlight = host.parseJson(large);
      const settled = inFlight.catch((error: unknown) => error);
      FakeWorker.instances[0]!.fail();
      await expect(settled).resolves.toBeInstanceOf(ClientEngineWorkerUnavailableError);

      const parseSpy = vi.spyOn(JSON, "parse");
      try {
        await expect(host.parseJson(large)).rejects.toBeInstanceOf(
          ClientEngineWorkerUnavailableError,
        );
        expect(parseSpy.mock.calls.some(([text]) => text === large)).toBe(false);
      } finally {
        parseSpy.mockRestore();
      }
    });

    it("keeps only an explicitly bounded small parse inline after worker death", async () => {
      vi.stubGlobal("Worker", FakeWorker);
      const host = getPersistJsonEngine();
      const first = host.parseJson('{"kept":true}');
      const settled = first.catch((error: unknown) => error);
      FakeWorker.instances[0]!.fail();
      await expect(settled).resolves.toEqual({ kept: true });
      // Later small hydrations still degrade to the inline fallback; nothing
      // larger or any stringify does.
      await expect(host.parseJson('{"also":1}')).resolves.toEqual({ also: 1 });
    });

    it("count-bounds the persist aux lane so a burst cannot retain unbounded payloads", async () => {
      vi.stubGlobal("Worker", FakeWorker);
      const host = getPersistJsonEngine();
      const raws = Array.from({ length: CLIENT_ENGINE_AUX_MAX_PENDING }, (_, index) =>
        JSON.stringify({ index, pad: "x".repeat(5_000) }),
      );
      const settled = raws.map((raw) => host.parseJson(raw).catch((error: unknown) => error));
      await expect(host.parseJson(raws[0]!)).rejects.toBeInstanceOf(ClientEngineLaneOverflowError);
      for (const result of settled) {
        await expect(result).resolves.toBeInstanceOf(ClientEngineLaneOverflowError);
      }
      // The aux lane is not an ordered stream: it stays usable after the
      // bounded overflow instead of latching all later degradations.
      const worker = FakeWorker.instances[0]!;
      const next = host.parseJson('{"after":true}');
      const request = worker.posted.find(
        (message) => message.type === "parse-json" && message.raw === '{"after":true}',
      );
      if (!request || request.type !== "parse-json") throw new Error("expected parse request");
      worker.respond({
        v: CLIENT_ENGINE_PROTOCOL_VERSION,
        generation: request.generation,
        id: request.id,
        type: "parse-json",
        ok: true,
        value: { after: true },
      });
      await expect(next).resolves.toEqual({ after: true });
    });

    it("refuses an over-budget stringify graph typed without posting it", async () => {
      vi.stubGlobal("Worker", FakeWorker);
      const host = getPersistJsonEngine();
      const warm = host.stringifyJson({ ok: true });
      const worker = FakeWorker.instances[0]!;
      const warmRequest = worker.posted[0]!;
      if (warmRequest.type !== "stringify-json") throw new Error("expected stringify");
      worker.respond({
        v: CLIENT_ENGINE_PROTOCOL_VERSION,
        generation: warmRequest.generation,
        id: warmRequest.id,
        type: "stringify-json",
        ok: true,
        json: '{"ok":true}',
      });
      await expect(warm).resolves.toBe('{"ok":true}');
      const postedBefore = worker.posted.length;

      // One character per UTF-16 unit: a projected graph of this size is
      // already over the per-request cap, and the projection aborts at the cap
      // instead of serializing the graph.
      const huge = { blob: "x".repeat(CLIENT_ENGINE_AUX_STRINGIFY_MAX_BYTES / 2) };
      const stringifySpy = vi.spyOn(JSON, "stringify");
      try {
        await expect(host.stringifyJson(huge)).rejects.toMatchObject({
          name: "ClientEngineAuxInputTooLargeError",
          reason: "too-large",
        });
        expect(worker.posted).toHaveLength(postedBefore);
        expect(host.retainedBytes()).toBe(0);
        // No whole-graph stringify was used to measure the refusal.
        expect(stringifySpy.mock.calls.some(([value]) => value === huge)).toBe(false);
      } finally {
        stringifySpy.mockRestore();
      }
    });

    it("refuses an unprojectable stringify graph typed instead of killing the worker", async () => {
      vi.stubGlobal("Worker", FakeWorker);
      const host = getPersistJsonEngine();
      await expect(host.stringifyJson({ fn: () => undefined })).rejects.toMatchObject({
        name: "ClientEngineAuxInputTooLargeError",
        reason: "unsupported",
      });
      // The refusal happened before any worker was materialized.
      expect(FakeWorker.instances).toHaveLength(0);
      expect(host.workerMode()).toBe("active");

      // The worker survives and still serves projected work, charged at the
      // bounded projection instead of a fixed reservation.
      const value = { kept: "x".repeat(32) };
      const expected = projectJsonBytes(value, CLIENT_ENGINE_AUX_STRINGIFY_MAX_BYTES);
      if (!expected.ok) throw new Error("expected a successful projection");
      const inFlight = host.stringifyJson(value);
      const worker = FakeWorker.instances[0]!;
      const request = worker.posted[0];
      if (!request || request.type !== "stringify-json") throw new Error("expected stringify");
      expect(host.retainedBytes()).toBe(expected.bytes);
      worker.respond({
        v: CLIENT_ENGINE_PROTOCOL_VERSION,
        generation: request.generation,
        id: request.id,
        type: "stringify-json",
        ok: true,
        json: JSON.stringify(value),
      });
      await expect(inFlight).resolves.toBe(JSON.stringify(value));
      expect(host.retainedBytes()).toBe(0);
    });

    it("keeps a lane-level loss latched across worker recovery until the consumer renews", async () => {
      vi.useFakeTimers();
      vi.stubGlobal("Worker", FakeWorker);
      const host = new ClientEngineHost();
      try {
        const lane = host.createLane({ key: "latched-loss", maxPending: 2, inFlight: 1 });
        const raw = "x".repeat(32);
        const first = lane.decodeRemote(raw);
        const firstSettled = first.catch((error: unknown) => error);
        const second = lane.decodeRemote(raw);
        const secondSettled = second.catch((error: unknown) => error);
        const worker = FakeWorker.instances[0]!;

        // Third frame overflows the lane: a lane-level loss, no renew yet.
        await expect(lane.decodeRemote(raw)).rejects.toBeInstanceOf(ClientEngineLaneOverflowError);
        await expect(firstSettled).resolves.toBeInstanceOf(ClientEngineLaneOverflowError);
        await expect(secondSettled).resolves.toBeInstanceOf(ClientEngineLaneOverflowError);

        // The worker then dies and the bounded re-probe constructs a
        // replacement; recovery must NOT overwrite the lane-level cause.
        worker.fail();
        await vi.advanceTimersByTimeAsync(300);
        const replacement = FakeWorker.instances[1]!;
        expect(replacement).not.toBe(worker);

        // Failed before the fix: worker recovery cleared the overflow latch and
        // this frame was admitted and posted past the loss on the same lane
        // generation, with no consumer renew(). Admission is synchronous, so
        // the posted-request count is checked before awaiting the rejection
        // (which would otherwise hang until the entry timeout).
        const late = lane.decodeRemote(raw).catch((error: unknown) => error);
        expect(
          replacement.posted.filter((message) => message.type === "decode-remote"),
        ).toHaveLength(0);
        expect(lane.pendingCount()).toBe(0);
        await expect(late).resolves.toBeInstanceOf(ClientEngineWorkerUnavailableError);

        // An explicit renew (new connection) is what reopens the lane.
        lane.renew();
        const after = lane.decodeRemote(raw);
        const request = replacement.posted.find((message) => message.type === "decode-remote");
        if (!request || request.type !== "decode-remote") throw new Error("expected request");
        expect(lane.retainedBytes()).toBe(64);
        replacement.respond({
          v: CLIENT_ENGINE_PROTOCOL_VERSION,
          generation: request.generation,
          id: request.id,
          type: "decode-remote",
          ok: true,
          message: { viaWorker: true, raw },
        });
        await expect(after).resolves.toMatchObject({ ok: true });
        expect(host.retainedBytes()).toBe(0);
      } finally {
        host.dispose();
      }
    });
  });

  describe("protocol version mismatch (V5 2.6: typed rejection, never a silent drop)", () => {
    it("retires the worker into a typed reduced state when a reply carries a foreign version", async () => {
      vi.stubGlobal("Worker", FakeWorker);
      const host = getRemoteSocketEngine();
      const lane = host.createLane({ key: "mismatch-version" });
      expect(host.isWorkerActive()).toBe(true);
      const worker = FakeWorker.instances[0]!;
      const promise = lane.decodeRemote(remoteFrameRaw);
      const request = worker.posted[0];
      if (!request || request.type !== "decode-remote") throw new Error("expected decode request");

      // A worker speaking a NEWER protocol answers with its own version.
      worker.respond({
        v: CLIENT_ENGINE_PROTOCOL_VERSION + 1,
        generation: request.generation,
        id: request.id,
        type: "decode-remote",
        ok: true,
        message: { hijacked: true },
      } as unknown as ClientEngineResponse);
      await expect(promise).rejects.toBeInstanceOf(ClientEngineProtocolMismatchError);
      // The mismatched worker is retired and the engine enters a typed reduced
      // state: later BULK work rejects typed instead of running on the UI.
      expect(host.workerMode()).toBe("unavailable");
      await expect(lane.decodeRemote(remoteFrameRaw)).rejects.toBeInstanceOf(
        ClientEngineWorkerUnavailableError,
      );
      expect(host.isWorkerActive()).toBe(false);
    });

    it("rejects pending work typed on an explicit protocol-mismatch response", async () => {
      vi.stubGlobal("Worker", FakeWorker);
      const host = getRemoteSocketEngine();
      const lane = host.createLane({ key: "mismatch-explicit" });
      expect(host.isWorkerActive()).toBe(true);
      const worker = FakeWorker.instances[0]!;
      const promise = lane.decodeRemote(remoteFrameRaw);
      worker.respond({
        v: CLIENT_ENGINE_PROTOCOL_VERSION,
        type: "protocol-mismatch",
        receivedV: 0,
      });
      await expect(promise).rejects.toBeInstanceOf(ClientEngineProtocolMismatchError);
      expect(host.workerMode()).toBe("unavailable");
    });

    it("worker answers a foreign-version request with a typed protocol-mismatch", async () => {
      // Old-reader test for the worker side: a worker speaking version 2 that
      // receives a version-3 request it cannot interpret must ANSWER typed
      // instead of dropping the request (the old behavior starved the caller
      // until its timeout fell back silently). A v2 worker also answers a v2
      // request with its own CURRENT version, so a stale v2 worker and a stale
      // v2 host can never half-serve each other.
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
          v: 2,
          generation: 0,
          id: 4,
          type: "decode-desktop-frame",
          raw: "{}",
        } as unknown as ClientEngineRequest,
      });
      // A stale v2 chunk that receives this v3 request answers typed instead
      // of half-serving the private frame vocabulary.
      expect(posted).toEqual([
        { v: CLIENT_ENGINE_PROTOCOL_VERSION, type: "protocol-mismatch", receivedV: 2 },
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
