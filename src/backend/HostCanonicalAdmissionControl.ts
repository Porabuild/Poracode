import type { SupervisorEvent } from "@/shared/ipc";
import {
  CANONICAL_ADMISSION_MAX_REQUESTS,
  CANONICAL_ADMISSION_VERSION,
  type CanonicalAdmissionControl,
  type CanonicalAdmissionMessage,
} from "@/shared/canonicalAdmissionProtocol";
import type { RuntimePersistenceController } from "@/host/db/runtimePersistenceController";
import {
  addRuntimePersistenceHealthListener,
  applyReservedRuntimeEvents,
  releaseRuntimeAdmission,
  reserveRuntimeAdmission,
} from "@/host/db/runtimePersistenceRuntime";
import type { RuntimeQueueCapacityChange } from "@/host/db/runtimeQueueCapacity";
import type { SupervisorClient } from "@/host/supervisor/SupervisorClient";

type Request = Extract<CanonicalAdmissionMessage, { kind: "canonical-admission-request" }>;
type Grant = Extract<CanonicalAdmissionControl, { control: "canonical-admission-grant" }>;
type Resolved = Extract<CanonicalAdmissionControl, { control: "canonical-admission-resolved" }>;
interface PendingRequest {
  request: Request;
  grant?: Grant;
}
interface ResolvedRequest {
  result: Resolved;
  request: Request;
  reservationId?: string;
}
export interface CanonicalAdmissionPersistencePort {
  reserve: RuntimePersistenceController["reserveAdmission"];
  admit: RuntimePersistenceController["admitReserved"];
  release: RuntimePersistenceController["releaseAdmissionReservation"];
  observe(listener: (change: RuntimeQueueCapacityChange | { kind: "health" }) => void): () => void;
}
const persistence: CanonicalAdmissionPersistencePort = {
  reserve: reserveRuntimeAdmission,
  admit: applyReservedRuntimeEvents,
  release: releaseRuntimeAdmission,
  observe: (onCapacityChange) =>
    addRuntimePersistenceHealthListener({
      onCapacityChange,
      onStateChange: () => onCapacityChange({ kind: "health" }),
    }),
};

/**
 * One positively identified supervisor transport owns these metadata leases.
 * No payload is retained here. Capacity wakes are deferred past the whole
 * admission/COMMIT callback, never issued from a partially updated queue.
 * Flow-control1 ACKs and public event serialization are not used by this plane.
 */
export class HostCanonicalAdmissionControl {
  private generation: string | null = null;
  private lastRequestSeq = 0;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly resolved = new Map<number, ResolvedRequest>();
  /** Refused/mismatched tokens stay charged until ordered owner cancellation. */
  private readonly awaitingRelease = new Map<number, Grant>();
  private wake: ReturnType<typeof setImmediate> | null = null;
  private readonly unsubscribe: () => void;
  constructor(
    private readonly client: Pick<
      SupervisorClient,
      "getPeerCanonicalCapabilities" | "sendCanonicalAdmissionControl"
    >,
    private readonly publish: (event: SupervisorEvent) => void,
    private readonly port: CanonicalAdmissionPersistencePort = persistence,
  ) {
    this.unsubscribe = port.observe((change) => {
      if (this.generation === null) return;
      // Reservations and admission only consume/transfer occupancy; retrying
      // every blocked quote on those hot-path notifications cannot help it fit.
      if (
        change.kind !== "committed" &&
        change.kind !== "discarded" &&
        change.kind !== "reservation-released" &&
        change.kind !== "reset" &&
        change.kind !== "health"
      )
        return;
      if (change.kind === "reset") {
        // Queue reset already invalidated the old tokens. Tell their owners
        // to retain/requote payload, rather than treat the reset as acceptance.
        for (const entry of [...this.pending.values()]) {
          if (entry.grant) this.finish(entry, "retry", 0, 0);
        }
        // Reset already invalidated these tokens at the queue authority.
        this.awaitingRelease.clear();
      }
      if (this.wake !== null || this.pending.size === 0) return;
      this.wake = setImmediate(() => {
        this.wake = null;
        this.pump();
      });
      this.wake.unref?.();
    });
  }

