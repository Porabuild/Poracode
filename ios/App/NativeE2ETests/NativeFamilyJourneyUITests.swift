import UIKit
import UniformTypeIdentifiers
import XCTest

/// V6 E.2: device journeys for steer, permission, terminal keystroke, and git.
///
/// The terminal and git journeys run against BOTH peers:
///  - `mock` (default, CI-fast): the WireLab peer; assertions poll its
///    consolidated observed-operation set.
///  - `real` (env-gated: `NATIVE_E2E_PEER_MODE=real`):
///    the production headless host. The real host has no scenario journal or
///    fixture threads, so the journey asserts in-UI completion against the real
///    peer while the observable PTY-echo / repo-index effects are asserted by
///    the TS harness (`tests/native-e2e/realHostObservableEffects.test.ts`).
///    Each real-mode pairing mints a fresh one-time credential from the
///    harness control plane (`POST /v1/real/pairing-url`): pairing tokens are
///    single-use by design, so a second pairing — after a runner restart —
///    must never replay the startup env URL.
@MainActor
final class NativeFamilyJourneyUITests: XCTestCase {
  private static var preparedRealPeerState = false

  private let app = XCUIApplication()
  private var controlURL: URL!
  private var capability = ""
  private var reusesRealPeerPairing = false

  private enum PeerMode {
    case mock
    case real
  }

  private var peerMode: PeerMode {
    ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real" ? .real : .mock
  }

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
    if peerMode == .mock {
      app.launchArguments.append("-native-e2e-fresh-state")
    } else {
      reusesRealPeerPairing = Self.preparedRealPeerState
      Self.preparedRealPeerState = true
      if !reusesRealPeerPairing {
        app.launchArguments.append("-native-e2e-fresh-state")
      }
    }
    // The iOS paste-permission system alert appears on physical devices when
    // `pastePairingURL` reads the pasteboard into the app; the wire-lab
    // journey registers this interruption monitor before launch, so the
    // family journeys mirror it (the monitor fires on the UI interaction
    // that follows the alert, here the field tap in `pastePairingURL`).
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

  func testSteerFamilySetsPendingFromComposerDuringLiveTurn() async throws {
    try XCTSkipIf(
      peerMode == .real,
      "The steer family drives mock-only live-turn frame fixtures."
    )
    try await pairAndOpenFixtureThread()
    for fixture in [
      "runtime-live-turn-started", "runtime-live-user-item-started",
      "runtime-live-item-started", "runtime-live-content-delta",
    ] {
      _ = try await control(path: "/v1/frames/\(fixture)", method: "POST")
    }
    let composerCollapsed = app.buttons["native-e2e.composer-collapsed"]
    XCTAssertTrue(composerCollapsed.waitForExistence(timeout: 10))
    composerCollapsed.tap()
    let composer = app.textFields["native-e2e.composer"]
    XCTAssertTrue(composer.waitForExistence(timeout: 10))
    composer.tap()
    composer.typeText("Family steer")
    app.buttons["native-e2e.send"].tap()
    try await waitForJournal(hostID: "primary", operationID: "route:thread-steer-set", count: 1)
  }

  func testPermissionFamilyResolvesOpenedRequest() async throws {
    try XCTSkipIf(
      peerMode == .real,
      "The permission family drives mock-only request-opened frame fixtures."
    )
    try await pairAndOpenFixtureThread()
    _ = try await control(path: "/v1/frames/runtime-live-request-opened", method: "POST")
    let allow = app.buttons["native-e2e.request.option.allow"]
    XCTAssertTrue(allow.waitForExistence(timeout: 15))
    allow.tap()
    try await waitForJournal(hostID: "primary", operationID: "route:request-resolve", count: 1)
  }

  func testTerminalKeystrokeFamilyWritesToPty() async throws {
    try await pairUntilHome()
    app.buttons["native-e2e.session-menu"].tap()
    let terminal = app.buttons["native-e2e.more.terminal"]
    XCTAssertTrue(terminal.waitForExistence(timeout: 5))
    terminal.tap()
    // Mock peer: the fixture project is named; real peer: pick the first
    // seeded project (the real host seeds `native-e2e-fixture`).
    let project: XCUIElement
    if peerMode == .real {
      let anyProject = app.buttons.matching(
        NSPredicate(format: "identifier BEGINSWITH 'native-e2e.terminal.project.'")
      ).firstMatch
      XCTAssertTrue(anyProject.waitForExistence(timeout: 10))
      project = anyProject
    } else {
      let fixtureProject = app.buttons["native-e2e.terminal.project.project-fixture-001"]
      XCTAssertTrue(fixtureProject.waitForExistence(timeout: 10))
      project = fixtureProject
    }
    project.tap()
    let field = app.textViews["native-e2e.terminal.input"]
    let fieldAlt = app.textFields["native-e2e.terminal.input"]
    XCTAssertTrue(field.waitForExistence(timeout: 15) || fieldAlt.waitForExistence(timeout: 1))
    let input = field.exists ? field : fieldAlt
    input.tap()
    input.typeText("echo family-pty")
    app.buttons["native-e2e.terminal.send"].tap()
    switch peerMode {
    case .mock:
      try await waitForJournal(hostID: "primary", operationID: "route:terminal-write", count: 1)
    case .real:
      try await waitForRealPeerReached()
    }
  }

