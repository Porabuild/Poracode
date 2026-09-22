import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  callHostControl,
  HostControlRefusedError,
  HostControlUnsupportedOperationError,
} from "@/backend/ownership/hostControlClient";
import {
  readHostOwnerRecord,
  type HostOwnerKind,
  type HostOwnerPhase,
} from "@/backend/ownership/hostOwnerLease";
import type { HostRootPaths } from "@/backend/ownership/hostRootPaths";
import type {
  HostBuildIdentity,
  HostControlStatusResult,
  HostDescription,
} from "@/shared/hostControlProtocol";
import { probeLeaseKernelLock } from "./serverDoctorIo";
import {
  resolveOptionalServerInstallLayout,
  type ServerInstallLayout,
} from "./serverInstallLayout";
import { isPidAlive, readProcessIdentity } from "./serverUpgradeLock";
import { readServerArtifactVersion, resolveServerVersion } from "./serverVersion";

/**
 * D4 upgrade identity.
 *
 * A healthy HTTP answer proves liveness, not ownership or release identity: a
 * wrong process, a stale release or another profile can answer the health URL.
 * Qualification therefore compares an authenticated `status` result against
 * the exact candidate build the upgrader staged (version, entrypoint SHA,
 * layout root, profile root) and the running owner generation.
 *
 * Pre-D4 owners do not answer `status`. Such an owner is verified through
 * `describe` (mutually authenticated) and may be drained, but the candidate
 * must still prove its own exact build before admission. An authentication or
 * proof failure is never a reason to fall back to a weaker check.
 */

export const SERVER_ENTRYPOINT_FILE = join("lib", "server.cjs");
export const SERVER_ARTIFACT_METADATA_FILE = "server-artifact.json";

export function sha256File(path: string): string | null {
  try {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  } catch {
    return null;
  }
}

export interface ReleaseBuildIdentity {
  readonly releaseDir: string;
  readonly root: string;
  readonly layoutKind: "prefix" | "checkout" | null;
  readonly version: string | null;
  readonly entrypointSha256: string | null;
}

/** Identity of a staged release directory (the candidate before it runs). */
export function readReleaseBuildIdentity(releaseDir: string): ReleaseBuildIdentity {
  const layout = resolveOptionalServerInstallLayout({ libDir: join(releaseDir, "lib") });
  return {
    releaseDir,
    root: layout?.root ?? releaseDir,
    layoutKind: layout?.kind ?? null,
    version: readServerArtifactVersion(layout) ?? null,
    entrypointSha256: sha256File(join(releaseDir, SERVER_ENTRYPOINT_FILE)),
  };
}

function readSourceRevision(layout: ServerInstallLayout | undefined): string | null {
  if (layout === undefined) return null;
  try {
    const parsed = JSON.parse(
      readFileSync(join(layout.root, SERVER_ARTIFACT_METADATA_FILE), "utf8"),
    ) as { sourceRevision?: unknown };
    return typeof parsed.sourceRevision === "string" && parsed.sourceRevision.length > 0
      ? parsed.sourceRevision.slice(0, 128)
      : null;
  } catch {
    return null;
  }
}

/** The identity a running server publishes on the authenticated status call. */
export function resolveRunningBuildIdentity(
  input: { readonly libDir?: string; readonly env?: NodeJS.ProcessEnv } = {},
): HostBuildIdentity {
  const layout = resolveOptionalServerInstallLayout(
    input.libDir === undefined ? {} : { libDir: input.libDir },
  );
  const version = resolveServerVersion({
    ...(layout !== undefined ? { layout } : {}),
    env: input.env ?? process.env,
  });
  const entrypoint = layout === undefined ? null : join(layout.libDir, "server.cjs");
  return {
    version: version.version,
    sourceRevision: readSourceRevision(layout),
    entrypointSha256: entrypoint === null ? null : sha256File(entrypoint),
    root: layout?.root ?? process.cwd(),
    layoutKind: layout?.kind ?? "checkout",
  };
}

export interface ExpectedCandidateBuild {
  readonly profileNamespace: string;
  readonly dataRoot: string;
  /** The staged release directory the candidate must be running from. */
  readonly releaseRoot: string;
  readonly version: string;
  readonly entrypointSha256: string;
}

