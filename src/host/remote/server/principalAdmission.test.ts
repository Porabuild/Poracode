import { describe, expect, it } from "vitest";
import type { WebSocket } from "ws";
import {
  DEFAULT_MAX_BASELINE_BYTES_PER_PRINCIPAL,
  DEFAULT_MAX_CONCURRENT_PRINCIPAL_WORK,
  DEFAULT_MAX_QUEUED_BYTES_PER_PRINCIPAL,
  DEFAULT_MAX_SOCKETS_PER_PRINCIPAL,
  DEFAULT_MAX_TOTAL_SOCKETS,
  DEFAULT_OVERLOAD_RETRY_AFTER_MS,
  PrincipalAdmissionController,
  PrincipalOverloadError,
  resolvePrincipalAdmissionLimits,
} from "./principalAdmission";

function limits(overrides: Record<string, number> = {}) {
  return resolvePrincipalAdmissionLimits({
    appVersion: "test",
    identity: { desktopId: "d", label: "d" },
    host: "127.0.0.1",
    port: 0,
    ...overrides,
  } as never);
}

interface FakeSocket extends WebSocket {
  /** The transport `close` event; the engine releases its reservations here. */
  closeTransport(): void;
}

function fakeSocket(name: string): FakeSocket {
  const listeners: Array<() => void> = [];
  const socket = {
    name,
    once: (event: string, listener: () => void) => {
      if (event === "close") listeners.push(listener);
      return socket;
    },
    closeTransport: () => {
      for (const listener of listeners.splice(0)) listener();
    },
  };
  return socket as unknown as FakeSocket;
}

/** Eviction is the WS layer's job; these admission-only tests never reserve
 * outbound bytes, so a no-op evict hook keeps the controller construction
 * explicit without needing a transport. */
function createController(options: Record<string, number> = {}): PrincipalAdmissionController {
  return new PrincipalAdmissionController(limits(options), { evictSocket: () => {} });
}

describe("principal admission limits", () => {
  it("resolves documented defaults and derives the aggregate from the transport budget", () => {
    const resolved = limits();
    expect(resolved.maxConcurrentPrincipalWork).toBe(DEFAULT_MAX_CONCURRENT_PRINCIPAL_WORK);
    expect(resolved.maxSocketsPerPrincipal).toBe(DEFAULT_MAX_SOCKETS_PER_PRINCIPAL);
    expect(resolved.maxTotalSockets).toBe(DEFAULT_MAX_TOTAL_SOCKETS);
    expect(resolved.maxQueuedBytesPerPrincipal).toBe(DEFAULT_MAX_QUEUED_BYTES_PER_PRINCIPAL);
    expect(resolved.maxBaselineBytesPerPrincipal).toBe(DEFAULT_MAX_BASELINE_BYTES_PER_PRINCIPAL);
    expect(resolved.retryAfterMs).toBe(DEFAULT_OVERLOAD_RETRY_AFTER_MS);
    // Explicit transport budget carries into the aggregate default.
    expect(limits({ maxConcurrentIngressWork: 48 }).maxTotalPrincipalWork).toBe(48);
    // Small budgets scale the control reserve like the transport semaphore.
    expect(limits({ maxConcurrentPrincipalWork: 8 }).reservedPrincipalControlCapacity).toBe(1);
  });

  it("rejects invalid budgets loudly", () => {
    expect(() => limits({ maxSocketsPerPrincipal: 0 })).toThrow("maxSocketsPerPrincipal");
    expect(() => limits({ maxTotalQueuedBytes: -1 })).toThrow("maxTotalQueuedBytes");
    expect(() =>
      limits({ maxConcurrentPrincipalWork: 4, reservedPrincipalControlCapacity: 4 }),
    ).toThrow("reservedPrincipalControlCapacity");
  });
});

