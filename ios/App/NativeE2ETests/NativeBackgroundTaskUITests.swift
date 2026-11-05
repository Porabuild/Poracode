import XCTest

/// Background-task details device journey against the shared wire-lab fixture.
///
/// The fixture (`tests/native-e2e/fixtures/background-tasks.json`) installs
/// three neutral tasks in the authoritative thread snapshot (`bg-command`,
/// `bg-monitor`, `bg-tool`), publishes `background_tasks.changed` replacements
/// for progress and category/command-only updates, drains the roster, and
/// answers the opaque `background-output.test.v1` / `background-stop.test.v1`
/// actions without starting a model turn.
@MainActor
final class NativeBackgroundTaskUITests: XCTestCase {
  private let app = XCUIApplication()
  private var controlURL: URL!
  private var capability = ""

  private var peerMode: String {
    ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real" ? "real" : "mock"
  }

  private let monitorPurpose = "Watch the fixture server health"
  private let initialMonitorCommand = "node scripts/watch-health.mjs"
  private let updatedMonitorCommand = "node scripts/watch-health.mjs --follow"
  private let initialProgress = "Watching 3 endpoints"
  private let updatedProgress = "Watching 3 endpoints: 1 degraded"

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
    app.launchArguments = [
      "-AppleLanguages", "(en)", "-AppleLocale", "en_US", "-native-e2e-fresh-state",
    ]
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
  }

  func testBackgroundTaskDetailsJourney() async throws {
    try XCTSkipIf(peerMode == "real", "The background-task fixture is served by the mock peer only.")
    _ = try await scenarioAction(["type": "background-task-stage", "stage": "initial"])
    try await pairAndOpenFixtureThread()
    openBackgroundTasksPanel()

    XCTAssertTrue(button("background-task-open:bg-monitor").waitForExistence(timeout: 10))
    XCTAssertTrue(button("background-task-open:bg-command").exists)
    XCTAssertTrue(button("background-task-open:bg-tool").exists)

    button("background-task-open:bg-monitor").tap()
    let details = element("background-task-details")
    XCTAssertTrue(details.waitForExistence(timeout: 10), "The details sheet never opened")
    XCTAssertTrue(app.descendants(matching: .any)["background-task-command"]
      .waitForExistence(timeout: 10))
    try await waitUntil { self.countDescendants(of: details, label: self.monitorPurpose) == 1 }
    try await waitUntil {
      self.descendants(of: details).contains { $0.label.localizedCaseInsensitiveContains("monitor") }
    }
    try await waitUntil {
      self.label(of: "background-task-command").contains(self.initialMonitorCommand)
    }
    try await waitUntil { self.displayedReadOrdinal() != nil }
    XCTAssertTrue(textExists(initialProgress))
    XCTAssertFalse(textExists("No progress reported"))
    XCTAssertTrue(button("background-task-stop").waitForExistence(timeout: 15))
    try await waitUntil { self.button("background-task-stop").isEnabled }

    // A live replacement updates the open sheet (and the reader keeps polling).
    _ = try await scenarioAction(["type": "background-task-stage", "stage": "progress"])
    try await waitUntil { self.textExists(self.updatedProgress) }

    _ = try await scenarioAction(["type": "background-task-stage", "stage": "category-command"])
    try await waitUntil { self.label(of: "background-task-command").contains(self.updatedMonitorCommand) }

    // Closing the single details sheet stops the poll; a live replacement on
    // the still-visible list must not trigger another output read.
    button("background-task-close").tap()
    try await waitUntil { !self.element("background-task-details").exists }
    try await waitForReadsToSettle()
    let readsAtClose = try await readCount()
    _ = try await scenarioAction(["type": "background-task-stage", "stage": "initial"])
    try await waitUntil {
      (self.button("background-task-open:bg-monitor").value as? String ?? "")
        .contains("Watching 3 endpoints")
    }
    let readsWhileClosed = try await readCount()
    XCTAssertEqual(readsWhileClosed, readsAtClose, "A closed details view must stop output reads")

    // An older delayed reply must never replace the newest read after reopen.
    _ = try await scenarioAction(["type": "background-task-output-delay", "delayMs": 1_200])
    button("background-task-open:bg-monitor").tap()
    XCTAssertTrue(element("background-task-details").waitForExistence(timeout: 10))
    try await waitForReads(atLeast: readsAtClose + 1)
    let staleRead = readsAtClose + 1
    button("background-task-close").tap()
    try await waitUntil { !self.element("background-task-details").exists }
    button("background-task-open:bg-monitor").tap()
    XCTAssertTrue(element("background-task-details").waitForExistence(timeout: 10))
    try await waitForDeliveredReads(atLeast: staleRead + 1)
    try await waitUntil { (self.displayedReadOrdinal() ?? 0) > staleRead }
    XCTAssertGreaterThan(displayedReadOrdinal() ?? 0, staleRead,
                         "A stale delayed read replaced the newest output")

    attachScreenshot("background-task-details")

    // Stop is not blocked and its confirmation replaces the roster.
    button("background-task-stop").tap()
    try await waitUntil { self.app.buttons["background-task-open:bg-monitor"].exists == false }
    XCTAssertTrue(button("background-task-open:bg-command").exists)
    XCTAssertTrue(button("background-task-open:bg-tool").exists)
    try await waitUntil {
      let stops = try await self.stopCount()
      return stops >= 1
    }

    // Drain empties the roster; a reconnect re-reads the authoritative empty snapshot.
    _ = try await scenarioAction(["type": "background-task-stage", "stage": "drain"])
    try await waitUntil { !self.app.buttons.matching(
      NSPredicate(format: "identifier BEGINSWITH 'background-task-open:'")).firstMatch.exists }
    let historyReads = try await journalCount("route:thread-history")
    XCUIDevice.shared.press(.home)
    XCTAssertTrue(app.wait(for: .runningBackground, timeout: 10))
    try await waitUntil {
      let connections = try await self.connectionCount()
      return connections == 0
    }
    // Miss a replayed event while the socket is gone so foregrounding forces
    // an authoritative resync (shell + thread history), not a cached roster.
    _ = try await scenarioAction(["type": "activate-fault", "fixtureId": "sequence-gap"])
    _ = try await control(path: "/v1/frames/event-thread-state", method: "POST")
    app.activate()
    try await waitUntil {
      let reads = try await self.journalCount("route:thread-history")
      return reads > historyReads
    }
    try await waitUntil {
      !self.app.descendants(matching: .any)["background-tasks-panel"].exists
    }
    XCTAssertFalse(
      app.buttons.matching(
        NSPredicate(format: "identifier BEGINSWITH 'background-task-open:'")).firstMatch.exists,
      "Reconnect resurrected a drained roster")
  }

  /// The panel is a sidebar on regular layouts and a compact-sheet destination
  /// on phones; wait for whichever the current layout offers before opening.
  private func openBackgroundTasksPanel() {
    let panel = element("background-tasks-panel")
    let trigger = app.buttons["Background tasks"].firstMatch
    let deadline = Date().addingTimeInterval(15)
    while Date() < deadline {
      if panel.exists { return }
      if trigger.exists { break }
      _ = trigger.waitForExistence(timeout: 0.5)
    }
    if panel.exists { return }
    XCTAssertTrue(trigger.exists, "The compact background-tasks control never appeared")
    trigger.tap()
    XCTAssertTrue(panel.waitForExistence(timeout: 10), "The background-tasks panel never appeared")
  }

  private func displayedReadOrdinal() -> Int? {
    let text = label(of: "background-task-output")
    guard let range = text.range(of: #"read \d+"#, options: .regularExpression) else { return nil }
    return Int(text[range].replacingOccurrences(of: "read ", with: ""))
  }

  private func element(_ identifier: String) -> XCUIElement {
    app.descendants(matching: .any)[identifier]
  }

  private func button(_ identifier: String) -> XCUIElement {
    app.buttons[identifier]
  }

  private func descendants(of element: XCUIElement) -> [XCUIElement] {
    element.descendants(matching: .any).allElementsBoundByIndex.filter { $0.exists }
  }

  private func countDescendants(of element: XCUIElement, label: String) -> Int {
    // The details header combines purpose and category into one accessibility
    // element, so match containment rather than an exact label.
    element.descendants(matching: .any)
      .matching(NSPredicate(format: "label CONTAINS %@", label)).count
  }

  private func label(of identifier: String) -> String {
    let element = element(identifier)
    guard element.exists else { return "" }
    return element.label.isEmpty ? (element.value as? String ?? "") : element.label
  }

  private func textExists(_ text: String) -> Bool {
    app.staticTexts[text].exists
  }

  private func attachScreenshot(_ name: String) {
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }

  private func pairAndOpenFixtureThread() async throws {
    app.launch()
    let pairing = try await pairingURL()
    try PairingLinkEntry.enter(pairing, into: app)
    let confirm = app.buttons["native-e2e.pair.confirm"]
    let home = app.buttons["native-e2e.thread.thread-fixture-001"]
    let deadline = Date().addingTimeInterval(20)
    while Date() < deadline {
      if confirm.exists {
        confirm.tap()
        app.tap()
        break
      }
      if home.exists { break }
      _ = confirm.waitForExistence(timeout: 0.5)
    }
    XCTAssertTrue(home.waitForExistence(timeout: 20), "Pairing never reached Home")
    home.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 15))
  }

  private func pairingURL() async throws -> URL {
    let body = try await scenarioAction(["type": "pairing-url", "hostId": "primary"])
    guard let raw = body["pairingUrl"] as? String, let url = URL(string: raw) else {
      throw BackgroundTaskJourneyError.invalidHarnessResponse
    }
    return url
  }

  private func scenarioAction(_ body: [String: Any]) async throws -> [String: Any] {
    try await control(path: "/v1/scenario/actions", method: "POST", body: body)
  }

  private func scenarioState() async throws -> [String: Any] {
    try await control(path: "/v1/scenario/state")
  }

  private func readCount() async throws -> Int {
    try await backgroundTaskField("outputReads")
  }

  private func stopCount() async throws -> Int {
    try await backgroundTaskField("stops")
  }

  private func backgroundTaskField(_ field: String) async throws -> Int {
    let state = try await scenarioState()
    let backgroundTasks = state["backgroundTasks"] as? [String: Any] ?? [:]
    return backgroundTasks[field] as? Int ?? -1
  }

  private func waitForReads(atLeast count: Int) async throws {
    try await waitUntil {
      let reads = try await self.readCount()
      return reads >= count
    }
  }

  private func waitForDeliveredReads(atLeast count: Int) async throws {
    try await waitUntil {
      let delivered = try await self.backgroundTaskField("outputDelivered")
      return delivered >= count
    }
  }

  /// Waits for every issued read to have resolved, so a read started just
  /// before the details sheet closed cannot be mistaken for a new poll.
  private func waitForReadsToSettle() async throws {
    try await waitUntil {
      let delivered = try await self.backgroundTaskField("outputDelivered")
      let reads = try await self.readCount()
      return delivered >= reads
    }
  }

  private func journalCount(_ operationID: String) async throws -> Int {
    let state = try await scenarioState()
    let hosts = state["hosts"] as? [[String: Any]] ?? []
    let host = hosts.first { ($0["hostId"] as? String) == "primary" }
    let journal = host?["operationJournal"] as? [[String: Any]] ?? []
    return journal.filter { ($0["operationId"] as? String) == operationID }.count
  }

  private func connectionCount() async throws -> Int {
    let state = try await control(path: "/v1/state")
    return state["connectionCount"] as? Int ?? -1
  }

  private func waitUntil(
    timeout: Duration = .seconds(30),
    condition: @escaping () async throws -> Bool
  ) async throws {
    let clock = ContinuousClock()
    let deadline = clock.now.advanced(by: timeout)
    while clock.now < deadline {
      if try await condition() { return }
      try await Task.sleep(for: .milliseconds(100))
    }
    throw BackgroundTaskJourneyError.timedOut
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
    else { throw BackgroundTaskJourneyError.invalidHarnessResponse }
    return object
  }
}

private enum BackgroundTaskJourneyError: Error {
  case invalidHarnessResponse
  case timedOut
}
