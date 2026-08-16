import Foundation

#if canImport(FoundationNetworking)
  import FoundationNetworking
#endif

enum BrowserMirrorHTTPError: Error, Equatable, Sendable {
  case invalidConfiguration
  case invalidResponse
  case responseTooLarge
  case rejected(statusCode: Int, code: String?)
  case transport
}

struct BrowserMirrorHTTPRequest: Sendable {
  let route: BrowserMirrorRoute
  let body: Data?
}

protocol BrowserMirrorHTTPExecuting: Sendable {
  var endpoint: String { get }
  func execute(_ request: BrowserMirrorHTTPRequest) async throws -> Data
}

actor BrowserMirrorHTTPClient: BrowserMirrorHTTPExecuting {
  nonisolated let endpoint: String

  private let token: String
  private let session: URLSession
  private let timeout: TimeInterval
  private let maximumResponseBytes: Int

  init(
    endpoint: String,
    token: String,
    session: URLSession = .shared,
    timeout: TimeInterval = 30,
    maximumResponseBytes: Int = 512 * 1_024
  ) {
    self.endpoint = endpoint
    self.token = token
    self.session = session
    self.timeout = timeout
    self.maximumResponseBytes = maximumResponseBytes
  }

  func execute(_ request: BrowserMirrorHTTPRequest) async throws -> Data {
    let metadata: BrowserMirrorRouteMetadata
    do {
      metadata = try BrowserMirrorRemoteV3Adapter.metadata(for: request.route)
    } catch {
      throw BrowserMirrorHTTPError.invalidConfiguration
    }
    guard (metadata.bodyKind == "empty") == (request.body == nil) else {
      throw BrowserMirrorHTTPError.invalidConfiguration
    }

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
      (data, response) = try await BrowserMirrorBoundedRequest.perform(
        baseSession: session,
        request: value,
        maximumBytes: maximumResponseBytes
      )
    } catch is CancellationError {
      throw CancellationError()
    } catch BrowserMirrorHTTPError.responseTooLarge {
      throw BrowserMirrorHTTPError.responseTooLarge
    } catch {
      if Task.isCancelled { throw CancellationError() }
      throw BrowserMirrorHTTPError.transport
    }

    guard let http = response as? HTTPURLResponse else {
      throw BrowserMirrorHTTPError.invalidResponse
    }
    guard http.statusCode == metadata.status else {
      throw BrowserMirrorHTTPError.rejected(
        statusCode: http.statusCode,
        code: Self.safeErrorCode(from: data)
      )
    }
    return data
  }

  private func url(path: String) throws -> URL {
    guard var components = URLComponents(string: endpoint),
      let scheme = components.scheme?.lowercased(),
      ["http", "https"].contains(scheme),
      components.host != nil,
      components.user == nil,
      components.password == nil
    else { throw BrowserMirrorHTTPError.invalidConfiguration }
    components.query = nil
    components.fragment = nil
    var basePath = components.percentEncodedPath
    if basePath.isEmpty { basePath = "/" }
    if !basePath.hasSuffix("/") { basePath += "/" }
    components.percentEncodedPath =
      basePath + path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    guard let value = components.url else {
      throw BrowserMirrorHTTPError.invalidConfiguration
    }
    return value
  }

  private static func safeErrorCode(from data: Data) -> String? {
    guard data.count <= 8_192,
      let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let error = root["error"] as? [String: Any],
      let code = error["code"] as? String,
      !code.isEmpty,
      code.utf8.count <= 64
    else { return nil }
    let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789_-")
    return code.unicodeScalars.allSatisfy(allowed.contains) ? code : nil
  }
}

private enum BrowserMirrorBoundedRequest {
  static func perform(
    baseSession: URLSession,
    request: URLRequest,
    maximumBytes: Int
  ) async throws -> (Data, URLResponse) {
    let owner = BrowserMirrorStreamingTask(maximumBytes: maximumBytes)
    return try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { continuation in
        owner.start(
          baseSession: baseSession,
          request: request,
          continuation: continuation
        )
      }
    } onCancel: {
      owner.cancel()
    }
  }
}

private final class BrowserMirrorStreamingTask: NSObject, URLSessionDataDelegate,
  @unchecked Sendable
{
  private let maximumBytes: Int
  private let lock = NSLock()
  private var body = Data()
  private var response: URLResponse?
  private var continuation: CheckedContinuation<(Data, URLResponse), any Error>?
  private var task: URLSessionDataTask?
  private var ownedSession: URLSession?
  private var finished = false

  init(maximumBytes: Int) {
    self.maximumBytes = maximumBytes
  }

  func start(
    baseSession: URLSession,
    request: URLRequest,
    continuation: CheckedContinuation<(Data, URLResponse), any Error>
  ) {
    lock.withLock {
      guard !finished else {
        continuation.resume(throwing: CancellationError())
        return
      }
      self.continuation = continuation
      let configuration =
        (baseSession.configuration.copy() as? URLSessionConfiguration) ?? .ephemeral
      configuration.httpShouldSetCookies = false
      configuration.httpCookieAcceptPolicy = .never
      let session = URLSession(
        configuration: configuration,
        delegate: self,
        delegateQueue: nil
      )
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
    _: URLSession,
    task _: URLSessionTask,
    willPerformHTTPRedirection _: HTTPURLResponse,
    newRequest _: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    completionHandler(nil)
  }

  func urlSession(
    _: URLSession,
    dataTask _: URLSessionDataTask,
    didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    lock.withLock {
      self.response = response
      if response.expectedContentLength > Int64(maximumBytes) {
        task?.cancel()
        finish(error: BrowserMirrorHTTPError.responseTooLarge)
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
        finish(error: BrowserMirrorHTTPError.responseTooLarge)
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
        finish(error: BrowserMirrorHTTPError.invalidResponse)
      }
    }
  }

  private func finish(
    result: (Data, URLResponse)? = nil,
    error: (any Error)? = nil
  ) {
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
