import Foundation

#if canImport(FoundationNetworking)
  import FoundationNetworking
#endif

struct PortForwardingHTTPRequest: Sendable {
  let route: PortForwardingRoute
  let body: Data?
}

enum PortForwardingHTTPError: Error, Equatable, Sendable {
  case invalidConfiguration
  case rejected(statusCode: Int, code: String?)
  case invalidResponse
  case responseTooLarge
  case transport
}

protocol PortForwardingHTTPExecuting: Sendable {
  var endpoint: String { get }
  func execute(_ request: PortForwardingHTTPRequest) async throws -> Data
}

final class PortForwardingURLSessionHTTPClient: PortForwardingHTTPExecuting, @unchecked Sendable {
  static let maximumAttempts = 1
  static let defaultMaximumResponseBytes = 2 * 1_024 * 1_024

  let endpoint: String
  private let token: String
  private let session: URLSession
  private let timeout: TimeInterval
  private let maximumResponseBytes: Int

  init(
    endpoint: String,
    token: String,
    session: URLSession? = nil,
    timeout: TimeInterval = 15,
    maximumResponseBytes: Int = defaultMaximumResponseBytes
  ) throws {
    guard !token.isEmpty, (1...30).contains(timeout),
      (1...Self.defaultMaximumResponseBytes).contains(maximumResponseBytes),
      Self.baseComponents(endpoint) != nil
    else { throw PortForwardingHTTPError.invalidConfiguration }
    self.endpoint = endpoint
    self.token = token
    self.timeout = timeout
    self.maximumResponseBytes = maximumResponseBytes
    if let session {
      self.session = session
    } else {
      let configuration = URLSessionConfiguration.ephemeral
      configuration.timeoutIntervalForRequest = timeout
      configuration.timeoutIntervalForResource = timeout
      configuration.httpShouldSetCookies = false
      configuration.httpCookieAcceptPolicy = .never
      configuration.waitsForConnectivity = false
      self.session = URLSession(configuration: configuration)
    }
  }

  func execute(_ request: PortForwardingHTTPRequest) async throws -> Data {
    try Task.checkCancellation()
    let metadata: PortForwardingRouteMetadata
    do {
      metadata = try PortForwardingRemoteV3Contract.metadata(for: request.route)
    } catch {
      throw PortForwardingHTTPError.invalidConfiguration
    }
    guard request.route != .forwardEnter,
      (metadata.bodyKind == "empty") == (request.body == nil)
    else { throw PortForwardingHTTPError.invalidConfiguration }

    var value = URLRequest(url: try url(path: metadata.path), timeoutInterval: timeout)
    value.httpMethod = metadata.method
    value.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    if let body = request.body {
      value.setValue("application/json", forHTTPHeaderField: "Content-Type")
      value.httpBody = body
    }

    let data: Data
    let response: URLResponse
    do {
      (data, response) = try await PortForwardingStreamingBody.perform(
        session: session, request: value, maximumBytes: maximumResponseBytes)
    } catch is CancellationError {
      throw CancellationError()
    } catch PortForwardingHTTPError.responseTooLarge {
      throw PortForwardingHTTPError.responseTooLarge
    } catch {
      if Task.isCancelled { throw CancellationError() }
      throw PortForwardingHTTPError.transport
    }

    guard let http = response as? HTTPURLResponse else {
      throw PortForwardingHTTPError.invalidResponse
    }
    guard http.statusCode == metadata.status else {
      throw PortForwardingHTTPError.rejected(
        statusCode: http.statusCode, code: Self.errorCode(from: data))
    }
    return data
  }

  private func url(path: String) throws -> URL {
    guard var components = Self.baseComponents(endpoint) else {
      throw PortForwardingHTTPError.invalidConfiguration
    }
    var basePath = components.percentEncodedPath
    if basePath.isEmpty { basePath = "/" }
    if !basePath.hasSuffix("/") { basePath += "/" }
    components.percentEncodedPath =
      basePath + path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    guard let url = components.url else { throw PortForwardingHTTPError.invalidConfiguration }
    return url
  }

