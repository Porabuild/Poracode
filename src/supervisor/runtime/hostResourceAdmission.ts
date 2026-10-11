import { randomUUID } from "node:crypto";
import {
  HOST_RESOURCE_BUSY_CODE,
  HOST_RESOURCE_POLICY_UNAVAILABLE_CODE,
  type HostResourceAdmissionEvidence,
  type HostResourceAdmissionPolicy,
  type HostResourceAdmissionResolution,
  type HostResourceAdmissionSettings,
  type HostResourceAdmissionUsage,
  type HostResourceUsageCounts,
} from "@/shared/hostResourceAdmission";

export { HOST_RESOURCE_BUSY_CODE, HOST_RESOURCE_POLICY_UNAVAILABLE_CODE };
export type {
  HostResourceAdmissionPolicy,
  HostResourceAdmissionResolution,
  HostResourceAdmissionUsage,
  HostResourceUsageCounts,
};

/**
 * Supervisor-side narrowing predicate for a real owner refusal. It is
 * deliberately not the shared duck-type check: that one recognizes rehydrated
 * host carriers by `code` alone and cannot promise `details` or the
 * class getters. The shared classifier stays the host/rehydration seam.
 */
export function isHostResourceBusyError(error: unknown): error is HostResourceBusyError {
  return error instanceof HostResourceBusyError;
}

/**
 * Supervisor-owned, provider-agnostic admission for host *execution slots*.
 *
 * What a slot is: one live logical execution unit the supervisor started —
 * an agent session (thread runtime, structured subagent child, one-shot
 * subagent child) or a user terminal shell. The owner counts a reservation
 * from the moment it is admitted (`pending`, before any process effect)
 * through confirmed retirement (`retiring` while a kill/dispose is in flight,
 * `released` only once exit is observed).
 *
 * What a slot is NOT: an OS process count or a memory bound. Providers pool
 * app-servers, keep warm sidecars and spawn helper children inside one
 * session (see the provider adapters); WSL agents run inside a distro the
 * host cannot see. The number therefore bounds *supervisor execution slots*,
 * not arbitrary provider descendants or their RSS. Provider pools and sidecars
 * stay owned by their adapters; they are measured, never counted here.
 *
 * Invariants:
 * - Non-waiting: `tryAcquire` never queues. Refusal is immediate and typed.
 * - Pending counts against the class limit, so N concurrent starts cannot
 *   all become N processes past the cap.
 * - Retiring counts. Only `confirmExit()` (observed exit) or `cancel()`
 *   (aborted before any process effect, or after a confirmed cleanup) frees
 *   capacity. Map deletion or status change never does.
 * - Releases are instance-keyed: a stale generation's late exit callback can
 *   never free a successor's slot.
 * - One reservation per logical key. A same-slot handoff (`tryHandoff`) binds
 *   a successor generation to the predecessor's reservation: capacity is
 *   retained exactly once across the replacement, and the successor cannot
 *   activate until the predecessor's retirement is confirmed.
 * - Policy is read from the injected getter on every acquire, so an operator
 *   change applies to the next start without a restart. Lowering below current
 *   usage never kills: new starts are refused until usage drops.
 * - An unresolved policy (`refuseNewStarts`) fails closed before any capacity
 *   check. Same-slot handoff, stop, cleanup and usage never call `tryAcquire`
 *   and stay available.
 */

export type HostResourceClass = "agent-session" | "terminal-shell" | "generation-helper";

export type HostResourceLeaseState = "pending" | "active" | "retiring" | "released";

/**
 * Explicit pre-measurement default: every class is unlimited and no capacity
 * number is invented. The owner still counts, retains and reports, so the
 * policy can be tightened by settings without structural changes.
 */
export const UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY: Readonly<HostResourceAdmissionPolicy> =
  Object.freeze({
    maxActiveAgentSessions: 0,
    maxActiveTerminalShells: 0,
    maxActiveGenerationHelpers: 0,
    overloadRetryAfterMs: 1_000,
  });

export const HOST_RESOURCE_HANDOFF_UNCONFIRMED_CODE = "host_resource_handoff_unconfirmed" as const;

export interface HostResourceBusyDetails {
  resourceClass: HostResourceClass;
  /** 0 = unlimited (a duplicate-key refusal still reports the effective limit). */
  limit: number;
  active: number;
  pending: number;
  retiring: number;
  retryAfterMs: number;
}

export class HostResourceBusyError extends Error {
  readonly code = HOST_RESOURCE_BUSY_CODE;
  readonly details: HostResourceBusyDetails;

  constructor(details: HostResourceBusyDetails) {
    super(formatHostResourceBusyMessage(details));
    this.name = "HostResourceBusyError";
    this.details = details;
  }

