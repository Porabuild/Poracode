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
}

/// Request validation and retry classification shared by the terminal controller
/// and its replay bridge.
enum RichChatTerminalWatchPolicy {
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
}
