import Foundation

enum TerminalCursorFrameKind: Sendable, Equatable {
  case baseline
  case output
}

struct TerminalCursorFrame: Sendable, Equatable {
  let kind: TerminalCursorFrameKind
  let terminalID: String
  let watchID: String
  let generation: String?
  let fromCursor: Int64
  let toCursor: Int64
  let data: String
}

struct TerminalCursorPosition: Sendable, Equatable {
  let generation: String?
  let toCursor: Int64
}

struct TerminalCursorState: Sendable, Equatable {
  let watchID: String
  var baselineReceived = false
  var generation: String?
  var toCursor: Int64 = 0
  /// Bounded display tail; cursor positions remain absolute after trimming.
  var transcript = ""
  var bufferedOutput: [TerminalCursorFrame] = []
  var bufferedUTF16Units = 0
  var needsResync = false

  static func watching(_ watchID: String) -> Self { Self(watchID: watchID) }

  static func established(
    watchID: String,
    generation: String?,
    toCursor: Int64,
    transcript: String = ""
  ) -> Self {
    Self(
      watchID: watchID,
      baselineReceived: true,
      generation: generation,
      toCursor: toCursor,
      transcript: TerminalCursorReconciler.boundedTail(transcript),
      bufferedOutput: [],
      bufferedUTF16Units: 0,
      needsResync: false
    )
  }
}

enum TerminalCursorAction: String, Sendable, Equatable {
  case buffer
  case replace
  case ignore
  case append
  case appendUnseenSuffix = "append-unseen-suffix"
  case resync
}

enum TerminalCursorReconciliationReason: Sendable, Equatable {
  case staleWatch
  case invalidRange
  case missingBaseline
  case generationChanged
  case cursorGap
  case invalidUTF16Boundary
}

struct TerminalCursorResult: Sendable, Equatable {
  let state: TerminalCursorState
  let action: TerminalCursorAction
  let appendedText: String
  let reason: TerminalCursorReconciliationReason?

  var isStaleWatch: Bool { reason == .staleWatch }
}

enum TerminalCursorFrameDecoder {
  static func decode(_ value: RichJSON) throws -> TerminalCursorFrame {
    guard let object = value.objectValue,
      let type = RichDecoding.requiredString(object, "type"),
      let terminalID = RichDecoding.requiredString(object, "id", allowEmpty: false)
    else { throw RichDomainDecodeError.invalidTerminalFrame }
    if type == "terminal-output" {
      guard let data = RichDecoding.requiredString(object, "data"),
        let sync = object["cursorSync"]?.objectValue,
        let generation = RichDecoding.requiredString(sync, "generation", allowEmpty: false)
      else { throw RichDomainDecodeError.invalidTerminalFrame }
      return try decodeRange(
        kind: .output,
        terminalID: terminalID,
        generation: generation,
        data: data,
        sync: sync
      )
    }
    if type == "terminal-watch-result" {
      guard let sync = object["cursorSync"]?.objectValue,
        sync["version"]?.exactInt64Value == 1,
        let watchID = RichDecoding.requiredString(sync, "watchId", allowEmpty: false),
        let result = sync["result"]?.objectValue,
        RichDecoding.requiredString(result, "status") == "ready",
        let data = RichDecoding.requiredString(result, "data"),
        let from = result["fromCursor"]?.exactInt64Value,
        let to = result["toCursor"]?.exactInt64Value,
        result.keys.contains("generation")
      else { throw RichDomainDecodeError.invalidTerminalFrame }
      let generation: String?
      if result["generation"] == .null {
        generation = nil
      } else if let value = result["generation"]?.stringValue, !value.isEmpty {
        generation = value
      } else {
        throw RichDomainDecodeError.invalidTerminalFrame
      }
      let frame = TerminalCursorFrame(
        kind: .baseline,
        terminalID: terminalID,
        watchID: watchID,
        generation: generation,
        fromCursor: from,
        toCursor: to,
        data: data
      )
      guard TerminalCursorReconciler.isValid(frame) else {
        throw RichDomainDecodeError.invalidTerminalFrame
      }
      return frame
    }
    throw RichDomainDecodeError.invalidTerminalFrame
  }

  private static func decodeRange(
    kind: TerminalCursorFrameKind,
    terminalID: String,
    generation: String?,
    data: String,
    sync: [String: RichJSON]
  ) throws -> TerminalCursorFrame {
    guard sync["version"]?.exactInt64Value == 1,
      let watchID = RichDecoding.requiredString(sync, "watchId", allowEmpty: false),
      let from = sync["fromCursor"]?.exactInt64Value,
      let to = sync["toCursor"]?.exactInt64Value
    else { throw RichDomainDecodeError.invalidTerminalFrame }
    let frame = TerminalCursorFrame(
      kind: kind,
      terminalID: terminalID,
      watchID: watchID,
      generation: generation,
      fromCursor: from,
      toCursor: to,
      data: data
    )
    guard TerminalCursorReconciler.isValid(frame) else {
      throw RichDomainDecodeError.invalidTerminalFrame
    }
    return frame
  }
}