  get resourceClass(): HostResourceClass {
    return this.details.resourceClass;
  }

  get limit(): number {
    return this.details.limit;
  }

  get retryAfterMs(): number {
    return this.details.retryAfterMs;
  }
}

/**
 * Fail-closed refusal raised before any capacity/duplicate check while the
 * effective policy is unresolved. Stop, interrupt, close, handoff and usage
 * reads never call `tryAcquire`, so they stay available.
 */
export class HostResourcePolicyUnavailableError extends Error {
  readonly code = HOST_RESOURCE_POLICY_UNAVAILABLE_CODE;
  /** Safe closed diagnostic reason code; never settings values. */
  readonly reason: string;

  constructor(reason: string) {
    super(
      `Host resource admission policy is unavailable (${reason}); new counted starts are refused.`,
    );
    this.name = "HostResourcePolicyUnavailableError";
    this.reason = reason;
  }
}

/**
 * Raised when a same-slot successor is activated before the predecessor's
 * retirement is confirmed. Pipelines gate on `predecessor.state === "released"`
 * before spawning, so this is an invariant guard, not a user-facing refusal.
 */
export class HostResourceHandoffError extends Error {
  readonly code = HOST_RESOURCE_HANDOFF_UNCONFIRMED_CODE;

  constructor(key: string) {
    super(
      `Refusing to start a successor for ${key} before its predecessor's retirement is confirmed.`,
    );
    this.name = "HostResourceHandoffError";
  }
}

export interface HostResourceAcquireRequest {
  resourceClass: HostResourceClass;
  key: string;
}

export interface HostResourceLease {
  readonly leaseId: string;
  readonly resourceClass: HostResourceClass;
  readonly key: string;
  readonly state: HostResourceLeaseState;
  /** Process effect confirmed (handle created / PTY spawned). Idempotent. */
  activate(): void;
  /** Kill/dispose issued; still counted until `confirmExit`/`cancel`. */
  beginRetirement(): void;
  /** Exit observed; releases the slot. Idempotent and instance-keyed. */
  confirmExit(): void;
  /** No live process remains (aborted pre-effect or confirmed cleanup). */
  cancel(): void;
}

export interface HostResourceAdmission {
  tryAcquire(request: HostResourceAcquireRequest): HostResourceLease;
  /**
   * Bind a successor generation to an existing reservation for the same
   * logical execution. Returns `undefined` when the predecessor is not owned,
   * already released, superseded, or already has a successor; callers then
   * fall back to `tryAcquire` (whose refusal happens before any teardown).
   */
  tryHandoff(predecessor: HostResourceLease): HostResourceLease | undefined;
  /** True when this exact lease was issued by this owner. */
  owns(lease: HostResourceLease): boolean;
  usage(): HostResourceAdmissionUsage;
}

/**
 * The one same-slot admission rule shared by every counted launch funnel
 * (thread start, shell start, thread restart, invalid-session recovery). When
 * the predecessor lease still belongs to this owner, bind the successor
 * generation to the predecessor's reservation: capacity is retained exactly
 * once across the replacement and the successor cannot activate before the
 * predecessor's retirement is confirmed. A predecessor that is missing,
 * foreign, already released, superseded, or already handed off falls back to a
 * fresh `tryAcquire`, whose refusal happens before any teardown.
 */
export function acquireOrHandoff(
  admission: HostResourceAdmission,
  predecessor: HostResourceLease | undefined,
  request: HostResourceAcquireRequest,
): HostResourceLease {
  if (predecessor && admission.owns(predecessor)) {
    const successor = admission.tryHandoff(predecessor);
    if (successor) return successor;
  }
  return admission.tryAcquire(request);
}

interface LeaseRecord extends HostResourceLease {
  state: HostResourceLeaseState;
  reservation: Reservation;
}

interface Reservation {
  key: string;
  resourceClass: HostResourceClass;
  generation: LeaseRecord;
  /** Pre-bound successor generation (same logical execution only). */
  successor: LeaseRecord | undefined;
}

function classLimit(policy: HostResourceAdmissionPolicy, resourceClass: HostResourceClass): number {
  switch (resourceClass) {
    case "agent-session":
      return policy.maxActiveAgentSessions;
    case "terminal-shell":
      return policy.maxActiveTerminalShells;
    case "generation-helper":
      return policy.maxActiveGenerationHelpers;
  }
}

function isCapacityExhausted(limit: number, live: number): boolean {
  return limit > 0 && live >= limit;
}

function formatHostResourceBusyMessage(details: HostResourceBusyDetails): string {
  const limit =
    details.limit > 0
      ? `${details.limit} (active ${details.active}, pending ${details.pending})`
      : "unlimited";
  return `Host ${details.resourceClass} capacity is full: limit ${limit}. Retry after ${details.retryAfterMs}ms.`;
}

