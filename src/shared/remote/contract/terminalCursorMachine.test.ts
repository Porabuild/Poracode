import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { emitKotlinTerminalCursorMachine } from "./native/emitTerminalCursorKotlin";
import { emitSwiftTerminalCursorMachine } from "./native/emitTerminalCursorSwift";
import {
  boundedTerminalCursorTail,
  decodeTerminalCursorFrameMessage,
  isAppendCompatibleTerminalCursor,
  isStaleTerminalCursorFrame,
  isValidTerminalCursorFrame,
  reconcileTerminalCursor,
  terminalCursorEstablished,
  terminalCursorWatching,
  type TerminalCursorFrame,
  type TerminalCursorState,
} from "./terminalCursorMachine";
import { MAX_TERMINAL_COLUMN_CHANGES } from "../../terminalColumnHistory";
import {
  TERMINAL_CURSOR_MACHINE_SPEC,
  validateTerminalCursorMachineSpec,
} from "./terminalCursorMachineSpec";

const here = dirname(fileURLToPath(import.meta.url));
const tapePath = join(
  here,
  "../../../../protocol/remote/v3/fixtures/terminal-cursor-sequence.json",
);

interface TapeStep {
  readonly id: string;
  readonly currentWatchId: string;
  readonly previous: { generation?: string | null; toCursor: number } | null;
  readonly message: unknown;
  readonly expected: { stale: boolean; appendCompatible: boolean; consumerAction: string };
}

function loadTape(): ReadonlyArray<TapeStep> {
  return (JSON.parse(readFileSync(tapePath, "utf8")) as { steps: TapeStep[] }).steps;
}

function frame(
  kind: TerminalCursorFrame["kind"],
  overrides: Partial<TerminalCursorFrame> = {},
): TerminalCursorFrame {
  return {
    kind,
    terminalId: "terminal",
    watchId: "watch",
    generation: "generation",
    fromCursor: 0,
    toCursor: 0,
    data: "",
    ...overrides,
  };
}

describe("terminal-cursor machine spec", () => {
  it("is self-consistent: ordered guards, resync reasons, catch-all last", () => {
    expect(validateTerminalCursorMachineSpec(TERMINAL_CURSOR_MACHINE_SPEC)).toEqual([]);
  });

  it("fails closed when the catch-all leaves the table", () => {
    const broken = {
      ...TERMINAL_CURSOR_MACHINE_SPEC,
      rules: TERMINAL_CURSOR_MACHINE_SPEC.rules.slice(0, -1),
    };
    expect(validateTerminalCursorMachineSpec(broken)).toContain(
      "the rule table must end with the append-suffix catch-all",
    );
  });

  it("fails closed when a resync rule forgets its reason", () => {
    const broken = {
      ...TERMINAL_CURSOR_MACHINE_SPEC,
      rules: TERMINAL_CURSOR_MACHINE_SPEC.rules.map((rule) => {
        if (rule.id !== "cursor-gap") return rule;
        // Drop the optional property (exactOptionalPropertyTypes forbids an
        // explicit undefined).
        const { reason: _dropped, ...withoutReason } = rule;
        return withoutReason;
      }),
    };
    expect(validateTerminalCursorMachineSpec(broken)).toContain(
      "resync rule cursor-gap must name a reason",
    );
  });

  it("does not feed the wire IR: no route, procedure, or schema lives in the spec", () => {
    const serialized = JSON.stringify(TERMINAL_CURSOR_MACHINE_SPEC);
    expect(serialized).not.toContain("jsonSchema");
    expect(serialized).not.toContain("httpRoutes");
  });
});

interface TapeOutcome {
  readonly action: string;
  readonly appendedText: string;
  readonly toCursor: number;
  readonly needsResync: boolean;
  readonly reason: string | null;
  readonly generation: string | null;
  readonly transcript: string;
}