export interface IdentityMismatch {
  readonly field: string;
  readonly expected: string;
  readonly actual: string;
}

/** Pure comparison of an authenticated status result against the candidate. */
export function verifyCandidateStatus(
  status: HostControlStatusResult,
  expected: ExpectedCandidateBuild,
  options: { readonly requireAdmission?: "held" | "open" | "any" } = {},
): IdentityMismatch[] {
  const mismatches: IdentityMismatch[] = [];
  const compare = (field: string, expectedValue: string, actual: string): void => {
    if (expectedValue !== actual) mismatches.push({ field, expected: expectedValue, actual });
  };
  compare("mode", "headless", status.mode);
  compare("profileNamespace", expected.profileNamespace, status.profileNamespace);
  compare("dataRoot", expected.dataRoot, status.dataRoot);
  compare("build.root", expected.releaseRoot, status.build.root);
  compare("build.layoutKind", "prefix", status.build.layoutKind);
  compare("build.version", expected.version, status.build.version);
  compare(
    "build.entrypointSha256",
    expected.entrypointSha256,
    status.build.entrypointSha256 ?? "unreadable",
  );
  const requireAdmission = options.requireAdmission ?? "any";
  if (requireAdmission !== "any") compare("admission", requireAdmission, status.admission);
  return mismatches;
}

export function describeIdentityMismatches(mismatches: readonly IdentityMismatch[]): string {
  return mismatches
    .map((mismatch) => `${mismatch.field} expected ${mismatch.expected}, got ${mismatch.actual}`)
    .join("; ");
}

export class RunningOwnerUnreachableError extends Error {
  readonly code = "SERVER_UPGRADE_OWNER_UNREACHABLE";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RunningOwnerUnreachableError";
  }
}

export class RunningOwnerRefusedError extends Error {
  readonly code = "SERVER_UPGRADE_OWNER_REFUSED";

  constructor(message: string) {
    super(message);
    this.name = "RunningOwnerRefusedError";
  }
}

export interface RunningOwnerProbe {
  readonly paths: HostRootPaths;
  readonly generation: string;
  readonly pid: number;
  readonly processIdentity: string | null;
  readonly kind: HostOwnerKind;
  readonly phase: HostOwnerPhase;
  readonly description: HostDescription;
  /** null for a pre-D4 owner that does not answer the additive status call. */
  readonly status: HostControlStatusResult | null;
}

const OWNER_STOP_TIMEOUT_MS = 15_000;
const OWNER_STOP_POLL_MS = 100;

/**
 * Authenticated probe of the running owner for this profile.
 *
 * - `null` means there is no live owner: no record, a stopped record, or a
 *   record whose PID is gone with the kernel lease free (a crash leftover).
 * - A live-but-unreachable owner, a generation mismatch, a different profile
 *   root, or a desktop owner is a refusal, never silently ignored.
 * - A pre-D4 owner answers `describe` but not `status`; `status` stays null and
 *   the caller may only use the authenticated description for draining.
 */
