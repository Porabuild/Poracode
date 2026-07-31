import { existsSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import slugify from "@sindresorhus/slugify";
import type { ProjectLocation, SessionRef } from "@/shared/contracts";
import {
  createKnownSessionRef,
  getCachedWslHomeDirectory,
  listSessionDir,
  resolveWslHomeDirectoryAsync,
  statSessionPaths,
  watchSessionPaths,
} from "../base";

/**
 * Hook-free session discovery for `command-code`, mirroring the grok/codex
 * adapters. `command-code` has no flag to pre-assign or report a session id,
 * but it writes per-cwd transcripts to
 * `~/.commandcode/projects/<sanitized-cwd>/<sessionId>.jsonl` (alongside
 * sidecars: `<id>.checkpoints.jsonl`, `<id>.meta.json`, `<id>.prompts.jsonl`,
 * `<id>.share.json`, and command-code's own `hooks-audit-<id>.jsonl`). We
 * snapshot the dir before launch, discover the brand-new transcript after, and
 * resume with `command-code --resume <sessionId>` — which loads that exact
 * session instead of `--continue`'s ambiguous "newest .jsonl in cwd" (the
 * latter happily loads a `hooks-audit-*.jsonl` sidecar, producing
 * "Session could not be loaded. N lines could not be parsed.").
 */

const CC_PROJECTS_SUBPATH = ".commandcode/projects";
const TRANSCRIPT_SUFFIX = ".jsonl";

function nativeProjectsRoot(): string {
  return join(homedir(), ".commandcode", "projects");
}

// Snapshot of the real transcript ids that existed for this cwd *before* the
// most recent launch, so discovery can tell the new session apart from older
// ones in the same dir. Module-level, mirroring grok/sessionFiles.ts.
let preSpawnIds = new Set<string>();
let preSpawnKey: string | null = null;

export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Return the real session id for a directory entry, or `undefined` for any
 * sidecar/garbage. A real transcript is `<uuid>.jsonl`; the UUID-basename test
 * is what rejects every sidecar (`.meta.json`/`.share.json` aren't `.jsonl`;
 * `<id>.checkpoints.jsonl`/`<id>.prompts.jsonl` have non-UUID basenames;
 * `hooks-audit-<id>.jsonl` is non-UUID and also guarded explicitly). Passing a
 * sidecar basename to `--resume` is the literal cause of the parse-error bug.
 */
export function commandCodeTranscriptId(name: string): string | undefined {
  if (!name.endsWith(TRANSCRIPT_SUFFIX)) return undefined;
  if (name.startsWith("hooks-audit-")) return undefined;
  if (name.endsWith(".checkpoints.jsonl")) return undefined;
  const id = name.slice(0, -TRANSCRIPT_SUFFIX.length);
  return isUuid(id) ? id : undefined;
}

/**
 * Reproduce Command Code v1.4.1's `cwd → projects/<dir>` mapping. The CLI uses
 * `@sindresorhus/slugify`; resolving symlinks first keeps macOS `/tmp` and
 * `/var` aligned with the physical cwd Node reports inside the spawned process.
 *   C:\Users\me\AppData\Local\cc     -> c-users-me-app-data-local-cc
 *   /private/var/folders/…/T/cc.x   -> private-var-folders-t-cc-x
 */
function commandCodeCwdSlug(cwd: string): string {
  let real = cwd;
  try {
    real = realpathSync.native(cwd);
  } catch {
    // A freshly created worktree dir may not be realpath-able yet; the raw
    // path is then the best key we have.
  }
  return slugify(real);
}

export function sanitizeCommandCodeCwd(cwd: string): string {
  return commandCodeCwdSlug(cwd) || "root";
}

/** Command Code omits the project slug segment for a root cwd's local MCP config. */
export function sanitizeCommandCodeMcpCwd(cwd: string): string {
  return commandCodeCwdSlug(cwd);
}

// Build the project dir from an ALREADY-sanitized cwd key, so callers sanitize
// (and pay `realpathSync`) exactly once per operation.
function projectDir(location: ProjectLocation, sanitizedCwd: string): string | null {
  if (location.kind === "wsl") {
    const home = getCachedWslHomeDirectory(location.distro);
    return home ? `${home}/${CC_PROJECTS_SUBPATH}/${sanitizedCwd}` : null;
  }
  return join(nativeProjectsRoot(), sanitizedCwd);
}

async function projectDirAsync(
  location: ProjectLocation,
  sanitizedCwd: string,
): Promise<string | null> {
  if (location.kind !== "wsl") return projectDir(location, sanitizedCwd);
  const home = await resolveWslHomeDirectoryAsync(location.distro);
  return home ? `${home}/${CC_PROJECTS_SUBPATH}/${sanitizedCwd}` : null;
}

function cwdFor(location: ProjectLocation): string {
  return location.kind === "wsl" ? location.linuxPath : location.path;
}

/**
 * Record the real transcript ids present for this cwd right before spawning so
 * discovery can ignore them and pick only the new session. Sync + native-only
 * (WSL discovery ranks purely by mtime, like grok).
 */
export function snapshotCommandCodePreSpawnSessions(location: ProjectLocation, cwd: string): void {
  preSpawnIds = new Set();
  preSpawnKey = sanitizeCommandCodeCwd(cwd);
  if (location.kind === "wsl") return;
  const dir = projectDir(location, preSpawnKey);
  if (!dir || !existsSync(dir)) return;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const id = commandCodeTranscriptId(entry.name);
      if (id) preSpawnIds.add(id);
    }
  } catch {
    // Best effort; discovery still ranks by mtime when the snapshot is empty.
  }
}

