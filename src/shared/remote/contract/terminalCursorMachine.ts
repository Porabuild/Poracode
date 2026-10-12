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

export interface TerminalCursorFrame {
  readonly kind: TerminalCursorFrameKind;
  readonly terminalId: string;
  readonly watchId: string;
  readonly generation: string | null;
  readonly fromCursor: number;
  readonly toCursor: number;
  readonly data: string;
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
): TerminalCursorState {
  return {
    watchId,
    baselineReceived: true,
    generation,
    toCursor,
    transcript: boundedTerminalCursorTail(transcript),
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
  return result(next, overlap === 0 ? "append" : "append-unseen-suffix", suffix);
}

function replaceBaseline(
  state: TerminalCursorState,
  frame: TerminalCursorFrame,
): TerminalCursorResult {
  let next = terminalCursorEstablished(state.watchId, frame.generation, frame.toCursor, frame.data);
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
    const frame: TerminalCursorFrame = {
      kind: "output",
      terminalId,
      watchId,
      generation,
      fromCursor,
      toCursor,
      data,
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
    const frame: TerminalCursorFrame = {
      kind: "baseline",
      terminalId,
      watchId,
      generation,
      fromCursor,
      toCursor,
      data,
    };
    return isValidTerminalCursorFrame(frame) ? frame : null;
  }

  return null;
}