function runTapeStep(step: TapeStep): TapeOutcome {
  const decoded = decodeTerminalCursorFrameMessage(step.message);
  if (!decoded) throw new Error(`${step.id}: the frame message did not decode`);
  if (isStaleTerminalCursorFrame(decoded, step.currentWatchId) !== step.expected.stale) {
    throw new Error(`${step.id}: stale mismatch`);
  }
  const previous = step.previous
    ? { generation: step.previous.generation ?? null, toCursor: step.previous.toCursor }
    : null;
  if (isAppendCompatibleTerminalCursor(previous, decoded) !== step.expected.appendCompatible) {
    throw new Error(`${step.id}: appendCompatible mismatch`);
  }
  const state = previous
    ? terminalCursorEstablished(step.currentWatchId, previous.generation, previous.toCursor, "seed")
    : terminalCursorWatching(step.currentWatchId);
  const result = reconcileTerminalCursor(state, decoded);
  return {
    action: result.action,
    appendedText: result.appendedText,
    toCursor: result.state.toCursor,
    needsResync: result.state.needsResync,
    reason: result.reason,
    generation: result.state.generation,
    transcript: result.state.transcript,
  };
}

describe("terminal-cursor parity tape", () => {
  it("runs every shared fixture step to the expected consumer action", () => {
    const steps = loadTape();
    const outcomes = new Map(steps.map((step) => [step.id, runTapeStep(step)]));
    const expected = new Map(steps.map((step) => [step.id, step.expected.consumerAction]));
    expect(Object.fromEntries([...outcomes].map(([id, o]) => [id, o.action]))).toEqual(
      Object.fromEntries(expected),
    );
  });

  it("matches the pinned per-step outcomes", () => {
    const outcomes = new Map(loadTape().map((step) => [step.id, runTapeStep(step)]));
    expect(outcomes.get("overlap")).toEqual({
      action: "append-unseen-suffix",
      appendedText: "xy",
      toCursor: 9,
      needsResync: false,
      reason: null,
      generation: "generation-a",
      transcript: "seedxy",
    });
    expect(outcomes.get("stale-watch")).toMatchObject({
      action: "ignore",
      needsResync: false,
      reason: "stale-watch",
    });
    expect(outcomes.get("null-generation")).toMatchObject({
      action: "replace",
      generation: null,
      transcript: "tail",
    });
    expect(outcomes.get("gap")?.needsResync).toBe(true);
    expect(outcomes.get("generation-change")?.needsResync).toBe(true);
  });
});

