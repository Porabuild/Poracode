import { z } from "zod";

/**
 * Shared, provider-agnostic vocabulary for host execution-slot admission.
 *
 * This module is imported by the renderer bundle (through `settings.ts`) and by
 * the host process, so it must stay free of Node imports. It owns:
 * - the refusal codes used across supervisor → host → HTTP boundaries,
 * - the `hostResourceAdmission` settings field shape (numbers only; the
 *   supervisor runtime owns the counting slots themselves),
 * - the raw document evidence a single settings read can produce, and
 * - the additive status snapshot wire shape plus the supervisor client's
 *   on-demand peek outcome.
 */

/**
 * The supervisor refused a new counted start because a slot limit is full.
 * Travels as a message on legacy paths and as a typed error code across the
 * supervisor IPC reply (PHASE1) and the remote HTTP boundary (PHASE2).
 */
export const HOST_RESOURCE_BUSY_CODE = "host_resource_busy" as const;

/**
 * The supervisor cannot resolve a usable admission policy (a settings document
 * is present but invalid/unreadable and no earlier value was ever valid) and
 * therefore refuses new counted starts. Stop/cleanup/status stay available.
 */
export const HOST_RESOURCE_POLICY_UNAVAILABLE_CODE = "host_resource_policy_unavailable" as const;

export const HOST_RESOURCE_ADMISSION_REFUSAL_CODES = [
  HOST_RESOURCE_BUSY_CODE,
  HOST_RESOURCE_POLICY_UNAVAILABLE_CODE,
] as const;

export type HostResourceAdmissionRefusalCode =
  (typeof HOST_RESOURCE_ADMISSION_REFUSAL_CODES)[number];

interface RefusalLike {
  code?: unknown;
  message?: unknown;
  retryAfterMs?: unknown;
}

/**
 * Duck-typed so the host can classify rehydrated errors and raw supervisor
 * errors alike without importing the supervisor runtime class.
 */
export function isHostResourceBusyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as RefusalLike).code === HOST_RESOURCE_BUSY_CODE
  );
}

export function isHostResourcePolicyUnavailableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as RefusalLike).code === HOST_RESOURCE_POLICY_UNAVAILABLE_CODE
  );
}

/** True for either host-resource-admission refusal, not for unrelated failures. */
export function isHostResourceAdmissionRefusal(error: unknown): boolean {
  return isHostResourceBusyError(error) || isHostResourcePolicyUnavailableError(error);
}

/** Carry only a nonnegative safe-integer hint; anything else is dropped. */
export function hostResourceRetryAfterMsOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const value = (error as RefusalLike).retryAfterMs;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/**
 * Host-side rehydration of a typed supervisor refusal. The supervisor runtime
 * keeps its own richer classes; this is the plain carrier for the reply hop,
 * and `code`/`retryAfterMs` are what both classification helpers read.
 */
export class HostResourceAdmissionRefusalError extends Error {
  readonly code: string;
  readonly retryAfterMs?: number;

  constructor(message: string, options: { code: string; retryAfterMs?: number }) {
    super(message);
    this.name = "HostResourceAdmissionRefusalError";
    this.code = options.code;
    if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs;
  }
}

/** The three counted execution classes a user can bound. 0 = unlimited. */
export const HOST_RESOURCE_ADMISSION_LIMIT_KEYS = [
  "maxActiveAgentSessions",
  "maxActiveTerminalShells",
  "maxActiveGenerationHelpers",
] as const;

/**
 * Each value is a nonnegative finite **safe** integer (Zod 4 `.int()` rejects
 * unsafe integers); there is no arbitrary ceiling. Sub-key defaults exist so a
 * valid **partial** object fills only its absent keys, matching the settings
 * authority's `fillMissing`. A present invalid value still fails the whole
 * object and is never repaired to a default.
 */
export const hostResourceAdmissionSettingsSchema = z.object({
  maxActiveAgentSessions: z.number().int().min(0).default(0),
  maxActiveTerminalShells: z.number().int().min(0).default(0),
  maxActiveGenerationHelpers: z.number().int().min(0).default(0),
});

export type HostResourceAdmissionSettings = z.infer<typeof hostResourceAdmissionSettingsSchema>;

