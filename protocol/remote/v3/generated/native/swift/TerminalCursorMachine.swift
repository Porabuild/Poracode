// GENERATED FILE. Do not edit by hand. Run `pnpm protocol:remote:v3:generate`.
// Terminal-cursor reconciliation machine rendered from the declarative spec in
// src/shared/remote/contract/terminalCursorMachineSpec.ts (spec version 1).
import Foundation

public enum TerminalCursorFrameKind: String, Sendable, Equatable {
  case baseline
  case output
}

/// One observed-width marker in absolute UTF-16 cursor space; `columns` nil
/// marks an unknown span. Mirrors `TerminalColumnChange`.
public struct TerminalCursorColumnChange: Sendable, Equatable {
  public let fromCursor: Int64
  public let columns: Int?
  public init(fromCursor: Int64, columns: Int?) { self.fromCursor = fromCursor; self.columns = columns }
}

public struct TerminalCursorFrame: Sendable, Equatable {
  public let kind: TerminalCursorFrameKind
  public let terminalID: String
  public let watchID: String
  public let generation: String?
  public let fromCursor: Int64
  public let toCursor: Int64
  public let data: String
  /// Optional width markers; only nonempty spans carry width.
  public let columnChanges: [TerminalCursorColumnChange]
  public init(kind: TerminalCursorFrameKind, terminalID: String, watchID: String, generation: String?, fromCursor: Int64, toCursor: Int64, data: String, columnChanges: [TerminalCursorColumnChange] = []) { self.kind = kind; self.terminalID = terminalID; self.watchID = watchID; self.generation = generation; self.fromCursor = fromCursor; self.toCursor = toCursor; self.data = data; self.columnChanges = columnChanges }
}

public struct TerminalCursorPosition: Sendable, Equatable {
  public let generation: String?
  public let toCursor: Int64
  public init(generation: String?, toCursor: Int64) { self.generation = generation; self.toCursor = toCursor }
}

public struct TerminalCursorState: Sendable, Equatable {
  public let watchID: String
  public var baselineReceived = false
  public var generation: String?
  public var toCursor: Int64 = 0
  /// Bounded display tail; cursor positions remain absolute after trimming.
  public var transcript = ""
  public var bufferedOutput: [TerminalCursorFrame] = []
  public var bufferedUTF16Units = 0
  public var needsResync = false
  /// Bounded width history over the retained tail; empty = all widthless.
  public var columnChanges: [TerminalCursorColumnChange] = []

  public static func watching(_ watchID: String) -> Self { Self(watchID: watchID) }

  public static func established(
    watchID: String,
    generation: String?,
    toCursor: Int64,
    transcript: String = "",
    columnChanges: [TerminalCursorColumnChange] = []
  ) -> Self {
    let tail = TerminalCursorReconciler.boundedTail(transcript)
    return Self(
      watchID: watchID,
      baselineReceived: true,
      generation: generation,
      toCursor: toCursor,
      transcript: tail, bufferedOutput: [], bufferedUTF16Units: 0, needsResync: false,
      columnChanges: TerminalCursorReconciler.normalizedColumnChanges(toCursor: toCursor, transcriptUTF16Count: tail.utf16.count, changes: columnChanges)
    )
  }
}

/// Consumer-facing reconciliation actions; raw values are the shared parity
/// fixture tokens.
public enum TerminalCursorAction: String, Sendable, Equatable {
  case buffer
  case replace
  case ignore
  case append
  case appendUnseenSuffix = "append-unseen-suffix"
  case resync
}

/// Why a frame produced its action. `staleWatch` is informational and never
/// arms a resync; the other cases arm the authoritative-refresh flag.
public enum TerminalCursorReconciliationReason: String, Sendable, Equatable {
  case staleWatch = "stale-watch"
  case invalidRange = "invalid-range"
  case missingBaseline = "missing-baseline"
  case generationChanged = "generation-changed"
  case cursorGap = "cursor-gap"
  case invalidUTF16Boundary = "invalid-utf16-boundary"
}

public struct TerminalCursorResult: Sendable, Equatable {
  public let state: TerminalCursorState
  public let action: TerminalCursorAction
  public let appendedText: String
  public let reason: TerminalCursorReconciliationReason?

