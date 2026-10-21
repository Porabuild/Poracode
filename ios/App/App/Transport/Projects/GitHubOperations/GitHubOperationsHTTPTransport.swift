import Foundation

#if canImport(FoundationNetworking)
  import FoundationNetworking
#endif

actor GitHubOperationsHTTPTransport: GitHubOperationsRemoteAPI, ForgeReviewRemoteAPI {
  typealias Loader = @Sendable (URLRequest) async throws -> (Data, URLResponse)

  private let endpoint: URL
  private let accessToken: String
  private let loader: Loader
  private let timeout: TimeInterval
  private let maximumResponseBytes: Int
  private let authorization: EnvironmentParentAuthority

  init(
    endpoint: URL,
    accessToken: String,
    session: URLSession = .shared,
    timeout: TimeInterval = 30,
    maximumResponseBytes: Int = 4 * 1_024 * 1_024,
    environmentAuthority: EnvironmentParentAuthority = .direct
  ) {
    self.endpoint = endpoint
    self.accessToken = accessToken
    self.timeout = timeout
    self.maximumResponseBytes = maximumResponseBytes
    self.authorization = environmentAuthority
    self.loader = { request in try await session.data(for: request) }
  }

  init(
    endpoint: URL,
    accessToken: String,
    timeout: TimeInterval = 30,
    maximumResponseBytes: Int = 4 * 1_024 * 1_024,
    loader: @escaping Loader,
    environmentAuthority: EnvironmentParentAuthority = .direct
  ) {
    self.endpoint = endpoint
    self.accessToken = accessToken
    self.timeout = timeout
    self.maximumResponseBytes = maximumResponseBytes
    self.authorization = environmentAuthority
    self.loader = loader
  }

  func remoteGitHubOperation(
    _ request: GitHubOperationRequest
  ) async throws -> GitHubOperationResult {
    let metadata = GitHubOperationsRemoteV3Contract.metadata(for: request.procedure)
    let body = try GitHubOperationsRemoteV3Contract.request(request)
    let data = try await sendProcedure(body: body, isMutation: metadata.isMutation)
    do {
      try Task.checkCancellation()
      guard let envelope = try JSONDecoder().decode(GitHubJSONValue.self, from: data).objectValue else {
        throw GitHubOperationsFailure.invalidResponse
      }
      let resultData: Data
      if metadata.resultKind == .omitted {
        guard envelope.isEmpty else { throw GitHubOperationsFailure.invalidResponse }
        resultData = data
      } else {
        guard Set(envelope.keys) == ["result"], let value = envelope["result"] else {
          throw GitHubOperationsFailure.invalidResponse
        }
        resultData = try JSONEncoder().encode(value)
      }
      return try GitHubOperationsRemoteV3Contract.result(for: request.procedure, response: resultData)
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      if metadata.isMutation { throw GitHubOperationsFailure.ambiguousOutcome }
      throw GitHubOperationsFailure.invalidResponse
    }
  }

  func remoteForgeReviewOperation(
    _ operation: ForgeReviewOperation,
    payload: GitHubDocument
  ) async throws -> GitHubDocument {
    let body = try ForgeReviewRemoteV3Contract.request(operation, payload: payload)
    let isMutation = operation.scope == .operate
    let data = try await sendProcedure(body: body, isMutation: isMutation)
    do {
      try Task.checkCancellation()
      return try ForgeReviewRemoteV3Contract.result(operation, response: data)
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      if isMutation { throw GitHubOperationsFailure.ambiguousOutcome }
      throw GitHubOperationsFailure.invalidResponse
    }
  }

  private func sendProcedure(body: Data, isMutation: Bool) async throws -> Data {
    let urlRequest: URLRequest
    do {
      urlRequest = try await makeRequest(body: body)
    } catch let error as RemoteClientError {
      // Parent pairing is missing/unreadable: fail closed with the transport's
      // own 401 classification instead of dialing without the parent header.
      throw GitHubOperationsFailure.rejected(statusCode: error.status, code: error.code)
    }
    let data: Data
    let response: URLResponse

    do {
      (data, response) = try await loader(urlRequest)
    } catch is CancellationError {
      throw CancellationError()
    } catch let error as URLError where error.code == .cancelled && Task.isCancelled {
      throw CancellationError()
    } catch {
      if Task.isCancelled { throw CancellationError() }
      if isMutation { throw GitHubOperationsFailure.ambiguousOutcome }
      throw GitHubOperationsFailure.transport
    }

    guard let http = response as? HTTPURLResponse else {
      if isMutation { throw GitHubOperationsFailure.ambiguousOutcome }
      throw GitHubOperationsFailure.invalidResponse
    }
    guard data.count <= maximumResponseBytes else {
      if isMutation { throw GitHubOperationsFailure.ambiguousOutcome }
      throw GitHubOperationsFailure.invalidResponse
    }

    guard (200..<300).contains(http.statusCode) else {
      if isMutation,
        RemoteMutationClassification.classify(statusCode: http.statusCode)
          == .requestMayHaveCommitted
      {
        throw GitHubOperationsFailure.ambiguousOutcome
      }
      throw sanitizedHTTPFailure(statusCode: http.statusCode, data: data)
    }

    return data
  }

  private func makeRequest(body: Data) async throws -> URLRequest {
    guard var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false) else {
      throw GitHubOperationsFailure.notReady
    }
    let prefix =
      components.path.hasSuffix("/")
      ? String(components.path.dropLast()) : components.path
    components.path = prefix + GitHubOperationsRemoteV3Contract.procedurePath
    guard let url = components.url else { throw GitHubOperationsFailure.notReady }

    var request = URLRequest(url: url, timeoutInterval: timeout)
    request.httpMethod = "POST"
    request.httpBody = body
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.declareCurrentRemoteWriterProtocol()
    try await authorization.authorize(&request)
    return request
  }

  private func sanitizedHTTPFailure(statusCode: Int, data: Data) -> GitHubOperationsFailure {
    let code = Self.sanitizedCode(from: data)
    if statusCode == 401 { return .authenticationExpired }
    if statusCode == 403 {
      return code == "missing_scope" ? .capabilityMissing : .authorizationDenied
    }
    return .rejected(statusCode: statusCode, code: code)
  }

  private static func sanitizedCode(from data: Data) -> String? {
    guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let error = root["error"] as? [String: Any],
      let code = error["code"] as? String,
      !code.isEmpty,
      code.utf8.count <= 64
    else { return nil }
    let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789_-")
    guard code.unicodeScalars.allSatisfy(allowed.contains) else { return nil }
    return code
  }
}