export const DEFAULT_HOST_RESOURCE_ADMISSION_SETTINGS: Readonly<HostResourceAdmissionSettings> =
  Object.freeze({
    maxActiveAgentSessions: 0,
    maxActiveTerminalShells: 0,
    maxActiveGenerationHelpers: 0,
  });

/** Safe, closed diagnostic reason codes; never document values or secrets. */
export const HOST_RESOURCE_ADMISSION_PROBLEM_CODES = [
  "settings-document-unreadable",
  "settings-document-unparseable",
  "settings-document-not-object",
  "host-resource-admission-invalid",
] as const;

export type HostResourceAdmissionProblemCode =
  (typeof HOST_RESOURCE_ADMISSION_PROBLEM_CODES)[number];

/**
 * What one settings read actually proved about the policy field, before any
 * normalization fallback. `configured` carries the raw validated limits;
 * `absent` is a valid document that explicitly removed the field (or set
 * explicit zeroes). `invalid`/`unreadable` must never select unlimited.
 */
export type HostResourceAdmissionEvidence =
  | { kind: "configured"; settings: HostResourceAdmissionSettings }
  | { kind: "absent" }
  | { kind: "missing" }
  | { kind: "invalid"; problem: HostResourceAdmissionProblemCode }
  | { kind: "unreadable"; problem: HostResourceAdmissionProblemCode };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Inspect a raw parsed settings document. Unknown sub-keys are ignored so a
 * newer writer stays readable; absent sub-keys fill only from the declared
 * defaults (the settings authority fills the same set before its own parse).
 */
export function resolveHostResourceAdmissionEvidence(
  document: unknown,
): HostResourceAdmissionEvidence {
  if (!isRecord(document)) {
    return { kind: "invalid", problem: "settings-document-not-object" };
  }
  if (!Object.hasOwn(document, "hostResourceAdmission")) return { kind: "absent" };
  const value = document.hostResourceAdmission;
  if (!isRecord(value)) {
    return { kind: "invalid", problem: "host-resource-admission-invalid" };
  }
  const filled: Record<string, unknown> = {};
  for (const key of HOST_RESOURCE_ADMISSION_LIMIT_KEYS) {
    filled[key] = Object.hasOwn(value, key)
      ? value[key]
      : DEFAULT_HOST_RESOURCE_ADMISSION_SETTINGS[key];
  }
  const parsed = hostResourceAdmissionSettingsSchema.safeParse(filled);
  return parsed.success
    ? { kind: "configured", settings: parsed.data }
    : { kind: "invalid", problem: "host-resource-admission-invalid" };
}

/**
 * How the effective policy in a status snapshot was obtained. `retained` means
 * the last known valid policy is still enforced despite malformed/unreadable
 * current evidence; `unavailable` means new counted starts are refused because
 * no valid policy was ever observed.
 */
export const HOST_RESOURCE_ADMISSION_RESOLUTION_KINDS = [
  "configured",
  "absent",
  "missing",
  "retained",
  "unavailable",
] as const;

export type HostResourceAdmissionResolutionKind =
  (typeof HOST_RESOURCE_ADMISSION_RESOLUTION_KINDS)[number];

export interface HostResourceAdmissionResolution {
  kind: HostResourceAdmissionResolutionKind;
  problem?: HostResourceAdmissionProblemCode;
}

export const hostResourceAdmissionResolutionSchema = z.object({
  kind: z.enum(HOST_RESOURCE_ADMISSION_RESOLUTION_KINDS),
  problem: z.enum(HOST_RESOURCE_ADMISSION_PROBLEM_CODES).optional(),
});

export interface HostResourceUsageCounts {
  active: number;
  pending: number;
  retiring: number;
}

export const hostResourceUsageCountsSchema = z.object({
  active: z.number().int().min(0),
  pending: z.number().int().min(0),
  retiring: z.number().int().min(0),
});

export interface HostResourceAdmissionUsage {
  agentSessions: HostResourceUsageCounts;
  terminalShells: HostResourceUsageCounts;
  generationHelpers: HostResourceUsageCounts;
  /** Capacity units held across every class (live reservations). */
  total: number;
  /** Refusals served since the supervisor admission owner was constructed. */
  refusals: number;
}

