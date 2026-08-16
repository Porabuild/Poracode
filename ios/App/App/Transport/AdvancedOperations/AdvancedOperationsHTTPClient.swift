import Foundation

#if canImport(FoundationNetworking)
  import FoundationNetworking
#endif

/// Production HTTP boundary for Advanced Operations.
///
/// Exactly one authenticated POST is issued per call and nothing here ever
/// repeats it: an interrupted mutation stays ambiguous for the layers above
/// instead of being silently re-sent. The timeout class selected by the
/// procedure metadata is honoured, the response body is bounded, redirects are
/// refused, and cancellation surfaces as `CancellationError` rather than a
/// transport failure.
actor AdvancedOperationsHTTPClient: AdvancedOperationsHTTPExecuting {
  /// One attempt. Declared so the no-retry contract is greppable from tests.
  static let maximumAttempts = 1
  static let standardTimeoutSeconds: TimeInterval = 30
  static let longTimeoutSeconds: TimeInterval = 180
  static let maximumResponseBytes = 4 * 1_024 * 1_024

  private let endpoint: String
  private let credential: String
  private let session: URLSession
  private let standardTimeout: TimeInterval
  private let longTimeout: TimeInterval
  private let maximumResponseBytes: Int

  init(
    endpoint: String,
    credential: String,
    session: URLSession? = nil,
    standardTimeout: TimeInterval = AdvancedOperationsHTTPClient.standardTimeoutSeconds,
    longTimeout: TimeInterval = AdvancedOperationsHTTPClient.longTimeoutSeconds,
    maximumResponseBytes: Int = AdvancedOperationsHTTPClient.maximumResponseBytes
  ) throws {
    guard !credential.isEmpty,
      standardTimeout > 0, longTimeout >= standardTimeout, longTimeout <= 600,
      maximumResponseBytes > 0, maximumResponseBytes <= Self.maximumResponseBytes,
      Self.baseComponents(endpoint) != nil
    else { throw AdvancedOperationsHTTPError.transport }
    self.endpoint = endpoint
    self.credential = credential
    self.standardTimeout = standardTimeout
    self.longTimeout = longTimeout
    self.maximumResponseBytes = maximumResponseBytes
    self.session = session ?? RemoteURLSessions.makeAPISession(requestTimeout: longTimeout)
  }

  func postAdvancedProcedure(
    path: String,
    body: Data,
    timeout: AdvancedOperationTimeout
  ) async throws -> Data {
    try Task.checkCancellation()
    guard let url = Self.url(endpoint: endpoint, path: path) else {
      throw AdvancedOperationsHTTPError.transport
    }
    var request = URLRequest(url: url, timeoutInterval: interval(for: timeout))
    request.httpMethod = "POST"
    request.httpBody = body
    request.setValue(
      RemoteRequestHeaders.jsonContentType,
      forHTTPHeaderField: RemoteRequestHeaders.contentType
    )
    request.setValue(
      RemoteRequestHeaders.authorizationValue(for: credential),
      forHTTPHeaderField: RemoteRequestHeaders.authorization
    )

    let data: Data
    let response: URLResponse
    do {
      (data, response) = try await StreamingHTTPBody.perform(
        session: session,
        request: request,
        maxBytes: maximumResponseBytes
      )
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      if Task.isCancelled { throw CancellationError() }
      throw AdvancedOperationsHTTPError.transport
    }

    try Task.checkCancellation()
    guard let http = response as? HTTPURLResponse else {
      throw AdvancedOperationsHTTPError.transport
    }
    guard (200..<300).contains(http.statusCode) else {
      throw AdvancedOperationsHTTPError.rejected(
        statusCode: http.statusCode,
        code: Self.safeErrorCode(from: data)
      )
    }
    guard data.count <= maximumResponseBytes else {
      throw AdvancedOperationsHTTPError.transport
    }
    return data
  }

  private func interval(for timeout: AdvancedOperationTimeout) -> TimeInterval {
    switch timeout {
    case .standard: standardTimeout
    case .long: longTimeout
    }
  }

  /// Only `http`/`https` origins without embedded credentials are accepted, and
  /// any query or fragment carried by the stored endpoint is dropped.
  static func baseComponents(_ endpoint: String) -> URLComponents? {
    guard var components = URLComponents(string: endpoint),
      let scheme = components.scheme?.lowercased(),
      scheme == "http" || scheme == "https",
      let host = components.host, !host.isEmpty,
      components.user == nil, components.password == nil
    else { return nil }
    components.query = nil
    components.fragment = nil
    return components
  }

  static func url(endpoint: String, path: String) -> URL? {
    guard var components = baseComponents(endpoint) else { return nil }
    var basePath = components.percentEncodedPath
    if basePath.isEmpty { basePath = "/" }
    if !basePath.hasSuffix("/") { basePath += "/" }
    let suffix = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    guard !suffix.isEmpty, !suffix.contains("..") else { return nil }
    components.percentEncodedPath = basePath + suffix
    return components.url
  }

  /// Host error codes are echoed only when they are short, lower-case, and made
  /// of an allow-listed alphabet. Everything else is dropped rather than shown.
  private static func safeErrorCode(from data: Data) -> String? {
    guard data.count <= 8_192,
      let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let error = root["error"] as? [String: Any],
      let code = error["code"] as? String,
      !code.isEmpty, code.utf8.count <= 64
    else { return nil }
    let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789_-")
    return code.unicodeScalars.allSatisfy(allowed.contains) ? code : nil
  }
}