describe("terminal-cursor decision edges", () => {
  it("arms a resync on an invalid range and reports the reason", () => {
    const state = terminalCursorWatching("watch");
    const invalid = frame("output", { fromCursor: -1, toCursor: 0 });
    expect(isValidTerminalCursorFrame(invalid)).toBe(false);
    const result = reconcileTerminalCursor(state, invalid);
    expect(result.action).toBe("resync");
    expect(result.reason).toBe("invalid-range");
    expect(result.state.needsResync).toBe(true);
  });

  it("buffers pre-baseline output under a generation and replays it on the baseline", () => {
    let state = terminalCursorWatching("watch");
    const early = frame("output", { fromCursor: 5, toCursor: 8, data: "😀!" });
    state = reconcileTerminalCursor(state, early).state;
    expect(state.bufferedOutput).toHaveLength(1);
    expect(state.bufferedUtf16Units).toBe(3);
    const baseline = frame("baseline", { fromCursor: 0, toCursor: 5, data: "A😀é" });
    const replaced = reconcileTerminalCursor(state, baseline);
    expect(replaced.action).toBe("replace");
    expect(replaced.state.toCursor).toBe(8);
    expect(replaced.state.transcript).toBe("A😀é😀!");
  });

  it("drops an over-budget pre-baseline buffer and arms the resync", () => {
    let state = terminalCursorWatching("watch");
    const zero = frame("output", { fromCursor: 0, toCursor: 0, data: "" });
    for (let i = 0; i < TERMINAL_CURSOR_MACHINE_SPEC.bounds.maximumBufferedFrames; i += 1) {
      state = reconcileTerminalCursor(state, zero).state;
    }
    const overflow = reconcileTerminalCursor(state, zero);
    expect(overflow.action).toBe("resync");
    expect(overflow.reason).toBe("missing-baseline");
    expect(overflow.state.bufferedOutput).toHaveLength(0);
    expect(overflow.state.needsResync).toBe(true);
  });

  it("appends the v2 resume suffix at the durable position and clears a pending resync", () => {
    const drifted = {
      ...terminalCursorEstablished("watch", "generation-a", 108, "kept"),
      needsResync: true,
    };
    const continuation = frame("baseline", {
      generation: "generation-a",
      fromCursor: 108,
      toCursor: 111,
      data: "ijk",
    });
    const appended = reconcileTerminalCursor(drifted, continuation);
    expect(appended.action).toBe("append");
    expect(appended.state.needsResync).toBe(false);
    expect(appended.state.transcript).toBe("keptijk");

    const marker = frame("baseline", {
      generation: "generation-a",
      fromCursor: 111,
      toCursor: 111,
      data: "",
    });
    const current = reconcileTerminalCursor(appended.state, marker);
    expect(current.action).toBe("ignore");
    expect(current.state.needsResync).toBe(false);
  });

  it("replaces on generation change and keeps null-generation baselines replace-only", () => {
    const state = terminalCursorEstablished("watch", "generation-a", 108, "kept");
    const changed = reconcileTerminalCursor(
      state,
      frame("baseline", {
        generation: "generation-b",
        fromCursor: 108,
        toCursor: 111,
        data: "ijk",
      }),
    );
    expect(changed.action).toBe("replace");
    expect(changed.state.generation).toBe("generation-b");

    const nullGeneration = reconcileTerminalCursor(
      state,
      frame("baseline", { generation: null, fromCursor: 108, toCursor: 111, data: "ijk" }),
    );
    expect(nullGeneration.action).toBe("replace");
    expect(nullGeneration.state.generation).toBeNull();
  });

  it("resyncs on gaps, generation changes, and unappendable overlaps with reasons", () => {
    const state = terminalCursorEstablished("watch", "generation-a", 9, "kept");
    const gap = reconcileTerminalCursor(
      state,
      frame("output", { generation: "generation-a", fromCursor: 11, toCursor: 12, data: "z" }),
    );
    expect([gap.action, gap.reason]).toEqual(["resync", "cursor-gap"]);

    const changed = reconcileTerminalCursor(
      state,
      frame("output", { generation: "generation-b", fromCursor: 9, toCursor: 11, data: "ok" }),
    );
    expect([changed.action, changed.reason]).toEqual(["resync", "generation-changed"]);
  });

  it("bounds the transcript tail in UTF-16 units without splitting a surrogate pair", () => {
    const oversized = `a${"😀".repeat(TERMINAL_CURSOR_MACHINE_SPEC.bounds.maximumTranscriptUtf16Units)}`;
    const bounded = boundedTerminalCursorTail(oversized);
    expect(bounded.length).toBeLessThanOrEqual(
      TERMINAL_CURSOR_MACHINE_SPEC.bounds.maximumTranscriptUtf16Units,
    );
    expect(() => new TextEncoder().encode(bounded)).not.toThrow();
    // The tail never begins with a low surrogate orphaned from its high half.
    const first = bounded.charCodeAt(0);
    expect(first >= 0xdc00 && first <= 0xdfff).toBe(false);
  });

  it("decodes neither frame kind from malformed messages", () => {
    expect(decodeTerminalCursorFrameMessage({ type: "terminal-output", id: "t" })).toBeNull();
    expect(
      decodeTerminalCursorFrameMessage({
        type: "terminal-watch-result",
        id: "t",
        cursorSync: { version: 2, watchId: "w" },
      }),
    ).toBeNull();
  });
});