  func testGitFamilyReachesHostFromWorkspace() async throws {
    try await pairUntilHome()
    app.buttons["native-e2e.session-menu"].tap()
    let projects = app.buttons["native-e2e.more.projects"]
    XCTAssertTrue(projects.waitForExistence(timeout: 5))
    projects.tap()
    let row = peerMode == .real
      ? app.buttons["native-e2e-fixture"]
      : app.buttons["Fixture Project"]
    XCTAssertTrue(row.waitForExistence(timeout: 10))
    row.tap()
    // The projects list keeps the full editor behind the row action sheet
    // (tap → sheet → "Project Settings"), not a direct row push.
    let editAction = app.buttons["Project Settings"]
    XCTAssertTrue(editAction.waitForExistence(timeout: 5))
    editAction.tap()
    let workspace = app.buttons["native-e2e.project.workspace"]
    XCTAssertTrue(workspace.waitForExistence(timeout: 10))
    workspace.tap()
    let gitMode = app.buttons["native-e2e.workspace.git"]
    if gitMode.waitForExistence(timeout: 5) {
      gitMode.tap()
    } else {
      app.buttons["Git"].firstMatch.tap()
    }
    // The segmented control can swallow the mode switch while the workspace
    // screen is still presenting; re-drive it once when the Git toolbar never
    // appears instead of failing on a stale Files screen.
    let gitToolbar = app.buttons["native-e2e.git.panel-menu"]
    if !gitToolbar.waitForExistence(timeout: 5) {
      let gitModeRetry = app.buttons["native-e2e.workspace.git"]
      if gitModeRetry.waitForExistence(timeout: 2) {
        gitModeRetry.tap()
      }
      XCTAssertTrue(gitToolbar.waitForExistence(timeout: 10), "The Git workspace never appeared")
    }
    if peerMode == .mock {
      // WireLab has no mutable repository. Prove the native Git workspace
      // reached the host through its real read procedures; the real-peer leg
      // below performs gitStageAll and the TS harness checks the index effect.
      for operationID in [
        "procedure:getGitStatus",
        "ws-client:git-state-interests",
      ] {
        try await waitForObservedOperation(hostID: "primary", operationID: operationID)
      }
      return
    }
    // The workspace git screen keeps its action panel behind the toolbar
    // ellipsis menu (→ "Git Operations"). The real peer has a live repo with
    // changes, so it drives the exact staging procedure the observable-effects
    // harness proves on the host side.
    let gitMenu = app.buttons["native-e2e.git.panel-menu"]
    if gitMenu.waitForExistence(timeout: 5) {
      gitMenu.tap()
      let gitOperations = app.buttons["Git Operations"]
      XCTAssertTrue(gitOperations.waitForExistence(timeout: 5))
      gitOperations.tap()
    }
    let actionIdentifier = "native-e2e.git.gitStageAll"
    var gitAction = await waitForHittableButton(identifier: actionIdentifier, timeout: 5)
    if gitAction == nil {
      let quickActions = app.buttons["Quick Actions"]
      XCTAssertTrue(quickActions.waitForExistence(timeout: 5))
      quickActions.tap()
      gitAction = await waitForHittableButton(identifier: actionIdentifier, timeout: 5)
    }
    guard let gitAction else {
      XCTFail("Git action never became hittable")
      return
    }
    await fulfillment(
      of: [XCTNSPredicateExpectation(
        predicate: NSPredicate(format: "enabled == true"), object: gitAction)],
      timeout: 15
    )
    XCTAssertTrue(gitAction.isEnabled, "Git action never became enabled")
    gitAction.tap()
    try await waitForRealPeerReached()
  }

  private func pairUntilHome() async throws {
    app.launch()
    if peerMode == .real, reusesRealPeerPairing {
      let homeReady = app.buttons["native-e2e.session-menu"]
      XCTAssertTrue(
        homeReady.waitForExistence(timeout: 20),
        "The preserved real-peer pairing did not return to Home"
      )
      return
    }
    XCTAssertTrue(revealPairingLinkField(timeout: 10).exists)
    let primaryPairing = try await pairingURL(hostID: "primary")
    try pastePairingURL(primaryPairing)
    try await confirmPairingIfNeeded()
    let homeReady: XCUIElement
    switch peerMode {
    case .mock:
      homeReady = app.buttons["native-e2e.thread.thread-fixture-001"]
    case .real:
      // The real host seeds no fixture thread; the project list is home.
      homeReady = app.buttons["native-e2e.session-menu"]
    }
    guard homeReady.waitForExistence(timeout: 20) else {
      throw FamilyJourneyError.pairingNeverReachedHome
    }
  }

