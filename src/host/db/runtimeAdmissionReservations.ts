import { randomUUID } from "node:crypto";
import type { RuntimeQueueBounds } from "./runtimeWriteQueue";

/** Metadata only: no event payloads, images or serialized envelopes are retained. */
export interface RuntimeAdmissionCost {
  eventCount: number;
  eventBytes: number;
  maxEventBytes: number;
}
export interface RuntimeAdmissionReservation extends RuntimeAdmissionCost {
  id: string;
  generation: number;
  threadId: string;
}
export type RuntimeReservationResult =
  | { kind: "granted"; reservation: RuntimeAdmissionReservation }
  | {
      kind: "blocked";
      reason:
        | "thread-events"
        | "thread-bytes"
        | "global-events"
        | "global-bytes"
        | "reservation-limit";
    }
  | { kind: "invalid" };

// Control metadata has its own bound, independent of tiny-event byte costs.
export const MAX_RUNTIME_ADMISSION_RESERVATIONS = 256;
/** Bound retained identity metadata independently of the quoted payload cost. */
export const MAX_RUNTIME_ADMISSION_THREAD_ID_BYTES = 1024;
const ZERO_COST = Object.freeze({ eventCount: 0, eventBytes: 0 });

/**
 * Holds capacity for an exact incoming batch. Consumption transfers the lease
 * into queued custody; releasing that occupancy still requires COMMIT. Explicit
 * cancellation is only for unsent work or an owner whose transport has stopped.
 * No timer silently revokes a potentially in-transit grant. The negotiated
 * owner must bound grant age and retain its canonical payload until resolved.
 */
export class RuntimeAdmissionReservations {
  private readonly leases = new Map<string, RuntimeAdmissionReservation>();
  private readonly byThread = new Map<
    string,
    Readonly<{ eventCount: number; eventBytes: number }>
  >();
  private reservedEvents = 0;
  private reservedBytes = 0;
  constructor(private readonly bounds: RuntimeQueueBounds) {}
  get events(): number {
    return this.reservedEvents;
  }
  get bytes(): number {
    return this.reservedBytes;
  }
  forThread(threadId: string): Readonly<{ eventCount: number; eventBytes: number }> {
    return this.byThread.get(threadId) ?? ZERO_COST;
  }
  reserve(options: {
    threadId: string;
    generation: number;
    cost: RuntimeAdmissionCost;
    pendingEvents: number;
    pendingBytes: number;
    threadPendingEvents: number;
    threadPendingBytes: number;
  }): RuntimeReservationResult {
    const { cost, threadId } = options;
    if (
      threadId.length === 0 ||
      Buffer.byteLength(threadId, "utf8") > MAX_RUNTIME_ADMISSION_THREAD_ID_BYTES ||
      !Number.isSafeInteger(cost.eventCount) ||
      cost.eventCount <= 0 ||
      !Number.isSafeInteger(cost.eventBytes) ||
      cost.eventBytes <= 0 ||
      !Number.isSafeInteger(cost.maxEventBytes) ||
      cost.maxEventBytes <= 0 ||
      cost.maxEventBytes > cost.eventBytes ||
      cost.eventBytes > cost.eventCount * cost.maxEventBytes ||
      cost.maxEventBytes > this.bounds.maxSingleEventBytes ||
      (cost.eventCount === 1 && cost.eventBytes !== cost.maxEventBytes)
    )
      return { kind: "invalid" };
    if (this.leases.size >= MAX_RUNTIME_ADMISSION_RESERVATIONS)
      return { kind: "blocked", reason: "reservation-limit" };
    const thread = this.forThread(threadId);
    const threadEvents = options.threadPendingEvents + thread.eventCount;
    const threadBytes = options.threadPendingBytes + thread.eventBytes;
    const loneOversize =
      threadEvents === 0 &&
      cost.eventCount === 1 &&
      cost.eventBytes > this.bounds.maxPendingBytesPerThread;
    if (threadEvents + cost.eventCount > this.bounds.maxPendingEventsPerThread)
      return { kind: "blocked", reason: "thread-events" };
    if (!loneOversize && threadBytes + cost.eventBytes > this.bounds.maxPendingBytesPerThread)
      return { kind: "blocked", reason: "thread-bytes" };
    if (
      options.pendingEvents + this.reservedEvents + cost.eventCount >
      this.bounds.maxPendingEventsGlobal
    )
      return { kind: "blocked", reason: "global-events" };
    if (
      options.pendingBytes + this.reservedBytes + cost.eventBytes >
      this.bounds.maxPendingBytesGlobal
    )
      return { kind: "blocked", reason: "global-bytes" };
    const reservation: RuntimeAdmissionReservation = {
      ...cost,
      id: randomUUID(),
      generation: options.generation,
      threadId,
    };
    this.leases.set(reservation.id, reservation);
    this.byThread.set(
      threadId,
      Object.freeze({
        eventCount: thread.eventCount + cost.eventCount,
        eventBytes: thread.eventBytes + cost.eventBytes,
      }),
    );
    this.reservedEvents += cost.eventCount;
    this.reservedBytes += cost.eventBytes;
    return { kind: "granted", reservation: { ...reservation } };
  }
  consume(id: string, generation: number, threadId: string, cost: RuntimeAdmissionCost): boolean {
    if (!this.matches(id, generation, threadId, cost)) return false;
    this.release(id);
    return true;
  }
  matches(id: string, generation: number, threadId: string, cost: RuntimeAdmissionCost): boolean {
    const lease = this.leases.get(id);
    return (
      !!lease &&
      lease.generation === generation &&
      lease.threadId === threadId &&
      lease.eventCount === cost.eventCount &&
      lease.eventBytes === cost.eventBytes &&
      lease.maxEventBytes === cost.maxEventBytes
    );
  }
  release(id: string): string | null {
    const lease = this.leases.get(id);
    if (!lease) return null;
    this.leases.delete(id);
    const thread = this.byThread.get(lease.threadId)!;
    const eventCount = thread.eventCount - lease.eventCount;
    const eventBytes = thread.eventBytes - lease.eventBytes;
    if (eventCount === 0) this.byThread.delete(lease.threadId);
    else this.byThread.set(lease.threadId, Object.freeze({ eventCount, eventBytes }));
    this.reservedEvents -= lease.eventCount;
    this.reservedBytes -= lease.eventBytes;
    return lease.threadId;
  }
  discardThread(threadId: string): boolean {
    if (!this.byThread.has(threadId)) return false;
    for (const [id, lease] of this.leases) if (lease.threadId === threadId) this.release(id);
    return true;
  }
  clear(): void {
    this.leases.clear();
    this.byThread.clear();
    this.reservedEvents = 0;
    this.reservedBytes = 0;
  }
}
