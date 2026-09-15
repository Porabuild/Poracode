import XCTest

@testable import App

private final class ProjectCapturingURLProtocol: URLProtocol {
  nonisolated(unsafe) static var requests: [URLRequest] = []
  nonisolated(unsafe) static var bodies: [Data?] = []
  nonisolated(unsafe) static var responseStatus = 404
  nonisolated(unsafe) static var responseBody = Data()

  static var lastRequest: URLRequest? { requests.last }
  static var lastBody: Data? { bodies.last ?? nil }

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    Self.requests.append(request)
    Self.bodies.append(Self.body(from: request))
    let response = HTTPURLResponse(
      url: request.url!, statusCode: Self.responseStatus, httpVersion: nil,
      headerFields: ["Content-Type": "application/json"]
    )!
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: Self.responseBody)
    client?.urlProtocolDidFinishLoading(self)
  }

  override func stopLoading() {}

  static func reset() {
    requests = []
    bodies = []
    responseStatus = 404
    responseBody = Data()
  }

  private static func body(from request: URLRequest) -> Data? {
    if let body = request.httpBody { return body }
    guard let stream = request.httpBodyStream else { return nil }
    stream.open()
    defer { stream.close() }
    var result = Data()
    let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 4096)
    defer { buffer.deallocate() }
    while true {
      let count = stream.read(buffer, maxLength: 4096)
      if count <= 0 { return result.isEmpty ? nil : result }
      result.append(buffer, count: count)
    }
  }
}

final class ProjectRemoteTransportTests: XCTestCase {
  override func tearDown() {
    ProjectCapturingURLProtocol.reset()
    super.tearDown()
  }

  func testProjectCommandUsesCanonicalRouteBodyAndFixtureResponse() async throws {
    let fixture = try ProjectFixtureLoader.decode(
      JSONValue.self, named: "project-command-responses.json")
    guard case .object(let root) = fixture,
      case .array(let cases)? = root["cases"],
      case .object(let first) = cases.first,
      let response = first["response"]
    else { return XCTFail("Malformed root fixture") }
    ProjectCapturingURLProtocol.responseStatus = 200
    ProjectCapturingURLProtocol.responseBody = try JSONEncoder().encode(response)

    let client = makeClient()
    let result = try await client.remoteRunProjectCommand(.remove(projectId: "project-remove"))
    XCTAssertEqual(result.project?.id, "project-posix")
    XCTAssertEqual(
      ProjectCapturingURLProtocol.lastRequest?.url?.absoluteString,
      "https://relay.test/prefix/api/projects/command"
    )
    XCTAssertEqual(ProjectCapturingURLProtocol.lastRequest?.httpMethod, "POST")
    let body = try XCTUnwrap(ProjectCapturingURLProtocol.lastBody)
    XCTAssertEqual(
      try JSONDecoder().decode(ProjectCommand.self, from: body),
      .remove(projectId: "project-remove")
    )
  }

  func testSettingsPathIsValidatedAndEncodedAsOneSegment() async throws {
    ProjectCapturingURLProtocol.responseStatus = 200
    ProjectCapturingURLProtocol.responseBody = Data("{}".utf8)
    _ = try await makeClient().remoteLoadProjectSettings(projectId: "project settings 東京")
    XCTAssertEqual(
      ProjectCapturingURLProtocol.lastRequest?.url?.absoluteString,
      "https://relay.test/prefix/api/projects/project%20settings%20%E6%9D%B1%E4%BA%AC/settings"
    )
    XCTAssertNil(ProjectCapturingURLProtocol.lastRequest?.url?.query)
  }

  func testBrowseProcedureValidatesPayloadEnvelopeAndFixtureResult() async throws {
    let fixture = try ProjectFixtureLoader.decode(
      JSONValue.self, named: "project-browse-host-directory.json")
    guard case .object(let root) = fixture,
      case .array(let cases)? = root["cases"],
      case .object(let first) = cases.first,
      let result = first["result"]
    else { return XCTFail("Malformed root fixture") }
    ProjectCapturingURLProtocol.responseStatus = 200
    ProjectCapturingURLProtocol.responseBody = try JSONEncoder().encode(
      JSONValue.object(["result": result])
    )

    let listing = try await makeClient().remoteBrowseHostDirectory(path: "")
    XCTAssertEqual(listing.path, "/Users/zoë")
    XCTAssertEqual(listing.entries.map(\.name), [".config", "项目", "résumé.md"])
    let body = try XCTUnwrap(ProjectCapturingURLProtocol.lastBody)
    guard let object = try JSONSerialization.jsonObject(with: body) as? [String: Any] else {
      return XCTFail("Expected procedure envelope")
    }
    XCTAssertEqual(object["procedure"] as? String, "browseHostDirectory")
    XCTAssertEqual((object["payload"] as? [String: Any])?["path"] as? String, "")
  }

