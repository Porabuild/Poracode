import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import BrowserMirror
#endif

#if canImport(FoundationNetworking)
  import FoundationNetworking
#endif

final class BrowserMirrorHTTPTests: XCTestCase {
  func testURLProtocolGETUsesExactPathBearerAndOneAttempt() async throws {
    let response = try fixtureStateResponse()
    BrowserMirrorURLProtocol.prepare([.response(status: 200, body: response)])
    let api = GeneratedBrowserMirrorRemoteAPI(http: makeHTTPClient())

    let state = try await api.fetchState()

    XCTAssertEqual(state.activeTabId, "tab-main")
    let requests = BrowserMirrorURLProtocol.recordedRequests()
    XCTAssertEqual(requests.count, 1)
    XCTAssertEqual(requests[0].httpMethod, "GET")
    XCTAssertEqual(requests[0].url?.path, "/prefix/api/browser/state")
    XCTAssertEqual(requests[0].value(forHTTPHeaderField: "Authorization"), "Bearer token")
    XCTAssertNil(requests[0].httpBody)
  }

  func testURLProtocolPOSTUsesExactPathAndCanonicalBodyOnce() async throws {
    let response = try fixtureStateResponse()
    BrowserMirrorURLProtocol.prepare([.response(status: 200, body: response)])
    let api = GeneratedBrowserMirrorRemoteAPI(http: makeHTTPClient())

    _ = try await api.perform(.reload(tabId: "tab-main"))

    let requests = BrowserMirrorURLProtocol.recordedRequests()
    XCTAssertEqual(requests.count, 1)
    XCTAssertEqual(requests[0].httpMethod, "POST")
    XCTAssertEqual(requests[0].url?.path, "/prefix/api/browser/command")
    XCTAssertEqual(requests[0].value(forHTTPHeaderField: "Content-Type"), "application/json")
    let body = try XCTUnwrap(requests[0].browserMirrorBody)
    XCTAssertTrue(
      try BrowserMirrorTestValues.equalJSON(
        body,
        BrowserMirrorTestValues.json(["kind": "reload", "tabId": "tab-main"])
      ))
  }

  func testTransportAndMalformedMutationResultsAreAmbiguousAndNeverRetried() async {
    let transport = BrowserMirrorHTTPSpy(result: .failure(.transport))
    let transportAPI = GeneratedBrowserMirrorRemoteAPI(http: transport)
    do {
      _ = try await transportAPI.perform(.createTab(url: nil))
      XCTFail()
    } catch {
      XCTAssertEqual(error as? BrowserMirrorFailure, .ambiguousMutation)
    }
    let transportCalls = await transport.callCount()
    XCTAssertEqual(transportCalls, 1)

    let malformed = BrowserMirrorHTTPSpy(result: .success(Data("{}".utf8)))
    let malformedAPI = GeneratedBrowserMirrorRemoteAPI(http: malformed)
    do {
      _ = try await malformedAPI.perform(.createTab(url: nil))
      XCTFail()
    } catch {
      XCTAssertEqual(error as? BrowserMirrorFailure, .ambiguousMutation)
    }
    let malformedCalls = await malformed.callCount()
    XCTAssertEqual(malformedCalls, 1)
  }

  func testRejectedMutationIsNotClassifiedAsAmbiguous() async {
    let http = BrowserMirrorHTTPSpy(
      result: .failure(.rejected(statusCode: 403, code: "forbidden")))
    let api = GeneratedBrowserMirrorRemoteAPI(http: http)
    do {
      _ = try await api.perform(.createTab(url: nil))
      XCTFail()
    } catch {
      XCTAssertEqual(
        error as? BrowserMirrorFailure,
        .rejected(statusCode: 403, code: "forbidden")
      )
    }
    let httpCalls = await http.callCount()
    XCTAssertEqual(httpCalls, 1)
  }