  public var isStaleWatch: Bool { reason == .staleWatch }
}

enum TerminalCursorGuardKind {
  case always
  case staleWatch
  case invalidRange
  case baselineResumeSuffix
  case baseline
  case preBaselineWithoutGeneration
  case preBaselineOverBudget
  case preBaseline
  case pendingResync
  case generationChanged
  case upToDate
  case cursorGap
  case unappendableOverlap
}

enum TerminalCursorEffect {
  case ignore
  case resync
  case buffer
  case replace
  case resumeSuffix
  case appendSuffix
}

struct TerminalCursorRule {
  let id: String
  /// nil applies to every frame kind.
  let kind: TerminalCursorFrameKind?
  let guardKind: TerminalCursorGuardKind
  let effect: TerminalCursorEffect
  let reason: TerminalCursorReconciliationReason?
  let clearsBufferedOutput: Bool
}

/// THE terminal-cursor reconciliation machine, generated from one spec shared
/// with Kotlin and the TS contract tests. Guards and transitions only — JSON
/// decoding, transports, and UI stay in the app-owned coordinators that
/// consume this API.
public enum TerminalCursorReconciler {
  /// Cursor arithmetic and every bound are measured in UTF-16 code units
  /// (spec: utf-16-code-units).
  public static let maximumTranscriptUTF16Units = 200000
  static let maximumBufferedUTF16Units = 200000
  static let maximumBufferedFrames = 1024

  /// Ordered first-match reconcile rules (spec `rules`); the first matching
  /// row wins, and the append-suffix catch-all is last.
  static let rules: [TerminalCursorRule] = [
    TerminalCursorRule(id: "stale-watch", kind: nil, guardKind: .staleWatch, effect: .ignore, reason: .staleWatch, clearsBufferedOutput: false),
    TerminalCursorRule(id: "invalid-range", kind: nil, guardKind: .invalidRange, effect: .resync, reason: .invalidRange, clearsBufferedOutput: false),
    TerminalCursorRule(id: "baseline-resume-suffix", kind: .baseline, guardKind: .baselineResumeSuffix, effect: .resumeSuffix, reason: nil, clearsBufferedOutput: false),
    TerminalCursorRule(id: "baseline-replace", kind: .baseline, guardKind: .baseline, effect: .replace, reason: nil, clearsBufferedOutput: false),
    TerminalCursorRule(id: "pre-baseline-without-generation", kind: .output, guardKind: .preBaselineWithoutGeneration, effect: .resync, reason: .missingBaseline, clearsBufferedOutput: false),
    TerminalCursorRule(id: "pre-baseline-over-budget", kind: .output, guardKind: .preBaselineOverBudget, effect: .resync, reason: .missingBaseline, clearsBufferedOutput: true),
    TerminalCursorRule(id: "pre-baseline-buffer", kind: .output, guardKind: .preBaseline, effect: .buffer, reason: nil, clearsBufferedOutput: false),
    TerminalCursorRule(id: "pending-resync", kind: .output, guardKind: .pendingResync, effect: .resync, reason: .missingBaseline, clearsBufferedOutput: false),
    TerminalCursorRule(id: "generation-changed", kind: .output, guardKind: .generationChanged, effect: .resync, reason: .generationChanged, clearsBufferedOutput: false),
    TerminalCursorRule(id: "up-to-date", kind: .output, guardKind: .upToDate, effect: .ignore, reason: nil, clearsBufferedOutput: false),
    TerminalCursorRule(id: "cursor-gap", kind: .output, guardKind: .cursorGap, effect: .resync, reason: .cursorGap, clearsBufferedOutput: false),
    TerminalCursorRule(id: "unappendable-overlap", kind: .output, guardKind: .unappendableOverlap, effect: .resync, reason: .invalidUTF16Boundary, clearsBufferedOutput: false),
    TerminalCursorRule(id: "append-suffix", kind: .output, guardKind: .always, effect: .appendSuffix, reason: nil, clearsBufferedOutput: false),
  ]

  public static func isStale(frame: TerminalCursorFrame, currentWatchID: String) -> Bool {
    frame.watchID != currentWatchID
  }

