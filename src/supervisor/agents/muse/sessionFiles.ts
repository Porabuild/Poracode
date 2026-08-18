import { existsSync, readdirSync } from "node:fs";
import { join, posix } from "node:path";
import type { ProjectLocation, SessionRef } from "@/shared/contracts";
import {
  batchWslCommandsAsync,
  createKnownSessionRef,
  getCachedWslHomeDirectory,
  listSessionDir,
  readSessionFileText,
  resolveWslHomeDirectoryAsync,
  statSessionPaths,
  watchSessionPaths,
} from "../base";
import { nativeMuseDataHome, nativeMuseSessionsRoot } from "./paths";

/**
 * Muse session discovery. Interactive mode mints its own UUID — there is no
 * launch flag to pre-assign one. Sessions land at:
 *
 *   ${XDG_DATA_HOME:-~/.local/share}/muse/sessions/YYYY/MM/DD/<session-uuid>/
 *
 * (verified: e.g. sessions/2026/08/05/966713f1-794f-480e-aa37-713e8387fe8e).
 *
 * We snapshot every UUID dir under the sessions root before spawn, then
 * discover the brand-new dir after, returning the UUID as sessionRef so
 * resume can run `muse resume <uuid>`.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isMuseSessionUuid(name: string): boolean {
  return UUID_RE.test(name);
}

// Per-launch snapshots keyed by workspace. Muse stores every project in one
// date-sharded tree, so a process-global Set would let a launch in project B
// overwrite the baseline still needed to discover project A's new session.
const preSpawnSnapshots = new Map<string, Set<string>>();

function cwdOf(location: ProjectLocation): string {
  return location.kind === "wsl" ? location.linuxPath : location.path;
}

function snapshotKey(location: ProjectLocation): string {
  return location.kind === "wsl"
    ? `wsl:${location.distro}:${location.linuxPath}`
    : `${location.kind}:${location.path}`;
}

function getNativeSessionsRoot(): string {
  return nativeMuseSessionsRoot();
}

function getMuseDataHome(location: ProjectLocation): string | null {
  if (location.kind === "wsl") {
    const home = getCachedWslHomeDirectory(location.distro);
    // Best-effort default; discovery uses the async XDG-aware form.
    return home ? `${home}/.local/share/muse` : null;
  }
  return nativeMuseDataHome();
}

function getMuseSessionsRoot(location: ProjectLocation): string | null {
  const data = getMuseDataHome(location);
  return data ? `${data}/sessions` : null;
}

async function resolveWslMuseDataHomeAsync(distro: string): Promise<string | null> {
  const [r] = await batchWslCommandsAsync(distro, [
    'printf %s "${XDG_DATA_HOME:-$HOME/.local/share}/muse"',
  ]);
  const home = r?.ok ? r.stdout.trim() : "";
  if (home) return home;
  // Fall back to cached $HOME when the probe fails.
  const resolved = await resolveWslHomeDirectoryAsync(distro);
  return resolved ? `${resolved}/.local/share/muse` : null;
}

async function getMuseSessionsRootAsync(location: ProjectLocation): Promise<string | null> {
  if (location.kind !== "wsl") return getMuseSessionsRoot(location);
  const data = await resolveWslMuseDataHomeAsync(location.distro);
  return data ? `${data}/sessions` : null;
}

function joinMusePath(location: ProjectLocation, ...parts: string[]): string {
  return location.kind === "wsl" ? posix.join(...parts) : join(...parts);
}

/**
 * Recursively collect UUID session directory names under `root` (date-sharded
 * YYYY/MM/DD/<uuid>). Native-only sync walk used for the pre-spawn snapshot.
 */
function collectNativeSessionIds(root: string, into: Set<string>, depth = 0): void {
  if (depth > 4 || !existsSync(root)) return;
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (isMuseSessionUuid(entry.name)) {
        into.add(entry.name);
        continue;
      }
      // Date shards are digits-only (YYYY / MM / DD).
      if (/^\d{2,4}$/.test(entry.name)) {
        collectNativeSessionIds(join(root, entry.name), into, depth + 1);
      }
    }
  } catch {
    // Best effort.
  }
}

/**
 * Record existing Muse session UUIDs before spawning so discovery can ignore
 * them. Sync + native only; WSL discovery instead filters candidates by the
 * workspace metadata written into each session log.
 */
export function snapshotMusePreSpawnSessions(location: ProjectLocation): void {
  const ids = new Set<string>();
  preSpawnSnapshots.set(snapshotKey(location), ids);
  if (location.kind === "wsl") return;
  const root = getNativeSessionsRoot();
  collectNativeSessionIds(root, ids);
}

/**
 * Walk the date-sharded sessions tree via the shared listSessionDir helper
 * (native readdir / WSL bridge) and return every UUID dir path.
 */
