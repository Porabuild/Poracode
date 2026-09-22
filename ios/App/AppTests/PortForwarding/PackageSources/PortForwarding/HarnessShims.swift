import Foundation

// Harness-only mirror of `ios/App/App/Protocol/ProtocolConstants.swift`. The
// portable core compiles without the app's protocol graph, but the symlinked
// feature contract compares the generated bindings metadata against this
// value, so it must move together with the app constant on every protocol
// bump (a stale value fails this package's contract tests).
enum ProtocolConstants {
  static let remoteProtocolVersion = 12
  /// Parent data-plane credential header (ADR §5), mirrored from
  /// `ios/App/App/Protocol/ProtocolConstants.swift`. The child bearer stays in
  /// `Authorization`; the parent access token travels in this header only.
  static let environmentAuthorizationHeader = "x-poracode-environment-authorization"
}

/// Isolation-package stand-ins for the app TLS pin session types. Production
/// `PortForwardingHTTPClient` retains a `RedirectDenyingURLSessionDelegate` so
/// the URLSession weak-delegate slot cannot drop the pin evaluator.
final class RedirectDenyingURLSessionDelegate: NSObject, URLSessionDelegate, URLSessionTaskDelegate,
  @unchecked Sendable
{}

enum TlsServerTrustEvaluator {
  static func handle(
    _ challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    completionHandler(.performDefaultHandling, nil)
  }
}

/// Harness stand-in for the app `TlsCertPinStore`. The portable core asks the
/// store exactly one question — did the last trust evaluation for this
/// endpoint fail its pin — so the shim mirrors that signature and lets tests
/// flip the answer.
enum TlsCertPinStore {
  nonisolated(unsafe) private static var mismatchedDecision = false

  static func lastDecisionMismatched(endpoint: String) -> Bool { mismatchedDecision }

  static func setLastDecisionMismatchedForTests(_ value: Bool) {
    mismatchedDecision = value
  }
}
