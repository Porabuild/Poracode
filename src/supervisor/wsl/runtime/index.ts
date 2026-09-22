/**
 * WSL Node runtime resolver.
 *
 * Single entry point for "give me an absolute path to a usable Node binary
 * inside <distro>". Two paths:
 *
 *   1. Probe the user's login shell for an existing `node`. If it resolves
 *      to a binary at version >= MIN_ACCEPTED_NODE_MAJOR, use it. Re-probed
 *      every supervisor boot so nvm version changes are picked up.
 *
 *   2. If no acceptable node is found, download the pinned LTS Node tarball
 *      from nodejs.org, verify SHA256, stage it through the per-distro
 *      staging worker, and extract inside the distro using its own `tar`.
 *
 * In both cases the returned `nodePath` is an absolute Linux path baked
 * into hook commands and the bridge launch argv. /bin/sh -c never needs
 * to resolve `node` from PATH.
 *
 * Resolution is single-flight per distro: concurrent consumers (bridge
 * start, MCP probe/filter, provider probes, plugin installs) share one
 * probe/install instead of racing duplicate downloads. A caller with a
 * stricter `minimumVersion` that joins a weaker in-flight resolution
 * re-resolves rather than accepting a node below its floor.
 */

import { toWslUncPath } from "@/shared/wsl";
import {
  MIN_ACCEPTED_NODE_MAJOR,
  NODE_TARBALL_CHECKSUMS,
  PORACODE_PINNED_NODE_VERSION,
} from "../../runtime/pinnedNode";
import { SingleFlight } from "../singleFlight";
import { getWslStagingService } from "../staging";
import { installRuntimeIntoDistro } from "./install";
import { probeUserNode } from "./probe";
import type { ResolveNodeOptions, ResolvedNode } from "./types";
import {
  assertManagedNodeSatisfiesMinimum,
  nodeVersionIsAccepted,
  parseMinimumNodeVersion,
  type ParsedNodeVersion,
} from "./version";

export { PORACODE_PINNED_NODE_VERSION, MIN_ACCEPTED_NODE_MAJOR, NODE_TARBALL_CHECKSUMS };
export { probeUserNode } from "./probe";
export { installRuntimeIntoDistro } from "./install";
export type { LinuxArch, NodeProbeOptions } from "./probe";
export type {
  NodeTargetTriple,
  ResolvedNode,
  ResolveNodeOptions,
  RuntimeProgressEvent,
  RuntimeProgressListener,
} from "./types";

/**
 * Cleared on supervisor restart so users picking up a new nvm default get
 * re-probed without manual action.
 */
const distroNodeCache = new Map<string, ResolvedNode>();
const distroFlights = new SingleFlight();

/**
 * Resolve a usable Node binary inside `distro`. Probes once per supervisor
 * lifetime (cheap, ~50ms via login shell); falls back to downloading the
 * pinned LTS if no acceptable node is found.
 */
export async function resolveNodeForDistro(
  distro: string,
  options?: ResolveNodeOptions,
): Promise<ResolvedNode> {
  const minimumVersion = parseMinimumNodeVersion(options?.minimumVersion);
  const cached = await resolveCachedNode(distro, minimumVersion, options);
  if (cached) {
    options?.onProgress?.({ kind: "ready", nodePath: cached.nodePath });
    return cached;
  }

  // A joined in-flight resolution may satisfy a weaker floor than this
  // caller asked for; retry once with the stronger floor rather than
  // returning a node below it.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const resolved = await distroFlights.run(
      distro,
      (signal) => resolveUncached(distro, options, signal),
      options?.signal ? { signal: options.signal } : undefined,
    );
    if (nodeVersionIsAccepted(resolved.nodeVersion, minimumVersion)) {
      options?.onProgress?.({ kind: "ready", nodePath: resolved.nodePath });
      return resolved;
    }
    distroNodeCache.delete(distro);
  }
  throw new Error(
    `no Node ${options?.minimumVersion ?? ""} runtime could be resolved in WSL distro "${distro}"`,
  );
}

async function resolveCachedNode(
  distro: string,
  minimumVersion: ParsedNodeVersion | undefined,
  options: ResolveNodeOptions | undefined,
  signal: AbortSignal | undefined = options?.signal,
): Promise<ResolvedNode | undefined> {
  const cached = distroNodeCache.get(distro);
  if (!cached) return undefined;
  if (!nodeVersionIsAccepted(cached.nodeVersion, minimumVersion)) {
    distroNodeCache.delete(distro);
    return undefined;
  }
  const staging = options?.staging ?? getWslStagingService();
  const pathIsAvailable =
    cached.source === "user-installed" ||
    (await staging.pathExists(
      distro,
      toWslUncPath(distro, cached.nodePath),
      signal ? { signal } : undefined,
    ));
  if (pathIsAvailable) return cached;
  distroNodeCache.delete(distro);
  return undefined;
}

async function resolveUncached(
  distro: string,
  options: ResolveNodeOptions | undefined,
  flightSignal: AbortSignal,
): Promise<ResolvedNode> {
  const minimumVersion = parseMinimumNodeVersion(options?.minimumVersion);
  // Caller-specific aborts are handled by the single-flight join; the task
  // itself is cancelled only when every joined caller has gone away.
  const signal = flightSignal;
  signal.throwIfAborted();

  // A successor may have waited for an uncooperative predecessor's
  // settlement. If that predecessor completed an install, reuse it instead of
  // repeating the work.
  const cached = await resolveCachedNode(distro, minimumVersion, options, signal);
  if (cached) return cached;
  signal.throwIfAborted();

  options?.onProgress?.({ kind: "probe-start" });
  const useBridge = options?.useBridge !== false;
  const probed = await probeUserNode(distro, {
    useBridge,
    ...(signal ? { signal } : {}),
  });
  signal.throwIfAborted();

  if (probed) {
    if (nodeVersionIsAccepted(probed.version, minimumVersion)) {
      options?.onProgress?.({ kind: "probe-result", resolved: "found", version: probed.version });
      const resolved: ResolvedNode = {
        nodePath: probed.nodePath,
        nodeVersion: probed.version,
        source: "user-installed",
      };
      distroNodeCache.set(distro, resolved);
      return resolved;
    }
    options?.onProgress?.({ kind: "probe-result", resolved: "too-old", version: probed.version });
  } else {
    options?.onProgress?.({ kind: "probe-result", resolved: "missing" });
  }

  assertManagedNodeSatisfiesMinimum(options?.minimumVersion, minimumVersion);
  const { signal: _callerSignal, ...sharedOptions } = options ?? {};
  const installed = await installRuntimeIntoDistro(distro, {
    ...sharedOptions,
    signal: flightSignal,
  });
  const resolved: ResolvedNode = {
    nodePath: installed.nodePath,
    nodeVersion: PORACODE_PINNED_NODE_VERSION,
    source: "poracode-managed",
  };
  distroNodeCache.set(distro, resolved);
  return resolved;
}
