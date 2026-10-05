import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HEAD_CHARS } from "@/host/db/runtimeStreamCap";
import {
  runFanOutCell,
  runTinyDeltaAmplification,
  sqliteDriver,
  writeEventAmplificationSummary,
  type FanOutCellResult,
  type TinyDeltaRunRecord,
} from "./eventAmplificationHarness";

/**
 * §0.6 / §4 event-amplification qualification
 * (docs/V2_SERVER_ARCHITECTURE_PRODUCTION_PLAN.md).
 *
 * Measures, on a real RemoteAccessServer with real WS clients and the real
 * RuntimeWriteQueue → SQLite persistence path:
 *
 * 1. Publication fan-out as hidden streams and clients grow: frames, bytes,
 *    empty continuity envelopes and JSON serialization calls per
 *    (N clients × H hidden threads) cell.
 * 2. The §0.6 invariants: zero hidden payload bytes to uninterested clients
 *    (empty envelopes only, contiguity preserved) and per-cell envelope
 *    counts exactly equal to the reported bound.
 * 3. Tiny-delta write amplification: coalescing keeps SQLite writes sublinear
 *    and never rewrites the whole transcript.
 *
 * The default matrix is small and always on; `V2_AMPLIFICATION_HEAVY=1` adds
 * the (N=64, H=256) cell and a head-freezing 384,000-delta run.
 * `V2_AMPLIFICATION_OUT=1` (or a path) emits the JSON summary to
 * `tmp/v2-event-amplification/summary.json`.
 *
 * Equivalent scoped envelopes share one publication-local serialization.
 * The regression pins one canonical serialization plus one empty projection
 * whenever any socket is uninterested, without changing frames or continuity.
 */

const MATRIX_N = [1, 4, 16];
const MATRIX_H = [0, 8, 64];
const HEAVY_N = 64;
const HEAVY_H = 256;
const TINY_DELTA_K = 5_000;
// 1.5 × HEAD_CHARS (256,000): the first half fills and freezes the bounded
// head blob, the second half exercises the append-only chunk tail.
const TINY_DELTA_HEAVY_K = 384_000;

const HEAVY =
  process.env.V2_AMPLIFICATION_HEAVY === "1" || process.env.V2_AMPLIFICATION_HEAVY === "true";