describe("terminal-cursor width geometry", () => {
  const heads = [
    { fromCursor: 0, columns: 48 },
    { fromCursor: 6, columns: 100 },
  ];
  const wide = "abcdef";
  const narrow = "ghijkl";

  it("replays buffered pre-baseline output with its own width markers", () => {
    let state = terminalCursorWatching("watch");
    const early = frame("output", {
      fromCursor: 6,
      toCursor: 12,
      data: narrow,
      columnChanges: [{ fromCursor: 6, columns: 100 }],
    });
    state = reconcileTerminalCursor(state, early).state;
    expect(state.bufferedOutput).toHaveLength(1);
    const baseline = frame("baseline", {
      fromCursor: 0,
      toCursor: 6,
      data: wide,
      columnChanges: [{ fromCursor: 0, columns: 48 }],
    });
    const replaced = reconcileTerminalCursor(state, baseline);
    expect(replaced.action).toBe("replace");
    expect(replaced.state.transcript).toBe(wide + narrow);
    expect(replaced.state.columnChanges).toEqual(heads);
  });

  it("keeps retained history through an empty rewatch resume and a suffix", () => {
    const installed = reconcileTerminalCursor(
      terminalCursorWatching("watch"),
      frame("baseline", {
        fromCursor: 0,
        toCursor: 6,
        data: wide,
        columnChanges: heads.slice(0, 1),
      }),
    ).state;
    // An up-to-date empty continuation ignores without touching geometry.
    const current = reconcileTerminalCursor(
      installed,
      frame("baseline", { fromCursor: 6, toCursor: 6, data: "", columnChanges: heads.slice(1) }),
    );
    expect(current.action).toBe("ignore");
    expect(current.state.columnChanges).toEqual([{ fromCursor: 0, columns: 48 }]);
    // A resume suffix appends only the unseen range's geometry.
    const suffix = reconcileTerminalCursor(
      current.state,
      frame("baseline", {
        fromCursor: 6,
        toCursor: 12,
        data: narrow,
        columnChanges: heads.slice(1),
      }),
    );
    expect(suffix.action).toBe("append");
    expect(suffix.state.columnChanges).toEqual(heads);
  });

  it("accepts only unseen geometry from an overlapping output", () => {
    const installed = reconcileTerminalCursor(
      terminalCursorWatching("watch"),
      frame("baseline", {
        fromCursor: 0,
        toCursor: 6,
        data: wide,
        columnChanges: heads.slice(0, 1),
      }),
    ).state;
    const overlap = frame("output", {
      fromCursor: 4,
      toCursor: 8,
      data: wide.slice(4) + narrow.slice(0, 2),
      columnChanges: [{ fromCursor: 4, columns: 100 }],
    });
    const result = reconcileTerminalCursor(installed, overlap);
    expect(result.action).toBe("append-unseen-suffix");
    expect(result.state.transcript).toBe(wide + narrow.slice(0, 2));
    // The marker inside the accepted overlap does not rewrite history; the
    // unseen suffix picks up the width at its left edge.
    expect(result.state.columnChanges).toEqual([
      { fromCursor: 0, columns: 48 },
      { fromCursor: 6, columns: 100 },
    ]);
  });

  it("marks a widthless suffix as an explicit unknown gap", () => {
    const installed = reconcileTerminalCursor(
      terminalCursorWatching("watch"),
      frame("baseline", {
        fromCursor: 0,
        toCursor: 6,
        data: wide,
        columnChanges: heads.slice(0, 1),
      }),
    ).state;
    const legacy = reconcileTerminalCursor(
      installed,
      frame("output", { fromCursor: 6, toCursor: 12, data: narrow }),
    );
    expect(legacy.action).toBe("append");
    expect(legacy.state.columnChanges).toEqual([
      { fromCursor: 0, columns: 48 },
      { fromCursor: 6, columns: null },
    ]);
  });

  it("drops malformed or out-of-order markers to widthless", () => {
    const installed = reconcileTerminalCursor(
      terminalCursorWatching("watch"),
      frame("baseline", {
        fromCursor: 0,
        toCursor: 6,
        data: wide,
        columnChanges: heads.slice(0, 1),
      }),
    ).state;
    for (const bad of [
      [
        { fromCursor: 8, columns: 100 },
        { fromCursor: 7, columns: 48 },
      ],
      [{ fromCursor: 6, columns: 5 }],
      [{ fromCursor: 6, columns: 401 }],
    ]) {
      const result = reconcileTerminalCursor(
        installed,
        frame("output", {
          fromCursor: 6,
          toCursor: 12,
          data: narrow,
          columnChanges: bad,
        }),
      );
      expect(result.state.columnChanges).toEqual([
        { fromCursor: 0, columns: 48 },
        { fromCursor: 6, columns: null },
      ]);
    }
  });

  it("clips geometry to the bounded UTF-16 tail without splitting a pair", () => {
    const bound = TERMINAL_CURSOR_MACHINE_SPEC.bounds.maximumTranscriptUtf16Units;
    // 200_000 units of 'a' plus a surrogate pair straddling the trim point.
    const data = "a".repeat(bound - 1) + "😀" + "b".repeat(10);
    const result = reconcileTerminalCursor(
      terminalCursorWatching("watch"),
      frame("baseline", {
        fromCursor: 0,
        toCursor: data.length,
        data,
        columnChanges: [
          { fromCursor: 0, columns: 48 },
          { fromCursor: bound - 1, columns: 100 },
        ],
      }),
    );
    expect(result.state.transcript.length).toBeLessThanOrEqual(bound);
    expect(result.state.transcript.charCodeAt(0)).not.toBe(0xde00);
    const windowStart = result.state.toCursor - result.state.transcript.length;
    const changes = result.state.columnChanges ?? [];
    expect(changes.length).toBeGreaterThan(0);
    expect(changes[0]!.fromCursor).toBe(windowStart);
    for (const marker of changes) {
      expect(marker.fromCursor).toBeGreaterThanOrEqual(windowStart);
      expect(marker.fromCursor).toBeLessThan(result.state.toCursor);
    }
  });

  it("never applies geometry on generation replacement, stale watch, or gaps", () => {
    const installed = reconcileTerminalCursor(
      terminalCursorWatching("watch"),
      frame("baseline", {
        fromCursor: 0,
        toCursor: 12,
        data: wide + narrow,
        columnChanges: heads,
      }),
    ).state;
    const replaced = reconcileTerminalCursor(
      installed,
      frame("baseline", {
        generation: "generation-b",
        fromCursor: 20,
        toCursor: 23,
        data: "new",
        columnChanges: [{ fromCursor: 20, columns: 100 }],
      }),
    );
    expect(replaced.action).toBe("replace");
    expect(replaced.state.columnChanges).toEqual([{ fromCursor: 20, columns: 100 }]);

    const stale = reconcileTerminalCursor(
      installed,
      frame("output", {
        watchId: "other",
        fromCursor: 12,
        toCursor: 15,
        data: "stl",
        columnChanges: [{ fromCursor: 12, columns: 100 }],
      }),
    );
    expect(stale.action).toBe("ignore");
    expect(stale.state.columnChanges).toEqual(heads);

    const gap = reconcileTerminalCursor(
      installed,
      frame("output", {
        fromCursor: 14,
        toCursor: 17,
        data: "gap",
        columnChanges: [{ fromCursor: 14, columns: 100 }],
      }),
    );
    expect(gap.action).toBe("resync");
    expect(gap.state.columnChanges).toEqual(heads);
  });

  it("bounds retained geometry under width churn", () => {
    // Alternating widths every unit: 3000 known spans exceed the 1024 retention.
    const data = "x".repeat(3000);
    const changes = Array.from({ length: 3000 }, (_, i) => ({
      fromCursor: i,
      columns: i % 2 === 0 ? 48 : 100,
    }));
    const result = reconcileTerminalCursor(
      terminalCursorWatching("watch"),
      frame("baseline", { fromCursor: 0, toCursor: 3000, data, columnChanges: changes }),
    );
    const retained = result.state.columnChanges ?? [];
    expect(retained.length).toBeLessThanOrEqual(MAX_TERMINAL_COLUMN_CHANGES);
    // The snapshot stays ordered inside the retained window.
    for (let i = 1; i < retained.length; i += 1) {
      expect(retained[i]!.fromCursor).toBeGreaterThan(retained[i - 1]!.fromCursor);
    }
    // Oldest known spans were evicted: the first known marker sits well inside.
    const firstKnown = retained.find((change) => change.columns !== null);
    expect(firstKnown!.fromCursor).toBeGreaterThan(0);
  });

  it("survives a synthetic seed whose tail outruns toCursor", () => {
    // terminalCursorEstablished('watch','g',1,'seed') is a supported seed, but
    // its retained window [1-4, 1) cannot be positioned. A tagged append must
    // preserve the raw result and drop the layout instead of throwing.
    const seeded = terminalCursorEstablished("watch", "g", 1, "seed");
    const appended = reconcileTerminalCursor(
      seeded,
      frame("output", {
        generation: "g",
        fromCursor: 1,
        toCursor: 2,
        data: "x",
        columnChanges: [{ fromCursor: 1, columns: 100 }],
      }),
    );
    expect(appended.action).toBe("append");
    expect(appended.state.transcript).toBe("seedx");
    expect(appended.state).not.toHaveProperty("columnChanges");

    // established() normalizes caller markers against the bounded tail:
    // unpositionable windows and all-unknown lists become absent.
    const unpositioned = terminalCursorEstablished("watch", "g", 1, "seed", [
      { fromCursor: 0, columns: 48 },
    ]);
    expect(unpositioned).not.toHaveProperty("columnChanges");
    const unknown = terminalCursorEstablished("watch", "g", 4, "seed", [
      { fromCursor: 0, columns: null },
    ]);
    expect(unknown).not.toHaveProperty("columnChanges");
  });

  it("clips established markers to the bounded tail's left edge", () => {
    const state = terminalCursorEstablished("watch", "g", 10, "01234", [
      { fromCursor: 0, columns: 48 },
      { fromCursor: 7, columns: 100 },
    ]);
    // Window [5, 10): the marker at 0 supplies the width at the left edge.
    expect(state.columnChanges).toEqual([
      { fromCursor: 5, columns: 48 },
      { fromCursor: 7, columns: 100 },
    ]);
    // Markers beyond the window clip away entirely.
    const trailing = terminalCursorEstablished("watch", "g", 10, "0123456789", [
      { fromCursor: 0, columns: 48 },
      { fromCursor: 12, columns: 100 },
    ]);
    expect(trailing.columnChanges).toEqual([{ fromCursor: 0, columns: 48 }]);
  });

  it("keeps only unseen geometry when the prior window cannot be positioned", () => {
    const bound = TERMINAL_CURSOR_MACHINE_SPEC.bounds.maximumTranscriptUtf16Units;
    // A synthetic state holding layout over an unpositionable window
    // (transcript longer than toCursor), rescued once trimming makes the new
    // tail positionable: only the unseen suffix's width survives.
    const seeded: TerminalCursorState = {
      ...terminalCursorEstablished("watch", "g", bound - 1, "x".repeat(bound)),
      columnChanges: [{ fromCursor: 0, columns: 48 }],
    };
    const appended = reconcileTerminalCursor(
      seeded,
      frame("output", {
        generation: "g",
        fromCursor: bound - 1,
        toCursor: bound + 1,
        data: "yz",
        columnChanges: [{ fromCursor: bound - 1, columns: 100 }],
      }),
    );
    expect(appended.action).toBe("append");
    expect(appended.state.transcript.length).toBeLessThanOrEqual(bound);
    expect(appended.state.columnChanges).toEqual([
      { fromCursor: 1, columns: null },
      { fromCursor: bound - 1, columns: 100 },
    ]);
  });
});