function isLeaseRecord(value: unknown): value is LeaseRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as LeaseRecord).leaseId === "string" &&
    "reservation" in (value as LeaseRecord)
  );
}

/**
 * The only count owner. Admission decisions read nothing else; `sessions` /
 * `shellSessions` map sizes are never an input.
 */
export class HostResourceAdmissionOwner implements HostResourceAdmission {
  private readonly reservations = new Map<string, Reservation>();
  private readonly leases = new WeakSet<LeaseRecord>();
  private refusalCount = 0;

  constructor(
    private readonly getPolicy: () => HostResourceAdmissionPolicy = () =>
      UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY,
  ) {}

  tryAcquire({ resourceClass, key }: HostResourceAcquireRequest): HostResourceLease {
    const mapKey = `${resourceClass}::${key}`;
    const policy = this.getPolicy();
    // Fail closed before any capacity/duplicate check: an unresolved policy
    // must never admit a new counted start. Same-slot handoff is not a new
    // counted start and stays available.
    if (policy.refuseNewStarts) {
      this.refusalCount += 1;
      throw new HostResourcePolicyUnavailableError(policy.refuseNewStarts);
    }
    const limit = classLimit(policy, resourceClass);
    const counts = this.countClass(resourceClass);
    const existing = this.reservations.get(mapKey);
    // Same-id coalescing consumes one reservation: a live reservation for the
    // key is never duplicated. Replacements use `tryHandoff` explicitly.
    if (existing) {
      this.refusalCount += 1;
      throw new HostResourceBusyError({
        resourceClass,
        limit,
        active: counts.active,
        pending: counts.pending,
        retiring: counts.retiring,
        retryAfterMs: policy.overloadRetryAfterMs,
      });
    }
    if (isCapacityExhausted(limit, counts.active + counts.pending + counts.retiring)) {
      this.refusalCount += 1;
      throw new HostResourceBusyError({
        resourceClass,
        limit,
        active: counts.active,
        pending: counts.pending,
        retiring: counts.retiring,
        retryAfterMs: policy.overloadRetryAfterMs,
      });
    }
    return this.createReservation(mapKey, resourceClass, key);
  }

  tryHandoff(predecessor: HostResourceLease): HostResourceLease | undefined {
    if (!isLeaseRecord(predecessor) || !this.leases.has(predecessor)) return undefined;
    const reservation = predecessor.reservation;
    if (reservation.generation !== predecessor) return undefined;
    if (predecessor.state === "released") return undefined;
    if (reservation.successor) return undefined;
    return this.bindSuccessor(reservation, predecessor);
  }

  owns(lease: HostResourceLease): boolean {
    return isLeaseRecord(lease) && this.leases.has(lease);
  }

  usage(): HostResourceAdmissionUsage {
    const agentSessions = this.countClass("agent-session");
    const terminalShells = this.countClass("terminal-shell");
    const generationHelpers = this.countClass("generation-helper");
    return {
      agentSessions,
      terminalShells,
      generationHelpers,
      total:
        agentSessions.active +
        agentSessions.pending +
        agentSessions.retiring +
        terminalShells.active +
        terminalShells.pending +
        terminalShells.retiring +
        generationHelpers.active +
        generationHelpers.pending +
        generationHelpers.retiring,
      refusals: this.refusalCount,
    };
  }

  private createReservation(
    mapKey: string,
    resourceClass: HostResourceClass,
    key: string,
  ): HostResourceLease {
    const record = this.createLease(resourceClass, key);
    const reservation: Reservation = {
      key: mapKey,
      resourceClass,
      generation: record,
      successor: undefined,
    };
    record.reservation = reservation;
    this.reservations.set(mapKey, reservation);
    return record;
  }

  private bindSuccessor(reservation: Reservation, predecessor: LeaseRecord): HostResourceLease {
    const record = this.createLease(reservation.generation.resourceClass, predecessor.key);
    record.reservation = reservation;
    reservation.successor = record;
    return record;
  }

  private createLease(resourceClass: HostResourceClass, key: string): LeaseRecord {
    const owner = this;
    const record: LeaseRecord = {
      leaseId: randomUUID(),
      resourceClass,
      key,
      state: "pending",
      reservation: undefined as unknown as Reservation,
      activate() {
        owner.activate(record);
      },
      beginRetirement() {
        owner.beginRetirement(record);
      },
      confirmExit() {
        owner.release(record);
      },
      cancel() {
        owner.release(record);
      },
    };
    this.leases.add(record);
    return record;
  }