enum TerminalCursorReconciler {
  static let maximumTranscriptUTF16Units = 200_000
  private static let maximumBufferedUTF16Units = 200_000

  static func isStale(frame: TerminalCursorFrame, currentWatchID: String) -> Bool {
    frame.watchID != currentWatchID
  }

  static func isAppendCompatible(
    previous: TerminalCursorPosition?, frame: TerminalCursorFrame
  ) -> Bool {
    guard let previous else { return true }
    return previous.generation == frame.generation && previous.toCursor == frame.fromCursor
  }

  static func reconcile(
    state: TerminalCursorState,
    frame: TerminalCursorFrame
  ) -> TerminalCursorResult {
    guard frame.watchID == state.watchID else {
      return result(state, .ignore, reason: .staleWatch)
    }
    guard isValid(frame) else { return resync(state, reason: .invalidRange) }
    if frame.kind == .baseline { return replaceBaseline(state, frame) }
    if !state.baselineReceived { return bufferBeforeBaseline(state, frame) }
    if state.needsResync { return resync(state, reason: .missingBaseline) }
    return appendOutput(state, frame)
  }

  static func isValid(_ frame: TerminalCursorFrame) -> Bool {
    frame.fromCursor >= 0 && frame.toCursor >= frame.fromCursor
      && frame.toCursor - frame.fromCursor == Int64(frame.data.utf16.count)
  }

  static func boundedTail(_ value: String) -> String {
    let count = value.utf16.count
    guard count > maximumTranscriptUTF16Units else { return value }
    var dropped = count - maximumTranscriptUTF16Units
    while dropped <= count {
      if let suffix = suffix(value, droppingUTF16Units: dropped) { return suffix }
      dropped += 1
    }
    return ""
  }

  private static func replaceBaseline(
    _ state: TerminalCursorState, _ frame: TerminalCursorFrame
  ) -> TerminalCursorResult {
    var next = TerminalCursorState.established(
      watchID: state.watchID,
      generation: frame.generation,
      toCursor: frame.toCursor,
      transcript: frame.data
    )
    if frame.generation != nil {
      for buffered in state.bufferedOutput {
        let replay = appendOutput(next, buffered)
        next = replay.state
        if replay.action == .resync { break }
      }
    }
    return result(next, .replace)
  }

  private static func bufferBeforeBaseline(
    _ state: TerminalCursorState, _ frame: TerminalCursorFrame
  ) -> TerminalCursorResult {
    guard frame.generation != nil else { return resync(state, reason: .missingBaseline) }
    let added = frame.data.utf16.count
    guard state.bufferedUTF16Units <= maximumBufferedUTF16Units - added else {
      var cleared = state
      cleared.bufferedOutput = []
      cleared.bufferedUTF16Units = 0
      return resync(cleared, reason: .missingBaseline)
    }
    var next = state
    next.bufferedOutput.append(frame)
    next.bufferedUTF16Units += added
    return result(next, .buffer)
  }

  private static func appendOutput(
    _ state: TerminalCursorState, _ frame: TerminalCursorFrame
  ) -> TerminalCursorResult {
    guard let generation = state.generation, frame.generation == generation else {
      return resync(state, reason: .generationChanged)
    }
    if frame.toCursor <= state.toCursor { return result(state, .ignore) }
    guard frame.fromCursor <= state.toCursor else { return resync(state, reason: .cursorGap) }
    let overlap = state.toCursor - frame.fromCursor
    guard overlap <= Int64(frame.data.utf16.count),
      let suffix = suffix(frame.data, droppingUTF16Units: Int(overlap))
    else { return resync(state, reason: .invalidUTF16Boundary) }
    var next = state
    next.toCursor = frame.toCursor
    next.transcript = boundedTail(state.transcript + suffix)
    return result(next, overlap == 0 ? .append : .appendUnseenSuffix, appended: suffix)
  }

  private static func suffix(_ value: String, droppingUTF16Units count: Int) -> String? {
    guard count >= 0, count <= value.utf16.count else { return nil }
    let utf16Index = value.utf16.index(value.utf16.startIndex, offsetBy: count)
    guard let index = String.Index(utf16Index, within: value) else { return nil }
    return String(value[index...])
  }

  private static func resync(
    _ state: TerminalCursorState, reason: TerminalCursorReconciliationReason
  ) -> TerminalCursorResult {
    var next = state
    next.needsResync = true
    return result(next, .resync, reason: reason)
  }

  private static func result(
    _ state: TerminalCursorState,
    _ action: TerminalCursorAction,
    appended: String = "",
    reason: TerminalCursorReconciliationReason? = nil
  ) -> TerminalCursorResult {
    TerminalCursorResult(state: state, action: action, appendedText: appended, reason: reason)
  }
}
