import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_ENGINE_PROTOCOL_VERSION,
  type ClientEngineRequest,
  type ClientEngineResponse,
} from "./protocol";
import {
  ClientEngineLaneDisposedError,
  ClientEngineLaneOverflowError,
  ClientEngineLaneSupersededError,
  ClientEngineTimeoutError,
  ClientEngineWorkerUnavailableError,
} from "./clientEngineErrors";
import { getRemoteSocketEngine, resetClientEngineHostForTests } from "./clientEngineHost";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<ClientEngineResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  readonly posted: ClientEngineRequest[] = [];
  readonly responded = new Set<number>();
  autoRespond = false;

  constructor(_url: URL | string, _options?: WorkerOptions) {
    FakeWorker.instances.push(this);
  }

  postMessage(data: ClientEngineRequest): void {
    this.posted.push(data);
    if (!this.autoRespond) return;
    if (data.type !== "decode-remote") return;
    this.responded.add(data.id);
    this.respond({
      v: CLIENT_ENGINE_PROTOCOL_VERSION,
      generation: data.generation,
      id: data.id,
      type: "decode-remote",
      ok: true,
      message: { viaWorker: true, raw: data.raw },
    });
  }

  respond(data: ClientEngineResponse): void {
    if (data.type === "decode-remote") this.responded.add(data.id);
    this.onmessage?.({ data } as MessageEvent<ClientEngineResponse>);
  }

  fail(): void {
    this.onerror?.({} as ErrorEvent);
  }

  terminate(): void {}
}

const frame = (label: string) =>
  JSON.stringify({
    type: "event",
    seq: 1,
    event: { type: "thread-runtime-event", threadId: label, event: { label } },
  });

const decodeRequests = (worker: FakeWorker) =>
  worker.posted.filter(
    (message): message is Extract<ClientEngineRequest, { type: "decode-remote" }> =>
      message.type === "decode-remote",
  );

function respondAll(worker: FakeWorker): void {
  for (const request of decodeRequests(worker)) {
    if (worker.responded.has(request.id)) continue;
    worker.respond({
      v: CLIENT_ENGINE_PROTOCOL_VERSION,
      generation: request.generation,
      id: request.id,
      type: "decode-remote",
      ok: true,
      message: { viaWorker: true, raw: request.raw },
    });
  }
}

beforeEach(() => {
  FakeWorker.instances.length = 0;
  vi.stubGlobal("Worker", FakeWorker);
  resetClientEngineHostForTests();
});

