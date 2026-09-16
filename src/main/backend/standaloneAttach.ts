// Electron standalone-attach decision: run BEFORE lease/acquire, backend fork,
// legacy migration, or desktop secret-key initialization.
//
// Safety contract (Gate 2 connected slice):
// - This module never acquires HostOwnerLease, never constructs
//   HostOwnerController, never opens SQLite (no @/main/db import, no
//   initDatabase/getSqlite call), never forks backendHost.cjs, and never
//   publishes discovery/control. It only reads discovery files and runs the
//   authenticated `describe` against an already-running owner.
// - Probes both root mappings sharing one lease inode: the headless mapping
//   (`resolveHostRootPaths`, dataRoot = canonical.host-v1) first, then the
//   legacy desktop mapping (`resolveDesktopHostRootPaths`, dataRoot =
//   canonical). Each mapping is blind to the other's owner because discovery
//   requires exact namespace + dataRoot + generation match.
// - Pins the authenticated owner generation: the returned `ownerGeneration`
//   comes from the HMAC-verified, generation-bound `callHostControl` reply,
//   never from the discovery endpoint alone.
// - Fail-closed: incompatible / non-ready / stale / mismatched / unreachable
//   existing-owner evidence refuses loudly and starts nothing. Only definitive
//   no-owner (no readable discovery in either mapping) returns `managed`, which
//   follows the existing managed startup (still acquiring the lease before
//   mutations). There is no fallback flag: refusals stay refusals.
// - Mapping-aware unreachable: the headless mapping (dataRoot =
//   canonical.host-v1) and the desktop mapping (dataRoot = canonical) share
//   one lease inode but hold DIFFERENT DB/settings/auth/key lineage, so a free
//   lease proves exclusion only, never custody continuity. A connection-level
//   describe failure on the headless mapping stays `refuse unreachable-owner`
//   (fail-closed; never routed to the desktop DB/keys, never migrated). Only a
//   connection-level failure on the DESKTOP mapping returns `deferred-managed`,
//   letting the existing acquire-before-any-mutations path arbitrate (held
//   lock still refuses via HostRootInUseError; dead desktop recovers the same
//   root). Invalid/auth/incompatible/stale-generation responses fail closed on
//   both mappings and never defer. A headless refusal is never masked by later
//   desktop evidence.
// - Pairing is minted only after an attach decision, via `issue-pairing`
//   (existing owner control), and exchanged via OAuth (`POST /oauth/token`)
//   by the renderer through the existing RemoteDesktopClient. The discovery
//   endpoint alone is never authentication, and plaintext secrets are never
//   logged or persisted ad hoc here.
//
// Versioning: reuses control 1 / discovery 1 / remote 12. No boundary version
// is bumped; stream 5 is untouched (root batch owns 5->6).

import {
  callHostControl,
  HostControlRefusedError,
  type HostControlCallOptions,
} from "@/backend/ownership/hostControlClient";
import { readHostControlDiscovery } from "@/backend/ownership/hostControlDiscovery";
import {
  resolveDesktopHostRootPaths,
  resolveHostRootPaths,
  type HostRootPaths,
} from "@/backend/ownership/hostRootPaths";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote/protocol";
import type { HostDescription } from "@/shared/hostControlProtocol";

export type StandaloneAttachRefuseReason =
  | "incompatible-owner"
  | "non-ready-owner"
  | "non-headless-owner"
  | "desktop-owner-admission-disabled"
  | "stale-generation"
  | "mismatched-root"
  | "unreachable-owner";

/**
 * Integration switch for admitting DESKTOP owners as attach targets. The gate
 * below is owner-kind-aware, but desktop owners do not yet expose the
 * backend-owned client endpoint or the settings authority an attach client
 * requires (the settings authority lands with Lane 1B of this batch), so
 * admission stays explicitly refused. Flip to `"admit"` ONLY at the
 * coordinated freeze boundary (Gates 2-3 Batch 1 plan, slice S1.1); the rest
 * of the gate already handles an admitted desktop owner (state/protocol/
 * endpoint checks apply unchanged).
 */
const DESKTOP_OWNER_ATTACH_ADMISSION = "refuse" as const;

export type StandaloneAttachDecision =
  | {
      readonly kind: "attach";
      readonly endpoint: string;
      readonly ownerGeneration: string;
      readonly remoteProtocolVersion: typeof PORACODE_REMOTE_PROTOCOL_VERSION;
      readonly profileNamespace: string;
      readonly dataRoot: string;
      readonly controlPaths: HostRootPaths;
      readonly description: HostDescription;
    }
  | { readonly kind: "managed" }
  | {
      readonly kind: "deferred-managed";
      readonly controlPaths: HostRootPaths;
    }
  | {
      readonly kind: "refuse";
      readonly reason: StandaloneAttachRefuseReason;
      readonly detail: string;
      readonly controlPaths?: HostRootPaths;
      readonly ownerGeneration?: string;
    };

