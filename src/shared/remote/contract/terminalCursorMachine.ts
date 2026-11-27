/**
 * Executable TS reference for the terminal-cursor reconciliation machine spec
 * (`terminalCursorMachineSpec.ts`). The native Swift/Kotlin sources in the
 * generated bundles are rendered from the same tables by
 * `contract/native/emitTerminalCursor{Swift,Kotlin}.ts`; the contract tests run
 * this executor against the shared parity tape
 * (`protocol/remote/v3/fixtures/terminal-cursor-sequence.json`) and pin the
 * generated sources to the same actions, reasons, and bounds.
 *
 * This module replaces the hand-written client reconciler triplet: the iOS
 * (`TerminalCursorReconciler.swift`) and Android (`TerminalCursorReconciler.kt`)
 * decision code now ships generated. The per-platform JSON frame decoders stay
 * hand-written coordinators; `decodeTerminalCursorFrameMessage` here is the
 * normative reference they are tested against.
 */

import {
  TERMINAL_CURSOR_BOUNDS,
  TERMINAL_CURSOR_MACHINE_SPEC,
  validateTerminalCursorMachineSpec,
  type TerminalCursorAction,
  type TerminalCursorFrameKind,
  type TerminalCursorResyncReason,
  type TerminalCursorResultReason,
  type TerminalCursorRule,
} from "./terminalCursorMachineSpec";
import {
  MAX_TERMINAL_COLUMN_CHANGES,
  TerminalColumnHistory,
  knownTerminalColumns,
  type TerminalColumnChange,
} from "../../terminalColumnHistory";

export interface TerminalCursorFrame {
  readonly kind: TerminalCursorFrameKind;
  readonly terminalId: string;
  readonly watchId: string;
  readonly generation: string | null;
  readonly fromCursor: number;
  readonly toCursor: number;
  readonly data: string;
  /**
   * Optional observed-width markers in absolute UTF-16 cursor space: each
   * entry's width applies from its `fromCursor` until the next entry, with
   * `columns: null` an unknown span. Only nonempty spans carry width; absent
   * or all-unknown geometry stays widthless. Stale, duplicate, and
   * generation-mismatched frames never apply it.
   */
  readonly columnChanges?: readonly TerminalColumnChange[];
}

export interface TerminalCursorPosition {
  readonly generation: string | null;
  readonly toCursor: number;
}

export interface TerminalCursorState {
  readonly watchId: string;
  readonly baselineReceived: boolean;
  readonly generation: string | null;
  readonly toCursor: number;
  /** Bounded display tail; cursor positions remain absolute after trimming. */
  readonly transcript: string;
  /**
   * Bounded width history over the retained transcript window, in the same
   * marker form as `TerminalSnapshot.columnChanges`. Absent when every
   * retained span is widthless.
   */
  readonly columnChanges?: readonly TerminalColumnChange[];
  readonly bufferedOutput: readonly TerminalCursorFrame[];
  readonly bufferedUtf16Units: number;
  readonly needsResync: boolean;
}

export interface TerminalCursorResult {
  readonly state: TerminalCursorState;
  readonly action: TerminalCursorAction;
  readonly appendedText: string;
  readonly reason: TerminalCursorResultReason | null;
}

export function terminalCursorWatching(watchId: string): TerminalCursorState {
  return {
    watchId,
    baselineReceived: false,
    generation: null,
    toCursor: 0,
    transcript: "",
    bufferedOutput: [],
    bufferedUtf16Units: 0,
    needsResync: false,
  };
}

export function terminalCursorEstablished(
  watchId: string,
  generation: string | null,
  toCursor: number,
  transcript = "",
  columnChanges?: readonly TerminalColumnChange[],
): TerminalCursorState {
  const tail = boundedTerminalCursorTail(transcript);
  const normalized = normalizeColumnChanges(toCursor, tail.length, columnChanges);
  return {
    watchId,
    baselineReceived: true,
    generation,
    toCursor,
    transcript: tail,
    ...(normalized === undefined ? {} : { columnChanges: normalized }),
    bufferedOutput: [],
    bufferedUtf16Units: 0,
    needsResync: false,
  };
}

/** `frame.fromCursor >= 0 && toCursor >= fromCursor && the range matches the
 * UTF-16 length of `data`. */
