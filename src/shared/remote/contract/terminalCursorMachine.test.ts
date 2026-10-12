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
} from "./terminalCursorMachine";
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
