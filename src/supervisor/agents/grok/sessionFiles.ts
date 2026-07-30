import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProjectLocation, SessionRef } from "@/shared/contracts";
import {
  createKnownSessionRef,
  getCachedWslHomeDirectory,
  listSessionDir,
  resolveWslHomeDirectoryAsync,
  statSessionPaths,
  watchSessionPaths,
} from "../base";
import type { GrokSessionArg } from "./argv";

// Honor the same GROK_HOME override the CLI (and grokCredentials.ts) support.
function getNativeGrokSessionsRoot(grokHomeOverride?: string): string {
  const grokHome = grokHomeOverride ?? process.env["GROK_HOME"];
  return join(
    grokHome && grokHome.trim().length > 0 ? grokHome : join(homedir(), ".grok"),
    "sessions",
  );
}

export interface GrokSessionTracker {
  preSpawnSessionIds: Set<string>;
  preSpawnCwdKey: string | null;
}

export function createGrokSessionTracker(): GrokSessionTracker {
  return { preSpawnSessionIds: new Set(), preSpawnCwdKey: null };
}

const defaultSessionTracker = createGrokSessionTracker();

function encodeCwdKey(cwd: string): string {
  // Grok stores sessions under ~/.grok/sessions/<percent-encoded-absolute-cwd>/
  return encodeURIComponent(cwd);
}

function getGrokCwdSessionsDir(
  location: ProjectLocation,
  cwd: string,
  grokHome?: string,
): string | null {
  if (location.kind === "wsl") {
    const root = grokHome ?? getCachedWslHomeDirectory(location.distro);
    if (!root) return null;
    return `${root}${grokHome ? "" : "/.grok"}/sessions/${encodeCwdKey(cwd)}`;
  }
  return join(getNativeGrokSessionsRoot(grokHome), encodeCwdKey(cwd));
}

async function getGrokCwdSessionsDirAsync(
  location: ProjectLocation,
  cwd: string,
  grokHome?: string,
): Promise<string | null> {
  if (location.kind !== "wsl" || grokHome) return getGrokCwdSessionsDir(location, cwd, grokHome);
  const home = await resolveWslHomeDirectoryAsync(location.distro);
  return home ? `${home}/.grok/sessions/${encodeCwdKey(cwd)}` : null;
}

function getGrokSessionsRoot(location: ProjectLocation, grokHome?: string): string | null {
  if (location.kind === "wsl") {
    if (grokHome) return `${grokHome}/sessions`;
    const home = getCachedWslHomeDirectory(location.distro);
    return home ? `${home}/.grok/sessions` : null;
  }
  return getNativeGrokSessionsRoot(grokHome);
}

/**
 * Call this from buildLaunchArgv (and optionally buildResumeArgv) immediately
 * before spawning the grok PTY. It records what sessions already exist for
 * this cwd so that discover can tell the brand-new one apart.
 *
 * Sync on native platforms only. WSL discovery uses the in-distro bridge
 * after launch instead of doing a direct pre-spawn query.
 */
export function snapshotGrokPreSpawnSessions(
  location: ProjectLocation,
  cwd: string,
  grokHome?: string,
  tracker: GrokSessionTracker = defaultSessionTracker,
): void {
  tracker.preSpawnSessionIds = new Set();
  tracker.preSpawnCwdKey = null;
  if (location.kind === "wsl") return;

  const dir = getGrokCwdSessionsDir(location, cwd, grokHome);
  if (!dir) return;

  if (!existsSync(dir)) return;
  tracker.preSpawnCwdKey = encodeCwdKey(cwd);

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && isUuid(entry.name)) {
        tracker.preSpawnSessionIds.add(entry.name);
      }
    }
  } catch {
    // Best effort; discovery will still be able to pick a recent dir.
  }
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/**
 * True when the session directory for <cwd>/<sessionId> exists on disk.
 *
 * grok 0.2.93 normally writes the session dir within ~1s of TUI boot
 * (verified live), but a UUID we pre-assigned with `-s` can still be missing
 * when the launch died at startup (spawn failure, immediate kill) or the TUI
 * deferred to its welcome/resume menu. Callers use this to decide between
 * `-r <id>` (resume a real session) and `-s <id>` (re-assign the same id —
 * `-s` requires the session to not exist and exits 1 on a collision, so the
 * choice must reflect live disk state, never a timing assumption).
 *
 * Returns `undefined` when the check is unavailable (WSL distro home not
 * cached / UNC bridge unreachable); callers should then default to resume.
 */