export interface StandaloneAttachProbeDeps {
  readDiscovery?: (paths: HostRootPaths) => unknown;
  describeOwner?: (
    paths: HostRootPaths,
    options?: HostControlCallOptions,
  ) => Promise<{ ownerGeneration: string; result: HostDescription }>;
}

function defaultReadDiscovery(paths: HostRootPaths): unknown {
  return readHostControlDiscovery(paths);
}

function defaultDescribeOwner(
  paths: HostRootPaths,
  options?: HostControlCallOptions,
): Promise<{ ownerGeneration: string; result: HostDescription }> {
  return callHostControl(paths, "describe", options ?? {});
}

function probePathsFor(profileNamespace: string): HostRootPaths[] {
  return [resolveHostRootPaths(profileNamespace), resolveDesktopHostRootPaths(profileNamespace)];
}

function refuse(
  reason: StandaloneAttachRefuseReason,
  detail: string,
  controlPaths?: HostRootPaths,
  ownerGeneration?: string,
): StandaloneAttachDecision {
  return controlPaths
    ? ownerGeneration !== undefined
      ? { kind: "refuse", reason, detail, controlPaths, ownerGeneration }
      : { kind: "refuse", reason, detail, controlPaths }
    : { kind: "refuse", reason, detail };
}

/**
 * The desktop mapping reuses the profile directory as its data root, so only
 * it shares DB/key lineage with managed startup. The headless mapping never
 * does (`dataRoot` is the `.host-v1` sibling).
 */
function isDesktopMapping(paths: HostRootPaths): boolean {
  return paths.dataRoot === paths.profileNamespace;
}

/**
 * Connection-level describe failures (closed port, timeout, cancel) are the
 * only ones that may defer to the existing managed acquire path, and only on
 * the desktop mapping. Anything else from `callHostControl` (proof mismatch,
 * schema/verification wrappers, bad deadlines) is owner evidence that failed
 * verification and must fail closed — never a managed install.
 */
function isConnectionLevelDescribeError(error: unknown): boolean {
  if (error instanceof HostControlRefusedError) return false;
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("could not be reached") ||
    message.includes("Timed out waiting for the current host control") ||
    message.includes("was cancelled")
  );
}

function checkDescriptionCompat(
  paths: HostRootPaths,
  description: HostDescription,
): StandaloneAttachDecision | null {
  if (
    description.profileNamespace !== paths.profileNamespace ||
    description.dataRoot !== paths.dataRoot
  ) {
    return refuse(
      "mismatched-root",
      "Host description did not match the requested profile.",
      paths,
    );
  }
  if (description.mode === "desktop" && DESKTOP_OWNER_ATTACH_ADMISSION === "refuse") {
    return refuse(
      "desktop-owner-admission-disabled",
      "Existing owner is the desktop app already running this profile; quit it (or use its " +
        "window) instead of starting another authority. Desktop owners do not admit attach " +
        "clients in this build.",
      paths,
    );
  }
  if (description.mode !== "headless") {
    return refuse(
      "non-headless-owner",
      `Existing owner mode is ${description.mode}; attach requires a headless owner.`,
      paths,
    );
  }
  if (description.state !== "ready") {
    return refuse(
      "non-ready-owner",
      `Existing owner state is ${description.state}; attach requires ready.`,
      paths,
    );
  }
  if (description.remoteProtocolVersion !== PORACODE_REMOTE_PROTOCOL_VERSION) {
    return refuse(
      "incompatible-owner",
      `Existing owner remote protocol is ${description.remoteProtocolVersion}; ` +
        `this build requires ${PORACODE_REMOTE_PROTOCOL_VERSION}.`,
      paths,
    );
  }
  if (!description.endpoint) {
    return refuse(
      "incompatible-owner",
      "Existing owner exposes no remote endpoint to attach to.",
      paths,
    );
  }
  return null;
}

/**
 * Decide whether Electron should attach to an already-running headless owner,
 * follow the existing managed-local startup, or refuse loudly.
 *
 * Never acquires the lease, opens SQLite, forks a backend, mints pairing, or
 * writes owner/discovery records. Pairing stays untouched: pass a spy via
 * `deps` in tests to prove it.
 */