export function isValidTerminalCursorFrame(frame: TerminalCursorFrame): boolean {
  return (
    frame.fromCursor >= 0 &&
    frame.toCursor >= frame.fromCursor &&
    frame.toCursor - frame.fromCursor === frame.data.length
  );
}

export function isStaleTerminalCursorFrame(
  frame: TerminalCursorFrame,
  currentWatchId: string,
): boolean {
  return frame.watchId !== currentWatchId;
}

export function isAppendCompatibleTerminalCursor(
  previous: TerminalCursorPosition | null,
  frame: TerminalCursorFrame,
): boolean {
  if (previous === null) return true;
  return previous.generation === frame.generation && previous.toCursor === frame.fromCursor;
}

/**
 * Bounded display tail in UTF-16 code units. Drops whole units from the front,
 * never splitting a surrogate pair: when the bound would cut between a high and
 * a low surrogate, one more unit is dropped (mirroring the Swift `String.Index`
 * validity search the hand-written reconciler used).
 */
export function boundedTerminalCursorTail(value: string): string {
  const count = value.length;
  if (count <= TERMINAL_CURSOR_BOUNDS.maximumTranscriptUtf16Units) return value;
  let dropped = count - TERMINAL_CURSOR_BOUNDS.maximumTranscriptUtf16Units;
  while (dropped <= count && cutSplitsSurrogatePair(value, dropped)) dropped += 1;
  return dropped > count ? "" : value.slice(dropped);
}

function cutSplitsSurrogatePair(value: string, offset: number): boolean {
  if (offset <= 0 || offset >= value.length) return false;
  const before = value.charCodeAt(offset - 1);
  const at = value.charCodeAt(offset);
  return before >= 0xd800 && before <= 0xdbff && at >= 0xdc00 && at <= 0xdfff;
}

// ---------------------------------------------------------------------------
// Rule-table walk (mirrors the generated reconcilers)
// ---------------------------------------------------------------------------

interface GuardInputs {
  readonly state: TerminalCursorState;
  readonly frame: TerminalCursorFrame;
  readonly valid: boolean;
}

function guardMatches(guard: string, inputs: GuardInputs): boolean {
  const { state, frame, valid } = inputs;
  switch (guard) {
    case "always":
      return true;
    case "staleWatch":
      return frame.watchId !== state.watchId;
    case "invalidRange":
      return !valid;
    case "baselineResumeSuffix":
      return (
        frame.kind === "baseline" &&
        state.baselineReceived &&
        frame.generation !== null &&
        frame.generation === state.generation &&
        frame.fromCursor === state.toCursor
      );
    case "baseline":
      return frame.kind === "baseline";
    case "preBaselineWithoutGeneration":
      return frame.kind === "output" && !state.baselineReceived && frame.generation === null;
    case "preBaselineOverBudget": {
      if (frame.kind !== "output" || state.baselineReceived) return false;
      const added = frame.data.length;
      return (
        state.bufferedUtf16Units + added > TERMINAL_CURSOR_BOUNDS.maximumBufferedUtf16Units ||
        state.bufferedOutput.length + 1 > TERMINAL_CURSOR_BOUNDS.maximumBufferedFrames
      );
    }
    case "preBaseline":
      return frame.kind === "output" && !state.baselineReceived;
    case "pendingResync":
      return state.needsResync;
    case "generationChanged":
      return state.generation === null || frame.generation !== state.generation;
    case "upToDate":
      return frame.toCursor <= state.toCursor;
    case "cursorGap":
      return frame.fromCursor > state.toCursor;
    case "unappendableOverlap":
      return state.toCursor - frame.fromCursor > frame.data.length;
    default:
      return false;
  }
}

function ruleFor(state: TerminalCursorState, frame: TerminalCursorFrame): TerminalCursorRule {
  const inputs: GuardInputs = {
    state,
    frame,
    valid: isValidTerminalCursorFrame(frame),
  };
  for (const rule of TERMINAL_CURSOR_MACHINE_SPEC.rules) {
    if (rule.kind !== undefined && rule.kind !== frame.kind) continue;
    if (guardMatches(rule.guard, inputs)) return rule;
  }
  // validateTerminalCursorMachineSpec guarantees the append-suffix catch-all.
  throw new Error("terminal-cursor rule table has no catch-all");
}