  public static func isAppendCompatible(
    previous: TerminalCursorPosition?, frame: TerminalCursorFrame
  ) -> Bool {
    guard let previous else { return true }
    return previous.generation == frame.generation && previous.toCursor == frame.fromCursor
  }

  public static func isValid(_ frame: TerminalCursorFrame) -> Bool {
    frame.fromCursor >= 0 && frame.toCursor >= frame.fromCursor
      && frame.toCursor - frame.fromCursor == Int64(frame.data.utf16.count)
  }

  public static func reconcile(
    state: TerminalCursorState,
    frame: TerminalCursorFrame
  ) -> TerminalCursorResult {
    let valid = isValid(frame)
    for rule in rules {
      if let kind = rule.kind, kind != frame.kind { continue }
      guard matches(rule.guardKind, state: state, frame: frame, validRange: valid) else { continue }
      return apply(rule, state: state, frame: frame)
    }
    fatalError("terminal-cursor rule table has no catch-all")
  }

  /// Bounded display tail: drop leading UTF-16 units to the bound, never
  /// splitting a surrogate pair (a String.Index must land on a scalar).
  public static func boundedTail(_ value: String) -> String {
    let count = value.utf16.count
    guard count > maximumTranscriptUTF16Units else { return value }
    var dropped = count - maximumTranscriptUTF16Units
    while dropped <= count {
      if let suffix = suffix(value, droppingUTF16Units: dropped) { return suffix }
      dropped += 1
    }
    return ""
  }

  static func matches(
    _ guardKind: TerminalCursorGuardKind,
    state: TerminalCursorState,
    frame: TerminalCursorFrame,
    validRange: Bool
  ) -> Bool {
    switch guardKind {
    case .always: return true
    case .staleWatch: return frame.watchID != state.watchID
    case .invalidRange: return !validRange
    case .baselineResumeSuffix:
      return frame.kind == .baseline && state.baselineReceived
        && frame.generation != nil && frame.generation == state.generation
        && frame.fromCursor == state.toCursor
    case .baseline: return frame.kind == .baseline
    case .preBaselineWithoutGeneration:
      return frame.kind == .output && !state.baselineReceived && frame.generation == nil
    case .preBaselineOverBudget:
      return frame.kind == .output && !state.baselineReceived
        && (state.bufferedUTF16Units + frame.data.utf16.count > maximumBufferedUTF16Units
          || state.bufferedOutput.count + 1 > maximumBufferedFrames)
    case .preBaseline: return frame.kind == .output && !state.baselineReceived
    case .pendingResync: return state.needsResync
    case .generationChanged: return state.generation == nil || frame.generation != state.generation
    case .upToDate: return frame.toCursor <= state.toCursor
    case .cursorGap: return frame.fromCursor > state.toCursor
    case .unappendableOverlap: return state.toCursor - frame.fromCursor > frame.data.utf16.count
    }
  }

  static func apply(
    _ rule: TerminalCursorRule,
    state: TerminalCursorState,
    frame: TerminalCursorFrame
  ) -> TerminalCursorResult {
    switch rule.effect {
    case .ignore: return result(state, .ignore, reason: rule.reason)
    case .resync: return resync(state, rule.reason!, clear: rule.clearsBufferedOutput)
    case .buffer:
      var next = state
      next.bufferedOutput.append(frame)
      next.bufferedUTF16Units += frame.data.utf16.count
      return result(next, .buffer)
    case .replace: return replaceBaseline(state, frame)
    case .resumeSuffix:
      // Cursor-sync v2 resume suffix: the continuation is authoritative, so it
      // also clears a pending resync (its range covers everything through the
      // new toCursor).
      let appended = appendOutput(state, frame)
      if appended.action == .resync { return appended }
      var next = appended.state
      next.needsResync = false
      return result(next, appended.action, appended: appended.appendedText)
    case .appendSuffix: return appendOutput(state, frame)
    }
  }

  static func result(
    _ state: TerminalCursorState,
    _ action: TerminalCursorAction,
    appended: String = "",
    reason: TerminalCursorReconciliationReason? = nil
  ) -> TerminalCursorResult {
    TerminalCursorResult(state: state, action: action, appendedText: appended, reason: reason)
  }