export async function probeRunningOwner(
  paths: HostRootPaths,
  options: { readonly timeoutMs?: number } = {},
): Promise<RunningOwnerProbe | null> {
  const record = readHostOwnerRecord(paths);
  if (!record || record.phase === "stopped") return null;
  const timeoutMs = options.timeoutMs ?? 3_000;
  let described: Awaited<ReturnType<typeof callHostControl<"describe">>>;
  try {
    described = await callHostControl(paths, "describe", { timeoutMs });
  } catch (error) {
    // A crash leftover (dead PID, free kernel lease) is not a live owner. Any
    // other failure stays closed: the upgrader must not guess.
    const lock = probeLeaseKernelLock(paths, record.pid);
    if (!isPidAlive(record.pid) && lock.state === "free") return null;
    throw new RunningOwnerUnreachableError(
      "A Poracode owner record exists but the authenticated control surface did not answer; " +
        "stop the daemon manually before upgrading.",
      { cause: error },
    );
  }
  if (described.ownerGeneration !== record.generation)
    throw new RunningOwnerUnreachableError(
      "The authenticated owner generation does not match the recorded owner; refusing to touch it.",
    );
  if (
    described.result.profileNamespace !== paths.profileNamespace ||
    described.result.dataRoot !== paths.dataRoot
  )
    throw new RunningOwnerRefusedError(
      "The authenticated owner describes a different profile than this upgrade target.",
    );
  if (record.kind !== "headless")
    throw new RunningOwnerRefusedError(
      "This profile is owned by the desktop app. Quit the Poracode app for this profile, " +
        "or upgrade a standalone profile.",
    );
  let status: HostControlStatusResult | null = null;
  try {
    status = (await callHostControl(paths, "status", { timeoutMs })).result;
  } catch (error) {
    // Only a verified describe plus an authenticated HTTP 400 for the additive
    // operation classifies as a pre-D4 owner. Anything else is a real failure.
    if (!(error instanceof HostControlUnsupportedOperationError)) {
      if (error instanceof HostControlRefusedError)
        throw new RunningOwnerUnreachableError(
          `The running owner refused the authenticated status probe (${error.code}).`,
          { cause: error },
        );
      throw new RunningOwnerUnreachableError(
        "The running owner did not answer the authenticated status probe; refusing to continue.",
        { cause: error },
      );
    }
  }
  return {
    paths,
    generation: record.generation,
    pid: record.pid,
    processIdentity: readProcessIdentity(record.pid),
    kind: record.kind,
    phase: record.phase,
    description: described.result,
    status,
  };
}

/**
 * Stop a verified owner and join its shutdown before the caller may start a
 * replacement. Identity is re-checked immediately before signalling, and a
 * persisted PID is never escalated to SIGKILL (it may already be reused).
 */
export async function stopRunningOwner(
  probe: RunningOwnerProbe,
  options: {
    readonly timeoutMs?: number;
    readonly now?: () => number;
    readonly sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<void> {
  const paths = probe.paths;
  const deadline = (options.now ?? Date.now)() + (options.timeoutMs ?? OWNER_STOP_TIMEOUT_MS);
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const current = readHostOwnerRecord(paths);
  if (
    !current ||
    current.generation !== probe.generation ||
    current.pid !== probe.pid ||
    current.phase === "stopped"
  )
    throw new RunningOwnerUnreachableError(
      "The running owner changed while preparing to stop it; refusing to signal a stale PID.",
    );
  const identity = readProcessIdentity(current.pid);
  if (probe.processIdentity !== null && identity !== null && identity !== probe.processIdentity)
    throw new RunningOwnerUnreachableError(
      "The recorded owner PID was reused by an unrelated process; refusing to signal it.",
    );
  try {
    process.kill(current.pid, "SIGTERM");
  } catch (error) {
    if (!(error !== null && typeof error === "object" && "code" in error && error.code === "ESRCH"))
      throw new RunningOwnerUnreachableError(
        "The running owner could not be stopped; stop the daemon manually before upgrading.",
        { cause: error },
      );
  }
  for (;;) {
    const record = readHostOwnerRecord(paths);
    if (!record || record.phase === "stopped" || !isPidAlive(record.pid)) return;
    if ((options.now ?? Date.now)() >= deadline)
      throw new RunningOwnerUnreachableError(
        "The running owner did not finish shutting down before the upgrade deadline; " +
          "stop the daemon manually and retry.",
      );
    await sleep(OWNER_STOP_POLL_MS);
  }
}

/** Wait for a successor owner to publish an authenticated generation. */
export async function waitForRunningOwner(
  paths: HostRootPaths,
  input: {
    readonly timeoutMs: number;
    readonly now?: () => number;
    readonly sleep?: (ms: number) => Promise<void>;
  },
): Promise<RunningOwnerProbe | null> {
  const deadline = (input.now ?? Date.now)() + input.timeoutMs;
  const sleep =
    input.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (;;) {
    try {
      const probe = await probeRunningOwner(paths, { timeoutMs: 2_000 });
      if (probe) return probe;
    } catch (error) {
      if (!(error instanceof RunningOwnerUnreachableError)) throw error;
      // A freshly spawned candidate may not have published discovery yet.
    }
    if ((input.now ?? Date.now)() >= deadline) return null;
    await sleep(200);
  }
}
