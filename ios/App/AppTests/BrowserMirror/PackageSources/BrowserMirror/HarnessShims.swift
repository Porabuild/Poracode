import Foundation

// Harness-only mirror of `ios/App/App/Protocol/ProtocolConstants.swift`. The
// portable core compiles without the app's protocol graph, but the symlinked
// transport adapter compares the generated bindings metadata against this
// value, so it must move together with the app constant on every protocol
// bump (a stale value fails this package's contract tests).
enum ProtocolConstants {
  static let remoteProtocolVersion = 12
}

/// Isolation-package stand-in for the app TLS pin evaluator. The shared
/// transport adapter mirrors production `BrowserMirrorHTTPClient` session
/// plumbing, whose challenge handler routes through the app's
/// `TlsServerTrustEvaluator`; in the portable harness the default trust
/// decision is the honest answer (no pin store exists here).
enum TlsServerTrustEvaluator {
  static func handle(
    _ challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    completionHandler(.performDefaultHandling, nil)
  }
}
