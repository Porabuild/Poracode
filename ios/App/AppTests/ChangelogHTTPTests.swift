import XCTest
@testable import App

final class ChangelogHTTPTests: XCTestCase {
  func testPublicGETHasNoHostAuthorizationOrCookiesAndUsesTheCanonicalParser() async throws {
    let data = try legacyDocument()
    ChangelogURLProtocol.state.configure(data: data, status: 200)
    let result = try await client().load()
    XCTAssertEqual(result.releases.first?.version, "1.0.0")
    let request = try XCTUnwrap(ChangelogURLProtocol.state.request)
    XCTAssertEqual(request.httpMethod, "GET")
    XCTAssertEqual(request.value(forHTTPHeaderField: "Accept"), "application/json")
    XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
    XCTAssertNil(request.value(forHTTPHeaderField: "Cookie"))
    XCTAssertNil(request.value(forHTTPHeaderField: "X-Host-Token"))
    XCTAssertEqual(request.timeoutInterval, 20)
    XCTAssertEqual(ChangelogHTTPClient.feedURL.absoluteString, "https://poracode.com/changelog.json")
  }

  func testFailureOrMalformedBodyNeverBecomesAnEmptySuccessfulDocument() async throws {
    for (status, data) in [(503, try legacyDocument()), (200, Data("invalid".utf8))] {
      ChangelogURLProtocol.state.configure(data: data, status: status)
      do {
        _ = try await client().load()
        XCTFail("An unsuccessful feed must fail the refresh")
      } catch { }
    }
  }

  func testOversizedDeclaredAndStreamedBodiesAreRefused() async throws {
    for (data, length) in [(Data(), String(ChangelogDocument.maximumBytes + 1)),
      (Data(repeating: 32, count: ChangelogDocument.maximumBytes + 1), nil)] {
      ChangelogURLProtocol.state.configure(data: data, status: 200, length: length)
      do {
        _ = try await client().load()
        XCTFail("Oversized feed must not be accepted")
      } catch { XCTAssertEqual(error as? ChangelogFailure, .invalidDocument) }
    }
  }

  private func legacyDocument() throws -> Data {
    let object = try JSONSerialization.jsonObject(with: ProjectFixtureLoader.data(named: "client-changelog.json"))
    let fixture = try XCTUnwrap(object as? [String: Any])
    return try JSONSerialization.data(withJSONObject: XCTUnwrap(fixture["legacyDocument"]))
  }
  private func client() -> ChangelogHTTPClient {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [ChangelogURLProtocol.self]
    configuration.httpAdditionalHeaders = ["Authorization": "Bearer synthetic-fixture", "Cookie": "fixture=true", "X-Host-Token": "synthetic-fixture"]
    return ChangelogHTTPClient(url: URL(string: "https://changelog-fixture.invalid/feed")!,
      session: URLSession(configuration: configuration))
  }
}

private final class ChangelogURLProtocol: URLProtocol {
  static let state = ResponseState()
  final class ResponseState: @unchecked Sendable {
    private let lock = NSLock()
    private var data = Data()
    private var status = 200
    private var length: String?
    private var captured: URLRequest?
    var request: URLRequest? { lock.withLock { captured } }
    func configure(data: Data, status: Int, length: String? = nil) {
      lock.withLock { self.data = data; self.status = status; self.length = length; captured = nil }
    }
    func consume(_ request: URLRequest) -> (Data, Int, String?) {
      lock.withLock { captured = request; return (data, status, length) }
    }
  }
  override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "changelog-fixture.invalid" }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    let (data, status, length) = Self.state.consume(request)
    var headers = ["Content-Type": "application/json"]
    if let length { headers["Content-Length"] = length }
    let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: data)
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() { }
}
