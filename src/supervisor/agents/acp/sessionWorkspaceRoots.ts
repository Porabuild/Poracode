import { stat } from "node:fs/promises";
import { posix, win32 } from "node:path";
import type { SessionCapabilities } from "@agentclientprotocol/sdk";
import { projectLocationSchema, type ProjectLocation } from "@/shared/contracts";
import {
  MAX_WORKSPACE_DIRECTORY_ENTRIES,
  MAX_WORKSPACE_DIRECTORY_SERIALIZED_CHARS,
  MAX_WORKSPACE_EXECUTION_PATH_CHARS,
} from "@/shared/workspaceDirectorySelection";
import { parseWslUncPath, toWslUncPath, wslLinuxToHostFsPath } from "@/shared/wsl";

// Bounds apply before deduplication, so duplicate or malformed input cannot
// turn validation into an unbounded operation. These are host policy limits.
export const ACP_ADDITIONAL_ROOT_LIMITS = Object.freeze({
  count: MAX_WORKSPACE_DIRECTORY_ENTRIES,
  path: MAX_WORKSPACE_EXECUTION_PATH_CHARS,
  total: MAX_WORKSPACE_DIRECTORY_SERIALIZED_CHARS,
});

function rootPath(location: ProjectLocation): string {
  return location.kind === "wsl" ? location.linuxPath : location.path;
}

function normalizeLocation(location: ProjectLocation): ProjectLocation {
  const raw = rootPath(location);
  if (
    raw.length > ACP_ADDITIONAL_ROOT_LIMITS.path ||
    Array.from(raw).some((char) => char.charCodeAt(0) < 32)
  ) {
    throw new Error("Invalid ACP workspace directory path.");
  }
  const paths = location.kind === "windows" ? win32 : posix;
  if (
    !paths.isAbsolute(raw) ||
    (location.kind === "windows" &&
      (!/^(?:[A-Za-z]:[\\/]|\\\\[^\\/?.][^\\/]*[\\/][^\\/]+)/u.test(raw) ||
        parseWslUncPath(raw) !== null))
  ) {
    throw new Error(
      "ACP workspace directories must be absolute paths in the execution environment.",
    );
  }
  const normalized = paths.normalize(raw);
  const path =
    normalized.length > paths.parse(normalized).root.length
      ? normalized.replace(location.kind === "windows" ? /[\\/]+$/u : /\/+$/u, "")
      : normalized;
  if (location.kind !== "wsl") return { ...location, path };
  const unc = parseWslUncPath(location.uncPath);
  if (
    !unc ||
    unc.distro !== location.distro ||
    posix.normalize(unc.linuxPath) !== posix.normalize(raw)
  ) {
    throw new Error("ACP workspace directory has inconsistent WSL host mapping.");
  }
  return { ...location, linuxPath: path, uncPath: toWslUncPath(location.distro, path) };
}

/** Snapshot only user-approved locations. Native notifications never feed this list.
 * Scope is immutable for the runtime lifetime; mutations require idle teardown/reopen.
 */
export function snapshotAcpAdditionalDirectories(
  primary: ProjectLocation,
  requested: readonly ProjectLocation[] = [],
): readonly ProjectLocation[] {
  if (!Array.isArray(requested) || requested.length > ACP_ADDITIONAL_ROOT_LIMITS.count) {
    throw new Error("Too many ACP workspace directories.");
  }
  if (requested.length === 0) return Object.freeze([]);
  const normalizedPrimary = normalizeLocation(projectLocationSchema.parse(primary));
  const key = (location: ProjectLocation): string =>
    location.kind === "windows" ? rootPath(location).toLowerCase() : rootPath(location);
  const seen = new Set([key(normalizedPrimary)]);
  const result: ProjectLocation[] = [];
  let total = 0;
  for (const entry of requested) {
    const parsed = projectLocationSchema.parse(entry);
    // Include metadata/UNC copies in the input budget, not only the wire path.
    total += JSON.stringify(parsed).length;
    if (total > ACP_ADDITIONAL_ROOT_LIMITS.total)
      throw new Error("ACP workspace directory input is too large.");
    if (
      parsed.kind !== primary.kind ||
      parsed.remoteServerId !== primary.remoteServerId ||
      (parsed.kind === "wsl" && primary.kind === "wsl" && parsed.distro !== primary.distro)
    ) {
      throw new Error(
        "ACP workspace directories must share the primary execution host and environment.",
      );
    }
    const location = normalizeLocation(parsed);
    const id = key(location);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(Object.freeze(location));
  }
  return Object.freeze(result);
}

/** Validate on the owning supervisor's filesystem, using established WSL mappings. */
export async function validateAcpAdditionalDirectories(
  roots: readonly ProjectLocation[],
): Promise<void> {
  for (const root of roots) {
    const hostPath =
      root.kind === "wsl" ? wslLinuxToHostFsPath(root.distro, root.linuxPath) : root.path;
    if (!(await stat(hostPath)).isDirectory())
      throw new Error("ACP workspace root is not a directory.");
  }
}

/** ACP v1 defines omitted and [] identically: no extras, including on load/resume.
 * Omit for legacy peers with no capability. Never fall back for a nonempty grant.
 */
export function acpAdditionalDirectoriesParams(
  roots: readonly ProjectLocation[],
  capabilities: SessionCapabilities | undefined,
): { additionalDirectories?: string[] } {
  if (roots.length === 0) return {};
  if (capabilities?.additionalDirectories == null) {
    throw new Error("ACP agent does not support approved additional workspace directories.");
  }
  return { additionalDirectories: roots.map(rootPath) };
}
