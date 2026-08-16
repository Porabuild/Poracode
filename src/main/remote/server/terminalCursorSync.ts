import type { WebSocket } from "ws";
import type { TerminalSnapshot } from "@/shared/contracts";
import {
  TERMINAL_CURSOR_SYNC_VERSION,
  type RemoteTerminalWatchResult,
  type RemoteWebSocketServerMessage,
} from "@/shared/remote";
import { dbGetThread, dbGetThreadTerminalScrollbackRecord } from "../../db";

/**
 * Per-connection reliable (cursor-sync) terminal watches. Legacy watches stay
 * on the plain Set in RemoteAccessServer; this module only tracks the opt-in
 * path so reliability state stays out of the orchestrator class.
 */

export const TERMINAL_CURSOR_SYNC_SUPPORTED_VERSIONS = [TERMINAL_CURSOR_SYNC_VERSION] as const;

export function isSupportedTerminalCursorSyncVersion(
  version: number,
): version is typeof TERMINAL_CURSOR_SYNC_VERSION {
  return (TERMINAL_CURSOR_SYNC_SUPPORTED_VERSIONS as readonly number[]).includes(version);
}

export interface ReliableTerminalWatch {
  readonly version: typeof TERMINAL_CURSOR_SYNC_VERSION;
  readonly watchId: string;
  /**
   * Internal install identity. Public `watchId` may be reused across rewatch;
   * async barrier/snapshot continuations must gate on this epoch so a same-id
   * replacement cannot be poisoned by the older in-flight setup.
   */
  readonly epoch: number;
}

export class TerminalCursorSyncRegistry {
  private readonly reliable = new Map<WebSocket, Map<string, ReliableTerminalWatch>>();
  private nextEpoch = 1;

  /**
   * Install or replace reliable watch state for `terminalId`. Returns the
   * epoch token that every async continuation must pass to {@link isCurrent}
   * / {@link clearReliableIfMatch}.
   */
  setReliable(
    ws: WebSocket,
    terminalId: string,
    watch: Omit<ReliableTerminalWatch, "epoch">,
  ): number {
    let byTerminal = this.reliable.get(ws);
    if (!byTerminal) {
      byTerminal = new Map();
      this.reliable.set(ws, byTerminal);
    }
    const epoch = this.nextEpoch++;
    byTerminal.set(terminalId, { ...watch, epoch });
    return epoch;
  }

  clearReliable(ws: WebSocket, terminalId: string): void {
    const byTerminal = this.reliable.get(ws);
    if (!byTerminal) return;
    byTerminal.delete(terminalId);
    if (byTerminal.size === 0) this.reliable.delete(ws);
  }

  /**
   * Clear only when the registration still matches connection + watchId + epoch.
   * Returns true when this call removed the entry (so callers can notify interests
   * and emit errors without clobbering a newer same-id registration).
   */
  clearReliableIfMatch(ws: WebSocket, terminalId: string, watchId: string, epoch: number): boolean {
    if (!this.isCurrent(ws, terminalId, watchId, epoch)) return false;
    this.clearReliable(ws, terminalId);
    return true;
  }

  clearConnection(ws: WebSocket): void {
    this.reliable.delete(ws);
  }

  /** Drop every reliable registration (server dispose / full reset). */
  clearAll(): void {
    this.reliable.clear();
  }

  getReliable(ws: WebSocket, terminalId: string): ReliableTerminalWatch | undefined {
    return this.reliable.get(ws)?.get(terminalId);
  }

  isCurrent(ws: WebSocket, terminalId: string, watchId: string, epoch: number): boolean {
    const current = this.getReliable(ws, terminalId);
    return current?.watchId === watchId && current.epoch === epoch;
  }

  /** Whether any reliable watcher on this connection is interested in `terminalId`. */
  hasReliableWatcher(ws: WebSocket, terminalId: string): boolean {
    return this.reliable.get(ws)?.has(terminalId) === true;
  }
}

export function buildTerminalWatchResultMessage(
  terminalId: string,
  watchId: string,
  result: RemoteTerminalWatchResult,
): Extract<RemoteWebSocketServerMessage, { type: "terminal-watch-result" }> {
  return {
    type: "terminal-watch-result",
    id: terminalId,
    cursorSync: {
      version: TERMINAL_CURSOR_SYNC_VERSION,
      watchId,
      result,
    },
  };
}

/**
 * Tag a live output frame. `toCursor` and `data.length` are JS code-unit
 * offsets (UTF-16); `fromCursor = toCursor - data.length` in that space.
 */
export function buildCursorTaggedTerminalOutput(
  terminalId: string,
  data: string,
  watchId: string,
  generation: string,
  toCursor: number,
): Extract<RemoteWebSocketServerMessage, { type: "terminal-output" }> {
  const fromCursor = Math.max(0, toCursor - data.length);
  return {
    type: "terminal-output",
    id: terminalId,
    data,
    cursorSync: {
      version: TERMINAL_CURSOR_SYNC_VERSION,
      watchId,
      generation,
      fromCursor,
      toCursor,
    },
  };
}

