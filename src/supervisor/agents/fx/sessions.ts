import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProjectLocation, SessionRef } from "@/shared/contracts";
import {
  createKnownSessionRef,
  getCachedWslHomeDirectory,
  readAgentCommandOutput,
  watchSessionPaths,
} from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { FX_BASE_SPAWN_ENV } from "./detection";

export interface FxSessionSummary {
  id: string;
  createdAtMs: number;
}

interface FxSessionSnapshot {
  ids: Set<string>;
  takenAtMs: number;
}

const snapshots = new Map<string, FxSessionSnapshot>();

function fxCwdKey(location: ProjectLocation): string {
  return location.kind === "wsl" ? `wsl:${location.distro}:${location.linuxPath}` : location.path;
}

export function parseFxSessionsJson(stdout: string): FxSessionSummary[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  const record = parsed as Record<string, unknown>;
  if (record["kind"] !== "sessions") return undefined;
  const sessions = record["sessions"];
  if (!Array.isArray(sessions)) return undefined;

  const summaries: FxSessionSummary[] = [];
  for (const entry of sessions) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const entryRecord = entry as Record<string, unknown>;
    const id = entryRecord["id"];
    if (typeof id !== "string" || id.length === 0) continue;
    const createdAt = entryRecord["created_at_ms"];
    summaries.push({
      id,
      createdAtMs: typeof createdAt === "number" && Number.isFinite(createdAt) ? createdAt : 0,
    });
  }
  return summaries;
}

/**
 * Pick the session fx created for this launch: absent from the pre-spawn
 * snapshot and not older than the snapshot (5s slack for clock skew), newest
 * `created_at_ms` wins.
 */
export function pickFxDiscoveredSessionId(
  sessions: readonly FxSessionSummary[],
  snapshotIds: ReadonlySet<string>,
  snapshotTakenAtMs: number,
): string | undefined {
  let newest: FxSessionSummary | undefined;
  for (const session of sessions) {
    if (snapshotIds.has(session.id)) continue;
    if (session.createdAtMs < snapshotTakenAtMs - 5_000) continue;
    if (!newest || session.createdAtMs > newest.createdAtMs) newest = session;
  }
  return newest?.id;
}

export async function listFxSessions(
  location: ProjectLocation,
): Promise<FxSessionSummary[] | undefined> {
  const result = await readAgentCommandOutput(
    location,
    resolveAgentBinaryPath(location, "fx") ?? "fx",
    ["sessions", "--json", "--limit", "100"],
    {
      timeoutMs: 5_000,
      env: FX_BASE_SPAWN_ENV,
      ...(location.kind !== "wsl" ? { posixCwd: location.path } : {}),
    },
  );
  return result.ok ? parseFxSessionsJson(result.stdout) : undefined;
}

/**
 * Record the sessions that already exist for this workspace immediately before
 * a fresh launch. Discovery is only allowed against a snapshot — without one we
 * would guess an older session id.
 */
export async function snapshotFxPreSpawnSessions(location: ProjectLocation): Promise<void> {
  const takenAtMs = Date.now();
  const sessions = await listFxSessions(location);
  snapshots.set(fxCwdKey(location), {
    ids: new Set((sessions ?? []).map((session) => session.id)),
    takenAtMs,
  });
}

export async function discoverFxSessionRef(
  location: ProjectLocation,
): Promise<SessionRef | undefined> {
  const snapshot = snapshots.get(fxCwdKey(location));
  if (!snapshot) return undefined;
  const sessions = await listFxSessions(location);
  if (!sessions) return undefined;
  const id = pickFxDiscoveredSessionId(sessions, snapshot.ids, snapshot.takenAtMs);
  return id ? createKnownSessionRef(id) : undefined;
}

/**
 * Paths to watch for new fx sessions: the v2 store when present, falling back
 * to its parent so the first session creation still wakes the watcher.
 */
export function resolveFxSessionsWatchPaths(location: ProjectLocation): string[] | undefined {
  if (location.kind === "wsl") {
    const home = getCachedWslHomeDirectory(location.distro);
    if (!home) return undefined;
    return [`${home}/.fx/sessions/v2`, `${home}/.fx`];
  }
  for (const candidate of [
    join(homedir(), ".fx", "sessions", "v2"),
    join(homedir(), ".fx", "sessions"),
    join(homedir(), ".fx"),
  ]) {
    if (existsSync(candidate)) return [candidate];
  }
  return undefined;
}

export function watchFxSessionRef(
  location: ProjectLocation,
  onChanged: () => void,
): (() => void) | undefined {
  const paths = resolveFxSessionsWatchPaths(location);
  if (!paths) return undefined;
  const label = `fx:${location.kind === "wsl" ? `wsl:${location.distro}` : location.kind}`;
  return watchSessionPaths(location, paths, onChanged, label);
}