  static func resync(
    _ state: TerminalCursorState,
    _ reason: TerminalCursorReconciliationReason,
    clear: Bool
  ) -> TerminalCursorResult {
    var next = state
    if clear { next.bufferedOutput = []; next.bufferedUTF16Units = 0 }
    next.needsResync = true
    return result(next, .resync, reason: reason)
  }

  /// Shared by the output path, the baseline replay, and the resume suffix.
  static func appendOutput(
    _ state: TerminalCursorState, _ frame: TerminalCursorFrame
  ) -> TerminalCursorResult {
    guard let generation = state.generation, frame.generation == generation else {
      return resync(state, .generationChanged, clear: false)
    }
    if frame.toCursor <= state.toCursor { return result(state, .ignore) }
    guard frame.fromCursor <= state.toCursor else {
      return resync(state, .cursorGap, clear: false)
    }
    let overlap = state.toCursor - frame.fromCursor
    guard overlap <= Int64(frame.data.utf16.count),
      let suffix = suffix(frame.data, droppingUTF16Units: Int(overlap))
    else { return resync(state, .invalidUTF16Boundary, clear: false) }
    var next = state
    next.toCursor = frame.toCursor
    next.transcript = boundedTail(state.transcript + suffix)
    applyGeometry(next: &next, frame: frame, previous: state)
    return result(next, overlap == 0 ? .append : .appendUnseenSuffix, appended: suffix)
  }

  static func replaceBaseline(
    _ state: TerminalCursorState, _ frame: TerminalCursorFrame
  ) -> TerminalCursorResult {
    var next = TerminalCursorState.established(
      watchID: state.watchID,
      generation: frame.generation,
      toCursor: frame.toCursor,
      transcript: frame.data,
      columnChanges: frame.columnChanges
    )
    // Buffered pre-baseline frames replay only under a durable generation;
    // the first resync aborts the replay.
    if frame.generation != nil {
      for buffered in state.bufferedOutput {
        let replay = appendOutput(next, buffered)
        next = replay.state
        if replay.action == .resync { break }
      }
    }
    return result(next, .replace)
  }

  static func suffix(_ value: String, droppingUTF16Units count: Int) -> String? {
    guard count >= 0, count <= value.utf16.count else { return nil }
    let utf16Index = value.utf16.index(value.utf16.startIndex, offsetBy: count)
    guard let index = String.Index(utf16Index, within: value) else { return nil }
    return String(value[index...])
  }

  // MARK: - Width geometry (mirrors TerminalColumnHistory + applyGeometry)

  /// One known-width span in absolute UTF-16 cursor space.
  private struct ColumnSpan { var fromCursor: Int64; var toCursor: Int64; var columns: Int }

  static let minimumTerminalColumns = 20
  static let maximumTerminalColumns = 400
  /// Safe-integer cursor bound; retained known spans = (MAX_TERMINAL_COLUMN_CHANGES - 1) / 2.
  static let maximumCursor = 9_007_199_254_740_991
  static let maximumColumnSpans = 1024

  private static func recordColumnSpan(_ spans: inout [ColumnSpan], from: Int64, to: Int64, columns: Int) {
    if let last = spans.last, last.toCursor == from, last.columns == columns {
      spans[spans.index(before: spans.endIndex)].toCursor = to
      return
    }
    spans.append(ColumnSpan(fromCursor: from, toCursor: to, columns: columns))
    if spans.count > maximumColumnSpans { spans.removeFirst() }
  }

  /// Absolute window start of a retained tail; nil when it cannot be positioned.
  private static func tailWindowStart(toCursor: Int64, transcriptUTF16Count: Int) -> Int64? {
    guard toCursor >= 0, toCursor <= maximumCursor else { return nil }
    let from = toCursor - Int64(transcriptUTF16Count)
    return from >= 0 ? from : nil
  }

  /// Snapshots spans onto the tail window; empty when unpositioned or all-unknown.
  private static func snapshotKnown(_ spans: [ColumnSpan], toCursor: Int64, transcriptUTF16Count: Int) -> [TerminalCursorColumnChange] {
    guard let from = tailWindowStart(toCursor: toCursor, transcriptUTF16Count: transcriptUTF16Count) else { return [] }
    let snapshot = snapshotColumnChanges(spans: spans, fromCursor: from, toCursor: toCursor)
    return snapshot.contains { $0.columns != nil } ? snapshot : []
  }

