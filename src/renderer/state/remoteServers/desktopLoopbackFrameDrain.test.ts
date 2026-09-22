import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientEngineWorkerMode } from "@/renderer/state/remote/engine";
import type { DesktopFrameDecodeResult } from "@/renderer/state/remote/engine/decode";
import {
  DesktopLoopbackFrameDrain,
  type DesktopLoopbackDecodePort,
  type DesktopLoopbackDrainUnavailableReason,
} from "./desktopLoopbackFrameDrain";
import type { DesktopLoopbackFrame } from "./desktopLoopbackFrames";
import { parseDesktopLoopbackFrame } from "./desktopLoopbackFrames";
import {
  DesktopLoopbackIntake,
  type DesktopLoopbackIntakeDeps,
  type DesktopLoopbackSocket,
} from "./desktopLoopbackIntake";

type Deferred = {
  readonly promise: Promise<DesktopFrameDecodeResult>;
  resolve: (result: DesktopFrameDecodeResult) => void;
  reject: (error: unknown) => void;
};

function deferred(): Deferred {
  let resolve!: (result: DesktopFrameDecodeResult) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<DesktopFrameDecodeResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class FakeDecodePort implements DesktopLoopbackDecodePort {
  workerMode: ClientEngineWorkerMode = "active";
  readonly requests: string[] = [];
  renews = 0;
  disposals = 0;
  /** Bytes of posted work the port still retains, mirroring the real lane's
   * transport ledger: `renew()` only fences callbacks, it cannot free the
   * worker clone; only the result settling (or worker termination) does. */
  postedBytes = 0;
  behavior: (raw: string) => Promise<DesktopFrameDecodeResult> = async (raw) => ({
    ok: true,
    frame: parseDesktopLoopbackFrame(raw),
  });

  decodeDesktopFrame(raw: string): Promise<DesktopFrameDecodeResult> {
    this.requests.push(raw);
    this.postedBytes += raw.length * 2;
    const result = this.behavior(raw);
    // Return the original promise: the drain's own handlers must not gain a
    // microtask hop from this accounting.
    result.then(
      () => {
        this.postedBytes -= raw.length * 2;
      },
      () => {
        this.postedBytes -= raw.length * 2;
      },
    );
    return result;
  }

  renew(): void {
    this.renews += 1;
  }

  dispose(): void {
    this.disposals += 1;
  }
}

const eventFrame = (seq: number) =>
  JSON.stringify({ type: "event", seq, event: { type: "noop", seq } });
const terminalFrame = (id: string) => JSON.stringify({ type: "terminal-output", id, data: id });

function makeDrain(
  port: DesktopLoopbackDecodePort,
  overrides: Partial<ConstructorParameters<typeof DesktopLoopbackFrameDrain>[0]> = {},
) {
  const frames: DesktopLoopbackFrame[] = [];
  const unavailable: DesktopLoopbackDrainUnavailableReason[] = [];
  const drain = new DesktopLoopbackFrameDrain({
    decode: port,
    onFrame: (frame) => frames.push(frame),
    onUnavailable: (reason) => unavailable.push(reason),
    ...overrides,
  });
  return { drain, frames, unavailable };
}

describe("DesktopLoopbackFrameDrain (A3 ordered bounded managed decode)", () => {
  it("routes terminal and event frames in push order even when decode completes out of order", async () => {
    const port = new FakeDecodePort();
    const pending = new Map<string, Deferred>();
    port.behavior = (raw) => {
      const entry = deferred();
      pending.set(raw, entry);
      return entry.promise;
    };
    const { drain, frames } = makeDrain(port);
    const raw = [terminalFrame("t1"), eventFrame(1), terminalFrame("t2"), eventFrame(2)];
    for (const frame of raw) drain.push(frame);
    expect(port.requests).toEqual(raw);

    // Complete the last frame first: nothing may be routed out of order.
    pending.get(raw[3]!)!.resolve({ ok: true, frame: parseDesktopLoopbackFrame(raw[3]!) });
    pending.get(raw[1]!)!.resolve({ ok: true, frame: parseDesktopLoopbackFrame(raw[1]!) });
    await Promise.resolve();
    await Promise.resolve();
    expect(frames).toHaveLength(0);
    pending.get(raw[0]!)!.resolve({ ok: true, frame: parseDesktopLoopbackFrame(raw[0]!) });
    await Promise.resolve();
    await Promise.resolve();
    expect(frames.map((frame) => frame.kind)).toEqual(["terminal", "event"]);
    pending.get(raw[2]!)!.resolve({ ok: true, frame: parseDesktopLoopbackFrame(raw[2]!) });
    await Promise.resolve();
    await Promise.resolve();
    expect(frames.map((frame) => frame.kind)).toEqual(["terminal", "event", "terminal", "event"]);
  });

  it("bounds completed-but-unrouted results by the total retained count", async () => {
    const port = new FakeDecodePort();
    const pending = new Map<string, Deferred>();
    port.behavior = (raw) => {
      const entry = deferred();
      pending.set(raw, entry);
      return entry.promise;
    };
    const { drain, frames, unavailable } = makeDrain(port, { maxPending: 4, inFlight: 3 });
    const raws = [eventFrame(1), eventFrame(2), eventFrame(3), eventFrame(4), eventFrame(5)];
    drain.push(raws[0]!);
    drain.push(raws[1]!);
    drain.push(raws[2]!);
    expect(port.requests).toEqual([raws[0], raws[1], raws[2]]);

    // The first result stalls while later results complete: each completed
    // frame is parked, never routed, and still charges the retained count and
    // bytes. Admitting one more frame (posted after the later completions)
    // reaches exactly the bound.
    pending.get(raws[1]!)!.resolve({ ok: true, frame: parseDesktopLoopbackFrame(raws[1]!) });
    pending.get(raws[2]!)!.resolve({ ok: true, frame: parseDesktopLoopbackFrame(raws[2]!) });
    drain.push(raws[3]!);
    await Promise.resolve();
    await Promise.resolve();
    expect(frames).toHaveLength(0);
    expect(port.requests).toEqual(raws.slice(0, 4));
    expect(drain.pendingCount()).toBe(4);
    expect(drain.retainedBytes()).toBe(
      raws.slice(0, 4).reduce((sum, raw) => sum + raw.length * 2, 0),
    );

    // A fifth retained frame cannot be admitted; the leg fails typed and every
    // retained payload (parked results included) is released.
    drain.push(raws[4]!);
    expect(unavailable).toEqual(["overflow"]);
    expect(drain.pendingCount()).toBe(0);
    expect(drain.retainedBytes()).toBe(0);
    expect(port.renews).toBe(1);

    // Late completions from the failed generation are inert.
    pending.get(raws[0]!)!.resolve({ ok: true, frame: parseDesktopLoopbackFrame(raws[0]!) });
    await Promise.resolve();
    await Promise.resolve();
    expect(frames).toHaveLength(0);
    expect(drain.retainedBytes()).toBe(0);
  });

  it("charges posted frames to the drain byte budget", async () => {
    const port = new FakeDecodePort();
    port.behavior = () => deferred().promise;
    const { drain, unavailable } = makeDrain(port, { maxBytes: 64, inFlight: 2 });
    const raw = "x".repeat(16);
    drain.push(raw);
    drain.push(raw);
    expect(drain.retainedBytes()).toBe(64);
    expect(port.requests).toEqual([raw, raw]);
    drain.push(raw);
    expect(unavailable).toEqual(["bytes"]);
    expect(drain.pendingCount()).toBe(0);
    expect(drain.retainedBytes()).toBe(0);
    // The drain drops its own accounting and fences the decode port, but the
    // port still holds the posted clones: renew() cannot reclaim them
    // synchronously. The engine-level transport ledger keeps charging them
    // until the worker consumes the message or the worker is terminated.
    expect(port.renews).toBe(1);
    expect(port.postedBytes).toBeGreaterThan(0);
  });

  it("fences posted work on overflow without claiming the clones are reclaimed", async () => {
    const port = new FakeDecodePort();
    const pending = new Map<string, Deferred>();
    port.behavior = (raw) => {
      const entry = deferred();
      pending.set(raw, entry);
      return entry.promise;
    };
    const { drain, unavailable } = makeDrain(port, { maxBytes: 64, inFlight: 2 });
    const raws = ["x".repeat(16), "y".repeat(16), "z".repeat(16)];
    drain.push(raws[0]!);
    drain.push(raws[1]!);
    expect(port.postedBytes).toBe(64);
    drain.push(raws[2]!);
    expect(unavailable).toEqual(["bytes"]);
    // Drain-side accounting is gone, but the port (and therefore the worker)
    // still holds both posted clones until their results settle.
    expect(drain.retainedBytes()).toBe(0);
    expect(port.postedBytes).toBe(64);
    expect(port.renews).toBe(1);

    pending.get(raws[0]!)!.resolve({ ok: false, error: "invalid" });
    pending.get(raws[1]!)!.resolve({ ok: false, error: "invalid" });
    await Promise.resolve();
    await Promise.resolve();
    expect(port.postedBytes).toBe(0);
    expect(drain.retainedBytes()).toBe(0);
  });

  it("releases retained bytes as parked results route", async () => {
    const port = new FakeDecodePort();
    const pending = new Map<string, Deferred>();
    port.behavior = (raw) => {
      const entry = deferred();
      pending.set(raw, entry);
      return entry.promise;
    };
    const { drain, frames } = makeDrain(port, { inFlight: 3 });
    const raws = [eventFrame(1), eventFrame(2), eventFrame(3)];
    for (const raw of raws) drain.push(raw);
    const bytes = raws.reduce((sum, raw) => sum + raw.length * 2, 0);
    expect(drain.retainedBytes()).toBe(bytes);

    pending.get(raws[1]!)!.resolve({ ok: true, frame: parseDesktopLoopbackFrame(raws[1]!) });
    pending.get(raws[2]!)!.resolve({ ok: true, frame: parseDesktopLoopbackFrame(raws[2]!) });
    await Promise.resolve();
    await Promise.resolve();
    expect(frames).toHaveLength(0);
    expect(drain.pendingCount()).toBe(3);
    expect(drain.retainedBytes()).toBe(bytes);

    pending.get(raws[0]!)!.resolve({ ok: true, frame: parseDesktopLoopbackFrame(raws[0]!) });
    await Promise.resolve();
    await Promise.resolve();
    expect(frames.map((frame) => frame.kind)).toEqual(["event", "event", "event"]);
    expect(drain.pendingCount()).toBe(0);
    expect(drain.retainedBytes()).toBe(0);
  });

  it("reports a byte-budget overflow once and stops accepting frames", async () => {
    const port = new FakeDecodePort();
    const { drain, frames, unavailable } = makeDrain(port, { maxBytes: 32, inFlight: 1 });
    port.behavior = () => deferred().promise;
    drain.push(JSON.stringify({ type: "event", seq: 1, event: { type: "x".repeat(64) } }));
    expect(unavailable).toEqual(["bytes"]);
    drain.push(eventFrame(2));
    expect(frames).toHaveLength(0);
    expect(port.requests).toHaveLength(0);
    expect(drain.isUnavailable()).toBe(true);
  });

  it("reports a count-budget overflow once", async () => {
    const port = new FakeDecodePort();
    const { drain, unavailable } = makeDrain(port, { maxPending: 2, inFlight: 2 });
    port.behavior = () => deferred().promise;
    drain.push(eventFrame(1));
    drain.push(eventFrame(2));
    drain.push(eventFrame(3));
    expect(unavailable).toEqual(["overflow"]);
    expect(port.requests).toEqual([eventFrame(1), eventFrame(2)]);
  });

  it("reports an age-budget overflow with a timer, not with new traffic", async () => {
    vi.useFakeTimers();
    try {
      const port = new FakeDecodePort();
      const { drain, unavailable } = makeDrain(port, { maxAgeMs: 500, inFlight: 1 });
      port.behavior = () => deferred().promise;
      drain.push(eventFrame(1));
      drain.push(eventFrame(2));
      expect(unavailable).toEqual([]);
      await vi.advanceTimersByTimeAsync(500);
      expect(unavailable).toEqual(["age"]);
      expect(drain.isUnavailable()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a worker failure once and fences late results; reset clears it", async () => {
    const port = new FakeDecodePort();
    const pending = deferred();
    port.behavior = () => pending.promise;
    const { drain, frames, unavailable } = makeDrain(port);
    drain.push(eventFrame(1));
    pending.reject(new Error("worker gone"));
    await Promise.resolve();
    await Promise.resolve();
    expect(unavailable).toEqual(["worker"]);
    // Unavailability fences this generation and renews the decode port;
    // actual reclamation of the port's posted work is the engine's
    // response/termination boundary, not this call.
    expect(port.renews).toBe(1);
    drain.push(eventFrame(2));
    expect(port.requests).toEqual([eventFrame(1)]);

    drain.reset();
    expect(port.renews).toBe(2);
    expect(drain.isUnavailable()).toBe(false);
    await vi.waitFor(() => expect(drain.pendingCount()).toBe(0));
    port.behavior = async (raw) => ({ ok: true, frame: parseDesktopLoopbackFrame(raw) });
    drain.push(eventFrame(3));
    await vi.waitFor(() => expect(frames).toHaveLength(1));
  });

  it("invalidates pending callbacks on dispose", async () => {
    const port = new FakeDecodePort();
    const pending = deferred();
    port.behavior = () => pending.promise;
    const { drain, frames, unavailable } = makeDrain(port);
    drain.push(eventFrame(1));
    drain.dispose();
    expect(port.disposals).toBe(1);
    pending.resolve({ ok: true, frame: parseDesktopLoopbackFrame(eventFrame(1)) });
    await Promise.resolve();
    await Promise.resolve();
    expect(frames).toHaveLength(0);
    expect(unavailable).toEqual([]);
  });
});

// ── Intake reduced-state wiring ──────────────────────────────────────

interface FakeSocketHarness {
  readonly socket: DesktopLoopbackSocket;
  sent: string[];
  closeCount: number;
  emitOpen(): void;
  emitMessage(data: unknown): void;
  emitClose(event?: { readonly code?: number; readonly reason?: string }): void;
}

function makeFakeSocket(): FakeSocketHarness {
  let onopen: (() => void) | null = null;
  let onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  let onclose: ((event?: { readonly code?: number; readonly reason?: string }) => void) | null =
    null;
  const sent: string[] = [];
  const harness: FakeSocketHarness = {
    sent,
    closeCount: 0,
    socket: {
      close: () => {
        harness.closeCount += 1;
      },
      send: (data: string) => {
        sent.push(data);
      },
      get onopen() {
        return onopen;
      },
      set onopen(handler) {
        onopen = handler;
      },
      get onmessage() {
        return onmessage;
      },
      set onmessage(handler) {
        onmessage = handler;
      },
      get onclose() {
        return onclose;
      },
      set onclose(handler) {
        onclose = handler;
      },
    },
    emitOpen: () => onopen?.(),
    emitMessage: (data) => onmessage?.({ data }),
    emitClose: (event) => onclose?.(event),
  };
  return harness;
}

function jsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function createFakeFetch() {
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/oauth/token")) {
      return jsonResponse(200, { accessToken: "access-1", refreshToken: "refresh-1" });
    }
    if (url.endsWith("/api/auth/websocket-ticket")) {
      return jsonResponse(200, { ticket: "ticket-1" });
    }
    throw new Error(`unexpected fetch url: ${url}`);
  }) as typeof fetch;
  return { fetchImpl };
}

