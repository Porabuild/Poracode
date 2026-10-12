import {
  TERMINAL_CURSOR_MACHINE_SPEC,
  validateTerminalCursorMachineSpec,
  type TerminalCursorGuard,
  type TerminalCursorRule,
} from "../terminalCursorMachineSpec";

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

  return `${HEADER.join("\n")}
enum class TerminalCursorFrameKind { ${frameKindEntries} }

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
        ): TerminalCursorState = TerminalCursorState(
            watchId = watchId,
            baselineReceived = true,
            generation = generation,
            toCursor = toCursor,
            transcript = transcript.takeLast(TerminalCursorReconciler.MAX_TRANSCRIPT_UTF16_UNITS),
        )
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
        val next = state.copy(
            toCursor = frame.toCursor,
            transcript = boundedTail(state.transcript + suffix),
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
}
`;
}