export function readyResultFromSnapshot(
  snapshot: TerminalSnapshot,
): Extract<RemoteTerminalWatchResult, { status: "ready" }> {
  return {
    status: "ready",
    generation: snapshot.generation,
    fromCursor: snapshot.fromCursor,
    toCursor: snapshot.toCursor,
    data: snapshot.data,
    processState: snapshot.processState,
    terminalSize: snapshot.terminalSize,
  };
}

/**
 * Absolute end offset for a persisted scrollback row.
 *
 * Client schema requires a finite safe nonnegative integer (`remoteTerminalCursorSchema`).
 * Only values that already satisfy that contract become `toCursor`. Anything else —
 * NaN, ±Infinity, fractional, > `Number.MAX_SAFE_INTEGER`, or negative — falls back
 * to **0** (empty origin range), the same baseline as a zero-length row. That keeps
 * `toCursor - fromCursor === data.length` without inventing an absolute cursor or
 * emitting a frame the wire schema would reject.
 */
export function sanitizePersistedOutputLength(outputLength: number): number {
  if (!Number.isSafeInteger(outputLength) || outputLength < 0) return 0;
  return outputLength;
}

/**
 * Compose a watch result from a live/retained supervisor snapshot, falling back
 * to persisted SQLite scrollback (agent threads) when the supervisor has nothing.
 *
 * Persisted fallback always uses `generation: null` (snapshot/replace-only).
 *
 * Cursor arithmetic uses **JS string code units** (UTF-16), matching
 * `String.prototype.length` and supervisor `outputLength`. Astral planes are
 * two units; combining marks are separate units. Do not convert to code points.
 */
export function composeTerminalWatchReadyResult(
  snapshot: TerminalSnapshot | null,
  threadId: string,
): Extract<RemoteTerminalWatchResult, { status: "ready" }> | null {
  if (snapshot) return readyResultFromSnapshot(snapshot);

  const record = dbGetThreadTerminalScrollbackRecord(threadId);
  if (record) {
    // Absolute end offset in JS code units. Non-safe / non-integer / negative
    // lengths collapse to the empty origin baseline (see sanitize helper).
    const toCursor = sanitizePersistedOutputLength(record.outputLength);
    // Structural invariant: toCursor - fromCursor === data.length even when the
    // row is inconsistent (e.g. outputLength shorter than transcript).
    //
    // `toCursor === 0` is special: `String.prototype.slice(-0)` returns the whole
    // string (because -0 === 0), which would yield a negative fromCursor. Force an
    // empty range at the origin instead. Positive toCursor still trims the tail.
    const data =
      toCursor === 0
        ? ""
        : record.transcript.length > toCursor
          ? record.transcript.slice(-toCursor)
          : record.transcript;
    return {
      status: "ready",
      generation: null,
      fromCursor: toCursor - data.length,
      toCursor,
      data,
      processState: "exited",
      terminalSize: null,
    };
  }

  // Thread row exists but no scrollback yet (or scrollback was cleared).
  if (dbGetThread(threadId)) {
    return {
      status: "ready",
      generation: null,
      fromCursor: 0,
      toCursor: 0,
      data: "",
      processState: "exited",
      terminalSize: null,
    };
  }

  return null;
}

export function forbiddenWatchResult(): Extract<RemoteTerminalWatchResult, { status: "error" }> {
  return { status: "error", code: "forbidden", retryable: false };
}

export function notFoundWatchResult(): Extract<RemoteTerminalWatchResult, { status: "error" }> {
  return { status: "error", code: "not-found", retryable: false };
}

export function unavailableWatchResult(
  retryable = true,
): Extract<RemoteTerminalWatchResult, { status: "error" }> {
  return { status: "error", code: "unavailable", retryable };
}

/** Explicit non-retryable rejection for an unsupported cursorSync version. */
export function unsupportedCursorSyncVersionResult(): Extract<
  RemoteTerminalWatchResult,
  { status: "error" }
> {
  return { status: "error", code: "unavailable", retryable: false };
}

/**
 * Pure helper for client/server state machines: a frame or result is stale when
 * its watchId does not match the currently installed reliable watch.
 */
export function isStaleTerminalWatchId(
  currentWatchId: string | null | undefined,
  candidateWatchId: string,
): boolean {
  return currentWatchId !== candidateWatchId;
}

/**
 * Pure helper: after a generation change, prior cursor space must not be used
 * to append old bytes onto the new instance.
 *
 * **Null generation contract:** whenever either side's generation is `null`,
 * the range is snapshot/replace-only and never append-compatible. Do not invent
 * a durable generation id for persisted fallback.
 */
export function canAppendTerminalCursorRange(
  previous: { generation: string | null; toCursor: number } | null,
  next: { generation: string | null; fromCursor: number },
): boolean {
  if (!previous) return true;
  if (previous.generation === null || next.generation === null) return false;
  if (previous.generation !== next.generation) return false;
  return next.fromCursor === previous.toCursor;
}