function result(
  state: TerminalCursorState,
  action: TerminalCursorAction,
  appendedText = "",
  reason: TerminalCursorResultReason | null = null,
): TerminalCursorResult {
  return { state, action, appendedText, reason };
}

function resync(
  state: TerminalCursorState,
  reason: TerminalCursorResyncReason,
  clearBufferedOutput = false,
): TerminalCursorResult {
  return result(
    {
      ...state,
      ...(clearBufferedOutput ? { bufferedOutput: [], bufferedUtf16Units: 0 } : {}),
      needsResync: true,
    },
    "resync",
    "",
    reason,
  );
}

/**
 * Absolute UTF-16 start of the window a retained tail covers
 * (`[toCursor - transcriptLength, toCursor)`), or null when the position
 * cannot be expressed — synthetic seeds whose tail outruns `toCursor`, or
 * unsafe cursor arithmetic. Width geometry is dropped, never guessed.
 */
function tailWindowStart(toCursor: number, transcriptLength: number): number | null {
  if (!Number.isSafeInteger(toCursor) || toCursor < 0) return null;
  const from = toCursor - transcriptLength;
  return Number.isSafeInteger(from) && from >= 0 ? from : null;
}

/** Marker lists keep explicit null gaps only while some span is known. */
function knownColumnChanges(
  changes: readonly TerminalColumnChange[],
): readonly TerminalColumnChange[] | undefined {
  return changes.some((change) => change.columns !== null) ? changes : undefined;
}

/** Records markers only over a provably valid absolute range. */
function recordGeometryWindow(
  history: TerminalColumnHistory,
  fromCursor: number,
  toCursor: number,
  changes: readonly TerminalColumnChange[] | undefined,
): void {
  if (
    Number.isSafeInteger(fromCursor) &&
    Number.isSafeInteger(toCursor) &&
    fromCursor >= 0 &&
    toCursor >= fromCursor
  ) {
    history.recordChanges(fromCursor, toCursor, changes);
  }
}

/**
 * Normalizes caller-supplied markers to the actual bounded raw tail: the
 * window clips out-of-range prefixes, malformed or all-unknown geometry
 * collapses to absent, and an unpositionable window drops the layout.
 */
function normalizeColumnChanges(
  toCursor: number,
  transcriptLength: number,
  changes: readonly TerminalColumnChange[] | undefined,
): readonly TerminalColumnChange[] | undefined {
  if (changes === undefined) return undefined;
  const from = tailWindowStart(toCursor, transcriptLength);
  if (from === null) return undefined;
  const history = new TerminalColumnHistory();
  history.recordChanges(from, toCursor, changes);
  return knownColumnChanges(history.snapshot(from, toCursor));
}

/**
 * Fold accepted width geometry into `next`'s retained window.
 *
 * The previous state's markers are re-recorded over its own retained window
 * `[toCursor - transcript.length, toCursor)` — skipped when that synthetic
 * window cannot be positioned — so trimming keeps the width at the new left
 * edge; the frame's markers then apply only over the accepted unseen suffix
 * `[previous.toCursor, frame.toCursor)` (or are normalized into the bounded
 * tail on replace), with the last marker at or before the left edge supplying
 * the width there. `TerminalColumnHistory.recordChanges` validates ordering
 * and column bounds up front — malformed optional metadata leaves that range
 * widthless instead of partially applied — records known spans only,
 * coalesces contiguous equal widths, and keeps at most the shared
 * 1024-span retention. The snapshot is clipped to the actual bounded UTF-16
 * tail and emits explicit null gaps only when some width is known;
 * all-unknown geometry removes the property entirely.
 */
