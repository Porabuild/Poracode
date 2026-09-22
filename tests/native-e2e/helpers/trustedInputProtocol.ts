import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  RendererPerfEventTimingRecord,
  RendererPerfSnapshot,
} from "../../../src/renderer/diagnostics/rendererPerfDiagnostics.ts";
import type { ManagedCdpClient, TrustedTypingEvidence } from "./managedAppSession.ts";
import { phaseWindowEvidence, type PhaseWindowEvidence } from "./rendererPhaseEvidence.ts";
import {
  buildSegmentedIdleAggregate,
  evaluateIdlePopulation,
  ringOrdinalOf,
  ringTotalPushed,
  type IdlePopulationInput,
  type SegmentedCollectionIntervalEvidence,
  type SegmentedEventTimingSample,
  type SegmentedIdleAggregateEvidence,
  type SegmentedIdleSegmentEvidence,
  type SegmentedIdentityBasis,
  type SegmentedPopulationStatus,
  type SurfacePolicy,
} from "./trustedInputPopulation.ts";

/**
 * The pure population accounting and eligibility policy live in
 * `./trustedInputPopulation.ts`; they are re-exported here because the frozen
 * ring-accounting probe and the protocol unit tests import them from this
 * module. Keeping the re-export is part of the harness contract.
 */
export { buildSegmentedIdleAggregate, evaluateIdlePopulation, ringOrdinalOf, ringTotalPushed };
export type {
  IdlePopulationInput,
  SegmentedCollectionIntervalEvidence,
  SegmentedEventTimingSample,
  SegmentedIdleAggregateEvidence,
  SegmentedIdleSegmentEvidence,
  SegmentedIdentityBasis,
  SegmentedPopulationStatus,
  SurfacePolicy,
};

/**
 * Trusted-input / long-task positive-control protocol for the v2 qualification
 * cells (plan §6.1–6.2), corrected after the R0.1 calibration found the prior
 * implementation unmeasurable:
 *
 *  - The launcher window can be unmapped/backgrounded; a backgrounded renderer
 *    pauses rAF, throttles input, and delays Event Timing delivery. The
 *    protocol first prepares and *proves* a visible/foreground/painting
 *    surface (Page.bringToFront + focus emulation + active lifecycle + a
 *    bounded rAF/screenshot barrier) and records the evidence.
 *  - The blocking control is a real scheduled DOM task: a trusted pointerdown
 *    handler blocks the main thread for `blockMs`. A second trusted click is
 *    enqueued through the CDP input pipeline in the same instant, so it
 *    *arrives during the block* (the CDP commands are written before any
 *    acknowledgement is awaited); its Event Timing sample and page-side
 *    timestamps must show the delay.
 *  - A CDP `Runtime.evaluate` busy loop is never the positive control: Chromium
 *    does not attribute that evaluation to the page's task accounting.
 *  - Phase windows close only after a bounded observer-delivery barrier. The
 *    idle script is collected in bounded batches: every batch closes with an
 *    observer-*settle* barrier (counters quiet for a bounded interval) and its
 *    own `(before, after]` snapshot window. The windows are a contiguous,
 *    disjoint chain, so the union equals the outer window and the population
 *    summary is computed from actual ring records — per-batch reads are kept
 *    as raw-sample evidence, and a ring eviction (loss) is recorded and never
 *    presented as a full-population percentile. No fixed sleep is used as
 *    proof.
 *  - A supported observer with zero idle samples is only accepted as an
 *    explicit *censored* population (all eligible trusted events below the
 *    16 ms threshold, no ring/skip loss, frames and paint observed, blocked
 *    positive control measured). A censored population never satisfies a
 *    numeric latency budget.
 */

export const TRUSTED_INPUT_RECORDER_KEY = "__v2qTrustedInput";

const RECORDER_EVENT_CAPACITY = 512;

export interface TrustedInputOptions {
  readonly idleClicks: number;
  readonly idleTypedChars: number;
  /**
   * Batch size for segmented idle collection. The idle clicks (and typed
   * characters) are dispatched in several bounded batches, each closing with
   * its own observer-settle barrier and its own disjoint snapshot window; the
   * union of those windows is the measured population, so a late delivery
   * burst cannot overflow the frozen 256-entry ring before it is read.
   */
  readonly idleClicksPerSegment: number;
  readonly idleTypedCharsPerSegment: number;
  readonly blockedCycles: number;
  readonly blockMs: number;
  /** Minimum input delay the queued click must show to count as blocked. */
  readonly minQueuedInputDelayMs: number;
  readonly clickSelector: string;
  readonly composerSelector: string;
  readonly idleObserverTimeoutMs: number;
  readonly blockedObserverTimeoutMs: number;
}

export const DEFAULT_TRUSTED_INPUT_OPTIONS: TrustedInputOptions = {
  idleClicks: 20,
  idleTypedChars: 40,
  idleClicksPerSegment: 8,
  idleTypedCharsPerSegment: 10,
  blockedCycles: 3,
  blockMs: 250,
  minQueuedInputDelayMs: 150,
  clickSelector: "body",
  composerSelector: '[data-composer-input-anchor] [contenteditable="true"]',
  idleObserverTimeoutMs: 4_000,
  blockedObserverTimeoutMs: 4_000,
};

export function resolveTrustedInputOptions(
  overrides: Partial<TrustedInputOptions> = {},
): TrustedInputOptions {
  return { ...DEFAULT_TRUSTED_INPUT_OPTIONS, ...overrides };
}

// ── Page-side recorder ──────────────────────────────────────────────────────

export interface RecorderTrustedEvent {
  readonly type: string;
  readonly isTrusted: boolean;
  readonly timeStamp: number;
  readonly recordedAtMs: number;
}

export interface RecorderBlock {
  readonly armed: boolean;
  readonly blockMs: number;
  readonly startMs: number | null;
  readonly endMs: number | null;
  readonly fired: boolean;
  readonly handlerType: string | null;
}

export interface RecorderState {
  readonly installedAtMs: number;
  readonly visibilityState: string;
  readonly hasFocus: boolean;
  readonly rafFrames: number;
  readonly rafFirstMs: number | null;
  readonly rafLastMs: number | null;
  readonly rafMaxGapMs: number | null;
  readonly trustedEvents: readonly RecorderTrustedEvent[];
  readonly trustedEventsTruncated: boolean;
  readonly block: RecorderBlock;
}

function recorderInstallExpression(): string {
  return `(() => {
    if (window.${TRUSTED_INPUT_RECORDER_KEY}) return "present";
    const state = {
      installedAtMs: performance.now(),
      visibilityState: document.visibilityState,
      hasFocus: document.hasFocus(),
      rafFrames: 0,
      rafFirstMs: null,
      rafLastMs: null,
      rafMaxGapMs: null,
      rafHandle: 0,
      trustedEvents: [],
      trustedEventsTruncated: false,
      block: { armed: false, blockMs: 0, startMs: null, endMs: null, fired: false, handlerType: null },
    };
    window.${TRUSTED_INPUT_RECORDER_KEY} = state;
    const record = (event) => {
      if (state.trustedEvents.length < ${String(RECORDER_EVENT_CAPACITY)}) {
        state.trustedEvents.push({
          type: event.type,
          isTrusted: event.isTrusted === true,
          timeStamp: event.timeStamp,
          recordedAtMs: performance.now(),
        });
      } else {
        state.trustedEventsTruncated = true;
      }
    };
    const types = ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "keydown", "keyup"];
    for (const type of types) document.addEventListener(type, record, true);
    document.addEventListener("pointerdown", (event) => {
      const block = state.block;
      if (!block.armed || block.fired) return;
      block.fired = true;
      block.handlerType = event.type;
      block.startMs = performance.now();
      const until = performance.now() + block.blockMs;
      while (performance.now() < until) {}
      block.endMs = performance.now();
    }, true);
    const frame = (now) => {
      state.rafFrames += 1;
      if (state.rafFirstMs === null) state.rafFirstMs = now;
      if (state.rafLastMs !== null) {
        const gap = now - state.rafLastMs;
        state.rafMaxGapMs = state.rafMaxGapMs === null ? gap : Math.max(state.rafMaxGapMs, gap);
      }
      state.rafLastMs = now;
      state.rafHandle = requestAnimationFrame(frame);
    };
    state.rafHandle = requestAnimationFrame(frame);
    return "installed";
  })()`;
}