  /** Called only after a valid peer capability advertisement. */
  negotiate(): void {
    const peer = this.client.getPeerCanonicalCapabilities();
    if (peer.admissionVersion !== CANONICAL_ADMISSION_VERSION || !peer.generation) return;
    if (this.generation !== null && this.generation !== peer.generation) {
      // Replacement must first retire the old transport, not simply overwrite
      // the owner identity and free possibly in-transit grants.
      throw new Error("Canonical admission owner was not retired before replacement.");
    }
    this.generation = peer.generation;
    this.client.sendCanonicalAdmissionControl({
      control: "canonical-admission-enable",
      version: CANONICAL_ADMISSION_VERSION,
      generation: peer.generation,
    });
  }

  handle(message: CanonicalAdmissionMessage): void {
    if (this.generation === null || message.generation !== this.generation) return;
    if (message.kind === "canonical-admission-release") {
      const pending = this.pending.get(message.requestSeq);
      const grant = pending?.grant ?? this.awaitingRelease.get(message.requestSeq);
      if (grant?.threadId === message.threadId && grant.reservationId === message.reservationId) {
        this.port.release(grant.reservationId);
        this.awaitingRelease.delete(message.requestSeq);
        if (pending) this.finish(pending, "cancelled", 0, 0);
      }
      return;
    }
    const done = this.resolved.get(message.requestSeq);
    if (done) {
      if (
        done.request.threadId !== message.threadId ||
        (message.kind === "canonical-admission-request" && !sameRequest(done.request, message)) ||
        (message.kind === "canonical-admission-delivery" &&
          done.reservationId !== message.reservationId)
      ) {
        this.invalid(message);
        return;
      }
      this.client.sendCanonicalAdmissionControl(done.result);
      return;
    }
    const entry = this.pending.get(message.requestSeq);
    if (message.kind === "canonical-admission-cancel") {
      if (entry?.request.threadId === message.threadId) {
        if (entry.grant) this.port.release(entry.grant.reservationId);
        this.finish(entry, "cancelled", 0, 0);
      } else this.invalid(message);
      return;
    }
    if (message.kind === "canonical-admission-request") {
      if (entry) {
        if (!sameRequest(entry.request, message)) {
          this.invalid(message);
          return;
        }
        if (entry.grant) this.client.sendCanonicalAdmissionControl(entry.grant);
        return;
      }
      if (
        message.requestSeq <= this.lastRequestSeq ||
        this.pending.size + this.awaitingRelease.size >= CANONICAL_ADMISSION_MAX_REQUESTS
      ) {
        this.invalid(message);
        return;
      }
      this.lastRequestSeq = message.requestSeq;
      const owned: PendingRequest = { request: { ...message, cost: { ...message.cost } } };
      this.pending.set(message.requestSeq, owned);
      this.tryGrant(owned);
      return;
    }
    if (
      !entry?.grant ||
      entry.request.threadId !== message.threadId ||
      entry.grant.reservationId !== message.reservationId
    ) {
      this.invalid(message);
      return;
    }
    const admission = this.port.admit(message.threadId, message.reservationId, message.events);
    if (admission.kind === "invalid-reservation") {
      // No canonical acceptance/refusal took place. Keep the original source
      // payload in sender custody; reset/stale-token retry gets a fresh quote.
      this.finish(entry, "retry", 0, 0, true);
      return;
    }
    if (admission.kind === "refused") {
      this.finish(entry, "refused", 0, admission.refusedEvents, true);
      return;
    }
    this.finish(entry, "accepted", admission.acceptedEvents, admission.refusedEvents);
    if (admission.acceptedEvents === 0) return;
    const events = message.events.slice(0, admission.acceptedEvents);
    // Public event contains only the admitted canonical prefix. No grant id,
    // protocol version, boot identity or delivery metadata can reach clients.
    this.publish(
      events.length === 1
        ? { type: "thread-runtime-event", threadId: message.threadId, event: events[0]! }
        : { type: "thread-runtime-events", threadId: message.threadId, events },
    );
  }

