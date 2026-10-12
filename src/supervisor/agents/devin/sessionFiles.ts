import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  chmod,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { randomBytes } from "node:crypto";
import JSON5 from "json5";
import type { ProjectLocation, SessionRef } from "@/shared/contracts";
import { createKnownSessionRef, quotePosixShellArg, watchSessionPaths } from "../base";
import { withReadonlyDb } from "../../runtime/sqliteRead";
import { devinCredentialsPath } from "./credentials";

// Verified on 3000.10.21. Read identifiers only, never provider transcripts.
function defaultDatabasePath() {
  return join(dirname(devinCredentialsPath()), "cli", "sessions.db");
}

/**
 * One native session DB per account data root. Same-login profiles share the
 * default root; isolated accounts own theirs. WSL discovery remains
 * unsupported until a distro-side reader is qualified (reported limitation).
 */
function databasePathForScope(scope: string | undefined): string {
  if (!scope) return defaultDatabasePath();
  return join(scope, "cli", "sessions.db");
}

/**
 * Exact per-launch session identity (V3 / G07): the CLI's official SessionStart
 * hook (verified on 3000.11.3) fires BEFORE the first prompt and carries a
 * stable `session_id` on stdin. Each Terminal launch writes a private
 * per-launch config view (`--config`) that merges the effective user config
 * with one SessionStart hook appending the payload to a launch-unique record
 * file. Discovery then attributes the exact session id to this launch instead
 * of diffing the account's sessions.db — no global config is ever written and
 * no ACP process is involved in the PTY lane. When the record never appears
 * (hook unavailable, Windows shell semantics unverified, WSL) discovery falls
 * back to the snapshot diff unchanged.
 *
 * Record and launch-config files are Poracode-managed scratch under
 * `<XDG_DATA_HOME>/Poracode/devin-session-records/`: a private 0700 directory
 * holding 0600 files (the record is pre-created so the hook's shell redirect
 * cannot widen it to the process umask), garbage-collected (per-launch cleanup
 * plus a 24h sweep on prepare).
 */

/** A record above this size is not a hook payload; refuse to parse or retain it. */
const MAX_RECORD_BYTES = 64 * 1024;
/** A session id longer than this is not a native session id. */
const MAX_SESSION_ID_LENGTH = 256;

export function devinSessionRecordDir(): string {
  return join(
    process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
    "Poracode",
    "devin-session-records",
  );
}

/** The SessionStart hook entry for one launch: dump the stdin payload as-is. */
export function buildDevinSessionHookOverlay(recordPath: string): Record<string, unknown> {
  return {
    SessionStart: [
      {
        matcher: "",
        hooks: [
          {
            type: "command",
            // No parsing in the hook: the whole JSON payload lands in the
            // record file and Poracode reads `session_id` from it host-side.
            command: `cat > ${quotePosixShellArg(recordPath)} 2>/dev/null || true`,
            timeout: 5,
          },
        ],
      },
    ],
  };
}

/**
 * Merge the SessionStart hook into a copy of the session's effective user
 * config. Unknown keys survive (JSONC comments do not, matching the org-view
 * seed semantics); an existing `hooks.SessionStart` array keeps the user's
 * entries with ours appended, so the private view never disables them.
 *
 * Fail closed: a source config that exists but does not parse throws — the
 * private view must never silently replace the user's malformed-but-effective
 * policy with an empty `{}` config (the launch then keeps the snapshot-diff
 * discovery fallback instead of running a stripped session).
 */
export function mergeDevinSessionHookConfig(
  sourceRaw: string | undefined,
  recordPath: string,
): string {
  let config: Record<string, unknown> = {};
  if (sourceRaw?.trim()) {
    const parsed: unknown = JSON5.parse(sourceRaw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("The Devin user config is not a JSON object");
    }
    config = parsed as Record<string, unknown>;
  }
  const existingHooks =
    typeof config.hooks === "object" && config.hooks !== null && !Array.isArray(config.hooks)
      ? (config.hooks as Record<string, unknown>)
      : {};
  const existingSessionStart = Array.isArray(existingHooks.SessionStart)
    ? (existingHooks.SessionStart as unknown[])
    : [];
  const overlay = buildDevinSessionHookOverlay(recordPath);
  return JSON.stringify(
    {
      ...config,
      version: typeof config.version === "number" ? config.version : 1,
      hooks: {
        ...existingHooks,
        SessionStart: [...existingSessionStart, ...(overlay.SessionStart as unknown[])],
      },
    },
    null,
    2,
  );
}

/**
 * Parse a record file into the native session id. Bounded and strict: the read
 * is capped well below any real hook payload, an oversized record is refused
 * rather than truncated into a fake id, and only a non-empty in-bound string
 * under `session_id` is accepted. Absent, partial, or malformed records parse
 * as `undefined` (the discovery fallback applies).
 */