function applyGeometry(
  next: TerminalCursorState,
  frame: TerminalCursorFrame,
  previous: TerminalCursorState,
): TerminalCursorState {
  if (frame.columnChanges === undefined && previous.columnChanges === undefined) {
    return next;
  }
  const { columnChanges: _prior, ...withoutColumns } = next;
  const from = tailWindowStart(next.toCursor, next.transcript.length);
  if (from === null) return withoutColumns;
  const history = new TerminalColumnHistory();
  const previousFrom = tailWindowStart(previous.toCursor, previous.transcript.length);
  if (previousFrom !== null) {
    recordGeometryWindow(history, previousFrom, previous.toCursor, previous.columnChanges);
  }
  recordGeometryWindow(history, previous.toCursor, frame.toCursor, frame.columnChanges);
  const changes = knownColumnChanges(history.snapshot(from, next.toCursor));
  return changes === undefined ? withoutColumns : { ...withoutColumns, columnChanges: changes };
}

/** Append `frame`'s unseen suffix under an established, matching generation.
 * Shared by the output path, the baseline replay, and the v2 resume suffix. */
function appendOutput(
  state: TerminalCursorState,
  frame: TerminalCursorFrame,
): TerminalCursorResult {
  if (state.generation === null || frame.generation !== state.generation) {
    return resync(state, "generation-changed");
  }
  if (frame.toCursor <= state.toCursor) return result(state, "ignore");
  if (frame.fromCursor > state.toCursor) return resync(state, "cursor-gap");
  const overlap = state.toCursor - frame.fromCursor;
  if (overlap > frame.data.length) return resync(state, "invalid-utf16-boundary");
  const suffix = frame.data.slice(overlap);
  const next: TerminalCursorState = {
    ...state,
    toCursor: frame.toCursor,
    transcript: boundedTerminalCursorTail(state.transcript + suffix),
  };
  return result(
    applyGeometry(next, frame, state),
    overlap === 0 ? "append" : "append-unseen-suffix",
    suffix,
  );
}

function replaceBaseline(
  state: TerminalCursorState,
  frame: TerminalCursorFrame,
): TerminalCursorResult {
  // `established` normalizes the frame's markers onto the bounded tail.
  let next = terminalCursorEstablished(
    state.watchId,
    frame.generation,
    frame.toCursor,
    frame.data,
    frame.columnChanges,
  );
  // Buffered pre-baseline frames replay only under a durable generation; the
  // first resync aborts the replay.
  if (frame.generation !== null) {
    for (const buffered of state.bufferedOutput) {
      const replay = appendOutput(next, buffered);
      next = replay.state;
      if (replay.action === "resync") break;
    }
  }
  return result(next, "replace");
}

/**
 * THE reconciliation entry point. Pure: the caller owns transports, stores,
 * and refresh scheduling, and reads `result.reason != null` to decide whether
 * an authoritative refresh is due.
 */
export function reconcileTerminalCursor(
  state: TerminalCursorState,
  frame: TerminalCursorFrame,
): TerminalCursorResult {
  const errors = validateTerminalCursorMachineSpec(TERMINAL_CURSOR_MACHINE_SPEC);
  if (errors.length > 0)
    throw new Error(`terminal-cursor machine spec is invalid: ${errors.join("; ")}`);
  const rule = ruleFor(state, frame);
  switch (rule.effect) {
    case "ignore":
      return result(state, "ignore", "", rule.reason ?? null);
    case "resync":
      // The validator rejects stale-watch on resync effects; narrow here.
      return resync(
        state,
        rule.reason as TerminalCursorResyncReason,
        rule.clearBufferedOutput === true,
      );
    case "buffer": {
      const next: TerminalCursorState = {
        ...state,
        bufferedOutput: [...state.bufferedOutput, frame],
        bufferedUtf16Units: state.bufferedUtf16Units + frame.data.length,
      };
      return result(next, "buffer");
    }
    case "replace":
      return replaceBaseline(state, frame);
    case "resumeSuffix": {
      const appended = appendOutput(state, frame);
      if (appended.action === "resync") return appended;
      return {
        ...appended,
        state: { ...appended.state, needsResync: false },
      };
    }
    case "appendSuffix":
      return appendOutput(state, frame);
  }
}

// ---------------------------------------------------------------------------
// Frame-message decoder (normative reference for the hand-written decoders)
// ---------------------------------------------------------------------------

function requiredString(
  object: Record<string, unknown>,
  key: string,
  allowEmpty = true,
): string | null {
  const value = object[key];
  if (typeof value !== "string") return null;
  if (!allowEmpty && value.length === 0) return null;
  return value;
}

function exactInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  return value;
}

