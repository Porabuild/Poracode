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
function getNativeGrokSessionsRoot(): string {
  const grokHome = process.env["GROK_HOME"];
  return join(
    grokHome && grokHome.trim().length > 0 ? grokHome : join(homedir(), ".grok"),
    "sessions",
  );
}

// Module-level snapshot captured right before we spawn a PTY for a fresh Grok launch.
// This lets discoverSessionRef reliably identify the *new* session dir that Grok
// creates for this particular launch (instead of an older one for the same cwd).
let preSpawnSessionIds = new Set<string>();
let preSpawnCwdKey: string | null = null;

function encodeCwdKey(cwd: string): string {
  // Grok stores sessions under ~/.grok/sessions/<percent-encoded-absolute-cwd>/
  return encodeURIComponent(cwd);
}

function getGrokCwdSessionsDir(location: ProjectLocation, cwd: string): string | null {
  if (location.kind === "wsl") {
    const home = getCachedWslHomeDirectory(location.distro);
    if (!home) return null;
    return `${home}/.grok/sessions/${encodeCwdKey(cwd)}`;
  }
  return join(getNativeGrokSessionsRoot(), encodeCwdKey(cwd));
}

async function getGrokCwdSessionsDirAsync(
  location: ProjectLocation,
  cwd: string,
): Promise<string | null> {
  if (location.kind !== "wsl") return getGrokCwdSessionsDir(location, cwd);
  const home = await resolveWslHomeDirectoryAsync(location.distro);
  return home ? `${home}/.grok/sessions/${encodeCwdKey(cwd)}` : null;
}

function getGrokSessionsRoot(location: ProjectLocation): string | null {
  if (location.kind === "wsl") {
    const home = getCachedWslHomeDirectory(location.distro);
    return home ? `${home}/.grok/sessions` : null;
  }
  return getNativeGrokSessionsRoot();
}

function sessionExistsUnderAnyCwd(
  sessionsRoot: string,
  currentCwdKey: string,
  sessionId: string,
): boolean {
  if (existsSync(join(sessionsRoot, currentCwdKey, sessionId))) return true;
  if (!existsSync(sessionsRoot)) return false;

  for (const entry of readdirSync(sessionsRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && existsSync(join(sessionsRoot, entry.name, sessionId))) return true;
  }
  return false;
}

/**
 * Call this from buildLaunchArgv (and optionally buildResumeArgv) immediately
 * before spawning the grok PTY. It records what sessions already exist for
 * this cwd so that discover can tell the brand-new one apart.
 *
 * Sync on native platforms only. WSL discovery uses the in-distro bridge
 * after launch instead of doing a direct pre-spawn query.
 */
export function snapshotGrokPreSpawnSessions(location: ProjectLocation, cwd: string): void {
  preSpawnSessionIds = new Set();
  preSpawnCwdKey = null;
  if (location.kind === "wsl") return;

  const dir = getGrokCwdSessionsDir(location, cwd);
  if (!dir) return;

  if (!existsSync(dir)) return;
  preSpawnCwdKey = encodeCwdKey(cwd);

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && isUuid(entry.name)) {
        preSpawnSessionIds.add(entry.name);
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
 * True when the session directory exists anywhere in Grok's session store.
 *
 * grok 0.2.118 normally writes the session dir within ~1s of TUI boot
 * (verified live), but a UUID we pre-assigned with `-s` can still be missing
 * when the launch died at startup (spawn failure, immediate kill) or the TUI
 * deferred to its welcome/resume menu. Callers use this to decide between
 * `-r <id>` (resume a real session) and `-s <id>` (re-assign the same id —
 * `-s` requires the session to not exist and exits 1 on a collision, so the
 * choice must reflect live disk state, never a timing assumption). Searching
 * every cwd also preserves resume after a project folder moves, which Grok
 * supports by locating the original session independently of the current cwd.
 *
 * Returns `undefined` when the check is unavailable (WSL distro home not
 * cached / UNC bridge unreachable); callers should then default to resume.
 */
export function grokSessionDirMaterialized(
  location: ProjectLocation,
  cwd: string,
  sessionId: string,
): boolean | undefined {
  if (location.kind === "wsl") {
    const home = getCachedWslHomeDirectory(location.distro);
    if (!home) return undefined;
    const linuxRoot = `${home}/.grok/sessions`;
    const uncRoot = `\\\\wsl.localhost\\${location.distro}${linuxRoot.replaceAll("/", "\\")}`;
    try {
      return sessionExistsUnderAnyCwd(uncRoot, encodeCwdKey(cwd), sessionId);
    } catch {
      return undefined;
    }
  }
  try {
    return sessionExistsUnderAnyCwd(getNativeGrokSessionsRoot(), encodeCwdKey(cwd), sessionId);
  } catch {
    return undefined;
  }
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
): GrokSessionArg {
  const materialized = grokSessionDirMaterialized(location, cwd, knownSessionId);
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
): Promise<SessionRef | undefined> {
  const dir = await getGrokCwdSessionsDirAsync(location, cwd);
  if (!dir) return undefined;
  const key = encodeCwdKey(cwd);

  const entries = await listSessionDir(location, dir);
  if (!entries) return undefined;

  const candidateNames = entries
    .filter((e) => e.type === "directory" && isUuid(e.name))
    .map((e) => e.name)
    .filter((name) => !(preSpawnCwdKey === key && preSpawnSessionIds.has(name)));

  if (candidateNames.length === 0) return undefined;

  const paths = candidateNames.map((name) => `${dir}/${name}`);
  const stats = await statSessionPaths(location, paths);
  const ranked = candidateNames
    .map((name) => ({ id: name, mtime: stats.get(`${dir}/${name}`)?.mtimeMs ?? 0 }))
    .sort((a, b) => b.mtime - a.mtime);

  const winner = ranked[0];
  return winner ? createKnownSessionRef(winner.id) : undefined;
}

export function makeGrokDiscoverSessionRef() {
  return async (location: ProjectLocation): Promise<SessionRef | undefined> => {
    const cwd = location.kind === "wsl" ? location.linuxPath : location.path;
    return discoverGrokSessionRef(location, cwd);
  };
}

/**
 * Absolute paths to watch for new/updated Grok sessions for this location/cwd.
 * Native paths for windows/posix; Linux paths inside the distro for WSL.
 * Prefers the specific <encoded-cwd> dir; falls back to the parent sessions
 * root when that subdir doesn't exist yet so the first session creation
 * still wakes the watcher.
 */
export function resolveGrokSessionsWatchPaths(location: ProjectLocation, cwd: string): string[] {
  const dir = getGrokCwdSessionsDir(location, cwd);
  if (location.kind === "wsl") {
    const root = getGrokSessionsRoot(location);
    return [dir ?? undefined, root ?? undefined].filter((p): p is string => Boolean(p));
  }
  if (dir && existsSync(dir)) return [dir];
  return [getNativeGrokSessionsRoot()];
}

export function makeGrokWatchSessionRef() {
  return (location: ProjectLocation, onChanged: () => void): (() => void) | undefined => {
    const cwd = location.kind === "wsl" ? location.linuxPath : location.path;
    const paths = resolveGrokSessionsWatchPaths(location, cwd);
    if (paths.length === 0) return undefined;

    const label = `grok:${location.kind === "wsl" ? "wsl:" + location.distro : location.kind}`;
    return watchSessionPaths(location, paths, onChanged, label);
  };
}
