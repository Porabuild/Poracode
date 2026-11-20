import Foundation

protocol RichChatRawHTTPExecuting: Sendable {
  func uploadAttachment(
    path: String,
    queryItems: [URLQueryItem],
    contentType: String,
    body: Data
  ) async throws -> Data

  func fetchImage(path: String, queryItems: [URLQueryItem]) async throws -> RichChatBinaryPayload

  /// Streams an attachment download into a unique private directory.
  func downloadFile(
    path: String,
    queryItems: [URLQueryItem],
    suggestedName: String
  ) async throws -> RichChatFileDownload
}

extension RichChatRawHTTPExecuting {
  /// Default for mocks and transports without a download seam: fail closed,
  /// never fabricate a file.
  func downloadFile(
    path _: String,
    queryItems _: [URLQueryItem],
    suggestedName _: String
  ) async throws -> RichChatFileDownload {
    throw RichChatTransportFailure.rawTransportUnavailable
  }
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
  /// Parent authority for an environment-bound raw transport. The child bearer
  /// stays in `Authorization`; this supplies the parent header through the one
  /// shared authorization seam.
  private let authorization: EnvironmentParentAuthority

  init(
    endpoint: String,
    accessToken: String,
    session: URLSession? = nil,
    requestTimeout: TimeInterval = RemoteSocketPolicy.requestTimeoutSeconds,
    environmentAuthority: (@Sendable () async -> String?)? = nil
  ) {
    self.endpoint = endpoint
    self.accessToken = accessToken
    self.session = session ?? RemoteURLSessions.makeAPISession(requestTimeout: requestTimeout)
    self.requestTimeout = requestTimeout
    self.authorization = EnvironmentParentAuthority(
      parentTokenProvider: environmentAuthority
    )
    let register: @Sendable (RichChatRawHTTPClient) -> Void = { client in
      Task { await client.installMemoryWarningSubscription() }
    }
    register(self)
  }

  private var memoryWarningSubscription: MemoryWarningSubscription?

  private func installMemoryWarningSubscription() {
    guard memoryWarningSubscription == nil else { return }
    memoryWarningSubscription = MemoryWarningSubscription { [weak self] in
      guard let self else { return }
      Task { await self.clearImageEtagCache() }
    }
  }

  func clearImageEtagCache() {
    imageCacheGeneration &+= 1
    imageEtagCache.removeAll(keepingCapacity: false)
    imageEtagOrder.removeAll(keepingCapacity: false)
    imageEtagBytes = 0
  }

  private struct CachedImage: Sendable {
    let etag: String
    let payload: RichChatBinaryPayload
  }
  private var imageEtagCache: [String: CachedImage] = [:]
  private var imageEtagOrder: [String] = []
  private var imageEtagBytes = 0
  private var imageCacheGeneration: UInt64 = 0
  private static let maxImageEtagEntries = 32
  private static let maxImageEtagBytes = 16 * 1_024 * 1_024

  func setAccessToken(_ token: String) {
    if accessToken != token {
      imageCacheGeneration &+= 1
      imageEtagCache.removeAll(keepingCapacity: false)
      imageEtagOrder.removeAll(keepingCapacity: false)
      imageEtagBytes = 0
    }
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
    var request = try await makeRequest(path: path, queryItems: queryItems, method: "POST")
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
    var request = try await makeRequest(path: path, queryItems: queryItems, method: "GET")
    let cacheKey = request.url?.absoluteString ?? ""
    let capturedGeneration = imageCacheGeneration
    let cached = imageEtagCache[cacheKey]
    if let cached {
      request.setValue(cached.etag, forHTTPHeaderField: "If-None-Match")
    }
    let data: Data
    let response: URLResponse
    let initial = try await perform(request, maximumResponseBytes: Self.maximumImageBytes)
    try Task.checkCancellation()
    if let http = initial.1 as? HTTPURLResponse, http.statusCode == 304 {
      if let cached, capturedGeneration == imageCacheGeneration {
        return cached.payload
      }
      var uncached = request
      uncached.setValue(nil, forHTTPHeaderField: "If-None-Match")
      (data, response) = try await perform(uncached, maximumResponseBytes: Self.maximumImageBytes)
      try Task.checkCancellation()
    } else {
      (data, response) = initial
    }
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
    let payload = RichChatBinaryPayload(data: data, mimeType: mimeType)
    storeImageEtag(
      key: cacheKey,
      generation: capturedGeneration,
      response: http,
      payload: payload
    )
    return payload
  }

