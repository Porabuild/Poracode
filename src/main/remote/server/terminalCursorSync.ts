import type { WebSocket } from "ws";
import type { TerminalSnapshot } from "@/shared/contracts";
import {
  TERMINAL_CURSOR_SYNC_VERSION,
  TERMINAL_CURSOR_SYNC_V2_VERSION,
  type RemoteTerminalWatchBaselineChunk,
  type RemoteTerminalWatchResult,
  type RemoteWebSocketServerMessage,
} from "@/shared/remote";
import { dbGetThread, dbGetThreadTerminalScrollbackRecord } from "../../db";

/**
 * Per-connection reliable (cursor-sync) terminal watches. Legacy watches stay
 * on the plain Set in RemoteAccessServer; this module only tracks the opt-in
 * path so reliability state stays out of the orchestrator class.
 */

export const TERMINAL_CURSOR_SYNC_SUPPORTED_VERSIONS = [
  TERMINAL_CURSOR_SYNC_VERSION,
  TERMINAL_CURSOR_SYNC_V2_VERSION,
] as const;

export function isSupportedTerminalCursorSyncVersion(
  version: number,
): version is typeof TERMINAL_CURSOR_SYNC_VERSION | typeof TERMINAL_CURSOR_SYNC_V2_VERSION {
  return (TERMINAL_CURSOR_SYNC_SUPPORTED_VERSIONS as readonly number[]).includes(version);
}

export interface ReliableTerminalWatch {
  readonly version: typeof TERMINAL_CURSOR_SYNC_VERSION | typeof TERMINAL_CURSOR_SYNC_V2_VERSION;
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

/** Explicit non-retryable rejection for an unsupported cursorSync version.
 * `reason: "unsupported-version"` lets a v2-aware client distinguish "downgrade
 * the watch" from other non-retryable stops without guessing. */
export function unsupportedCursorSyncVersionResult(): Extract<
  RemoteTerminalWatchResult,
  { status: "error" }
> {
  return {
    status: "error",
    code: "unavailable",
    retryable: false,
    reason: "unsupported-version",
  };
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

// ---------------------------------------------------------------------------
// Cursor-sync v2: chunked baseline composition (pure, unit-tested here).
// ---------------------------------------------------------------------------

/** Clamps the client's requested chunk budget to the server-accepted range. */
export const TERMINAL_BASELINE_CHUNK_BYTE_BOUNDS = { min: 1024, max: 65_536, default: 8_192 };

/** Clamps the client's requested unacknowledged-byte window. */
export const TERMINAL_BASELINE_WINDOW_BYTE_BOUNDS = { min: 1024, max: 262_144, default: 8_192 };

export function clampTerminalBaselineChunkBytes(requested: number | undefined): number {
  const { min, max, default: fallback } = TERMINAL_BASELINE_CHUNK_BYTE_BOUNDS;
  if (requested === undefined || !Number.isFinite(requested)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(requested)));
}

export function clampTerminalBaselineWindowBytes(
  requested: number | undefined,
  effectiveChunkBytes: number,
): number {
  const { min, max, default: fallback } = TERMINAL_BASELINE_WINDOW_BYTE_BOUNDS;
  const candidate =
    requested === undefined || !Number.isFinite(requested)
      ? fallback
      : Math.min(max, Math.max(min, Math.floor(requested)));
  // The window must always admit at least one full chunk or the stream stalls.
  return Math.max(candidate, effectiveChunkBytes);
}

/**
 * Cursor-sync v2 resume decision (design §6.1): a client-presented cache
 * position may serve the uncovered suffix only when the composed window still
 * has a durable generation that exactly matches, and the position sits inside
 * the window. Null-generation windows (SQLite fallback) never resume — they
 * are replace-only against anything, including another null. A position below
 * `fromCursor` (retention cutoff) is a full replacement of the newest window.
 */
export function resolveTerminalBaselineResume(input: {
  readonly resume: { readonly generation: string; readonly cursor: number } | undefined;
  readonly generation: string | null;
  readonly fromCursor: number;
  readonly toCursor: number;
}): { readonly resumeServed: boolean; readonly sliceFromCursor: number } {
  const { resume, generation, fromCursor, toCursor } = input;
  const resumeServed =
    resume !== undefined &&
    generation !== null &&
    resume.generation === generation &&
    fromCursor <= resume.cursor &&
    resume.cursor <= toCursor;
  return { resumeServed, sliceFromCursor: resumeServed ? resume.cursor : fromCursor };
}

/** UTF-8 byte length of `s` as it will appear JSON-escaped inside a string
 * (control characters escape to 6 ASCII bytes, quote/backslash to 2, a full
 * surrogate pair to 4 UTF-8 bytes, other BMP units 1–3). Linear in units. */
function jsonEscapedByteLength(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const unit = s.charCodeAt(i);
    if (unit < 0x20 || unit === 0x22 || unit === 0x5c) {
      bytes += unit < 0x20 ? 6 : 2;
      continue;
    }
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
        continue;
      }
      // Lone high surrogate: Node encodes it as U+FFFD (3 bytes) — but this
      // function is only consulted on code-point-aligned slices, which never
      // contain lone surrogates. Count 3 so the bound stays honest.
      bytes += 3;
      continue;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) {
      bytes += 3; // lone low surrogate — same reasoning as above
      continue;
    }
    bytes += unit < 0x80 ? 1 : unit < 0x800 ? 2 : 3;
  }
  return bytes;
}