afterEach(() => {
  resetClientEngineHostForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("client engine lanes (A3 admission and fairness)", () => {
  it("interleaves lanes so a flooded host's queue cannot starve a quiet host", async () => {
    const host = getRemoteSocketEngine();
    const flooded = host.createLane({ key: "host-a" });
    const quiet = host.createLane({ key: "host-b" });
    expect(host.isWorkerActive()).toBe(true);
    const worker = FakeWorker.instances[0]!;

    const pendingFlood = Array.from({ length: 20 }, (_, index) =>
      flooded.decodeRemote(frame(`a-${index}`)),
    );
    const quietPromise = quiet.decodeRemote(frame("b-0"));

    // The flooded lane fills its in-flight window (8); the quiet lane's single
    // frame is posted immediately instead of waiting behind A's queued tail.
    const postedLabels = decodeRequests(worker).map(
      (request) => JSON.parse(request.raw).event.threadId as string,
    );
    expect(postedLabels.filter((label) => label.startsWith("a-"))).toHaveLength(8);
    const quietIndex = postedLabels.indexOf("b-0");
    expect(quietIndex).toBe(8);

    // Draining the in-flight window continues the flood without reordering it.
    respondAll(worker);
    await expect(quietPromise).resolves.toEqual({
      ok: true,
      message: { viaWorker: true, raw: frame("b-0") },
    });
    worker.autoRespond = true;
    respondAll(worker);
    const floodResults = await Promise.all(pendingFlood);
    expect(floodResults.every((result) => result.ok)).toBe(true);
    const orderedLabels = decodeRequests(worker).map(
      (request) => JSON.parse(request.raw).event.threadId as string,
    );
    expect(orderedLabels.filter((label) => label.startsWith("a-"))).toEqual(
      Array.from({ length: 20 }, (_, index) => `a-${index}`),
    );
  });

  it("keeps host B decoding while host A exhausts its retained byte budget", async () => {
    const host = getRemoteSocketEngine();
    const flooded = host.createLane({ key: "byte-a", maxBytes: 64 });
    const healthy = host.createLane({ key: "byte-b" });
    expect(host.isWorkerActive()).toBe(true);
    const worker = FakeWorker.instances[0]!;

    const raw = "x".repeat(32);
    const held = flooded.decodeRemote(raw);
    void held.catch(() => undefined);
    // The posted frame still charges its 64 measured bytes.
    expect(flooded.retainedBytes()).toBe(64);
    await expect(flooded.decodeRemote(raw)).rejects.toBeInstanceOf(ClientEngineLaneOverflowError);
    await expect(held).rejects.toBeInstanceOf(ClientEngineLaneOverflowError);
    // A's canceled frame stays charged as an unconsumed worker clone.
    expect(host.outstandingTransportCount()).toBe(1);
    expect(host.retainedBytes()).toBe(64);

    // Host A's failed lane does not affect host B.
    worker.autoRespond = true;
    await expect(healthy.decodeRemote(frame("b-0"))).resolves.toMatchObject({ ok: true });

    // Only the worker's reply for A's canceled frame releases its reservation.
    const heldRequest = decodeRequests(worker)[0]!;
    worker.respond({
      v: CLIENT_ENGINE_PROTOCOL_VERSION,
      generation: heldRequest.generation,
      id: heldRequest.id,
      type: "decode-remote",
      ok: true,
      message: { hijacked: true },
    });
    expect(host.retainedBytes()).toBe(0);
  });

  it("expires aged queued work with a typed timeout without touching other lanes", async () => {
    vi.useFakeTimers();
    const host = getRemoteSocketEngine();
    const slow = host.createLane({ key: "slow", inFlight: 1, maxAgeMs: 500 });
    const other = host.createLane({ key: "other" });
    expect(host.isWorkerActive()).toBe(true);
    const worker = FakeWorker.instances[0]!;

    const posted = slow.decodeRemote(frame("slow-0"));
    const queued = slow.decodeRemote(frame("slow-1"));
    void posted.catch(() => undefined);
    const queuedSettled = queued.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(500);
    await expect(queuedSettled).resolves.toBeInstanceOf(ClientEngineTimeoutError);
    // Only the aged lane failed; the other lane still decodes.
    worker.autoRespond = true;
    await expect(other.decodeRemote(frame("other-0"))).resolves.toMatchObject({ ok: true });
  });

  it("rejects a hard-killed worker's backlog typed and never parses it inline", async () => {
    const host = getRemoteSocketEngine();
    const lane = host.createLane({ key: "killed" });
    expect(host.isWorkerActive()).toBe(true);
    const worker = FakeWorker.instances[0]!;

    const inFlight = [1, 2, 3].map((index) => lane.decodeRemote(frame(`killed-${index}`)));
    const settled = inFlight.map((promise) => promise.catch((error: unknown) => error));
    worker.fail();
    const results = await Promise.all(settled);
    for (const result of results) {
      expect(result).toBeInstanceOf(ClientEngineWorkerUnavailableError);
    }
    expect(host.workerMode()).toBe("unavailable");

    // Subsequent jobs are rejected typed while the worker is unavailable; the
    // backlog is never executed on the UI thread (no decode post, no resolve).
    const postsBefore = decodeRequests(worker).length;
    for (let index = 0; index < 50; index += 1) {
      await expect(lane.decodeRemote(frame(`late-${index}`))).rejects.toBeInstanceOf(
        ClientEngineWorkerUnavailableError,
      );
    }
    expect(decodeRequests(worker)).toHaveLength(postsBefore);
  });

  it("treats an unsupported worker as a typed reduced state, never as an inline fallback", async () => {
    class ThrowingWorker {
      constructor() {
        throw new Error("worker construction unsupported");
      }
    }
    vi.stubGlobal("Worker", ThrowingWorker);
    const host = getRemoteSocketEngine();
    const lane = host.createLane({ key: "throwing" });
    await expect(lane.decodeRemote(frame("throwing"))).rejects.toBeInstanceOf(
      ClientEngineWorkerUnavailableError,
    );
    expect(host.workerMode()).toBe("unavailable");
    // Still typed-rejected on the next job; the platform path (no Worker global
    // at all) is the only one that executes work inline.
    await expect(lane.decodeRemote(frame("throwing-2"))).rejects.toBeInstanceOf(
      ClientEngineWorkerUnavailableError,
    );
  });

  it("re-probes a failed worker on a bounded backoff and resumes decoding", async () => {
    vi.useFakeTimers();
    const host = getRemoteSocketEngine();
    const lane = host.createLane({ key: "reprobe" });
    expect(host.isWorkerActive()).toBe(true);
    const first = FakeWorker.instances[0]!;
    const pending = lane.decodeRemote(frame("before"));
    const settled = pending.catch((error: unknown) => error);
    first.fail();
    await expect(settled).resolves.toBeInstanceOf(ClientEngineWorkerUnavailableError);

    expect(FakeWorker.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(249);
    expect(FakeWorker.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWorker.instances).toHaveLength(2);
    expect(host.workerMode()).toBe("active");

    const second = FakeWorker.instances[1]!;
    second.autoRespond = true;
    await expect(lane.decodeRemote(frame("after"))).resolves.toMatchObject({ ok: true });
  });

  it("stops automatic re-probes after the bounded attempt budget", async () => {
    vi.useFakeTimers();
    const host = getRemoteSocketEngine();
    const lane = host.createLane({ key: "bounded" });
    expect(host.isWorkerActive()).toBe(true);
    FakeWorker.instances[0]!.fail();

    // Each automatic probe constructs a worker that immediately fails again.
    for (let probe = 0; probe < 5; probe += 1) {
      await vi.advanceTimersByTimeAsync(5_000);
      FakeWorker.instances.at(-1)!.fail();
    }
    expect(FakeWorker.instances).toHaveLength(6);

    // A demand-driven probe right after the budget is rate-limited: the lane
    // stays latched until its consumer renews for a new connection.
    await expect(lane.decodeRemote(frame("demand"))).rejects.toBeInstanceOf(
      ClientEngineWorkerUnavailableError,
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWorker.instances).toHaveLength(6);
    // ...and after a renew a later demand probe recovers without any automatic
    // loop.
    lane.renew();
    const recovered = lane.decodeRemote(frame("demand-2"));
    expect(FakeWorker.instances).toHaveLength(7);
    const probeWorker = FakeWorker.instances[6]!;
    const request = decodeRequests(probeWorker)[0]!;
    probeWorker.respond({
      v: CLIENT_ENGINE_PROTOCOL_VERSION,
      generation: request.generation,
      id: request.id,
      type: "decode-remote",
      ok: true,
      message: { viaWorker: true, raw: request.raw },
    });
    await expect(recovered).resolves.toMatchObject({ ok: true });
  });

  it("fences superseded and disposed generations so stale results never apply", async () => {
    const host = getRemoteSocketEngine();
    const lane = host.createLane({ key: "fencing" });
    expect(host.isWorkerActive()).toBe(true);
    const worker = FakeWorker.instances[0]!;

    const stale = lane.decodeRemote(frame("stale"));
    const staleSettled = stale.catch((error: unknown) => error);
    lane.renew();
    await expect(staleSettled).resolves.toBeInstanceOf(ClientEngineLaneSupersededError);

    // A late reply for the superseded generation is inert.
    const staleRequest = decodeRequests(worker)[0]!;
    worker.respond({
      v: CLIENT_ENGINE_PROTOCOL_VERSION,
      generation: staleRequest.generation,
      id: staleRequest.id,
      type: "decode-remote",
      ok: true,
      message: { hijacked: true },
    });

    worker.autoRespond = true;
    await expect(lane.decodeRemote(frame("fresh"))).resolves.toMatchObject({ ok: true });

    worker.autoRespond = false;
    const pendingAtDispose = lane.decodeRemote(frame("disposed"));
    const disposeSettled = pendingAtDispose.catch((error: unknown) => error);
    lane.dispose();
    await expect(disposeSettled).resolves.toBeInstanceOf(ClientEngineLaneDisposedError);
    await expect(lane.decodeRemote(frame("after-dispose"))).rejects.toBeInstanceOf(
      ClientEngineLaneDisposedError,
    );
  });
});