  /// Clips caller markers onto the bounded tail window for established states.
  static func normalizedColumnChanges(toCursor: Int64, transcriptUTF16Count: Int, changes: [TerminalCursorColumnChange]) -> [TerminalCursorColumnChange] {
    var spans: [ColumnSpan] = []
    if let from = tailWindowStart(toCursor: toCursor, transcriptUTF16Count: transcriptUTF16Count) { recordColumnChanges(&spans, fromCursor: from, toCursor: toCursor, changes: changes) }
    return snapshotKnown(spans, toCursor: toCursor, transcriptUTF16Count: transcriptUTF16Count)
  }

  /// Mirrors TerminalColumnHistory.recordChanges: malformed markers or an
  /// unpositionable range leave the span widthless; only known spans record.
  private static func recordColumnChanges(
    _ spans: inout [ColumnSpan], fromCursor: Int64, toCursor: Int64, changes: [TerminalCursorColumnChange]
  ) {
    guard fromCursor >= 0, toCursor <= maximumCursor, toCursor > fromCursor, !changes.isEmpty else { return }
    var ordered = true
    var previousMarker = Int64(-1)
    for change in changes {
      let width = change.columns
      let known = width == nil || (width! >= minimumTerminalColumns && width! <= maximumTerminalColumns)
      guard change.fromCursor >= 0, change.fromCursor <= maximumCursor,
        change.fromCursor >= previousMarker, known
      else { ordered = false; break }
      previousMarker = change.fromCursor
    }
    guard ordered else { return }
    var index = 0
    var columns: Int? = nil
    while index < changes.count, changes[index].fromCursor <= fromCursor {
      columns = changes[index].columns
      index += 1
    }
    var spanStart = fromCursor
    func recordSpan(_ end: Int64) { if let columns, end > spanStart { recordColumnSpan(&spans, from: spanStart, to: end, columns: columns) } }
    while index < changes.count {
      let marker = changes[index]
      if marker.fromCursor >= toCursor { break }
      recordSpan(marker.fromCursor)
      spanStart = marker.fromCursor
      columns = marker.columns
      index += 1
    }
    recordSpan(toCursor)
  }

  /// Mirrors TerminalColumnHistory.snapshot: clips, emits null gaps, coalesces equal widths.
  private static func snapshotColumnChanges(
    spans: [ColumnSpan], fromCursor: Int64, toCursor: Int64
  ) -> [TerminalCursorColumnChange] {
    guard toCursor > fromCursor else { return [] }
    var changes: [TerminalCursorColumnChange] = []
    var coveredThrough = fromCursor
    func push(_ cursor: Int64, _ columns: Int?) { if changes.last?.columns != columns { changes.append(TerminalCursorColumnChange(fromCursor: cursor, columns: columns)) } }
    for span in spans {
      if span.toCursor <= fromCursor { continue }
      if span.fromCursor >= toCursor { break }
      let start = max(fromCursor, span.fromCursor)
      if start > coveredThrough { push(coveredThrough, nil) }
      push(start, span.columns)
      coveredThrough = min(toCursor, span.toCursor)
    }
    if coveredThrough < toCursor { push(coveredThrough, nil) }
    return changes
  }

  /// Folds accepted geometry into the retained window; unpositionable or
  /// all-unknown geometry empties the list.
  private static func applyGeometry(
    next: inout TerminalCursorState, frame: TerminalCursorFrame, previous: TerminalCursorState
  ) {
    if frame.columnChanges.isEmpty && previous.columnChanges.isEmpty { return }
    var spans: [ColumnSpan] = []
    if let from = tailWindowStart(toCursor: previous.toCursor, transcriptUTF16Count: previous.transcript.utf16.count) { recordColumnChanges(&spans, fromCursor: from, toCursor: previous.toCursor, changes: previous.columnChanges) }
    recordColumnChanges(&spans, fromCursor: previous.toCursor, toCursor: frame.toCursor, changes: frame.columnChanges)
    next.columnChanges = snapshotKnown(spans, toCursor: next.toCursor, transcriptUTF16Count: next.transcript.utf16.count)
  }
}
