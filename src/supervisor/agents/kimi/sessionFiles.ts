import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ProjectLocation, SessionRef } from "@/shared/contracts";
import {
  batchWslCommandsAsync,
  createKnownSessionRef,
  getCachedWslHomeDirectory,
  listSessionDir,
  readSessionFileText,
  statSessionPaths,
  watchSessionPaths,
} from "../base";
import { nativeKimiHomePath } from "./detection";

// Honor the KIMI_CODE_HOME override the CLI supports (default ~/.kimi-code).
// Sessions live under $KIMI_CODE_HOME/sessions/<workDirKey>/<sessionId>/. The
// workDirKey encoding is opaque, so discovery scans every <workDirKey> dir.
function getNativeKimiSessionsRoot(): string {
  return join(nativeKimiHomePath(), "sessions");
}

// WSL: resolve the effective Kimi home inside the distro, honoring a
// profile-set KIMI_CODE_HOME just like the native branch honors the host env.
// The env var lives inside the distro, not the Windows process, so it must be
// expanded there. `batchWslCommandsAsync` runs `sh -lc` with the login env, so
// a KIMI_CODE_HOME exported from the user's profile is honored; otherwise it
// falls back to ~/.kimi-code. Cached per distro (like getCachedWslHomeDirectory)
// so repeated discovery/watch calls don't re-query.
const wslKimiHomeCache = new Map<string, string>();

async function resolveWslKimiHomeAsync(distro: string): Promise<string | null> {
  const cached = wslKimiHomeCache.get(distro);
  if (cached) return cached;
  const [r] = await batchWslCommandsAsync(distro, [
    'printf %s "${KIMI_CODE_HOME:-$HOME/.kimi-code}"',
  ]);
  const home = r?.ok ? r.stdout.trim() : "";
  if (!home) return null;
  wslKimiHomeCache.set(distro, home);
  return home;
}

// Synchronous best-effort resolution for the watch-path builder: the resolved
// override once it has been cached by discovery, otherwise the default
// ~/.kimi-code built from the shared WSL home cache (primed during detection).
// Discovery itself always uses the async form so the override is honored.
function getSyncWslKimiHome(distro: string): string | null {
  const cached = wslKimiHomeCache.get(distro);
  if (cached) return cached;
  const home = getCachedWslHomeDirectory(distro);
  return home ? `${home}/.kimi-code` : null;
}

function getKimiSessionsRoot(location: ProjectLocation): string | null {
  if (location.kind === "wsl") {
    const home = getSyncWslKimiHome(location.distro);
    return home ? `${home}/sessions` : null;
  }
  return getNativeKimiSessionsRoot();
}

function getKimiHome(location: ProjectLocation): string | null {
  if (location.kind === "wsl") return getSyncWslKimiHome(location.distro);
  return nativeKimiHomePath();
}

async function getKimiSessionsRootAsync(location: ProjectLocation): Promise<string | null> {
  if (location.kind !== "wsl") return getKimiSessionsRoot(location);
  const home = await resolveWslKimiHomeAsync(location.distro);
  return home ? `${home}/sessions` : null;
}

function cwdOf(location: ProjectLocation): string {
  return location.kind === "wsl" ? location.linuxPath : location.path;
}

// Per-launch snapshots of the session ids that existed right before we spawned
// a PTY for a fresh Kimi launch, keyed by the launching thread's cwd. Kimi mints
// its own opaque session id, so discoverSessionRef identifies the *new* dir as
// the one absent from this set. Scoping per cwd (rather than a single global
// Set) keeps two concurrent launches from clobbering each other's snapshot.
const preSpawnSnapshots = new Map<string, Set<string>>();

/**
 * Record the session ids that already exist before spawning the Kimi PTY so
 * discovery can tell the brand-new one apart. Scoped to the launching cwd so a
 * concurrent launch (same or different project) never overwrites this snapshot.
 * Sync on native platforms only; WSL discovery runs entirely post-spawn through
 * the in-distro bridge, so the snapshot is left empty for WSL launches.
 */
export function snapshotKimiPreSpawnSessions(location: ProjectLocation): void {
  const cwdKey = cwdOf(location);
  const ids = new Set<string>();
  preSpawnSnapshots.set(cwdKey, ids);
  if (location.kind === "wsl") return;

  const root = getKimiSessionsRoot(location);
  if (!root || !existsSync(root)) return;

  try {
    for (const workDir of readdirSync(root, { withFileTypes: true })) {
      if (!workDir.isDirectory()) continue;
      try {
        for (const session of readdirSync(join(root, workDir.name), { withFileTypes: true })) {
          if (session.isDirectory()) ids.add(session.name);
        }
      } catch {
        // Best effort; a racing workdir removal is fine.
      }
    }
  } catch {
    // Best effort; discovery will still pick the newest dir if the snapshot fails.
  }
}

// Kimi records per-session metadata in <sessionDir>/state.json. When it carries
// a working-directory field we use it to bind an ambiguous discovery to the
// launch's cwd; the exact key isn't documented, so probe the common spellings.
const KIMI_STATE_CWD_KEYS = [
  "cwd",
  "workDir",
  "workingDir",
  "workingDirectory",
  "directory",
  "projectRoot",
  "root",
  "path",
] as const;

