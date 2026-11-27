import {
  TERMINAL_CURSOR_MACHINE_SPEC,
  validateTerminalCursorMachineSpec,
  type TerminalCursorGuard,
  type TerminalCursorRule,
} from "../terminalCursorMachineSpec";
import {
  MAX_TERMINAL_COLS,
  MAX_TERMINAL_COLUMN_CHANGES,
  MIN_TERMINAL_COLS,
} from "../../../terminalColumnHistory";

const HEADER = [
  "// GENERATED FILE. Do not edit by hand. Run `pnpm protocol:remote:v3:generate`.",
  "// Terminal-cursor reconciliation machine rendered from the declarative spec in",
  `// src/shared/remote/contract/terminalCursorMachineSpec.ts (spec version ${TERMINAL_CURSOR_MACHINE_SPEC.specVersion}).`,
  "package com.poracode.remote.v3.generated",
  "",
];

const GUARD_ENTRIES: Record<TerminalCursorGuard, string> = {
  always: "Always",
  staleWatch: "StaleWatch",
  invalidRange: "InvalidRange",
  baselineResumeSuffix: "BaselineResumeSuffix",
  baseline: "Baseline",
  preBaselineWithoutGeneration: "PreBaselineWithoutGeneration",
  preBaselineOverBudget: "PreBaselineOverBudget",
  preBaseline: "PreBaseline",
  pendingResync: "PendingResync",
  generationChanged: "GenerationChanged",
  upToDate: "UpToDate",
  cursorGap: "CursorGap",
  unappendableOverlap: "UnappendableOverlap",
};

function reasonEntry(reason: string): string {
  switch (reason) {
    case "stale-watch":
      return "StaleWatch";
    case "invalid-range":
      return "InvalidRange";
    case "missing-baseline":
      return "MissingBaseline";
    case "generation-changed":
      return "GenerationChanged";
    case "cursor-gap":
      return "CursorGap";
    case "invalid-utf16-boundary":
      return "InvalidUtf16Boundary";
    default:
      throw new Error(`unknown terminal-cursor reason ${reason}`);
  }
}

function ruleLiteral(rule: TerminalCursorRule): string {
  const kind =
    rule.kind === undefined ? "null" : `TerminalCursorFrameKind.${rule.kind.toUpperCase()}`;
  const reason =
    rule.reason === undefined
      ? "null"
      : `TerminalCursorReconciliationReason.${reasonEntry(rule.reason)}`;
  return `        TerminalCursorRule("${rule.id}", ${kind}, TerminalCursorGuardKind.${GUARD_ENTRIES[rule.guard]}, TerminalCursorEffect.${rule.effect.charAt(0).toUpperCase()}${rule.effect.slice(1)}, ${reason}, ${rule.clearBufferedOutput === true}),`;
}

