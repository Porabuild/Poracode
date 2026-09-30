import { randomUUID } from "node:crypto";
import { parseLastJsonObject, parsePairingCredential } from "./ssh";
import { msg } from "./messages";
import {
  remoteEnvironmentDescriptorSchema,
  type RemoteEnvironmentDescriptor,
} from "./remote/protocol";
import {
  INSTALL_REMOTE_RUNTIME_SCRIPT,
  LAUNCH_REMOTE_SERVER_SCRIPT,
  PAIR_REMOTE_SERVER_SCRIPT,
  PREPARE_REMOTE_UPLOAD_SCRIPT,
  PROBE_REMOTE_RUNTIME_SCRIPT,
  SSH_LAUNCH_PROTOCOL_VERSION,
} from "./sshRemoteScripts";

export const SSH_COMMAND_TIMEOUT_MS = 60_000;
export const SSH_INSTALL_TIMEOUT_MS = 10 * 60_000;
export const SSH_TUNNEL_READY_TIMEOUT_MS = 20_000;
/** Bounded wait for another client's owner launch/upgrade to finish. */
export const SSH_BOOTSTRAP_LOCK_WAIT_MS = 120_000;
/** Bounded wait for another client's runtime install; below the ssh deadline. */
export const SSH_INSTALL_LOCK_WAIT_MS = 540_000;
/** Bounded join of an old owner's shutdown during an explicit upgrade. */
export const SSH_UPGRADE_DRAIN_WAIT_MS = 30_000;

/**
 * Transport deadline for a launch that may wait out another client's lock and
 * then start and authenticate an owner. The remote script's own bound is the
 * lock wait plus start/status work, so the ssh command deadline must cover
 * that whole budget: with the 120 s default lock wait and the 60 s command
 * timeout, a waiting client used to be killed locally while the remote could
 * still start an owner, and the typed `owner-busy` refusal never reached it.
 * The default therefore leaves one full command timeout of margin.
 */
export const SSH_BOOTSTRAP_LAUNCH_TIMEOUT_MS = SSH_BOOTSTRAP_LOCK_WAIT_MS + SSH_COMMAND_TIMEOUT_MS;

/** Total transport deadline for a launch with an explicit lock wait. */
export function sshLaunchTimeoutMs(lockWaitMs: number): number {
  return Math.max(SSH_BOOTSTRAP_LAUNCH_TIMEOUT_MS, lockWaitMs + SSH_COMMAND_TIMEOUT_MS);
}

/** Total transport deadline for an explicit upgrade (lock wait + drain + start). */
export function sshUpgradeTimeoutMs(lockWaitMs: number, drainWaitMs: number): number {
  return Math.max(SSH_INSTALL_TIMEOUT_MS, lockWaitMs + drainWaitMs + SSH_COMMAND_TIMEOUT_MS);
}

/** Runs a bootstrap script on the remote host and resolves its stdout. */
export type RemoteScriptRunner = (
  script: string,
  args: readonly string[],
  timeoutMs: number,
) => Promise<string>;

/**
 * Transport primitives each platform supplies: the desktop spawns `ssh`/`scp`
 * processes, mobile goes through the native SshBridge. The bootstrap sequence
 * itself (probe → upload+install when missing → launch) is shared so the
 * remote protocol can only change in one place.
 */
export interface RemoteRuntimeTransport {
  readonly runScript: RemoteScriptRunner;
  /** Deliver the runtime archive to the given remote path. */
  deliverArchive(remotePath: string): Promise<void>;
}

/**
 * Why an ownership-safe launch refused to proceed. Every refusal leaves the
 * remote host untouched: no process was signalled and no runtime replaced.
 */
export type SshBootstrapRefusalCode =
  | "owner-unverified"
  | "owner-unresponsive"
  | "owner-incompatible"
  | "owner-conflict"
  | "owner-busy"
  | "drain-timeout"
  | "launch-failed";