export async function readDevinSessionRecord(recordPath: string): Promise<string | undefined> {
  let raw: string | undefined;
  const handle = await open(recordPath, "r").catch(() => undefined);
  if (!handle) return undefined;
  try {
    const { size } = await handle.stat();
    if (size > MAX_RECORD_BYTES) return undefined;
    const buffer = Buffer.alloc(Math.min(size, MAX_RECORD_BYTES));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    raw = bytesRead > 0 ? buffer.toString("utf8", 0, bytesRead) : undefined;
  } catch {
    return undefined;
  } finally {
    await handle.close().catch(() => undefined);
  }
  if (raw === undefined) return undefined;
  try {
    const parsed = JSON.parse(raw) as { session_id?: unknown };
    const sessionId = parsed.session_id;
    if (typeof sessionId !== "string") return undefined;
    const trimmed = sessionId.trim();
    return trimmed && trimmed.length <= MAX_SESSION_ID_LENGTH ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

export interface DevinSessionRecordLaunch {
  /** Launch-unique file the SessionStart hook writes its payload to. */
  readonly recordPath: string;
  /** `--config <private view>` — replaces any other `--config` for this launch. */
  readonly prefixArgs: readonly string[];
  readonly cleanup: () => Promise<void>;
}

/**
 * Prepare the per-launch hook view for one Terminal launch. POSIX only today:
 * the hook command is a POSIX shell fragment, and Windows hook shell
 * semantics are unverified (not proven absent) — those platforms keep the
 * snapshot-diff fallback. Absence policy: ONLY ENOENT reads the source as
 * absent; an existing-but-unreadable source THROWS, as does one that does not
 * parse — the caller's catch then keeps the snapshot-diff fallback instead of
 * ever building the private view from a config Poracode could not snapshot
 * verbatim (a stripped `{}` view must never replace a real policy).
 */
export async function prepareDevinSessionRecordLaunch(
  sourceConfigPath: string | undefined,
  options?: { strictSource?: boolean | undefined },
): Promise<DevinSessionRecordLaunch | undefined> {
  if (process.platform === "win32") return undefined;
  const dir = devinSessionRecordDir();
  await mkdir(dir, { recursive: true, mode: 0o700 }).catch(() => undefined);
  await chmod(dir, 0o700).catch(() => undefined);
  await sweepStaleSessionRecords(dir);
  const sourceRaw = sourceConfigPath
    ? await readFile(sourceConfigPath, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined;
        throw error;
      })
    : undefined;
  if (sourceConfigPath !== undefined && sourceRaw === undefined && options?.strictSource) {
    return undefined;
  }
  const stamp = randomBytes(8).toString("hex");
  const recordPath = join(dir, `session-${stamp}.json`);
  const configPath = join(dir, `launch-${stamp}.config.json`);
  await mkdir(join(configPath, ".."), { recursive: true, mode: 0o700 });
  // The record is pre-created 0600: the hook writes through a shell redirect,
  // which keeps an existing file's mode instead of applying the hook process's
  // umask to a new one.
  await writeFile(recordPath, "", { mode: 0o600 });
  await chmod(recordPath, 0o600).catch(() => undefined);
  const temp = `${configPath}.tmp-${randomBytes(4).toString("hex")}`;
  // A source config that exists but does not parse throws here (fail closed):
  // the caller falls back to snapshot-diff discovery rather than launching
  // with a stripped-down private view.
  await writeFile(temp, mergeDevinSessionHookConfig(sourceRaw, recordPath), { mode: 0o600 });
  await rename(temp, configPath);
  return {
    recordPath,
    prefixArgs: ["--config", configPath],
    cleanup: async () => {
      await rm(configPath, { force: true }).catch(() => undefined);
      await rm(recordPath, { force: true }).catch(() => undefined);
    },
  };
}

async function sweepStaleSessionRecords(dir: string): Promise<void> {
  const entries = await readdir(dir).catch(() => []);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const name of entries) {
    if (!name.startsWith("session-") && !name.startsWith("launch-")) continue;
    const full = join(dir, name);
    const info = await stat(full).catch(() => undefined);
    if (info?.mtimeMs && info.mtimeMs < cutoff) await unlink(full).catch(() => undefined);
  }
}

/**
 * Snapshot-diff discovery state, shared MODULE-LEVEL and keyed by
 * `dataRoot\0cwd` so every Devin adapter instance (base plus profiles)
 * coordinates reservations on the same account root. Two concurrent launches
 * in one folder — or two profiles sharing one login — mark each other
 * ambiguous instead of racing the diff. A launch with its own session record
 * bypasses the ambiguity for itself: the hook-written id is exact.
 */
interface Pending {
  before?: Set<string>;
  ambiguous: boolean;
  count: number;
  recordPath?: string | undefined;
  ready: Promise<void>;
}
const pendingByScope = new Map<string, Map<string, Pending>>();