  @MainActor
  func testSelectedGatewayEnforcesScopesBeforeAwait() async {
    let accessBox = BrowserMirrorAccessBox(
      BrowserMirrorTestValues.access(capabilities: [.read]))
    let api = BrowserMirrorBlockingAPISpy()
    let gateway = makeGateway(accessBox: accessBox, api: api)

    do {
      _ = try await gateway.command(.createTab(url: nil), lease: BrowserMirrorTestValues.lease)
      XCTFail()
    } catch {
      XCTAssertEqual(error as? BrowserMirrorFailure, .missingScope)
    }
    let commandCount = await api.commandCount()
    XCTAssertEqual(commandCount, 0)
  }

  @MainActor
  func testSelectedGatewayRejectsStateThatCompletesForStaleOwner() async {
    let accessBox = BrowserMirrorAccessBox(BrowserMirrorTestValues.access())
    let api = BrowserMirrorBlockingAPISpy()
    await api.blockState()
    let gateway = makeGateway(accessBox: accessBox, api: api)
    let task = Task { try await gateway.state(lease: BrowserMirrorTestValues.lease) }
    await api.waitUntilStateStarted()

    accessBox.access = BrowserMirrorTestValues.access(lease: BrowserMirrorTestValues.otherLease)
    await api.releaseState()

    do {
      _ = try await task.value
      XCTFail()
    } catch is CancellationError {
    } catch {
      XCTFail("Expected stale-owner cancellation")
    }
  }

  private func makeHTTPClient() -> BrowserMirrorHTTPClient {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [BrowserMirrorURLProtocol.self]
    let session = URLSession(configuration: configuration)
    return BrowserMirrorHTTPClient(
      endpoint: "https://example.test/prefix",
      token: "token",
      session: session
    )
  }

  private func fixtureStateResponse() throws -> Data {
    let fixture = try BrowserMirrorTestValues.fixtureObject()
    let http = try XCTUnwrap(fixture["http"] as? [String: Any])
    return try BrowserMirrorTestValues.json(try XCTUnwrap(http["stateResponse"]))
  }

  @MainActor
  private func makeGateway(
    accessBox: BrowserMirrorAccessBox,
    api: BrowserMirrorBlockingAPISpy
  ) -> BrowserMirrorSelectedGateway {
    BrowserMirrorSelectedGateway(
      credentials: BrowserMirrorCredentialSpy(),
      accessProvider: { accessBox.access },
      makeAPI: { _, _ in api }
    )
  }
}

@MainActor
final class BrowserMirrorAccessBox: @unchecked Sendable {
  var access: BrowserMirrorHostAccess?

  init(_ access: BrowserMirrorHostAccess?) {
    self.access = access
  }
}

actor BrowserMirrorCredentialSpy: BrowserMirrorCredentialRepository {
  func credentials(
    for connectionID: BrowserMirrorConnectionID
  ) async throws -> BrowserMirrorHostCredentials? {
    BrowserMirrorHostCredentials(
      connectionID: connectionID,
      endpoint: "https://example.test",
      token: "token",
      protocolVersion: 3,
      scopes: ["session:read", "session:operate"]
    )
  }
}

actor BrowserMirrorBlockingAPISpy: BrowserMirrorRemoteAPI {
  private var shouldBlockState = false
  private var stateStarted: CheckedContinuation<Void, Never>?
  private var stateRelease: CheckedContinuation<Void, Never>?
  private var commands = 0

  func blockState() { shouldBlockState = true }
  func commandCount() -> Int { commands }

  func waitUntilStateStarted() async {
    await withCheckedContinuation { stateStarted = $0 }
  }

  func releaseState() {
    stateRelease?.resume()
    stateRelease = nil
  }

  func fetchState() async throws -> BrowserMirrorState {
    if shouldBlockState {
      stateStarted?.resume()
      stateStarted = nil
      await withCheckedContinuation { stateRelease = $0 }
    }
    return BrowserMirrorTestValues.state
  }

  func perform(_ command: BrowserMirrorCommand) async throws -> BrowserMirrorState {
    commands += 1
    return BrowserMirrorTestValues.state
  }
}
