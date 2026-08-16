import { describe, expect, it, vi } from "vitest";
import {
  buildCursorTaggedTerminalOutput,
  buildTerminalWatchResultMessage,
  canAppendTerminalCursorRange,
  composeTerminalWatchReadyResult,
  isStaleTerminalWatchId,
  isSupportedTerminalCursorSyncVersion,
  readyResultFromSnapshot,
  sanitizePersistedOutputLength,
  TerminalCursorSyncRegistry,
  TERMINAL_CURSOR_SYNC_SUPPORTED_VERSIONS,
  unsupportedCursorSyncVersionResult,
} from "./terminalCursorSync";
import {
  remoteTerminalWatchResultReadySchema,
  remoteWebSocketServerMessageSchema,
  TERMINAL_CURSOR_SYNC_VERSION,
} from "@/shared/remote";

vi.mock("../../db", () => ({
  dbGetThread: vi.fn<() => null>(() => null),
  dbGetThreadTerminalScrollbackRecord: vi.fn<() => null>(() => null),
}));

import { dbGetThread, dbGetThreadTerminalScrollbackRecord } from "../../db";

const dbGetThreadMock = vi.mocked(dbGetThread);
const dbGetRecordMock = vi.mocked(dbGetThreadTerminalScrollbackRecord);

describe("TerminalCursorSyncRegistry", () => {
  it("replaces rewatch state and treats prior watchId as stale", () => {
    const registry = new TerminalCursorSyncRegistry();
    const ws = {} as import("ws").WebSocket;

    const epoch1 = registry.setReliable(ws, "t1", { version: 1, watchId: "w1" });
    expect(registry.isCurrent(ws, "t1", "w1", epoch1)).toBe(true);

    const epoch2 = registry.setReliable(ws, "t1", { version: 1, watchId: "w2" });
    expect(registry.isCurrent(ws, "t1", "w1", epoch1)).toBe(false);
    expect(registry.isCurrent(ws, "t1", "w2", epoch2)).toBe(true);
    expect(isStaleTerminalWatchId(registry.getReliable(ws, "t1")?.watchId, "w1")).toBe(true);

    registry.clearReliable(ws, "t1");
    expect(registry.getReliable(ws, "t1")).toBeUndefined();
  });

  it("gates same watchId reinstalls by epoch so older async work is stale", () => {
    const registry = new TerminalCursorSyncRegistry();
    const ws = {} as import("ws").WebSocket;

    const epochOld = registry.setReliable(ws, "t1", { version: 1, watchId: "same" });
    const epochNew = registry.setReliable(ws, "t1", { version: 1, watchId: "same" });
    expect(epochNew).toBeGreaterThan(epochOld);
    expect(registry.isCurrent(ws, "t1", "same", epochOld)).toBe(false);
    expect(registry.isCurrent(ws, "t1", "same", epochNew)).toBe(true);

    // Older failure must not clear the newer registration.
    expect(registry.clearReliableIfMatch(ws, "t1", "same", epochOld)).toBe(false);
    expect(registry.isCurrent(ws, "t1", "same", epochNew)).toBe(true);
    expect(registry.clearReliableIfMatch(ws, "t1", "same", epochNew)).toBe(true);
    expect(registry.getReliable(ws, "t1")).toBeUndefined();
  });

  it("clearAll drops every reliable registration across connections", () => {
    const registry = new TerminalCursorSyncRegistry();
    const wsA = {} as import("ws").WebSocket;
    const wsB = {} as import("ws").WebSocket;
    registry.setReliable(wsA, "t1", { version: 1, watchId: "w1" });
    registry.setReliable(wsA, "t2", { version: 1, watchId: "w2" });
    registry.setReliable(wsB, "t3", { version: 1, watchId: "w3" });

    registry.clearAll();

    expect(registry.getReliable(wsA, "t1")).toBeUndefined();
    expect(registry.getReliable(wsA, "t2")).toBeUndefined();
    expect(registry.getReliable(wsB, "t3")).toBeUndefined();
    expect(registry.hasReliableWatcher(wsA, "t1")).toBe(false);
    expect(registry.hasReliableWatcher(wsB, "t3")).toBe(false);
  });
});

