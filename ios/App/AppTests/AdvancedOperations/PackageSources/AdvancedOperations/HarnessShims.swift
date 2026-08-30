import Foundation

#if canImport(FoundationNetworking)
  import FoundationNetworking
#endif

// Harness-only. The feature depends on `ProjectLocation`, which lives in a
// model file that also carries an unrelated JSON helper referencing the app's
// networking error type. This shim satisfies that single reference so the
// isolated package can compile the real feature sources without pulling in the
// app's transport graph. Nothing in the feature calls it.
struct RemoteClientError: Error, Equatable, Sendable {
  let message: String

  static func invalidResponse(_ message: String) -> RemoteClientError {
    RemoteClientError(message: message)
  }
}

enum ProtocolConstants {
  static let remoteProtocolVersion = 8
  static let bearerTokenType = "Bearer"
}

enum RemoteRequestHeaders {
  static let authorization = "Authorization"
  static let contentType = "Content-Type"
  static let jsonContentType = "application/json"

  static func authorizationValue(for token: String) -> String {
    "\(ProtocolConstants.bearerTokenType) \(token)"
  }
}

enum RemoteURLSessions {
  static func makeAPISession(requestTimeout: TimeInterval) -> URLSession {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = requestTimeout
    configuration.timeoutIntervalForResource = requestTimeout
    configuration.httpShouldSetCookies = false
    configuration.httpCookieAcceptPolicy = .never
    return URLSession(configuration: configuration)
  }
}

enum StreamingHTTPBody {
  static func perform(
    session: URLSession,
    request: URLRequest,
    maxBytes: Int
  ) async throws -> (Data, URLResponse) {
    let (data, response) = try await session.data(for: request)
    guard data.count <= maxBytes else {
      throw RemoteClientError.invalidResponse("response_too_large")
    }
    return (data, response)
  }
}

/// The isolated package does not own device settings. Production builds resolve
/// this preference through Settings; form tests only need its neutral contract.
enum AIContentLanguagePreference {
  case matchApp

  static func stored() -> Self { .matchApp }

  func modelLanguageName() -> String? { nil }
}