export function grokSessionDirMaterialized(
  location: ProjectLocation,
  cwd: string,
  sessionId: string,
  grokHome?: string,
): boolean | undefined {
  if (location.kind === "wsl") {
    const root = grokHome ?? getCachedWslHomeDirectory(location.distro);
    if (!root) return undefined;
    const linuxPath = `${root}${grokHome ? "" : "/.grok"}/sessions/${encodeCwdKey(cwd)}/${sessionId}`;
    const uncPath = `\\\\wsl.localhost\\${location.distro}${linuxPath.replaceAll("/", "\\")}`;
    try {
      return existsSync(uncPath);
    } catch {
      return undefined;
    }
  }
  const dir = getGrokCwdSessionsDir(location, cwd, grokHome);
  if (!dir) return undefined;
  return existsSync(join(dir, sessionId));
}

/**
 * Map a known provider session id to the right PTY session flag: `-r` when
 * the session has materialized, `-s` (re-assign) when it never did. When the
 * materialization check is unavailable we default to resume — wrongly
 * re-assigning an existing id makes grok exit 1, while wrongly resuming a
 * missing one is the same failure mode we had before `-s` existed.
 */
export function resolveGrokSessionArg(
  location: ProjectLocation,
  cwd: string,
  knownSessionId: string,
  grokHome?: string,
): GrokSessionArg {
  const materialized = grokSessionDirMaterialized(location, cwd, knownSessionId, grokHome);
  return materialized === false
    ? { kind: "new", sessionId: knownSessionId }
    : { kind: "resume", sessionId: knownSessionId };
}

/**
 * Return the most recently modified Grok session directory (its basename = the
 * session UUID) under the given location/cwd that was *not* present in the
 * pre-snapshot. Falls back to the absolute newest UUID dir if the pre-snapshot
 * is empty.
 *
 * Native uses `readdirSync` + `statSync`. WSL routes through the in-distro
 * bridge (`listSessionDir` + batched `statSessionPaths`) so each discovery
 * round-trip costs ~10ms (HTTP loopback) instead of ~100ms (`wsl.exe`).
 */
export async function discoverGrokSessionRef(
  location: ProjectLocation,
  cwd: string,
  grokHome?: string,
  tracker: GrokSessionTracker = defaultSessionTracker,
): Promise<SessionRef | undefined> {
  const dir = await getGrokCwdSessionsDirAsync(location, cwd, grokHome);
  if (!dir) return undefined;
  const key = encodeCwdKey(cwd);

  const entries = await listSessionDir(location, dir);
  if (!entries) return undefined;

  const candidateNames = entries
    .filter((e) => e.type === "directory" && isUuid(e.name))
    .map((e) => e.name)
    .filter((name) => !(tracker.preSpawnCwdKey === key && tracker.preSpawnSessionIds.has(name)));

  if (candidateNames.length === 0) return undefined;

  const paths = candidateNames.map((name) => `${dir}/${name}`);
  const stats = await statSessionPaths(location, paths);
  const ranked = candidateNames
    .map((name) => ({ id: name, mtime: stats.get(`${dir}/${name}`)?.mtimeMs ?? 0 }))
    .sort((a, b) => b.mtime - a.mtime);

  const winner = ranked[0];
  return winner ? createKnownSessionRef(winner.id) : undefined;
}

export function makeGrokDiscoverSessionRef(
  resolveGrokHome?: (location: ProjectLocation) => string | undefined,
  tracker: GrokSessionTracker = defaultSessionTracker,
) {
  return async (location: ProjectLocation): Promise<SessionRef | undefined> => {
    const cwd = location.kind === "wsl" ? location.linuxPath : location.path;
    return discoverGrokSessionRef(location, cwd, resolveGrokHome?.(location), tracker);
  };
}

/**
 * Absolute paths to watch for new/updated Grok sessions for this location/cwd.
 * Native paths for windows/posix; Linux paths inside the distro for WSL.
 * Prefers the specific <encoded-cwd> dir; falls back to the parent sessions
 * root when that subdir doesn't exist yet so the first session creation
 * still wakes the watcher.
 */
export function resolveGrokSessionsWatchPaths(
  location: ProjectLocation,
  cwd: string,
  grokHome?: string,
): string[] {
  const dir = getGrokCwdSessionsDir(location, cwd, grokHome);
  if (location.kind === "wsl") {
    const root = getGrokSessionsRoot(location, grokHome);
    return [dir ?? undefined, root ?? undefined].filter((p): p is string => Boolean(p));
  }
  if (dir && existsSync(dir)) return [dir];
  return [getNativeGrokSessionsRoot(grokHome)];
}

export function makeGrokWatchSessionRef(
  resolveGrokHome?: (location: ProjectLocation) => string | undefined,
) {
  return (location: ProjectLocation, onChanged: () => void): (() => void) | undefined => {
    const cwd = location.kind === "wsl" ? location.linuxPath : location.path;
    const paths = resolveGrokSessionsWatchPaths(location, cwd, resolveGrokHome?.(location));
    if (paths.length === 0) return undefined;

    const label = `grok:${location.kind === "wsl" ? "wsl:" + location.distro : location.kind}`;
    return watchSessionPaths(location, paths, onChanged, label);
  };
}
