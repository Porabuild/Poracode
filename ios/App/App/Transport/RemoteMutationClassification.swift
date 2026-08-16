import Foundation

/// Central classification of remote mutation failures.
///
/// A mutation is submitted exactly once. When the outcome cannot be established
/// after submission, the request may have been committed on the host: callers must
/// never replay it and must reconcile with exactly one authoritative read instead.
enum RemoteMutationClassification: Sendable, Equatable {
  /// The request could have reached the server and been committed: HTTP >= 500,
  /// status 0 / network / timeout failures, or a response that cannot establish the
  /// outcome after the mutation was sent.
  case requestMayHaveCommitted

  /// The outcome is definite: the mutation was not committed (4xx, scope and
  /// validation rejections, pre-send failures). Reads always classify this way.
  case definiteFailure

  /// Classify a post-send HTTP failure for a mutation.
  static func classify(statusCode: Int, code: String? = nil) -> Self {
    if statusCode == 0 { return .requestMayHaveCommitted }
    if statusCode >= 500 { return .requestMayHaveCommitted }
    if code == "network" || code == "timeout" { return .requestMayHaveCommitted }
    return .definiteFailure
  }

  /// Reads carry no commit semantics: every read failure is definite, including 5xx.
  static func classifyRead(statusCode: Int, code: String? = nil) -> Self {
    _ = statusCode
    _ = code
    return .definiteFailure
  }

  /// A transport drop after submission (no usable response) cannot establish the outcome.
  static var transportDrop: Self { .requestMayHaveCommitted }

  /// True when a post-send mutation failure is ambiguous and the caller must reconcile.
  static func isAmbiguous(statusCode: Int, code: String? = nil) -> Bool {
    classify(statusCode: statusCode, code: code) == .requestMayHaveCommitted
  }
}