  private static func baseComponents(_ endpoint: String) -> URLComponents? {
    guard var components = URLComponents(string: endpoint),
      let scheme = components.scheme?.lowercased(), ["http", "https"].contains(scheme),
      components.host != nil, components.user == nil, components.password == nil
    else { return nil }
    components.query = nil
    components.fragment = nil
    return components
  }

  private static func errorCode(from data: Data) -> String? {
    guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let error = root["error"] as? [String: Any], let code = error["code"] as? String,
      !code.isEmpty, code.utf8.count <= 64
    else { return nil }
    let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789_-")
    return code.unicodeScalars.allSatisfy(allowed.contains) ? code : nil
  }
}

private enum PortForwardingStreamingBody {
  static func perform(
    session: URLSession, request: URLRequest, maximumBytes: Int
  ) async throws -> (Data, URLResponse) {
    let owner = PortForwardingStreamingTask(maximumBytes: maximumBytes)
    return try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { continuation in
        owner.start(baseSession: session, request: request, continuation: continuation)
      }
    } onCancel: {
      owner.cancel()
    }
  }
}

private final class PortForwardingStreamingTask: NSObject, URLSessionDataDelegate,
  @unchecked Sendable
{
  private let maximumBytes: Int
  private let lock = NSLock()
  private var body = Data()
  private var response: URLResponse?
  private var continuation: CheckedContinuation<(Data, URLResponse), Error>?
  private var task: URLSessionDataTask?
  private var ownedSession: URLSession?
  private var finished = false

  init(maximumBytes: Int) { self.maximumBytes = maximumBytes }

  func start(
    baseSession: URLSession,
    request: URLRequest,
    continuation: CheckedContinuation<(Data, URLResponse), Error>
  ) {
    lock.withLock {
      guard !finished else {
        continuation.resume(throwing: CancellationError())
        return
      }
      self.continuation = continuation
      let configuration =
        (baseSession.configuration.copy() as? URLSessionConfiguration)
        ?? .ephemeral
      configuration.httpShouldSetCookies = false
      configuration.httpCookieAcceptPolicy = .never
      let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
      ownedSession = session
      task = session.dataTask(with: request)
      task?.resume()
    }
  }

  func cancel() {
    lock.withLock {
      task?.cancel()
      finish(error: CancellationError())
    }
  }

  func urlSession(
    _: URLSession, task _: URLSessionTask, willPerformHTTPRedirection _: HTTPURLResponse,
    newRequest _: URLRequest, completionHandler: @escaping (URLRequest?) -> Void
  ) { completionHandler(nil) }

  func urlSession(
    _: URLSession, dataTask _: URLSessionDataTask, didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    lock.withLock {
      self.response = response
      if response.expectedContentLength > Int64(maximumBytes) {
        task?.cancel()
        finish(error: PortForwardingHTTPError.responseTooLarge)
        completionHandler(.cancel)
      } else {
        completionHandler(.allow)
      }
    }
  }

  func urlSession(_: URLSession, dataTask _: URLSessionDataTask, didReceive data: Data) {
    lock.withLock {
      guard !finished else { return }
      guard body.count <= maximumBytes - data.count else {
        task?.cancel()
        finish(error: PortForwardingHTTPError.responseTooLarge)
        return
      }
      body.append(data)
    }
  }

  func urlSession(_: URLSession, task _: URLSessionTask, didCompleteWithError error: Error?) {
    lock.withLock {
      guard !finished else { return }
      if let error {
        if (error as? URLError)?.code == .cancelled {
          finish(error: CancellationError())
        } else {
          finish(error: error)
        }
      } else if let response {
        finish(result: (body, response))
      } else {
        finish(error: PortForwardingHTTPError.invalidResponse)
      }
    }
  }

  private func finish(result: (Data, URLResponse)? = nil, error: Error? = nil) {
    guard !finished else { return }
    finished = true
    let saved = continuation
    continuation = nil
    task = nil
    let session = ownedSession
    ownedSession = nil
    if let error {
      session?.invalidateAndCancel()
      saved?.resume(throwing: error)
    } else if let result {
      session?.finishTasksAndInvalidate()
      saved?.resume(returning: result)
    }
  }
}