const REFUSAL_CODES: ReadonlySet<string> = new Set<SshBootstrapRefusalCode>([
  "owner-unverified",
  "owner-unresponsive",
  "owner-incompatible",
  "owner-conflict",
  "owner-busy",
  "drain-timeout",
  "launch-failed",
]);

export class SshBootstrapRefusedError extends Error {
  readonly code: SshBootstrapRefusalCode;
  readonly ownerAppVersion: string | null;
  readonly ownerProtocolVersion: number | null;

  constructor(
    code: SshBootstrapRefusalCode,
    ownerAppVersion: string | null = null,
    ownerProtocolVersion: number | null = null,
  ) {
    super(refusalMessage(code, ownerAppVersion));
    this.name = "SshBootstrapRefusedError";
    this.code = code;
    this.ownerAppVersion = ownerAppVersion;
    this.ownerProtocolVersion = ownerProtocolVersion;
  }
}

function refusalMessage(code: SshBootstrapRefusalCode, ownerAppVersion: string | null): string {
  switch (code) {
    case "owner-unverified":
      return msg("remote.helper.ownerUnverified");
    case "owner-unresponsive":
      return msg("remote.helper.ownerUnresponsive");
    case "owner-incompatible":
      return msg("remote.helper.ownerIncompatible", {
        version: ownerAppVersion ?? "unknown",
      });
    case "owner-conflict":
      return msg("remote.helper.ownerConflict");
    case "owner-busy":
      return msg("remote.helper.busy");
    case "drain-timeout":
      return msg("remote.helper.drainTimeout");
    case "launch-failed":
      return msg("remote.helper.startFailed");
  }
}

/** A verified launch outcome: either a reused owner or a freshly started one. */
export interface RemoteBootstrapResult {
  readonly remotePort: number;
  readonly reusedOwner: boolean;
  /** Runtime hash of the live owner; the pairing CLI must run this runtime. */
  readonly ownerRuntimeHash: string;
  readonly ownerAppVersion: string | null;
}

export interface RemoteBootstrapOptions {
  readonly lockWaitMs?: number;
  /** Unique per upload attempt so concurrent clients never share an archive. */
  readonly uploadId?: string;
}

/** Upload destination consumed by INSTALL_REMOTE_RUNTIME_SCRIPT. */
export function remoteRuntimeUploadPath(archiveName: string): string {
  return `.poracode/ssh/uploads/${archiveName}`;
}

/**
 * Parse the versioned launch result. Unknown protocol versions and malformed
 * payloads are rejected instead of guessed at; a refusal is surfaced as a
 * typed {@link SshBootstrapRefusedError}.
 */
export function parseRemoteLaunchOutcome(stdout: string): RemoteBootstrapResult {
  const reply = parseLastJsonObject<Record<string, unknown>>(stdout);
  if (reply.poracodeLaunchProtocol !== SSH_LAUNCH_PROTOCOL_VERSION) {
    throw new Error(msg("remote.helper.invalidResponse"));
  }
  if (reply.outcome === "ready") {
    const remotePort = reply.remotePort;
    if (
      typeof remotePort !== "number" ||
      !Number.isInteger(remotePort) ||
      remotePort < 1 ||
      remotePort > 65_535
    ) {
      throw new Error(msg("remote.helper.invalidResponse"));
    }
    const ownerRuntimeHash = reply.ownerRuntimeHash;
    if (
      typeof ownerRuntimeHash !== "string" ||
      ownerRuntimeHash.length === 0 ||
      ownerRuntimeHash.length > 128
    ) {
      throw new Error(msg("remote.helper.invalidResponse"));
    }
    return {
      remotePort,
      reusedOwner: reply.reused === true,
      ownerRuntimeHash,
      ownerAppVersion:
        typeof reply.ownerAppVersion === "string" && reply.ownerAppVersion.length > 0
          ? reply.ownerAppVersion
          : null,
    };
  }
  if (reply.outcome === "refused") {
    const code = reply.code;
    if (typeof code !== "string" || !REFUSAL_CODES.has(code)) {
      throw new Error(msg("remote.helper.invalidResponse"));
    }
    return refuse(
      code as SshBootstrapRefusalCode,
      typeof reply.ownerAppVersion === "string" && reply.ownerAppVersion.length > 0
        ? reply.ownerAppVersion
        : null,
      typeof reply.ownerProtocolVersion === "number" &&
        Number.isInteger(reply.ownerProtocolVersion) &&
        reply.ownerProtocolVersion > 0
        ? reply.ownerProtocolVersion
        : null,
    );
  }
  throw new Error(msg("remote.helper.invalidResponse"));
}

