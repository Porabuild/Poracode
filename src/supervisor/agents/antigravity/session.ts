import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProjectLocation } from "@/shared/contracts";
import {
  getCachedWslHomeDirectory,
  listSessionDir,
  readSessionFileText,
  resolveAgentHomeSubpath,
  resolveWslHomeDirectoryAsync,
  statSessionPaths,
} from "../base";

const INVALID_SESSION_RE = /not\s+found|invalid\s+conversation|no\s+such\s+conversation/i;

export function detectAntigravityInvalidSessionRef(output: string): boolean {
  return INVALID_SESSION_RE.test(output);
}

export const ANTIGRAVITY_CONFIG_SUBPATH = ".gemini/antigravity-cli";
const ANTIGRAVITY_PARENT_SUBPATH = ".gemini";
const CONVERSATIONS_SUBPATH = `${ANTIGRAVITY_CONFIG_SUBPATH}/conversations`;
const LAST_CONVERSATIONS_SUBPATH = `${ANTIGRAVITY_CONFIG_SUBPATH}/cache/last_conversations.json`;

export function resolveAntigravityConversationsDir(location: ProjectLocation): string | undefined {
  return resolveAgentHomeSubpath(location, CONVERSATIONS_SUBPATH);
}

export function resolveAntigravityConfigDir(location: ProjectLocation): string | undefined {
  return resolveAgentHomeSubpath(location, ANTIGRAVITY_CONFIG_SUBPATH);
}

export function antigravityConfigDirExists(location: ProjectLocation): boolean {
  const dir = resolveAntigravityConfigDir(location);
  return Boolean(dir && existsSync(dir));
}

interface AntigravityConversationFile {
  id: string;
  mtimeMs: number;
}

function readAntigravityConversationFiles(
  location: ProjectLocation,
): AntigravityConversationFile[] {
  const dir = resolveAntigravityConversationsDir(location);
  if (!dir || !existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((file) => file.endsWith(".pb"))
      .map((file) => {
        const path = join(dir, file);
        return {
          id: file.replace(/\.pb$/, ""),
          mtimeMs: statSync(path).mtimeMs,
        };
      });
  } catch {
    return [];
  }
}

async function resolveAntigravityHomeSubpath(
  location: ProjectLocation,
  subpath: string,
): Promise<string | undefined> {
  if (location.kind !== "wsl") return resolveAgentHomeSubpath(location, subpath);
  const home = await resolveWslHomeDirectoryAsync(location.distro);
  if (!home) return undefined;
  return `${home}/${subpath.replace(/^[/\\]+/, "")}`;
}

async function readAntigravityConversationFilesAsync(
  location: ProjectLocation,
): Promise<AntigravityConversationFile[]> {
  if (location.kind !== "wsl") return readAntigravityConversationFiles(location);
  const dir = await resolveAntigravityHomeSubpath(location, CONVERSATIONS_SUBPATH);
  if (!dir) return [];
  const entries = await listSessionDir(location, dir);
  if (!entries) return [];
  const files = entries.filter((entry) => entry.type === "file" && entry.name.endsWith(".pb"));
  const paths = files.map((file) => `${dir}/${file.name}`);
  const stats = await statSessionPaths(location, paths);
  return files.map((file) => {
    const path = `${dir}/${file.name}`;
    return {
      id: file.name.replace(/\.pb$/, ""),
      mtimeMs: stats.get(path)?.mtimeMs ?? 0,
    };
  });
}

export function readAntigravityConversationIds(location: ProjectLocation): Set<string> {
  return new Set(readAntigravityConversationFiles(location).map((file) => file.id));
}

export function readNewestAntigravityConversationId(
  location: ProjectLocation,
  previousIds: ReadonlySet<string>,
): string | undefined {
  return readAntigravityConversationFiles(location)
    .filter((file) => !previousIds.has(file.id))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0]?.id;
}

export async function readNewestAntigravityConversationIdAsync(
  location: ProjectLocation,
  previousIds: ReadonlySet<string>,
  minMtimeMs = 0,
): Promise<string | undefined> {
  const files = await readAntigravityConversationFilesAsync(location);
  return files
    .filter((file) => !previousIds.has(file.id))
    .filter((file) => file.mtimeMs >= minMtimeMs)
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0]?.id;
}

// `agy` writes its workspace → most-recent conversation mapping here after
// each session. Keys are the exact working directory string passed to the
// CLI — Windows paths on native, posix paths in WSL.
export function readAntigravityLastConversationForCwd(
  location: ProjectLocation,
  cwd: string,
): string | undefined {
  const path = resolveAgentHomeSubpath(location, LAST_CONVERSATIONS_SUBPATH);
  if (!path) return undefined;
  try {
    const map = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const value = map[cwd];
    return typeof value === "string" && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function readAntigravityLastConversationForCwdAsync(
  location: ProjectLocation,
  cwd: string,
): Promise<string | undefined> {
  if (location.kind !== "wsl") return readAntigravityLastConversationForCwd(location, cwd);
  const path = await resolveAntigravityHomeSubpath(location, LAST_CONVERSATIONS_SUBPATH);
  if (!path) return undefined;
  try {
    const raw = await readSessionFileText(location, path);
    if (!raw) return undefined;
    const map = JSON.parse(raw) as Record<string, unknown>;
    const value = map[cwd];
    return typeof value === "string" && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

export function locationCwd(location: ProjectLocation): string {
  return location.kind === "wsl" ? location.linuxPath : location.path;
}

/**
 * Absolute paths to watch for new/changed `agy` conversations. Native paths
 * for windows/posix; Linux paths inside the distro for WSL (consumed by the
 * in-distro bridge watch subscription, NOT UNC `\\wsl.localhost\…`).
 *
 * Watching the config root catches both cache/last_conversations.json
 * writes (cwd → conversation map) and conversations/ writes (payloads).
 */
export function resolveAntigravityWatchPaths(location: ProjectLocation): string[] {
  if (location.kind === "wsl") {
    const home = getCachedWslHomeDirectory(location.distro);
    if (!home) return [];
    return [`${home}/${ANTIGRAVITY_CONFIG_SUBPATH}`, `${home}/${ANTIGRAVITY_PARENT_SUBPATH}`];
  }
  const home = homedir();
  const paths = [
    join(home, ...ANTIGRAVITY_CONFIG_SUBPATH.split("/")),
    join(home, ANTIGRAVITY_PARENT_SUBPATH),
  ];
  return paths.filter((p) => existsSync(p));
}

export function describeAntigravityLocation(location: ProjectLocation): string {
  return location.kind === "wsl" ? `wsl:${location.distro}` : location.kind;
}