describe("terminal-cursor width decoding", () => {
  const outputMessage = (
    cursorSync: Record<string, unknown>,
    topLevel: Record<string, unknown> = {},
  ) => ({
    type: "terminal-output",
    id: "terminal",
    data: "abc",
    ...topLevel,
    cursorSync: {
      version: 1,
      watchId: "watch",
      generation: "generation",
      fromCursor: 10,
      toCursor: 13,
      ...cursorSync,
    },
  });
  const baselineMessage = (result: Record<string, unknown>) => ({
    type: "terminal-watch-result",
    id: "terminal",
    cursorSync: {
      version: 1,
      watchId: "watch",
      result: {
        status: "ready",
        generation: "generation",
        fromCursor: 0,
        toCursor: 3,
        data: "abc",
        ...result,
      },
    },
  });

  it("turns a usable live terminalColumns into one marker at fromCursor", () => {
    const decoded = decodeTerminalCursorFrameMessage(outputMessage({ terminalColumns: 100 }));
    expect(decoded?.columnChanges).toEqual([{ fromCursor: 10, columns: 100 }]);
    for (const bad of [5, 401, 48.5, "wide"]) {
      const widthless = decodeTerminalCursorFrameMessage(outputMessage({ terminalColumns: bad }));
      expect(widthless).not.toBeNull();
      expect(widthless).not.toHaveProperty("columnChanges");
    }
    const absent = decodeTerminalCursorFrameMessage(outputMessage({}));
    expect(absent).not.toHaveProperty("columnChanges");
  });

  it("reads baseline columnChanges and degrades invalid lists to widthless", () => {
    const decoded = decodeTerminalCursorFrameMessage(
      baselineMessage({
        columnChanges: [
          { fromCursor: 0, columns: 48 },
          { fromCursor: 2, columns: null },
        ],
      }),
    );
    expect(decoded?.columnChanges).toEqual([
      { fromCursor: 0, columns: 48 },
      { fromCursor: 2, columns: null },
    ]);
    for (const bad of [
      [
        { fromCursor: 2, columns: 48 },
        { fromCursor: 1, columns: 100 },
      ],
      [{ fromCursor: 0, columns: 5 }],
      [{ fromCursor: -1, columns: 48 }],
      [{ fromCursor: 0, columns: "wide" }],
      "wide",
    ]) {
      const widthless = decodeTerminalCursorFrameMessage(baselineMessage({ columnChanges: bad }));
      expect(widthless).not.toBeNull();
      expect(widthless).not.toHaveProperty("columnChanges");
    }
  });

  it("keeps old raw behavior for empty ranges", () => {
    // Empty up-to-date resume/baseline carry metadata but no output units;
    // the decoder rejects empty data before any width metadata matters.
    expect(
      decodeTerminalCursorFrameMessage(
        baselineMessage({
          data: "",
          fromCursor: 6,
          toCursor: 6,
          columnChanges: [{ fromCursor: 0, columns: 48 }],
        }),
      ),
    ).toBeNull();
    expect(
      decodeTerminalCursorFrameMessage(
        outputMessage({ terminalColumns: 100, fromCursor: 10, toCursor: 10 }, { data: "" }),
      ),
    ).toBeNull();
  });

  it("caps optional columnChanges lists before decoding them", () => {
    const markers = (count: number) =>
      Array.from({ length: count }, (_, i) => ({ fromCursor: i, columns: 48 }));
    const overCap = decodeTerminalCursorFrameMessage(
      baselineMessage({ columnChanges: markers(MAX_TERMINAL_COLUMN_CHANGES + 1) }),
    );
    expect(overCap).not.toBeNull();
    expect(overCap).not.toHaveProperty("columnChanges");
    const atCap = decodeTerminalCursorFrameMessage(
      baselineMessage({ columnChanges: markers(MAX_TERMINAL_COLUMN_CHANGES) }),
    );
    expect(atCap?.columnChanges).toHaveLength(MAX_TERMINAL_COLUMN_CHANGES);
  });
});

