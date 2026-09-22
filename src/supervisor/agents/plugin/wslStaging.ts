import { toWslUncPath } from "@/shared/wsl";
import { getWslStagingService } from "../../wsl/staging";
import type { WslStagingService } from "../../wsl/staging/service";

/**
 * Async WSL file IO for plugin installers. Provider install code operates on
 * documents that live inside the distro (settings.json, hooks.json, plugin
 * assets dropped next to the agent config). Every verb here runs in the
 * per-distro staging worker, so a stalled UNC share can never pin the
 * supervisor control loop while an install merges or writes a document.
 */

export interface WslFileIoOptions {
  /** Test seam: replace the shared staging service. */
  staging?: WslStagingService;
  signal?: AbortSignal;
  /** POSIX permission bits for {@link writeWslTextFile} / {@link ensureWslDirectory}. */
  mode?: number;
}

function stagingFor(options?: WslFileIoOptions): WslStagingService {
  return options?.staging ?? getWslStagingService();
}

function callOptions(
  options?: WslFileIoOptions,
): { signal?: AbortSignal; mode?: number } | undefined {
  if (!options || (!options.signal && options.mode === undefined)) return undefined;
  return {
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.mode !== undefined ? { mode: options.mode } : {}),
  };
}

/** Read a UTF-8 text file inside the distro; `null` when it does not exist. */
export function readWslTextFile(
  distro: string,
  linuxPath: string,
  options?: WslFileIoOptions,
): Promise<string | null> {
  return stagingFor(options).readTextFile(
    distro,
    toWslUncPath(distro, linuxPath),
    callOptions(options),
  );
}

/** Atomically write a UTF-8 text file inside the distro. */
export function writeWslTextFile(
  distro: string,
  linuxPath: string,
  content: string,
  options?: WslFileIoOptions,
): Promise<void> {
  return stagingFor(options).writeTextFile(
    distro,
    toWslUncPath(distro, linuxPath),
    content,
    callOptions(options),
  );
}

export async function wslPathExists(
  distro: string,
  linuxPath: string,
  options?: WslFileIoOptions,
): Promise<boolean> {
  return stagingFor(options).pathExists(
    distro,
    toWslUncPath(distro, linuxPath),
    callOptions(options),
  );
}

/** List one directory level inside the distro through the staging worker. */
export async function readWslDirectory(
  distro: string,
  linuxDir: string,
  options?: WslFileIoOptions,
): Promise<{ name: string; directory: boolean }[]> {
  const result = await stagingFor(options).readDirectory(
    distro,
    toWslUncPath(distro, linuxDir),
    callOptions(options),
  );
  return result.entries;
}

export async function ensureWslDirectory(
  distro: string,
  linuxDir: string,
  options?: WslFileIoOptions,
): Promise<void> {
  await stagingFor(options).mkdirp(distro, toWslUncPath(distro, linuxDir), callOptions(options));
}

/** Copy one in-distro path to another through the staging worker. */
export async function copyWslFile(
  distro: string,
  sourceLinuxPath: string,
  destLinuxPath: string,
  options?: WslFileIoOptions,
): Promise<void> {
  await stagingFor(options).stageFile(
    distro,
    { src: toWslUncPath(distro, sourceLinuxPath), dest: toWslUncPath(distro, destLinuxPath) },
    callOptions(options),
  );
}

/** Recursively remove a path inside the distro; failures are advisory. */
export async function removeWslPath(
  distro: string,
  linuxPath: string,
  options?: WslFileIoOptions,
): Promise<void> {
  try {
    await stagingFor(options).remove(distro, toWslUncPath(distro, linuxPath), callOptions(options));
  } catch {
    // Cleanup is best effort.
  }
}

/** Resolve the distro's home directory (cached, or probed through the worker). */
export async function resolveWslHomePath(
  distro: string,
  options?: WslFileIoOptions,
): Promise<string | undefined> {
  return stagingFor(options).resolveHome(distro, callOptions(options));
}
