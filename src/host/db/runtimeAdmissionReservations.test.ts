import { describe, expect, it } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { estimateRuntimeEventBytes } from "@/shared/runtimeEventSize";
import { RuntimeWriteQueue } from "./runtimeWriteQueue";
import {
  MAX_RUNTIME_ADMISSION_RESERVATIONS,
  MAX_RUNTIME_ADMISSION_THREAD_ID_BYTES,
  type RuntimeAdmissionCost,
} from "./runtimeAdmissionReservations";

const delta = (threadId: string, text = "chunk"): RuntimeEvent => ({
  type: "content.delta",
  threadId,
  itemId: "item",
  stream: "assistant_text",
  delta: text,
});
function cost(events: readonly RuntimeEvent[]): RuntimeAdmissionCost {
  const bytes = events.map(estimateRuntimeEventBytes);
  return {
    eventCount: events.length,
    eventBytes: bytes.reduce((total, size) => total + size, 0),
    maxEventBytes: Math.max(...bytes),
  };
}
function grant(
  queue: RuntimeWriteQueue,
  threadId: string,
  events: readonly RuntimeEvent[],
): string {
  const result = queue.reserveAdmission(threadId, cost(events));
  expect(result.kind).toBe("granted");
  if (result.kind !== "granted") throw new Error("expected grant");
  return result.reservation.id;
}

