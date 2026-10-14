import Foundation
import XCTest

@testable import App

final class GitOperationsRemoteAPITests: XCTestCase {
  override func tearDown() {
    GitOperationsURLProtocol.reset()
    super.tearDown()
  }

  func testAuthenticatedBoundedPostUsesCanonicalEnvelope() async throws {
    GitOperationsURLProtocol.responses = [.http(200, Data("{}".utf8))]
    let result = try await makeClient().remoteGitOperation(
      .gitStageAll(.init(projectLocation: GitOperationsSamples.wsl))
    )
    XCTAssertEqual(result, .omitted)
    XCTAssertEqual(GitOperationsURLProtocol.requests.count, 1)
    let request = try XCTUnwrap(GitOperationsURLProtocol.requests.first)
    XCTAssertEqual(request.url?.path, "/prefix/api/git/call")
    XCTAssertEqual(request.httpMethod, "POST")
    XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer secret")
    let body = try XCTUnwrap(GitOperationsURLProtocol.bodies.first ?? nil)
    let envelope = try XCTUnwrap(
      JSONSerialization.jsonObject(with: body) as? [String: Any]
    )
    XCTAssertEqual(envelope["procedure"] as? String, "gitStageAll")
    let payload = try XCTUnwrap(envelope["payload"] as? [String: Any])
    let location = try XCTUnwrap(payload["projectLocation"] as? [String: Any])
    XCTAssertEqual(location["linuxPath"] as? String, "/home/dev/repo")
    XCTAssertEqual(
      location["uncPath"] as? String,
      #"\\wsl.localhost\Ubuntu-24.04\home\dev\repo"#
    )
  }

  func testMutationTransportAndMalformedDeliveryAreAmbiguousWithoutRetry() async {
    GitOperationsURLProtocol.responses = [.failure(URLError(.networkConnectionLost))]
    await assertAmbiguousMutation()
    XCTAssertEqual(GitOperationsURLProtocol.requests.count, 1)

    GitOperationsURLProtocol.reset()
    GitOperationsURLProtocol.responses = [
      .http(200, Data(#"{"result":null}"#.utf8))
    ]
    await assertAmbiguousMutation()
    XCTAssertEqual(GitOperationsURLProtocol.requests.count, 1)
  }

  func testAuthoritativeHTTPRejectionIsPreservedWithoutRetry() async {
    GitOperationsURLProtocol.responses = [
      .http(409, Data(#"{"error":{"code":"conflict","message":"private"}}"#.utf8))
    ]
    do {
      _ = try await mutation()
      XCTFail("Expected rejection")
    } catch let error as RemoteClientError {
      XCTAssertEqual(error.status, 409)
      XCTAssertEqual(error.code, "conflict")
      XCTAssertEqual(GitOperationsURLProtocol.requests.count, 1)
    } catch {
      XCTFail("Unexpected error: \(error)")
    }
  }

  func testMalformedReadIsInvalidResponseAndNeverRetried() async {
    GitOperationsURLProtocol.responses = [
      .http(200, Data(#"{"result":{"branches":[]}}"#.utf8))
    ]
    do {
      _ = try await makeClient().remoteGitOperation(
        .gitListBranches(.init(projectLocation: GitOperationsSamples.posix))
      )
      XCTFail("Expected invalid response")
    } catch let error as RemoteClientError {
      XCTAssertEqual(error.code, "invalid_response")
      XCTAssertEqual(GitOperationsURLProtocol.requests.count, 1)
    } catch {
      XCTFail("Unexpected error: \(error)")
    }
  }

  func testTaskCancellationPropagatesAsCancellationError() async {
    GitOperationsURLProtocol.responses = [.pending]
    let client = makeClient()
    let task = Task {
      try await client.remoteGitOperation(
        .gitStageAll(.init(projectLocation: GitOperationsSamples.posix))
      )
    }
    while GitOperationsURLProtocol.requestCount == 0 { await Task.yield() }
    task.cancel()
    do {
      _ = try await task.value
      XCTFail("Expected cancellation")
    } catch is CancellationError {
    } catch {
      XCTFail("Unexpected error: \(error)")
    }
    XCTAssertEqual(GitOperationsURLProtocol.requestCount, 1)
  }

  private func assertAmbiguousMutation() async {
    do {
      _ = try await mutation()
      XCTFail("Expected ambiguous outcome")
    } catch GitOperationsRemoteMutationError.ambiguousOutcome {
    } catch {
      XCTFail("Unexpected error: \(error)")
    }
  }

  private func mutation() async throws -> GitOperationResult {
    try await makeClient().remoteGitOperation(
      .gitStageAll(.init(projectLocation: GitOperationsSamples.posix))
    )
  }

  private func makeClient() -> RemoteAPIClient {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [GitOperationsURLProtocol.self]
    return RemoteAPIClient(
      endpoint: "https://relay.test/prefix",
      accessToken: "secret",
      session: URLSession(configuration: configuration)
    )
  }
}

private final class GitOperationsURLProtocol: URLProtocol, @unchecked Sendable {
  enum Response {
    case http(Int, Data)
    case failure(URLError)
    case pending
  }

  nonisolated(unsafe) static var requests: [URLRequest] = []
  nonisolated(unsafe) static var bodies: [Data?] = []
  nonisolated(unsafe) static var responses: [Response] = []
  private static let lock = NSLock()

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    let response: Response? = Self.lock.withLock {
      Self.requests.append(request)
      Self.bodies.append(Self.body(from: request))
      return Self.responses.isEmpty ? nil : Self.responses.removeFirst()
    }
    guard let response else {
      client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
      return
    }
    switch response {
    case .http(let status, let body):
      let response = HTTPURLResponse(
        url: request.url!, statusCode: status, httpVersion: nil,
        headerFields: ["Content-Type": "application/json"]
      )!
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: body)
      client?.urlProtocolDidFinishLoading(self)
    case .failure(let error):
      client?.urlProtocol(self, didFailWithError: error)
    case .pending:
      break
    }
  }

  override func stopLoading() {}

  static func reset() {
    lock.withLock {
      requests = []
      bodies = []
      responses = []
    }
  }

  static var requestCount: Int { lock.withLock { requests.count } }

  private static func body(from request: URLRequest) -> Data? {
    if let body = request.httpBody { return body }
    guard let stream = request.httpBodyStream else { return nil }
    stream.open()
    defer { stream.close() }
    var data = Data()
    let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 4096)
    defer { buffer.deallocate() }
    while true {
      let count = stream.read(buffer, maxLength: 4096)
      guard count > 0 else { return data.isEmpty ? nil : data }
      data.append(buffer, count: count)
    }
  }
}
