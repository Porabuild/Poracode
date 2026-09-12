import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
} from "node:fs";
import { open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProjectLocation } from "@/shared/contracts";
import { resolvePoracodePaths } from "@/shared/poracodePaths";
import {
  findSessionFiles,
  getCachedWslHomeDirectory,
  readSessionFileText,
  resolveWslHomeDirectoryAsync,
} from "../base";
import {
  parseCodexRolloutIdFromPath,
  parseCodexRolloutMeta,
  parseCodexSessionIndex,
  readCodexSessionIndex,
  type CodexRolloutMeta,
} from "./sessionFiles";

const CODEX_ROLLOUT_META_READ_CHUNK_BYTES = 16 * 1024;
const CODEX_ROLLOUT_META_MAX_BYTES = 1024 * 1024;

function readNativeRolloutFirstLine(path: string): string | undefined {
  let fd: number | undefined;
  try {
    fd = openSync(path, "r");
    const chunks: Buffer[] = [];
    let bytesReadTotal = 0;
    while (bytesReadTotal < CODEX_ROLLOUT_META_MAX_BYTES) {
      const buffer = Buffer.allocUnsafe(
        Math.min(
          CODEX_ROLLOUT_META_READ_CHUNK_BYTES,
          CODEX_ROLLOUT_META_MAX_BYTES - bytesReadTotal,
        ),
      );
      const bytesRead = readSync(fd, buffer, 0, buffer.length, bytesReadTotal);
      if (bytesRead === 0) return Buffer.concat(chunks).toString("utf8");
      const chunk = buffer.subarray(0, bytesRead);
      const newline = chunk.indexOf(0x0a);
      chunks.push(newline === -1 ? chunk : chunk.subarray(0, newline));
      if (newline !== -1) return Buffer.concat(chunks).toString("utf8");
      bytesReadTotal += bytesRead;
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

async function readNativeRolloutFirstLineAsync(path: string): Promise<string | undefined> {
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    file = await open(path, "r");
    const chunks: Buffer[] = [];
    let bytesReadTotal = 0;
    while (bytesReadTotal < CODEX_ROLLOUT_META_MAX_BYTES) {
      const buffer = Buffer.allocUnsafe(
        Math.min(
          CODEX_ROLLOUT_META_READ_CHUNK_BYTES,
          CODEX_ROLLOUT_META_MAX_BYTES - bytesReadTotal,
        ),
      );
      const { bytesRead } = await file.read(buffer, 0, buffer.length, bytesReadTotal);
      if (bytesRead === 0) return Buffer.concat(chunks).toString("utf8");
      const chunk = buffer.subarray(0, bytesRead);
      const newline = chunk.indexOf(0x0a);
      chunks.push(newline === -1 ? chunk : chunk.subarray(0, newline));
      if (newline !== -1) return Buffer.concat(chunks).toString("utf8");
      bytesReadTotal += bytesRead;
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    await file?.close().catch(() => undefined);
  }
}

function nativePrivateCodexHome(): string {
  return join(resolvePoracodePaths(process.env.PORACODE_DATA_DIR).agentPluginsDir, "codex", "home");
}

function nativeCodexHomeCandidates(): string[] {
  return [join(homedir(), ".codex"), nativePrivateCodexHome()];
}

/** Append the codex private-home suffix to a resolved WSL `$HOME`, if present. */
function codexPrivateHomeFrom(home: string | undefined): string | undefined {
  return home ? `${home}/.poracode/agent-plugins/codex/home` : undefined;
}

function wslPrivateCodexHome(distro: string): string | undefined {
  return codexPrivateHomeFrom(getCachedWslHomeDirectory(distro));
}

function dedupeById<T extends { id: string }>(items: T[], getUpdatedAt: (item: T) => number): T[] {
  const byId = new Map<string, T>();
  for (const item of items) {
    const prev = byId.get(item.id);
    if (!prev || getUpdatedAt(item) > getUpdatedAt(prev)) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()];
}

function dedupeRollouts(rollouts: CodexRolloutMeta[]): CodexRolloutMeta[] {
  return dedupeById(rollouts, (r) => r.updatedAt ?? 0);
}

function dedupeSessionIndex(
  sessions: Array<{ id: string; updatedAt: number; threadName: string }>,
): Array<{ id: string; updatedAt: number; threadName: string }> {
  return dedupeById(sessions, (s) => s.updatedAt).sort((a, b) => a.updatedAt - b.updatedAt);
}

export function describeCodexLocation(location: ProjectLocation): string {
  switch (location.kind) {
    case "windows":
      return `windows:${location.path}`;
    case "wsl":
      return `wsl:${location.distro}:${location.linuxPath}`;
    case "posix":
      return `posix:${location.path}`;
  }
}

export function readCodexSessionIndexForLocation(location: ProjectLocation) {
  if (location.kind === "wsl") {
    return [];
  }

  const sessions = readCodexSessionIndex();
  const privateIndexPath = join(nativePrivateCodexHome(), "session_index.jsonl");
  let privateRaw: string;
  try {
    privateRaw = readFileSync(privateIndexPath, "utf8");
  } catch {
    return sessions;
  }
  return dedupeSessionIndex([...sessions, ...parseCodexSessionIndex(privateRaw)]);
}

/**
 * Async variant routed through the in-distro bridge on WSL (~10ms via HTTP
 * loopback) instead of `wsl.exe` cold start (~50–100ms). Used by the async
 * `discoverSessionRef` hot path; the sync version above remains for
 * `buildLaunchArgv` where the call site itself is sync.
 */
export async function readCodexSessionIndexForLocationAsync(
  location: ProjectLocation,
): Promise<Array<{ id: string; updatedAt: number; threadName: string }>> {
  if (location.kind !== "wsl") {
    return readCodexSessionIndexForLocation(location);
  }
  const home = await resolveWslHomeDirectoryAsync(location.distro);
  const privateHome = codexPrivateHomeFrom(home);
  const paths = [
    home ? `${home}/.codex/session_index.jsonl` : undefined,
    privateHome ? `${privateHome}/session_index.jsonl` : undefined,
  ].filter((p): p is string => Boolean(p));
  const reads = await Promise.all(paths.map((p) => readSessionFileText(location, p)));
  const parts = reads.filter((r): r is string => typeof r === "string" && r.length > 0);
  if (parts.length === 0) return [];
  const merged = parts.flatMap((raw) => parseCodexSessionIndex(raw));
  return dedupeSessionIndex(merged);
}

export function isInteractiveCodexRollout(
  rollout: CodexRolloutMeta,
  location: ProjectLocation,
): boolean {
  if (rollout.originator !== "codex-tui" || rollout.source !== "cli") {
    return false;
  }

  if (!rollout.cwd) {
    return true;
  }

  switch (location.kind) {
    case "windows":
      return rollout.cwd === location.path;
    case "posix":
      return rollout.cwd === location.path;
    case "wsl":
      return rollout.cwd === location.linuxPath || rollout.cwd === location.uncPath;
  }
}

export function readCodexRolloutsForLocation(location: ProjectLocation): CodexRolloutMeta[] {
  if (location.kind === "wsl") {
    return [];
  }

  const rollouts: CodexRolloutMeta[] = [];
  const walk = (dir: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      let stat: import("node:fs").Stats;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }
      const id = parseCodexRolloutIdFromPath(fullPath);
      if (!id) {
        continue;
      }
      const firstLine = readNativeRolloutFirstLine(fullPath) ?? "";
      const parsed = parseCodexRolloutMeta(fullPath, firstLine, stat.mtimeMs);
      if (parsed && isInteractiveCodexRollout(parsed, location)) {
        rollouts.push(parsed);
      }
    }
  };
  for (const home of nativeCodexHomeCandidates()) {
    walk(join(home, "sessions"));
  }
  return dedupeRollouts(rollouts);
}

export function readCodexRolloutMetaForLocation(
  location: ProjectLocation,
  rollout: CodexRolloutMeta,
): CodexRolloutMeta | undefined {
  if (location.kind === "wsl") {
    return rollout;
  }

  const firstLine = readNativeRolloutFirstLine(rollout.path) ?? "";
  return parseCodexRolloutMeta(rollout.path, firstLine, rollout.updatedAt) ?? rollout;
}

export async function readCodexRolloutMetaForLocationAsync(
  location: ProjectLocation,
  rollout: CodexRolloutMeta,
): Promise<CodexRolloutMeta | undefined> {
  if (location.kind !== "wsl") {
    const firstLine = (await readNativeRolloutFirstLineAsync(rollout.path)) ?? "";
    return parseCodexRolloutMeta(rollout.path, firstLine, rollout.updatedAt) ?? rollout;
  }
  const text = await readSessionFileText(location, rollout.path);
  if (!text) return rollout;
  const firstLine = text.split(/\r?\n/g)[0] ?? "";
  return parseCodexRolloutMeta(rollout.path, firstLine, rollout.updatedAt) ?? rollout;
}

export async function readCodexRolloutsForLocationAsync(
  location: ProjectLocation,
): Promise<CodexRolloutMeta[]> {
  let roots: string[];
  if (location.kind === "wsl") {
    const home = await resolveWslHomeDirectoryAsync(location.distro);
    const privateHome = codexPrivateHomeFrom(home);
    roots = [
      home ? `${home}/.codex/sessions` : undefined,
      privateHome ? `${privateHome}/sessions` : undefined,
    ].filter((root): root is string => Boolean(root));
  } else {
    roots = nativeCodexHomeCandidates().map((home) => join(home, "sessions"));
  }

  const accept = (name: string): boolean => name.startsWith("rollout-") && name.endsWith(".jsonl");
  const found = (
    await Promise.all(
      roots.map((root) =>
        findSessionFiles(location, {
          root,
          acceptFile: accept,
          includeMtime: true,
        }),
      ),
    )
  ).flat();

  return dedupeRollouts(
    found.flatMap((f) => {
      const id = parseCodexRolloutIdFromPath(f.path);
      if (!id) return [];
      const meta: CodexRolloutMeta = {
        id,
        path: f.path,
        ...(f.mtimeMs !== undefined ? { updatedAt: f.mtimeMs } : {}),
      };
      return [meta];
    }),
  );
}

/**
 * Returns absolute paths to watch for new/changed Codex rollouts. Native
 * paths for windows/posix; Linux paths inside the distro for WSL (consumed
 * by the in-distro bridge watch subscription, NOT UNC `\\wsl.localhost\…`).
 */
export function resolveCodexSessionWatchPaths(location: ProjectLocation): string[] {
  if (location.kind === "wsl") {
    const home = getCachedWslHomeDirectory(location.distro);
    const privateHome = wslPrivateCodexHome(location.distro);
    return [
      home ? `${home}/.codex/sessions` : undefined,
      privateHome ? `${privateHome}/sessions` : undefined,
    ].filter((p): p is string => Boolean(p));
  }
  const paths: string[] = [];
  const publicSessions = join(homedir(), ".codex", "sessions");
  if (existsSync(publicSessions)) paths.push(publicSessions);
  const privateSessions = join(nativePrivateCodexHome(), "sessions");
  if (existsSync(privateSessions)) paths.push(privateSessions);
  return paths;
}