export function emitKotlinTerminalCursorMachine(): string {
  const errors = validateTerminalCursorMachineSpec(TERMINAL_CURSOR_MACHINE_SPEC);
  if (errors.length > 0) {
    throw new Error(`terminal-cursor machine spec is invalid: ${errors.join("; ")}`);
  }
  const spec = TERMINAL_CURSOR_MACHINE_SPEC;
  const bounds = spec.bounds;
  const rules = spec.rules.map(ruleLiteral).join("\n");
  const frameKindEntries = spec.frameKinds.map((kind) => `${kind.toUpperCase()},`).join(" ");
  // The retained known-span cap mirrors TerminalColumnHistory's private
  // MAX_RETAINED_SPANS, derived from the exported changes bound.
  const maximumColumnSpans = (MAX_TERMINAL_COLUMN_CHANGES - 1) / 2;

  return `${HEADER.join("\n")}
enum class TerminalCursorFrameKind { ${frameKindEntries} }

/** One observed-width marker in absolute UTF-16 cursor space; \`columns\` null
 * marks an unknown span. Mirrors \`TerminalColumnChange\`. */
data class TerminalCursorColumnChange(
    val fromCursor: Long,
    val columns: Int?,
)

/** One terminal-cursor frame: an assembled baseline or an output increment.
 * \`fromCursor\`/\`toCursor\` and every bound count UTF-16 code units. */
data class TerminalCursorFrame(
    val kind: TerminalCursorFrameKind,
    val terminalId: String,
    val watchId: String,
    val generation: String?,
    val fromCursor: Long,
    val toCursor: Long,
    val data: String,
    /** Optional width markers; only nonempty spans carry width. */
    val columnChanges: List<TerminalCursorColumnChange> = emptyList(),
)

data class TerminalCursorPosition(
    val generation: String?,
    val toCursor: Long,
)

data class TerminalCursorState(
    val watchId: String,
    val baselineReceived: Boolean = false,
    val generation: String? = null,
    val toCursor: Long = 0L,
    /** Bounded tail. Cursor coordinates remain absolute even after trimming. */
    val transcript: String = "",
    val bufferedOutput: List<TerminalCursorFrame> = emptyList(),
    val bufferedUtf16Units: Int = 0,
    val needsResync: Boolean = false,
    /** Bounded width history over the retained tail; empty = all widthless. */
    val columnChanges: List<TerminalCursorColumnChange> = emptyList(),
) {
    init {
        require(watchId.isNotEmpty()) { "watchId must not be empty" }
        require(toCursor >= 0L) { "toCursor must not be negative" }
        require(transcript.length <= TerminalCursorReconciler.MAX_TRANSCRIPT_UTF16_UNITS)
    }

    companion object {
        fun watching(watchId: String): TerminalCursorState = TerminalCursorState(watchId)

        fun established(
            watchId: String,
            generation: String?,
            toCursor: Long,
            transcript: String = "",
            columnChanges: List<TerminalCursorColumnChange> = emptyList(),
        ): TerminalCursorState {
            val tail = TerminalCursorReconciler.boundedTail(transcript)
            return TerminalCursorState(
                watchId = watchId, baselineReceived = true, generation = generation, toCursor = toCursor,
                transcript = tail,
                columnChanges = TerminalCursorReconciler.normalizedColumnChanges(toCursor, tail.length, columnChanges),
            )
        }
    }
}

/** Consumer-facing reconciliation actions; entry names carry the shared parity
 * fixture tokens. */
enum class TerminalCursorAction(val token: String) {
    BUFFER("buffer"),
    REPLACE("replace"),
    IGNORE("ignore"),
    APPEND("append"),
    APPEND_UNSEEN_SUFFIX("append-unseen-suffix"),
    RESYNC("resync"),
}

/** Why a frame produced its action. \`StaleWatch\` is informational and never
 * arms a resync; the other entries arm the authoritative-refresh flag. */
enum class TerminalCursorReconciliationReason(val token: String) {
    StaleWatch("stale-watch"),
    InvalidRange("invalid-range"),
    MissingBaseline("missing-baseline"),
    GenerationChanged("generation-changed"),
    CursorGap("cursor-gap"),
    InvalidUtf16Boundary("invalid-utf16-boundary"),
}

data class TerminalCursorResult(
    val state: TerminalCursorState,
    val action: TerminalCursorAction,
    val appendedText: String = "",
    val reason: TerminalCursorReconciliationReason? = null,
)

internal enum class TerminalCursorGuardKind {
${spec.guards.map((guard) => `    ${GUARD_ENTRIES[guard]},`).join("\n")}
}

internal enum class TerminalCursorEffect {
    Ignore,
    Resync,
    Buffer,
    Replace,
    ResumeSuffix,
    AppendSuffix,
}

internal data class TerminalCursorRule(
    val id: String,
    /** null applies to every frame kind. */
    val kind: TerminalCursorFrameKind?,
    val guardKind: TerminalCursorGuardKind,
    val effect: TerminalCursorEffect,
    val reason: TerminalCursorReconciliationReason?,
    val clearsBufferedOutput: Boolean,
)

/** THE terminal-cursor reconciliation machine, generated from one spec shared
 * with Swift and the TS contract tests. Guards and transitions only — JSON
 * decoding, transports, and UI stay in the app-owned coordinators that consume
 * this API. */
object TerminalCursorReconciler {
    /** Cursor arithmetic and every bound are measured in UTF-16 code units
     * (spec: ${bounds.cursorUnits}). */
    const val MAX_TRANSCRIPT_UTF16_UNITS: Int = ${bounds.maximumTranscriptUtf16Units}
    private const val MAX_BUFFERED_UTF16_UNITS: Int = ${bounds.maximumBufferedUtf16Units}
    private const val MAX_BUFFERED_FRAMES: Int = ${bounds.maximumBufferedFrames}

    /** Ordered first-match reconcile rules (spec \`rules\`); the first matching
     * row wins, and the append-suffix catch-all is last. */
    private val rules: List<TerminalCursorRule> = listOf(
${rules}
    )

    fun isStale(frame: TerminalCursorFrame, currentWatchId: String): Boolean =
        frame.watchId != currentWatchId

    fun isAppendCompatible(previous: TerminalCursorPosition?, frame: TerminalCursorFrame): Boolean {
        if (previous == null) return true
        return previous.generation == frame.generation && previous.toCursor == frame.fromCursor
    }

    fun isValid(frame: TerminalCursorFrame): Boolean =
        frame.fromCursor >= 0L &&
            frame.toCursor >= frame.fromCursor &&
            frame.toCursor - frame.fromCursor == frame.data.length.toLong()

    fun reconcile(state: TerminalCursorState, frame: TerminalCursorFrame): TerminalCursorResult {
        val valid = isValid(frame)
        for (rule in rules) {
            if (rule.kind != null && rule.kind != frame.kind) continue
            if (!matches(rule.guardKind, state, frame, valid)) continue
            return apply(rule, state, frame)
        }
        error("terminal-cursor rule table has no catch-all")
    }

    /** Bounded display tail: drop leading UTF-16 units to the bound. */
    fun boundedTail(value: String): String =
        if (value.length <= MAX_TRANSCRIPT_UTF16_UNITS) value
        else value.substring(value.length - MAX_TRANSCRIPT_UTF16_UNITS)

    private fun matches(
        guardKind: TerminalCursorGuardKind,
        state: TerminalCursorState,
        frame: TerminalCursorFrame,
        validRange: Boolean,
    ): Boolean = when (guardKind) {
        TerminalCursorGuardKind.Always -> true
        TerminalCursorGuardKind.StaleWatch -> frame.watchId != state.watchId
        TerminalCursorGuardKind.InvalidRange -> !validRange
        TerminalCursorGuardKind.BaselineResumeSuffix ->
            frame.kind == TerminalCursorFrameKind.BASELINE &&
                state.baselineReceived &&
                frame.generation != null &&
                frame.generation == state.generation &&
                frame.fromCursor == state.toCursor
        TerminalCursorGuardKind.Baseline -> frame.kind == TerminalCursorFrameKind.BASELINE
        TerminalCursorGuardKind.PreBaselineWithoutGeneration ->
            frame.kind == TerminalCursorFrameKind.OUTPUT &&
                !state.baselineReceived &&
                frame.generation == null
        TerminalCursorGuardKind.PreBaselineOverBudget ->
            frame.kind == TerminalCursorFrameKind.OUTPUT &&
                !state.baselineReceived &&
                (state.bufferedUtf16Units + frame.data.length > MAX_BUFFERED_UTF16_UNITS ||
                    state.bufferedOutput.size + 1 > MAX_BUFFERED_FRAMES)
        TerminalCursorGuardKind.PreBaseline ->
            frame.kind == TerminalCursorFrameKind.OUTPUT && !state.baselineReceived
        TerminalCursorGuardKind.PendingResync -> state.needsResync
        TerminalCursorGuardKind.GenerationChanged ->
            state.generation == null || frame.generation != state.generation
        TerminalCursorGuardKind.UpToDate -> frame.toCursor <= state.toCursor
        TerminalCursorGuardKind.CursorGap -> frame.fromCursor > state.toCursor
        TerminalCursorGuardKind.UnappendableOverlap ->
            state.toCursor - frame.fromCursor > frame.data.length
    }

    private fun apply(
        rule: TerminalCursorRule,
        state: TerminalCursorState,
        frame: TerminalCursorFrame,
    ): TerminalCursorResult = when (rule.effect) {
        TerminalCursorEffect.Ignore -> result(state, TerminalCursorAction.IGNORE, "", rule.reason)
        TerminalCursorEffect.Resync ->
            resync(state, rule.reason!!, rule.clearsBufferedOutput)
        TerminalCursorEffect.Buffer -> {
            val next = state.copy(
                bufferedOutput = state.bufferedOutput + frame,
                bufferedUtf16Units = state.bufferedUtf16Units + frame.data.length,
            )
            result(next, TerminalCursorAction.BUFFER)
        }
        TerminalCursorEffect.Replace -> replaceBaseline(state, frame)
        TerminalCursorEffect.ResumeSuffix -> {
            // Cursor-sync v2 resume suffix: the continuation is authoritative,
            // so it also clears a pending resync (its range covers everything
            // through the new toCursor).
            val appended = appendOutput(state, frame)
            if (appended.action == TerminalCursorAction.RESYNC) {
                appended
            } else {
                TerminalCursorResult(appended.state.copy(needsResync = false), appended.action, appended.appendedText)
            }
        }
        TerminalCursorEffect.AppendSuffix -> appendOutput(state, frame)
    }

    private fun result(
        state: TerminalCursorState,
        action: TerminalCursorAction,
        appendedText: String = "",
        reason: TerminalCursorReconciliationReason? = null,
    ): TerminalCursorResult = TerminalCursorResult(state, action, appendedText, reason)

    private fun resync(
        state: TerminalCursorState,
        reason: TerminalCursorReconciliationReason,
        clear: Boolean,
    ): TerminalCursorResult {
        val cleared = if (clear) {
            state.copy(bufferedOutput = emptyList(), bufferedUtf16Units = 0)
        } else {
            state
        }
        return result(cleared.copy(needsResync = true), TerminalCursorAction.RESYNC, reason = reason)
    }

    /** Shared by the output path, the baseline replay, and the resume suffix. */
    private fun appendOutput(
        state: TerminalCursorState,
        frame: TerminalCursorFrame,
    ): TerminalCursorResult {
        if (state.generation == null || frame.generation != state.generation) {
            return resync(state, TerminalCursorReconciliationReason.GenerationChanged, clear = false)
        }
        if (frame.toCursor <= state.toCursor) {
            return result(state, TerminalCursorAction.IGNORE)
        }
        if (frame.fromCursor > state.toCursor) {
            return resync(state, TerminalCursorReconciliationReason.CursorGap, clear = false)
        }
        val overlap = state.toCursor - frame.fromCursor
        if (overlap > frame.data.length) {
            return resync(state, TerminalCursorReconciliationReason.InvalidUtf16Boundary, clear = false)
        }
        val suffix = frame.data.substring(overlap.toInt())
        val action = if (overlap == 0L) {
            TerminalCursorAction.APPEND
        } else {
            TerminalCursorAction.APPEND_UNSEEN_SUFFIX
        }
        val next = applyGeometry(
            state.copy(
                toCursor = frame.toCursor,
                transcript = boundedTail(state.transcript + suffix),
            ),
            frame,
            state,
        )
        return TerminalCursorResult(next, action, suffix)
    }

    private fun replaceBaseline(
        state: TerminalCursorState,
        frame: TerminalCursorFrame,
    ): TerminalCursorResult {
        var next = TerminalCursorState.established(
            watchId = state.watchId,
            generation = frame.generation,
            toCursor = frame.toCursor,
            transcript = frame.data,
            columnChanges = frame.columnChanges,
        )
        // Buffered pre-baseline frames replay only under a durable generation;
        // the first resync aborts the replay.
        if (frame.generation != null) {
            for (buffered in state.bufferedOutput) {
                val replay = appendOutput(next, buffered)
                next = replay.state
                if (replay.action == TerminalCursorAction.RESYNC) break
            }
        }
        return TerminalCursorResult(next, TerminalCursorAction.REPLACE)
    }

    // ---- Width geometry (mirrors TerminalColumnHistory + applyGeometry) ----

    /** One known-width span in absolute UTF-16 cursor space. */
    private data class ColumnSpan(val fromCursor: Long, val toCursor: Long, val columns: Int)

    private const val MIN_TERMINAL_COLUMNS: Int = ${MIN_TERMINAL_COLS}
    private const val MAX_TERMINAL_COLUMNS: Int = ${MAX_TERMINAL_COLS}
    /** Safe-integer cursor bound; retained known spans = (MAX_TERMINAL_COLUMN_CHANGES - 1) / 2. */
    private const val MAX_CURSOR: Long = 9_007_199_254_740_991L
    private const val MAX_COLUMN_SPANS: Int = ${maximumColumnSpans}

    private fun recordColumnSpan(spans: MutableList<ColumnSpan>, from: Long, to: Long, columns: Int) {
        val last = spans.lastOrNull()
        if (last != null && last.toCursor == from && last.columns == columns) {
            spans[spans.lastIndex] = last.copy(toCursor = to)
            return
        }
        spans.add(ColumnSpan(from, to, columns))
        if (spans.size > MAX_COLUMN_SPANS) spans.removeAt(0)
    }

    /** Absolute window start of a retained tail; null when it cannot be positioned. */
    private fun tailWindowStart(toCursor: Long, transcriptLength: Int): Long? {
        if (toCursor < 0L || toCursor > MAX_CURSOR) return null
        return (toCursor - transcriptLength).takeIf { it >= 0L }
    }

    /** Snapshots spans onto the tail window; empty when unpositioned or all-unknown. */
    private fun snapshotKnown(spans: List<ColumnSpan>, toCursor: Long, transcriptLength: Int): List<TerminalCursorColumnChange> {
        val from = tailWindowStart(toCursor, transcriptLength) ?: return emptyList()
        val changes = snapshotColumnChanges(spans, from, toCursor)
        return if (changes.any { it.columns != null }) changes else emptyList()
    }

    /** Clips caller markers onto the bounded tail window for established states. */
    fun normalizedColumnChanges(toCursor: Long, transcriptLength: Int, changes: List<TerminalCursorColumnChange>): List<TerminalCursorColumnChange> {
        val spans = mutableListOf<ColumnSpan>()
        tailWindowStart(toCursor, transcriptLength)?.let { from -> recordColumnChanges(spans, from, toCursor, changes) }
        return snapshotKnown(spans, toCursor, transcriptLength)
    }

    /** Mirrors TerminalColumnHistory.recordChanges: malformed markers or an
     * unpositionable range leave the span widthless; only known spans record. */
    private fun recordColumnChanges(spans: MutableList<ColumnSpan>, fromCursor: Long, toCursor: Long, changes: List<TerminalCursorColumnChange>) {
        if (fromCursor < 0L || toCursor > MAX_CURSOR || toCursor <= fromCursor || changes.isEmpty()) return
        var ordered = true
        var previousMarker = -1L
        for (change in changes) {
            val width = change.columns
            val known = width == null || (width >= MIN_TERMINAL_COLUMNS && width <= MAX_TERMINAL_COLUMNS)
            if (change.fromCursor < 0L || change.fromCursor > MAX_CURSOR ||
                change.fromCursor < previousMarker || !known
            ) {
                ordered = false
                break
            }
            previousMarker = change.fromCursor
        }
        if (!ordered) return
        var index = 0
        var columns: Int? = null
        while (index < changes.size && changes[index].fromCursor <= fromCursor) {
            columns = changes[index].columns
            index += 1
        }
        var spanStart = fromCursor
        fun recordSpan(end: Long) { val width = columns; if (width != null && end > spanStart) recordColumnSpan(spans, spanStart, end, width) }
        while (index < changes.size) {
            val marker = changes[index]
            if (marker.fromCursor >= toCursor) break
            recordSpan(marker.fromCursor)
            spanStart = marker.fromCursor
            columns = marker.columns
            index += 1
        }
        recordSpan(toCursor)
    }

    /** Mirrors TerminalColumnHistory.snapshot: clips, emits null gaps, coalesces equal widths. */
    private fun snapshotColumnChanges(spans: List<ColumnSpan>, fromCursor: Long, toCursor: Long): List<TerminalCursorColumnChange> {
        if (toCursor <= fromCursor) return emptyList()
        val changes = mutableListOf<TerminalCursorColumnChange>()
        var coveredThrough = fromCursor
        fun push(cursor: Long, columns: Int?) { if (changes.lastOrNull()?.columns != columns) changes.add(TerminalCursorColumnChange(cursor, columns)) }
        for (span in spans) {
            if (span.toCursor <= fromCursor) continue
            if (span.fromCursor >= toCursor) break
            val start = maxOf(fromCursor, span.fromCursor)
            if (start > coveredThrough) push(coveredThrough, null)
            push(start, span.columns)
            coveredThrough = minOf(toCursor, span.toCursor)
        }
        if (coveredThrough < toCursor) push(coveredThrough, null)
        return changes
    }

    /** Folds accepted geometry into the retained window; unpositionable or
     * all-unknown geometry empties the list. */
    private fun applyGeometry(next: TerminalCursorState, frame: TerminalCursorFrame, previous: TerminalCursorState): TerminalCursorState {
        if (frame.columnChanges.isEmpty() && previous.columnChanges.isEmpty()) return next
        val spans = mutableListOf<ColumnSpan>()
        tailWindowStart(previous.toCursor, previous.transcript.length)?.let { from -> recordColumnChanges(spans, from, previous.toCursor, previous.columnChanges) }
        recordColumnChanges(spans, previous.toCursor, frame.toCursor, frame.columnChanges)
        return next.copy(columnChanges = snapshotKnown(spans, next.toCursor, next.transcript.length))
    }
}
`;
}