describe("principal work admission", () => {
  it("reserves control capacity per principal and isolates principals", () => {
    const controller = createController({
      maxConcurrentPrincipalWork: 4,
      reservedPrincipalControlCapacity: 1,
    });
    const bulk = [
      controller.tryAdmitWork("a", "bulk"),
      controller.tryAdmitWork("a", "bulk"),
      controller.tryAdmitWork("a", "bulk"),
    ];
    // Bulk may only fill max - reserved (3 of 4).
    expect(() => controller.tryAdmitWork("a", "bulk")).toThrow(PrincipalOverloadError);
    // Control may use the whole allowance.
    const control = controller.tryAdmitWork("a", "control");
    expect(controller.usage("a").work).toEqual({ bulk: 3, control: 1 });
    expect(() => controller.tryAdmitWork("a", "control")).toThrow(PrincipalOverloadError);
    // A different principal is unaffected.
    const other = controller.tryAdmitWork("b", "bulk");
    expect(controller.usage("b").work).toEqual({ bulk: 1, control: 0 });

    for (const lease of bulk) lease.release();
    control.release();
    other.release();
    expect(controller.usage("a").work).toEqual({ bulk: 0, control: 0 });
    expect(controller.totals().work).toEqual({ bulk: 0, control: 0 });
  });

  it("releases exactly once", () => {
    const controller = createController({ maxConcurrentPrincipalWork: 1 });
    const lease = controller.tryAdmitWork("a", "control");
    lease.release();
    lease.release();
    expect(controller.totals().work).toEqual({ bulk: 0, control: 0 });
    // The released slot is usable again, and only once.
    controller.tryAdmitWork("a", "control").release();
    expect(controller.usage("a").work.control).toBe(0);
  });

  it("bounds aggregate work across principals", () => {
    const controller = createController({
      maxConcurrentPrincipalWork: 4,
      maxTotalPrincipalWork: 2,
    });
    controller.tryAdmitWork("a", "bulk");
    controller.tryAdmitWork("b", "bulk");
    expect(() => controller.tryAdmitWork("c", "bulk")).toThrow(PrincipalOverloadError);
  });
});

describe("principal socket admission", () => {
  it("caps sockets per principal and in total, and releases once", () => {
    const controller = createController({ maxSocketsPerPrincipal: 2, maxTotalSockets: 3 });
    const a1 = controller.tryAdmitSocket("a");
    const a2 = controller.tryAdmitSocket("a");
    expect(() => controller.tryAdmitSocket("a")).toThrow(PrincipalOverloadError);
    const b1 = controller.tryAdmitSocket("b");
    expect(() => controller.tryAdmitSocket("b")).toThrow(PrincipalOverloadError);
    a1.release();
    a1.release();
    expect(controller.usage("a").sockets).toBe(1);
    // The freed slot is reusable.
    const a3 = controller.tryAdmitSocket("a");
    a2.release();
    a3.release();
    b1.release();
    expect(controller.totals().sockets).toBe(0);
  });
});

describe("principal watch admission", () => {
  it("caps watches per principal, dedupes rewatches, and releases on teardown", () => {
    const controller = createController({ maxWatchesPerPrincipal: 2 });
    const ws = fakeSocket("ws-a");
    controller.tryAdmitWatch(ws, "a", "term-1");
    controller.tryAdmitWatch(ws, "a", "term-1"); // rewatch is idempotent
    controller.tryAdmitWatch(ws, "a", "term-2");
    expect(controller.usage("a").watches).toBe(2);
    expect(() => controller.tryAdmitWatch(ws, "a", "term-3")).toThrow(PrincipalOverloadError);
    // Another connection of the same principal shares the principal budget.
    expect(() => controller.tryAdmitWatch(fakeSocket("ws-a2"), "a", "term-3")).toThrow(
      PrincipalOverloadError,
    );
    // A different principal has its own allowance.
    controller.tryAdmitWatch(fakeSocket("ws-b"), "b", "term-3");

    controller.releaseWatch(ws, "term-1");
    controller.releaseWatch(ws, "term-1");
    expect(controller.usage("a").watches).toBe(1);
    controller.tryAdmitWatch(ws, "a", "term-3");
    // Connection teardown releases every remaining reservation exactly once.
    controller.releaseConnection(ws);
    expect(controller.usage("a").watches).toBe(0);
    controller.releaseConnection(ws);
    expect(controller.totals().watches).toBe(1);
  });

  it("bounds aggregate watches across principals", () => {
    const controller = createController({ maxTotalWatches: 1 });
    controller.tryAdmitWatch(fakeSocket("ws-a"), "a", "term-1");
    expect(() => controller.tryAdmitWatch(fakeSocket("ws-b"), "b", "term-1")).toThrow(
      PrincipalOverloadError,
    );
  });
});