describe("terminal cursor helpers", () => {
  it("tags output with absolute cursors without code-point arithmetic", () => {
    // Astral / combining sequences are opaque JS string units.
    const data = "a\u{1F600}e\u0301";
    const toCursor = 100 + data.length;
    const frame = buildCursorTaggedTerminalOutput("t1", data, "w1", "gen-a", toCursor);
    expect(frame.cursorSync).toEqual({
      version: 1,
      watchId: "w1",
      generation: "gen-a",
      fromCursor: 100,
      toCursor,
    });
    expect(frame.data).toBe(data);
    expect(frame.data.length).toBe(toCursor - frame.cursorSync!.fromCursor);
  });

  it("rejects append across generation resets and any null generation", () => {
    expect(
      canAppendTerminalCursorRange(
        { generation: "g1", toCursor: 10 },
        { generation: "g1", fromCursor: 10 },
      ),
    ).toBe(true);
    expect(
      canAppendTerminalCursorRange(
        { generation: "g1", toCursor: 10 },
        { generation: "g2", fromCursor: 0 },
      ),
    ).toBe(false);
    expect(
      canAppendTerminalCursorRange(
        { generation: "g1", toCursor: 10 },
        { generation: "g1", fromCursor: 9 },
      ),
    ).toBe(false);

    // Null is snapshot/replace-only — never append-compatible.
    expect(
      canAppendTerminalCursorRange(
        { generation: null, toCursor: 10 },
        { generation: "g1", fromCursor: 10 },
      ),
    ).toBe(false);
    expect(
      canAppendTerminalCursorRange(
        { generation: "g1", toCursor: 10 },
        { generation: null, fromCursor: 10 },
      ),
    ).toBe(false);
    expect(
      canAppendTerminalCursorRange(
        { generation: null, toCursor: 10 },
        { generation: null, fromCursor: 10 },
      ),
    ).toBe(false);
    // First range with no previous is allowed (bootstrap), even if next is null.
    expect(canAppendTerminalCursorRange(null, { generation: null, fromCursor: 0 })).toBe(true);
  });

  it("builds ready results from live snapshots and persisted fallbacks", () => {
    expect(
      readyResultFromSnapshot({
        generation: "gen",
        fromCursor: 0,
        toCursor: 5,
        data: "hello",
        processState: "running",
        terminalSize: { cols: 80, rows: 24 },
      }),
    ).toMatchObject({ status: "ready", generation: "gen", processState: "running" });

    dbGetRecordMock.mockReturnValueOnce({ transcript: "tail", outputLength: 14 });
    expect(composeTerminalWatchReadyResult(null, "thread-1")).toEqual({
      status: "ready",
      generation: null,
      fromCursor: 10,
      toCursor: 14,
      data: "tail",
      processState: "exited",
      terminalSize: null,
    });

    dbGetRecordMock.mockReturnValueOnce(null);
    dbGetThreadMock.mockReturnValueOnce({ id: "thread-1" } as never);
    expect(composeTerminalWatchReadyResult(null, "thread-1")).toMatchObject({
      status: "ready",
      generation: null,
      data: "",
      processState: "exited",
    });

    dbGetRecordMock.mockReturnValueOnce(null);
    dbGetThreadMock.mockReturnValueOnce(null as never);
    expect(composeTerminalWatchReadyResult(null, "missing")).toBeNull();
  });

  it("enforces toCursor - fromCursor === data.length for malformed persisted rows", () => {
    // outputLength shorter than transcript: trim data so the range stays exact.
    dbGetRecordMock.mockReturnValueOnce({
      transcript: "too-long-transcript",
      outputLength: 5,
    });
    const malformed = composeTerminalWatchReadyResult(null, "thread-malformed");
    expect(malformed).not.toBeNull();
    expect(malformed!.toCursor - malformed!.fromCursor).toBe(malformed!.data.length);
    expect(malformed!.toCursor).toBe(5);
    expect(malformed!.data).toBe("cript"); // tail of length 5 of "too-long-transcript"
    expect(malformed!.fromCursor).toBe(0);
    expect(malformed!.generation).toBeNull();

    // Empty transcript with positive outputLength still yields a valid empty range.
    dbGetRecordMock.mockReturnValueOnce({ transcript: "", outputLength: 42 });
    const emptyTail = composeTerminalWatchReadyResult(null, "thread-empty");
    expect(emptyTail).toEqual({
      status: "ready",
      generation: null,
      fromCursor: 42,
      toCursor: 42,
      data: "",
      processState: "exited",
      terminalSize: null,
    });
    expect(emptyTail!.toCursor - emptyTail!.fromCursor).toBe(emptyTail!.data.length);
  });

  it("treats zero and negative outputLength as an empty origin range (slice(-0) trap)", () => {
    // JS gotcha: "abc".slice(-0) === "abc", so a naive trim would yield fromCursor=-3.
    dbGetRecordMock.mockReturnValueOnce({
      transcript: "nonempty-transcript",
      outputLength: 0,
    });
    const zeroLen = composeTerminalWatchReadyResult(null, "thread-zero");
    expect(zeroLen).toEqual({
      status: "ready",
      generation: null,
      fromCursor: 0,
      toCursor: 0,
      data: "",
      processState: "exited",
      terminalSize: null,
    });
    expect(zeroLen!.toCursor - zeroLen!.fromCursor).toBe(zeroLen!.data.length);
    expect(zeroLen!.fromCursor).toBeGreaterThanOrEqual(0);

    // Negative lengths clamp to the same empty origin range.
    dbGetRecordMock.mockReturnValueOnce({
      transcript: "still-here",
      outputLength: -7,
    });
    const negativeLen = composeTerminalWatchReadyResult(null, "thread-negative");
    expect(negativeLen).toEqual({
      status: "ready",
      generation: null,
      fromCursor: 0,
      toCursor: 0,
      data: "",
      processState: "exited",
      terminalSize: null,
    });
    expect(negativeLen!.toCursor - negativeLen!.fromCursor).toBe(negativeLen!.data.length);

    // Positive cursor still trims the tail (regression guard for the zero branch).
    dbGetRecordMock.mockReturnValueOnce({
      transcript: "abcdefghij",
      outputLength: 4,
    });
    const positiveTrim = composeTerminalWatchReadyResult(null, "thread-positive");
    expect(positiveTrim).toEqual({
      status: "ready",
      generation: null,
      fromCursor: 0,
      toCursor: 4,
      data: "ghij",
      processState: "exited",
      terminalSize: null,
    });
  });

  it("sanitizes corrupt persisted outputLength to a schema-safe empty origin baseline", () => {
    // Helper contract: only finite safe nonnegative integers pass through.
    expect(sanitizePersistedOutputLength(0)).toBe(0);
    expect(sanitizePersistedOutputLength(14)).toBe(14);
    expect(sanitizePersistedOutputLength(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(sanitizePersistedOutputLength(-1)).toBe(0);
    expect(sanitizePersistedOutputLength(4.7)).toBe(0);
    expect(sanitizePersistedOutputLength(Number.NaN)).toBe(0);
    expect(sanitizePersistedOutputLength(Number.POSITIVE_INFINITY)).toBe(0);
    expect(sanitizePersistedOutputLength(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(sanitizePersistedOutputLength(Number.MAX_SAFE_INTEGER + 1)).toBe(0);

    const emptyOrigin = {
      status: "ready" as const,
      generation: null,
      fromCursor: 0,
      toCursor: 0,
      data: "",
      processState: "exited" as const,
      terminalSize: null,
    };

    for (const [label, outputLength] of [
      ["fractional", 4.7],
      ["NaN", Number.NaN],
      ["Infinity", Number.POSITIVE_INFINITY],
      [">MAX_SAFE", Number.MAX_SAFE_INTEGER + 1],
    ] as const) {
      dbGetRecordMock.mockReturnValueOnce({
        transcript: `corrupt-${label}-transcript`,
        outputLength,
      });
      const ready = composeTerminalWatchReadyResult(null, `thread-${label}`);
      expect(ready).toEqual(emptyOrigin);
      expect(ready!.toCursor - ready!.fromCursor).toBe(ready!.data.length);
      // Must parse as a public ready result (client schema rejects non-safe cursors).
      expect(remoteTerminalWatchResultReadySchema.parse(ready)).toEqual(ready);
      const envelope = buildTerminalWatchResultMessage(`t-${label}`, `w-${label}`, ready!);
      expect(remoteWebSocketServerMessageSchema.parse(envelope)).toEqual(envelope);
    }

    // Valid existing behavior is unchanged: absolute length + UTF-16 range identity.
    const unicode = "a\u{1F600}e\u0301";
    expect(unicode.length).toBe(5);
    dbGetRecordMock.mockReturnValueOnce({
      transcript: unicode,
      outputLength: 100 + unicode.length,
    });
    const valid = composeTerminalWatchReadyResult(null, "thread-valid-safe");
    expect(valid).toEqual({
      status: "ready",
      generation: null,
      fromCursor: 100,
      toCursor: 100 + unicode.length,
      data: unicode,
      processState: "exited",
      terminalSize: null,
    });
    expect(valid!.toCursor - valid!.fromCursor).toBe(valid!.data.length);
    expect(remoteTerminalWatchResultReadySchema.parse(valid)).toEqual(valid);
  });

  it("uses JS code-unit (UTF-16) arithmetic for Unicode and surrogate-pair data", () => {
    // Astral emoji = surrogate pair (2 units) + combining mark (1 unit).
    const unicode = "a\u{1F600}e\u0301";
    expect(unicode.length).toBe(5);

    dbGetRecordMock.mockReturnValueOnce({
      transcript: unicode,
      outputLength: 100 + unicode.length,
    });
    const ready = composeTerminalWatchReadyResult(null, "thread-unicode");
    expect(ready).not.toBeNull();
    expect(ready!.data).toBe(unicode);
    expect(ready!.toCursor - ready!.fromCursor).toBe(ready!.data.length);
    expect(ready!.fromCursor).toBe(100);
    expect(ready!.toCursor).toBe(100 + unicode.length);

    // Surrogate-tail trim: toCursor cuts inside the astral pair space still by
    // code units — slice keeps structural length equality even if it yields a
    // lone surrogate (unit space is intentional; do not switch to code points).
    const withAstral = "x\u{1F600}y"; // lengths: 1 + 2 + 1 = 4
    expect(withAstral.length).toBe(4);
    dbGetRecordMock.mockReturnValueOnce({
      transcript: withAstral,
      outputLength: 3,
    });
    const trimmed = composeTerminalWatchReadyResult(null, "thread-surrogate-tail");
    expect(trimmed).not.toBeNull();
    expect(trimmed!.data.length).toBe(3);
    expect(trimmed!.toCursor - trimmed!.fromCursor).toBe(trimmed!.data.length);
    expect(trimmed!.data).toBe(withAstral.slice(-3));

    // Live frame tagging uses the same unit space.
    const frame = buildCursorTaggedTerminalOutput("t", unicode, "w", "g", 50 + unicode.length);
    expect(frame.cursorSync!.toCursor - frame.cursorSync!.fromCursor).toBe(frame.data.length);
    expect(frame.cursorSync!.fromCursor).toBe(50);
  });

  it("keeps supported versions at capability 1 and rejects others", () => {
    expect(TERMINAL_CURSOR_SYNC_SUPPORTED_VERSIONS).toEqual([TERMINAL_CURSOR_SYNC_VERSION]);
    expect(isSupportedTerminalCursorSyncVersion(1)).toBe(true);
    expect(isSupportedTerminalCursorSyncVersion(2)).toBe(false);
    expect(isSupportedTerminalCursorSyncVersion(0)).toBe(false);
    expect(unsupportedCursorSyncVersionResult()).toEqual({
      status: "error",
      code: "unavailable",
      retryable: false,
    });
  });

  it("serializes watch-result envelopes", () => {
    expect(
      buildTerminalWatchResultMessage("t1", "w1", {
        status: "error",
        code: "unavailable",
        retryable: true,
      }),
    ).toEqual({
      type: "terminal-watch-result",
      id: "t1",
      cursorSync: {
        version: 1,
        watchId: "w1",
        result: { status: "error", code: "unavailable", retryable: true },
      },
    });
  });

  it("round-trips real ready/error results and tagged output through the public schema", () => {
    dbGetRecordMock.mockReturnValueOnce({
      transcript: "nonempty",
      outputLength: 0,
    });
    const zeroReady = composeTerminalWatchReadyResult(null, "thread-schema-zero");
    expect(zeroReady).not.toBeNull();
    const readyEnvelope = buildTerminalWatchResultMessage("t-ready", "w-ready", zeroReady!);
    expect(remoteWebSocketServerMessageSchema.parse(readyEnvelope)).toEqual(readyEnvelope);

    const errorEnvelope = buildTerminalWatchResultMessage(
      "t-err",
      "w-err",
      unsupportedCursorSyncVersionResult(),
    );
    expect(remoteWebSocketServerMessageSchema.parse(errorEnvelope)).toEqual(errorEnvelope);

    const live = readyResultFromSnapshot({
      generation: "gen-live",
      fromCursor: 0,
      toCursor: 5,
      data: "hello",
      processState: "running",
      terminalSize: { cols: 80, rows: 24 },
    });
    const liveEnvelope = buildTerminalWatchResultMessage("t-live", "w-live", live);
    expect(remoteWebSocketServerMessageSchema.parse(liveEnvelope)).toEqual(liveEnvelope);

    const tagged = buildCursorTaggedTerminalOutput("t-out", "more", "w-out", "gen-live", 9);
    expect(remoteWebSocketServerMessageSchema.parse(tagged)).toEqual(tagged);
  });
});