describe("queue admission reservations", () => {
  it("protects per-thread counts against other writers and transfers without free capacity", () => {
    const changes: string[] = [];
    const queue = new RuntimeWriteQueue(
      () => undefined,
      { maxPendingEventsPerThread: 2 },
      undefined,
      undefined,
      (change) => changes.push(change.kind),
    );
    const events = [delta("a"), delta("a", "🙂")];
    const id = grant(queue, "a", events);
    const reserved = queue.capacitySnapshot(["a"]);
    expect(reserved.global).toMatchObject({
      pendingEvents: 0,
      reservedEvents: 2,
      reservedBytes: cost(events).eventBytes,
    });
    expect(queue.enqueue("a", [delta("a")])).toMatchObject({
      acceptedEvents: 0,
      reason: "thread-events",
    });
    expect(queue.enqueueReserved("a", id, events)).toMatchObject({
      acceptedEvents: 2,
      refusedEvents: 0,
    });
    const admitted = queue.capacitySnapshot(["a"]);
    expect(admitted.global).toMatchObject({ pendingEvents: 2, reservedEvents: 0 });
    expect(admitted.global.remainingEvents).toBe(reserved.global.remainingEvents);
    expect(admitted.global.remainingBytes).toBe(reserved.global.remainingBytes);
    expect(changes).toEqual(["reserved", "admitted"]);
    expect(queue.enqueueReserved("a", id, events)).toEqual({ kind: "invalid-reservation" });
    queue.flushThread("a");
    expect(queue.capacitySnapshot().global.pendingEvents).toBe(0);
  });

  it("global byte and count limits include every outstanding grant", () => {
    const events = [delta("a")];
    const bytes = cost(events).eventBytes;
    const queue = new RuntimeWriteQueue(() => undefined, {
      maxPendingBytesGlobal: bytes * 4,
      maxPendingEventsGlobal: 2,
    });
    const id = grant(queue, "a", events);
    queue.enqueue("b", [delta("b")]);
    expect(queue.reserveAdmission("c", cost([delta("c")]))).toEqual({
      kind: "blocked",
      reason: "global-events",
    });
    expect(queue.enqueue("c", [delta("c")])).toMatchObject({
      acceptedEvents: 0,
      reason: "global-events",
    });
    queue.enqueueReserved("a", id, events);
    expect(queue.pendingEvents()).toBe(2);
    expect(queue.pendingBytes()).toBe(bytes * 2);
    const byteLimited = new RuntimeWriteQueue(() => undefined, {
      maxPendingBytesGlobal: bytes * 2,
    });
    grant(byteLimited, "a", events);
    byteLimited.enqueue("b", [delta("b")]);
    expect(byteLimited.reserveAdmission("c", cost([delta("c")]))).toEqual({
      kind: "blocked",
      reason: "global-bytes",
    });
  });

  it("rejects mismatched thread, byte cost, count or event maximum without losing the grant", () => {
    const queue = new RuntimeWriteQueue(() => undefined);
    const events = [delta("a", "one"), delta("a", "twenty")];
    const id = grant(queue, "a", events);
    const before = queue.capacitySnapshot(["a"]);
    expect(queue.enqueueReserved("b", id, events)).toEqual({ kind: "invalid-reservation" });
    expect(queue.enqueueReserved("a", id, events.slice(0, 1))).toEqual({
      kind: "invalid-reservation",
    });
    expect(queue.enqueueReserved("a", id, [delta("a", "changed"), events[1]!])).toEqual({
      kind: "invalid-reservation",
    });
    // Equal aggregate bytes alone do not prove the same largest event bound.
    expect(queue.enqueueReserved("a", id, [delta("a", "four"), delta("a", "fives")])).toEqual({
      kind: "invalid-reservation",
    });
    expect(queue.capacitySnapshot(["a"])).toEqual(before);
    expect(queue.enqueueReserved("a", id, events)).toMatchObject({ acceptedEvents: 2 });
  });

  it("failed storage and a pinned suffix keep occupancy charged after consumption", () => {
    let failed = true;
    const queue = new RuntimeWriteQueue(() => {
      if (failed) throw new Error("busy");
    });
    const events = [delta("a")];
    const id = grant(queue, "a", events);
    queue.enqueueReserved("a", id, events);
    const through = queue.pinThread("a");
    const suffix = [delta("a", "suffix")];
    queue.enqueueReserved("a", grant(queue, "a", suffix), suffix);
    const before = queue.capacitySnapshot(["a"]);
    expect(queue.flushThread("a").kind).toBe("failed");
    expect(queue.capacitySnapshot(["a"])).toEqual(before);
    failed = false;
    expect(queue.flushThread("a")).toMatchObject({ committedEvents: 1, persistSeq: through });
    expect(queue.pendingEvents()).toBe(1);
    expect(queue.pendingBytes()).toBe(cost(suffix).eventBytes);
    queue.releasePin("a");
    queue.flushThread("a");
    expect(queue.pendingBytes()).toBe(0);
  });

  it("the lone oversize slot cannot be stolen or combined with another grant", () => {
    const queue = new RuntimeWriteQueue(() => undefined, {
      maxPendingBytesPerThread: 1000,
      maxSingleEventBytes: 2000,
      maxPendingBytesGlobal: 3000,
    });
    const large = [delta("a", "x".repeat(1200))];
    const id = grant(queue, "a", large);
    expect(queue.reserveAdmission("a", cost([delta("a")]))).toEqual({
      kind: "blocked",
      reason: "thread-bytes",
    });
    expect(queue.enqueue("a", large)).toMatchObject({ acceptedEvents: 0, reason: "thread-bytes" });
    expect(queue.enqueue("b", [delta("b")]).acceptedEvents).toBe(1);
    expect(queue.enqueueReserved("a", id, large)).toMatchObject({
      acceptedEvents: 1,
      refusedEvents: 0,
    });
    expect(queue.stats().oversizeEvents).toBe(1);
    expect(queue.capacitySnapshot(["a"]).threads[0]?.maxNextEventBytes).toBe(0);
    queue.flushThread("a");
    expect(queue.stats().oversizeEvents).toBe(0);
  });

  it("discard/reuse and reset invalidate old tokens without affecting another thread", () => {
    const queue = new RuntimeWriteQueue(() => undefined);
    const events = [delta("a")];
    const old = grant(queue, "a", events);
    const other = grant(queue, "b", [delta("b")]);
    queue.discard("a");
    expect(queue.enqueueReserved("a", old, events)).toEqual({ kind: "invalid-reservation" });
    expect(queue.enqueueReserved("b", other, [delta("b")])).toMatchObject({ acceptedEvents: 1 });
    const fresh = grant(queue, "a", events);
    expect(fresh).not.toBe(old);
    queue.clear();
    expect(queue.enqueueReserved("a", fresh, events)).toEqual({ kind: "invalid-reservation" });
    expect(queue.capacitySnapshot().global).toMatchObject({
      pendingEvents: 0,
      reservedEvents: 0,
      reservedBytes: 0,
    });
  });

  it("explicit cancellation releases only that unsent grant once", () => {
    const queue = new RuntimeWriteQueue(() => undefined);
    const id = grant(queue, "a", [delta("a")]);
    grant(queue, "b", [delta("b")]);
    expect(queue.releaseAdmissionReservation(id)).toBe(true);
    expect(queue.releaseAdmissionReservation(id)).toBe(false);
    expect(queue.capacitySnapshot().global.reservedEvents).toBe(1);
    expect(queue.enqueueReserved("a", id, [delta("a")])).toEqual({ kind: "invalid-reservation" });
  });

  it("caller mutation cannot alter an issued grant's accounting", () => {
    const queue = new RuntimeWriteQueue(() => undefined);
    const events = [delta("a")];
    const result = queue.reserveAdmission("a", cost(events));
    if (result.kind !== "granted") throw new Error("expected grant");
    const id = result.reservation.id;
    Object.assign(result.reservation, { eventBytes: 0, eventCount: 0, threadId: "b" });
    expect(queue.capacitySnapshot().global.reservedBytes).toBe(cost(events).eventBytes);
    expect(queue.enqueueReserved("a", id, events)).toMatchObject({ acceptedEvents: 1 });
  });

  it("queued and reserved counters obey budgets through mixed writer operations", () => {
    const bounds = {
      maxPendingEventsGlobal: 16,
      maxPendingEventsPerThread: 8,
      maxPendingBytesGlobal: 8000,
      maxPendingBytesPerThread: 3000,
    };
    const queue = new RuntimeWriteQueue(() => undefined, bounds);
    const ids = ["a", "b", "c"];
    const pending = new Map<string, RuntimeEvent[]>();
    const held = new Map<string, { threadId: string; events: RuntimeEvent[] }>();
    const transfers: ReturnType<RuntimeWriteQueue["enqueueReserved"]>[] = [];
    let seed = 31;
    for (let step = 0; step < 400; step++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const threadId = ids[(seed >>> 3) % ids.length]!;
      const existing = pending.get(threadId) ?? [];
      const batch = [delta(threadId, `🙂${step}`), delta(threadId, `é${step}`)];
      switch (seed % 6) {
        case 0: {
          const reserved = queue.reserveAdmission(threadId, cost(batch));
          if (reserved.kind === "granted")
            held.set(reserved.reservation.id, { threadId, events: batch });
          break;
        }
        case 1: {
          const admitted = queue.enqueue(threadId, batch);
          existing.push(...batch.slice(0, admitted.acceptedEvents));
          pending.set(threadId, existing);
          break;
        }
        case 2: {
          const candidate = [...held].find(([, value]) => value.threadId === threadId);
          if (candidate) {
            transfers.push(queue.enqueueReserved(threadId, candidate[0], candidate[1].events));
            existing.push(...candidate[1].events);
            pending.set(threadId, existing);
            held.delete(candidate[0]);
          }
          break;
        }
        case 3:
          queue.flushThread(threadId);
          pending.delete(threadId);
          break;
        case 4:
          queue.discard(threadId);
          pending.delete(threadId);
          for (const [token, value] of held) if (value.threadId === threadId) held.delete(token);
          break;
        case 5: {
          const token = held.keys().next().value;
          if (token) {
            queue.releaseAdmissionReservation(token);
            held.delete(token);
          }
          break;
        }
      }
      const queued = [...pending.values()].flat();
      const reserved = [...held.values()].flatMap((value) => value.events);
      const snapshot = queue.capacitySnapshot(ids);
      expect(snapshot.global.pendingEvents).toBe(queued.length);
      expect(snapshot.global.pendingBytes).toBe(
        queued.reduce((sum, event) => sum + estimateRuntimeEventBytes(event), 0),
      );
      expect(snapshot.global.reservedEvents).toBe(reserved.length);
      expect(snapshot.global.reservedBytes).toBe(
        reserved.reduce((sum, event) => sum + estimateRuntimeEventBytes(event), 0),
      );
      expect(snapshot.global.pendingEvents + snapshot.global.reservedEvents).toBeLessThanOrEqual(
        bounds.maxPendingEventsGlobal,
      );
      expect(snapshot.global.pendingBytes + snapshot.global.reservedBytes).toBeLessThanOrEqual(
        bounds.maxPendingBytesGlobal,
      );
      for (const thread of snapshot.threads) {
        expect(thread.pendingEvents + thread.reservedEvents).toBeLessThanOrEqual(
          bounds.maxPendingEventsPerThread,
        );
        expect(thread.pendingBytes + thread.reservedBytes).toBeLessThanOrEqual(
          bounds.maxPendingBytesPerThread,
        );
      }
    }
    expect(transfers.length).toBeGreaterThan(0);
    for (const transferred of transfers)
      expect(transferred).toMatchObject({ acceptedEvents: 2, refusedEvents: 0 });
  });

  it("reservation metadata has an independent entry bound", () => {
    const queue = new RuntimeWriteQueue(() => undefined);
    for (let i = 0; i < MAX_RUNTIME_ADMISSION_RESERVATIONS; i++)
      grant(queue, `thread-${i}`, [delta(`thread-${i}`)]);
    expect(queue.reserveAdmission("last", cost([delta("last")]))).toEqual({
      kind: "blocked",
      reason: "reservation-limit",
    });
    expect(queue.capacitySnapshot().global.reservedEvents).toBe(MAX_RUNTIME_ADMISSION_RESERVATIONS);
  });

  it("malformed/impossible costs create no reservation or revision", () => {
    const queue = new RuntimeWriteQueue(() => undefined, { maxSingleEventBytes: 1000 });
    const before = queue.capacitySnapshot();
    for (const quoted of [
      { eventCount: 0, eventBytes: 1, maxEventBytes: 1 },
      { eventCount: 1, eventBytes: Infinity, maxEventBytes: 1 },
      { eventCount: 1, eventBytes: 200, maxEventBytes: 100 },
      { eventCount: 1, eventBytes: 1200, maxEventBytes: 1200 },
      { eventCount: 1.5, eventBytes: 100, maxEventBytes: 100 },
      { eventCount: 2, eventBytes: 300, maxEventBytes: 100 },
    ])
      expect(queue.reserveAdmission("a", quoted)).toEqual({ kind: "invalid" });
    expect(queue.capacitySnapshot()).toEqual(before);
    expect(
      queue.reserveAdmission("é".repeat(MAX_RUNTIME_ADMISSION_THREAD_ID_BYTES), cost([delta("a")])),
    ).toEqual({ kind: "invalid" });
    expect(queue.capacitySnapshot()).toEqual(before);
  });
});
