import {
  TERMINAL_CURSOR_MACHINE_SPEC,
  validateTerminalCursorMachineSpec,
  type TerminalCursorGuard,
  type TerminalCursorRule,
} from "../terminalCursorMachineSpec";

const HEADER = [
  "// GENERATED FILE. Do not edit by hand. Run `pnpm protocol:remote:v3:generate`.",
  `// Terminal-cursor reconciliation machine rendered from the declarative spec in`,
  `// src/shared/remote/contract/terminalCursorMachineSpec.ts (spec version ${TERMINAL_CURSOR_MACHINE_SPEC.specVersion}).`,
  "import Foundation",
  "",
];

const GUARD_CASES: Record<TerminalCursorGuard, string> = {
  always: "always",
  staleWatch: "staleWatch",
  invalidRange: "invalidRange",
  baselineResumeSuffix: "baselineResumeSuffix",
  baseline: "baseline",
  preBaselineWithoutGeneration: "preBaselineWithoutGeneration",
  preBaselineOverBudget: "preBaselineOverBudget",
  preBaseline: "preBaseline",
  pendingResync: "pendingResync",
  generationChanged: "generationChanged",
  upToDate: "upToDate",
  cursorGap: "cursorGap",
  unappendableOverlap: "unappendableOverlap",
};

function reasonCase(reason: string | undefined): string {
  switch (reason) {
    case "stale-watch":
      return ".staleWatch";
    case "invalid-range":
      return ".invalidRange";
    case "missing-baseline":
      return ".missingBaseline";
    case "generation-changed":
      return ".generationChanged";
    case "cursor-gap":
      return ".cursorGap";
    case "invalid-utf16-boundary":
      return ".invalidUTF16Boundary";
    default:
      return "nil";
  }
}

function ruleLiteral(rule: TerminalCursorRule): string {
  const kind = rule.kind === undefined ? "nil" : `.${rule.kind}`;
  return `    TerminalCursorRule(id: "${rule.id}", kind: ${kind}, guardKind: .${GUARD_CASES[rule.guard]}, effect: .${rule.effect}, reason: ${reasonCase(rule.reason)}, clearsBufferedOutput: ${rule.clearBufferedOutput === true}),`;
}

export function emitSwiftTerminalCursorMachine(): string {
  const errors = validateTerminalCursorMachineSpec(TERMINAL_CURSOR_MACHINE_SPEC);
  if (errors.length > 0) {
    throw new Error(`terminal-cursor machine spec is invalid: ${errors.join("; ")}`);
  }
  const spec = TERMINAL_CURSOR_MACHINE_SPEC;
  const bounds = spec.bounds;
  const rules = spec.rules.map(ruleLiteral).join("\n");

  return `${HEADER.join("\n")}
public enum TerminalCursorFrameKind: String, Sendable, Equatable {
${spec.frameKinds.map((kind) => `  case ${kind}`).join("\n")}
}

public struct TerminalCursorFrame: Sendable, Equatable {
  public let kind: TerminalCursorFrameKind
  public let terminalID: String
  public let watchID: String
  public let generation: String?
  public let fromCursor: Int64
  public let toCursor: Int64
  public let data: String
  public init(kind: TerminalCursorFrameKind, terminalID: String, watchID: String, generation: String?, fromCursor: Int64, toCursor: Int64, data: String) { self.kind = kind; self.terminalID = terminalID; self.watchID = watchID; self.generation = generation; self.fromCursor = fromCursor; self.toCursor = toCursor; self.data = data }
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

  public static func watching(_ watchID: String) -> Self { Self(watchID: watchID) }

  public static func established(
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

/// Why a frame produced its action. \`staleWatch\` is informational and never
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
${spec.guards.map((guard) => `  case ${GUARD_CASES[guard]}`).join("\n")}
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
  /// (spec: ${bounds.cursorUnits}).
  public static let maximumTranscriptUTF16Units = ${bounds.maximumTranscriptUtf16Units}
  static let maximumBufferedUTF16Units = ${bounds.maximumBufferedUtf16Units}
  static let maximumBufferedFrames = ${bounds.maximumBufferedFrames}

  /// Ordered first-match reconcile rules (spec \`rules\`); the first matching
  /// row wins, and the append-suffix catch-all is last.
  static let rules: [TerminalCursorRule] = [
${rules}
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
    return result(next, overlap == 0 ? .append : .appendUnseenSuffix, appended: suffix)
  }

  static func replaceBaseline(
    _ state: TerminalCursorState, _ frame: TerminalCursorFrame
  ) -> TerminalCursorResult {
    var next = TerminalCursorState.established(
      watchID: state.watchID,
      generation: frame.generation,
      toCursor: frame.toCursor,
      transcript: frame.data
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
}
`;
}
