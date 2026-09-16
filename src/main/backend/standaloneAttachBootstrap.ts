// Focused Electron bootstrap helpers for standalone attach. Extracted from
// `src/main/main.ts` so the God file stays flat: main owns windows/tray/quit,
// this module owns the attach namespace, the deferred authenticated decision,
// and the attach-mode IPC payload. Early startup and native services stay off
// the local backend structurally: attach startup never registers the managed
// `registerIpcHandlers` set, so no local backend exists to call — only the
// explicit device-only attach handler (`standaloneAttachIpc`) is registered.
//
// Attach mode never acquires the owner lease, never forks `backendHost.cjs`,
// never runs legacy migration or `readOrCreateSafeStorageSecretKey`, and never
// opens/calls SQLite in main. Closing Electron is client cleanup only: no
// owner-stop credential and no process-kill path exist in attach mode.

import { homedir } from "node:os";
import { join } from "node:path";
import type { PoracodeChannel } from "@/shared/channel";
import { resolvePoracodeBaseDir } from "@/shared/poracodePaths";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote/protocol";
import { standaloneAttachInfoSchema, type StandaloneAttachInfo } from "@/shared/standaloneAttach";
import { callHostControl } from "@/backend/ownership/hostControlClient";
import type { HostRootPaths } from "@/backend/ownership/hostRootPaths";
import type { HostDescription } from "@/shared/hostControlProtocol";
import type { ShellStateStore } from "./BackendStateStore";
import {
  decideStandaloneAttach,
  peekStandaloneOwnerDiscovery,
  requestStandalonePairing,
  type StandaloneAttachDecision,
} from "./standaloneAttach";

export interface DesktopBaseDirInput {
  baseDirOverride?: string;
  isDev: boolean;
  channel: PoracodeChannel;
  homedir?: () => string;
}

/** Single mapping of PORACODE_BASE_DIR/dev/channel to the profile namespace. */
export function resolveDesktopBaseDir(input: DesktopBaseDirInput): string {
  if (input.baseDirOverride) return input.baseDirOverride;
  if (input.isDev) return join((input.homedir ?? homedir)(), ".poracode-dev");
  return resolvePoracodeBaseDir(input.channel);
}

export function shouldDeferLeaseForAttachProbe(baseDir: string): boolean {
  return peekStandaloneOwnerDiscovery(baseDir);
}

export interface DeferredAttachProbe {
  readonly baseDir: string;
}

export type DeferredAttachOutcome =
  | { readonly kind: "no-probe" }
  | { readonly kind: "managed"; readonly baseDir: string }
  | {
      readonly kind: "attach";
      readonly baseDir: string;
      readonly endpoint: string;
      readonly ownerGeneration: string;
      readonly profileNamespace: string;
      readonly dataRoot: string;
      readonly controlPaths: HostRootPaths;
      readonly description: HostDescription;
    }
  | {
      readonly kind: "refuse";
      readonly baseDir: string;
      readonly reason: string;
      readonly detail: string;
    };

/**
 * Run the authenticated attach decision for a deferred probe. Returns
 * `no-probe` when startup took the synchronous managed path (no discovery was
 * visible at module load). Refusals stay refusals here: callers fail closed.
 * A `deferred-managed` decision (desktop-mapping connection-level failure
 * only) reuses the existing managed branch, which still acquires the desktop
 * lease before any mutation; headless-mapping refusals never reach it.
 */
export async function decideDeferredStandaloneAttach(
  probe: DeferredAttachProbe | null,
): Promise<DeferredAttachOutcome> {
  if (!probe) return { kind: "no-probe" };
  const decision: StandaloneAttachDecision = await decideStandaloneAttach(probe.baseDir);
  if (decision.kind === "attach") {
    return {
      kind: "attach",
      baseDir: probe.baseDir,
      endpoint: decision.endpoint,
      ownerGeneration: decision.ownerGeneration,
      profileNamespace: decision.profileNamespace,
      dataRoot: decision.dataRoot,
      controlPaths: decision.controlPaths,
      description: decision.description,
    };
  }
  if (decision.kind === "managed" || decision.kind === "deferred-managed") {
    return { kind: "managed", baseDir: probe.baseDir };
  }
  return {
    kind: "refuse",
    baseDir: probe.baseDir,
    reason: decision.reason,
    detail: decision.detail,
  };
}