export async function decideStandaloneAttach(
  profileNamespace: string,
  deps: StandaloneAttachProbeDeps = {},
  options: HostControlCallOptions = {},
): Promise<StandaloneAttachDecision> {
  const readDiscovery = deps.readDiscovery ?? defaultReadDiscovery;
  const describeOwner = deps.describeOwner ?? defaultDescribeOwner;
  const candidates = probePathsFor(profileNamespace);

  let sawDiscovery = false;
  let headlessRefusal: StandaloneAttachDecision | null = null;
  let desktopRefusal: StandaloneAttachDecision | null = null;
  let desktopDeferred: StandaloneAttachDecision | null = null;

  for (const paths of candidates) {
    try {
      readDiscovery(paths);
    } catch {
      continue;
    }
    sawDiscovery = true;
    const desktop = isDesktopMapping(paths);

    let reply: { ownerGeneration: string; result: HostDescription };
    try {
      reply = await describeOwner(paths, options);
    } catch (error) {
      if (error instanceof HostControlRefusedError) {
        const refusal = refuse(
          error.code === "generation-mismatch" ? "stale-generation" : "non-ready-owner",
          `Host control refused describe: ${error.code}.`,
          paths,
        );
        if (desktop) desktopRefusal ??= refusal;
        else headlessRefusal ??= refusal;
        continue;
      }
      if (isConnectionLevelDescribeError(error)) {
        if (desktop) {
          desktopDeferred ??= { kind: "deferred-managed", controlPaths: paths };
        } else {
          headlessRefusal ??= refuse(
            "unreachable-owner",
            "Stale headless owner evidence; the lease may be free but managed " +
              "startup would open a different data root. Restart the headless owner " +
              "at the same namespace instead of starting another authority.",
            paths,
          );
        }
        continue;
      }
      const refusal = refuse(
        "incompatible-owner",
        "Existing owner control response failed verification; refusing rather " +
          "than starting another authority.",
        paths,
      );
      if (desktop) desktopRefusal ??= refusal;
      else headlessRefusal ??= refusal;
      continue;
    }

    const compat = checkDescriptionCompat(paths, reply.result);
    if (compat) {
      if (desktop) desktopRefusal ??= compat;
      else headlessRefusal ??= compat;
      continue;
    }

    return {
      kind: "attach",
      endpoint: reply.result.endpoint as string,
      ownerGeneration: reply.ownerGeneration,
      remoteProtocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
      profileNamespace: paths.profileNamespace,
      dataRoot: paths.dataRoot,
      controlPaths: paths,
      description: reply.result,
    };
  }

  // A headless refusal is never masked by later desktop evidence: routing it
  // to the desktop data root would diverge DB/settings/auth/key lineage.
  if (headlessRefusal) return headlessRefusal;
  if (desktopDeferred) return desktopDeferred;
  if (desktopRefusal) return desktopRefusal;
  if (!sawDiscovery) return { kind: "managed" };
  return refuse("unreachable-owner", "Existing owner evidence could not be verified.", undefined);
}

/**
 * Mint a fresh pairing URL against the already-decided owner. Call only after
 * `decideStandaloneAttach` returned `attach`. Never reads `secret-key.safe`;
 * the credential is exchanged by the renderer via OAuth and stored in the
 * existing remote credential vault — never logged or persisted here.
 */
export async function requestStandalonePairing(
  controlPaths: HostRootPaths,
  options: HostControlCallOptions = {},
  callControl: (
    paths: HostRootPaths,
    operation: "issue-pairing",
    callOptions?: HostControlCallOptions,
  ) => Promise<{ requestId: string; ownerGeneration: string; result: { pairingUrl: string } }> = (
    paths,
    operation,
    callOptions,
  ) => callHostControl(paths, operation, callOptions ?? {}),
): Promise<{ pairingUrl: string; ownerGeneration: string; requestId: string }> {
  const reply = await callControl(controlPaths, "issue-pairing", options);
  return {
    pairingUrl: reply.result.pairingUrl,
    ownerGeneration: reply.ownerGeneration,
    requestId: reply.requestId,
  };
}

/**
 * Synchronous, side-effect-free probe for main startup: true when either root
 * mapping holds a readable discovery record. Never acquires, never writes,
 * never throws. The async `decideStandaloneAttach` still owns the verdict;
 * this only decides whether the lease acquisition must be deferred to
 * `whenReady` for the authenticated decision.
 */
export function peekStandaloneOwnerDiscovery(profileNamespace: string): boolean {
  try {
    for (const paths of probePathsFor(profileNamespace)) {
      try {
        readHostControlDiscovery(paths);
        return true;
      } catch {
        continue;
      }
    }
    return false;
  } catch {
    return false;
  }
}
