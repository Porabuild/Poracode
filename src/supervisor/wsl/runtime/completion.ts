/**
 * Completion proof for a Poracode-managed WSL Node runtime.
 *
 * Existence of `bin/node` alone cannot prove a valid install: a timed-out or
 * killed extraction leaves a partially written tree behind, and the old
 * existence-only check then served it forever. A managed install is valid
 * only when its completion marker is present, and the marker is published
 * atomically (host temp file + worker `stage-file` rename) after the
 * extraction command has exited and its process was joined.
 *
 * The marker is a versioned compatibility boundary, not a bare file, so its
 * contents are validated: `markerVersion` must be one this build understands,
 * and a v1 marker must pin the resolving identity's `nodeVersion` and
 * `target`. A marker from a newer build (`markerVersion` above this build's)
 * fails closed and is never rewritten, because replacing it would silently
 * downgrade a newer install. A present-but-unusable marker (corrupt,
 * wrong-shape, wrong target, wrong pinned node) is not trusted as proof.
 * A read/transport failure throws instead of reading as absence, so a caller
 * never re-extracts over a runtime that may still be valid.
 *
 * Installs created before the marker existed are accepted only after the
 * exact binary runs and reports the pinned version; the successful run is
 * then stamped with the marker so later resolutions take the fast path. A
 * stamp failure never rejects a runtime the binary itself proved.
 */

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execInWsl, getWslCommand } from "../../agents/base";
import { safeRm } from "../../runtime/cleanup";
import { PORACODE_PINNED_NODE_VERSION } from "../../runtime/pinnedNode";
import type { WslStagingService } from "../staging";
import type { NodeTargetTriple } from "./types";

const execFileAsync = promisify(execFile);

/** Atomically published proof that a managed runtime extraction completed. */
export const MANAGED_RUNTIME_MARKER_FILE = ".poracode-managed-complete.json";
export const MANAGED_RUNTIME_MARKER_VERSION = 1;

/** Bound on executing a pre-marker (legacy) binary during revalidation. */
const LEGACY_VALIDATION_TIMEOUT_MS = 15_000;

/** Why a present completion marker cannot be trusted as install proof. */
export type ManagedRuntimeMarkerInvalidReason =
  | "corrupt"
  | "wrong-shape"
  | "wrong-target"
  | "wrong-node-version";

/**
 * Outcome of reading a completion marker. `unsupported-version` is separated
 * from `invalid` because it must fail closed without a rewrite, while an
 * `invalid` marker may still be replaced after the binary proves itself.
 */
export type ManagedRuntimeMarkerState =
  | { kind: "valid" }
  | { kind: "absent" }
  | { kind: "invalid"; reason: ManagedRuntimeMarkerInvalidReason }
  | { kind: "unsupported-version"; markerVersion: number };

export interface ManagedRuntimeIdentity {
  distro: string;
  target: NodeTargetTriple;
  linuxNodePath: string;
  linuxMarkerPath: string;
  uncNodePath: string;
  uncMarkerPath: string;
}

export interface ManagedRuntimeUseOptions {
  useBridge: boolean;
  signal: AbortSignal | undefined;
}

/** Validated marker + binary present: published by a completed install. */
export async function managedRuntimeIsComplete(
  staging: WslStagingService,
  identity: ManagedRuntimeIdentity,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  if (!(await staging.pathExists(identity.distro, identity.uncNodePath, signalOptions(signal)))) {
    return false;
  }
  const marker = await readManagedRuntimeMarker(staging, identity, signal);
  return marker.kind === "valid";
}

/**
 * Read and validate the completion marker at `identity`. Returns `absent` only
 * when the path really does not exist; a transport/read failure (and caller
 * abort) throws, because treating it as absence would let a reinstall write
 * over a runtime that could still be valid.
 */
export async function readManagedRuntimeMarker(
  staging: WslStagingService,
  identity: ManagedRuntimeIdentity,
  signal: AbortSignal | undefined,
): Promise<ManagedRuntimeMarkerState> {
  const raw = await staging.readTextFile(
    identity.distro,
    identity.uncMarkerPath,
    signalOptions(signal),
  );
  if (raw === null) return { kind: "absent" };
  return parseManagedRuntimeMarker(raw, identity.target);
}

