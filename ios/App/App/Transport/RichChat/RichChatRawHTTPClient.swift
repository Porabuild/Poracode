import Foundation

protocol RichChatRawHTTPExecuting: Sendable {
  func uploadAttachment(
    path: String,
    queryItems: [URLQueryItem],
    contentType: String,
    body: Data
  ) async throws -> Data

  func fetchImage(path: String, queryItems: [URLQueryItem]) async throws -> RichChatBinaryPayload
}

/// Bounded raw-body transport for the two wire kinds `RemoteAPIClient.requestData` does not own.
actor RichChatRawHTTPClient: RichChatRawHTTPExecuting {
  static let maximumAttachmentBytes = Int(RichAttachmentPolicy.maximumBytes)
  static let maximumImageBytes = ProtocolConstants.maxResponseBodyBytes
  private static let maximumUploadResponseBytes = 1 * 1_024 * 1_024

  private let endpoint: String
  private var accessToken: String
  private let session: URLSession
  private let requestTimeout: TimeInterval

  init(
    endpoint: String,
    accessToken: String,
    session: URLSession? = nil,
    requestTimeout: TimeInterval = RemoteSocketPolicy.requestTimeoutSeconds
  ) {
    self.endpoint = endpoint
    self.accessToken = accessToken
    self.session = session ?? RemoteURLSessions.makeAPISession(requestTimeout: requestTimeout)
    self.requestTimeout = requestTimeout
  }

  func setAccessToken(_ token: String) {
    accessToken = token
  }

  func uploadAttachment(
    path: String,
    queryItems: [URLQueryItem],
    contentType: String,
    body: Data
  ) async throws -> Data {
    try Task.checkCancellation()
    guard (1...Self.maximumAttachmentBytes).contains(body.count),
      Self.isSafeContentType(contentType)
    else { throw RichChatTransportFailure.invalidRequest }
    var request = try makeRequest(path: path, queryItems: queryItems, method: "POST")
    request.setValue(contentType, forHTTPHeaderField: "Content-Type")
    request.setValue(String(body.count), forHTTPHeaderField: "Content-Length")
    request.httpBody = body
    let (data, response) = try await perform(
      request, maximumResponseBytes: Self.maximumUploadResponseBytes
    )
    try Task.checkCancellation()
    try validateJSONResponse(response, data: data)
    return data
  }

  func fetchImage(
    path: String,
    queryItems: [URLQueryItem]
  ) async throws -> RichChatBinaryPayload {
    try Task.checkCancellation()
    let request = try makeRequest(path: path, queryItems: queryItems, method: "GET")
    let (data, response) = try await perform(
      request, maximumResponseBytes: Self.maximumImageBytes
    )
    try Task.checkCancellation()
    try validateStatus(response, data: data)
    guard let http = response as? HTTPURLResponse,
      let rawType = http.value(forHTTPHeaderField: "Content-Type")
    else { throw RichChatTransportFailure.invalidResponse }
    let mimeType =
      rawType.split(separator: ";", maxSplits: 1).first?
      .trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
    guard mimeType.hasPrefix("image/"), mimeType.utf8.count <= 127 else {
      throw RichChatTransportFailure.invalidResponse
    }
    return RichChatBinaryPayload(data: data, mimeType: mimeType)
  }

  private func makeRequest(
    path: String,
    queryItems: [URLQueryItem],
    method: String
  ) throws -> URLRequest {
    var url = try RemoteAPIClient.resolveEndpointURL(endpoint: endpoint, path: path)
    if !queryItems.isEmpty {
      guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
        throw RichChatTransportFailure.invalidRequest
      }
      components.queryItems = (components.queryItems ?? []) + queryItems
      guard let composed = components.url else { throw RichChatTransportFailure.invalidRequest }
      url = composed
    }
    var request = URLRequest(url: url, timeoutInterval: requestTimeout)
    request.httpMethod = method
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    return request
  }

  private func perform(
    _ request: URLRequest,
    maximumResponseBytes: Int
  ) async throws -> (Data, URLResponse) {
    do {
      return try await StreamingHTTPBody.perform(
        session: session,
        request: request,
        maxBytes: maximumResponseBytes
      )
    } catch is CancellationError {
      throw CancellationError()
    } catch let error as RemoteClientError {
      throw error
    } catch let error as RichChatTransportFailure {
      throw error
    } catch let error as URLError where error.code == .cancelled && Task.isCancelled {
      throw CancellationError()
    } catch {
      throw RemoteClientError(message: "Network request failed.", status: 0, code: "network")
    }
  }

  private func validateJSONResponse(_ response: URLResponse, data: Data) throws {
    try validateStatus(response, data: data)
    guard let http = response as? HTTPURLResponse else {
      throw RichChatTransportFailure.invalidResponse
    }
    let contentType = http.value(forHTTPHeaderField: "Content-Type")?.lowercased() ?? ""
    guard contentType.isEmpty || contentType.hasPrefix("application/json") else {
      throw RichChatTransportFailure.invalidResponse
    }
  }

  private func validateStatus(_ response: URLResponse, data: Data) throws {
    guard let http = response as? HTTPURLResponse else {
      throw RichChatTransportFailure.invalidResponse
    }
    if RedirectPolicy.isRedirectStatus(http.statusCode) {
      throw RedirectPolicy.apiErrorForRedirect(status: http.statusCode)
    }
    guard http.statusCode == 200 else {
      if let payload = try? JSONDecoding.decode(RemoteHttpErrorPayload.self, from: data) {
        throw RemoteClientError(
          message: payload.error.message,
          status: http.statusCode,
          code: payload.error.code
        )
      }
      throw RemoteClientError(
        message: "Remote request failed.",
        status: http.statusCode,
        code: "request_failed"
      )
    }
  }

  private nonisolated static func isSafeContentType(_ value: String) -> Bool {
    guard !value.isEmpty, value.utf8.count <= 127, value.filter({ $0 == "/" }).count == 1,
      !value.hasPrefix("/"), !value.hasSuffix("/")
    else { return false }
    let allowed = CharacterSet(
      charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$&^_.+-/"
    )
    return value.unicodeScalars.allSatisfy(allowed.contains)
  }
}
