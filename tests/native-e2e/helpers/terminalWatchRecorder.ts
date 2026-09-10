import { TERMINAL_CURSOR_SYNC_VERSION } from "../../../src/shared/remote/protocol.ts";

/** State machine for reliable (cursor-sync) terminal watches: assembles
 * cursor-sync output ranges, tracks contiguity violations, and converges on a
 * final absolute cursor. Pure observer — the socket client feeds it frames. */

export interface TerminalCursorRange {
  readonly fromCursor: number;
  readonly toCursor: number;
  readonly generation: string | null;
  readonly watchId: string;
}

export interface TerminalContiguityViolation {
  readonly fromCursor: number;
  readonly toCursor: number;
  readonly generation: string | null;
  /** The chaining base the range failed to append to. */
  readonly expectedFromCursor: number | null;
  readonly expectedGeneration: string | null;
}

export interface TerminalWatchState {
  readonly watchId: string;
  readyResult: Record<string, unknown> | null;
  errorResult: Record<string, unknown> | null;
  readonly ranges: TerminalCursorRange[];
  assembledText: string;
  finalCursor: number | null;
  contiguityViolations: number;
  /** Details of the most recent contiguity violations (bounded). Under
   * cursor-sync v2 a duplicate/overlap re-delivery is legal (the real client
   * ignores duplicates and resyncs on gaps), so violation counts are asserted
   * with a tolerance and the samples make the evidence inspectable. */
  readonly violations: TerminalContiguityViolation[];
}

export class TerminalWatchRecorder {
  private readonly states = new Map<string, TerminalWatchState>();

  ensure(watchId: string): TerminalWatchState {
    const existing = this.states.get(watchId);
    if (existing) return existing;
    const state: TerminalWatchState = {
      watchId,
      readyResult: null,
      errorResult: null,
      ranges: [],
      assembledText: "",
      finalCursor: null,
      contiguityViolations: 0,
      violations: [],
    };
    this.states.set(watchId, state);
    return state;
  }

  state(watchId: string): TerminalWatchState | null {
    return this.states.get(watchId) ?? null;
  }

  /** Sends a reliable watch request and resolves with its `ready` payload. */
  async install(input: {
    readonly label: string;
    readonly terminalId: string;
    readonly watchId: string;
    readonly send: (message: Record<string, unknown>) => void;
    readonly timeoutMs?: number;
  }): Promise<Record<string, unknown>> {
    this.ensure(input.watchId);
    input.send({
      type: "terminal-watch",
      id: input.terminalId,
      cursorSync: { watchId: input.watchId, version: TERMINAL_CURSOR_SYNC_VERSION },
    });
    const deadline = Date.now() + (input.timeoutMs ?? 15_000);
    for (;;) {
      const state = this.states.get(input.watchId);
      if (state?.errorResult) {
        throw new Error(
          `${input.label}: terminal watch ${input.watchId} failed: ${JSON.stringify(state.errorResult)}`,
        );
      }
      if (state?.readyResult) return state.readyResult;
      if (Date.now() > deadline) {
        throw new Error(`${input.label}: terminal watch ${input.watchId} never became ready.`);
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  /** Handles a `terminal-output` frame carrying `cursorSync`. */
  observeTerminalOutput(message: Record<string, unknown>): void {
    const sync = message.cursorSync as Record<string, unknown> | undefined;
    if (!sync || typeof sync.watchId !== "string") return;
    const state = this.states.get(sync.watchId);
    if (!state) return;
    const data = typeof message.data === "string" ? message.data : "";
    const fromCursor = typeof sync.fromCursor === "number" ? sync.fromCursor : null;
    const toCursor = typeof sync.toCursor === "number" ? sync.toCursor : null;
    const generation = typeof sync.generation === "string" ? sync.generation : null;
    if (fromCursor === null || toCursor === null) return;
    const previous = state.ranges[state.ranges.length - 1] ?? null;
    const base = previous
      ? { generation: previous.generation, toCursor: previous.toCursor }
      : state.readyResult
        ? {
            generation:
              typeof state.readyResult.generation === "string"
                ? state.readyResult.generation
                : null,
            toCursor:
              typeof state.readyResult.toCursor === "number" ? state.readyResult.toCursor : 0,
          }
        : null;
    const appendable =
      base !== null &&
      generation !== null &&
      base.generation !== null &&
      base.generation === generation &&
      fromCursor === base.toCursor;
    if (!appendable) {
      state.contiguityViolations += 1;
      state.violations.push({
        fromCursor,
        toCursor,
        generation,
        expectedFromCursor: base?.toCursor ?? null,
        expectedGeneration: base?.generation ?? null,
      });
      if (state.violations.length > 8) state.violations.shift();
    }
    state.ranges.push({ fromCursor, toCursor, generation, watchId: sync.watchId });
    if (appendable) {
      state.assembledText += data;
      state.finalCursor = toCursor;
    }
  }

  /** Handles a `terminal-watch-result` frame carrying `cursorSync`. */
  observeTerminalWatchResult(message: Record<string, unknown>): void {
    const sync = message.cursorSync as Record<string, unknown> | undefined;
    if (!sync || typeof sync.watchId !== "string") return;
    const state = this.states.get(sync.watchId);
    if (!state) return;
    const result = sync.result as Record<string, unknown> | undefined;
    if (!result) return;
    if (result.status === "error") {
      state.errorResult = result;
      return;
    }
    if (result.status !== "ready") return;
    state.readyResult = result;
    const data = typeof result.data === "string" ? result.data : "";
    state.assembledText = data;
    state.finalCursor = typeof result.toCursor === "number" ? result.toCursor : null;
  }
}