/** Validate marker shape, generation, pinned node, and target. Pure. */
export function parseManagedRuntimeMarker(
  raw: string,
  expectedTarget: NodeTargetTriple,
): ManagedRuntimeMarkerState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "invalid", reason: "corrupt" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { kind: "invalid", reason: "wrong-shape" };
  }
  const marker = parsed as Record<string, unknown>;
  const markerVersion = marker.markerVersion;
  if (typeof markerVersion !== "number" || !Number.isInteger(markerVersion)) {
    return { kind: "invalid", reason: "wrong-shape" };
  }
  if (markerVersion > MANAGED_RUNTIME_MARKER_VERSION) {
    return { kind: "unsupported-version", markerVersion };
  }
  if (markerVersion !== MANAGED_RUNTIME_MARKER_VERSION) {
    // No marker generation below v1 was ever published; an alien generation
    // cannot be treated as this build's proof.
    return { kind: "invalid", reason: "wrong-shape" };
  }
  if (typeof marker.nodeVersion !== "string" || typeof marker.target !== "string") {
    return { kind: "invalid", reason: "wrong-shape" };
  }
  if (marker.target !== expectedTarget) {
    return { kind: "invalid", reason: "wrong-target" };
  }
  if (marker.nodeVersion !== PORACODE_PINNED_NODE_VERSION) {
    return { kind: "invalid", reason: "wrong-node-version" };
  }
  return { kind: "valid" };
}

/**
 * Whether the managed runtime at `identity` may be served. A valid marker is
 * trusted. Anything else (absent, corrupt, wrong-shape, wrong target, wrong
 * pinned node) is a candidate legacy install or an interrupted extraction and
 * must prove itself by running the exact binary. A marker from a newer build
 * fails closed instead: it is never overwritten and the caller must not
 * reinstall over it.
 */
export async function managedRuntimeIsUsable(
  staging: WslStagingService,
  identity: ManagedRuntimeIdentity,
  options: ManagedRuntimeUseOptions,
): Promise<boolean> {
  const marker = await readManagedRuntimeMarker(staging, identity, options.signal);
  if (marker.kind === "unsupported-version") {
    throw new Error(
      `managed Node runtime marker at ${identity.linuxMarkerPath} has version ${marker.markerVersion}, ` +
        `but this build understands only version ${MANAGED_RUNTIME_MARKER_VERSION}; refusing to overwrite it`,
    );
  }
  if (marker.kind === "valid") {
    return staging.pathExists(identity.distro, identity.uncNodePath, signalOptions(options.signal));
  }
  if (
    !(await staging.pathExists(
      identity.distro,
      identity.uncNodePath,
      signalOptions(options.signal),
    ))
  ) {
    return false;
  }
  if (!(await managedNodeRunsVerified(identity, options))) return false;
  options.signal?.throwIfAborted();
  try {
    await publishManagedRuntimeMarker(staging, identity);
  } catch (error) {
    if (options.signal?.aborted) throw error;
    // The exact binary already proved the runtime; a failed stamp only costs
    // one more validation on a later resolve.
  }
  return true;
}

/**
 * Publish the completion marker through the staging worker, which writes a
 * unique temp sibling and renames it into place. Callers invoke this only
 * after the extraction process has been joined, and deliberately without a
 * flight signal: a caller that left during the extraction must not discard a
 * finished install.
 */
export async function publishManagedRuntimeMarker(
  staging: WslStagingService,
  identity: ManagedRuntimeIdentity,
): Promise<void> {
  const hostMarkerPath = join(tmpdir(), `poracode-runtime-marker-${process.pid}-${randomUUID()}`);
  try {
    await writeFile(
      hostMarkerPath,
      JSON.stringify({
        markerVersion: MANAGED_RUNTIME_MARKER_VERSION,
        nodeVersion: PORACODE_PINNED_NODE_VERSION,
        target: identity.target,
      }),
    );
    await staging.stageFile(identity.distro, {
      src: hostMarkerPath,
      dest: identity.uncMarkerPath,
    });
  } finally {
    safeRm(hostMarkerPath);
  }
}

async function managedNodeRunsVerified(
  identity: ManagedRuntimeIdentity,
  options: ManagedRuntimeUseOptions,
): Promise<boolean> {
  const expected = `v${PORACODE_PINNED_NODE_VERSION}`;
  if (options.useBridge) {
    let stdout: string;
    try {
      stdout = await execInWsl(identity.distro, "/", identity.linuxNodePath, ["--version"], {
        timeout: LEGACY_VALIDATION_TIMEOUT_MS,
      });
    } catch {
      return false;
    }
    // Abort after a completed probe must not read as "binary did not prove
    // itself": a caller that cancelled must not trigger a reinstall.
    options.signal?.throwIfAborted();
    return stdout.trim() === expected;
  }
  try {
    const { stdout } = await execFileAsync(
      getWslCommand(),
      ["-d", identity.distro, "--", identity.linuxNodePath, "--version"],
      {
        encoding: "utf8",
        timeout: LEGACY_VALIDATION_TIMEOUT_MS,
        killSignal: "SIGKILL",
        windowsHide: true,
        ...(options.signal ? { signal: options.signal } : {}),
      },
    );
    return stdout.trim() === expected;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return false;
  }
}

function signalOptions(signal: AbortSignal | undefined): { signal?: AbortSignal } | undefined {
  return signal ? { signal } : undefined;
}