describe("principal baseline admission", () => {
  it("bounds retained baseline bytes and streams, keyed by stream identity", () => {
    const controller = createController({
      maxBaselineBytesPerPrincipal: 100,
      maxBaselineStreamsPerPrincipal: 2,
    });
    const ws = fakeSocket("ws-a");
    controller.tryAdmitBaseline(ws, "a", "watch-1", 1, 60);
    controller.tryAdmitBaseline(ws, "a", "watch-1", 1, 60); // same stream is idempotent
    expect(controller.usage("a")).toMatchObject({ baselineStreams: 1, baselineBytes: 60 });
    // Byte cap applies before the stream cap.
    expect(() => controller.tryAdmitBaseline(ws, "a", "watch-2", 2, 50)).toThrow(
      PrincipalOverloadError,
    );
    controller.tryAdmitBaseline(ws, "a", "watch-2", 2, 40);
    expect(controller.usage("a").baselineBytes).toBe(100);
    // Stream cap reached (2 of 2).
    expect(() => controller.tryAdmitBaseline(ws, "a", "watch-3", 3, 1)).toThrow(
      PrincipalOverloadError,
    );
    // A replacement stream (new epoch) must not be admitted while the old
    // identity still holds its bytes.
    expect(() => controller.tryAdmitBaseline(ws, "a", "watch-1", 2, 10)).toThrow(
      PrincipalOverloadError,
    );
    // Releasing the old identity frees its bytes; releasing that identity
    // again cannot release the newer stream's reservation.
    controller.releaseBaseline(ws, "watch-1", 1);
    controller.tryAdmitBaseline(ws, "a", "watch-1", 2, 10);
    expect(controller.usage("a").baselineBytes).toBe(50);
    controller.releaseBaseline(ws, "watch-1", 1);
    expect(controller.usage("a").baselineBytes).toBe(50);
    controller.releaseBaseline(ws, "watch-1", 2);
    expect(controller.usage("a").baselineBytes).toBe(40);
    // Connection teardown releases what remains, exactly once.
    controller.releaseConnection(ws);
    controller.releaseConnection(ws);
    expect(controller.totals()).toMatchObject({ baselineStreams: 0, baselineBytes: 0 });
  });

  it("bounds aggregate baseline bytes across principals", () => {
    const controller = createController({ maxTotalBaselineBytes: 10 });
    controller.tryAdmitBaseline(fakeSocket("ws-a"), "a", "watch-1", 1, 10);
    expect(() => controller.tryAdmitBaseline(fakeSocket("ws-b"), "b", "watch-1", 1, 1)).toThrow(
      PrincipalOverloadError,
    );
  });
});

describe("principal outbound byte admission", () => {
  it("retains an evicted socket's reservation until the transport closes, then frees it once", () => {
    const evicted: WebSocket[] = [];
    const admission = new PrincipalAdmissionController(
      limits({ maxQueuedBytesPerPrincipal: 100, maxTotalQueuedBytes: 1_000 }),
      { evictSocket: (ws) => evicted.push(ws) },
    );
    const congested = fakeSocket("ws-a");
    const recipient = fakeSocket("ws-a2");
    const first = admission.tryReserveOutboundBytes(congested, "a", 60);
    expect(first).not.toBeNull();
    expect(admission.outboundQueuedBytes("a")).toBe(60);

    // The crossing reservation sheds the congested socket through the wired
    // hook. Its bytes are still retained by the transport, so the frame is
    // refused instead of overdrawing the principal budget.
    const second = admission.tryReserveOutboundBytes(recipient, "a", 50);
    expect(second).toBeNull();
    expect(evicted).toEqual([congested]);
    expect(admission.outboundQueuedBytes("a")).toBe(60);

    // Dropping the connection is a separate lease release; it must not free
    // budget the transport still holds.
    admission.releaseConnection(congested);
    expect(admission.outboundQueuedBytes("a")).toBe(60);

    // The transport close releases the retained bytes exactly once.
    congested.closeTransport();
    congested.closeTransport();
    expect(admission.outboundQueuedBytes("a")).toBe(0);

    // Only now is the recipient admissible again.
    const retry = admission.tryReserveOutboundBytes(recipient, "a", 50);
    expect(retry).not.toBeNull();
    expect(admission.outboundQueuedBytes("a")).toBe(50);
    retry!.release();
    admission.releaseConnection(recipient);
    expect(admission.outboundQueuedBytes("a")).toBe(0);
  });
});

describe("typed overload", () => {
  it("carries a retry hint and a machine reason", () => {
    const controller = createController({ maxSocketsPerPrincipal: 1, overloadRetryAfterMs: 2_500 });
    controller.tryAdmitSocket("a");
    let captured: unknown;
    try {
      controller.tryAdmitSocket("a");
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(PrincipalOverloadError);
    const overload = captured as PrincipalOverloadError;
    expect(overload.status).toBe(429);
    expect(overload.code).toBe("principal_busy");
    expect(overload.retryAfterMs).toBe(2_500);
    expect(overload.watchReason).toBe("principal-sockets-capacity");
  });
});
