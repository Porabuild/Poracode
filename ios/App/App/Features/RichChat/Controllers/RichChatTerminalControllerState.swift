import Foundation

protocol RichChatWatchIDGenerating: Sendable {
  func makeRichChatWatchID() -> String
}

struct RichChatUUIDWatchIDGenerator: RichChatWatchIDGenerating {
  func makeRichChatWatchID() -> String { UUID().uuidString.lowercased() }
}

enum RichChatTerminalLifecycle: Equatable, Sendable {
  case inactive
  case starting
  case watching
  case watchFailed(retryable: Bool)
}

enum RichChatTerminalOperation: Equatable, Sendable {
  case start
  case input
  case resize
  case close
}

/// A host-reported PTY exit for one exact terminal id.
///
/// `thread-exited` is display state, never a reconnect trigger: the authority's
/// terminal surface only surfaces the code (`onExited` in `XTermSurface.tsx`) and
/// never re-opens the exited PTY.
struct RichChatTerminalExit: Equatable, Sendable {
  var terminalID: String
  var exitCode: Int?
}

struct RichChatTerminalControllerState: Equatable, Sendable {
  var access: RichChatSessionAccess?
  var target: RichChatThreadTarget?
  var terminalID: String?
  var watchID: String?
  var cursor: TerminalCursorState?
  var lifecycle: RichChatTerminalLifecycle = .inactive
  var connectionState: RichChatTerminalConnectionState = .idle
  var operation: RichChatTerminalOperation?
  var failure: RichChatControllerFailure?
  var requiresAuthoritativeRefresh = false
  /// Set by an accepted `thread-exited` for the watched terminal; cleared by a
  /// restart, a fresh activation, or backgrounding.
  var exit: RichChatTerminalExit?

  /// Seed the new watch from the same durable position used by cursor-sync v2
  /// resume, so a resumed suffix appends rather than replacing retained output.
  /// The transport negotiates down to v1 when the host does not support v2.
  mutating func beginWatch(terminalID: String, watchID: String) -> RichChatTerminalWatchResume? {
    let retained = cursor
    self.terminalID = terminalID
    self.watchID = watchID
    cursor = RichChatTerminalWatchPolicy.seedFromRetained(retained, watchID: watchID)
    lifecycle = .starting
    connectionState = .connecting
    failure = nil
    requiresAuthoritativeRefresh = false
    return RichChatTerminalWatchPolicy.resumeFromRetained(retained)
  }

  mutating func clearWatch() {
    terminalID = nil
    watchID = nil
    cursor = nil
    lifecycle = .inactive
    connectionState = .idle
  }

  mutating func enterBackground() {
    clearWatch()
    exit = nil
    operation = nil
  }

  mutating func applyConnection(_ connection: RichChatTerminalConnectionState) {
    connectionState = connection
    switch connection {
    case .idle:
      if terminalID != nil { lifecycle = .inactive }
    case .connecting, .reconnecting:
      lifecycle = .starting
      failure = nil
    case .watching:
      lifecycle = .watching
      failure = nil
    case .failed(let retryable):
      lifecycle = .watchFailed(retryable: retryable)
      failure = .transport
    }
  }

  mutating func applyWatchFailure(_ failure: RichChatControllerFailure, retryable: Bool? = nil) {
    let canRetry = retryable ?? RichChatTerminalWatchPolicy.isRetryableWatchFailure(failure)
    lifecycle = .watchFailed(retryable: canRetry)
    connectionState = .failed(retryable: canRetry)
    self.failure = failure
  }
}

/// Request validation and retry classification shared by the terminal controller
/// and its replay bridge.
enum RichChatTerminalWatchPolicy {
  static func failure(forWatchErrorCode code: RichChatTerminalWatchErrorCode) -> RichChatControllerFailure {
    switch code {
    case .forbidden: .authorizationDenied
    case .notFound: .rejected(statusCode: 404, code: "terminal_not_found")
    case .unavailable: .unavailable
    }
  }

  static func isValidSize(_ size: RichChatTerminalSize) -> Bool {
    (1...1_000).contains(size.columns) && (1...1_000).contains(size.rows)
  }

  static func isRetryableWatchFailure(_ failure: RichChatControllerFailure) -> Bool {
    switch failure {
    case .authenticationExpired, .authorizationDenied, .authorizationMissingScope,
      .capabilityMissing, .invalidRequest, .invalidResponse, .rawTransportUnavailable:
      return false
    case .unavailable, .offline, .notReady, .busy, .ambiguousOutcome, .rejected, .transport:
      return true
    }
  }

  /// Resume for the next v2 watch — only an established position with a
  /// durable generation can resume; null-generation caches are replace-only
  /// and can never resume.
  static func resumeFromRetained(_ cursor: TerminalCursorState?) -> RichChatTerminalWatchResume? {
    guard let durable = retainedDurable(cursor) else { return nil }
    return RichChatTerminalWatchResume(generation: durable.generation, cursor: durable.toCursor)
  }

  /// Cursor seeded for a fresh watch attempt: the retained established
  /// position re-armed under the NEW watch id, so a served resume suffix (or
  /// the up-to-date marker) appends instead of replacing the transcript.
  /// Anything non-durable restarts as a bare watching cursor.
  static func seedFromRetained(_ cursor: TerminalCursorState?, watchID: String)
    -> TerminalCursorState
  {
    guard let durable = retainedDurable(cursor) else { return .watching(watchID) }
    return .established(
      watchID: watchID,
      generation: durable.generation,
      toCursor: durable.toCursor,
      transcript: durable.transcript
    )
  }

  /// The retained position is resumable only with a baseline under a durable
  /// generation; null/empty generations are replace-only.
  private static func retainedDurable(_ cursor: TerminalCursorState?) -> TerminalCursorState? {
    guard let cursor, cursor.baselineReceived,
      let generation = cursor.generation, !generation.isEmpty
    else { return nil }
    return cursor
  }
}