/**
 * Return the newest real transcript id for this cwd that was *not* present
 * before the launch. The `<uuid>.jsonl` name filter excludes every sidecar /
 * audit file, so the newest by mtime is this thread's session. Mirrors grok's
 * discoverGrokSessionRef.
 */
export async function discoverCommandCodeSessionRef(
  location: ProjectLocation,
  cwd: string,
): Promise<SessionRef | undefined> {
  const key = sanitizeCommandCodeCwd(cwd);
  const dir = await projectDirAsync(location, key);
  if (!dir) return undefined;

  const entries = await listSessionDir(location, dir);
  if (!entries) return undefined;

  const ids = entries
    .filter((e) => e.type === "file")
    .map((e) => commandCodeTranscriptId(e.name))
    .filter((id): id is string => Boolean(id))
    .filter((id) => !(preSpawnKey === key && preSpawnIds.has(id)));
  if (ids.length === 0) return undefined;

  const stats = await statSessionPaths(
    location,
    ids.map((id) => `${dir}/${id}${TRANSCRIPT_SUFFIX}`),
  );
  const winner = ids
    .map((id) => ({ id, mtime: stats.get(`${dir}/${id}${TRANSCRIPT_SUFFIX}`)?.mtimeMs ?? 0 }))
    .sort((a, b) => b.mtime - a.mtime)[0];

  return winner ? createKnownSessionRef(winner.id) : undefined;
}

export function makeCommandCodeDiscoverSessionRef() {
  return (location: ProjectLocation): Promise<SessionRef | undefined> =>
    discoverCommandCodeSessionRef(location, cwdFor(location));
}

export function makeCommandCodeWatchSessionRef() {
  return (location: ProjectLocation, onChanged: () => void): (() => void) | undefined => {
    const dir = projectDir(location, sanitizeCommandCodeCwd(cwdFor(location)));
    let paths: string[];
    if (location.kind === "wsl") {
      const home = getCachedWslHomeDirectory(location.distro);
      const root = home ? `${home}/${CC_PROJECTS_SUBPATH}` : null;
      paths = [dir, root].filter((p): p is string => Boolean(p));
    } else {
      // The per-cwd dir only appears once command-code writes the first
      // transcript (on the first message), so fall back to the projects root
      // to catch its creation.
      paths = dir && existsSync(dir) ? [dir] : [nativeProjectsRoot()];
    }
    if (paths.length === 0) return undefined;
    return watchSessionPaths(location, paths, onChanged, `commandcode:${location.kind}`);
  };
}