function refuse(
  code: SshBootstrapRefusalCode,
  ownerAppVersion: string | null,
  ownerProtocolVersion: number | null,
): never {
  throw new SshBootstrapRefusedError(code, ownerAppVersion, ownerProtocolVersion);
}

/**
 * Ensure a compatible remote runtime owner for `hash` and resolve its port.
 *
 * Connecting is not upgrading: an existing authenticated owner of any runtime
 * hash/app version is reused when it speaks the current remote protocol, and
 * a mismatch that would require replacing it refuses with a typed error
 * instead of signalling the owner. Explicit replacement is
 * {@link upgradeRemoteRuntime}, which is owner-authorized and joins the old
 * owner's shutdown before the new one starts.
 */
export async function bootstrapRemoteRuntime(
  transport: RemoteRuntimeTransport,
  connectionId: string,
  hash: string,
  options: RemoteBootstrapOptions = {},
): Promise<RemoteBootstrapResult> {
  const probe = await transport.runScript(
    PROBE_REMOTE_RUNTIME_SCRIPT,
    [hash],
    SSH_COMMAND_TIMEOUT_MS,
  );
  if (probe.trim().split(/\r?\n/g).at(-1) !== "ready") {
    const archiveName = `${hash}-${options.uploadId ?? randomUUID()}.tar.gz`;
    const installLockWaitMs = options.lockWaitMs ?? SSH_INSTALL_LOCK_WAIT_MS;
    await transport.runScript(PREPARE_REMOTE_UPLOAD_SCRIPT, [], SSH_COMMAND_TIMEOUT_MS);
    await transport.deliverArchive(remoteRuntimeUploadPath(archiveName));
    await transport.runScript(
      INSTALL_REMOTE_RUNTIME_SCRIPT,
      [hash, archiveName, String(installLockWaitMs)],
      SSH_INSTALL_TIMEOUT_MS,
    );
  }
  const lockWaitMs = options.lockWaitMs ?? SSH_BOOTSTRAP_LOCK_WAIT_MS;
  const launched = await transport.runScript(
    LAUNCH_REMOTE_SERVER_SCRIPT,
    ["connect", connectionId, hash, String(lockWaitMs)],
    sshLaunchTimeoutMs(lockWaitMs),
  );
  return parseRemoteLaunchOutcome(launched);
}

/**
 * Explicit owner-authorized runtime replacement.
 *
 * The remote script refuses unless the identity record matches the
 * authenticated host-control describe (generation, profile, data root) and
 * the recorded process lifetime token, then SIGTERMs that owner, joins its
 * exit and port closure within `drainWaitMs`, and only then starts the
 * requested runtime into the same data root. A slow drain returns
 * `drain-timeout` and leaves the old owner running; nothing is SIGKILLed.
 *
 * NOTE: no product surface invokes this yet. Triggering an upgrade from a
 * client still requires an owner-authorized operation (host-control upgrade
 * operation and the D4 release-identity/serialization work), which remains an
 * open gate — ordinary connect must never substitute for it.
 */
