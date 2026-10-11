import Foundation

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