  func testDetectSetupScriptUsesGeneratedProcedureRoots() async throws {
    let fixture = try ProjectFixtureLoader.decode(
      JSONValue.self, named: "project-detect-setup-script.json")
    guard case .object(let root) = fixture,
      case .array(let cases)? = root["cases"],
      case .object(let concrete) = cases.last,
      let request = concrete["request"],
      let result = concrete["result"]
    else { return XCTFail("Malformed root fixture") }
    let requestData = try JSONEncoder().encode(request)
    let decoded = try JSONDecoder().decode(DetectSetupScriptRequest.self, from: requestData)
    ProjectCapturingURLProtocol.responseStatus = 200
    ProjectCapturingURLProtocol.responseBody = try JSONEncoder().encode(
      JSONValue.object(["result": result])
    )

    let detected = try await makeClient().remoteDetectSetupScript(
      location: decoded.projectLocation)
    XCTAssertEqual(detected.setupScript, "pnpm install")
    let body = try XCTUnwrap(ProjectCapturingURLProtocol.lastBody)
    let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
    XCTAssertEqual(object["procedure"] as? String, "detectSetupScript")
  }

  func testNotesReadAndWriteUseValidatedPathBodyAndResponseFixtures() async throws {
    let fixture = try ProjectFixtureLoader.decode(JSONValue.self, named: "project-notes.json")
    guard case .object(let root) = fixture,
      case .array(let reads)? = root["readCases"],
      case .object(let valueRead) = reads.last,
      let readResponse = valueRead["response"],
      case .array(let writes)? = root["writeCases"],
      case .object(let write) = writes.first,
      let writeBody = write["body"]
    else { return XCTFail("Malformed root fixture") }
    let client = makeClient()
    ProjectCapturingURLProtocol.responseStatus = 200
    ProjectCapturingURLProtocol.responseBody = try JSONEncoder().encode(readResponse)

    let notes = try await client.remoteLoadProjectNotes(projectId: "project notes")
    XCTAssertEqual(notes.notes?.projectId, "project-notes")
    XCTAssertEqual(
      ProjectCapturingURLProtocol.lastRequest?.url?.absoluteString,
      "https://relay.test/prefix/api/projects/project%20notes/notes"
    )

    let bodyData = try JSONEncoder().encode(writeBody)
    let decodedBody = try JSONDecoder().decode(ProjectNotesWriteBody.self, from: bodyData)
    ProjectCapturingURLProtocol.responseBody = Data("{}".utf8)
    try await client.remoteWriteProjectNotes(decodedBody, projectId: "project notes")
    XCTAssertEqual(ProjectCapturingURLProtocol.requests.count, 2)
    XCTAssertEqual(ProjectCapturingURLProtocol.lastRequest?.httpMethod, "POST")
    XCTAssertEqual(
      try JSONDecoder().decode(
        ProjectNotesWriteBody.self, from: XCTUnwrap(ProjectCapturingURLProtocol.lastBody)),
      decodedBody
    )
  }

  func testMalformedMutationResponseIsAmbiguousAndNeverRetried() async throws {
    ProjectCapturingURLProtocol.responseStatus = 200
    ProjectCapturingURLProtocol.responseBody = Data(#"{"projects":"invalid"}"#.utf8)
    do {
      _ = try await makeClient().remoteRunProjectCommand(.remove(projectId: "project-remove"))
      XCTFail("Expected ambiguous outcome")
    } catch ProjectRemoteMutationError.ambiguousOutcome {
      XCTAssertEqual(ProjectCapturingURLProtocol.requests.count, 1)
    }
  }

  private func makeClient() -> RemoteAPIClient {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [ProjectCapturingURLProtocol.self]
    return RemoteAPIClient(
      endpoint: "https://relay.test/prefix",
      accessToken: "secret",
      session: URLSession(configuration: configuration)
    )
  }
}
