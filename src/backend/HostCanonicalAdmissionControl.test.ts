import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HostCanonicalAdmissionControl,
  type CanonicalAdmissionPersistencePort,
} from "./HostCanonicalAdmissionControl";
import { RuntimePersistenceController } from "@/host/db/runtimePersistenceController";
import type { RuntimeQueueBounds } from "@/host/db/runtimeWriteQueue";
import type { RuntimeQueueCapacityChange } from "@/host/db/runtimeQueueCapacity";
import type { RuntimeEvent } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { estimateRuntimeEventBytes } from "@/shared/runtimeEventSize";
import {
  type CanonicalAdmissionMessage,
  type CanonicalAdmissionControl,
  CANONICAL_ADMISSION_MAX_REQUESTS,
} from "@/shared/canonicalAdmissionProtocol";

const cleanups: Array<() => void> = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.useRealTimers();
});
const event = (threadId: string, itemId = "item"): RuntimeEvent => ({
  type: "item.started",
  threadId,
  itemId,
  itemType: "assistant_message",
});
function request(
  requestSeq: number,
  threadId: string,
  events = [event(threadId)],
): Extract<CanonicalAdmissionMessage, { kind: "canonical-admission-request" }> {
  const sizes = events.map(estimateRuntimeEventBytes);
  return {
    kind: "canonical-admission-request",
    version: 2,
    generation: "boot",
    requestSeq,
    threadId,
    cost: {
      eventCount: events.length,
      eventBytes: sizes.reduce((n, b) => n + b, 0),
      maxEventBytes: Math.max(...sizes),
    },
  };
}
function harness(bounds: Partial<RuntimeQueueBounds> = {}) {
  const controls: CanonicalAdmissionControl[] = [];
  const published: SupervisorEvent[] = [];
  let listener: ((change: RuntimeQueueCapacityChange | { kind: "health" }) => void) | undefined;
  const controller = new RuntimePersistenceController({
    bounds,
    write: () => undefined,
    onCapacityChange: (change) => listener?.(change),
    onStateChange: () => listener?.({ kind: "health" }),
  });
  const port: CanonicalAdmissionPersistencePort = {
    reserve: vi.fn<RuntimePersistenceController["reserveAdmission"]>(
      controller.reserveAdmission.bind(controller),
    ),
    admit: vi.fn<RuntimePersistenceController["admitReserved"]>(
      controller.admitReserved.bind(controller),
    ),
    release: vi.fn<RuntimePersistenceController["releaseAdmissionReservation"]>(
      controller.releaseAdmissionReservation.bind(controller),
    ),
    observe: (next) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    },
  };
  let peer: { supportsCanonicalCredit: boolean; generation: string | null; admissionVersion?: 2 } =
    { supportsCanonicalCredit: true, generation: "boot", admissionVersion: 2 };
  const owner = new HostCanonicalAdmissionControl(
    {
      getPeerCanonicalCapabilities: () => peer,
      sendCanonicalAdmissionControl: (control) => controls.push(control),
    },
    (out) => published.push(out),
    port,
  );
  cleanups.push(() => {
    owner.retireOwner();
    owner.dispose();
    controller.resetForNewConnection();
  });
  const grant = (
    seq: number,
  ): Extract<CanonicalAdmissionControl, { control: "canonical-admission-grant" }> => {
    const result = controls.findLast(
      (c) => c.control === "canonical-admission-grant" && c.requestSeq === seq,
    );
    if (!result || result.control !== "canonical-admission-grant") throw new Error("grant absent");
    return result;
  };
  const deliver = (seq: number, events: RuntimeEvent[]) => {
    const g = grant(seq);
    owner.handle({
      kind: "canonical-admission-delivery",
      version: 2,
      generation: g.generation,
      requestSeq: seq,
      threadId: g.threadId,
      reservationId: g.reservationId,
      events,
    });
  };
  return {
    owner,
    controller,
    controls,
    published,
    port,
    grant,
    deliver,
    peer: (next: typeof peer) => {
      peer = next;
    },
  };
}