  private func storeImageEtag(
    key: String,
    generation: UInt64,
    response: HTTPURLResponse,
    payload: RichChatBinaryPayload
  ) {
    guard generation == imageCacheGeneration, !key.isEmpty,
      let etag = response.value(forHTTPHeaderField: "ETag")?.trimmingCharacters(in: .whitespacesAndNewlines),
      !etag.isEmpty, etag.utf8.count <= 1024,
      etag.unicodeScalars.allSatisfy({ $0.value >= 0x20 && $0.value <= 0x7E }),
      payload.data.count <= Self.maxImageEtagBytes
    else { return }
    if let existing = imageEtagCache.removeValue(forKey: key) {
      imageEtagBytes -= existing.payload.data.count
      if let idx = imageEtagOrder.firstIndex(of: key) { imageEtagOrder.remove(at: idx) }
    }
    while !imageEtagOrder.isEmpty
      && (imageEtagBytes + payload.data.count > Self.maxImageEtagBytes
        || imageEtagCache.count >= Self.maxImageEtagEntries)
    {
      let oldest = imageEtagOrder.removeFirst()
      if let removed = imageEtagCache.removeValue(forKey: oldest) {
        imageEtagBytes -= removed.payload.data.count
      }
    }
    imageEtagCache[key] = CachedImage(etag: etag, payload: payload)
    imageEtagOrder.append(key)
    imageEtagBytes += payload.data.count
  }

  /// Authenticated attachment download streamed to disk via the download
  /// session — never buffered in memory. Requires 200 + `attachment`
  /// disposition + `application/octet-stream`; redirects, error pages and
  /// old inline-host responses fail closed and the partial is removed.
  func downloadFile(
    path: String,
    queryItems: [URLQueryItem],
    suggestedName: String
  ) async throws -> RichChatFileDownload {
    try Task.checkCancellation()
    let request = try await makeRequest(path: path, queryItems: queryItems, method: "GET")
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("poracode-chat-\(UUID().uuidString)", isDirectory: true)
    do {
      let (temporaryURL, response): (URL, URLResponse)
      do {
        (temporaryURL, response) = try await session.download(for: request)
      } catch is CancellationError {
        throw CancellationError()
      } catch let error as URLError where error.code == .cancelled && Task.isCancelled {
        throw CancellationError()
      } catch {
        throw RemoteClientError(message: "Network request failed.", status: 0, code: "network")
      }
      // Own the URLSession temp file from the moment it exists; a
      // successful move makes this remove a no-op.
      defer { try? FileManager.default.removeItem(at: temporaryURL) }
      try Task.checkCancellation()
      guard let http = response as? HTTPURLResponse else {
        throw RemoteClientError(
          message: "Remote request failed.", status: 0, code: "request_failed")
      }
      guard http.statusCode == 200 else {
        // Map status without buffering an arbitrarily large error file -
        // bounded like any other JSON route read.
        let data = (try? FileHandle(forReadingFrom: temporaryURL))
          .flatMap { handle in
            let bounded = try? handle.read(upToCount: 16 * 1024)
            try? handle.close()
            return bounded
          } ?? Data()
        try validateStatus(http, data: data)
        throw RemoteClientError(
          message: "Remote request failed.",
          status: http.statusCode, code: "request_failed")
      }
      guard
        RichChatFilePolicy.isAttachmentResponse(
          contentDisposition: http.value(forHTTPHeaderField: "Content-Disposition"),
          contentType: http.value(forHTTPHeaderField: "Content-Type")
        )
      else {
        throw RichChatTransportFailure.invalidResponse
      }
      let fileName = RichChatFilePolicy.sanitizedFileName(suggestedName)
      let destination = directory.appendingPathComponent(fileName, isDirectory: false)
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      try FileManager.default.moveItem(at: temporaryURL, to: destination)
      let size =
        (try? FileManager.default.attributesOfItem(atPath: destination.path))?[.size]
        as? Int64 ?? 0
      return RichChatFileDownload(
        directory: directory, fileURL: destination, fileName: fileName, sizeBytes: size)
    } catch {
      try? FileManager.default.removeItem(at: directory)
      throw error
    }
  }

  private func makeRequest(
    path: String,
    queryItems: [URLQueryItem],
    method: String
  ) async throws -> URLRequest {
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
    request.declareCurrentRemoteWriterProtocol()
    try await authorization.authorize(&request)
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
      if authorization.isEnvironmentBound, http.statusCode == 401 {
        // Environment sessions: prove parent origin only from the trusted
        // marker; otherwise report an unattributed repair. Same classifier as
        // the JSON transport.
        throw RemoteClientError.environmentAwareFailure(
          message: "Remote request failed.",
          status: 401,
          code: "request_failed",
          evidence: Self.environmentEvidence(from: http),
          environmentBound: true,
          authorized: true
        )
      }
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

  /// Capture only the allowlisted parent-origin evidence header.
  private nonisolated static func environmentEvidence(
    from response: HTTPURLResponse
  ) -> [String: String]? {
    guard
      let value = response.value(
        forHTTPHeaderField: ProtocolConstants.environmentAuthAuthorityHeader
      ),
      !value.isEmpty
    else { return nil }
    return [ProtocolConstants.environmentAuthAuthorityHeader.lowercased(): value]
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