export function installTrustedInputRecorder(cdp: ManagedCdpClient): Promise<string> {
  return cdp.evaluate<string>(recorderInstallExpression());
}

export function readTrustedInputRecorder(cdp: ManagedCdpClient): Promise<RecorderState> {
  return cdp.evaluate<RecorderState>(
    `(() => { const state = window.${TRUSTED_INPUT_RECORDER_KEY};` +
      ` if (!state) return null;` +
      ` return { installedAtMs: state.installedAtMs, visibilityState: state.visibilityState,` +
      ` hasFocus: state.hasFocus === true, rafFrames: state.rafFrames, rafFirstMs: state.rafFirstMs,` +
      ` rafLastMs: state.rafLastMs, rafMaxGapMs: state.rafMaxGapMs,` +
      ` trustedEvents: state.trustedEvents.slice(),` +
      ` trustedEventsTruncated: state.trustedEventsTruncated === true,` +
      ` block: { armed: state.block.armed === true, blockMs: state.block.blockMs,` +
      ` startMs: state.block.startMs, endMs: state.block.endMs, fired: state.block.fired === true,` +
      ` handlerType: state.block.handlerType } }; })()`,
  );
}

export function armTrustedInputBlock(cdp: ManagedCdpClient, blockMs: number): Promise<string> {
  return cdp.evaluate<string>(
    `(() => { const state = window.${TRUSTED_INPUT_RECORDER_KEY};` +
      ` if (!state) return "missing";` +
      ` state.block = { armed: true, blockMs: ${String(blockMs)}, startMs: null, endMs: null,` +
      ` fired: false, handlerType: null }; return "armed"; })()`,
  );
}

export function disarmTrustedInputBlock(cdp: ManagedCdpClient): Promise<string> {
  return cdp.evaluate<string>(
    `(() => { const state = window.${TRUSTED_INPUT_RECORDER_KEY};` +
      ` if (!state) return "missing"; state.block.armed = false; return "disarmed"; })()`,
  );
}

// ── Foreground surface ──────────────────────────────────────────────────────

export interface SurfaceState {
  readonly visibilityState: string | null;
  readonly hasFocus: boolean | null;
  readonly readyState: string | null;
}

export interface ForegroundSurfaceEvidence {
  readonly before: SurfaceState;
  readonly preparation: {
    readonly bringToFront: string;
    readonly focusEmulation: string;
    readonly lifecycleActive: string;
  };
  readonly after: SurfaceState;
  readonly rafObservedFrames: number;
  readonly rafObserved: boolean;
  readonly screenshotBytes: number | null;
  readonly waitedMs: number;
  readonly polls: number;
}

function readSurfaceState(cdp: ManagedCdpClient): Promise<SurfaceState> {
  return cdp.evaluate<SurfaceState>(
    `(() => ({ visibilityState: document.visibilityState ?? null,` +
      ` hasFocus: typeof document.hasFocus === "function" ? document.hasFocus() : null,` +
      ` readyState: document.readyState ?? null }))()`,
  );
}

export interface PaintEvidence {
  readonly rafFrames: number;
  readonly rafMaxGapMs: number | null;
  readonly screenshotBytes: number | null;
  readonly screenshotPath: string | null;
}

/**
 * Bounded paint/frame evidence: the harness's own rAF counter plus one real
 * compositor round trip (`Page.captureScreenshot`). A backgrounded renderer
 * reports zero rAF frames across the phase, which is exactly the condition the
 * gate must reject.
 */
export async function capturePaintEvidence(input: {
  readonly cdp: ManagedCdpClient;
  readonly rafFrames: number;
  readonly rafMaxGapMs: number | null;
  readonly evidenceDir?: string;
  readonly label: string;
}): Promise<PaintEvidence> {
  let screenshotBytes: number | null = null;
  let screenshotPath: string | null = null;
  try {
    const result = (await input.cdp.send(
      "Page.captureScreenshot",
      { format: "jpeg", quality: 60 },
      15_000,
    )) as { data?: unknown };
    const data = typeof result?.data === "string" ? result.data : null;
    if (data !== null) {
      screenshotBytes = Buffer.from(data, "base64").length;
      if (input.evidenceDir) {
        const path = join(input.evidenceDir, `${input.label}.jpg`);
        mkdirSync(input.evidenceDir, { recursive: true });
        writeFileSync(path, Buffer.from(data, "base64"), { mode: 0o600 });
        screenshotPath = path;
      }
    }
  } catch {
    screenshotBytes = null;
  }
  return {
    rafFrames: input.rafFrames,
    rafMaxGapMs: input.rafMaxGapMs,
    screenshotBytes,
    screenshotPath,
  };
}

/**
 * Prepares the measurement surface and proves it is visible, focused, and
 * producing frames before any phase window opens. Bounded polling only.
 */
