import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_ENGINE_PROTOCOL_VERSION,
  CLIENT_ENGINE_TRANSPORT_WATCHDOG_MS,
  type ClientEngineRequest,
  type ClientEngineResponse,
} from "./protocol";
import { ClientEngineWorkerUnavailableError } from "./clientEngineErrors";
import { ClientEngineHost } from "./clientEngineHost";

type RemoteWorkRequest = Extract<ClientEngineRequest, { type: "decode-remote" }>;

/**
 * A live worker whose event loop has not consumed posted messages yet. It
 * records the structured clones the real worker would hold in its message
 * queue and only "consumes" them when the test responds or flushes.
 */
class PausedWorker {
  static instances: PausedWorker[] = [];
  onmessage: ((event: MessageEvent<ClientEngineResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  readonly posted: ClientEngineRequest[] = [];
  terminated = false;

  constructor(_url?: URL | string, _options?: WorkerOptions) {
    PausedWorker.instances.push(this);
  }

  postMessage(data: ClientEngineRequest): void {
    if (this.terminated) return;
    this.posted.push(structuredClone(data));
  }

  terminate(): void {
    this.terminated = true;
  }
}

interface WorkerSideSelf {
  onmessage: ((event: { data: ClientEngineRequest }) => void) | null;
  postMessage: (response: ClientEngineResponse) => void;
  /** Vite's worker-URL transform bases the module worker URL on
   * `self.location.href`, so the stub must keep a location. */
  readonly location: Location;
}

/** Runs the REAL worker module's message loop in the test process, FIFO and
 * generation-gated exactly like the deployed worker. Nothing is processed
 * until `flush()`. */
class LoopWorker {
  static instances: LoopWorker[] = [];
  static side: WorkerSideSelf | null = null;
  onmessage: ((event: MessageEvent<ClientEngineResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  readonly queue: ClientEngineRequest[] = [];
  terminated = false;

  constructor(_url?: URL | string, _options?: WorkerOptions) {
    LoopWorker.instances.push(this);
  }

  postMessage(data: ClientEngineRequest): void {
    if (this.terminated) return;
    this.queue.push(data);
  }

  terminate(): void {
    this.terminated = true;
    this.queue.length = 0;
  }

  deliver(response: ClientEngineResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<ClientEngineResponse>);
  }

  flush(): void {
    const side = LoopWorker.side;
    if (!side?.onmessage) throw new Error("real worker side not installed");
    side.postMessage = (response) => this.deliver(response);
    while (this.queue.length > 0) side.onmessage({ data: this.queue.shift()! });
  }
}

const raw32 = "x".repeat(32);
const validFrame = JSON.stringify({ type: "event", seq: 1, event: { type: "noop" } });

function decodeRequests(worker: PausedWorker): RemoteWorkRequest[] {
  return worker.posted.filter(
    (message): message is RemoteWorkRequest => message.type === "decode-remote",
  );
}

function respond(
  worker: PausedWorker,
  request: RemoteWorkRequest,
  message: unknown = { viaWorker: true, raw: request.raw },
): void {
  worker.onmessage?.({
    data: {
      v: CLIENT_ENGINE_PROTOCOL_VERSION,
      generation: request.generation,
      id: request.id,
      type: "decode-remote",
      ok: true,
      message,
    } as ClientEngineResponse,
  } as MessageEvent<ClientEngineResponse>);
}

const engines: ClientEngineHost[] = [];

function createEngine(
  options?: ConstructorParameters<typeof ClientEngineHost>[0],
): ClientEngineHost {
  const engine = new ClientEngineHost(options);
  engines.push(engine);
  return engine;
}

beforeEach(() => {
  PausedWorker.instances.length = 0;
  LoopWorker.instances.length = 0;
  vi.stubGlobal("Worker", PausedWorker);
});

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("client engine transport reservations (A3 correction)", () => {
  it("retains 100 canceled posted frames as transport reservations until the worker consumes them", async () => {
    // Parent repro, AFTER: a paused live worker holds 100 structured clones of
    // frames whose callbacks were canceled by renew(). The engine must keep
    // accounting them until the worker proves consumption (any response) or is
    // actually terminated; renew() only settles the callback promises.
    const engine = createEngine();
    const lane = engine.createLane({ key: "reconnecting", maxBytes: 64 });
    const rejected: Array<Promise<unknown>> = [];
    for (let cycle = 0; cycle < 100; cycle += 1) {
      rejected.push(lane.decodeRemote(raw32).catch((error: unknown) => error));
      lane.renew();
    }
    await Promise.all(rejected);

    const worker = PausedWorker.instances[0]!;
    expect(worker.terminated).toBe(false);
    const requests = decodeRequests(worker);
    expect(requests).toHaveLength(100);
    expect(requests.reduce((bytes, request) => bytes + request.raw.length * 2, 0)).toBe(6_400);
    expect(engine.retainedBytes()).toBe(6_400);
    expect(lane.retainedBytes()).toBe(0);

    for (const request of requests) respond(worker, request);
    expect(engine.retainedBytes()).toBe(0);
    expect(worker.terminated).toBe(false);
  });

  it("keeps canceled work charged across a global reset until a stale response arrives", async () => {
    const engine = createEngine();
    const lane = engine.createLane({ key: "reset" });
    const pending = lane.decodeRemote(raw32);
    const settled = pending.catch((error: unknown) => error);
    const worker = PausedWorker.instances[0]!;
    const request = decodeRequests(worker)[0]!;
    expect(engine.retainedBytes()).toBe(64);

    engine.reset();
    await expect(settled).resolves.toBeInstanceOf(Error);
    // The generation bump and the queued reset message do not free the clone
    // the worker still holds: only its actual response (even a stale one) or
    // termination may release the charge.
    expect(engine.retainedBytes()).toBe(64);

    respond(worker, request);
    expect(engine.retainedBytes()).toBe(0);
  });

  it("retires a hung worker when canceled transport fills the engine budget", async () => {
    vi.useFakeTimers();
    const engine = createEngine({ maxBytes: 128 });
    const laneA = engine.createLane({ key: "cap-a", maxBytes: 64 });
    const laneB = engine.createLane({ key: "cap-b" });
    laneA.decodeRemote(raw32).catch(() => undefined);
    laneA.renew();
    laneA.decodeRemote(raw32).catch(() => undefined);
    laneA.renew();
    const worker = PausedWorker.instances[0]!;
    expect(engine.retainedBytes()).toBe(128);

    // Admitting lane B would exceed the advertised engine byte bound because
    // of the two unconsumed clones: that is a worker-health signal, so the
    // watchdog retires the actual worker (freeing its clones) instead of
    // failing the healthy lane.
    const bSettled = laneB.decodeRemote(raw32).catch((error: unknown) => error);
    expect(worker.terminated).toBe(true);
    await expect(bSettled).resolves.toBeInstanceOf(ClientEngineWorkerUnavailableError);
    expect(engine.retainedBytes()).toBe(0);
    expect(engine.workerMode()).toBe("unavailable");

    // Truthful cross-lane recovery: the bounded re-probe constructs a real
    // replacement and the previously blocked lane decodes again.
    await vi.advanceTimersByTimeAsync(300);
    expect(engine.workerMode()).toBe("active");
    const replacement = PausedWorker.instances[1]!;
    const recovered = laneB.decodeRemote(raw32);
    const request = decodeRequests(replacement)[0]!;
    respond(replacement, request);
    await expect(recovered).resolves.toMatchObject({ ok: true });
  });

  it("retires a worker that does not consume canceled work within the watchdog budget", async () => {
    vi.useFakeTimers();
    const engine = createEngine();
    const lane = engine.createLane({ key: "watchdog" });
    lane.decodeRemote(raw32).catch(() => undefined);
    lane.renew();
    const worker = PausedWorker.instances[0]!;
    expect(engine.retainedBytes()).toBe(64);

    await vi.advanceTimersByTimeAsync(CLIENT_ENGINE_TRANSPORT_WATCHDOG_MS - 1);
    expect(worker.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(worker.terminated).toBe(true);
    expect(engine.retainedBytes()).toBe(0);
  });

  it("releases reservations on actual worker termination, not on lane dispose", async () => {
    const engine = createEngine();
    const lane = engine.createLane({ key: "dispose" });
    lane.decodeRemote(raw32).catch(() => undefined);
    lane.renew();
    const worker = PausedWorker.instances[0]!;
    expect(engine.retainedBytes()).toBe(64);

    lane.dispose();
    expect(engine.retainedBytes()).toBe(64);
    expect(worker.terminated).toBe(false);

    engine.dispose();
    expect(worker.terminated).toBe(true);
    expect(engine.retainedBytes()).toBe(0);
  });

  it("keeps credits bounded across lane dispose/recreate cycles and releases them on late responses", async () => {
    const engine = createEngine();
    const raw = "x".repeat(32);
    for (let cycle = 0; cycle < 5; cycle += 1) {
      const lane = engine.createLane({ key: "recreated", maxBytes: 64 });
      lane.decodeRemote(raw).catch(() => undefined);
      lane.dispose();
    }
    const worker = PausedWorker.instances[0]!;
    expect(engine.outstandingTransportCount()).toBe(5);
    expect(engine.retainedBytes()).toBe(5 * 64);

    for (const request of decodeRequests(worker)) respond(worker, request);
    expect(engine.outstandingTransportCount()).toBe(0);
    expect(engine.retainedBytes()).toBe(0);

    // A recreated lane still decodes after the churn.
    const lane = engine.createLane({ key: "recreated" });
    const good = lane.decodeRemote(raw);
    const request = decodeRequests(worker).at(-1)!;
    respond(worker, request);
    await expect(good).resolves.toMatchObject({ ok: true });
    expect(engine.retainedBytes()).toBe(0);
  });

  it("keeps a healthy lane decoding while another lane's canceled transport is charged", async () => {
    const engine = createEngine();
    const churn = engine.createLane({ key: "churn", maxBytes: 64 });
    const healthy = engine.createLane({ key: "healthy" });
    for (let cycle = 0; cycle < 10; cycle += 1) {
      churn.decodeRemote(raw32).catch(() => undefined);
      churn.renew();
    }
    const worker = PausedWorker.instances[0]!;
    expect(engine.retainedBytes()).toBe(640);

    const good = healthy.decodeRemote(validFrame);
    const request = decodeRequests(worker).find((candidate) => candidate.raw === validFrame)!;
    respond(worker, request, { type: "event", seq: 1, event: { type: "noop" } });
    await expect(good).resolves.toMatchObject({ ok: true });
    expect(engine.retainedBytes()).toBe(640);
  });

  it("keeps credits constant across repeated renew cycles when the worker responds", async () => {
    class ResponsiveWorker extends PausedWorker {
      override postMessage(data: ClientEngineRequest): void {
        super.postMessage(data);
        if (data.type !== "decode-remote") return;
        queueMicrotask(() => respond(this, data));
      }
    }
    vi.stubGlobal("Worker", ResponsiveWorker);
    const engine = createEngine();
    const lane = engine.createLane({ key: "responsive", maxBytes: 64 });
    for (let cycle = 0; cycle < 100; cycle += 1) {
      lane.decodeRemote(raw32).catch(() => undefined);
      lane.renew();
      await Promise.resolve();
    }
    // Every response released its reservation in the same turn, so 100 cycles
    // left no live work and no transport backlog.
    expect(engine.retainedBytes()).toBe(0);
    const worker = PausedWorker.instances[0]!;
    expect(decodeRequests(worker)).toHaveLength(100);
  });

  it("releases reservations when the real worker loop consumes stale-generation work", async () => {
    vi.resetModules();
    const side: WorkerSideSelf = {
      onmessage: null,
      postMessage: () => {},
      location: window.location,
    };
    vi.stubGlobal("self", side);
    await import("./clientEngineWorker");
    LoopWorker.side = side;
    vi.stubGlobal("Worker", LoopWorker);

    const engine = createEngine();
    const lane = engine.createLane({ key: "real-loop" });
    const first = lane.decodeRemote(validFrame);
    const firstSettled = first.catch((error: unknown) => error);
    const second = lane.decodeRemote(validFrame);
    const secondSettled = second.catch((error: unknown) => error);
    const worker = LoopWorker.instances[0]!;
    expect(engine.retainedBytes()).toBe(validFrame.length * 4);

    engine.reset();
    await expect(firstSettled).resolves.toBeInstanceOf(Error);
    await expect(secondSettled).resolves.toBeInstanceOf(Error);
    expect(engine.retainedBytes()).toBe(validFrame.length * 4);

    // The real loop processes work1, work2 (stale-generation responses) and
    // then the reset: the stale responses are the consumption proof.
    worker.flush();
    expect(engine.retainedBytes()).toBe(0);

    const fresh = lane.decodeRemote(validFrame);
    worker.flush();
    await expect(fresh).resolves.toMatchObject({ ok: true });
    expect(engine.retainedBytes()).toBe(0);
  });
});