export const hostResourceAdmissionUsageSchema = z.object({
  agentSessions: hostResourceUsageCountsSchema,
  terminalShells: hostResourceUsageCountsSchema,
  generationHelpers: hostResourceUsageCountsSchema,
  total: z.number().int().min(0),
  refusals: z.number().int().min(0),
});

/**
 * Effective policy the supervisor would apply to the next counted start.
 * `refuseNewStarts` is present only while the resolver is fail-closed and
 * carries the safe diagnostic reason code.
 */
export interface HostResourceAdmissionPolicy {
  /** 0 = unlimited (pre-measurement default; explicitly transitional). */
  maxActiveAgentSessions: number;
  /** 0 = unlimited. */
  maxActiveTerminalShells: number;
  /** 0 = unlimited until a measured number exists. */
  maxActiveGenerationHelpers: number;
  /** Retry-After hint surfaced with a busy refusal (constant; mirrors B3). */
  overloadRetryAfterMs: number;
  /**
   * Fail-closed marker: when set, every new counted start is refused with
   * `HOST_RESOURCE_POLICY_UNAVAILABLE_CODE` before capacity checks. Same-slot
   * handoffs and stop/cleanup stay available.
   */
  refuseNewStarts?: string;
}

export const hostResourceAdmissionPolicySchema = z.object({
  maxActiveAgentSessions: z.number().int().min(0),
  maxActiveTerminalShells: z.number().int().min(0),
  maxActiveGenerationHelpers: z.number().int().min(0),
  overloadRetryAfterMs: z.number().int().min(0),
  refuseNewStarts: z.string().min(1).optional(),
});

export interface GitProcessAdmissionClassDiagnostics {
  limit: number;
  active: number;
  queued: number;
  maxActive: number;
}

export interface GitProcessAdmissionDiagnostics {
  short: GitProcessAdmissionClassDiagnostics;
  long: GitProcessAdmissionClassDiagnostics;
  admitted: number;
  queueFullRefusals: number;
  waitTimeoutRefusals: number;
  cancellations: number;
}

export const gitProcessAdmissionClassDiagnosticsSchema = z.object({
  limit: z.number().int().min(1),
  active: z.number().int().min(0),
  queued: z.number().int().min(0),
  maxActive: z.number().int().min(0),
});

export const gitProcessAdmissionDiagnosticsSchema = z.object({
  short: gitProcessAdmissionClassDiagnosticsSchema,
  long: gitProcessAdmissionClassDiagnosticsSchema,
  admitted: z.number().int().min(0),
  queueFullRefusals: z.number().int().min(0),
  waitTimeoutRefusals: z.number().int().min(0),
  cancellations: z.number().int().min(0),
});

/**
 * Additive on-demand diagnostic snapshot. This is not an event stream: callers
 * ask for it (later `/metrics` and the Thread settings panel); an absent or
 * older supervisor must degrade to "unavailable", never to a fabricated zero.
 */
export interface HostResourceAdmissionStatus {
  resolution: HostResourceAdmissionResolution;
  policy: HostResourceAdmissionPolicy;
  usage: HostResourceAdmissionUsage;
  /** Additive B7 process-local Git scheduler counters (absent on older peers). */
  gitProcesses?: GitProcessAdmissionDiagnostics;
}

export const hostResourceAdmissionStatusSchema = z.object({
  resolution: hostResourceAdmissionResolutionSchema,
  policy: hostResourceAdmissionPolicySchema,
  usage: hostResourceAdmissionUsageSchema,
  gitProcesses: gitProcessAdmissionDiagnosticsSchema.optional(),
});

/**
 * Outcome of the on-demand admission peek (the supervisor client's
 * `peekResourceAdmissionStatus` result, consumed by the loopback `/metrics`
 * handler). `unavailable` is deliberate: an absent, stopped, older, or
 * unresponsive supervisor must never be reported as zero usage.
 */
export type ResourceAdmissionPeek =
  | { readonly kind: "available"; readonly status: HostResourceAdmissionStatus }
  | {
      readonly kind: "unavailable";
      readonly reason: "supervisor-not-running" | "supervisor-error";
    };
