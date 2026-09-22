import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toWslUncPath } from "@/shared/wsl";
import { execInWsl, getWslCommand, resolveWslHomeDirectoryAsync } from "../../agents/base";
import { safeRm } from "../../runtime/cleanup";
import { downloadToFile, verifySha256 } from "../../runtime/download";
import {
  NODE_TARBALL_CHECKSUMS,
  PORACODE_PINNED_NODE_VERSION,
  nodeArchiveDirName,
  nodeArchiveFileName,
  nodeArchiveUrl,
} from "../../runtime/pinnedNode";
import { spawnAndAwaitExit } from "../../runtime/spawn";
import { getWslStagingService, type WslStagingService } from "../staging";
import {
  MANAGED_RUNTIME_MARKER_FILE,
  managedRuntimeIsComplete,
  managedRuntimeIsUsable,
  publishManagedRuntimeMarker,
  type ManagedRuntimeIdentity,
} from "./completion";
import { probeDistroArch, resolveWslHomeDirectoryForBootstrap, type LinuxArch } from "./probe";
import type { NodeTargetTriple, ResolveNodeOptions } from "./types";
import {
  assertManagedNodeSatisfiesMinimum,
  parseMinimumNodeVersion,
  type ParsedNodeVersion,
} from "./version";

/**
 * Download and extract the pinned Node tarball into the distro. Throws
 * with a descriptive Error on failure (no arch, no checksum, network
 * failure, archive corruption, etc.). Only the official glibc tarballs
 * are supported here — Alpine/musl users are expected to surface their
 * own node via the probe.
 *
 * Every UNC filesystem operation goes through the per-distro staging
 * worker with a hard deadline, so a stalled distro cannot pin the
 * supervisor while the tarball is staged, probed, or pruned.
 *
 * A managed runtime is served only after a completed extraction: the
 * versioned directory carries an atomically published completion marker, and
 * a bin/node without that marker is treated as an interrupted extraction.
 */
