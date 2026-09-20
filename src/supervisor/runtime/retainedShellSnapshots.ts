import type { TerminalSize, TerminalSnapshot } from "@/shared/contracts";
import type { SessionRuntime, ShellSessionRuntime } from "./sessionTypes";

/** Bounded in-memory snapshots for naturally-exited dev shells (not DB-persisted). */
export const MAX_RETAINED_SHELL_SNAPSHOTS = 32;
export const RETAINED_SHELL_SNAPSHOT_MAX_CHARS = 200_000;
export const RETAINED_SHELL_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

export interface RetainedShellSnapshot {
  readonly threadId: string;
  readonly generation: string;
  readonly data: string;
  readonly fromCursor: number;
  readonly toCursor: number;
  readonly terminalSize: TerminalSize | null;
  readonly retainedAt: number;
}

export function isRetainedShellExpired(snapshot: RetainedShellSnapshot, now = Date.now()): boolean {
  return now - snapshot.retainedAt > RETAINED_SHELL_SNAPSHOT_TTL_MS;
}

export function shellTerminalSize(shell: ShellSessionRuntime): TerminalSize | null {
  const cols = shell.pty.cols;
  const rows = shell.pty.rows;
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
    return null;
  }
  return { cols, rows };
}

export function snapshotFromLiveSession(
  session: SessionRuntime,
  processState: "running" | "exited",
): TerminalSnapshot {
  const data = session.outputTranscript?.readTail(RETAINED_SHELL_SNAPSHOT_MAX_CHARS) ?? "";
  const toCursor = session.outputLength;
  return {
    generation: session.instanceId,
    fromCursor: Math.max(0, toCursor - data.length),
    toCursor,
    data,
    processState,
    terminalSize: session.terminalSize,
  };
}

export function snapshotFromLiveShell(
  shell: ShellSessionRuntime,
  processState: "running" | "exited",
): TerminalSnapshot {
  const data = shell.outputTranscript.readTail(RETAINED_SHELL_SNAPSHOT_MAX_CHARS);
  const toCursor = shell.outputLength;
  return {
    generation: shell.instanceId,
    fromCursor: Math.max(0, toCursor - data.length),
    toCursor,
    data,
    processState,
    terminalSize: shellTerminalSize(shell),
  };
}

export function buildRetainedShellSnapshot(shell: ShellSessionRuntime): RetainedShellSnapshot {
  const snapshot = snapshotFromLiveShell(shell, "exited");
  return {
    threadId: shell.shellId,
    generation: snapshot.generation ?? shell.instanceId,
    data: snapshot.data,
    fromCursor: snapshot.fromCursor,
    toCursor: snapshot.toCursor,
    terminalSize: snapshot.terminalSize,
    retainedAt: Date.now(),
  };
}

/**
 * Insert/replace a retained shell snapshot with LRU-ish eviction and TTL prune.
 * Calling with an existing id replaces any prior entry for that id.
 */
export function putRetainedShellSnapshot(
  store: Map<string, RetainedShellSnapshot>,
  snapshot: RetainedShellSnapshot,
): void {
  pruneRetainedShellSnapshots(store);
  store.delete(snapshot.threadId);
  store.set(snapshot.threadId, snapshot);
  while (store.size > MAX_RETAINED_SHELL_SNAPSHOTS) {
    const oldestKey = store.keys().next().value;
    if (oldestKey === undefined) break;
    store.delete(oldestKey);
  }
}

export function pruneRetainedShellSnapshots(
  store: Map<string, RetainedShellSnapshot>,
  now = Date.now(),
): void {
  for (const [id, snapshot] of store) {
    if (isRetainedShellExpired(snapshot, now)) store.delete(id);
  }
}