export async function upgradeRemoteRuntime(
  transport: RemoteRuntimeTransport,
  connectionId: string,
  hash: string,
  options: RemoteBootstrapOptions & { readonly drainWaitMs?: number } = {},
): Promise<RemoteBootstrapResult> {
  const lockWaitMs = options.lockWaitMs ?? SSH_BOOTSTRAP_LOCK_WAIT_MS;
  const drainWaitMs = options.drainWaitMs ?? SSH_UPGRADE_DRAIN_WAIT_MS;
  const launched = await transport.runScript(
    LAUNCH_REMOTE_SERVER_SCRIPT,
    ["upgrade", connectionId, hash, String(lockWaitMs), String(drainWaitMs)],
    sshUpgradeTimeoutMs(lockWaitMs, drainWaitMs),
  );
  return parseRemoteLaunchOutcome(launched);
}

/** Mint a one-time pairing credential from the launched remote server. */
export async function issueRemotePairingCredential(
  runScript: RemoteScriptRunner,
  connectionId: string,
  hash: string,
): Promise<string> {
  return parsePairingCredential(
    await runScript(PAIR_REMOTE_SERVER_SCRIPT, [connectionId, hash], SSH_COMMAND_TIMEOUT_MS),
  );
}

/** One readiness request deadline inside the overall endpoint poll. */
export const SSH_ENDPOINT_ATTEMPT_TIMEOUT_MS = 1_000;
/** Pause between readiness attempts inside the overall endpoint poll. */
export const SSH_ENDPOINT_POLL_INTERVAL_MS = 200;

export interface WaitForRemoteEndpointOptions {
  /**
   * Cancels the poll *and joins it*: the in-flight request receives the same
   * signal (combined with the per-attempt deadline), the inter-attempt pause is
   * cancelled, and the loop exits before another request starts. An abort
   * never leaves a detached poll or timer behind.
   */
  readonly signal?: AbortSignal;
  readonly attemptTimeoutMs?: number;
  readonly pollIntervalMs?: number;
}

function abortError(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof Error) return reason;
  const error = new Error(
    typeof reason === "string" && reason.length > 0 ? reason : "The endpoint poll was aborted.",
  );
  error.name = "AbortError";
  return error;
}

function waitForPoll(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (signal === undefined) return new Promise((resolve) => setTimeout(resolve, ms));
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = (): void => {
      cleanup();
      reject(abortError(signal));
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Poll the tunneled endpoint until the versioned Poracode Helper answers. */
export async function waitForRemoteEndpoint(
  fetchImpl: typeof fetch,
  endpoint: string,
  timeoutMs = SSH_TUNNEL_READY_TIMEOUT_MS,
  options: WaitForRemoteEndpointOptions = {},
): Promise<RemoteEnvironmentDescriptor> {
  const signal = options.signal;
  const attemptTimeoutMs = options.attemptTimeoutMs ?? SSH_ENDPOINT_ATTEMPT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? SSH_ENDPOINT_POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw abortError(signal);
    try {
      const response = await fetchImpl(new URL(".well-known/poracode/environment", endpoint), {
        signal:
          signal === undefined
            ? AbortSignal.timeout(attemptTimeoutMs)
            : AbortSignal.any([signal, AbortSignal.timeout(attemptTimeoutMs)]),
      });
      if (response.ok) {
        const descriptor = remoteEnvironmentDescriptorSchema.safeParse(await response.json());
        if (descriptor.success && descriptor.data.hostMode === "helper") return descriptor.data;
        lastError = new Error(
          descriptor.success
            ? msg("remote.helper.wrongHost")
            : msg("remote.helper.invalidResponse"),
        );
      } else {
        lastError = new Error(msg("remote.helper.probeFailed", { status: response.status }));
      }
    } catch (error) {
      if (signal?.aborted) throw abortError(signal);
      // The listener can become reachable a moment after the tunnel is bound.
      lastError = error;
    }
    await waitForPoll(pollIntervalMs, signal);
  }
  if (signal?.aborted) throw abortError(signal);
  throw new Error(msg("remote.helper.timeout"), {
    cause: lastError,
  });
}