/**
 * Slice a frozen baseline window into chunk payloads that each keep the
 * ENCODED JSON envelope under `budgetBytes` and never split a surrogate pair.
 *
 * The budget is envelope bytes, not units: escaped wire cost varies ~1×–6×
 * per unit, so a unit budget would bound nothing. `envelopeOverheadBytes` is
 * the byte length of the chunk message with `data: ""` — the per-chunk fixed
 * cost (ids, cursors, metadata). Slicing is deterministic: the same window
 * and budget always produce the same chunk boundaries.
 */
export function sliceTerminalBaselineChunks(input: {
  readonly data: string;
  readonly fromCursor: number;
  readonly budgetBytes: number;
  readonly envelopeOverheadBytes: number;
}): ReadonlyArray<{
  readonly fromCursor: number;
  readonly toCursor: number;
  readonly data: string;
}> {
  const { data, fromCursor, envelopeOverheadBytes } = input;
  // An empty window (including a fully up-to-date resume) is one empty
  // completion chunk: `fromCursor === toCursor`, current metadata rides along.
  if (data.length === 0) {
    return [{ fromCursor, toCursor: fromCursor, data: "" }];
  }
  // At least one byte of the budget must be available for `data` itself.
  const dataBudget = Math.max(0, input.budgetBytes - envelopeOverheadBytes);
  if (dataBudget === 0) {
    // Degenerate configuration: a single chunk is emitted and the caller's
    // outbound guard (bufferedAmount credit) still bounds the wire.
    return [{ fromCursor, toCursor: fromCursor + data.length, data }];
  }
  const chunks: Array<{
    readonly fromCursor: number;
    readonly toCursor: number;
    readonly data: string;
  }> = [];
  let start = 0;
  while (start < data.length) {
    // Upper bound: escaped bytes ≥ units, so `dataBudget` units can overflow —
    // but never undershoot. Walk back from there to the largest fitting end.
    let end = Math.min(data.length - start, dataBudget);
    // Fast path: assume the plain UTF-8 length (no escapes) fits, then verify
    // exactly; both directions converge in a handful of steps.
    while (end > 0) {
      const candidate = data.slice(start, start + end);
      // Never split a surrogate pair at the boundary.
      const lastUnit = candidate.charCodeAt(candidate.length - 1);
      let alignedEnd = end;
      if (lastUnit >= 0xd800 && lastUnit <= 0xdbff) alignedEnd = end - 1;
      if (alignedEnd <= 0) {
        end = 0;
        break;
      }
      const aligned = alignedEnd === end ? candidate : data.slice(start, start + alignedEnd);
      if (jsonEscapedByteLength(aligned) <= dataBudget) {
        end = alignedEnd;
        chunks.push({
          fromCursor: fromCursor + start,
          toCursor: fromCursor + start + alignedEnd,
          data: aligned,
        });
        break;
      }
      // Over budget: step back ~12.5% plus escape slack, then fine-tune.
      end = Math.max(1, Math.floor(alignedEnd * 0.875));
    }
    if (end === 0) {
      // Single unit does not fit (dataBudget too small for its escape) —
      // emit it alone rather than looping forever; the outbound credit guard
      // still bounds what actually hits the wire.
      chunks.push({
        fromCursor: fromCursor + start,
        toCursor: fromCursor + start + 1,
        data: data.slice(start, start + 1),
      });
      end = 1;
    }
    start += end;
  }
  return chunks;
}