export function describeAttachRefusal(
  outcome: Extract<DeferredAttachOutcome, { kind: string }>,
): string {
  if (outcome.kind !== "refuse") return "Standalone attach did not refuse.";
  return (
    `Poracode found an existing host owner for this profile but cannot attach to it ` +
    `(${outcome.reason}). Stop the running owner or use its profile before starting ` +
    `another authority. Detail: ${outcome.detail}`
  );
}

/**
 * Mint the renderer bootstrap payload after an attach decision. Validates the
 * wire shape before it crosses IPC; never logs the pairing URL.
 */
export async function buildStandaloneAttachInfoForRenderer(input: {
  endpoint: string;
  ownerGeneration: string;
  profileNamespace: string;
  dataRoot: string;
  controlPaths: HostRootPaths;
}): Promise<StandaloneAttachInfo> {
  const pairing = await requestStandalonePairing(input.controlPaths);
  if (pairing.ownerGeneration !== input.ownerGeneration) {
    throw new Error("Standalone owner generation changed during pairing.");
  }
  return standaloneAttachInfoSchema.parse({
    profileNamespace: input.profileNamespace,
    dataRoot: input.dataRoot,
    endpoint: input.endpoint,
    ownerGeneration: pairing.ownerGeneration,
    remoteProtocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
    pairingUrl: pairing.pairingUrl,
  });
}

export interface StandaloneAttachSession {
  readonly info: StandaloneAttachInfo;
  /**
   * Re-run the authenticated `describe` with a generation check. Called on
   * every attach transport (re)establishment — concretely, every renderer
   * (re)bootstrap that re-reads the attach payload, including crash-screen
   * reloads. A stale generation (the owner restarted under the same profile;
   * persisted bearers would still authenticate against the NEW owner) throws:
   * the renderer boot fails closed, and relaunching re-runs the full decision
   * and re-pairs. There is deliberately NO per-request generation pinning:
   * persisted bearer tokens survive a same-root owner restart by design, and
   * pinning every request would break that proven restart continuity — the
   * (re)establishment boundary is the closure point.
   */
  reverify(): Promise<void>;
}

export function createStandaloneAttachSession(input: {
  controlPaths: HostRootPaths;
  /** Owner kind pinned by the admitting decision (attach re-verifies it). */
  mode: HostDescription["mode"];
  info: StandaloneAttachInfo;
}): StandaloneAttachSession {
  const reverify = async (): Promise<void> => {
    let reply: { ownerGeneration: string; result: HostDescription };
    try {
      reply = await callHostControl(input.controlPaths, "describe");
    } catch (error) {
      throw new Error(
        `The standalone owner could not be re-verified for this attach session: ` +
          `${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    if (reply.ownerGeneration !== input.info.ownerGeneration) {
      throw new Error(
        "The standalone owner generation changed (the owner restarted under this profile). " +
          "Restart Poracode to re-decide and re-pair; refusing to continue against a " +
          "different owner.",
      );
    }
    const description = reply.result;
    if (
      description.profileNamespace !== input.info.profileNamespace ||
      description.dataRoot !== input.info.dataRoot
    ) {
      throw new Error("The standalone owner no longer matches the attached profile.");
    }
    if (description.mode !== input.mode) {
      throw new Error(`The standalone owner mode changed to ${description.mode}.`);
    }
    if (description.state !== "ready") {
      throw new Error(`The standalone owner state is ${description.state}; attach requires ready.`);
    }
  };
  return { info: input.info, reverify };
}

/**
 * Ephemeral window-state store for attach mode: no owned-root writes.
 *
 * Fail-closed in attach mode is structural, not guard-enforced: attach
 * startup never calls `registerIpcHandlers` (managed-only), so no
 * `BackendHostClient` fork, lease, or `getSqlite`/`initDatabase` exists
 * anywhere in the attach path. `clientProcedureInvoke` is served only by the
 * explicit device allowlist (`standaloneAttachIpc`); server-owned procedures
 * loud-reject instead of reaching a backend that does not exist.
 */
export function createEphemeralShellState(): ShellStateStore & { close(): Promise<void> } {
  const values = new Map<string, string>();
  return {
    get: (key: string) => values.get(key) ?? null,
    set: (key: string, value: string) => {
      values.set(key, value);
    },
    close: async () => {},
  };
}