describe("V2 §0.6 event amplification qualification", () => {
  const cells: FanOutCellResult[] = [];
  const findings: string[] = [];
  let tinyDelta: TinyDeltaRunRecord | null = null;
  let heavyTinyDelta: TinyDeltaRunRecord | null = null;

  beforeAll(
    async () => {
      for (const n of MATRIX_N) {
        for (const h of MATRIX_H) {
          cells.push(await runFanOutCell(n, h));
        }
      }
      if (HEAVY) cells.push(await runFanOutCell(HEAVY_N, HEAVY_H));
      if (sqliteDriver.available) {
        tinyDelta = runTinyDeltaAmplification(TINY_DELTA_K);
        if (HEAVY) heavyTinyDelta = runTinyDeltaAmplification(TINY_DELTA_HEAVY_K);
      } else {
        findings.push(
          "better-sqlite3 is unavailable in this environment; the tiny-delta SQLite run was skipped.",
        );
      }
      recordFindings();
    },
    HEAVY ? 600_000 : 120_000,
  );

  function recordFindings(): void {
    const serializationCell = cells.find((cell) => cell.record.n === 4 && cell.record.h === 8);
    if (serializationCell) {
      const record = serializationCell.record;
      findings.push(
        `MEASURED (§0.6): equivalent projections share serialization. Cell n=${record.n}, h=${record.h}: ` +
          `${record.serializationCalls} serialization calls for ${record.publishes} publishes ` +
          `(visible publish = ${record.serializationCallsPerPublish[0]} calls; ` +
          `hidden publish = ${record.serializationCallsPerPublish[record.n]} calls) ` +
          `against the shared-projection bound of ${record.serializationCallsIfProjectionsShared}. ` +
          `Every socket still receives its own scoped, sequence-contiguous frame.`,
      );
    }
    if (tinyDelta) {
      const perWave = tinyDelta.physicalBytesPerWave;
      findings.push(
        `MEASURED (§4 tiny-delta, k=${tinyDelta.k}): ${tinyDelta.sqliteStatements} SQLite statements ` +
          `(${(tinyDelta.k / Math.max(1, tinyDelta.sqliteStatements)).toFixed(0)} events/statement), ` +
          `${tinyDelta.writeCalls} coalesced write calls, ${tinyDelta.rowsChanged} rows changed, ` +
          `${tinyDelta.physicalWriteBytes} physical WAL bytes. WAL growth wave[0]=${perWave[0] ?? 0}B → ` +
          `wave[last]=${perWave[perWave.length - 1] ?? 0}B: the head-filling phase rewrites the bounded ` +
          `${HEAD_CHARS}-char item-row head blob, so per-wave byte cost grows until the head freezes.`,
      );
    }
    if (heavyTinyDelta) {
      const perWave = heavyTinyDelta.physicalBytesPerWave;
      const frozenStart = Math.ceil(HEAD_CHARS / heavyTinyDelta.waveSize);
      const frozen = perWave.slice(frozenStart);
      const headPhase = perWave.slice(0, frozenStart);
      const avg = (values: readonly number[]) =>
        values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
      findings.push(
        `MEASURED (§4 tiny-delta heavy, k=${heavyTinyDelta.k}): after the head freezes at wave ${frozenStart}, ` +
          `per-wave physical bytes are flat: head-phase avg ${avg(headPhase).toFixed(0)}B/wave vs frozen-phase avg ` +
          `${avg(frozen).toFixed(0)}B/wave — append-only tail cost is independent of retained tail length.`,
      );
    }
  }

  afterAll(() => {
    const path = writeEventAmplificationSummary({
      generatedAt: new Date().toISOString(),
      heavyMatrix: HEAVY,
      fanOut: cells.map((cell) => cell.record),
      tinyDelta,
      tinyDeltaHeavy: heavyTinyDelta,
      findings,
    });
    if (path) console.log(`[event-amplification] summary written to ${path}`);
  });

  it("delivers every publication to every client, with empty continuity envelopes bounded exactly as reported", () => {
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      const { record } = cell;
      const totalPublishes = record.publishes + record.interestProbePublishes;
      const expectedEmptyPerClient = record.interestProbePublishes + (record.n - 1) + record.h;
      expect(cell.clientFrames.length).toBe(record.n);
      for (const frames of cell.clientFrames) {
        // Continuity contract: one ready frame, then every seq exactly once.
        expect(frames.filter((frame) => frame.kind === "ready")).toHaveLength(1);
        expect(frames.filter((frame) => frame.kind === "event").map((frame) => frame.seq)).toEqual(
          Array.from({ length: totalPublishes }, (_, index) => index + 1),
        );
        // Empty envelopes are never dropped (that would read as packet loss)
        // and never multiplied: exactly one per uninterested (publish, client)
        // pair plus one per probe.
        const empty = frames.filter((frame) => frame.emptyEnvelope);
        expect(empty).toHaveLength(expectedEmptyPerClient);
        // Empty-envelope byte totals vary by ±(thread-id length spread)
        // between clients, so only the counts are a cross-client invariant;
        // the bytes are recorded per cell (client 0) in the summary.
      }
    }
  });

  it("delivers zero hidden payload bytes: uninterested threads arrive only as empty envelopes, own thread arrives in full", () => {
    for (const cell of cells) {
      const visibleThreads = new Set(cell.clientThreads);
      expect(cell.hiddenThreadIds.length).toBe(cell.record.h);
      for (const [index, frames] of cell.clientFrames.entries()) {
        const ownThread = cell.clientThreads[index]!;
        const events = frames.filter((frame) => frame.kind === "event");
        // itemInterestFilter collapses bulk content for undeclared threads;
        // the envelope must carry no events at all.
        const hidden = events.filter(
          (frame) => frame.threadId !== null && cell.hiddenThreadIds.includes(frame.threadId),
        );
        expect(hidden.every((frame) => frame.emptyEnvelope)).toBe(true);
        expect(hidden.some((frame) => visibleThreads.has(frame.threadId ?? ""))).toBe(false);
        // Full canonical content only for the thread this client watches.
        const full = events.filter((frame) => !frame.emptyEnvelope);
        expect(full.map((frame) => frame.threadId)).toEqual(full.map(() => ownThread));
        expect(full.every((frame) => frame.raw.includes('"delta":"v"'))).toBe(true);
      }
    }
  });

  it("never delivers the hidden-stream delta marker to any client (byte-level check)", () => {
    for (const cell of cells) {
      if (cell.record.h === 0) continue;
      // Hidden deltas are "H<index>"; uppercase H cannot occur in any
      // structural field of these frames, so a single H anywhere means hidden
      // payload escaped the filter.
      for (const frames of cell.clientFrames) {
        for (const frame of frames) {
          expect(frame.raw.includes("H")).toBe(false);
        }
      }
    }
  });

  it("serializes the canonical event once and each equivalent empty projection once per publication", () => {
    for (const cell of cells) {
      const { record } = cell;
      // Deterministic publish path: capBroadcastEvent serializes once, then
      // equivalent empty projection adds just one JSON.stringify regardless
      // of recipient count. The sole interested client in N=1 needs only the
      // original capped.json; every other cell costs exactly two per publish.
      expect(record.serializationCallsPerPublish).toHaveLength(record.publishes);
      for (const [index, calls] of record.serializationCallsPerPublish.entries()) {
        expect(calls).toBe(record.n === 1 && index < record.n ? 1 : 2);
      }
      expect(record.serializationCalls).toBe(record.serializationCallsIfProjectionsShared);
    }
    const largest = cells.find((cell) => cell.record.n === 16 && cell.record.h === 64)!;
    expect(largest.record.publishes).toBe(80);
    expect(largest.record.serializationCalls).toBeLessThanOrEqual(160);
  });

  it.skipIf(!sqliteDriver.available)(
    "tiny-delta write amplification: coalescing keeps SQLite writes sublinear, text exact, and never rewrites the whole transcript",
    () => {
      const run = tinyDelta;
      if (!run)
        throw new Error("Tiny-delta run is missing despite better-sqlite3 being available.");
      // Coalescing: K one-char deltas became one coalesced event per wave.
      expect(run.writeCalls).toBe(run.waves + 1); // + the seeded item.started flush
      expect(run.coalescedEventsTotal).toBe(run.waves + 1);
      expect(run.admittedEvents).toBe(run.k + 1); // + the seeded item.started
      // Sublinear statements: nothing close to per-event writes.
      expect(run.sqliteStatements).toBeLessThan(run.k / 10);
      // Steady-state statement cost per wave is flat: cost does not grow with
      // what the transcript already holds (a growing-prefix rewriter would).
      const steady = run.sqliteStatementsPerWave.slice(1);
      expect(Math.max(...steady)).toBeLessThanOrEqual(Math.min(...steady) + 1);
      // Exact text, exact order, reassembled across head + tail chunks.
      expect(run.exactTextMatch).toBe(true);
      expect(run.headChars).toBeLessThanOrEqual(HEAD_CHARS);
      // Bounded physical write cost (generous page-granular bound).
      expect(run.physicalWriteBytes).toBeLessThan(run.k * 64 + 1024 * 1024);
    },
  );

  it.skipIf(!HEAVY || !sqliteDriver.available)(
    "tiny-delta heavy run: physical write cost is flat once the bounded head freezes (append-only tail)",
    () => {
      const run = heavyTinyDelta;
      if (!run) throw new Error("Heavy tiny-delta run is missing despite V2_AMPLIFICATION_HEAVY.");
      expect(run.k).toBeGreaterThan(HEAD_CHARS);
      expect(run.exactTextMatch).toBe(true);
      expect(run.headChars).toBe(HEAD_CHARS);
      expect(run.tailChunkRows).toBeGreaterThan(0);
      // Wave index where every byte lands in the append-only tail.
      const frozenStart = Math.ceil(HEAD_CHARS / run.waveSize);
      const frozen = run.physicalBytesPerWave.slice(frozenStart);
      expect(frozen.length).toBeGreaterThan(50);
      const quarter = Math.floor(frozen.length / 4);
      const avg = (values: readonly number[]) =>
        values.reduce((total, value) => total + value, 0) / values.length;
      const earlyFrozen = avg(frozen.slice(0, quarter));
      const lateFrozen = avg(frozen.slice(-quarter));
      // Tail grew by ~96k chars between the two windows; a transcript-size
      // rewrite would scale these apart. Flat means the tail append cost is
      // independent of retained length.
      expect(lateFrozen / earlyFrozen).toBeLessThan(1.5);
      expect(run.sqliteStatements).toBeLessThan(run.k / 10);
    },
  );
});
