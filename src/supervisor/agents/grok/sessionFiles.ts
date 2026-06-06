import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import type { ProjectLocation, SessionRef } from "@/shared/contracts";
import {
  createKnownSessionRef,
  getCachedWslHomeDirectory,
  listSessionDir,
  readSshCommandOutputSync,
  resolveSshHomeDirectory,
  resolveWslHomeDirectoryAsync,
  statSessionPaths,
  watchSessionPaths,
} from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";

const GROK_SESSIONS_ROOT = join(homedir(), ".grok", "sessions");

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
  if (location.kind === "ssh") {
    const home = resolveSshHomeDirectory(location);
    return home ? `${home}/.grok/sessions/${encodeCwdKey(cwd)}` : null;
  }
  return join(GROK_SESSIONS_ROOT, encodeCwdKey(cwd));
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
  if (location.kind === "ssh") {
    const home = resolveSshHomeDirectory(location);
    return home ? `${home}/.grok/sessions` : null;
  }
  return GROK_SESSIONS_ROOT;
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

  if (location.kind === "ssh") {
    const result = readSshCommandOutputSync(location, "sh", [
      "-lc",
      `[ -d ${shellQuote(dir)} ] && ls -1 -- ${shellQuote(dir)} 2>/dev/null || true`,
    ]);
    if (!result.ok) return;
    preSpawnCwdKey = encodeCwdKey(cwd);
    for (const name of result.stdout.split(/\r?\n/)) {
      const trimmed = name.trim();
      if (isUuid(trimmed)) preSpawnSessionIds.add(trimmed);
    }
    return;
  }

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

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
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
  if (location.kind === "wsl" || location.kind === "ssh") {
    const root = getGrokSessionsRoot(location);
    return [dir ?? undefined, root ?? undefined].filter((p): p is string => Boolean(p));
  }
  if (dir && existsSync(dir)) return [dir];
  return [GROK_SESSIONS_ROOT];
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

/**
 * Worker payload: spawn `grok [flags] agent stdio`, drive `initialize` →
 * `authenticate` → `session/new`, write the returned UUID into the shared
 * buffer, then notify the parent. Runs inside a `worker_threads.Worker` so
 * that `mintGrokSessionIdViaAcpSync` can block via `Atomics.wait` without
 * changing the synchronous `AgentLauncher` interface.
 *
 * NOTE: `spawnSync` is unusable here because Grok 0.1.218 closes the ACP
 * connection as soon as stdin EOFs — usually before it has processed the
 * `session/new` request. We need to keep stdin open until id:3 lands.
 */
const MINT_WORKER_SCRIPT = `
const { workerData } = require("worker_threads");
const { spawn } = require("child_process");
const { sab, binary, args, cwd } = workerData;
const signalView = new Int32Array(sab, 0, 1);
const idView = new Uint8Array(sab, 4, 64);

let resolved = false;
function finish(sessionId) {
  if (resolved) return;
  resolved = true;
  if (sessionId) {
    const buf = Buffer.from(sessionId, "utf8");
    for (let i = 0; i < buf.length && i < 64; i++) idView[i] = buf[i];
  }
  Atomics.store(signalView, 0, 1);
  Atomics.notify(signalView, 0);
  try { p.kill(); } catch {}
}

const p = spawn(binary, [...args, "agent", "stdio"], { cwd, stdio: ["pipe","pipe","pipe"], windowsHide: true });
// Stdin EOF on terminate is the documented Grok-exit signal, but kill the
// child explicitly too so a future Grok build that keeps the connection open
// on EOF cannot orphan the process.
process.on("exit", () => { try { p.kill(); } catch {} });
let buf = "";
p.stdout.on("data", (chunk) => {
  buf += chunk.toString("utf8");
  let nl;
  while ((nl = buf.indexOf("\\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id === 3 && msg.result && typeof msg.result.sessionId === "string") {
        finish(msg.result.sessionId);
        return;
      }
    } catch { /* skip non-JSON noise */ }
  }
});
p.on("error", () => finish());
p.on("close", () => finish());

const reqs = [
  { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: 1, clientInfo: { name: "lightcode-grok-mint", version: "1" }, clientCapabilities: { auth: { terminal: true } } } },
  { jsonrpc: "2.0", id: 2, method: "authenticate", params: { methodId: "cached_token" } },
  { jsonrpc: "2.0", id: 3, method: "session/new", params: { cwd, mcpServers: [] } },
];
for (const r of reqs) p.stdin.write(JSON.stringify(r) + "\\n");
`;

/**
 * Synchronously mint a Grok session ID by spinning up `grok agent stdio` long
 * enough to drive `initialize` → `authenticate` → `session/new`. The returned
 * UUID is then used with the PTY `-r <id>` flag so the TUI loads that session
 * directly instead of rendering the welcome menu (which would otherwise
 * suppress our initial-prompt delivery path).
 *
 * `extraLaunchArgs` should be the output of `buildGrokAcpArgs(config)` so the
 * minted session is born with the right model / effort / permission-mode /
 * always-approve state already recorded in `summary.json`.
 *
 * Returns `undefined` on any failure (timeout, auth error, JSON parse, etc.).
 * Callers must treat undefined as "no minted ID" and proceed without `-r`.
 *
 * Remote environments skip this local pre-mint path. The remote PTY launch
 * still snapshots sessions before spawn and discovers the created session
 * afterward, matching the fallback path used when local minting fails.
 */
export function mintGrokSessionIdViaAcpSync(
  location: ProjectLocation,
  timeoutMs = 4500,
  extraLaunchArgs: string[] = [],
): string | undefined {
  if (location.kind === "wsl" || location.kind === "ssh") return undefined;

  // Use the absolute path resolved during detection. Packaged Electron apps
  // start with a minimal PATH that may exclude Homebrew/asdf/etc., so a bare
  // "grok" in the worker's spawn would fail even though detection found the
  // binary. Mirrors how createCursorChatSync passes resolveAgentBinaryPath().
  const binary = resolveAgentBinaryPath(location, "grok") ?? "grok";

  // 4 bytes for the Atomics signal (Int32), 64 bytes for the UUID payload.
  const sab = new SharedArrayBuffer(4 + 64);
  const signalView = new Int32Array(sab, 0, 1);
  const idView = new Uint8Array(sab, 4, 64);

  const worker = new Worker(MINT_WORKER_SCRIPT, {
    eval: true,
    workerData: { sab, binary, args: extraLaunchArgs, cwd: location.path },
  });
  worker.on("error", () => {
    Atomics.store(signalView, 0, 1);
    Atomics.notify(signalView, 0);
  });

  Atomics.wait(signalView, 0, 0, timeoutMs);

  const terminator = idView.indexOf(0);
  const length = terminator >= 0 ? terminator : idView.length;
  const sessionId = length > 0 ? Buffer.from(idView.slice(0, length)).toString("utf8") : undefined;

  // Best-effort cleanup. terminate() is async; we don't await because the
  // worker is fully self-contained and its child has been signalled to die.
  worker.terminate();

  return sessionId && isUuid(sessionId) ? sessionId : undefined;
}
