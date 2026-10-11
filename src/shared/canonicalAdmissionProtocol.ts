import type { RuntimeEvent } from "./contracts";

/**
 * Separate from flow-control1's transport-custody ACK. Admission2 reserves
 * exact canonical count/bytes before payload delivery, and resolves delivery
 * without exposing reservation metadata to public supervisor events.
 * Both peers must explicitly negotiate this version before using this plane.
 */
export const CANONICAL_ADMISSION_VERSION = 2 as const;
export const CANONICAL_ADMISSION_MAX_REQUESTS = 256;
export const CANONICAL_ADMISSION_MAX_ID_CHARS = 1024;

export interface CanonicalAdmissionCost {
  eventCount: number;
  eventBytes: number;
  maxEventBytes: number;
}
interface AdmissionIdentity {
  version: typeof CANONICAL_ADMISSION_VERSION;
  generation: string;
  /** Strictly increasing per supervisor boot, shared across its threads. */
  requestSeq: number;
  threadId: string;
}
export type CanonicalAdmissionMessage =
  | (AdmissionIdentity & {
      /** Owner promise: this request has never delivered and will not deliver. */
      kind: "canonical-admission-cancel";
    })
  | (AdmissionIdentity & {
      kind: "canonical-admission-request";
      cost: CanonicalAdmissionCost;
    })
  | (AdmissionIdentity & {
      kind: "canonical-admission-delivery";
      reservationId: string;
      events: RuntimeEvent[];
    })
  | (AdmissionIdentity & {
      /** Ordered owner promise: this token will never be sent again. */
      kind: "canonical-admission-release";
      reservationId: string;
    });

export type CanonicalAdmissionControl =
  | {
      control: "canonical-admission-enable";
      version: typeof CANONICAL_ADMISSION_VERSION;
      generation: string;
    }
  | (AdmissionIdentity & {
      control: "canonical-admission-grant";
      reservationId: string;
      queueGeneration: number;
      cost: CanonicalAdmissionCost;
    })
  | (AdmissionIdentity & {
      control: "canonical-admission-resolved";
      outcome: "accepted" | "refused" | "retry" | "invalid" | "cancelled";
      acceptedEvents: number;
      refusedEvents: number;
    });

function identity(value: Record<string, unknown>): boolean {
  return (
    value.version === CANONICAL_ADMISSION_VERSION &&
    typeof value.generation === "string" &&
    value.generation.length > 0 &&
    value.generation.length <= CANONICAL_ADMISSION_MAX_ID_CHARS &&
    Number.isSafeInteger(value.requestSeq) &&
    (value.requestSeq as number) > 0 &&
    typeof value.threadId === "string" &&
    value.threadId.length > 0 &&
    value.threadId.length <= CANONICAL_ADMISSION_MAX_ID_CHARS
  );
}

export function isCanonicalAdmissionCost(value: unknown): value is CanonicalAdmissionCost {
  if (typeof value !== "object" || value === null) return false;
  const cost = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(cost.eventCount) &&
    (cost.eventCount as number) > 0 &&
    Number.isSafeInteger(cost.eventBytes) &&
    (cost.eventBytes as number) > 0 &&
    Number.isSafeInteger(cost.maxEventBytes) &&
    (cost.maxEventBytes as number) > 0 &&
    (cost.maxEventBytes as number) <= (cost.eventBytes as number) &&
    (cost.eventBytes as number) <= (cost.eventCount as number) * (cost.maxEventBytes as number)
  );
}

/** Shape validation for the private, trusted child IPC plane; no provider parsing. */
export function isCanonicalAdmissionMessage(value: unknown): value is CanonicalAdmissionMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  if (!identity(message)) return false;
  if (message.kind === "canonical-admission-cancel") return true;
  if (message.kind === "canonical-admission-request") return isCanonicalAdmissionCost(message.cost);
  if (
    message.kind !== "canonical-admission-delivery" &&
    message.kind !== "canonical-admission-release"
  )
    return false;
  const token =
    typeof message.reservationId === "string" &&
    message.reservationId.length > 0 &&
    message.reservationId.length <= CANONICAL_ADMISSION_MAX_ID_CHARS;
  if (message.kind === "canonical-admission-release") return token;
  return (
    token &&
    Array.isArray(message.events) &&
    message.events.length > 0 &&
    message.events.every(
      (event: unknown) =>
        typeof event === "object" &&
        event !== null &&
        typeof (event as Record<string, unknown>).type === "string" &&
        (event as Record<string, unknown>).threadId === message.threadId,
    )
  );
}

export function isCanonicalAdmissionControl(value: unknown): value is CanonicalAdmissionControl {
  if (typeof value !== "object" || value === null) return false;
  const control = value as Record<string, unknown>;
  if (control.control === "canonical-admission-enable") {
    return (
      control.version === CANONICAL_ADMISSION_VERSION &&
      typeof control.generation === "string" &&
      control.generation.length > 0 &&
      control.generation.length <= CANONICAL_ADMISSION_MAX_ID_CHARS
    );
  }
  if (!identity(control)) return false;
  if (control.control === "canonical-admission-grant") {
    return (
      typeof control.reservationId === "string" &&
      control.reservationId.length > 0 &&
      control.reservationId.length <= CANONICAL_ADMISSION_MAX_ID_CHARS &&
      Number.isSafeInteger(control.queueGeneration) &&
      (control.queueGeneration as number) > 0 &&
      isCanonicalAdmissionCost(control.cost)
    );
  }
  return (
    control.control === "canonical-admission-resolved" &&
    typeof control.outcome === "string" &&
    ["accepted", "refused", "retry", "invalid", "cancelled"].includes(control.outcome) &&
    Number.isSafeInteger(control.acceptedEvents) &&
    (control.acceptedEvents as number) >= 0 &&
    Number.isSafeInteger(control.refusedEvents) &&
    (control.refusedEvents as number) >= 0
  );
}