describe("generated terminal-cursor sources", () => {
  const swift = emitSwiftTerminalCursorMachine();
  const kotlin = emitKotlinTerminalCursorMachine();

  it("renders byte-stable sources from one spec", () => {
    expect(emitSwiftTerminalCursorMachine()).toBe(swift);
    expect(emitKotlinTerminalCursorMachine()).toBe(kotlin);
  });

  it("carries every action, reason, guard, and bound into both languages", () => {
    const swiftActionCase: Record<string, string> = {
      buffer: "case buffer",
      replace: "case replace",
      ignore: "case ignore",
      append: "case append",
      "append-unseen-suffix": 'case appendUnseenSuffix = "append-unseen-suffix"',
      resync: "case resync",
    };
    for (const action of TERMINAL_CURSOR_MACHINE_SPEC.actions) {
      expect(swift).toContain(swiftActionCase[action]);
      expect(kotlin).toContain(`"${action}"`);
    }
    for (const reason of TERMINAL_CURSOR_MACHINE_SPEC.resyncReasons) {
      expect(swift).toContain(`"${reason}"`);
      expect(kotlin).toContain(`"${reason}"`);
    }
    for (const rule of TERMINAL_CURSOR_MACHINE_SPEC.rules) {
      expect(swift).toContain(`"${rule.id}"`);
      expect(kotlin).toContain(`"${rule.id}"`);
    }
    expect(swift).toContain(
      `maximumTranscriptUTF16Units = ${TERMINAL_CURSOR_MACHINE_SPEC.bounds.maximumTranscriptUtf16Units}`,
    );
    expect(kotlin).toContain(
      `MAX_TRANSCRIPT_UTF16_UNITS: Int = ${TERMINAL_CURSOR_MACHINE_SPEC.bounds.maximumTranscriptUtf16Units}`,
    );
    expect(swift).toContain("utf-16-code-units");
    expect(kotlin).toContain("utf-16-code-units");
  });

  it("emits only the cursor machine — never wire-contract schema tables", () => {
    expect(swift).not.toContain("RemoteSchema");
    expect(kotlin).not.toContain("RemoteSchemaValidator");
    expect(swift).not.toContain("x-poracode-semanticValidators");
  });
});