function scopeMap(scope: string | undefined): Map<string, Pending> {
  const key = scope ?? "";
  let map = pendingByScope.get(key);
  if (!map) {
    map = new Map();
    pendingByScope.set(key, map);
  }
  return map;
}

async function sessionIds(databasePath: string, location: ProjectLocation) {
  if (location.kind === "wsl") return undefined;
  if (!existsSync(databasePath)) return [];
  return withReadonlyDb(databasePath, (db) =>
    db
      .prepare("SELECT id FROM sessions WHERE working_directory = ?")
      .all(location.path)
      .flatMap((row) => {
        const id = (row as { id?: unknown }).id;
        return typeof id === "string" ? [id] : [];
      }),
  );
}

/**
 * The SessionStart hook fires shortly after spawn, while discovery may poll
 * earlier: retry briefly (a partial JSON read just parses as absent) before
 * falling back to the snapshot diff.
 */
async function readDevinSessionRecordWithRetry(recordPath: string): Promise<string | undefined> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const recorded = await readDevinSessionRecord(recordPath);
    if (recorded !== undefined) return recorded;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return undefined;
}

/**
 * Stale-resume detection (audit F4, live-captured on 3000.11.3): resuming a
 * session id the CLI cannot find prints
 * `No session found matching '<slug>'` on the TUI screen and then falls back
 * to a fresh session. Returning true lets the shared recovery coordinator
 * replace the dead ref instead of re-sending it on every launch — which is
 * also what keeps a thread from latching onto a foreign account after its
 * profile was reassigned (the id does not exist in the new account's db).
 */
const DEVIN_INVALID_SESSION_RE = /No session found matching/i;

export function detectDevinInvalidSessionRef(text: string): boolean {
  return DEVIN_INVALID_SESSION_RE.test(text);
}

export interface DevinDiscoveryScope {
  /** Absolute directory the account's `cli/sessions.db` lives under. */
  dataRoot?: string | undefined;
}

export function createDevinSessionDiscovery() {
  return {
    prepare(
      location: ProjectLocation,
      scope?: DevinDiscoveryScope | undefined,
      recordPath?: string | undefined,
    ) {
      if (location.kind === "wsl") return undefined;
      const map = scopeMap(scope?.dataRoot);
      const mapKey = location.path;
      let entry = map.get(mapKey);
      if (entry) {
        entry.ambiguous = true;
        entry.count += 1;
      } else {
        const created: Pending = {
          ambiguous: false,
          count: 1,
          ready: Promise.resolve(),
          ...(recordPath !== undefined ? { recordPath } : {}),
        };
        entry = created;
        map.set(mapKey, created);
        created.ready = sessionIds(databasePathForScope(scope?.dataRoot), location).then((ids) => {
          if (ids) created.before = new Set(ids);
        });
      }
      const captured = entry;
      let disposed = false;
      // Ride AgentArgvSpec.cleanup, including abort/spawn failures before the
      // session watcher attaches. A watcher alone cannot own this reservation.
      return () => {
        if (disposed) return;
        disposed = true;
        if (--captured.count === 0 && map.get(mapKey) === captured) map.delete(mapKey);
      };
    },
    async ready(location: ProjectLocation, scope?: DevinDiscoveryScope | undefined) {
      if (location.kind !== "wsl") await scopeMap(scope?.dataRoot).get(location.path)?.ready;
    },
    async discover(
      location: ProjectLocation,
      scope?: DevinDiscoveryScope | undefined,
    ): Promise<SessionRef | undefined> {
      if (location.kind === "wsl") return undefined;
      const map = scopeMap(scope?.dataRoot);
      const entry = map.get(location.path);
      if (!entry) return undefined;
      // Exact attribution first: this launch's own SessionStart hook writes
      // the stable session id before the first prompt (verified 3000.11.3).
      // The record is launch-unique, so it disambiguates even overlapping
      // same-cwd launches that fall back to the diff.
      if (entry.recordPath !== undefined) {
        const recorded = await readDevinSessionRecordWithRetry(entry.recordPath);
        if (recorded !== undefined) {
          await unlink(entry.recordPath).catch(() => undefined);
          if (map.get(location.path) === entry) map.delete(location.path);
          return createKnownSessionRef(recorded);
        }
      }
      if (!entry.before || entry.ambiguous) return undefined;
      const candidates = (
        await sessionIds(databasePathForScope(scope?.dataRoot), location)
      )?.filter((id) => !entry.before!.has(id));
      if (entry.ambiguous || candidates?.length !== 1 || map.get(location.path) !== entry)
        return undefined;
      map.delete(location.path);
      return createKnownSessionRef(candidates[0]!);
    },
    watch(
      location: ProjectLocation,
      onChanged: () => void,
      scope?: DevinDiscoveryScope | undefined,
    ) {
      if (location.kind === "wsl") return undefined;
      return watchSessionPaths(
        location,
        [dirname(databasePathForScope(scope?.dataRoot))],
        onChanged,
        "devin-sessions",
      );
    },
  };
}