export async function installRuntimeIntoDistro(
  distro: string,
  options?: ResolveNodeOptions,
): Promise<{ nodePath: string }> {
  const minimumVersion: ParsedNodeVersion | undefined = parseMinimumNodeVersion(
    options?.minimumVersion,
  );
  assertManagedNodeSatisfiesMinimum(options?.minimumVersion, minimumVersion);
  const useBridge = options?.useBridge !== false;
  const staging = options?.staging ?? getWslStagingService();
  const signal = options?.signal;

  const arch: LinuxArch | null = await probeDistroArch(distro, useBridge, signal);
  if (!arch) {
    throw new Error(`could not detect architecture for WSL distro "${distro}"`);
  }
  const target: NodeTargetTriple = `linux-${arch}` as const;

  const checksum = NODE_TARBALL_CHECKSUMS[target];
  if (!checksum) {
    throw new Error(
      `poracode is missing the SHA256 checksum for Node ${PORACODE_PINNED_NODE_VERSION} ${target}; rerun scripts/refresh-node-checksums.mjs`,
    );
  }

  const home = useBridge
    ? await resolveWslHomeDirectoryAsync(distro)
    : await resolveWslHomeDirectoryForBootstrap(distro, signal);
  if (!home) {
    throw new Error(`could not resolve $HOME inside WSL distro "${distro}"`);
  }

  const linuxRuntimeDir = `${home}/.poracode/runtime`;
  const versionedDirName = nodeArchiveDirName(target);
  const linuxVersionedDir = `${linuxRuntimeDir}/${versionedDirName}`;
  const identity: ManagedRuntimeIdentity = {
    distro,
    target,
    linuxNodePath: `${linuxVersionedDir}/bin/node`,
    linuxMarkerPath: `${linuxVersionedDir}/${MANAGED_RUNTIME_MARKER_FILE}`,
    uncNodePath: toWslUncPath(distro, `${linuxVersionedDir}/bin/node`),
    uncMarkerPath: toWslUncPath(distro, `${linuxVersionedDir}/${MANAGED_RUNTIME_MARKER_FILE}`),
  };

  if (await managedRuntimeIsUsable(staging, identity, { useBridge, signal })) {
    return { nodePath: identity.linuxNodePath };
  }

  const tarballName = nodeArchiveFileName(target);
  const url = nodeArchiveUrl(target);

  options?.onProgress?.({ kind: "download-start", url, target });
  const tmpTarball = join(tmpdir(), `poracode-node-${Date.now()}-${randomUUID()}-${tarballName}`);
  try {
    await downloadToFile(url, tmpTarball, {
      ...(signal ? { signal } : {}),
      ...(options?.onProgress
        ? {
            onProgress: ({ bytesReceived, bytesTotal }) =>
              options.onProgress?.({
                kind: "download-progress",
                bytesReceived,
                bytesTotal,
              }),
          }
        : {}),
    });
    options?.onProgress?.({ kind: "verify-start" });
    await verifySha256(tmpTarball, checksum);

    // Stage the tarball into the distro via UNC, then ask the distro's
    // own tar to extract it (saves marshalling bytes back through wsl.exe
    // stdin and lets us use tar's xz/strip-components flags directly).
    // The staged name is unique per attempt so a successor (or a reader from
    // an unconfirmed exit) can never collide with this attempt's input, and
    // it stays out of the `node-v*` runtime-prune namespace.
    const stagedLinuxPath = `${linuxRuntimeDir}/.poracode-stage-${Date.now()}-${randomUUID()}-${tarballName}`;
    const stagedUncPath = toWslUncPath(distro, stagedLinuxPath);
    await staging.stageFile(
      distro,
      { src: tmpTarball, dest: stagedUncPath },
      signalOptions(signal),
    );

    // Invalidate any previous completion proof before writing into the shared
    // versioned dir: a crash mid-extraction must never leave a marker that
    // certifies a partial tree.
    await staging.remove(distro, identity.uncMarkerPath, signalOptions(signal));

    options?.onProgress?.({ kind: "extract-start" });
    let exitUnconfirmed = false;
    try {
      if (useBridge) {
        // The bridge bounds the extraction and kills the in-distro process tree
        // on timeout, resolving only after the child exits.
        await execInWsl(distro, "/", "tar", ["-xJf", stagedLinuxPath, "-C", linuxRuntimeDir], {
          timeout: 60_000,
        });
      } else {
        // Bootstrap path (no bridge yet): the host owns the deadline, kills the
        // wsl.exe/tar process tree, joins it before returning, and honors
        // caller cancellation with the same terminate-and-join sequence.
        await spawnAndAwaitExit(
          getWslCommand(),
          ["-d", distro, "--", "tar", "-xJf", stagedLinuxPath, "-C", linuxRuntimeDir],
          {
            timeoutMs: 60_000,
            label: `tar extraction in ${distro}`,
            ...(signal ? { signal } : {}),
          },
        );
      }
    } catch (error) {
      exitUnconfirmed = exitCouldNotBeConfirmed(error);
      throw error;
    } finally {
      // Only free the staged input once the extraction process is known gone;
      // an unconfirmed exit may still be reading it.
      if (!exitUnconfirmed) await removeStagedQuietly(staging, distro, stagedUncPath);
    }

    // The extraction command exited and its process was joined. Publish the
    // completed tree (no flight signal: work already paid for must survive a
    // caller that left mid-extraction), then re-verify the proof on disk.
    await publishManagedRuntimeMarker(staging, identity);
    if (!(await managedRuntimeIsComplete(staging, identity, undefined))) {
      throw new Error(
        `Node binary not found at expected path after extraction: ${identity.linuxNodePath}`,
      );
    }
    await staging.pruneRuntimeDirs(distro, toWslUncPath(distro, linuxRuntimeDir), versionedDirName);
    return { nodePath: identity.linuxNodePath };
  } finally {
    safeRm(tmpTarball);
  }
}

/**
 * `spawnAndAwaitExit` rejects with this phrase when SIGKILL could not be
 * reaped (see runtime/spawn.ts). Custody is unproven then, so neither the
 * runtime dir nor the staged input may be touched.
 */
function exitCouldNotBeConfirmed(error: unknown): boolean {
  return error instanceof Error && error.message.includes("could not be confirmed exited");
}

/** Best-effort removal of this attempt's unique staged input, without the flight signal. */
async function removeStagedQuietly(
  staging: WslStagingService,
  distro: string,
  stagedUncPath: string,
): Promise<void> {
  try {
    await staging.remove(distro, stagedUncPath);
  } catch {
    // Advisory cleanup; a leftover unique stage name is harmless.
  }
}

function signalOptions(signal: AbortSignal | undefined): { signal?: AbortSignal } | undefined {
  return signal ? { signal } : undefined;
}