function baseIntakeDeps(
  overrides: Partial<DesktopLoopbackIntakeDeps> & {
    readonly socketFactory: (url: string) => DesktopLoopbackSocket;
  },
): DesktopLoopbackIntakeDeps {
  return {
    endpoint: "http://127.0.0.1:9031",
    pairingToken: "pairing-credential",
    dispatch: () => {},
    requestRebuild: () => {},
    onActiveChanged: () => {},
    ...overrides,
  };
}

describe("managed loopback reduced state (A3)", () => {
  const intakes: DesktopLoopbackIntake[] = [];

  afterEach(() => {
    for (const intake of intakes.splice(0)) intake.dispose();
    vi.useRealTimers();
  });

  it("closes the leg without a synchronous parse burst and reconnects on the bounded cadence", async () => {
    vi.useFakeTimers();
    const { fetchImpl } = createFakeFetch();
    const sockets: FakeSocketHarness[] = [];
    const activations: boolean[] = [];
    const dispatch = vi.fn<DesktopLoopbackIntakeDeps["dispatch"]>();
    const exhausted = vi.fn<() => void>();
    const port = new FakeDecodePort();
    port.behavior = async () => {
      throw new Error("worker unavailable");
    };
    const intake = new DesktopLoopbackIntake(
      baseIntakeDeps({
        fetchImpl,
        decodeRetryDelayMs: 100,
        frameDecodePort: port,
        onRecoveryExhausted: exhausted,
        onActiveChanged: (active) => activations.push(active),
        dispatch: dispatch as DesktopLoopbackIntakeDeps["dispatch"],
        socketFactory: () => {
          const harness = makeFakeSocket();
          sockets.push(harness);
          return harness.socket;
        },
      }),
    );
    intakes.push(intake);
    const activation = intake.activate();
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(1);
    sockets[0]!.emitOpen();
    await activation;
    expect(intake.isActive()).toBe(true);

    // A bulk frame cannot be decoded: the leg is torn down (truthful inactive
    // state) and nothing is parsed on the UI thread.
    sockets[0]!.emitMessage(eventFrame(1));
    await vi.advanceTimersByTimeAsync(1);
    expect(dispatch).not.toHaveBeenCalled();
    expect(intake.isActive()).toBe(false);
    expect(activations).toEqual([true, false]);

    // The retry is bounded and never escalates a bootstrap that cannot repair
    // a worker outage.
    await vi.advanceTimersByTimeAsync(100);
    expect(sockets).toHaveLength(2);
    sockets[1]!.emitOpen();
    await vi.advanceTimersByTimeAsync(1);
    expect(intake.isActive()).toBe(true);
    expect(exhausted).not.toHaveBeenCalled();

    // The engine recovers: the same leg resumes decoding.
    port.behavior = async (raw) => ({ ok: true, frame: parseDesktopLoopbackFrame(raw) });
    sockets[1]!.emitMessage(eventFrame(2));
    await vi.advanceTimersByTimeAsync(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]![0]).toMatchObject({ type: "noop", seq: 2 });
  });

  it("backs the reduced-state cadence off instead of retrying tightly", async () => {
    vi.useFakeTimers();
    const { fetchImpl } = createFakeFetch();
    const sockets: FakeSocketHarness[] = [];
    const port = new FakeDecodePort();
    port.behavior = async () => {
      throw new Error("worker unavailable");
    };
    const intake = new DesktopLoopbackIntake(
      baseIntakeDeps({
        fetchImpl,
        decodeRetryDelayMs: 100,
        frameDecodePort: port,
        socketFactory: () => {
          const harness = makeFakeSocket();
          sockets.push(harness);
          return harness.socket;
        },
      }),
    );
    intakes.push(intake);
    const activation = intake.activate();
    await vi.advanceTimersByTimeAsync(1);
    sockets[0]!.emitOpen();
    await activation;
    sockets[0]!.emitMessage(eventFrame(1));
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(1);

    // 100 ms, then 200 ms, then 400 ms — never a tight loop.
    await vi.advanceTimersByTimeAsync(100);
    expect(sockets).toHaveLength(2);
    sockets[1]!.emitOpen();
    await vi.advanceTimersByTimeAsync(1);
    sockets[1]!.emitMessage(eventFrame(2));
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(150);
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(60);
    expect(sockets).toHaveLength(3);
  });
});