  private tryGrant(entry: PendingRequest): void {
    const request = entry.request;
    const result = this.port.reserve(request.threadId, request.cost);
    if (result.kind === "invalid") {
      this.finish(entry, "invalid", 0, 0);
      return;
    }
    if (result.kind === "blocked") return;
    const reservation = result.reservation;
    entry.grant = {
      control: "canonical-admission-grant",
      version: CANONICAL_ADMISSION_VERSION,
      generation: request.generation,
      requestSeq: request.requestSeq,
      threadId: request.threadId,
      reservationId: reservation.id,
      queueGeneration: reservation.generation,
      cost: {
        eventCount: reservation.eventCount,
        eventBytes: reservation.eventBytes,
        maxEventBytes: reservation.maxEventBytes,
      },
    };
    this.client.sendCanonicalAdmissionControl(entry.grant);
  }

  private pump(): void {
    for (const entry of this.pending.values()) if (!entry.grant) this.tryGrant(entry);
  }

  private finish(
    entry: PendingRequest,
    outcome: Resolved["outcome"],
    acceptedEvents: number,
    refusedEvents: number,
    retainGrant = false,
  ): void {
    const request = entry.request;
    const result: Resolved = {
      control: "canonical-admission-resolved",
      version: CANONICAL_ADMISSION_VERSION,
      generation: request.generation,
      requestSeq: request.requestSeq,
      threadId: request.threadId,
      outcome,
      acceptedEvents,
      refusedEvents,
    };
    this.pending.delete(request.requestSeq);
    if (retainGrant && entry.grant) this.awaitingRelease.set(request.requestSeq, entry.grant);
    this.resolved.set(request.requestSeq, {
      result,
      request,
      ...(entry.grant ? { reservationId: entry.grant.reservationId } : {}),
    });
    while (this.resolved.size > CANONICAL_ADMISSION_MAX_REQUESTS)
      this.resolved.delete(this.resolved.keys().next().value!);
    this.client.sendCanonicalAdmissionControl(result);
  }

  private invalid(message: CanonicalAdmissionMessage): void {
    this.client.sendCanonicalAdmissionControl({
      control: "canonical-admission-resolved",
      version: CANONICAL_ADMISSION_VERSION,
      generation: message.generation,
      requestSeq: message.requestSeq,
      threadId: message.threadId,
      outcome: "invalid",
      acceptedEvents: 0,
      refusedEvents: 0,
    });
  }

  /** Positive child exit/join only; not a timeout, disconnect observation or re-advertisement. */
  retireOwner(): void {
    this.generation = null;
    if (this.wake !== null) {
      clearImmediate(this.wake);
      this.wake = null;
    }
    for (const entry of this.pending.values())
      if (entry.grant) this.port.release(entry.grant.reservationId);
    for (const grant of this.awaitingRelease.values()) this.port.release(grant.reservationId);
    this.awaitingRelease.clear();
    this.pending.clear();
    this.resolved.clear();
    this.lastRequestSeq = 0;
  }

  /** Observer teardown after owner retirement; never implicitly releases live grants. */
  dispose(): void {
    this.unsubscribe();
    if (this.wake !== null) {
      clearImmediate(this.wake);
      this.wake = null;
    }
  }
}

function sameRequest(a: Request, b: Request): boolean {
  return (
    a.threadId === b.threadId &&
    a.cost.eventCount === b.cost.eventCount &&
    a.cost.eventBytes === b.cost.eventBytes &&
    a.cost.maxEventBytes === b.cost.maxEventBytes
  );
}
