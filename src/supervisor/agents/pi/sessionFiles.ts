import { existsSync } from "node:fs";
import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectLocation, SessionRef } from "@/shared/contracts";
import {
  batchWslCommandsAsync,
  createKnownSessionRef,
  getCachedWslHomeDirectory,
  readSessionFileText,
  watchSessionPaths,
} from "../base";
import { piAgentHomePath } from "./detection";

const preSpawnIds = new Map<string, Set<string>>();

function cwdOf(location: ProjectLocation): string {
  return location.kind === "wsl" ? location.linuxPath : location.path;
}

function nativeSessionsRoot(): string {
  return process.env.PI_CODING_AGENT_SESSION_DIR?.trim() || join(piAgentHomePath(), "sessions");
}

interface NativePiSession {
  id: string;
  path: string;
  mtimeMs: number;
}

async function readSessionHead(path: string, bytes: number): Promise<string | undefined> {
  try {
    const handle = await open(path, "r");
    try {
      const buffer = Buffer.alloc(bytes);
      const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
      return buffer.subarray(0, bytesRead).toString("utf8");
    } finally {
      await handle.close();
    }
  } catch {
    return undefined;
  }
}

// Reads pi's on-disk session headers directly (no bundled SDK). Sessions live
// under `<sessions>/<cwd-slug>/<timestamp>.jsonl`; each file's first line is a
// `{ type: "session", id, cwd }` header we filter against the project cwd.
async function listNativePiSessions(cwd: string): Promise<NativePiSession[]> {
  const root = nativeSessionsRoot();
  if (!existsSync(root)) return [];
  let groups: string[];
  try {
    groups = await readdir(root);
  } catch {
    return [];
  }
  const sessions: NativePiSession[] = [];
  for (const group of groups) {
    let files: string[];
    try {
      files = await readdir(join(root, group));
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;
      const path = join(root, group, file);
      const firstLine = (await readSessionHead(path, 16_384))?.split("\n", 1)[0];
      if (!firstLine) continue;
      try {
        const header = JSON.parse(firstLine) as { type?: unknown; id?: unknown; cwd?: unknown };
        if (header.type !== "session" || typeof header.id !== "string" || header.cwd !== cwd) {
          continue;
        }
        const info = await stat(path).catch(() => undefined);
        sessions.push({ id: header.id, path, mtimeMs: info?.mtimeMs ?? 0 });
      } catch {
        // A partially written session header is skipped (retried on next poll).
      }
    }
  }
  return sessions.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export async function snapshotPiPreSpawnSessions(location: ProjectLocation): Promise<void> {
  const cwd = cwdOf(location);
  if (location.kind === "wsl") {
    preSpawnIds.set(cwd, new Set());
    return;
  }
  const sessions = await listNativePiSessions(cwd);
  preSpawnIds.set(cwd, new Set(sessions.map((session) => session.id)));
}

export async function discoverPiSessionRef(
  location: ProjectLocation,
): Promise<SessionRef | undefined> {
  if (location.kind === "wsl") {
    const [result] = await batchWslCommandsAsync(location.distro, [
      'root="${PI_CODING_AGENT_SESSION_DIR:-${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/sessions}"; test -d "$root" && find "$root" -type f -name "*.jsonl" -printf "%T@\\t%p\\n" | sort -nr | head -20',
    ]);
    if (!result?.ok) return undefined;
    for (const line of result.stdout.split("\n")) {
      const tab = line.indexOf("\t");
      const path = tab >= 0 ? line.slice(tab + 1).trim() : "";
      if (!path) continue;
      const firstLine = (await readSessionFileText(location, path, 16_384))?.split("\n", 1)[0];
      if (!firstLine) continue;
      try {
        const header = JSON.parse(firstLine) as { type?: unknown; id?: unknown; cwd?: unknown };
        if (
          header.type === "session" &&
          typeof header.id === "string" &&
          header.cwd === location.linuxPath
        ) {
          return createKnownSessionRef(header.id);
        }
      } catch {
        // A partially written session header is retried by the next discovery poll.
      }
    }
    return undefined;
  }
  const cwd = cwdOf(location);
  const before = preSpawnIds.get(cwd) ?? new Set<string>();
  const sessions = await listNativePiSessions(cwd);
  const latest = sessions.find((session) => !before.has(session.id));
  if (!latest) return undefined;
  preSpawnIds.delete(cwd);
  return createKnownSessionRef(latest.id);
}

export function watchPiSessionRef(
  location: ProjectLocation,
  onChanged: () => void,
): (() => void) | undefined {
  const home =
    location.kind === "wsl"
      ? (() => {
          const wslHome = getCachedWslHomeDirectory(location.distro);
          return wslHome ? `${wslHome}/.pi/agent` : undefined;
        })()
      : piAgentHomePath();
  if (!home) return undefined;
  const sessions = location.kind === "wsl" ? `${home}/sessions` : join(home, "sessions");
  const paths =
    location.kind === "wsl"
      ? [sessions, home]
      : [sessions, home].filter((path) => existsSync(path));
  return watchSessionPaths(location, paths, onChanged, `pi:${location.kind}`);
}

export async function resolveNativePiSessionPath(
  cwd: string,
  sessionId: string,
): Promise<string | undefined> {
  const sessions = await listNativePiSessions(cwd);
  return sessions.find((session) => session.id === sessionId)?.path;
}