/**
 * Byte length of a fully encoded chunk message minus its `data` payload —
 * the outer `{type, id}` wrapper included, so the slicer's data budget is
 * exact rather than optimistic.
 */
export function terminalBaselineChunkEnvelopeOverheadBytes(
  terminalId: string,
  message: Omit<RemoteTerminalWatchBaselineChunk, "data">,
): number {
  return Buffer.byteLength(
    JSON.stringify(buildTerminalBaselineChunkMessage(terminalId, { ...message, data: "" })),
    "utf8",
  );
}

export function buildTerminalBaselineChunkMessage(
  terminalId: string,
  chunk: RemoteTerminalWatchBaselineChunk,
): Extract<RemoteWebSocketServerMessage, { type: "terminal-watch-baseline-chunk" }> {
  return {
    type: "terminal-watch-baseline-chunk",
    id: terminalId,
    cursorSync: chunk,
  };
}

/**
 * Compose the full cursor-sync v2 baseline stream for a ready watch result:
 * the resume decision (§6.1), envelope-budgeted slicing, and the per-chunk
 * messages with their encoded sizes and cursors. Pure and deterministic —
 * the caller hands the result to the {@link TerminalBaselineStreamScheduler}
 * for credit-windowed delivery.
 *
 * `maxCursorDigits` bounds the cursor/index digit width in the overhead
 * estimate so every chunk's real envelope stays under the budget.
 */
export function composeTerminalBaselineStream(input: {
  readonly terminalId: string;
  readonly watchId: string;
  readonly result: Extract<RemoteTerminalWatchResult, { status: "ready" }>;
  readonly resume: { readonly generation: string; readonly cursor: number } | undefined;
  readonly maxChunkBytes: number | undefined;
  readonly maxWindowBytes: number | undefined;
}): {
  readonly chunks: ReadonlyArray<RemoteTerminalWatchBaselineChunk>;
  readonly messages: readonly string[];
  readonly messageBytes: readonly number[];
  readonly throughCursors: readonly number[];
  readonly finalCursor: number;
  readonly windowBytes: number;
  readonly resumeServed: boolean;
} {
  const { terminalId, watchId, result, resume } = input;
  const { resumeServed, sliceFromCursor } = resolveTerminalBaselineResume({
    resume,
    generation: result.generation,
    fromCursor: result.fromCursor,
    toCursor: result.toCursor,
  });
  const baselineData = resumeServed
    ? result.data.slice(resume!.cursor - result.fromCursor)
    : result.data;
  const budgetBytes = clampTerminalBaselineChunkBytes(input.maxChunkBytes);
  const windowBytes = clampTerminalBaselineWindowBytes(input.maxWindowBytes, budgetBytes);

  // Conservative fixed-envelope estimate: widest realistic cursor/index digits
  // so a chunk's true envelope can only be smaller than budget - overhead.
  const overheadTemplate: Omit<RemoteTerminalWatchBaselineChunk, "data"> = {
    version: TERMINAL_CURSOR_SYNC_V2_VERSION,
    watchId,
    generation: result.generation,
    chunkIndex: 88888,
    chunkCount: 88888,
    fromCursor: 8888888888,
    toCursor: 8888888888,
    processState: result.processState,
    terminalSize: result.terminalSize,
    resumeServed,
  };
  const overheadBytes = terminalBaselineChunkEnvelopeOverheadBytes(terminalId, overheadTemplate);

  const pieces = sliceTerminalBaselineChunks({
    data: baselineData,
    fromCursor: sliceFromCursor,
    budgetBytes,
    envelopeOverheadBytes: overheadBytes,
  });
  const chunks = pieces.map<RemoteTerminalWatchBaselineChunk>((piece, index) => ({
    version: TERMINAL_CURSOR_SYNC_V2_VERSION,
    watchId,
    generation: result.generation,
    chunkIndex: index,
    chunkCount: pieces.length,
    fromCursor: piece.fromCursor,
    toCursor: piece.toCursor,
    data: piece.data,
    processState: result.processState,
    terminalSize: result.terminalSize,
    resumeServed,
  }));
  const messages = chunks.map((chunk) =>
    JSON.stringify(buildTerminalBaselineChunkMessage(terminalId, chunk)),
  );
  return {
    chunks,
    messages,
    messageBytes: messages.map((message) => Buffer.byteLength(message, "utf8")),
    throughCursors: chunks.map((chunk) => chunk.toCursor),
    finalCursor: result.toCursor,
    windowBytes,
    resumeServed,
  };
}
