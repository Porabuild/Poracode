import Foundation

/// Same bounded read-only policy as the PWA's hostHistoryRead.ts. Mutations,
/// authorization refusals, TLS pin failures and protocol violations never retry.
enum NativeHistoryReadRetry {
  static let delays: [Duration] = [.milliseconds(250), .milliseconds(500)]
  static let persistenceCodes: Set<String> = [
    "persistence_read_refused", "persistence_busy", "persistence_degraded", "persistence_unavailable",
  ]

  static func isRetryable(_ error: Error) -> Bool {
    if error is CancellationError || error is RemoteBoundedReadProtocolError { return false }
    if let error = error as? RemoteClientError {
      if error.isUnauthorized || error.code == TlsCertPin.mismatchCode { return false }
      return error.isTransportFailure || (error.status == 503 && persistenceCodes.contains(error.code))
    }
    if let error = error as? URLError {
      return [.timedOut, .cannotFindHost, .cannotConnectToHost, .networkConnectionLost,
        .dnsLookupFailed, .notConnectedToInternet, .resourceUnavailable].contains(error.code)
    }
    return false
  }
}
