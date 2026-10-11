import { z } from "zod";
import { SshBootstrapRefusedError, type SshBootstrapRefusalCode } from "@/shared/sshBootstrap";
import {
  sshConnectPayloadSchema,
  sshConnectResultSchema,
  sshDiscoveredHostSchema,
  type SshConnectPayload,
  type SshConnectResult,
  type SshDiscoveredHost,
} from "@/shared/ssh";

/**
 * Wire contract between Electron main and the device-local SSH utility process.
 *
 * `SSH_ENVIRONMENT_PROTOCOL_VERSION` gates the frame set: a utility built from
 * a different source must fail the `ready` handshake instead of serving. Main
 * never performs SSH mechanics itself — this protocol is the only seam.
 *
 * The protocol is process-lifetime only (no persisted frames), but the worker
 * *resource closure* it consumes (the preassembled runtime archive manifest) is
 * a versioned release boundary documented in `.agents/docs/versioning.md`.
 */
export const SSH_ENVIRONMENT_PROTOCOL_VERSION = 1;

export const sshEnvironmentWorkerConfigSchema = z.strictObject({
  mainBundleDir: z.string().min(1),
  agentPluginsDir: z.string().min(1),
  wslHelpersDir: z.string().min(1),
  bundledSkillsDir: z.string().min(1).optional(),
  bundledPluginsDir: z.string().min(1).optional(),
  cacheDir: z.string().min(1),
  sshCommand: z.string().min(1).optional(),
  scpCommand: z.string().min(1).optional(),
  sshConfigFile: z.string().min(1).optional(),
  /** Immutable release archive directory (manifest.json + archive), when shipped. */
  preassembledArchiveDir: z.string().min(1).optional(),
});
export type SshEnvironmentWorkerConfig = z.infer<typeof sshEnvironmentWorkerConfigSchema>;

/** Env var carrying the JSON worker config into the utility process. */
export const SSH_ENVIRONMENT_WORKER_CONFIG_ENV = "PORACODE_SSH_ENVIRONMENT_CONFIG";

export type SshEnvironmentRequest =
  | { readonly kind: "discover-hosts" }
  | { readonly kind: "connect"; readonly payload: SshConnectPayload }
  | { readonly kind: "disconnect"; readonly connectionId: string }
  /** Builds/loads the runtime bundle without dialing; diagnostics + prewarm. */
  | { readonly kind: "prepare-runtime" }
  /** Cancels one in-flight request owned by this request id. */
  | { readonly kind: "cancel"; readonly requestId: string }
  | { readonly kind: "shutdown" };

export interface SshEnvironmentRequestEnvelope {
  readonly v: number;
  readonly generation: number;
  readonly requestId: string;
  readonly request: SshEnvironmentRequest;
}

export interface SshEnvironmentPreparedRuntime {
  readonly hash: string;
  readonly version: string;
  /** "preassembled" when the immutable release archive served this build. */
  readonly source: "preassembled" | "staged";
}

export interface SshEnvironmentSerializedError {
  readonly name: string;
  readonly message: string;
  readonly code?: string;
  readonly ownerAppVersion?: string | null;
  readonly ownerProtocolVersion?: number | null;
}

export interface SshEnvironmentReadyMessage {
  readonly v: number;
  readonly kind: "ready";
}

export interface SshEnvironmentResultMessage {
  readonly v: number;
  readonly kind: "result";
  readonly generation: number;
  readonly requestId: string;
  readonly ok: boolean;
  readonly result?: unknown;
  readonly error?: SshEnvironmentSerializedError;
}

export interface SshEnvironmentFatalMessage {
  readonly v: number;
  readonly kind: "fatal";
  readonly message: string;
}

export type SshEnvironmentWorkerMessage =
  | SshEnvironmentReadyMessage
  | SshEnvironmentResultMessage
  | SshEnvironmentFatalMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Frame guard for parent→utility requests (protocol version 1).
 *
 * Validation is intentionally strict about the fields each verb consumes: a
 * malformed `disconnect` or `cancel` frame must be ignored, never handed to a
 * verb where a missing field could produce a false success. The `connect`
 * payload is schema-parsed where it is consumed (`SshConnectionManager`), so
 * here it only has to be a record.
 */
export function isSshEnvironmentParentMessage(
  message: unknown,
): message is SshEnvironmentRequestEnvelope {
  if (!isRecord(message)) return false;
  if (message.v !== SSH_ENVIRONMENT_PROTOCOL_VERSION) return false;
  if (typeof message.generation !== "number" || !Number.isInteger(message.generation)) return false;
  if (typeof message.requestId !== "string" || message.requestId.length === 0) return false;
  if (!isRecord(message.request)) return false;
  const request = message.request;
  switch (request.kind) {
    case "discover-hosts":
    case "prepare-runtime":
    case "shutdown":
      return true;
    case "connect":
      return isRecord(request.payload);
    case "disconnect":
      return typeof request.connectionId === "string" && request.connectionId.length > 0;
    case "cancel":
      return typeof request.requestId === "string" && request.requestId.length > 0;
    default:
      return false;
  }
}

export function isSshEnvironmentWorkerMessage(
  message: unknown,
): message is SshEnvironmentWorkerMessage {
  if (!isRecord(message)) return false;
  if (message.v !== SSH_ENVIRONMENT_PROTOCOL_VERSION) return false;
  if (message.kind === "ready") return true;
  if (message.kind === "fatal") return typeof message.message === "string";
  if (message.kind === "result") {
    return (
      typeof message.generation === "number" &&
      typeof message.requestId === "string" &&
      typeof message.ok === "boolean"
    );
  }
  return false;
}

export function serializeSshEnvironmentError(error: unknown): SshEnvironmentSerializedError {
  if (error instanceof SshBootstrapRefusedError) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      ownerAppVersion: error.ownerAppVersion,
      ownerProtocolVersion: error.ownerProtocolVersion,
    };
  }
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: "Error", message: String(error) };
}

const refusalCodes: ReadonlySet<string> = new Set<SshBootstrapRefusalCode>([
  "owner-unverified",
  "owner-unresponsive",
  "owner-incompatible",
  "owner-conflict",
  "owner-busy",
  "drain-timeout",
  "launch-failed",
]);

export function deserializeSshEnvironmentError(value: unknown): Error {
  const record = isRecord(value) ? value : {};
  const message =
    typeof record.message === "string" ? record.message : "SSH utility request failed.";
  if (typeof record.code === "string" && refusalCodes.has(record.code)) {
    return new SshBootstrapRefusedError(
      record.code as SshBootstrapRefusalCode,
      typeof record.ownerAppVersion === "string" ? record.ownerAppVersion : null,
      typeof record.ownerProtocolVersion === "number" ? record.ownerProtocolVersion : null,
    );
  }
  const error = new Error(message);
  if (typeof record.name === "string" && record.name.length > 0) error.name = record.name;
  return error;
}

export function parseSshConnectResult(value: unknown): SshConnectResult {
  return sshConnectResultSchema.parse(value);
}

export function parseSshDiscoveredHosts(value: unknown): SshDiscoveredHost[] {
  return sshDiscoveredHostSchema.array().parse(value);
}

export function parseSshConnectPayload(value: unknown): SshConnectPayload {
  return sshConnectPayloadSchema.parse(value);
}