async function listMuseSessionCandidates(
  location: ProjectLocation,
  root: string,
): Promise<Array<{ id: string; path: string }>> {
  const yearDirs = await listSessionDir(location, root);
  if (!yearDirs) return [];

  const candidates: Array<{ id: string; path: string }> = [];
  for (const year of yearDirs) {
    if (year.type !== "directory") continue;
    // Either a year (YYYY) or, defensively, a UUID at the root.
    if (isMuseSessionUuid(year.name)) {
      candidates.push({ id: year.name, path: joinMusePath(location, root, year.name) });
      continue;
    }
    if (!/^\d{4}$/.test(year.name)) continue;
    const yearPath = joinMusePath(location, root, year.name);
    const monthDirs = await listSessionDir(location, yearPath);
    if (!monthDirs) continue;
    for (const month of monthDirs) {
      if (month.type !== "directory" || !/^\d{2}$/.test(month.name)) continue;
      const monthPath = joinMusePath(location, yearPath, month.name);
      const dayDirs = await listSessionDir(location, monthPath);
      if (!dayDirs) continue;
      for (const day of dayDirs) {
        if (day.type !== "directory" || !/^\d{2}$/.test(day.name)) continue;
        const dayPath = joinMusePath(location, monthPath, day.name);
        const sessions = await listSessionDir(location, dayPath);
        if (!sessions) continue;
        for (const session of sessions) {
          if (session.type === "directory" && isMuseSessionUuid(session.name)) {
            candidates.push({
              id: session.name,
              path: joinMusePath(location, dayPath, session.name),
            });
          }
        }
      }
    }
  }
  return candidates;
}

function normalizePathForCompare(path: string, location: ProjectLocation): string {
  const trimmed = path.trim().replace(/[\\/]+$/, "");
  return location.kind === "windows" ? trimmed.replaceAll("\\", "/").toLowerCase() : trimmed;
}

/** Read the workspace root recorded near the start of Muse's session log. */
async function readMuseSessionWorkspace(
  location: ProjectLocation,
  sessionDir: string,
): Promise<string | undefined> {
  const raw = await readSessionFileText(
    location,
    joinMusePath(location, sessionDir, "session.jsonl"),
    512_000,
  );
  if (!raw) return undefined;
  for (const line of raw.split(/\r?\n/u)) {
    if (!line.includes('"runtime.session.metadata"')) continue;
    try {
      const parsed = JSON.parse(line) as {
        payload_type?: unknown;
        payload?: { record?: { workspace_root?: unknown } };
      };
      const workspace = parsed.payload?.record?.workspace_root;
      if (parsed.payload_type === "runtime.session.metadata" && typeof workspace === "string") {
        return workspace;
      }
    } catch {
      // Ignore an incomplete/racing JSONL line and wait for the next watcher tick.
    }
  }
  return undefined;
}

/**
 * Return the newest Muse session UUID that was not present in this workspace's
 * pre-spawn snapshot and whose recorded workspace matches the launch location.
 */
export async function discoverMuseSessionRef(
  location: ProjectLocation,
): Promise<SessionRef | undefined> {
  const root = await getMuseSessionsRootAsync(location);
  if (!root) return undefined;

  const all = await listMuseSessionCandidates(location, root);
  const key = snapshotKey(location);
  const snapshot = preSpawnSnapshots.get(key) ?? new Set<string>();
  const candidates = all.filter((candidate) => !snapshot.has(candidate.id));
  if (candidates.length === 0) return undefined;

  const wanted = normalizePathForCompare(cwdOf(location), location);
  const pool = (
    await Promise.all(
      candidates.map(async (candidate) => ({
        candidate,
        workspace: await readMuseSessionWorkspace(location, candidate.path),
      })),
    )
  ).flatMap(({ candidate, workspace }) =>
    workspace && normalizePathForCompare(workspace, location) === wanted ? [candidate] : [],
  );
  // The directory can appear before its metadata record is flushed. Returning
  // undefined lets the existing watcher retry instead of binding another
  // project's newest session.
  if (pool.length === 0) return undefined;

  const stats = await statSessionPaths(
    location,
    pool.map((c) => c.path),
  );
  const ranked = pool
    .map((c) => ({ id: c.id, mtime: stats.get(c.path)?.mtimeMs ?? 0 }))
    .sort((a, b) => b.mtime - a.mtime);

  const winner = ranked[0];
  if (!winner) return undefined;
  preSpawnSnapshots.delete(key);
  return createKnownSessionRef(winner.id);
}

export function makeMuseDiscoverSessionRef() {
  return (location: ProjectLocation): Promise<SessionRef | undefined> =>
    discoverMuseSessionRef(location);
}

/**
 * Absolute paths to watch for new Muse sessions. Prefer the sessions root;
 * include the data home so the first-ever session (which materializes
 * sessions/) still wakes the watcher.
 */
export function resolveMuseSessionsWatchPaths(location: ProjectLocation): string[] {
  const root = getMuseSessionsRoot(location);
  const data = getMuseDataHome(location);
  return [root ?? undefined, data ?? undefined].filter((p): p is string => Boolean(p));
}

export function makeMuseWatchSessionRef() {
  return (location: ProjectLocation, onChanged: () => void): (() => void) | undefined => {
    const paths = resolveMuseSessionsWatchPaths(location);
    if (paths.length === 0) return undefined;
    const label = `muse:${location.kind === "wsl" ? "wsl:" + location.distro : location.kind}`;
    return watchSessionPaths(location, paths, onChanged, label);
  };
}