export async function ensureForegroundSurface(input: {
  readonly cdp: ManagedCdpClient;
  readonly timeoutMs?: number;
  readonly evidenceDir?: string;
}): Promise<ForegroundSurfaceEvidence> {
  const cdp = input.cdp;
  const timeoutMs = input.timeoutMs ?? 8_000;
  const startedAt = Date.now();
  const before = await readSurfaceState(cdp).catch(() => ({
    visibilityState: null,
    hasFocus: null,
    readyState: null,
  }));
  const preparation = await cdp.prepareForegroundSurface();
  await installTrustedInputRecorder(cdp);
  let polls = 0;
  let recorder: RecorderState | null = null;
  for (;;) {
    recorder = await readTrustedInputRecorder(cdp).catch(() => null);
    polls += 1;
    const visible = recorder?.visibilityState === "visible";
    const focused = recorder?.hasFocus === true;
    const frames = recorder?.rafFrames ?? 0;
    if (visible && focused && frames >= 2) break;
    if (Date.now() - startedAt >= timeoutMs) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const after = await readSurfaceState(cdp).catch(() => ({
    visibilityState: null,
    hasFocus: null,
    readyState: null,
  }));
  const paint = await capturePaintEvidence({
    cdp,
    rafFrames: recorder?.rafFrames ?? 0,
    rafMaxGapMs: recorder?.rafMaxGapMs ?? null,
    ...(input.evidenceDir === undefined ? {} : { evidenceDir: input.evidenceDir }),
    label: "trusted-input-surface",
  });
  return {
    before,
    preparation,
    after,
    rafObservedFrames: paint.rafFrames,
    rafObserved: paint.rafFrames >= 2,
    screenshotBytes: paint.screenshotBytes,
    waitedMs: Date.now() - startedAt,
    polls,
  };
}

// ── Observer-delivery barrier ───────────────────────────────────────────────

export interface ObserverDeliveryBarrier {
  readonly label: string;
  readonly waitedMs: number;
  readonly polls: number;
  readonly eventTimingAdvanced: boolean;
  readonly longTaskAdvanced: boolean;
  readonly beforeEventTimingSamples: number;
  readonly afterEventTimingSamples: number;
  readonly beforeLongTaskSamples: number;
  readonly afterLongTaskSamples: number;
  readonly snapshot: RendererPerfSnapshot | null;
}

function observerCounts(snapshot: RendererPerfSnapshot | null): {
  readonly eventTiming: number;
  readonly longTask: number;
} {
  return {
    eventTiming: snapshot?.observers.eventTiming.sampleCount ?? 0,
    longTask: snapshot?.observers.longTask.sampleCount ?? 0,
  };
}

/**
 * Polls the renderer diagnostics until the requested observer counters advance
 * past the pre-phase snapshot, or the bounded deadline elapses. The returned
 * snapshot is the one read *after* delivery settled, so it is the correct
 * closing snapshot for the phase window.
 */
export async function waitForObserverDelivery(input: {
  readonly cdp: ManagedCdpClient;
  readonly before: RendererPerfSnapshot | null;
  readonly requireEventTiming: boolean;
  readonly requireLongTask: boolean;
  readonly label: string;
  readonly timeoutMs?: number;
  readonly pollMs?: number;
}): Promise<ObserverDeliveryBarrier> {
  const timeoutMs = input.timeoutMs ?? 4_000;
  const pollMs = input.pollMs ?? 100;
  const startedAt = Date.now();
  const baseline = observerCounts(input.before);
  let polls = 0;
  let snapshot: RendererPerfSnapshot | null = null;
  for (;;) {
    snapshot =
      ((await input.cdp.snapshot().catch(() => null)) as unknown as RendererPerfSnapshot | null) ??
      snapshot;
    polls += 1;
    const counts = observerCounts(snapshot);
    const eventTimingAdvanced = counts.eventTiming > baseline.eventTiming;
    const longTaskAdvanced = counts.longTask > baseline.longTask;
    const satisfied =
      (!input.requireEventTiming || eventTimingAdvanced) &&
      (!input.requireLongTask || longTaskAdvanced);
    if (satisfied) break;
    if (Date.now() - startedAt >= timeoutMs) break;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  const counts = observerCounts(snapshot);
  return {
    label: input.label,
    waitedMs: Date.now() - startedAt,
    polls,
    eventTimingAdvanced: counts.eventTiming > baseline.eventTiming,
    longTaskAdvanced: counts.longTask > baseline.longTask,
    beforeEventTimingSamples: baseline.eventTiming,
    afterEventTimingSamples: counts.eventTiming,
    beforeLongTaskSamples: baseline.longTask,
    afterLongTaskSamples: counts.longTask,
    snapshot,
  };
}

// ── Bounded observer-settle barrier (segmented collection) ──────────────────

export interface ObserverSettledBarrier {
  readonly label: string;
  readonly waitedMs: number;
  readonly polls: number;
  /** At least one observer counter advanced past the pre-segment baseline. */
  readonly advanced: boolean;
  /** Milliseconds with no counter change before the barrier closed. */
  readonly quietMs: number;
  readonly timedOut: boolean;
  readonly beforeEventTimingSamples: number;
  readonly afterEventTimingSamples: number;
  readonly beforeLongTaskSamples: number;
  readonly afterLongTaskSamples: number;
  readonly snapshot: RendererPerfSnapshot | null;
}

/**
 * Bounded observer-delivery wait that closes on *settle*, not on a fixed sleep:
 * it returns once the counters have been quiet for `quietMs` after at least
 * `minWaitMs`, whether or not a sample was delivered. Fast trusted input can be
 * legitimately censored by the Event Timing 16 ms threshold, so "no advance" is
 * a recorded censoring outcome, not a reason to burn the whole timeout; a late
 * delivery burst is still absorbed because the counter must stop moving before
 * the window closes. The closing snapshot is the correct segment boundary.
 */
export async function waitForObserverSettled(input: {
  readonly cdp: ManagedCdpClient;
  readonly before: RendererPerfSnapshot | null;
  readonly label: string;
  readonly minWaitMs?: number;
  readonly quietMs?: number;
  readonly timeoutMs?: number;
  readonly pollMs?: number;
}): Promise<ObserverSettledBarrier> {
  const timeoutMs = input.timeoutMs ?? 4_000;
  const minWaitMs = input.minWaitMs ?? 150;
  const quietMs = input.quietMs ?? 250;
  const pollMs = input.pollMs ?? 100;
  const startedAt = Date.now();
  const baseline = observerCounts(input.before);
  let lastCounts = baseline;
  let lastChangeAt = startedAt;
  let snapshot: RendererPerfSnapshot | null = null;
  let polls = 0;
  let timedOut = false;
  for (;;) {
    snapshot =
      ((await input.cdp.snapshot().catch(() => null)) as unknown as RendererPerfSnapshot | null) ??
      snapshot;
    polls += 1;
    const counts = observerCounts(snapshot);
    if (counts.eventTiming !== lastCounts.eventTiming || counts.longTask !== lastCounts.longTask) {
      lastCounts = counts;
      lastChangeAt = Date.now();
    }
    const elapsed = Date.now() - startedAt;
    const quiet = Date.now() - lastChangeAt;
    if (elapsed >= minWaitMs && quiet >= quietMs) break;
    if (elapsed >= timeoutMs) {
      timedOut = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  const counts = observerCounts(snapshot);
  return {
    label: input.label,
    waitedMs: Date.now() - startedAt,
    polls,
    advanced: counts.eventTiming > baseline.eventTiming || counts.longTask > baseline.longTask,
    quietMs: Date.now() - lastChangeAt,
    timedOut,
    beforeEventTimingSamples: baseline.eventTiming,
    afterEventTimingSamples: counts.eventTiming,
    beforeLongTaskSamples: baseline.longTask,
    afterLongTaskSamples: counts.longTask,
    snapshot,
  };
}

// ── Segmented idle collection ───────────────────────────────────────────────

/** One bounded trusted-input batch. */
export interface TrustedInputBatch {
  readonly index: number;
  readonly kind: "click-batch" | "type-batch";
  readonly count: number;
}

/**
 * Splits the declared idle script into bounded batches: click batches of
 * `idleClicksPerSegment`, then typed batches of `idleTypedCharsPerSegment`,
 * then the closing click that finalizes the last Event Timing interaction.
 * The plan is deterministic so a run's window count is reproducible.
 */
export function planTrustedInputBatches(
  options: TrustedInputOptions,
): readonly TrustedInputBatch[] {
  const batches: TrustedInputBatch[] = [];
  const clickBatchSize = Math.max(1, options.idleClicksPerSegment);
  const typedBatchSize = Math.max(1, options.idleTypedCharsPerSegment);
  let index = 0;
  for (let remaining = options.idleClicks; remaining > 0; remaining -= clickBatchSize) {
    batches.push({
      index,
      kind: "click-batch",
      count: Math.min(clickBatchSize, remaining),
    });
    index += 1;
  }
  for (let remaining = options.idleTypedChars; remaining > 0; remaining -= typedBatchSize) {
    batches.push({
      index,
      kind: "type-batch",
      count: Math.min(typedBatchSize, remaining),
    });
    index += 1;
  }
  // Distinct closing event type so Event Timing can finalize the last
  // interaction duration instead of leaving the entry open.
  if (options.idleClicks > 0) {
    batches.push({ index, kind: "click-batch", count: 1 });
  }
  return batches;
}

export function buildIdleProbeText(targetChars: number): string {
  return "v2q probe ".repeat(Math.ceil(targetChars / 10)).slice(0, targetChars);
}

// ── Composer-surface diagnostics ────────────────────────────────────────────

export interface ComposerEditableCandidateRaw {
  readonly contentEditableAttr: string;
  readonly isContentEditable: boolean;
  readonly ariaDisabled: string | null;
}

export interface ComposerAnchorRaw {
  readonly editableCandidates: readonly ComposerEditableCandidateRaw[];
}

export interface ComposerSurfaceRaw {
  readonly anchorCount: number;
  readonly anchors: readonly ComposerAnchorRaw[];
  readonly selectorMatches: number;
}

/** Read-only page-side census of the composer anchors and their editable candidates. */
export function composerSurfaceDiagnosticExpression(selector: string): string {
  return `(() => {
    const anchors = [...document.querySelectorAll("[data-composer-input-anchor]")].slice(0, 4);
    return {
      anchorCount: document.querySelectorAll("[data-composer-input-anchor]").length,
      anchors: anchors.map((anchor) => ({
        editableCandidates: [...anchor.querySelectorAll("[contenteditable]")].slice(0, 4).map((el) => ({
          contentEditableAttr: el.getAttribute("contenteditable") ?? "",
          isContentEditable: el.isContentEditable,
          ariaDisabled: el.getAttribute("aria-disabled"),
        })),
      })),
      selectorMatches: document.querySelectorAll(${JSON.stringify(selector)}).length,
    };
  })()`;
}

/** Human-readable one-line listing; null when the page returned nothing usable. */
export function formatComposerSurfaceDiagnostic(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const census = raw as Partial<ComposerSurfaceRaw>;
  if (typeof census.anchorCount !== "number" || !Array.isArray(census.anchors)) return null;
  const parts = census.anchors.map((anchor, index) => {
    const candidates = Array.isArray(anchor?.editableCandidates)
      ? (anchor.editableCandidates as readonly ComposerEditableCandidateRaw[]).map((candidate) => {
          const disabled =
            candidate?.ariaDisabled === "true" || candidate?.contentEditableAttr === "false"
              ? " disabled"
              : "";
          return `[contenteditable="${candidate?.contentEditableAttr ?? "?"}"]${disabled}`;
        })
      : [];
    return `anchor[${String(index)}] editables=[${candidates.join(", ") || "none"}]`;
  });
  return (
    `composer surfaces: data-composer-input-anchor count=${String(census.anchorCount)}` +
    (parts.length > 0 ? `; ${parts.join("; ")}` : "") +
    `; declared selector matches=${String(census.selectorMatches ?? "?")}`
  );
}

/**
 * Best-effort diagnostic appended when trusted typing cannot find or focus an
 * editable composer: instead of a bare `missing`, the error names every
 * composer anchor on the page with its editable candidates' states, so an
 * ineligible fixture status (e.g. a seeded `inactive` thread rendering a
 * disabled composer) is visible at the failure site.
 */
export async function withComposerDiagnostic(
  error: unknown,
  cdp: Pick<ManagedCdpClient, "evaluate">,
  selector: string,
): Promise<unknown> {
  let diagnostic: string;
  try {
    diagnostic =
      formatComposerSurfaceDiagnostic(
        await cdp.evaluate(composerSurfaceDiagnosticExpression(selector)),
      ) ?? "composer surfaces: census returned no usable shape";
  } catch (diagnosticError) {
    diagnostic = `composer-surface diagnostic unavailable: ${
      diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError)
    }`;
  }
  if (error instanceof Error) {
    error.message = `${error.message} (${diagnostic})`;
    return error;
  }
  return new Error(`${String(error)} (${diagnostic})`);
}

export interface SegmentedIdlePhaseResult extends PhaseProtocolResult {
  readonly segments: readonly SegmentedIdleSegmentEvidence[];
  readonly aggregate: SegmentedIdleAggregateEvidence;
  /** Outer `(before0, afterLast]` summary of whatever the ring still retained. */
  readonly ringWindow: PhaseWindowEvidence | null;
}

function recordsInWindow<T>(
  records: readonly T[],
  beforeCapturedAt: number,
  afterCapturedAt: number,
  startOf: (record: T) => number,
): readonly T[] {
  return records.filter(
    (record) => startOf(record) > beforeCapturedAt && startOf(record) <= afterCapturedAt,
  );
}

function trustedPageSideDelay(events: readonly RecorderTrustedEvent[]): number | null {
  const delays = events
    .filter((event) => event.isTrusted)
    .map((event) => event.recordedAtMs - event.timeStamp);
  return delays.length > 0 ? Math.max(...delays) : null;
}

function recordKey(record: RendererPerfEventTimingRecord): string {
  return `${record.name}|${String(record.startMs)}|${String(record.interactionId)}`;
}

function recordsOnlyInLater<T>(
  later: readonly T[],
  earlier: readonly T[],
  keyOf: (record: T) => string,
  startOf: (record: T) => number,
  beforeCapturedAt: number,
): readonly T[] {
  const earlierKeys = new Set(earlier.map(keyOf));
  return later.filter(
    (record) => !earlierKeys.has(keyOf(record)) && startOf(record) <= beforeCapturedAt,
  );
}

/**
 * Segmented trusted-idle collection. Every batch closes with a bounded
 * observer-settle barrier, takes a closing snapshot, and records the actual
 * Event Timing/long-task/slow-frame records whose `startMs` falls inside its
 * own `(before, after]` window. Because each batch's closing snapshot is the
 * next batch's opening snapshot, the windows are contiguous and disjoint, and
 * the union equals the outer `phaseWindowEvidence(before0, afterLast)` window —
 * so the union summary is computed from real ring records, never from
 * per-segment percentiles combined afterwards.
 */
export async function runSegmentedTrustedIdlePhase(input: {
  readonly cdp: ManagedCdpClient;
  readonly options: TrustedInputOptions;
  readonly evidenceDir?: string;
}): Promise<SegmentedIdlePhaseResult> {
  const { cdp, options } = input;
  const phase = "trusted-idle";
  const recorderBefore = await readTrustedInputRecorder(cdp).catch(() => null);
  const before = await readSnapshot(cdp);
  await cdp.setPhase(phase);
  const startedAt = Date.now();
  const segments: SegmentedIdleSegmentEvidence[] = [];
  const dispatchRecords: DispatchRecord[] = [];
  const probeText = buildIdleProbeText(options.idleTypedChars);
  const batches = planTrustedInputBatches(options);
  let previousAfter = before;
  let previousRecorder = recorderBefore;
  let typedOffset = 0;
  for (const batch of batches) {
    const segmentStartedAt = Date.now();
    const segmentRecorderBefore = await readTrustedInputRecorder(cdp).catch(() => null);
    const dispatch: DispatchRecord[] = [];
    let typingFidelity: TrustedTypingEvidence | null = null;
    if (batch.kind === "click-batch") {
      for (let click = 0; click < batch.count; click += 1) {
        await dispatchClick({
          cdp,
          selector: options.clickSelector,
          phase,
          kind: "click",
          records: dispatch,
        });
      }
    } else {
      const chunk = probeText.slice(typedOffset, typedOffset + batch.count);
      typedOffset += chunk.length;
      const startedAtMs = Date.now();
      try {
        // The helper reads the real composer back and fails the batch (and the
        // cell) when the declared chunk was not inserted exactly once; the
        // returned evidence is recorded per segment and aggregated.
        typingFidelity = await cdp.trustedType(options.composerSelector, chunk);
        dispatch.push({
          phase,
          kind: "type",
          selector: options.composerSelector,
          startedAtMs,
          finishedAtMs: Date.now(),
          error: null,
        });
      } catch (error) {
        const augmented = await withComposerDiagnostic(error, cdp, options.composerSelector);
        dispatch.push({
          phase,
          kind: "type",
          selector: options.composerSelector,
          startedAtMs,
          finishedAtMs: Date.now(),
          error: augmented instanceof Error ? augmented.message : String(augmented),
        });
        throw augmented;
      }
    }
    const segmentRecorderAfter = await readTrustedInputRecorder(cdp).catch(() => null);
    const barrier = await waitForObserverSettled({
      cdp,
      before: previousAfter,
      label: `${phase} segment ${String(batch.index + 1)}/${String(batches.length)} ${batch.kind}`,
      timeoutMs: options.idleObserverTimeoutMs,
    });
    const after = barrier.snapshot ?? (await readSnapshot(cdp));
    dispatchRecords.push(...dispatch);
    const windowStart = previousAfter?.capturedAtMonotonicMs ?? null;
    const expectedWindowStart =
      segments.length === 0
        ? (before?.capturedAtMonotonicMs ?? null)
        : (segments.at(-1)?.afterCapturedAtMonotonicMs ?? null);
    // Ring identity: `dropped + index` is the record's global FIFO push
    // ordinal, invariant while retained, so newly delivered records are
    // exactly the ordinals at/after the opening snapshot's total pushed count.
    // That makes late delivery, duplicate values and pre-phase retention
    // distinguishable by identity instead of by comparing value shapes.
    const openingTotalPushed = ringTotalPushed(previousAfter);
    const closingTotalPushed = ringTotalPushed(after);
    const ordinalBacked =
      openingTotalPushed !== null &&
      closingTotalPushed !== null &&
      closingTotalPushed >= openingTotalPushed;
    const ordinaledAfterRecords: readonly SegmentedEventTimingSample[] =
      after === null
        ? []
        : after.recentEventTimings.map((record, index) => {
            const ordinal = ringOrdinalOf(after, index);
            return ordinal === null ? { ...record } : { ...record, ringOrdinal: ordinal };
          });
    const newlyPushed = ordinalBacked
      ? ordinaledAfterRecords.filter(
          (record) => (record.ringOrdinal as number) >= (openingTotalPushed as number),
        )
      : ordinaledAfterRecords;
    let samples: readonly SegmentedEventTimingSample[] = [];
    let lateArrivalSamples: readonly SegmentedEventTimingSample[] = [];
    let futureStartSamples: readonly SegmentedEventTimingSample[] = [];
    if (ordinalBacked && windowStart !== null && after !== null) {
      const windowEnd = after.capturedAtMonotonicMs;
      samples = newlyPushed.filter(
        (record) => record.startMs > windowStart && record.startMs <= windowEnd,
      );
      lateArrivalSamples = newlyPushed.filter((record) => record.startMs <= windowStart);
      futureStartSamples = newlyPushed.filter((record) => record.startMs > windowEnd);
    } else if (after !== null && previousAfter !== null) {
      // Structural fallback for a missing opening snapshot: no ordinal base is
      // available, so records are classified by timestamp window only.
      samples = recordsInWindow(
        ordinaledAfterRecords,
        previousAfter.capturedAtMonotonicMs,
        after.capturedAtMonotonicMs,
        (record) => record.startMs,
      );
      lateArrivalSamples = recordsOnlyInLater(
        ordinaledAfterRecords,
        previousAfter.recentEventTimings,
        recordKey,
        (record) => record.startMs,
        previousAfter.capturedAtMonotonicMs,
      );
    }
    const longTasks =
      after === null || previousAfter === null
        ? []
        : recordsInWindow(
            after.recentLongTasks,
            previousAfter.capturedAtMonotonicMs,
            after.capturedAtMonotonicMs,
            (record) => record.startMs,
          );
    const slowFrames =
      after === null || previousAfter === null
        ? []
        : recordsInWindow(
            after.recentSlowFrames,
            previousAfter.capturedAtMonotonicMs,
            after.capturedAtMonotonicMs,
            (record) => record.atMs,
          );
    const phaseEvents = sliceRecorderEvents(segmentRecorderBefore, segmentRecorderAfter);
    const contiguousWithPrevious =
      windowStart !== null && expectedWindowStart !== null && windowStart === expectedWindowStart;
    segments.push({
      index: batch.index,
      kind: batch.kind,
      dispatchedClicks: batch.kind === "click-batch" ? batch.count : 0,
      dispatchedTypedChars: batch.kind === "type-batch" ? batch.count : 0,
      beforeCapturedAtMonotonicMs: previousAfter?.capturedAtMonotonicMs ?? 0,
      afterCapturedAtMonotonicMs: after?.capturedAtMonotonicMs ?? 0,
      contiguousWithPrevious,
      samples,
      lateArrivalSamples,
      openingTotalPushed,
      closingTotalPushed,
      futureStartSamples,
      longTasks,
      slowFrames,
      droppedEventTimings:
        (after?.droppedEventTimings ?? 0) - (previousAfter?.droppedEventTimings ?? 0),
      droppedLongTasks: (after?.droppedLongTasks ?? 0) - (previousAfter?.droppedLongTasks ?? 0),
      droppedSlowFrames: (after?.droppedSlowFrames ?? 0) - (previousAfter?.droppedSlowFrames ?? 0),
      droppedSpans: (after?.droppedSpans ?? 0) - (previousAfter?.droppedSpans ?? 0),
      skippedDelta:
        (after?.observers.eventTiming.skippedEntryCount ?? 0) -
        (previousAfter?.observers.eventTiming.skippedEntryCount ?? 0),
      eligibleTrustedInputs: phaseEvents.filter((event) => event.isTrusted).length,
      pageSideMaxDelayMs: trustedPageSideDelay(phaseEvents),
      rafFramesDuringSegment:
        (segmentRecorderAfter?.rafFrames ?? 0) - (segmentRecorderBefore?.rafFrames ?? 0),
      durationMs: Date.now() - segmentStartedAt,
      barrier,
      phaseEvents,
      recorderBefore: segmentRecorderBefore,
      recorderAfter: segmentRecorderAfter,
      typingFidelity,
    });
    previousAfter = after;
    previousRecorder = segmentRecorderAfter;
  }
  const last = segments.at(-1);
  const after = previousAfter;
  const recorderAfter = previousRecorder;
  const durationMs = Date.now() - startedAt;
  const rafFramesDuringPhase = (recorderAfter?.rafFrames ?? 0) - (recorderBefore?.rafFrames ?? 0);
  const phaseEvents = segments.flatMap((segment) => segment.phaseEvents);
  const { window, ringWindow, aggregate } = buildSegmentedIdleAggregate({
    before,
    after,
    phase,
    segments,
    rafFramesBefore: recorderBefore?.rafFrames ?? 0,
    rafFramesAfter: recorderAfter?.rafFrames ?? 0,
  });
  return {
    phase,
    before,
    after,
    window,
    barrier: last?.barrier ?? {
      label: `${phase} no batches`,
      waitedMs: 0,
      polls: 0,
      advanced: false,
      quietMs: 0,
      timedOut: false,
      beforeEventTimingSamples: 0,
      afterEventTimingSamples: 0,
      beforeLongTaskSamples: 0,
      afterLongTaskSamples: 0,
      snapshot: null,
    },
    recorderBefore,
    recorderAfter,
    phaseEvents,
    rafFramesDuringPhase,
    paintFramesPerSecond:
      durationMs > 0 ? Math.round((rafFramesDuringPhase / (durationMs / 1000)) * 100) / 100 : null,
    dispatch: dispatchRecords,
    durationMs,
    segments,
    aggregate,
    ringWindow,
  };
}

// ── Phase protocol ──────────────────────────────────────────────────────────

export interface DispatchRecord {
  readonly phase: string;
  readonly kind: "click" | "type" | "queued-click";
  readonly selector: string;
  readonly startedAtMs: number;
  readonly finishedAtMs: number;
  readonly error: string | null;
}

export interface PhaseProtocolResult {
  readonly phase: string;
  readonly before: RendererPerfSnapshot | null;
  readonly after: RendererPerfSnapshot | null;
  readonly window: PhaseWindowEvidence | null;
  readonly barrier: ObserverDeliveryBarrier | ObserverSettledBarrier;
  readonly recorderBefore: RecorderState | null;
  readonly recorderAfter: RecorderState | null;
  readonly phaseEvents: readonly RecorderTrustedEvent[];
  readonly rafFramesDuringPhase: number;
  readonly paintFramesPerSecond: number | null;
  readonly dispatch: readonly DispatchRecord[];
  readonly durationMs: number;
}

async function readSnapshot(cdp: ManagedCdpClient): Promise<RendererPerfSnapshot | null> {
  return (await cdp.snapshot()) as unknown as RendererPerfSnapshot | null;
}

async function dispatchClick(input: {
  readonly cdp: ManagedCdpClient;
  readonly selector: string;
  readonly phase: string;
  readonly kind: DispatchRecord["kind"];
  readonly records: DispatchRecord[];
}): Promise<void> {
  const startedAtMs = Date.now();
  try {
    await input.cdp.trustedClick(input.selector);
    input.records.push({
      phase: input.phase,
      kind: input.kind,
      selector: input.selector,
      startedAtMs,
      finishedAtMs: Date.now(),
      error: null,
    });
  } catch (error) {
    input.records.push({
      phase: input.phase,
      kind: input.kind,
      selector: input.selector,
      startedAtMs,
      finishedAtMs: Date.now(),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function runTrustedIdlePhase(input: {
  readonly cdp: ManagedCdpClient;
  readonly options: TrustedInputOptions;
  readonly evidenceDir?: string;
}): Promise<PhaseProtocolResult> {
  const { cdp, options } = input;
  const recorderBefore = await readTrustedInputRecorder(cdp).catch(() => null);
  const before = await readSnapshot(cdp);
  const phase = "trusted-idle";
  await cdp.setPhase(phase);
  const startedAt = Date.now();
  const dispatch: DispatchRecord[] = [];
  for (let index = 0; index < options.idleClicks; index += 1) {
    await dispatchClick({
      cdp,
      selector: options.clickSelector,
      phase,
      kind: "click",
      records: dispatch,
    });
  }
  if (options.idleTypedChars > 0) {
    const startedAtMs = Date.now();
    const probeText = "v2q probe "
      .repeat(Math.ceil(options.idleTypedChars / 10))
      .slice(0, options.idleTypedChars);
    try {
      await cdp.trustedType(options.composerSelector, probeText);
      dispatch.push({
        phase,
        kind: "type",
        selector: options.composerSelector,
        startedAtMs,
        finishedAtMs: Date.now(),
        error: null,
      });
    } catch (error) {
      const augmented = await withComposerDiagnostic(error, cdp, options.composerSelector);
      dispatch.push({
        phase,
        kind: "type",
        selector: options.composerSelector,
        startedAtMs,
        finishedAtMs: Date.now(),
        error: augmented instanceof Error ? augmented.message : String(augmented),
      });
      throw augmented;
    }
  }
  // Close the last interaction with a distinct event type so Event Timing can
  // finalize interaction durations instead of leaving the entry open.
  await dispatchClick({
    cdp,
    selector: options.clickSelector,
    phase,
    kind: "click",
    records: dispatch,
  });
  const barrier = await waitForObserverDelivery({
    cdp,
    before,
    requireEventTiming: false,
    requireLongTask: false,
    label: `${phase} delivery`,
    timeoutMs: options.idleObserverTimeoutMs,
  });
  const after = barrier.snapshot ?? (await readSnapshot(cdp));
  const recorderAfter = await readTrustedInputRecorder(cdp).catch(() => null);
  const durationMs = Date.now() - startedAt;
  const rafFramesDuringPhase = (recorderAfter?.rafFrames ?? 0) - (recorderBefore?.rafFrames ?? 0);
  return {
    phase,
    before,
    after,
    window: before && after ? phaseWindowEvidence(before, after, phase) : null,
    barrier,
    recorderBefore,
    recorderAfter,
    phaseEvents: sliceRecorderEvents(recorderBefore, recorderAfter),
    rafFramesDuringPhase,
    paintFramesPerSecond:
      durationMs > 0 ? Math.round((rafFramesDuringPhase / (durationMs / 1000)) * 100) / 100 : null,
    dispatch,
    durationMs,
  };
}

export interface BlockedCycleEvidence {
  readonly cycle: number;
  readonly armStatus: string;
  readonly center: { readonly x: number; readonly y: number } | null;
  readonly firstClickError: string | null;
  readonly queuedClickError: string | null;
  readonly block: RecorderBlock | null;
  readonly blockStartMs: number | null;
  readonly blockEndMs: number | null;
  readonly blockDurationMs: number | null;
}

export interface BlockedPhaseResult extends PhaseProtocolResult {
  readonly cycles: readonly BlockedCycleEvidence[];
}

/**
 * Blocked positive control. Each cycle:
 *  1. arms a one-shot trusted `pointerdown` handler that runs a real DOM task
 *     blocking the main thread for `blockMs`;
 *  2. writes *both* click sequences to the CDP socket immediately (the queued
 *     click's input is in the browser pipeline while the first handler blocks);
 *  3. reads the page recorder to prove block start/end and that the queued
 *     click was processed after the block.
 */
export async function runBlockedControlPhase(input: {
  readonly cdp: ManagedCdpClient;
  readonly options: TrustedInputOptions;
  readonly evidenceDir?: string;
}): Promise<BlockedPhaseResult> {
  const { cdp, options } = input;
  const recorderBefore = await readTrustedInputRecorder(cdp).catch(() => null);
  const before = await readSnapshot(cdp);
  const phase = "trusted-blocked";
  await cdp.setPhase(phase);
  const startedAt = Date.now();
  const dispatch: DispatchRecord[] = [];
  const cycles: BlockedCycleEvidence[] = [];
  for (let cycle = 1; cycle <= options.blockedCycles; cycle += 1) {
    const center = await cdp.resolveElementCenter(options.clickSelector);
    if (!center) throw new Error(`blocked control target is missing: ${options.clickSelector}`);
    const armStatus = await armTrustedInputBlock(cdp, options.blockMs);
    if (armStatus !== "armed") {
      throw new Error(`trusted-input block did not arm (cycle ${String(cycle)}): ${armStatus}`);
    }
    const startedAtMs = Date.now();
    const first = cdp.dispatchTrustedClickAt(center);
    const queued = cdp.dispatchTrustedClickAt(center);
    const [firstOutcome, queuedOutcome] = await Promise.allSettled([first, queued]);
    dispatch.push({
      phase,
      kind: "click",
      selector: options.clickSelector,
      startedAtMs,
      finishedAtMs: Date.now(),
      error: firstOutcome.status === "rejected" ? String(firstOutcome.reason) : null,
    });
    dispatch.push({
      phase,
      kind: "queued-click",
      selector: options.clickSelector,
      startedAtMs,
      finishedAtMs: Date.now(),
      error: queuedOutcome.status === "rejected" ? String(queuedOutcome.reason) : null,
    });
    const recorder = await readTrustedInputRecorder(cdp).catch(() => null);
    const block = recorder?.block ?? null;
    cycles.push({
      cycle,
      armStatus,
      center,
      firstClickError: firstOutcome.status === "rejected" ? String(firstOutcome.reason) : null,
      queuedClickError: queuedOutcome.status === "rejected" ? String(queuedOutcome.reason) : null,
      block,
      blockStartMs: block?.startMs ?? null,
      blockEndMs: block?.endMs ?? null,
      blockDurationMs:
        block?.startMs !== null &&
        block?.startMs !== undefined &&
        block?.endMs !== null &&
        block?.endMs !== undefined
          ? block.endMs - block.startMs
          : null,
    });
    await disarmTrustedInputBlock(cdp).catch(() => "missing");
  }
  const barrier = await waitForObserverDelivery({
    cdp,
    before,
    requireEventTiming: true,
    requireLongTask: true,
    label: `${phase} delivery`,
    timeoutMs: options.blockedObserverTimeoutMs,
  });
  const after = barrier.snapshot ?? (await readSnapshot(cdp));
  const recorderAfter = await readTrustedInputRecorder(cdp).catch(() => null);
  const durationMs = Date.now() - startedAt;
  const rafFramesDuringPhase = (recorderAfter?.rafFrames ?? 0) - (recorderBefore?.rafFrames ?? 0);
  return {
    phase,
    before,
    after,
    window: before && after ? phaseWindowEvidence(before, after, phase) : null,
    barrier,
    recorderBefore,
    recorderAfter,
    phaseEvents: sliceRecorderEvents(recorderBefore, recorderAfter),
    rafFramesDuringPhase,
    paintFramesPerSecond:
      durationMs > 0 ? Math.round((rafFramesDuringPhase / (durationMs / 1000)) * 100) / 100 : null,
    dispatch,
    durationMs,
    cycles,
  };
}

/** Events recorded since the pre-phase read; falls back to a prefix slice when
 * the bounded recorder array was truncated mid-phase. */
export function sliceRecorderEvents(
  before: RecorderState | null,
  after: RecorderState | null,
): readonly RecorderTrustedEvent[] {
  const events = after?.trustedEvents ?? [];
  if (!before) return events;
  if (after?.trustedEventsTruncated) return events;
  const start = Math.min(before.trustedEvents.length, events.length);
  return events.slice(start);
}

export interface QueuedInputEvidence {
  readonly eventTiming: {
    readonly name: string;
    readonly startMs: number;
    readonly inputDelayMs: number;
    readonly processingStartMs: number;
    readonly interactionDurationMs: number | null;
  } | null;
  readonly pageEvent: RecorderTrustedEvent | null;
  readonly createdBeforeBlockEnd: boolean;
  readonly processedAfterBlockStart: boolean;
  readonly processedAfterBlockEnd: boolean;
  readonly delayMs: number | null;
}

export interface BlockedControlPolicy {
  readonly ok: boolean;
  readonly reasons: readonly string[];
  readonly queued: QueuedInputEvidence;
  readonly block: {
    readonly fired: boolean;
    readonly handlerType: string | null;
    readonly startMs: number | null;
    readonly endMs: number | null;
    readonly durationMs: number | null;
  };
  readonly longTask: {
    readonly status: string;
    readonly samples: number;
    readonly over200Ms: number;
    readonly maxMs: number | null;
  };
  readonly contrast: {
    readonly idleMaxInputDelayMs: number | null;
    readonly idleP95InputDelayMs: number | null;
    readonly blockedMaxInputDelayMs: number | null;
    readonly queuedDelayMs: number | null;
    readonly elevationOverIdleP95Ms: number | null;
    readonly elevationOverIdleMaxMs: number | null;
    /**
     * Whether the idle baseline population was complete (no unread ring loss /
     * skips). The p95 baseline is still used when the population is lossy —
     * the causal criteria are absolute — but this records that provenance so a
     * lossy baseline is never silently presented as full-population.
     */
    readonly idlePopulationComplete: boolean | null;
  };
}

function findQueuedInputEvidence(input: {
  readonly after: RendererPerfSnapshot | null;
  readonly block: RecorderBlock | null;
  readonly phaseEvents: readonly RecorderTrustedEvent[];
  readonly windowStartMs: number | null;
  readonly minDelayMs: number;
  /**
   * End of the immediately preceding block cycle in the same phase, when the
   * evaluated block is not the first cycle. The cycle loop is sequential
   * (each cycle's clicks are written only after the previous cycle's block was
   * read back), so this block's queued event is always created after that end;
   * an event created earlier was queued behind — and released by — the earlier
   * block. Without this floor the wide lookback below reaches two cycles back
   * and pairs a released event with the wrong block window.
   */
  readonly earlierBlockEndMs?: number | null;
}): QueuedInputEvidence {
  const block = input.block;
  const records = input.after?.recentEventTimings ?? [];
  const windowStart = input.windowStartMs;
  const windowEnd = input.after?.capturedAtMonotonicMs ?? Number.POSITIVE_INFINITY;
  const blockStartMs = block?.startMs ?? null;
  const blockEndMs = block?.endMs ?? null;
  // Any event whose processing only started when the block released is the
  // queued input: both trusted clicks are written to the CDP socket together,
  // so the compositor can create the second click's event while the main
  // thread is still approaching the handler. Under host contention that gap
  // can exceed 100 ms, so the neighborhood bound below is wide (the causal
  // criteria are `startMs <= blockEndMs` plus processing at/after the block
  // end, not the creation-to-handler gap). Pointer events may carry
  // interactionId 0, so the id is recorded but never required for the match.
  const candidates = records.filter(
    (record) =>
      (windowStart === null || record.startMs > windowStart) &&
      record.startMs <= windowEnd &&
      record.inputDelayMs >= input.minDelayMs &&
      (blockStartMs === null || record.startMs >= blockStartMs - 500) &&
      (input.earlierBlockEndMs == null || record.startMs > input.earlierBlockEndMs) &&
      (blockEndMs === null || record.startMs <= blockEndMs),
  );
  const best =
    candidates.length > 0
      ? [...candidates].sort((left, right) => right.inputDelayMs - left.inputDelayMs)[0]!
      : null;
  const eventTiming = best
    ? {
        name: best.name ?? "unknown",
        startMs: best.startMs,
        inputDelayMs: best.inputDelayMs,
        processingStartMs: best.startMs + best.inputDelayMs,
        interactionDurationMs: best.interactionDurationMs,
      }
    : null;
  const pageCandidates = input.phaseEvents.filter(
    (event) =>
      event.isTrusted &&
      event.type === "pointerdown" &&
      blockStartMs !== null &&
      event.recordedAtMs >= blockStartMs,
  );
  const pageEvent =
    pageCandidates.length > 0
      ? [...pageCandidates].sort((left, right) => right.recordedAtMs - left.recordedAtMs)[0]!
      : null;
  const createdBeforeBlockEnd =
    eventTiming !== null && blockEndMs !== null ? eventTiming.startMs <= blockEndMs : false;
  const processedAfterBlockStart =
    eventTiming !== null && blockStartMs !== null
      ? eventTiming.processingStartMs >= blockStartMs
      : false;
  const processedAfterBlockEnd =
    eventTiming !== null && blockEndMs !== null
      ? eventTiming.processingStartMs >= blockEndMs - 25
      : false;
  return {
    eventTiming,
    pageEvent,
    createdBeforeBlockEnd,
    processedAfterBlockStart,
    processedAfterBlockEnd,
    delayMs: eventTiming?.inputDelayMs ?? null,
  };
}

export interface BlockedControlInput {
  readonly window: PhaseWindowEvidence | null;
  readonly after: RendererPerfSnapshot | null;
  readonly block: RecorderBlock | null;
  readonly phaseEvents: readonly RecorderTrustedEvent[];
  readonly idleMaxInputDelayMs: number | null;
  /**
   * Robust idle baseline for the contrast check. The idle maximum is a tail
   * statistic that a contaminated host can inflate arbitrarily (observed:
   * hundreds of ms of idle input delay with no injected block), so the
   * elevation criterion compares the queued input against the idle p95.
   */
  readonly idleP95InputDelayMs?: number | null;
  readonly idleMeasured: boolean;
  readonly minQueuedInputDelayMs: number;
  readonly idleWindowStartMs: number | null;
  /** Completeness of the idle population the p95 baseline was read from. */
  readonly idlePopulationComplete?: boolean | null;
  /**
   * End of the block cycle immediately before the evaluated one (null for the
   * first cycle). Queued-event matching must not reach back past it: an event
   * created earlier was released by that earlier block.
   */
  readonly earlierBlockEndMs?: number | null;
}

/** Blocked-phase policy: a real scheduled DOM block task produced at least one
 * >=200 ms long task, and a queued trusted event shows the expected delay. */
export function evaluateBlockedControl(input: BlockedControlInput): BlockedControlPolicy {
  const win = input.window;
  const reasons: string[] = [];
  const blockStartMs = input.block?.startMs ?? null;
  const blockEndMs = input.block?.endMs ?? null;
  const blockDurationMs =
    blockStartMs !== null && blockEndMs !== null ? blockEndMs - blockStartMs : null;
  const queued = findQueuedInputEvidence({
    after: input.after,
    block: input.block,
    phaseEvents: input.phaseEvents,
    windowStartMs: input.idleWindowStartMs,
    minDelayMs: input.minQueuedInputDelayMs,
    ...(input.earlierBlockEndMs === undefined
      ? {}
      : { earlierBlockEndMs: input.earlierBlockEndMs }),
  });
  const longTask = {
    status: win?.longTasks.observerStatus ?? "not-installed",
    samples: win?.longTasks.samples ?? 0,
    over200Ms: win?.longTasks.over200Ms ?? 0,
    maxMs: win?.longTasks.duration.maxMs ?? null,
  };
  const blockedMaxInputDelayMs = win?.eventTimings.inputDelay.maxMs ?? null;
  const idleP95InputDelayMs =
    input.idleP95InputDelayMs !== undefined ? input.idleP95InputDelayMs : input.idleMaxInputDelayMs;
  const queuedDelayMs = queued.delayMs;
  const elevationOverIdleP95Ms =
    queuedDelayMs !== null && idleP95InputDelayMs !== null
      ? queuedDelayMs - idleP95InputDelayMs
      : null;
  const elevationOverIdleMaxMs =
    queuedDelayMs !== null && input.idleMaxInputDelayMs !== null
      ? queuedDelayMs - input.idleMaxInputDelayMs
      : null;
  const contrast = {
    idleMaxInputDelayMs: input.idleMaxInputDelayMs,
    idleP95InputDelayMs,
    blockedMaxInputDelayMs,
    queuedDelayMs,
    elevationOverIdleP95Ms,
    elevationOverIdleMaxMs,
    idlePopulationComplete: input.idlePopulationComplete ?? null,
  };
  if (longTask.status !== "supported") reasons.push(`long task observer is ${longTask.status}`);
  if (!(input.block?.fired ?? false)) reasons.push("the scheduled DOM block never fired");
  if (input.block?.handlerType !== "pointerdown") {
    reasons.push(`block ran in handler ${String(input.block?.handlerType)}`);
  }
  if (blockDurationMs === null || blockDurationMs < 200) {
    reasons.push(`blocking DOM task was ${String(blockDurationMs)}ms (< 200ms)`);
  }
  if (longTask.over200Ms < 1) {
    reasons.push(`long task observer recorded ${String(longTask.over200Ms)} entries >= 200ms`);
  }
  if (!queued.eventTiming) {
    reasons.push(
      `no queued trusted input showed >= ${String(input.minQueuedInputDelayMs)}ms input delay`,
    );
  } else {
    if (!queued.createdBeforeBlockEnd) {
      reasons.push("queued trusted event was created after the block ended");
    }
    if (!queued.processedAfterBlockEnd) {
      reasons.push("queued trusted event was processed before the block ended");
    }
  }
  if (input.idleMeasured) {
    if (
      queuedDelayMs === null ||
      idleP95InputDelayMs === null ||
      queuedDelayMs < idleP95InputDelayMs + 100
    ) {
      reasons.push(
        `queued trusted input delay did not show >=100ms elevation over the idle p95 ` +
          `(idleP95=${String(idleP95InputDelayMs)}, queued=${String(queuedDelayMs)})`,
      );
    }
  } else if (queued.delayMs !== null && queued.delayMs < input.minQueuedInputDelayMs) {
    reasons.push(
      `queued delay ${String(queued.delayMs)}ms < ${String(input.minQueuedInputDelayMs)}ms`,
    );
  }
  return {
    ok: reasons.length === 0,
    reasons,
    queued,
    block: {
      fired: input.block?.fired ?? false,
      handlerType: input.block?.handlerType ?? null,
      startMs: blockStartMs,
      endMs: blockEndMs,
      durationMs: blockDurationMs,
    },
    longTask,
    contrast,
  };
}

// ── Full protocol ───────────────────────────────────────────────────────────

export interface TrustedInputProtocolResult {
  readonly options: TrustedInputOptions;
  readonly foreground: ForegroundSurfaceEvidence;
  readonly idle: SegmentedIdlePhaseResult;
  readonly blocked: BlockedPhaseResult;
  readonly idlePolicy: SurfacePolicy;
  readonly blockedPolicy: BlockedControlPolicy;
  readonly policy: {
    readonly change: string;
    readonly reference: string;
    readonly numericBudgetRule: string;
  };
}

export async function runTrustedInputProtocol(input: {
  readonly cdp: ManagedCdpClient;
  readonly options?: Partial<TrustedInputOptions>;
  readonly evidenceDir?: string;
  readonly timeoutMs?: number;
}): Promise<TrustedInputProtocolResult> {
  const options = resolveTrustedInputOptions(input.options);
  const cdp = input.cdp;
  const foreground = await ensureForegroundSurface({
    cdp,
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    ...(input.evidenceDir === undefined ? {} : { evidenceDir: input.evidenceDir }),
  });
  const idle = await runSegmentedTrustedIdlePhase({
    cdp,
    options,
    ...(input.evidenceDir === undefined ? {} : { evidenceDir: input.evidenceDir }),
  });
  const idleSurface = await readSurfaceState(cdp).catch(() => ({
    visibilityState: null,
    hasFocus: null,
    readyState: null,
  }));
  const idleScreenshotBytes = await capturePaintEvidence({
    cdp,
    rafFrames: idle.rafFramesDuringPhase,
    rafMaxGapMs: idle.recorderAfter?.rafMaxGapMs ?? null,
    ...(input.evidenceDir === undefined ? {} : { evidenceDir: input.evidenceDir }),
    label: "trusted-idle-paint",
  });
  // The blocked-phase positive control is needed to accept a censored idle
  // window, so evaluate it first, then finalize the idle policy.
  const blocked = await runBlockedControlPhase({
    cdp,
    options,
    ...(input.evidenceDir === undefined ? {} : { evidenceDir: input.evidenceDir }),
  });
  const idleMeasured = (idle.window?.eventTimings.samples ?? 0) > 0;
  const blockedPolicy = evaluateBlockedControl({
    window: blocked.window,
    after: blocked.after,
    block: blocked.recorderAfter?.block ?? null,
    phaseEvents: blocked.phaseEvents,
    // The evaluated block is the last cycle's; exclude queued-event candidates
    // the earlier cycles' blocks already released (sequential cycle loop, so
    // this block's queued event is always created after the previous end).
    earlierBlockEndMs:
      blocked.cycles.length > 1 ? (blocked.cycles.at(-2)?.blockEndMs ?? null) : null,
    idleMaxInputDelayMs: idleMeasured ? (idle.window?.eventTimings.inputDelay.maxMs ?? null) : null,
    idleP95InputDelayMs: idleMeasured ? (idle.window?.eventTimings.inputDelay.p95Ms ?? null) : null,
    // The p95 baseline is read from the (possibly lossy) union population;
    // record that provenance. A lossy baseline never satisfies a numeric
    // budget, and the blocked-control decision itself rests on the absolute
    // causal criteria (real block, >=200ms long task, created-before-end,
    // processed-after-end, >= minQueuedInputDelayMs).
    idlePopulationComplete: idle.aggregate.populationComplete,
    idleMeasured,
    minQueuedInputDelayMs: options.minQueuedInputDelayMs,
    idleWindowStartMs: idle.before?.capturedAtMonotonicMs ?? null,
  });
  const idlePolicy = evaluateIdlePopulation({
    window: idle.window?.eventTimings ?? null,
    skippedBefore: idle.before?.observers.eventTiming.skippedEntryCount ?? 0,
    skippedAfter: idle.after?.observers.eventTiming.skippedEntryCount ?? 0,
    phaseEvents: idle.phaseEvents,
    rafFramesDuringPhase: idle.rafFramesDuringPhase,
    screenshotBytes: idleScreenshotBytes.screenshotBytes,
    surface: idleSurface,
    positiveControlMeasured: blockedPolicy.ok,
  });
  return {
    options,
    foreground,
    idle,
    blocked,
    idlePolicy,
    blockedPolicy,
    policy: {
      change:
        "trusted-input/longtask measurement policy: foreground+frame proof required; real scheduled DOM-task block with a queued trusted input; idle input is collected in bounded batches, each closed by an observer-settle barrier and its own disjoint snapshot window, and the union window (actual ring records) is the only measured population — a supported 0-sample idle is accepted only as an explicit censored percentile (never a numeric budget pass) with eligible input count, no ring/skip loss, paint and blocked positive control.",
      reference:
        "https://www.w3.org/TR/event-timing/#sec-performance-observer (16ms durationThreshold floor)",
      numericBudgetRule:
        "numeric latency budgets require a measured population; censored/unavailable populations are recorded and never counted as passing",
    },
  };
}
