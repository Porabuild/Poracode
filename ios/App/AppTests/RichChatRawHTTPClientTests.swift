import XCTest

@testable import App

private final class RichChatRawURLProtocol: URLProtocol {
  nonisolated(unsafe) static var status = 200
  nonisolated(unsafe) static var contentType = "image/png"
  nonisolated(unsafe) static var declaredLength: Int?
  nonisolated(unsafe) static var responseBody = Data([0x89, 0x50, 0x4E, 0x47])
  nonisolated(unsafe) static var requests: [URLRequest] = []
  nonisolated(unsafe) static var requestBodies: [Data?] = []
  nonisolated(unsafe) static var holdOpen = false
  nonisolated(unsafe) static var stopCount = 0
  nonisolated(unsafe) static var startExpectation: XCTestExpectation?
  nonisolated(unsafe) static var stopExpectation: XCTestExpectation?

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    Self.requests.append(request)
    Self.requestBodies.append(Self.body(from: request))
    Self.startExpectation?.fulfill()
    guard !Self.holdOpen else { return }
    var headers = ["Content-Type": Self.contentType]
    if let declaredLength = Self.declaredLength {
      headers["Content-Length"] = String(declaredLength)
    }
    let response = HTTPURLResponse(
      url: request.url!, statusCode: Self.status, httpVersion: nil, headerFields: headers
    )!
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: Self.responseBody)
    client?.urlProtocolDidFinishLoading(self)
  }

  override func stopLoading() {
    Self.stopCount += 1
    Self.stopExpectation?.fulfill()
  }

  static func reset() {
    status = 200
    contentType = "image/png"
    declaredLength = nil
    responseBody = Data([0x89, 0x50, 0x4E, 0x47])
    requests = []
    requestBodies = []
    holdOpen = false
    stopCount = 0
    startExpectation = nil
    stopExpectation = nil
  }

  private static func body(from request: URLRequest) -> Data? {
    if let body = request.httpBody { return body }
    guard let stream = request.httpBodyStream else { return nil }
    stream.open()
    defer { stream.close() }
    var data = Data()
    let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 4_096)
    defer { buffer.deallocate() }
    while true {
      let count = stream.read(buffer, maxLength: 4_096)
      if count <= 0 { return data.isEmpty ? nil : data }
      data.append(buffer, count: count)
    }
  }
}

final class RichChatRawHTTPClientTests: XCTestCase {
  override func tearDown() {
    RichChatRawURLProtocol.reset()
    super.tearDown()
  }

