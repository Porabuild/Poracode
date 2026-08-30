import UIKit
import UniformTypeIdentifiers
import XCTest

@MainActor
final class NativeJourneyUITests: XCTestCase {
  private let app = XCUIApplication()
  private var controlURL: URL!
  private var capability = ""

  override func setUp() async throws {
    continueAfterFailure = false
    let environment = ProcessInfo.processInfo.environment
    guard let rawURL = environment["NATIVE_E2E_CONTROL_URL"],
      let url = URL(string: rawURL),
      let controlCapability = environment["NATIVE_E2E_CONTROL_CAPABILITY"],
      !controlCapability.isEmpty
    else {
      throw XCTSkip("Native E2E harness is not configured.")
    }
    controlURL = url
    capability = controlCapability
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    if let interfaceStyle = environment["NATIVE_E2E_INTERFACE_STYLE"],
      interfaceStyle == "Dark" || interfaceStyle == "Light"
    {
      app.launchArguments += [
        "-AppleInterfaceStyle", interfaceStyle,
        "-ios.appearance.mode", interfaceStyle.lowercased(),
      ]
    }
  }

  func testRealNativeRemoteJourney() async throws {
    addUIInterruptionMonitor(withDescription: "System network confirmation") { alert in
      let allowPaste = alert.buttons["Allow Paste"]
      if allowPaste.exists {
        allowPaste.tap()
        return true
      }
      let allow = alert.buttons["Allow"]
      if allow.exists {
        allow.tap()
        return true
      }
      return false
    }

    app.launch()
    XCTAssertTrue(revealPairingLinkField(timeout: 10).exists)

    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    let primaryPairing = try await pairingURL(hostID: "primary")
    try pastePairingURL(primaryPairing)
    confirmPairingIfNeeded()
    let thread = app.buttons["native-e2e.thread.thread-fixture-001"]
    XCTAssertTrue(thread.waitForExistence(timeout: 20))
    attachScreenshot("01-primary-ready")

    let projectFilter = app.buttons["native-e2e.project-filter"]
    XCTAssertTrue(projectFilter.waitForExistence(timeout: 5))
    XCTAssertGreaterThanOrEqual(projectFilter.frame.width, 44)
    XCTAssertGreaterThanOrEqual(projectFilter.frame.height, 44)
    projectFilter.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
    XCTAssertTrue(app.navigationBars["Filter projects"].waitForExistence(timeout: 5))
    let projectFilterDone = app.buttons["native-e2e.project-filter.done"]
    XCTAssertTrue(projectFilterDone.waitForExistence(timeout: 5))
    projectFilterDone.tap()

    _ = try await control(path: "/v1/frames/event-agent-status", method: "POST")
    let newThread = app.buttons["native-e2e.new-thread"]
    XCTAssertTrue(newThread.waitForExistence(timeout: 5))
    try await waitUntilEnabled(newThread)
    newThread.tap()
    XCTAssertTrue(app.textFields["native-e2e.new-thread-prompt"].waitForExistence(timeout: 5))
    attachScreenshot("01b-quick-compose")
    app.buttons["Cancel"].tap()

    thread.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 15))
    XCTAssertTrue(app.descendants(matching: .any)["native-e2e.timeline"].exists)
    attachScreenshot("02-authoritative-history")

    let message = "Native journey message"
    let composer = app.textFields["native-e2e.composer"]
    XCTAssertTrue(composer.waitForExistence(timeout: 10))
    composer.tap()
    composer.typeText(message)
    app.buttons["native-e2e.send"].tap()
    try await waitForJournal(hostID: "primary", operationID: "route:thread-send", count: 1)

    for fixture in [
      "runtime-live-turn-started", "runtime-live-user-item-started",
      "runtime-live-item-started", "runtime-live-content-delta",
    ] {
      _ = try await control(path: "/v1/frames/\(fixture)", method: "POST")
    }
    XCTAssertTrue(app.staticTexts[message].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["Native live update"].waitForExistence(timeout: 10))
    try await waitForJournal(hostID: "primary", operationID: "runtime:content.delta", count: 1)

    let interrupt = app.buttons["native-e2e.interrupt"]
    XCTAssertTrue(interrupt.waitForExistence(timeout: 10))
    interrupt.tap()
    try await waitForJournal(hostID: "primary", operationID: "route:thread-interrupt", count: 1)
    attachScreenshot("03-live-and-interrupted")

    XCUIDevice.shared.press(.home)
    XCTAssertTrue(app.wait(for: .runningBackground, timeout: 10))
    try await waitForConnectionCount(0)
    _ = try await scenarioAction(["type": "activate-fault", "fixtureId": "sequence-gap"])
    _ = try await control(path: "/v1/frames/event-thread-state", method: "POST")
    app.activate()

    try await waitForJournal(hostID: "primary", operationID: "ws-server:resync-required", count: 1)
    try await waitForJournal(hostID: "primary", operationID: "route:shell-snapshot", count: 2)
    try await waitForJournal(hostID: "primary", operationID: "route:thread-history", count: 2)
    let primaryAfterRecovery = try await scenarioState().host("primary")
    let reconnects = primaryAfterRecovery.operationJournal.filter { $0.operationId == "ws:connect" }
    XCTAssertGreaterThanOrEqual(reconnects.count, 2)
    XCTAssertTrue(reconnects.dropFirst().contains { ($0.lastSeenSeq ?? 0) > 0 })
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 10))
    attachScreenshot("04-authoritative-resync")

    navigateHome()
    app.buttons["native-e2e.session-menu"].tap()
    let connections = app.buttons["native-e2e.more.connections"]
    XCTAssertTrue(connections.waitForExistence(timeout: 5))
    connections.tap()
    let connectionRow = app.buttons["native-e2e.connection-row"].firstMatch
    XCTAssertTrue(connectionRow.waitForExistence(timeout: 5))
    connectionRow.swipeLeft()
    // Launch arguments force English, so the localized action labels are fixed.
    let removeConnection = app.buttons["Remove connection"].firstMatch
    XCTAssertTrue(removeConnection.waitForExistence(timeout: 5))
    removeConnection.tap()
    let confirmRemove = app.buttons["Remove"].firstMatch
    XCTAssertTrue(confirmRemove.waitForExistence(timeout: 5))
    confirmRemove.tap()
    XCTAssertTrue(revealPairingLinkField(timeout: 15).exists)

    let beforeSecondPair = try await scenarioState().host("primary").operationJournal.count
    let collisionPairing = try await pairingURL(hostID: "collision-b")
    app.terminate()
    app.launch()
    XCTAssertTrue(revealPairingLinkField(timeout: 10).exists)
    try pastePairingURL(collisionPairing)
    confirmPairingIfNeeded()
    XCTAssertTrue(thread.waitForExistence(timeout: 20))

    let finalState = try await scenarioState()
    let primary = try finalState.host("primary")
    let collision = try finalState.host("collision-b")
    XCTAssertEqual(primary.operationJournal.count, beforeSecondPair)
    XCTAssertEqual(
      primary.operationJournal.filter { $0.operationId == "route:thread-send" }.count, 1)
    XCTAssertEqual(
      primary.operationJournal.filter { $0.operationId == "route:thread-interrupt" }.count, 1)
    XCTAssertEqual(
      collision.operationJournal.filter { $0.operationId == "route:token-exchange" }.count, 1)
    XCTAssertEqual(
      collision.operationJournal.filter { $0.operationId == "route:shell-snapshot" }.count, 1)
    XCTAssertEqual(collision.operationJournal.filter { $0.operationId == "ws:connect" }.count, 1)
    XCTAssertFalse(collision.operationJournal.contains { $0.operationId == "route:thread-send" })
    attachScreenshot("05-second-host-isolated")
  }

  private func confirmPairingIfNeeded() {
    let confirm = app.buttons["native-e2e.pair.confirm"]
    if confirm.waitForExistence(timeout: 2) {
      confirm.tap()
      app.tap()
      return
    }
    XCTAssertTrue(
      app.buttons["native-e2e.thread.thread-fixture-001"].waitForExistence(timeout: 18))
  }

  private func navigateHome() {
    let back = app.navigationBars.buttons.element(boundBy: 0)
    XCTAssertTrue(back.waitForExistence(timeout: 5))
    back.tap()
  }

  private func pairingURL(hostID: String) async throws -> URL {
    let body = try await scenarioAction(["type": "pairing-url", "hostId": hostID])
    guard let raw = body["pairingUrl"] as? String, let url = URL(string: raw) else {
      throw JourneyError.invalidHarnessResponse
    }
    return url
  }

  /// The pairing-link field lives inside the "Other ways to connect" sheet. It
  /// auto-expands when scanning is unavailable — always true on the Simulator —
  /// but expand explicitly so the journey never depends on that.
  @discardableResult
  private func revealPairingLinkField(timeout: TimeInterval = 10) -> XCUIElement {
    let field = app.textFields["native-e2e.pairing-link"]
    if field.waitForExistence(timeout: timeout) { return field }
    let expander = app.buttons["native-e2e.pair.manual"]
    if expander.waitForExistence(timeout: 5) {
      expander.tap()
      _ = field.waitForExistence(timeout: timeout)
    }
    return field
  }

  private func pastePairingURL(_ pairingURL: URL) throws {
    UIPasteboard.general.setItems(
      [[UTType.plainText.identifier: pairingURL.absoluteString]],
      options: [.localOnly: true, .expirationDate: Date().addingTimeInterval(30)],
    )
    defer { UIPasteboard.general.items = [] }
    let field = revealPairingLinkField()
    XCTAssertTrue(field.exists)
    field.tap()
    field.press(forDuration: 1)
    let paste = app.menuItems["Paste"]
    XCTAssertTrue(paste.waitForExistence(timeout: 5))
    paste.tap()
    app.navigationBars.firstMatch.tap()
    let submit = app.buttons["native-e2e.pair.submit"]
    XCTAssertTrue(submit.waitForExistence(timeout: 5))
    XCTAssertTrue(submit.isHittable, "Connect must remain visible after entering a pairing link")
    submit.tap()
  }

  private func waitForConnectionCount(_ expected: Int) async throws {
    try await poll {
      let state = try await self.control(path: "/v1/state")
      return state["connectionCount"] as? Int == expected
    }
  }

  private func waitForJournal(hostID: String, operationID: String, count: Int) async throws {
    try await poll {
      let host = try await self.scenarioState().host(hostID)
      return host.operationJournal.filter { $0.operationId == operationID }.count >= count
    }
  }

  private func waitUntilEnabled(_ element: XCUIElement) async throws {
    try await poll {
      element.exists && element.isEnabled
    }
  }

  private func poll(
    timeout: Duration = .seconds(15),
    condition: @escaping () async throws -> Bool
  ) async throws {
    let clock = ContinuousClock()
    let deadline = clock.now.advanced(by: timeout)
    while clock.now < deadline {
      if try await condition() { return }
      try await Task.sleep(for: .milliseconds(100))
    }
    throw JourneyError.timedOut
  }

  private func scenarioState() async throws -> ScenarioState {
    let object = try await control(path: "/v1/scenario/state")
    let data = try JSONSerialization.data(withJSONObject: object)
    return try JSONDecoder().decode(ScenarioState.self, from: data)
  }

  private func scenarioAction(_ body: [String: Any]) async throws -> [String: Any] {
    try await control(path: "/v1/scenario/actions", method: "POST", body: body)
  }

  private func control(
    path: String,
    method: String = "GET",
    body: [String: Any]? = nil
  ) async throws -> [String: Any] {
    var request = URLRequest(url: URL(string: path, relativeTo: controlURL)!)
    request.httpMethod = method
    request.setValue("Harness \(capability)", forHTTPHeaderField: "Authorization")
    if let body {
      request.httpBody = try JSONSerialization.data(withJSONObject: body)
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode,
      let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { throw JourneyError.invalidHarnessResponse }
    return object
  }

  private func attachScreenshot(_ name: String) {
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }
}

private enum JourneyError: Error { case invalidHarnessResponse, timedOut, missingHost }

private struct ScenarioState: Decodable {
  let hosts: [ScenarioHost]
  func host(_ id: String) throws -> ScenarioHost {
    guard let host = hosts.first(where: { $0.hostId == id }) else { throw JourneyError.missingHost }
    return host
  }
}

private struct ScenarioHost: Decodable {
  let hostId: String
  let operationJournal: [WireOperation]
}

private struct WireOperation: Decodable {
  let operationId: String
  let lastSeenSeq: Int?
}
