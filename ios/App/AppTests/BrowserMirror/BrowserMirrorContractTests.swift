import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import BrowserMirror
#endif

final class BrowserMirrorContractTests: XCTestCase {
  func testEveryFixtureHTTPCommandUsesIndividualGeneratedRoot() throws {
    let fixture = try BrowserMirrorTestValues.fixtureObject()
    let http = try XCTUnwrap(fixture["http"] as? [String: Any])
    let commands = try XCTUnwrap(http["commands"] as? [[String: Any]])
    XCTAssertEqual(commands.count, 10)
    XCTAssertEqual(BrowserMirrorCommand.kindCount, 8)

    for item in commands {
      let request = try XCTUnwrap(item["request"])
      let source = try BrowserMirrorTestValues.json(request)
      let command = try JSONDecoder().decode(BrowserMirrorCommand.self, from: source)
      let canonical = try BrowserMirrorRemoteV3Adapter.commandRequest(command)
      XCTAssertTrue(try BrowserMirrorTestValues.equalJSON(source, canonical))
    }
  }

  func testFixtureStateResponseRoundTripsThroughGeneratedRoot() throws {
    let fixture = try BrowserMirrorTestValues.fixtureObject()
    let http = try XCTUnwrap(fixture["http"] as? [String: Any])
    let source = try BrowserMirrorTestValues.json(
      try XCTUnwrap(http["stateResponse"]))
    let state = try BrowserMirrorRemoteV3Adapter.stateResponse(source)

    XCTAssertEqual(state.tabs.count, 2)
    XCTAssertEqual(state.activeTabId, "tab-main")
    XCTAssertEqual(state.tabs[0].title, "Poracode — 東京")
    XCTAssertEqual(state.tabs[0].faviconUrl, "https://example.test/favicon.ico")
  }

  func testEveryFixtureClientEnvelopeMatchesGeneratedIndividualRoot() throws {
    let messages = try fixtureMessages(direction: "client")
    XCTAssertEqual(messages.count, 13)

    for item in messages {
      let message = try XCTUnwrap(item["message"] as? [String: Any])
      let source = try BrowserMirrorTestValues.json(message)
      let type = try XCTUnwrap(message["type"] as? String)
      let canonical: Data
      switch type {
      case "browser-watch":
        canonical = try BrowserMirrorRemoteV3Adapter.watchMessage()
      case "browser-unwatch":
        canonical = try BrowserMirrorRemoteV3Adapter.unwatchMessage()
      case "browser-input":
        let inputData = try BrowserMirrorTestValues.json(
          try XCTUnwrap(message["input"]))
        let input = try JSONDecoder().decode(BrowserMirrorInput.self, from: inputData)
        canonical = try BrowserMirrorRemoteV3Adapter.inputMessage(input)
      default:
        XCTFail("Unexpected fixture message type")
        continue
      }
      XCTAssertTrue(try BrowserMirrorTestValues.equalJSON(source, canonical))
    }
  }

  func testEveryFixtureServerEnvelopeUsesIndividualGeneratedRoot() throws {
    let messages = try fixtureMessages(direction: "server")
    XCTAssertEqual(messages.count, 5)

    var events: [BrowserMirrorSocketEvent] = []
    for item in messages {
      let source = try BrowserMirrorTestValues.json(
        try XCTUnwrap(item["message"]))
      events.append(try BrowserMirrorRemoteV3Adapter.serverEvent(source))
    }

    guard case .state(let state) = events[0] else { return XCTFail() }
    XCTAssertEqual(state.activeTabId, "tab-main")
    guard case .frame(let frame) = events[1] else { return XCTFail() }
    XCTAssertEqual(frame.metadata.deviceWidth, 1_280)
    guard case .status(.unavailable) = events[4] else { return XCTFail() }
  }

  func testAdapterEnumeratesEveryIndividualBrowserRoot() {
    XCTAssertEqual(
      BrowserMirrorRemoteV3Adapter.individualRootIDs,
      [
        "route.browser-command.request",
        "route.browser-command.response",
        "route.browser-state.response",
        "websocket.client.browser-watch",
        "websocket.client.browser-unwatch",
        "websocket.client.browser-input",
        "websocket.server.browser-state",
        "websocket.server.browser-frame",
        "websocket.server.browser-mirror-status",
      ]
    )
  }

  func testRouteMetadataRequiresExactScopesAndMethods() throws {
    XCTAssertEqual(
      try BrowserMirrorRemoteV3Adapter.metadata(for: .state),
      BrowserMirrorRouteMetadata(
        method: "GET",
        path: "/api/browser/state",
        scopes: ["session:read"],
        bodyKind: "empty",
        status: 200
      )
    )
    XCTAssertEqual(
      try BrowserMirrorRemoteV3Adapter.metadata(for: .command).scopes,
      ["session:operate"]
    )
  }

  private func fixtureMessages(direction: String) throws -> [[String: Any]] {
    let fixture = try BrowserMirrorTestValues.fixtureObject()
    let socket = try XCTUnwrap(fixture["webSocket"] as? [String: Any])
    return try XCTUnwrap(socket[direction] as? [[String: Any]])
  }
}
