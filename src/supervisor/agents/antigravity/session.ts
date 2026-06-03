import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProjectLocation } from "@/shared/contracts";
import {
  readSshCommandOutputSync,
  resolveAgentHomeSubpath,
  resolveSshHomeDirectory,
  resolveWslHomeDirectory,
  runSshScriptSync,
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
  if (!dir) return false;
  if (location.kind === "ssh") {
    const result = runSshScriptSync(location, `[ -d ${shellQuote(dir)} ]`, { timeout: 5_000 });
    return result.ok;
  }
  return existsSync(dir);
}

interface AntigravityConversationFile {
  id: string;
  path: string;
  mtimeMs: number;
}

// `agy` migrated its conversation store from protobuf `.pb` files to SQLite
// `.db` files; both forms may coexist. The `.db-wal`/`.db-shm` sidecars of an
// open database must be excluded — only the base file names a conversation.
const CONVERSATION_FILE_RE = /\.(pb|db)$/;

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function readAntigravityConversationFiles(
  location: ProjectLocation,
): AntigravityConversationFile[] {
  const dir = resolveAntigravityConversationsDir(location);
  if (!dir) return [];
  if (location.kind === "ssh") {
    const result = runSshScriptSync(
      location,
      [
        `dir=${shellQuote(dir)}`,
        `[ -d "$dir" ] || exit 0`,
        `find "$dir" -maxdepth 1 -type f -name '*.pb' 2>/dev/null | while IFS= read -r path; do`,
        `  mtime=$(stat -c %Y "$path" 2>/dev/null || stat -f %m "$path" 2>/dev/null || printf 0)`,
        `  printf '%s\\t%s\\n' "$mtime" "\${path##*/}"`,
        `done`,
      ].join("\n"),
      { timeout: 10_000 },
    );
    if (!result.ok) return [];
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        const [mtimeRaw, name] = line.split("\t");
        if (!name?.endsWith(".pb")) return [];
        return [
          {
            id: name.replace(/\.pb$/, ""),
            path: `${dir}/${name}`,
            mtimeMs: Number(mtimeRaw) * 1000,
          },
        ];
      });
  }
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((file) => CONVERSATION_FILE_RE.test(file))
      .map((file) => {
        const path = join(dir, file);
        return {
          id: file.replace(CONVERSATION_FILE_RE, ""),
          path,
          mtimeMs: statSync(path).mtimeMs,
        };
      });
  } catch {
    return [];
  }
}

export function readAntigravityConversationIds(location: ProjectLocation): Set<string> {
  return new Set(readAntigravityConversationFiles(location).map((file) => file.id));
}

/**
 * Extract the workspace directory a conversation was created in. `agy` stores
 * it as a `file://<cwd>` URI inside the SQLite db (trajectory_metadata_blob),
 * written when the conversation is created. Reading the raw bytes of the db
 * and its `-wal` sidecar (fresh writes may not be checkpointed yet) and
 * scanning for that URI avoids a SQLite dependency and any lock contention
 * with the live session.
 *
 * The URI is a length-delimited protobuf string, so the byte immediately
 * before `file://` is its length — matching that distinguishes the real
 * workspace field from a `file://` that merely appears in conversation text
 * (which is not framed that way). A path cannot contain protobuf tag bytes
 * (< 0x20), so each candidate URI is the printable-ASCII run from `file://`.
 */
function readAntigravityConversationWorkspace(dbPath: string): string | undefined {
  const prefixLen = "file://".length;
  for (const candidate of [dbPath, `${dbPath}-wal`]) {
    let buf: Buffer;
    try {
      buf = readFileSync(candidate);
    } catch {
      continue;
    }
    let fallback: string | undefined;
    for (
      let start = buf.indexOf("file://");
      start >= 0;
      start = buf.indexOf("file://", start + 1)
    ) {
      let end = start;
      while (end < buf.length && buf[end]! >= 0x20 && buf[end]! <= 0x7e) end += 1;
      const value = buf.toString("latin1", start + prefixLen, end);
      if (isFramedProtobufString(buf, start, end - start)) return value;
      fallback ??= value;
    }
    if (fallback !== undefined) return fallback;
  }
  return undefined;
}

/**
 * Whether the bytes at `start` begin a protobuf field-1 (tag 0x0A) string of
 * exactly `length` bytes — i.e. `0x0A <varint length> <string>`. Used to pin
 * the workspace URI field and reject a `file://` that merely appears inside
 * conversation text. Handles the 1- and 2-byte varint lengths that cover any
 * realistic path (< 16 KiB).
 */
function isFramedProtobufString(buf: Buffer, start: number, length: number): boolean {
  if (length < 0x80) {
    return start >= 2 && buf[start - 1] === length && buf[start - 2] === 0x0a;
  }
  if (length < 0x4000) {
    return (
      start >= 3 &&
      buf[start - 2] === ((length & 0x7f) | 0x80) &&
      buf[start - 1] === length >> 7 &&
      buf[start - 3] === 0x0a
    );
  }
  return false;
}

function normalizeWorkspacePath(value: string): string {
  // file URIs use forward slashes and prefix a Windows drive with a slash
  // (file:///C:/x → /C:/x). Drop that and unify separators so a db-stored
  // workspace compares equal to the launch cwd on every platform.
  return value
    .replace(/^\/(?=[A-Za-z]:)/, "")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
}

function workspaceMatchesCwd(workspace: string, cwd: string): boolean {
  const left = normalizeWorkspacePath(workspace);
  const right = normalizeWorkspacePath(cwd);
  // Windows drive paths are case-insensitive; posix/WSL paths are not.
  return /^[A-Za-z]:/.test(right) ? left.toLowerCase() === right.toLowerCase() : left === right;
}

/**
 * The newest conversation created since `previousIds` whose stored workspace
 * matches `cwd`. This is the live-session-safe discovery signal: the db (and
 * its workspace URI) exist as soon as the interactive session starts, while
 * one-shot calls (title/commit/PR) run in an isolated cwd and are excluded by
 * the workspace match. `last_conversations.json` cannot be used here — `agy`
 * only writes it on exit, so it is empty while the session is alive.
 */
export function readNewestAntigravityConversationForCwd(
  location: ProjectLocation,
  previousIds: ReadonlySet<string>,
  cwd: string,
): string | undefined {
  const fresh = readAntigravityConversationFiles(location)
    .filter((file) => !previousIds.has(file.id))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  for (const file of fresh) {
    const workspace = readAntigravityConversationWorkspace(file.path);
    if (workspace && workspaceMatchesCwd(workspace, cwd)) return file.id;
  }
  return undefined;
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
    const raw =
      location.kind === "ssh"
        ? readSshCommandOutputSync(location, "cat", [path], { timeout: 10_000 }).stdout
        : readFileSync(path, "utf8");
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
    const home = resolveWslHomeDirectory(location.distro);
    if (!home) return [];
    return [`${home}/${ANTIGRAVITY_CONFIG_SUBPATH}`, `${home}/${ANTIGRAVITY_PARENT_SUBPATH}`];
  }
  if (location.kind === "ssh") {
    const home = resolveSshHomeDirectory(location);
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
  if (location.kind === "ssh") return `ssh:${location.host}`;
  return location.kind === "wsl" ? `wsl:${location.distro}` : location.kind;
}