  private activate(record: LeaseRecord): void {
    if (record.state === "released" || record.state === "active") return;
    const reservation = record.reservation;
    if (reservation.successor === record) {
      // Pre-bound successor: its process must not start while the predecessor
      // is still counted as live.
      throw new HostResourceHandoffError(reservation.key);
    }
    if (reservation.generation !== record) {
      throw new HostResourceHandoffError(reservation.key);
    }
    record.state = "active";
  }

  private beginRetirement(record: LeaseRecord): void {
    if (record.state === "released" || record.state === "retiring") return;
    record.state = "retiring";
  }

  /**
   * Single release path shared by `confirmExit` and `cancel`. Instance-keyed:
   * once a record is released a late duplicate is a no-op, so an old
   * generation's exit can never free a successor's capacity.
   */
  private release(record: LeaseRecord): void {
    if (record.state === "released") return;
    record.state = "released";
    const reservation = record.reservation;
    if (reservation.successor === record) {
      reservation.successor = undefined;
      return;
    }
    if (reservation.generation !== record) {
      return;
    }
    const successor = reservation.successor;
    if (successor) {
      // Hand the single capacity unit to the successor without a gap.
      reservation.successor = undefined;
      reservation.generation = successor;
      return;
    }
    this.reservations.delete(reservation.key);
  }

  private countClass(resourceClass: HostResourceClass): HostResourceUsageCounts {
    let active = 0;
    let pending = 0;
    let retiring = 0;
    for (const reservation of this.reservations.values()) {
      if (reservation.resourceClass !== resourceClass) continue;
      const state = reservationState(reservation);
      if (state === "active") active += 1;
      else if (state === "pending") pending += 1;
      else retiring += 1;
    }
    return { active, pending, retiring };
  }
}

/**
 * A reservation reports `retiring` while a successor is pre-bound: the slot
 * is mid-handoff and cannot be reused by unrelated work even though the
 * predecessor may still be winding down.
 */
function reservationState(reservation: Reservation): HostResourceLeaseState {
  if (reservation.successor) return "retiring";
  return reservation.generation.state;
}

/**
 * Last positive policy evidence this process observed. `"unlimited"` records a
 * valid document that removed the field (or set explicit zeroes); `undefined`
 * means nothing valid was ever seen. Transient errors never clear it.
 */
export type HostResourceAdmissionLastGood = HostResourceAdmissionSettings | "unlimited" | undefined;

export interface ResolvedHostResourceAdmission {
  policy: HostResourceAdmissionPolicy;
  resolution: HostResourceAdmissionResolution;
  lastGood: HostResourceAdmissionLastGood;
}

function policyFromSettings(settings: HostResourceAdmissionSettings): HostResourceAdmissionPolicy {
  return {
    maxActiveAgentSessions: settings.maxActiveAgentSessions,
    maxActiveTerminalShells: settings.maxActiveTerminalShells,
    maxActiveGenerationHelpers: settings.maxActiveGenerationHelpers,
    overloadRetryAfterMs: UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY.overloadRetryAfterMs,
  };
}

function policyFromLastGood(lastGood: Exclude<HostResourceAdmissionLastGood, undefined>) {
  return lastGood === "unlimited"
    ? UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY
    : policyFromSettings(lastGood);
}

/**
 * Pure resolution of one raw settings read into the effective policy, the
 * status-facing resolution state, and the next `lastGood`. Malformed or
 * unreadable evidence with no prior valid policy refuses new counted starts
 * instead of silently becoming unlimited; a deleted file is transient and
 * keeps `lastGood`. An explicit removal in a valid document resets to the
 * documented transitional unlimited default.
 */
export function resolveHostResourceAdmission(
  evidence: HostResourceAdmissionEvidence,
  lastGood: HostResourceAdmissionLastGood,
): ResolvedHostResourceAdmission {
  switch (evidence.kind) {
    case "configured":
      return {
        policy: policyFromSettings(evidence.settings),
        resolution: { kind: "configured" },
        lastGood: evidence.settings,
      };
    case "absent":
      return {
        policy: UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY,
        resolution: { kind: "absent" },
        lastGood: "unlimited",
      };
    case "missing":
      return lastGood === undefined
        ? {
            policy: UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY,
            resolution: { kind: "missing" },
            lastGood: undefined,
          }
        : { policy: policyFromLastGood(lastGood), resolution: { kind: "missing" }, lastGood };
    case "invalid":
    case "unreadable":
      return lastGood === undefined
        ? {
            policy: {
              ...UNLIMITED_HOST_RESOURCE_ADMISSION_POLICY,
              refuseNewStarts: evidence.problem,
            },
            resolution: { kind: "unavailable", problem: evidence.problem },
            lastGood: undefined,
          }
        : {
            policy: policyFromLastGood(lastGood),
            resolution: { kind: "retained", problem: evidence.problem },
            lastGood,
          };
  }
}