/**
 * Validates an optional `columnChanges` marker list against the same rules
 * `TerminalColumnHistory.recordChanges` enforces: nonnegative safe-integer
 * cursors in non-decreasing order, and `columns` either null or a known width
 * within the shared bounds. Any violation degrades the whole list to absent —
 * widthless — rather than partially applied.
 */
function decodeColumnChanges(value: unknown): readonly TerminalColumnChange[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_TERMINAL_COLUMN_CHANGES) {
    return undefined;
  }
  const changes: TerminalColumnChange[] = [];
  let previousCursor = -1;
  for (const item of value) {
    if (typeof item !== "object" || item === null) return undefined;
    const marker = item as Record<string, unknown>;
    const fromCursor = exactInt(marker.fromCursor);
    if (fromCursor === null || fromCursor < 0 || fromCursor < previousCursor) {
      return undefined;
    }
    let columns: number | null = null;
    if (marker.columns !== null) {
      if (typeof marker.columns !== "number") return undefined;
      const known = knownTerminalColumns(marker.columns);
      if (known === null) return undefined;
      columns = known;
    }
    previousCursor = fromCursor;
    changes.push({ fromCursor, columns });
  }
  return changes;
}

/** Decodes a `terminal-output` cursor frame or a ready `terminal-watch-result`
 * baseline from a parsed server-message object. Returns null for anything else
 * — the hand-written decoders map that to their platform error convention. */
export function decodeTerminalCursorFrameMessage(value: unknown): TerminalCursorFrame | null {
  if (typeof value !== "object" || value === null) return null;
  const object = value as Record<string, unknown>;
  const type = requiredString(object, "type");
  const terminalId = requiredString(object, "id", false);
  if (!type || !terminalId) return null;
  const sync = object.cursorSync;
  if (typeof sync !== "object" || sync === null) return null;
  const syncObject = sync as Record<string, unknown>;
  if (exactInt(syncObject.version) !== 1) return null;
  const watchId = requiredString(syncObject, "watchId", false);
  if (!watchId) return null;

  if (type === "terminal-output") {
    const data = requiredString(object, "data");
    const generation = requiredString(syncObject, "generation", false);
    if (!data || !generation) return null;
    const fromCursor = exactInt(syncObject.fromCursor);
    const toCursor = exactInt(syncObject.toCursor);
    if (fromCursor === null || toCursor === null) return null;
    // A usable live width becomes one marker at the frame's left edge; an
    // absent, empty-range, or out-of-bounds scalar stays widthless.
    const columns =
      data.length > 0 && typeof syncObject.terminalColumns === "number"
        ? knownTerminalColumns(syncObject.terminalColumns)
        : null;
    const frame: TerminalCursorFrame = {
      kind: "output",
      terminalId,
      watchId,
      generation,
      fromCursor,
      toCursor,
      data,
      ...(columns === null ? {} : { columnChanges: [{ fromCursor, columns }] }),
    };
    return isValidTerminalCursorFrame(frame) ? frame : null;
  }

  if (type === "terminal-watch-result") {
    const watchResult = syncObject.result;
    if (typeof watchResult !== "object" || watchResult === null) return null;
    const resultObject = watchResult as Record<string, unknown>;
    if (requiredString(resultObject, "status") !== "ready") return null;
    const data = requiredString(resultObject, "data");
    const fromCursor = exactInt(resultObject.fromCursor);
    const toCursor = exactInt(resultObject.toCursor);
    if (!data || fromCursor === null || toCursor === null) return null;
    if (!("generation" in resultObject)) return null;
    const rawGeneration = resultObject.generation;
    let generation: string | null = null;
    if (rawGeneration !== null) {
      if (typeof rawGeneration !== "string" || rawGeneration.length === 0) return null;
      generation = rawGeneration;
    }
    const columnChanges =
      data.length > 0 ? decodeColumnChanges(resultObject.columnChanges) : undefined;
    const frame: TerminalCursorFrame = {
      kind: "baseline",
      terminalId,
      watchId,
      generation,
      fromCursor,
      toCursor,
      data,
      ...(columnChanges === undefined ? {} : { columnChanges }),
    };
    return isValidTerminalCursorFrame(frame) ? frame : null;
  }

  return null;
}