  private func pairAndOpenFixtureThread() async throws {
    try await pairUntilHome()
    app.buttons["native-e2e.thread.thread-fixture-001"].tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 15))
  }

  private func confirmPairingIfNeeded() async throws {
    let confirm = app.buttons["native-e2e.pair.confirm"]
    if confirm.waitForExistence(timeout: 2) {
      confirm.tap()
      app.tap()
      return
    }
    let homeReady = peerMode == .real
      ? app.buttons["native-e2e.session-menu"]
      : app.buttons["native-e2e.thread.thread-fixture-001"]
    // Throw instead of asserting: an XCTAssert failure inside an async test
    // records the failure but does not unwind the method, so a stalled
    // pairing used to keep "passing" through every later step as a zombie.
    guard homeReady.waitForExistence(timeout: 18) else {
      throw FamilyJourneyError.pairingNeverReachedHome
    }
  }

  private func pairingURL(hostID: String) async throws -> URL {
    if peerMode == .real {
      // Pairing credentials are strictly single-use (the host rotates them on
      // every exchange), so every real-peer pairing mints a FRESH one-time
      // credential from the harness control plane. The startup env URL
      // (`NATIVE_E2E_PAIRING_URL`) is consumed by the first pairing; a runner
      // restart between family tests resets this suite's pairing-reuse
      // tracking, and replaying the consumed credential stalls the app on the
      // pairing sheet until the journey times out.
      let body = try await control(path: "/v1/real/pairing-url", method: "POST")
      guard let raw = body["pairingUrl"] as? String, let url = URL(string: raw), !raw.isEmpty
      else {
        throw FamilyJourneyError.invalidHarnessResponse
      }
      return url
    }
    let body = try await scenarioAction(["type": "pairing-url", "hostId": hostID])
    guard let raw = body["pairingUrl"] as? String, let url = URL(string: raw) else {
      throw FamilyJourneyError.invalidHarnessResponse
    }
    return url
  }

  /// Real-peer completion check: the production host has no scenario journal,
  /// so the journey asserts it drove a REAL peer (the observable PTY-echo and
  /// repo-index effects are asserted harness-side by
  /// `tests/native-e2e/realHostObservableEffects.test.ts`).
  private func waitForRealPeerReached() async throws {
    try await poll {
      let object = try await self.control(path: "/v1/state")
      return (object["mode"] as? String) == "real"
    }
  }

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
    submit.tap()
  }

  private func waitForJournal(hostID: String, operationID: String, count: Int) async throws {
    try await poll {
      let host = try await self.scenarioState().host(hostID)
      return host.operationJournal.filter { $0.operationId == operationID }.count >= count
    }
  }

  private func waitForObservedOperation(hostID: String, operationID: String) async throws {
    try await poll {
      try await self.scenarioState().host(hostID).observedOperationIds.contains(operationID)
    }
  }

  private func waitForHittableButton(
    identifier: String,
    timeout: TimeInterval
  ) async -> XCUIElement? {
    let deadline = Date().addingTimeInterval(timeout)
    repeat {
      if let button = app.buttons.matching(identifier: identifier).allElementsBoundByIndex
        .first(where: { $0.exists && $0.isHittable })
      {
        return button
      }
      try? await Task.sleep(for: .milliseconds(100))
    } while Date() < deadline
    return nil
  }

  private func poll(
    timeout: Duration = .seconds(20),
    condition: @escaping () async throws -> Bool
  ) async throws {
    let clock = ContinuousClock()
    let deadline = clock.now.advanced(by: timeout)
    while clock.now < deadline {
      if try await condition() { return }
      try await Task.sleep(for: .milliseconds(100))
    }
    throw FamilyJourneyError.timedOut
  }

  private func scenarioState() async throws -> FamilyScenarioState {
    let object = try await control(path: "/v1/scenario/state")
    let data = try JSONSerialization.data(withJSONObject: object)
    return try JSONDecoder().decode(FamilyScenarioState.self, from: data)
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
    else { throw FamilyJourneyError.invalidHarnessResponse }
    return object
  }
}

private enum FamilyJourneyError: Error {
  case invalidHarnessResponse
  case timedOut
  case missingHost
  case pairingNeverReachedHome
}

private struct FamilyScenarioState: Decodable {
  let hosts: [FamilyScenarioHost]
  func host(_ id: String) throws -> FamilyScenarioHost {
    guard let host = hosts.first(where: { $0.hostId == id }) else { throw FamilyJourneyError.missingHost }
    return host
  }
}

private struct FamilyScenarioHost: Decodable {
  let hostId: String
  let observedOperationIds: [String]
  let operationJournal: [FamilyWireOperation]
}

private struct FamilyWireOperation: Decodable {
  let operationId: String
}