describe("host canonical admission2 owner", () => {
  it("ordered cancellation releases an unsent grant and also removes an ungranted quote", () => {
    const h = harness({ maxPendingEventsPerThread: 1 });
    h.owner.negotiate();
    h.owner.handle(request(1, "a"));
    h.owner.handle(request(2, "a"));
    h.owner.handle({
      kind: "canonical-admission-cancel",
      version: 2,
      generation: "boot",
      requestSeq: 2,
      threadId: "a",
    });
    expect(h.controls.at(-1)).toMatchObject({ outcome: "cancelled", requestSeq: 2 });
    const g = h.grant(1);
    h.owner.handle({
      kind: "canonical-admission-release",
      version: 2,
      generation: "boot",
      requestSeq: 1,
      threadId: "a",
      reservationId: g.reservationId,
    });
    expect(h.controller.capacitySnapshot().global.reservedEvents).toBe(0);
    expect(h.controls.at(-1)).toMatchObject({ outcome: "cancelled", requestSeq: 1 });
    h.deliver(1, [event("a")]);
    vi.runOnlyPendingTimers();
    expect(h.published).toEqual([]);
    expect(
      h.controls.filter((c) => c.control === "canonical-admission-grant").map((c) => c.requestSeq),
    ).toEqual([1]);
  });

  it("health-only storage recovery wakes a blocked quote without any queue capacity change", () => {
    const h = harness();
    h.owner.negotiate();
    h.controller.runControlWrite(() => {
      throw Object.assign(new Error("full"), { code: "SQLITE_FULL" });
    });
    h.owner.handle(request(1, "a"));
    expect(h.controller.getState()).toBe("degraded");
    expect(h.controls.filter((c) => c.control === "canonical-admission-grant")).toEqual([]);
    h.controller.runControlWrite(() => undefined);
    vi.advanceTimersByTime(2500);
    h.controller.runControlWrite(() => undefined);
    expect(h.controller.getState()).toBe("healthy");
    vi.runOnlyPendingTimers();
    expect(h.grant(1).threadId).toBe("a");
  });
  it("legacy capability leaves the plane inactive and causes no reservation", () => {
    const h = harness();
    h.peer({ supportsCanonicalCredit: true, generation: "boot" });
    h.owner.negotiate();
    h.owner.handle(request(1, "a"));
    expect(h.controls).toEqual([]);
    expect(h.port.reserve).not.toHaveBeenCalled();
  });

  it("reserves exact capacity, admits once, strips all private metadata, and only COMMIT frees queued capacity", () => {
    const h = harness();
    h.owner.negotiate();
    h.owner.handle(request(1, "a"));
    expect(h.controller.capacitySnapshot().global).toMatchObject({
      pendingEvents: 0,
      reservedEvents: 1,
    });
    const events = [event("a")];
    h.deliver(1, events);
    expect(h.published).toEqual([
      { type: "thread-runtime-event", threadId: "a", event: events[0] },
    ]);
    expect(h.controller.capacitySnapshot().global).toMatchObject({
      pendingEvents: 1,
      reservedEvents: 0,
    });
    h.deliver(1, events);
    expect(h.port.admit).toHaveBeenCalledTimes(1);
    expect(h.published).toHaveLength(1);
    const g = h.grant(1);
    h.owner.handle({
      kind: "canonical-admission-release",
      version: 2,
      generation: "boot",
      requestSeq: 1,
      threadId: "a",
      reservationId: g.reservationId,
    });
    expect(h.controller.capacitySnapshot().global.pendingEvents).toBe(1);
    vi.advanceTimersByTime(250);
    expect(h.controller.capacitySnapshot().global.pendingEvents).toBe(0);
  });

  it("repeated quotes resend the same token without taking extra capacity; changed quotes cannot replace it", () => {
    const h = harness();
    h.owner.negotiate();
    const q = request(1, "a");
    h.owner.handle(q);
    const g = h.grant(1);
    h.owner.handle(q);
    expect(h.controls.at(-1)).toEqual(g);
    h.owner.handle({ ...q, cost: { ...q.cost, eventBytes: q.cost.eventBytes + 1 } });
    expect(h.controls.at(-1)).toMatchObject({
      control: "canonical-admission-resolved",
      outcome: "invalid",
    });
    expect(h.controller.capacitySnapshot().global.reservedEvents).toBe(1);
    h.deliver(1, [event("a")]);
    expect(h.published).toHaveLength(1);
  });

  it("skips a blocked thread and grants it after a deferred COMMIT wake, without gap evidence", () => {
    const h = harness({ maxPendingEventsPerThread: 1 });
    h.owner.negotiate();
    h.owner.handle(request(1, "a"));
    h.owner.handle(request(2, "a"));
    h.owner.handle(request(3, "b"));
    expect(
      h.controls.filter((c) => c.control === "canonical-admission-grant").map((c) => c.requestSeq),
    ).toEqual([1, 3]);
    h.deliver(1, [event("a")]);
    expect(h.controller.contaminatedThreadCount()).toBe(0);
    vi.advanceTimersByTime(250);
    vi.runOnlyPendingTimers();
    expect(h.grant(2).threadId).toBe("a");
  });

  it("a mismatched payload gets retry without a gap; old grant stays charged until explicit ordered release", () => {
    const h = harness({ maxPendingEventsPerThread: 1 });
    h.owner.negotiate();
    h.owner.handle(request(1, "a"));
    h.deliver(1, [event("a", "wrong cost")]);
    expect(h.controls.at(-1)).toMatchObject({
      outcome: "retry",
      acceptedEvents: 0,
      refusedEvents: 0,
    });
    expect(h.controller.contaminatedThreadCount()).toBe(0);
    expect(h.controller.capacitySnapshot().global.reservedEvents).toBe(1);
    h.owner.handle(request(2, "a"));
    const g = h.grant(1);
    h.owner.handle({
      kind: "canonical-admission-release",
      version: 2,
      generation: "boot",
      requestSeq: 1,
      threadId: "a",
      reservationId: g.reservationId,
    });
    vi.runOnlyPendingTimers();
    expect(h.grant(2).threadId).toBe("a");
    h.deliver(2, [event("a")]);
    expect(h.published).toHaveLength(1);
  });

  it("a real shutdown refusal is not published and its unconsumed token is tracked until release", () => {
    const h = harness();
    h.owner.negotiate();
    h.owner.handle(request(1, "a"));
    h.controller.shutdown();
    h.deliver(1, [event("a")]);
    expect(h.controls.at(-1)).toMatchObject({ outcome: "refused", refusedEvents: 1 });
    expect(h.published).toEqual([]);
    expect(h.controller.capacitySnapshot().global.reservedEvents).toBe(1);
    const g = h.grant(1);
    h.owner.handle({
      kind: "canonical-admission-release",
      version: 2,
      generation: "boot",
      requestSeq: 1,
      threadId: "a",
      reservationId: g.reservationId,
    });
    expect(h.controller.capacitySnapshot().global.reservedEvents).toBe(0);
    expect(h.controller.getContamination("a")).toMatchObject({
      reason: "shutdown",
      refusedEvents: 1,
    });
  });

  it("reset tells the sender to retry retained payload; stale delivery cannot republish after a new grant", () => {
    const h = harness();
    h.owner.negotiate();
    h.owner.handle(request(1, "a"));
    h.controller.resetForNewConnection();
    expect(h.controls.at(-1)).toMatchObject({ outcome: "retry" });
    h.owner.handle(request(2, "a"));
    h.deliver(1, [event("a")]);
    expect(h.published).toEqual([]);
    h.deliver(2, [event("a")]);
    expect(h.published).toHaveLength(1);
  });

  it("retiring an owner releases all live and refused leases, cancels wakes, and fences its late messages", () => {
    const h = harness();
    h.owner.negotiate();
    h.owner.handle(request(1, "a"));
    h.owner.handle(request(2, "b"));
    h.deliver(2, [event("b", "mismatch")]);
    h.owner.retireOwner();
    expect(h.controller.capacitySnapshot().global.reservedEvents).toBe(0);
    h.deliver(1, [event("a")]);
    expect(h.published).toEqual([]);
    h.peer({ supportsCanonicalCredit: true, generation: "new", admissionVersion: 2 });
    h.owner.negotiate();
    h.owner.handle(request(3, "a"));
    expect(h.controller.capacitySnapshot().global.reservedEvents).toBe(0);
    expect(h.controls.at(-1)).toMatchObject({
      control: "canonical-admission-enable",
      generation: "new",
    });
  });

  it("replacement without positive retirement does not release potentially in-transit grants", () => {
    const h = harness();
    h.owner.negotiate();
    h.owner.handle(request(1, "a"));
    h.peer({ supportsCanonicalCredit: true, generation: "new", admissionVersion: 2 });
    expect(() => h.owner.negotiate()).toThrow("not retired");
    expect(h.controller.capacitySnapshot().global.reservedEvents).toBe(1);
    h.owner.dispose();
    expect(h.controller.capacitySnapshot().global.reservedEvents).toBe(1);
  });

  it("both unresolved requests and replay metadata have independent finite limits", () => {
    const h = harness();
    h.owner.negotiate();
    for (let seq = 1; seq <= CANONICAL_ADMISSION_MAX_REQUESTS; seq++)
      h.owner.handle(request(seq, `t${seq}`));
    h.owner.handle(request(CANONICAL_ADMISSION_MAX_REQUESTS + 1, "overflow"));
    expect(h.controls.at(-1)).toMatchObject({ outcome: "invalid" });
    expect(h.controller.capacitySnapshot().global.reservedEvents).toBe(
      CANONICAL_ADMISSION_MAX_REQUESTS,
    );
    h.owner.retireOwner();
    h.owner.negotiate();
    for (let seq = 1; seq <= CANONICAL_ADMISSION_MAX_REQUESTS + 1; seq++) {
      h.owner.handle(request(seq, "a"));
      h.deliver(seq, [event("a")]);
    }
    h.deliver(1, [event("a")]);
    expect(h.controls.at(-1)).toMatchObject({ outcome: "invalid", requestSeq: 1 });
    expect(h.published).toHaveLength(CANONICAL_ADMISSION_MAX_REQUESTS + 1);
  });
});