async function readKimiSessionCwd(
  location: ProjectLocation,
  sessionDir: string,
): Promise<string | undefined> {
  const raw = await readSessionFileText(location, `${sessionDir}/state.json`, 256_000);
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object") return undefined;
  const record = parsed as Record<string, unknown>;
  for (const key of KIMI_STATE_CWD_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return undefined;
}

function normalizePathForCompare(p: string, location: ProjectLocation): string {
  const trimmed = p.trim().replace(/[\\/]+$/, "");
  // Native Windows paths are case-insensitive and mix separators; WSL/posix
  // paths are case-sensitive with forward slashes.
  return location.kind === "windows" ? trimmed.replaceAll("\\", "/").toLowerCase() : trimmed;
}

/**
 * Return the Kimi session directory (its basename = the session id) that this
 * launch created. Candidates are the session dirs absent from the launch's
 * pre-spawn snapshot; the workDirKey encoding is undocumented, so discovery
 * scans across every <workDirKey> dir.
 *
 * When more than one new session appeared since the snapshot — e.g. a
 * concurrent launch in another project wrote its own session — we disambiguate
 * by the cwd recorded in each state.json and keep only the dirs matching this
 * launch's cwd, then rank by mtime. A single candidate is unambiguous, so we
 * skip the extra reads and take it directly.
 *
 * Native uses `readdirSync` + `statSync` via the shared helpers; WSL routes
 * through the in-distro bridge (`listSessionDir` + batched `statSessionPaths`).
 */
export async function discoverKimiSessionRef(
  location: ProjectLocation,
): Promise<SessionRef | undefined> {
  const root = await getKimiSessionsRootAsync(location);
  if (!root) return undefined;

  const cwdKey = cwdOf(location);
  const snapshot = preSpawnSnapshots.get(cwdKey) ?? new Set<string>();

  const workDirs = await listSessionDir(location, root);
  if (!workDirs) return undefined;

  const candidates = (
    await Promise.all(
      workDirs
        .filter((workDir) => workDir.type === "directory")
        .map(async (workDir) => {
          const workDirPath = `${root}/${workDir.name}`;
          const sessions = await listSessionDir(location, workDirPath);
          return (sessions ?? []).flatMap((session) =>
            session.type === "directory" && !snapshot.has(session.name)
              ? [{ id: session.name, path: `${workDirPath}/${session.name}` }]
              : [],
          );
        }),
    )
  ).flat();

  if (candidates.length === 0) return undefined;

  let pool = candidates;
  if (candidates.length > 1) {
    const wanted = normalizePathForCompare(cwdKey, location);
    const matching = (
      await Promise.all(
        candidates.map(async (candidate) => ({
          candidate,
          sessionCwd: await readKimiSessionCwd(location, candidate.path),
        })),
      )
    ).flatMap(({ candidate, sessionCwd }) =>
      sessionCwd && normalizePathForCompare(sessionCwd, location) === wanted ? [candidate] : [],
    );
    if (matching.length > 0) pool = matching;
  }

  const stats = await statSessionPaths(
    location,
    pool.map((c) => c.path),
  );
  const ranked = pool
    .map((c) => ({ id: c.id, mtime: stats.get(c.path)?.mtimeMs ?? 0 }))
    .sort((a, b) => b.mtime - a.mtime);

  const winner = ranked[0];
  if (!winner) return undefined;
  // Discovery bound a session to this launch — drop the now-stale snapshot so a
  // later launch for the same cwd starts from a clean baseline.
  preSpawnSnapshots.delete(cwdKey);
  return createKnownSessionRef(winner.id);
}

/** Resolve an ACP session id to Kimi's opaque workdir-scoped session path. */
export async function resolveKimiSessionDir(
  location: ProjectLocation,
  sessionId: string,
): Promise<string | undefined> {
  const root = await getKimiSessionsRootAsync(location);
  if (!root) return undefined;
  const workDirs = await listSessionDir(location, root);
  if (!workDirs) return undefined;
  for (const workDir of workDirs) {
    if (workDir.type !== "directory") continue;
    const workDirPath = `${root}/${workDir.name}`;
    const sessions = await listSessionDir(location, workDirPath);
    if (sessions?.some((session) => session.type === "directory" && session.name === sessionId)) {
      return `${workDirPath}/${sessionId}`;
    }
  }
  return undefined;
}

export function makeKimiDiscoverSessionRef() {
  return async (location: ProjectLocation): Promise<SessionRef | undefined> => {
    return discoverKimiSessionRef(location);
  };
}

/**
 * Absolute paths to watch for new/updated Kimi sessions. The sessions root is
 * watched recursively; the `.kimi-code` home is included as a fallback so the
 * first-ever session creation (which materializes the sessions dir) still wakes
 * the watcher. Missing paths are dropped by the shared watch helper, so a fresh
 * install (no `.kimi-code` yet) is handled without throwing.
 */
export function resolveKimiSessionsWatchPaths(location: ProjectLocation): string[] {
  const root = getKimiSessionsRoot(location);
  const home = getKimiHome(location);
  return [root ?? undefined, home ?? undefined].filter((p): p is string => Boolean(p));
}

export function makeKimiWatchSessionRef() {
  return (location: ProjectLocation, onChanged: () => void): (() => void) | undefined => {
    const paths = resolveKimiSessionsWatchPaths(location);
    if (paths.length === 0) return undefined;

    const label = `kimi:${location.kind === "wsl" ? "wsl:" + location.distro : location.kind}`;
    return watchSessionPaths(location, paths, onChanged, label);
  };
}