  func testUploadIsBoundedAuthenticatedRawBodyAndCanonicalQuery() async throws {
    RichChatRawURLProtocol.contentType = "application/json"
    RichChatRawURLProtocol.responseBody = Data(#"{"path":"/tmp/uploaded.bin"}"#.utf8)
    let raw = makeRawClient()
    let api = GeneratedRichChatRemoteAPI(json: makeJSONClient(), raw: raw)
    let uploaded = try await api.richUploadAttachment(
      threadID: "thread rich",
      attachment: RichChatAttachment(
        name: "a b.bin",
        contentType: "application/octet-stream",
        data: Data([1, 2, 3])
      ))

    XCTAssertEqual(uploaded, "/tmp/uploaded.bin")
    let request = try XCTUnwrap(RichChatRawURLProtocol.requests.first)
    XCTAssertEqual(request.url?.path, "/prefix/api/files/attachment")
    XCTAssertEqual(request.url?.query, "threadId=thread%20rich&name=a%20b.bin")
    XCTAssertEqual(request.httpMethod, "POST")
    XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-secret")
    XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Length"), "3")
    XCTAssertEqual(RichChatRawURLProtocol.requestBodies.first ?? nil, Data([1, 2, 3]))
  }

  func testAttachmentFixtureLimitsRejectBeforeNetwork() async throws {
    let fixture = try loadRichChatFixture("attachment-boundaries.json")
    let maximum = Int(
      try XCTUnwrap(
        try richFixtureObject(try XCTUnwrap(fixture["limits"]))["maxBytes"]?.exactInt64Value)
    )
    XCTAssertEqual(maximum, RichChatRawHTTPClient.maximumAttachmentBytes)
    let api = GeneratedRichChatRemoteAPI(json: makeJSONClient(), raw: makeRawClient())

    for attachment in [
      RichChatAttachment(name: "empty.bin", contentType: "application/octet-stream", data: Data()),
      RichChatAttachment(
        name: String(repeating: "a", count: 256),
        contentType: "application/octet-stream",
        data: Data([1])
      ),
    ] {
      do {
        _ = try await api.richUploadAttachment(threadID: "thread", attachment: attachment)
        XCTFail("Expected local attachment rejection")
      } catch let failure as RichChatTransportFailure {
        XCTAssertEqual(failure, .invalidRequest)
      }
    }
    XCTAssertTrue(RichChatRawURLProtocol.requests.isEmpty)
  }

  func testImageFetchEnforcesBinaryMimeAndDeclaredLengthCap() async throws {
    let raw = makeRawClient()
    let image = try await raw.fetchImage(
      path: "/api/files/image",
      queryItems: [URLQueryItem(name: "path", value: "/tmp/image.png")]
    )
    XCTAssertEqual(image.mimeType, "image/png")
    XCTAssertEqual(image.data, Data([0x89, 0x50, 0x4E, 0x47]))

    RichChatRawURLProtocol.reset()
    RichChatRawURLProtocol.contentType = "text/html"
    do {
      _ = try await raw.fetchImage(path: "/api/files/image", queryItems: [])
      XCTFail("Expected MIME rejection")
    } catch let failure as RichChatTransportFailure {
      XCTAssertEqual(failure, .invalidResponse)
    }

    RichChatRawURLProtocol.reset()
    RichChatRawURLProtocol.declaredLength = RichChatRawHTTPClient.maximumImageBytes + 1
    do {
      _ = try await raw.fetchImage(path: "/api/files/image", queryItems: [])
      XCTFail("Expected bounded response rejection")
    } catch let error as RemoteClientError {
      XCTAssertEqual(error.code, "response_too_large")
    }
  }

  func testRawRequestCancellationPropagatesAndCancelsUnderlyingTask() async throws {
    RichChatRawURLProtocol.holdOpen = true
    let started = expectation(description: "URL loading started")
    let stopped = expectation(description: "URL loading stopped")
    RichChatRawURLProtocol.startExpectation = started
    RichChatRawURLProtocol.stopExpectation = stopped
    let raw = makeRawClient()
    let task = Task {
      try await raw.fetchImage(path: "/api/files/image", queryItems: [])
    }
    await fulfillment(of: [started], timeout: 1)
    XCTAssertEqual(RichChatRawURLProtocol.requests.count, 1)
    task.cancel()
    do {
      _ = try await task.value
      XCTFail("Expected cancellation")
    } catch is CancellationError {}
    await fulfillment(of: [stopped], timeout: 1)
    XCTAssertEqual(RichChatRawURLProtocol.stopCount, 1)
    XCTAssertEqual(RichChatRawURLProtocol.requests.count, 1, "Cancellation must not retry")
  }

  func testCancellationBeforeRawRequestDoesNotStartNetworkTask() async throws {
    let raw = makeRawClient()
    let task = Task {
      withUnsafeCurrentTask { $0?.cancel() }
      return try await raw.fetchImage(path: "/api/files/image", queryItems: [])
    }

    do {
      _ = try await task.value
      XCTFail("Expected cancellation")
    } catch is CancellationError {}
    XCTAssertTrue(RichChatRawURLProtocol.requests.isEmpty)
    XCTAssertEqual(RichChatRawURLProtocol.stopCount, 0)
  }

  private func makeRawClient() -> RichChatRawHTTPClient {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [RichChatRawURLProtocol.self]
    return RichChatRawHTTPClient(
      endpoint: "https://relay.test/prefix",
      accessToken: "access-secret",
      session: URLSession(configuration: configuration)
    )
  }

  private func makeJSONClient() -> RemoteAPIClient {
    RemoteAPIClient(endpoint: "https://relay.test/prefix", accessToken: "access-secret")
  }
}
