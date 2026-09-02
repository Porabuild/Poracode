import { readdirSync, renameSync, rmSync } from "node:fs";
import { rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export const ACP_REGISTRY_INSTALL_DIR = "acp-registry";

/**
 * Generation of the extracted binary artifact's on-disk layout, recorded per
 * installation in `acpRegistryInstalledAgents[id].installations`. Bump it when
 * an already-extracted install can be present but no longer valid, and teach
 * `repairAcpRegistryInstallLayouts` how to bring the previous generation up.
 *
 * - (absent) — only the primary command was marked executable. Archives
 *   extracted from Windows into a WSL distro land with `0644`, so bundled
 *   helper binaries the server spawns failed with EACCES.
 * - 2 — every file under the install `bin/` dir is executable.
 */
export const ACP_REGISTRY_INSTALL_LAYOUT_VERSION = 2;

/** Marker prefix for install dirs that couldn't be unlinked yet. */
export const PENDING_DELETE_PREFIX = ".pending-delete-";

/**
 * Windows releases a handle on a just-exited process's executable a little
 * after the process is gone (and AV scanners can hold it longer), so a delete
 * that immediately follows the kill fails with EPERM. Retry across ~1s before
 * falling back to the rename path.
 */
const REMOVE_RETRY_DELAYS_MS = [0, 100, 250, 600];

/** Keeps parked directory names unique within a single supervisor process. */
let pendingDeleteSeq = 0;

export function acpRegistryInstallRoot(baseDir: string): string {
  return join(baseDir, ACP_REGISTRY_INSTALL_DIR);
}

export function acpRegistryAgentInstallDir(baseDir: string, agentId: string): string {
  return join(acpRegistryInstallRoot(baseDir), agentId);
}

/**
 * Remove an ACP registry install directory, tolerating a locked binary. Retries
 * a few times, then renames the directory out of the way — Windows allows
 * renaming a directory that still holds a running executable, so the install
 * path is freed immediately either way and the leftover is swept by
 * {@link pruneAcpRegistryPendingDeletes} on the next launch.
 *
 * Never throws: the caller has already dropped the agent from settings, so a
 * stubborn handle must not surface as a failed removal.
 */
export async function removeAcpRegistryInstallDir(installDir: string): Promise<void> {
  let lastError: unknown;
  for (const delay of REMOVE_RETRY_DELAYS_MS) {
    if (delay > 0) await sleep(delay);
    try {
      rmSync(installDir, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  const pendingDir = join(
    dirname(installDir),
    `${PENDING_DELETE_PREFIX}${basename(installDir)}-${process.pid}-${pendingDeleteSeq++}`,
  );
  try {
    renameSync(installDir, pendingDir);
  } catch (error) {
    console.warn(`[supervisor] could not remove ACP install dir ${installDir}:`, lastError, error);
    return;
  }
  try {
    rmSync(pendingDir, { recursive: true, force: true });
  } catch {
    // Still locked — swept on the next launch.
  }
}

/**
 * Parked dirs sit next to the directory they replaced. Agent removals park at
 * the registry root, but a binary (re)install parks its `bin` dir two levels
 * down, under `<root>/<agentId>/<version>/`, so the sweep must descend that far.
 */
const PENDING_DELETE_SCAN_DEPTH = 2;

/**
 * Delete leftovers parked by {@link removeAcpRegistryInstallDir} in an earlier
 * session, where the lock is guaranteed to be gone. Async so a multi-hundred-MB
 * sweep never stalls the supervisor at launch. Best-effort.
 */
export async function pruneAcpRegistryPendingDeletes(baseDir: string): Promise<void> {
  await sweepPendingDeletes(acpRegistryInstallRoot(baseDir), PENDING_DELETE_SCAN_DEPTH);
}

async function sweepPendingDeletes(dir: string, depth: number): Promise<void> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    // Missing root, or a file rather than a directory — nothing to sweep here.
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    if (entry.startsWith(PENDING_DELETE_PREFIX)) {
      try {
        await rm(path, { recursive: true, force: true });
      } catch {
        // Best-effort — retried on the next launch.
      }
      continue;
    }
    if (depth > 0) await sweepPendingDeletes(path, depth - 1);
  }
}
