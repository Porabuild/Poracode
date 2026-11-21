import XCTest
import Vision

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

  let app = XCUIApplication()
  private var homeMoreButton: XCUIElement {
    app.buttons.matching(NSPredicate(format: "identifier IN %@", ["native-e2e.session-menu", "native-e2e.sidebar.more-tools"])).firstMatch
  }
  private var mockHomeReady: XCUIElement {
    app.buttons.matching(NSPredicate(format: "identifier IN %@", [
      "native-e2e.thread.thread-fixture-001", "native-e2e.split-empty-new-task",
      "native-e2e.session-menu", "native-e2e.sidebar.more-tools",
    ])).firstMatch
  }

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
    // `PairingLinkEntry.enter` reads the pasteboard into the app; the wire-lab
    // journey registers this interruption monitor before launch, so the
    // family journeys mirror it (the monitor fires on the UI interaction
    // that follows the alert, here the field tap in `PairingLinkEntry.enter`).
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
    _ = try await control(path: "/v1/reset", method: "POST")
    try await pairAndOpenFixtureThread()
    for fixture in [
      "runtime-live-turn-started", "runtime-live-user-item-started",
      "runtime-live-item-started", "runtime-live-content-delta",
    ] {
      _ = try await control(path: "/v1/frames/\(fixture)", method: "POST")
    }
    XCTAssertTrue(app.staticTexts["Native journey message"].waitForExistence(timeout: 10))
    let surfaceProof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    surfaceProof.name = "thread-message-surfaces"
    surfaceProof.lifetime = .keepAlways
    add(surfaceProof)
    let composerCollapsed = app.buttons["native-e2e.composer-collapsed"]
    XCTAssertTrue(composerCollapsed.waitForExistence(timeout: 10))
    composerCollapsed.tap()
    let composer = app.textViews["native-e2e.composer"]
    XCTAssertTrue(composer.waitForExistence(timeout: 10))
    composer.tap()
    composer.typeText("Family steer")
    app.buttons["native-e2e.send"].tap()
    try await waitForJournal(hostID: "primary", operationID: "route:thread-steer-set", count: 1)
  }

  func testCrossHostNavigationPresentsBeforeHandshakeAndIgnoresLateHostResponses() async throws {
    try XCTSkipUnless(ProcessInfo.processInfo.environment["NATIVE_E2E_HOST_NAVIGATION"] == "1",
      "This journey requires the two-host delayed-handshake QA peer.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/scenario/actions", method: "POST", body: ["type": "seed-multihost-collision"])
    try await pairUntilHome()
    if !homeMoreButton.isHittable, app.buttons["native-e2e.sidebar-toggle"].exists {
      app.buttons["native-e2e.sidebar-toggle"].tap()
    }
    homeMoreButton.tap()
    app.buttons["native-e2e.more.connections"].tap()
    let addConnection = app.buttons["native-e2e.connections.add"]
    XCTAssertTrue(addConnection.waitForExistence(timeout: 10)); addConnection.tap()
    let secondary = try await pairingURL(hostID: "collision-b")
    try PairingLinkEntry.enter(secondary, into: app)
    try await poll { !self.app.buttons["native-e2e.pair.submit"].exists }
    let back = app.navigationBars["Connections"].buttons["More"]
    if back.exists { back.tap() }
    let done = app.buttons["native-e2e.more.close"]
    XCTAssertTrue(done.waitForExistence(timeout: 10)); done.tap()
    if UIDevice.current.userInterfaceIdiom == .pad {
      let project = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@",
        "native-e2e.home-project.", "Empty Navigation Project A")).firstMatch
      XCTAssertTrue(project.waitForExistence(timeout: 10))
      _ = try await control(path: "/v1/navigation/hold-a", method: "POST")
      project.tap()
      let pendingProject = app.descendants(matching: .any).matching(identifier: "native-e2e.project-connecting").firstMatch
      XCTAssertTrue(pendingProject.waitForExistence(timeout: 5))
      XCTAssertFalse(app.staticTexts["No conversations yet"].exists)
      let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      proof.name = "host-project-before-handshake"; proof.lifetime = .keepAlways; add(proof)
      _ = try await control(path: "/v1/navigation/release-a", method: "POST")
      XCTAssertTrue(app.staticTexts["No conversations yet"].waitForExistence(timeout: 15))
    }
    let current = navigationHostThread(label: "Native E2E Collision Host B")
    revealNavigationThread(current)
    XCTAssertTrue(current.waitForExistence(timeout: 10)); current.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 15))
    let baseline = try await control(path: "/v1/navigation/state")
    _ = try await control(path: "/v1/navigation/hold-a", method: "POST")
    let a = navigationHostThread(label: "Navigation Host A")
    revealNavigationThread(a)
    XCTAssertTrue(a.waitForExistence(timeout: 10)); a.tap()
    let connecting = app.descendants(matching: .any).matching(identifier: "native-e2e.thread-connecting").firstMatch
    XCTAssertTrue(connecting.waitForExistence(timeout: 5), "The destination must appear while its environment response is held")
    let title = app.buttons["native-e2e.thread-status"].firstMatch
    XCTAssertTrue(title.label.contains("Navigation Host A"))
    XCTAssertFalse(app.staticTexts["Fixture response"].exists)
    XCTAssertFalse(app.staticTexts["This session is read-only."].exists)
    let held = try await control(path: "/v1/navigation/state")
    XCTAssertGreaterThan(held["heldEnvironmentCount"] as? Int ?? 0, 0)
    XCTAssertEqual(held["aHistoryReads"] as? Int, baseline["aHistoryReads"] as? Int)
    // Requests queued for B before the host changed may still finish. Once
    // A is installed, repeated navigation must not read from either host
    // until A's handshake authorizes its history reads.
    revealNavigationThread(a)
    a.tap()
    XCTAssertTrue(connecting.waitForExistence(timeout: 5))
    let repeated = try await control(path: "/v1/navigation/state")
    XCTAssertEqual(repeated["aHistoryReads"] as? Int, held["aHistoryReads"] as? Int)
    XCTAssertEqual(repeated["bHistoryReads"] as? Int, held["bHistoryReads"] as? Int)
    let early = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    early.name = "host-navigation-before-handshake"; early.lifetime = .keepAlways; add(early)
    let b = navigationHostThread(label: "Native E2E Collision Host B")
    revealNavigationThread(b)
    XCTAssertTrue(b.waitForExistence(timeout: 10)); b.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 15))
    _ = try await control(path: "/v1/navigation/release-a", method: "POST")
    try await poll {
      let state = try await self.control(path: "/v1/navigation/state")
      return state["heldEnvironmentCount"] as? Int == 0
        && (state["aEnvironmentResponses"] as? Int ?? 0) > (held["aEnvironmentResponses"] as? Int ?? 0)
    }
    XCTAssertTrue(title.label.contains("Native E2E Collision Host B"))
    XCTAssertFalse(connecting.exists)
    let final = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    final.name = "host-navigation-latest-selection"; final.lifetime = .keepAlways; add(final)
    _ = try await control(path: "/v1/navigation/hold-a", method: "POST")
    let terminal = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@",
      "native-e2e.thread.", "Navigation terminal")).firstMatch
    revealNavigationThread(terminal)
    XCTAssertTrue(terminal.waitForExistence(timeout: 10)); terminal.tap()
    XCTAssertTrue(connecting.waitForExistence(timeout: 5))
    XCTAssertFalse(app.staticTexts["Disconnected"].exists)
    let terminalProof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    terminalProof.name = "host-terminal-before-handshake"; terminalProof.lifetime = .keepAlways; add(terminalProof)
    _ = try await control(path: "/v1/navigation/release-a", method: "POST")
    XCTAssertTrue(app.buttons["native-e2e.terminal.send"].waitForExistence(timeout: 15))
    XCTAssertTrue(app.staticTexts["Connected"].waitForExistence(timeout: 10))
    XCTAssertFalse(connecting.exists)
    revealNavigationThread(b)
    XCTAssertTrue(b.waitForExistence(timeout: 10)); b.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 15))
    _ = try await control(path: "/v1/navigation/hold-a", method: "POST")
    revealNavigationThread(a)
    XCTAssertTrue(a.waitForExistence(timeout: 10)); a.tap()
    XCTAssertTrue(connecting.waitForExistence(timeout: 5))
    _ = try await control(path: "/v1/navigation/release-a", method: "POST")
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 15),
      "A successful handshake must reload the early-presented GUI transcript")
    XCTAssertTrue(title.label.contains("Navigation Host A"))
    XCTAssertFalse(connecting.exists)
    let ready = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    ready.name = "host-navigation-connected-transcript"; ready.lifetime = .keepAlways; add(ready)

    app.typeKey(.tab, modifierFlags: .control)
    try await poll { title.label.contains("Native E2E Collision Host B") && !connecting.exists }
    XCTAssertTrue(title.label.contains("Fixture thread"), title.label)
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 15))
    app.typeKey(.tab, modifierFlags: [.control, .shift])
    try await poll { title.label.contains("Navigation Host A") && !connecting.exists }
    XCTAssertTrue(title.label.contains("Fixture thread"), title.label)
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 15))
  }

  func testPairedHostsUpdateTheSidebarWithoutSwitchingThreads() async throws {
    try XCTSkipUnless(ProcessInfo.processInfo.environment["NATIVE_E2E_LIVE_PAIRED_CATALOG"] == "1",
      "This journey requires the two-host catalog fixture.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/scenario/actions", method: "POST", body: ["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()

    let secondary = navigationHostThread(label: "Navigation Host A")
    let selected = navigationHostThread(label: "Native E2E Collision Host B")
    revealNavigationThread(selected)
    XCTAssertTrue(selected.waitForExistence(timeout: 10)); selected.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 15))
    revealNavigationThread(secondary)
    XCTAssertTrue(secondary.waitForExistence(timeout: 10))
    XCTAssertNotEqual(secondary.value as? String, "Working")
    XCTAssertNotEqual(selected.value as? String, "Working")

    _ = try await control(path: "/v1/navigation/working-on-both", method: "POST")
    try await poll { selected.value as? String == "Working" }
    try await poll { secondary.value as? String == "Working" }
    XCTAssertTrue(app.buttons["native-e2e.thread-status"].firstMatch.label.contains("Native E2E Collision Host B"))
    let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    proof.name = "host-pair-live-catalog"
    proof.lifetime = .keepAlways
    add(proof)
  }

  func testThreadNavigationAndTerminalAcrossDuoDisplays() async throws {
    try XCTSkipUnless(peerMode == .mock &&
      ProcessInfo.processInfo.environment["NATIVE_E2E_DUO_TRANSITION_URL"] != nil,
      "This journey requires a disposable Duo and two fixture desktops.")
    applyFixtureAppearance()
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    _ = try await control(path: "/v1/checkpoints/terminal-thread-ready", method: "POST")
    try await pairBothFixtureHosts()

    let filter = app.descendants(matching: .any).matching(identifier: "native-e2e.project-filter").firstMatch
    XCTAssertTrue(filter.waitForExistence(timeout: 8) && filter.isHittable)
    utilityProof("duo-home-filter")

    let chat = navigationHostThread(label: "Native E2E Collision Host B")
    revealNavigationThread(chat)
    XCTAssertTrue(chat.waitForExistence(timeout: 10)); chat.tap()
    let reply = app.staticTexts["Fixture response"].firstMatch
    XCTAssertTrue(reply.waitForExistence(timeout: 15))
    let actions = app.descendants(matching: .any).matching(identifier: "native-e2e.thread.actions").firstMatch
    let inspector = app.buttons["native-e2e.inspector-toggle"].firstMatch
    let title = app.buttons["native-e2e.thread-status"].firstMatch
    try await assertNativeDuoDisplayTransitions("thread-controls", content: reply, availableAction: actions) { pose in
      XCTAssertTrue(title.label.contains("Native E2E Collision Host B"), pose)
      if pose == "inner" {
        try await self.poll { inspector.exists && inspector.isHittable }
        try await self.tapNativeToolbarActionAfterDisplayTransition(inspector)
        let info = self.app.buttons["native-e2e.inspector.tab.info"].firstMatch
        try await self.poll { info.exists && info.isHittable }
        try await self.tapNativeToolbarActionAfterDisplayTransition(inspector)
        try await self.poll { !info.isHittable }
      }
      if inspector.exists && inspector.isHittable {
        XCTAssertFalse(inspector.frame.intersects(actions.frame), pose)
        XCTAssertEqual(inspector.frame.height, actions.frame.height, accuracy: 2, pose)
      }
      try await self.tapNativeToolbarActionAfterDisplayTransition(actions)
      let find = self.app.buttons["Find in chat"].firstMatch
      try await self.poll { find.exists && find.isHittable }
      try await self.tapNativeToolbarActionAfterDisplayTransition(find)
      let close = self.app.buttons["native-e2e.chat-find-close"].firstMatch
      try await self.poll { close.exists && close.isHittable }
      try await self.tapNativeToolbarActionAfterDisplayTransition(close)
      try await self.poll { !close.exists && reply.exists }
    }

    let terminal = navigationHostThread(label: "Navigation Host A")
    let back = app.descendants(matching: .any).matching(identifier: "BackButton").firstMatch
    XCTAssertTrue(back.waitForExistence(timeout: 5) && back.isHittable)
    try await tapNativeToolbarActionAfterDisplayTransition(back)
    XCTAssertTrue(terminal.waitForExistence(timeout: 10)); terminal.tap()
    XCTAssertTrue(app.staticTexts["Connected"].waitForExistence(timeout: 15))
    let input = app.textViews["native-e2e.terminal.input"].firstMatch
    let send = app.buttons["native-e2e.terminal.send"].firstMatch
    let output = app.descendants(matching: .any).matching(
      NSPredicate(format: "label == %@", "Terminal output")
    ).firstMatch
    XCTAssertTrue(input.waitForExistence(timeout: 8))
    XCTAssertTrue(title.label.contains("Navigation Host A"))
    try await poll { (output.value as? String)?.contains("hello world") == true }
    try assertTerminalCanvasFollowsFixtureAppearance(output)
    utilityProof("duo-agent-terminal-initial")
    try await assertNativeDuoDisplayTransitions("agent-terminal", content: input, availableAction: nil) { _ in
      try await self.poll {
        title.label.contains("Navigation Host A")
          && self.app.staticTexts["Connected"].exists
          && send.exists && input.isHittable
          && (output.value as? String)?.contains("hello world") == true
      }
    }
    try await tapNativeToolbarActionAfterDisplayTransition(input)
    input.typeText("echo duo-terminal")
    XCTAssertEqual(input.value as? String, "echo duo-terminal")
    try await tapNativeToolbarActionAfterDisplayTransition(send)
    try await waitForJournal(hostID: "primary", operationID: "route:terminal-write", count: 1)
    let wrongDesktopWrites = try await journalCount(hostID: "collision-b", operationID: "route:terminal-write")
    XCTAssertEqual(wrongDesktopWrites, 0)
  }

  func testIPadThreadToolbarKeepsInspectorAndActionsReachable() async throws {
    try XCTSkipUnless(UIDevice.current.userInterfaceIdiom == .pad && peerMode == .mock)
    applyFixtureAppearance()
    XCUIDevice.shared.orientation = .landscapeLeft
    _ = try await control(path: "/v1/reset", method: "POST")
    try await pairUntilHome()

    let filter = app.buttons["native-e2e.project-filter"].firstMatch
    XCTAssertTrue(filter.waitForExistence(timeout: 8) && filter.isHittable)
    let thread = app.buttons["native-e2e.thread.thread-fixture-001"].firstMatch
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 8)); thread.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 15))

    let sidebar = app.buttons["native-e2e.sidebar-toggle"].firstMatch
    let inspector = app.buttons["native-e2e.inspector-toggle"].firstMatch
    let actions = app.buttons["native-e2e.thread.actions"].firstMatch
    try await poll { sidebar.isHittable && inspector.isHittable && actions.isHittable }
    XCTAssertEqual(inspector.frame.height, actions.frame.height, accuracy: 2)
    XCTAssertEqual(sidebar.frame.height, inspector.frame.height, accuracy: 2)
    XCTAssertGreaterThanOrEqual(filter.frame.height, 44)
    XCTAssertFalse(inspector.frame.intersects(actions.frame))
    utilityProof("ipad-thread-toolbar")

    inspector.tap()
    let info = app.buttons["native-e2e.inspector.tab.info"].firstMatch
    try await poll { info.exists && info.isHittable }
    inspector.tap()
    try await poll { !info.isHittable }
    filter.tap()
    let closeFilters = app.buttons["native-e2e.project-filter.done"].firstMatch
    try await poll { closeFilters.exists && closeFilters.isHittable }
    closeFilters.tap()
    try await poll { !closeFilters.exists && actions.isHittable }
    actions.tap()
    XCTAssertTrue(app.buttons["Find in chat"].firstMatch.waitForExistence(timeout: 5))
  }

  func testIPadAgentTerminalFollowsAppAppearance() async throws {
    try XCTSkipUnless(UIDevice.current.userInterfaceIdiom == .pad && peerMode == .mock)
    applyFixtureAppearance()
    XCUIDevice.shared.orientation = .landscapeLeft
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/terminal-thread-ready", method: "POST")
    try await pairUntilHome()

    let thread = app.buttons["native-e2e.thread.thread-fixture-001"].firstMatch
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 8)); thread.tap()
    let output = app.descendants(matching: .any).matching(
      NSPredicate(format: "label == %@", "Terminal output")
    ).firstMatch
    XCTAssertTrue(app.staticTexts["Connected"].waitForExistence(timeout: 15))
    try await poll { (output.value as? String)?.contains("hello world") == true }
    try assertTerminalCanvasFollowsFixtureAppearance(output)
    utilityProof("ipad-agent-terminal-appearance")
  }

  private func assertTerminalCanvasFollowsFixtureAppearance(_ output: XCUIElement) throws {
    guard let appearance = ProcessInfo.processInfo.environment["NATIVE_E2E_INTERFACE_STYLE"],
      appearance == "light" || appearance == "dark"
    else { return }
    let image = try XCTUnwrap(UIImage(data: output.screenshot().pngRepresentation)?.cgImage)
    let center = CGRect(x: image.width / 2, y: image.height / 2, width: 1, height: 1)
    let sample = try XCTUnwrap(image.cropping(to: center))
    var pixel = [UInt8](repeating: 0, count: 4)
    try pixel.withUnsafeMutableBytes { bytes in
      let context = try XCTUnwrap(CGContext(
        data: bytes.baseAddress, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
        space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
      ))
      context.draw(sample, in: CGRect(x: 0, y: 0, width: 1, height: 1))
    }
    let brightness = pixel.prefix(3).map(Double.init).reduce(0, +) / (3 * 255)
    if appearance == "light" {
      XCTAssertGreaterThan(brightness, 0.75, "Light terminal canvas RGB \(pixel.prefix(3))")
    } else {
      XCTAssertLessThan(brightness, 0.25, "Dark terminal canvas RGB \(pixel.prefix(3))")
    }
  }

  func testWorkspaceChangesStayLocalThroughBothDesktopCatalogUpdates() async throws {
    try XCTSkipUnless(ProcessInfo.processInfo.environment["NATIVE_E2E_WORKSPACE_EDIT_FIXTURE"] == "1",
      "This journey requires the two-host workspace editing fixture.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()
    try openNativeSettingsPage("native-e2e.settings.workspaces")

    let add = app.buttons["native-e2e.workspaces.add"].firstMatch
    XCTAssertTrue(add.waitForExistence(timeout: 8) && add.isHittable && add.isEnabled)
    assertNativeDuoToolbarRail(add)
    utilityProof("workspace-settings-toolbar")
    add.tap()
    let alert = app.alerts.firstMatch
    let name = alert.textFields.firstMatch
    XCTAssertTrue(name.waitForExistence(timeout: 5)); name.tap()
    let newWorkspace = "Studio Scratch"
    name.typeText(newWorkspace)
    XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
    try await assertDraftSurvivesDisplayTransitions("workspace-name", field: name, value: newWorkspace)
    let save = alert.buttons["Save"].firstMatch
    XCTAssertTrue(save.isHittable && save.isEnabled); save.tap()
    let created = app.buttons[newWorkspace].firstMatch
    XCTAssertTrue(created.waitForExistence(timeout: 5))
    XCTAssertTrue(created.isSelected)

    let work = app.buttons["native-e2e.workspaces.row.work"].firstMatch
    XCTAssertTrue(work.waitForExistence(timeout: 5)); work.tap()
    XCTAssertTrue(name.waitForExistence(timeout: 5)); name.tap()
    try await pressNativeE2EShortcut("a", modifiers: .command)
    let renamed = "Studio Main"
    name.typeText(renamed)
    XCTAssertEqual(name.value as? String, renamed)
    save.tap()
    try await poll { work.exists && work.label == renamed }

    _ = try await control(path: "/v1/navigation/workspace-catalog-refresh", method: "POST")
    let list = app.collectionViews.containing(.button, identifier: work.identifier).firstMatch
    for _ in 0..<4 where !app.staticTexts["Refreshed Project B"].exists { list.swipeUp() }
    XCTAssertTrue(app.staticTexts["Refreshed Project A"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["Refreshed Project B"].waitForExistence(timeout: 10))
    for _ in 0..<4 where !work.isHittable { list.swipeDown() }
    XCTAssertEqual(work.label, renamed)
    XCTAssertFalse(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label == %@",
      "native-e2e.workspaces.row.", "Work")).firstMatch.exists)
    utilityProof("workspace-settings-kept-after-refresh")

    let actions = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ AND value == %@",
      "native-e2e.workspaces.actions.", newWorkspace)).firstMatch
    XCTAssertTrue(actions.waitForExistence(timeout: 5)); actions.tap()
    let delete = app.buttons["Delete workspace"]
    XCTAssertTrue(delete.firstMatch.waitForExistence(timeout: 5)); delete.firstMatch.tap()
    let confirm = app.buttons.matching(identifier: "Delete workspace").allElementsBoundByIndex
      .first(where: { $0.isHittable })
    try XCTUnwrap(confirm).tap()
    try await poll { !self.app.buttons[newWorkspace].firstMatch.exists }
    XCTAssertTrue(work.isSelected)
    for host in ["primary", "collision-b"] {
      let writes = try await journalCount(hostID: host, operationID: "route:project-command")
      XCTAssertEqual(writes, 0)
    }
    utilityProof("workspace-settings-removed")
  }

  func testCompactUtilitiesHonorWorkspaceAndReturnToTheOriginalHost() async throws {
    try XCTSkipUnless(ProcessInfo.processInfo.environment["NATIVE_E2E_WORKSPACE_UTILITIES"] == "1",
      "This journey requires the workspace utility fixture.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad
      ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/scenario/actions", method: "POST", body: ["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()
    let thread = navigationHostThread(label: "Navigation Host A")
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 15))

    if UIDevice.current.userInterfaceIdiom == .pad {
      openFixtureMore()
    } else {
      openCompactThreadWorkspaceTools()
    }
    let schedules = app.buttons["native-e2e.more.shortcut.schedules"]
    XCTAssertTrue(schedules.waitForExistence(timeout: 5)); schedules.tap()
    XCTAssertTrue(app.staticTexts["Work schedule A"].waitForExistence(timeout: 15))
    XCTAssertFalse(app.staticTexts["Side schedule A"].exists)

    let hostPicker = app.buttons["Switch desktop"]
    XCTAssertTrue(hostPicker.waitForExistence(timeout: 5)); hostPicker.tap()
    let hostB = app.buttons["Native E2E Collision Host B"]
    XCTAssertTrue(hostB.waitForExistence(timeout: 5)); hostB.tap()
    XCTAssertTrue(app.staticTexts["Work schedule B"].waitForExistence(timeout: 15))
    XCTAssertFalse(app.staticTexts["Work schedule A"].exists)
    XCTAssertFalse(app.staticTexts["Side schedule B"].exists)
    utilityProof("utility-workspace-schedules-on-host-b")

    let create = app.buttons["native-e2e.schedules.create"]
    XCTAssertTrue(create.waitForExistence(timeout: 5))
    assertNativeDuoToolbarRail(create)
    try await exerciseUtilityFold(
      "schedules", action: create, content: app.staticTexts["Work schedule B"],
      retainingMenuItem: "Create with Agent"
    )
    create.tap()
    let createWithAgent = app.buttons["Create with Agent"]
    XCTAssertTrue(createWithAgent.waitForExistence(timeout: 5)); createWithAgent.tap()
    let compose = app.navigationBars["Create with Agent"]
    XCTAssertTrue(compose.waitForExistence(timeout: 5))
    let prompt = app.textViews["native-e2e.new-thread-prompt"]
    XCTAssertTrue(prompt.waitForExistence(timeout: 5))
    utilityProof("utility-workspace-schedule-composer")
    let correctProject = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@",
      "Work Project B", "Native E2E Collision Host B")).firstMatch
    XCTAssertTrue(correctProject.waitForExistence(timeout: 5))
    compose.descendants(matching: .any).matching(identifier: "Cancel").firstMatch.tap()

    tapNativeSettingsBack(from: "Schedules", to: "More")
    let pullRequests = app.buttons["native-e2e.more.shortcut.pullRequests"]
    XCTAssertTrue(pullRequests.waitForExistence(timeout: 5)); pullRequests.tap()
    try await poll {
      let state = try await self.control(path: "/v1/navigation/state")
      return (state["prReads"] as? [String] ?? []).contains("b:/work-b")
    }
    let state = try await control(path: "/v1/navigation/state")
    let reads = try XCTUnwrap(state["prReads"] as? [String])
    XCTAssertEqual(Set(reads), ["b:/work-b"])
    let filter = app.buttons["native-e2e.pull-requests.filter"]
    let refresh = app.buttons["native-e2e.pull-requests.refresh"]
    try await poll { filter.isEnabled && refresh.isEnabled }
    assertNativeDuoToolbarRail(filter)
    assertNativeDuoToolbarRail(refresh)
    filter.tap()
    let workProject = app.buttons["Work Project B"]
    XCTAssertTrue(workProject.waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons["Side Project B"].exists)
    workProject.tap()
    try await exerciseUtilityFold(
      "pull-requests", action: filter, content: refresh, retainingMenuItem: "Show all"
    )
    filter.tap()
    let showAll = app.buttons["Show all"]
    XCTAssertTrue(showAll.waitForExistence(timeout: 5))
    showAll.tap()
    let beforeRefresh = try await control(path: "/v1/navigation/state")
    let readsBeforeRefresh = try XCTUnwrap(beforeRefresh["prReads"] as? [String]).count
    refresh.tap()
    try await poll {
      let refreshed = try await self.control(path: "/v1/navigation/state")
      return (refreshed["prReads"] as? [String] ?? []).count > readsBeforeRefresh
    }
    let refreshed = try await control(path: "/v1/navigation/state")
    XCTAssertEqual(Set(refreshed["prReads"] as? [String] ?? []), ["b:/work-b"])
    utilityProof("utility-workspace-pull-requests-on-host-b")

    tapNativeSettingsBack(from: "Pull requests", to: "More")
    app.descendants(matching: .any).matching(identifier: "native-e2e.more.close").firstMatch.tap()
    let title = app.buttons["native-e2e.thread-status"].firstMatch
    try await poll { title.label.contains("Fixture thread") && title.label.contains("Navigation Host A") }
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 15))
    utilityProof("utility-returned-to-original-thread")
  }

  private func exerciseUtilityFold(
    _ screen: String, action: XCUIElement, content: XCUIElement, retainingMenuItem menuItemTitle: String
  ) async throws {
    guard let driver = ProcessInfo.processInfo.environment["NATIVE_E2E_DUO_TRANSITION_URL"] else {
      return
    }
    func command(_ path: String) async throws {
      let url = try XCTUnwrap(URL(string: "\(driver)/\(path)"))
      let (_, response) = try await URLSession.shared.data(from: url)
      XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, path)
    }
    let outerWidth = app.frame.width
    for pose in ["inner", "partial", "outer"] {
      try await command("move/\(pose)")
      var previousFrame: CGRect?
      try await poll {
        let display = self.app.frame
        let resized = pose == "outer" ? display.width == outerWidth : display.width > outerWidth
        guard resized, action.exists, action.isEnabled, content.exists else { return false }
        let frame = action.frame
        defer { previousFrame = frame }
        return frame == previousFrame && !frame.isEmpty
          && display.contains(frame) && frame.midY > display.midY
      }
      try await command("capture/\(screen)-\(pose)")
      let display = app.frame
      let frame = action.frame
      let x = Int((frame.midX - display.minX).rounded())
      let y = Int((frame.midY - display.minY).rounded())
      try await command("tap/\(x)/\(y)")
      try await command("capture/\(screen)-menu-\(pose)")
      let item = app.descendants(matching: .any).matching(identifier: menuItemTitle).firstMatch
      XCTAssertTrue(item.waitForExistence(timeout: 5), "\(screen) menu in the \(pose) pose")
      try await command("tap/\(Int(display.width * 0.21))/\(Int(display.height * 0.34))")
      try await poll { !item.exists }
    }
    assertNativeDuoToolbarRail(action)
  }

  func testWorkflowDispatchToolbarPreservesTheProjectAndDraftAcrossDisplays() async throws {
    try XCTSkipUnless(peerMode == .mock &&
      ProcessInfo.processInfo.environment["NATIVE_E2E_ACTION_DISPATCH_FIXTURE"] == "1",
      "This journey dispatches only to a disposable GitHub Actions peer.")
    let isPad = UIDevice.current.userInterfaceIdiom == .pad
    XCUIDevice.shared.orientation = isPad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/scenario/actions", method: "POST", body: ["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()
    let thread = navigationHostThread(label: "Navigation Host A")
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 15))
    let draft = "Keep the GitHub Actions draft"
    try await enterWorkspaceDraft(draft)
    if isPad { openFixtureMore() } else { openCompactThreadWorkspaceTools() }
    let actions = app.buttons["native-e2e.more.shortcut.githubActions"]
    XCTAssertTrue(actions.waitForExistence(timeout: 5)); actions.tap()
    let project = app.staticTexts["Work Project B"]
    XCTAssertTrue(project.waitForExistence(timeout: 10)); project.tap()
    let workflow = app.staticTexts["WORK-B Build"]
    XCTAssertTrue(workflow.waitForExistence(timeout: 10)); workflow.tap()
    let run = app.buttons["native-e2e.github-actions.run-workflow"]
    let refresh = app.buttons["native-e2e.github-actions.refresh-runs"]
    XCTAssertTrue(run.waitForExistence(timeout: 10))
    try await poll { run.isEnabled && refresh.isEnabled }
    assertNativeDuoToolbarRail(run)
    assertNativeDuoToolbarRail(refresh)
    utilityProof("actions-workflow-tools")

    func actionState() async throws -> [String: Any] {
      try await control(path: "/v1/navigation/state")
    }
    let reads = try await actionState()["actionsReads"] as? [String] ?? []
    refresh.tap()
    try await poll {
      let state = try await self.control(path: "/v1/navigation/state")
      return (state["actionsReads"] as? [String] ?? []).count > reads.count
    }
    try await poll { run.isEnabled && refresh.isEnabled }
    run.tap()
    let ref = app.textFields["native-e2e.github-actions.dispatch-ref"]
    let target = app.textFields["native-e2e.github-actions.dispatch-input.target"]
    let submit = app.descendants(matching: .any)
      .matching(identifier: "native-e2e.github-actions.dispatch-submit").firstMatch
    XCTAssertTrue(target.waitForExistence(timeout: 5))
    XCTAssertEqual(ref.value as? String, "main")
    XCTAssertFalse(submit.isEnabled)
    XCTAssertTrue(app.staticTexts["Complete the required inputs."].exists)
    target.tap()
    target.typeText("  QA target  ")
    try await poll { submit.isEnabled }
    utilityProof("actions-dispatch-filled")
    if let driver = ProcessInfo.processInfo.environment["NATIVE_E2E_DUO_TRANSITION_URL"] {
      let outerWidth = app.frame.width
      for pose in ["inner", "partial", "outer"] {
        for endpoint in ["move/\(pose)", "capture/dispatch-\(pose)"] {
          if endpoint.hasPrefix("capture") {
            try await poll {
              let width = self.app.frame.width
              return (pose == "outer" ? width == outerWidth : width > outerWidth)
                && target.exists && target.value as? String == "  QA target  " && submit.isEnabled
            }
          }
          let url = try XCTUnwrap(URL(string: "\(driver)/\(endpoint)"))
          let (_, response) = try await URLSession.shared.data(from: url)
          XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, endpoint)
        }
      }
    }
    let beforeSubmit = try await actionState()
    XCTAssertEqual((beforeSubmit["dispatches"] as? [[String: Any]])?.count, 0)
    submit.tap()
    try await poll { !target.exists }
    let state = try await actionState()
    let dispatches = try XCTUnwrap(state["dispatches"] as? [[String: Any]])
    XCTAssertEqual(dispatches.count, 1)
    XCTAssertEqual(dispatches.first?["host"] as? String, "b")
    XCTAssertEqual(dispatches.first?["path"] as? String, "/work-b")
    XCTAssertEqual(dispatches.first?["workflowId"] as? Int, 1)
    XCTAssertEqual(dispatches.first?["ref"] as? String, "main")
    XCTAssertEqual(dispatches.first?["inputs"] as? [String: String], ["target": "QA target"])
    let scopedReads = try XCTUnwrap(state["actionsReads"] as? [String])
    XCTAssertTrue(scopedReads.contains("b:/work-b:ghListWorkflowRuns:1"))
    XCTAssertTrue(scopedReads.allSatisfy { $0.hasPrefix("b:/work-b:") })

    tapNativeSettingsBack(from: "WORK-B Build", to: "GitHub Actions")
    tapNativeSettingsBack(from: "GitHub Actions", to: "GitHub Actions")
    tapNativeSettingsBack(from: "GitHub Actions", to: "More")
    app.descendants(matching: .any).matching(identifier: "native-e2e.more.close").firstMatch.tap()
    let title = app.buttons["native-e2e.thread-status"].firstMatch
    try await poll { title.label.contains("Navigation Host A") }
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 10))
    try await assertWorkspaceDraft(draft)
    utilityProof("actions-dispatch-original-thread")
  }

  func testProjectAndPortFormsStayWithTheirDesktopAcrossDisplays() async throws {
    try XCTSkipUnless(peerMode == .mock &&
      ProcessInfo.processInfo.environment["NATIVE_E2E_PROJECT_PORT_FIXTURE"] == "1",
      "This journey modifies only disposable project and port fixtures.")
    let isPad = UIDevice.current.userInterfaceIdiom == .pad
    XCUIDevice.shared.orientation = isPad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/scenario/actions", method: "POST", body: ["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()
    let thread = navigationHostThread(label: "Navigation Host A")
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 15))
    if isPad { openFixtureMore() } else { openCompactThreadWorkspaceTools() }

    app.buttons["native-e2e.more.projects"].tap()
    let manage = app.buttons["Manage projects"]
    XCTAssertTrue(manage.waitForExistence(timeout: 5)); manage.tap()
    let picker = app.buttons["Switch desktop"]
    XCTAssertTrue(picker.waitForExistence(timeout: 5)); picker.tap()
    let hostB = app.buttons["Native E2E Collision Host B"]
    XCTAssertTrue(hostB.waitForExistence(timeout: 5)); hostB.tap()
    let project = app.buttons["Work Project B"]
    XCTAssertTrue(project.waitForExistence(timeout: 10))
    let add = app.buttons["native-e2e.projects.add"]
    XCTAssertTrue(add.waitForExistence(timeout: 5) && add.isEnabled)
    assertNativeDuoToolbarRail(add)
    utilityProof("utility-project-management-toolbar")
    add.tap()
    let path = app.textFields["native-e2e.projects.creation.path"]
    XCTAssertTrue(path.waitForExistence(timeout: 5))
    let projectPath = "/fixture/new-project"
    path.tap()
    path.typeText(projectPath)
    try await assertDraftSurvivesDisplayTransitions("project", field: path, value: projectPath)
    let submit = app.descendants(matching: .any)
      .matching(identifier: "native-e2e.projects.creation.submit").firstMatch
    XCTAssertTrue(submit.isEnabled); submit.tap()
    try await poll { !path.exists }
    let close = app.descendants(matching: .any)
      .matching(identifier: "native-e2e.projects.management.close").firstMatch
    XCTAssertTrue(close.waitForExistence(timeout: 5)); close.tap()
    tapNativeSettingsBack(from: "Projects", to: "More")

    let ports = app.buttons["Ports"]
    XCTAssertTrue(ports.waitForExistence(timeout: 5)); ports.tap()
    let scan = app.buttons["port-forwarding.scan"]
    let manual = app.buttons["port-forwarding.manual"]
    try await poll { scan.exists && scan.isEnabled && manual.isEnabled }
    assertNativeDuoToolbarRail(scan)
    assertNativeDuoToolbarRail(manual)
    utilityProof("utility-ports-toolbar")
    let scanned = try await control(path: "/v1/navigation/state")
    let previous = (scanned["portReads"] as? [String] ?? []).count
    scan.tap()
    try await poll {
      let state = try await self.control(path: "/v1/navigation/state")
      return (state["portReads"] as? [String] ?? []).count > previous
    }

    manual.tap()
    let alert = app.alerts.firstMatch
    let port = alert.textFields.firstMatch
    let forward = alert.buttons["Forward"]
    XCTAssertTrue(port.waitForExistence(timeout: 5))
    XCTAssertFalse(forward.isEnabled)
    port.tap()
    port.typeText("4321")
    try await assertDraftSurvivesDisplayTransitions("port", field: port, value: "4321")
    XCTAssertTrue(forward.isEnabled)
    forward.tap()
    try await poll {
      let state = try await self.control(path: "/v1/navigation/state")
      return (state["portWrites"] as? [String] ?? []).contains("b:4321")
    }
    let writes = try await control(path: "/v1/navigation/state")
    XCTAssertEqual(writes["projectWrites"] as? [String], ["b:\(projectPath)"])
    XCTAssertEqual(writes["portWrites"] as? [String], ["b:4321"])
    XCTAssertEqual(Set(writes["portReads"] as? [String] ?? []), ["b"])
    tapNativeSettingsBack(from: "Ports", to: "More")
    app.descendants(matching: .any).matching(identifier: "native-e2e.more.close").firstMatch.tap()
    let title = app.buttons["native-e2e.thread-status"].firstMatch
    try await poll { title.label.contains("Navigation Host A") }
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 10))
  }

  func testRealPortForwardCarriesTrafficAndCanBeStoppedFromPorts() async throws {
    let environment = ProcessInfo.processInfo.environment
    try XCTSkipUnless(peerMode == .real && environment["NATIVE_E2E_LIVE_PORT_PROBE"] != nil,
      "This journey requires the isolated real host and its loopback HTTP service.")
    let port = try XCTUnwrap(environment["NATIVE_E2E_LIVE_PORT_TARGET"])
    let probe = try XCTUnwrap(environment["NATIVE_E2E_LIVE_PORT_PROBE"].flatMap(URL.init(string:)))
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    try await pairUntilHome()
    openFixtureMore()
    let ports = app.buttons["Ports"].firstMatch
    XCTAssertTrue(ports.waitForExistence(timeout: 8)); ports.tap()
    let detected = app.buttons["port-forwarding.start.\(port)"].firstMatch
    try await poll { detected.exists && detected.isEnabled }
    utilityProof("real-ports-detected")
    let manual = app.buttons["port-forwarding.manual"].firstMatch
    XCTAssertTrue(manual.exists && manual.isEnabled)
    assertNativeDuoToolbarRail(manual)
    manual.tap()
    let alert = app.alerts.firstMatch
    let input = alert.textFields.firstMatch
    XCTAssertTrue(input.waitForExistence(timeout: 5)); input.tap(); input.typeText(port)
    try await assertDraftSurvivesDisplayTransitions("real-port", field: input, value: port)
    let forward = alert.buttons["Forward"]
    XCTAssertTrue(forward.exists && forward.isEnabled); forward.tap()
    func verify(_ stage: String) async throws -> [String: Any] {
      let url = probe.appendingPathComponent(stage)
      var request = URLRequest(url: url)
      request.httpMethod = "POST"
      request.setValue("Harness \(capability)", forHTTPHeaderField: "Authorization")
      let (data, response) = try await URLSession.shared.data(for: request)
      XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, stage)
      return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }
    utilityProof("real-ports-after-forward")
    let verified = try await verify("active")
    let id = try XCTUnwrap(verified["id"] as? String)
    let active = app.buttons.matching(NSPredicate(
      format: "identifier IN %@ OR (label == %@ AND value == %@)",
      ["port-forwarding.open.\(id)", "port-forwarding.row.\(id)"], "Open", "Port \(port)"
    )).firstMatch
    XCTAssertTrue(active.waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["Browser forwarding isn't set up on this desktop."].exists)
    utilityProof("real-ports-active")
    active.press(forDuration: 1)
    let stop = app.buttons["Stop forwarding"].firstMatch
    XCTAssertTrue(stop.waitForExistence(timeout: 5)); stop.tap()
    try await poll { !active.exists && detected.exists }
    _ = try await verify("stopped")
    utilityProof("real-ports-stopped")
  }

  func testRealPortForwardOpensAndReopensItsHTTPSPage() async throws {
    let environment = ProcessInfo.processInfo.environment
    try XCTSkipUnless(peerMode == .real && environment["NATIVE_E2E_HTTPS_PORT_TARGET"] != nil,
      "This journey requires the isolated HTTPS forward origin.")
    let port = try XCTUnwrap(environment["NATIVE_E2E_HTTPS_PORT_TARGET"])
    let probe = try XCTUnwrap(environment["NATIVE_E2E_HTTPS_PORT_PROBE"].flatMap(URL.init(string:)))
    let pageTitle = "Poracode HTTPS Ports fixture"
    let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    try await pairUntilHome()
    openFixtureMore()
    let ports = app.buttons["Ports"].firstMatch
    XCTAssertTrue(ports.waitForExistence(timeout: 8)); ports.tap()
    let detected = app.buttons["port-forwarding.start.\(port)"].firstMatch
    try await poll { detected.exists && detected.isEnabled }
    detected.tap()
    XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 15))
    XCTAssertTrue(safari.staticTexts[pageTitle].firstMatch.waitForExistence(timeout: 15))
    XCTAssertTrue(safari.staticTexts["Root-relative asset through HTTPS"].firstMatch.waitForExistence(timeout: 8))
    utilityProof("https-ports-opened")

    app.activate()
    let forward = app.buttons.matching(NSPredicate(format: "label == %@ AND value == %@", "Open", "Port \(port)"))
      .firstMatch
    XCTAssertTrue(forward.waitForExistence(timeout: 10))
    let forwardID = try XCTUnwrap(forward.identifier.split(separator: ".").last.map(String.init))
    let actions = app.buttons["port-forwarding.actions.\(forwardID)"].firstMatch
    XCTAssertTrue(actions.waitForExistence(timeout: 5)); actions.tap()
    let copy = app.buttons["Copy URL"].firstMatch
    XCTAssertTrue(copy.waitForExistence(timeout: 5) && copy.isEnabled); copy.tap()
    func verify(_ stage: String) async throws {
      var request = URLRequest(url: probe.appendingPathComponent(stage))
      request.httpMethod = "POST"
      request.setValue("Harness \(capability)", forHTTPHeaderField: "Authorization")
      let (_, response) = try await URLSession.shared.data(for: request)
      XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, stage)
    }
    try await verify("copied")
    forward.tap()
    XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 15))
    XCTAssertTrue(safari.staticTexts[pageTitle].firstMatch.waitForExistence(timeout: 15))
    utilityProof("https-ports-reopened")

    app.activate()
    XCTAssertTrue(actions.waitForExistence(timeout: 10)); actions.tap()
    let stop = app.buttons["Stop forwarding"].firstMatch
    XCTAssertTrue(stop.waitForExistence(timeout: 5)); stop.tap()
    try await poll { !forward.exists && detected.exists }
    try await verify("stopped")
    utilityProof("https-ports-stopped")
  }

  func assertDraftSurvivesDisplayTransitions(
    _ name: String,
    field: XCUIElement,
    value: String,
    availableAction: XCUIElement? = nil
  ) async throws {
    XCTAssertEqual(field.value as? String, value, "\(name) before the display transition")
    if let availableAction { XCTAssertTrue(toolbarActionClearsKeyboard(availableAction)) }
    try await assertNativeDuoDisplayTransitions(name, content: field, availableAction: availableAction) { pose in
      XCTAssertEqual(field.value as? String, value, "\(name) after moving to the \(pose) display")
    }
  }

  func assertNativeDuoDisplayTransitions(
    _ name: String,
    content: XCUIElement,
    availableAction: XCUIElement?,
    assertState: @escaping (String) async throws -> Void
  ) async throws {
    guard let driver = ProcessInfo.processInfo.environment["NATIVE_E2E_DUO_TRANSITION_URL"] else { return }
    func command(_ path: String) async throws {
      let url = try XCTUnwrap(URL(string: "\(driver)/\(path)"))
      let (_, response) = try await URLSession.shared.data(from: url)
      XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, path)
    }
    let outerWidth = app.frame.width
    for pose in ["inner", "partial", "outer"] {
      try await command("move/\(pose)")
      do {
        try await poll {
          let width = self.app.frame.width
          return (pose == "outer" ? width == outerWidth : width > outerWidth)
            && content.exists
            && (availableAction.map(self.toolbarActionClearsKeyboard) ?? true)
        }
        try await assertState(pose)
      } catch {
        try? await command("capture/\(name)-blocked-\(pose)")
        throw error
      }
      try await command("capture/\(name)-\(pose)")
    }
  }

  private func toolbarActionClearsKeyboard(_ action: XCUIElement) -> Bool {
    guard action.exists, action.isEnabled else { return false }
    let frame = action.frame
    guard !frame.isEmpty, app.frame.contains(frame) else { return false }
    let keyboard = app.keyboards.firstMatch
    return !keyboard.exists || keyboard.frame.intersection(frame).isEmpty
  }

  func testGlobalAndProjectMCPEditorsKeepSeparateDesktopScopesAcrossDisplays() async throws {
    try XCTSkipUnless(peerMode == .mock &&
      ProcessInfo.processInfo.environment["NATIVE_E2E_MCP_EDITOR_FIXTURE"] == "1",
      "This journey edits disposable MCP settings only.")
    let isPad = UIDevice.current.userInterfaceIdiom == .pad
    XCUIDevice.shared.orientation = isPad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/scenario/actions", method: "POST", body: ["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()
    let thread = navigationHostThread(label: "Navigation Host A")
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 15))
    if isPad { openFixtureMore() } else { openCompactThreadWorkspaceTools() }

    revealAndOpenSettingsRow("native-e2e.more.settings")
    revealAndOpenSettingsRow("native-e2e.settings.desktop")
    revealAndOpenSettingsRow("native-e2e.settings.global-mcp")
    let picker = app.buttons["Switch desktop"].firstMatch
    XCTAssertTrue(picker.waitForExistence(timeout: 5)); picker.tap()
    let hostB = app.buttons["Native E2E Collision Host B"]
    XCTAssertTrue(hostB.waitForExistence(timeout: 5)); hostB.tap()
    try await populateScopedMCPEditor("global", name: "GlobalFixture")
    XCTAssertTrue(app.staticTexts["GlobalFixture"].waitForExistence(timeout: 8))
    tapNativeSettingsBack(from: "MCP Servers", to: "Desktop Settings")
    tapNativeSettingsBack(from: "Desktop Settings", to: "Settings")
    tapNativeSettingsBack(from: "Settings", to: "More")

    app.buttons["native-e2e.more.projects"].tap()
    let manage = app.buttons["Manage projects"]
    XCTAssertTrue(manage.waitForExistence(timeout: 5)); manage.tap()
    let project = app.buttons["Work Project B"]
    XCTAssertTrue(project.waitForExistence(timeout: 10)); project.tap()
    let edit = app.buttons["Project Settings"].firstMatch
    XCTAssertTrue(edit.waitForExistence(timeout: 5)); edit.tap()
    revealAndOpenSettingsRow("native-e2e.settings.project-mcp")
    try await populateScopedMCPEditor("project", name: "ProjectFixture")
    XCTAssertTrue(app.staticTexts["ProjectFixture"].waitForExistence(timeout: 8))
    XCTAssertFalse(app.staticTexts["GlobalFixture"].exists)
    let state = try await control(path: "/v1/navigation/state")
    XCTAssertEqual(state["globalMCPWrites"] as? [String], ["b:GlobalFixture:false"])
    XCTAssertEqual(
      state["projectMCPWrites"] as? [String],
      ["b:project-fixture-001:REVIEW_API:false,ProjectFixture:false"]
    )
    utilityProof("utility-project-mcp-saved")
  }

  func testEnvironmentCreateStaysWithItsDesktopAcrossDisplays() async throws {
    try XCTSkipIf(peerMode == .real, "This journey creates a disposable WireLab environment.")
    let isPad = UIDevice.current.userInterfaceIdiom == .pad
    XCUIDevice.shared.orientation = isPad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/environment-management-ready", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()
    openFixtureMore()
    app.buttons["native-e2e.more.connections"].tap()
    let rows = app.buttons.matching(identifier: "native-e2e.connection-row")
    let hostA = rows.matching(NSPredicate(format: "NOT (label BEGINSWITH %@)", "Native E2E Collision Host B")).firstMatch
    let hostB = rows.matching(NSPredicate(format: "label BEGINSWITH %@", "Native E2E Collision Host B")).firstMatch
    XCTAssertTrue(hostB.waitForExistence(timeout: 10)); hostB.tap()
    try await poll { hostB.label.contains("selected connection") }
    XCTAssertTrue(hostA.exists); hostA.press(forDuration: 0.8)
    let environments = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Host-owned environments")).firstMatch
    XCTAssertTrue(environments.waitForExistence(timeout: 5)); environments.tap()

    let add = app.descendants(matching: .any).matching(identifier: "native-e2e.environments.add").firstMatch
    XCTAssertTrue(add.waitForExistence(timeout: 10))
    assertNativeDuoToolbarRail(add)
    utilityProof("utility-environment-list")
    add.tap()
    let fields = app.textFields
    let name = fields["native-e2e.environment-editor.name"]
    XCTAssertTrue(name.waitForExistence(timeout: 5)); name.tap(); name.typeText("Fixture Build Box")
    let target = fields["native-e2e.environment-editor.target"]
    target.tap(); target.typeText("builder@fixture.invalid")
    let port = fields["native-e2e.environment-editor.port"]
    port.tap(); port.typeText("2222")
    let credential = fields["native-e2e.environment-editor.credential"]
    credential.tap(); credential.typeText("fixture-reference")
    let confirm = app.descendants(matching: .any).matching(identifier: "native-e2e.environment-editor.confirm").firstMatch
    try await assertDraftSurvivesDisplayTransitions(
      "environment", field: credential, value: "fixture-reference", availableAction: confirm
    )
    XCTAssertEqual(name.value as? String, "Fixture Build Box")
    XCTAssertEqual(target.value as? String, "builder@fixture.invalid")
    XCTAssertEqual(port.value as? String, "2222")

    try await tapNativeToolbarActionAfterDisplayTransition(confirm)
    let create = app.buttons.matching(NSPredicate(format: "label == %@ AND identifier != %@", "Create on host", "native-e2e.environment-editor.confirm")).firstMatch
    XCTAssertTrue(create.waitForExistence(timeout: 5))
    let unconfirmed = try await scenarioState().host("primary")
    XCTAssertFalse(unconfirmed.observedOperationIds.contains("route:environment-create"))
    create.tap()
    XCTAssertTrue(app.staticTexts["Fixture Build Box"].waitForExistence(timeout: 12))
    let finalState = try await scenarioState()
    for hostId in ["primary", "collision-b"] {
      let writes = try finalState.host(hostId).operationJournal.filter { $0.operationId == "route:environment-create" }
      XCTAssertEqual(writes.count, hostId == "primary" ? 1 : 0)
    }
    utilityProof("utility-environment-created")
  }

  private func revealAndOpenSettingsRow(_ identifier: String) {
    let row = app.buttons[identifier]
    for _ in 0..<5 where !row.isHittable { app.swipeUp() }
    XCTAssertTrue(row.waitForExistence(timeout: 5)); row.tap()
  }

  private func populateScopedMCPEditor(_ scope: String, name: String) async throws {
    let add = app.buttons["native-e2e.\(scope)-mcp.add"]
    XCTAssertTrue(add.waitForExistence(timeout: 5))
    try await poll { add.isEnabled }
    assertNativeDuoToolbarRail(add)
    add.tap()
    let nameField = app.textFields["native-e2e.mcp-editor.name"]
    XCTAssertTrue(nameField.waitForExistence(timeout: 5))
    let enabled = app.switches["native-e2e.mcp-editor.enabled"]
    if enabled.value as? String == "1" {
      let switchCenter = max(0.5, 1 - 28 / max(enabled.frame.width, 1))
      enabled.coordinate(withNormalizedOffset: CGVector(dx: switchCenter, dy: 0.5)).tap()
    }
    XCTAssertEqual(enabled.value as? String, "0")
    let transport = app.buttons["native-e2e.mcp-editor.transport"]
    transport.tap()
    app.buttons["HTTP"].tap()
    nameField.tap()
    nameField.typeText(name)
    let url = app.textFields["native-e2e.mcp-editor.url"]
    XCTAssertTrue(url.waitForExistence(timeout: 5)); url.tap()
    let endpoint = "https://mcp-fixture.invalid/\(scope)"
    url.typeText(endpoint)
    try await assertDraftSurvivesDisplayTransitions("mcp-\(scope)", field: url, value: endpoint)
    let save = app.descendants(matching: .any).matching(identifier: "native-e2e.mcp-editor.save").firstMatch
    try await tapNativeToolbarActionAfterDisplayTransition(save)
    try await poll { !url.exists }
  }

  func tapNativeToolbarActionAfterDisplayTransition(_ action: XCUIElement, offsetFromLeading: CGFloat? = nil) async throws {
    XCTAssertTrue(action.isEnabled)
    if app.keyboards.firstMatch.exists {
      XCTAssertLessThanOrEqual(action.frame.maxY, app.keyboards.firstMatch.frame.minY)
    }
    if let driver = ProcessInfo.processInfo.environment["NATIVE_E2E_DUO_TRANSITION_URL"] {
      let frame = action.frame
      let display = app.frame
      let x = offsetFromLeading.map { frame.minX + $0 } ?? frame.midX
      let address = "\(driver)/tap/\(Int((x - display.minX).rounded()))/\(Int((frame.midY - display.minY).rounded()))"
      let (_, response) = try await URLSession.shared.data(from: try XCTUnwrap(URL(string: address)))
      XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
    } else if let offsetFromLeading {
      action.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0.5))
        .withOffset(CGVector(dx: offsetFromLeading, dy: 0)).tap()
    } else {
      action.tap()
    }
  }

  func pressNativeE2EShortcut(_ key: String, modifiers: XCUIElement.KeyModifierFlags) async throws {
    if let driver = ProcessInfo.processInfo.environment["NATIVE_E2E_DUO_TRANSITION_URL"] {
      let address = "\(driver)/key/\(key)"
      let (_, response) = try await URLSession.shared.data(from: try XCTUnwrap(URL(string: address)))
      XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
    } else {
      app.typeKey(XCUIKeyboardKey(rawValue: key), modifierFlags: modifiers)
    }
  }

  func testCompactThreadWorkspaceToolsPreserveDraft() async throws {
    try XCTSkipIf(peerMode == .real || UIDevice.current.userInterfaceIdiom == .pad,
      "This journey uses the portrait iPhone fixture.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    try await pairAndOpenFixtureThread()
    let draft = "Keep this workspace draft"
    try await enterWorkspaceDraft(draft)

    openCompactThreadWorkspaceTools()
    let done = app.buttons["native-e2e.more.close"]
    XCTAssertTrue(done.waitForExistence(timeout: 5))
    done.tap()

    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 10))
    try await assertWorkspaceDraft(draft)
    let journal = try await scenarioState().host("primary")
    XCTAssertFalse(journal.observedOperationIds.contains("route:thread-command"))
    XCTAssertFalse(journal.observedOperationIds.contains("route:thread-send"))
  }

  func testAddHostConnectStaysReachableAfterEditing() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses two disposable pairing peers.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/scenario/actions", method: "POST", body: ["type": "seed-multihost-collision"])
    try await pairUntilHome()
    openFixtureMore()
    app.buttons["native-e2e.more.connections"].tap()
    let add = app.buttons["native-e2e.connections.add"]
    XCTAssertTrue(add.waitForExistence(timeout: 10))
    assertNativeDuoToolbarRail(add)
    utilityProof("add-host-connections")
    add.tap()

    let link = PairingLinkEntry.revealLinkField(in: app)
    XCTAssertTrue(link.waitForExistence(timeout: 5))
    let invalid = try XCTUnwrap(URL(string: "not-a-pairing-link"))
    try PairingLinkEntry.populate(invalid, into: app)
    let keyboard = app.keyboards.firstMatch
    if ProcessInfo.processInfo.environment["NATIVE_E2E_ADD_HOST_SOFTWARE_KEYBOARD"] == "1" {
      try await poll {
        keyboard.exists && keyboard.frame.intersection(self.app.frame).height > 80
      }
    }
    let connect = app.buttons["native-e2e.pair.submit"]
    XCTAssertTrue(connect.isHittable, "Connect must be reachable while editing the pairing link")
    XCTAssertTrue(app.frame.contains(connect.frame))
    let keyboardFrame = keyboard.exists ? keyboard.frame.intersection(app.frame) : .null
    if !keyboardFrame.isNull && !keyboardFrame.isEmpty {
      XCTAssertFalse(connect.frame.intersects(keyboardFrame))
      utilityProof("add-host-keyboard")
    } else {
      utilityProof("add-host-editing")
    }
    connect.tap()

    let error = app.staticTexts["native-e2e.add-host.error"]
    XCTAssertTrue(error.waitForExistence(timeout: 5))
    XCTAssertTrue(error.isHittable)
    XCTAssertEqual(link.value as? String, invalid.absoluteString)
    utilityProof("add-host-validation")

    try PairingLinkEntry.populate(try await pairingURL(hostID: "collision-b"), into: app)
    XCTAssertTrue(connect.isHittable)
    connect.tap()
    try await poll { !link.exists }
    let paired = app.buttons.matching(NSPredicate(format: "identifier == %@ AND label CONTAINS %@",
      "native-e2e.connection-row", "Native E2E Collision Host B")).firstMatch
    XCTAssertTrue(paired.waitForExistence(timeout: 10))
    XCTAssertTrue(paired.isSelected)
    utilityProof("add-host-paired")
  }

  private func enterWorkspaceDraft(_ draft: String) async throws {
    let collapsed = app.buttons["native-e2e.composer-collapsed"]
    if collapsed.isHittable { collapsed.tap() }
    let editor = app.textViews["native-e2e.composer"]
    try await poll { editor.isHittable }
    editor.tap()
    editor.typeText(draft)
    XCTAssertEqual(editor.value as? String, draft)
  }

  private func assertWorkspaceDraft(_ draft: String) async throws {
    let collapsed = app.buttons["native-e2e.composer-collapsed"]
    let editor = app.textViews["native-e2e.composer"]
    try await poll { collapsed.isHittable || editor.isHittable }
    if collapsed.isHittable { collapsed.tap() }
    XCTAssertEqual(editor.value as? String, draft)
  }

  private func openCompactThreadWorkspaceTools() {
    let actions = app.buttons["native-e2e.thread.actions"]
    XCTAssertTrue(actions.waitForExistence(timeout: 5))
    actions.tap()
    utilityProof("actions-workspace-menu")
    let workspace = app.buttons["Workspace"]
    XCTAssertTrue(workspace.waitForExistence(timeout: 5))
    workspace.tap()
  }

  func pairBothFixtureHosts() async throws {
    try await pairUntilHome()
    openFixtureMore()
    app.buttons["native-e2e.more.connections"].tap()
    let addConnection = app.buttons["native-e2e.connections.add"]
    XCTAssertTrue(addConnection.waitForExistence(timeout: 10)); addConnection.tap()
    try PairingLinkEntry.enter(try await pairingURL(hostID: "collision-b"), into: app)
    try await poll { !self.app.buttons["native-e2e.pair.submit"].exists }
    tapNativeSettingsBack(from: "Connections", to: "More")
    let done = app.descendants(matching: .any).matching(identifier: "native-e2e.more.close").firstMatch
    XCTAssertTrue(done.waitForExistence(timeout: 10)); done.tap()
  }

  private func openFixtureMore() {
    if !homeMoreButton.isHittable, app.buttons["native-e2e.sidebar-toggle"].exists {
      app.buttons["native-e2e.sidebar-toggle"].tap()
    }
    XCTAssertTrue(homeMoreButton.waitForExistence(timeout: 5)); homeMoreButton.tap()
  }

  private func utilityProof(_ name: String) {
    let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    proof.name = name; proof.lifetime = .keepAlways; add(proof)
  }

  private func navigationHostThread(label: String) -> XCUIElement {
    app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@ AND label CONTAINS %@",
      "native-e2e.thread.", label, "Fixture thread")).firstMatch
  }

  private func revealNavigationThread(_ row: XCUIElement) {
    if row.exists, row.isHittable { return }
    let sidebar = app.buttons["native-e2e.sidebar-toggle"].firstMatch
    if sidebar.exists, sidebar.isHittable {
      sidebar.tap()
    } else {
      let back = app.navigationBars.buttons.element(boundBy: 0)
      if back.exists, back.isHittable { back.tap() }
    }
  }

  func testRemainingSettingsIntegrationsAndProjectScreensAcrossDisplays() async throws {
    try XCTSkipIf(peerMode == .real, "This journey edits only fixture desktop settings and project fixtures.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    applyFixtureAppearance()
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()

    func selectDesktop(_ label: String) async throws {
      let picker = app.buttons["Switch desktop"].firstMatch
      XCTAssertTrue(picker.waitForExistence(timeout: 8))
      try await tapNativeToolbarActionAfterDisplayTransition(picker)
      let option = app.buttons[label].firstMatch
      XCTAssertTrue(option.waitForExistence(timeout: 8))
      try await tapNativeToolbarActionAfterDisplayTransition(option)
      try await poll { picker.value as? String == label }
    }

    try openNativeSettings()
    revealAndOpenSettingsRow("native-e2e.settings.desktop")
    try await selectDesktop("Native E2E Collision Host B")

    let devicesRow = app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] %@", "Devices")).firstMatch
    for _ in 0..<5 where !devicesRow.isHittable { app.swipeUp() }
    XCTAssertTrue(devicesRow.isHittable)
    try await tapNativeToolbarActionAfterDisplayTransition(devicesRow)
    XCTAssertTrue(app.navigationBars["Devices"].waitForExistence(timeout: 8))
    utilityProof("desktop-devices-screen")
    tapNativeSettingsBack(from: "Devices", to: "Desktop Settings")

    revealAndOpenSettingsRow("native-e2e.settings.integrations")
    let skillsLink = app.buttons["native-e2e.integrations.skills"].firstMatch
    let mcpLink = app.buttons["native-e2e.integrations.mcp"].firstMatch
    XCTAssertTrue(skillsLink.waitForExistence(timeout: 8))
    XCTAssertTrue(mcpLink.exists)
    try await assertNativeDuoDisplayTransitions("integrations-index", content: skillsLink, availableAction: mcpLink) { _ in
      XCTAssertTrue(skillsLink.exists && mcpLink.exists)
    }
    utilityProof("desktop-integrations-index")

    try await tapNativeToolbarActionAfterDisplayTransition(skillsLink)
    let marketplace = app.buttons["Marketplace"].firstMatch
    XCTAssertTrue(marketplace.waitForExistence(timeout: 8))
    try await tapNativeToolbarActionAfterDisplayTransition(marketplace)
    XCTAssertTrue(app.searchFields["Search marketplace"].waitForExistence(timeout: 8))
    utilityProof("desktop-integrations-skills-marketplace")
    tapNativeSettingsBack(from: "Skills", to: "Settings Integrations")

    XCTAssertTrue(mcpLink.waitForExistence(timeout: 8))
    try await tapNativeToolbarActionAfterDisplayTransition(mcpLink)
    XCTAssertTrue(app.buttons["Workspace"].waitForExistence(timeout: 8))
    utilityProof("desktop-integrations-mcp")
    tapNativeSettingsBack(from: "MCP Servers", to: "Settings Integrations")
    tapNativeSettingsBack(from: "Settings Integrations", to: "Desktop Settings")
    tapNativeSettingsBack(from: "Desktop Settings", to: "Settings")
    tapNativeSettingsBack(from: "Settings", to: "More")

    app.buttons["native-e2e.more.projects"].tap()
    let manage = app.buttons["Manage projects"]
    XCTAssertTrue(manage.waitForExistence(timeout: 5))
    manage.tap()
    try await selectDesktop("Native E2E Collision Host B")

    let projectRow = app.buttons["Fixture Project"].firstMatch
    XCTAssertTrue(projectRow.waitForExistence(timeout: 10))
    try await tapNativeToolbarActionAfterDisplayTransition(projectRow)
    let editButton = app.buttons["Project Settings"].firstMatch
    XCTAssertTrue(editButton.waitForExistence(timeout: 8))
    try await tapNativeToolbarActionAfterDisplayTransition(editButton)

    let worktrees = app.buttons["native-e2e.settings.project-worktrees"].firstMatch
    XCTAssertTrue(worktrees.waitForExistence(timeout: 8))
    try await tapNativeToolbarActionAfterDisplayTransition(worktrees)
    let setupField = app.textViews.firstMatch
    XCTAssertTrue(setupField.waitForExistence(timeout: 8))
    for _ in 0..<3 where !setupField.isHittable { app.swipeUp() }
    try await tapNativeToolbarActionAfterDisplayTransition(setupField)
    setupField.typeText("echo custom")
    let worktreeSave = app.buttons["native-e2e.projects.worktrees.save"].firstMatch
    try await poll { worktreeSave.exists && worktreeSave.isEnabled }
    try await assertNativeDuoDisplayTransitions("project-worktrees-save", content: setupField, availableAction: worktreeSave) { _ in
      XCTAssertTrue(worktreeSave.isEnabled)
    }
    try await tapNativeToolbarActionAfterDisplayTransition(worktreeSave)
    try await waitForJournal(hostID: "collision-b", operationID: "route:project-command", count: 1)

    let projectSettingsList = app.collectionViews.firstMatch
    let searchSettings = app.buttons["native-e2e.settings.project-search"].firstMatch
    for _ in 0..<4 where !searchSettings.exists || !searchSettings.isHittable {
      if projectSettingsList.exists { projectSettingsList.swipeUp() } else { app.swipeUp() }
    }
    if !searchSettings.exists { utilityProof("duo-missing-project-search") }
    XCTAssertTrue(searchSettings.waitForExistence(timeout: 8) && searchSettings.isHittable)
    try await tapNativeToolbarActionAfterDisplayTransition(searchSettings)
    let patternField = app.textFields["Add pattern"].firstMatch
    let searchFormList = app.collectionViews.firstMatch
    for _ in 0..<4 where !patternField.exists || !patternField.isHittable {
      if searchFormList.exists { searchFormList.swipeUp() } else { app.swipeUp() }
    }
    XCTAssertTrue(patternField.isHittable)
    try await tapNativeToolbarActionAfterDisplayTransition(patternField)
    patternField.typeText("*.log")
    let addPattern = app.buttons["native-e2e.projects.search.add-pattern"].firstMatch
    XCTAssertTrue(addPattern.isHittable)
    try await tapNativeToolbarActionAfterDisplayTransition(addPattern)
    let searchSave = app.buttons["native-e2e.projects.search.save"].firstMatch
    try await poll { searchSave.exists && searchSave.isEnabled }
    try await tapNativeToolbarActionAfterDisplayTransition(searchSave)
    try await waitForJournal(hostID: "collision-b", operationID: "route:project-command", count: 2)
    let primaryProjectCommands = try await journalCount(hostID: "primary", operationID: "route:project-command")
    XCTAssertEqual(primaryProjectCommands, 0)

    let generalSettings = app.buttons["native-e2e.settings.project-general"].firstMatch
    for _ in 0..<4 where !generalSettings.exists || !generalSettings.isHittable {
      if projectSettingsList.exists { projectSettingsList.swipeDown() } else { app.swipeDown() }
    }
    XCTAssertTrue(generalSettings.waitForExistence(timeout: 8) && generalSettings.isHittable)
    try await tapNativeToolbarActionAfterDisplayTransition(generalSettings)
    XCTAssertTrue(app.buttons["native-e2e.projects.general.save"].waitForExistence(timeout: 8))
    utilityProof("project-general-settings")
    tapNativeSettingsBack(from: "General", to: "Project Settings")

    let advanced = app.buttons["native-e2e.settings.project-advanced"].firstMatch
    for _ in 0..<4 where !advanced.exists || !advanced.isHittable {
      if projectSettingsList.exists { projectSettingsList.swipeUp() } else { app.swipeUp() }
    }
    XCTAssertTrue(advanced.isHittable)
    try await tapNativeToolbarActionAfterDisplayTransition(advanced)
    let readFile = app.buttons["advancedOperations.action.readExternalFile"].firstMatch
    let advancedScroll = app.scrollViews.firstMatch
    for _ in 0..<5 where !readFile.exists || !readFile.isHittable {
      if advancedScroll.exists { advancedScroll.swipeUp() } else { app.swipeUp() }
    }
    XCTAssertTrue(readFile.waitForExistence(timeout: 8) && readFile.isHittable && readFile.isEnabled)
    try await tapNativeToolbarActionAfterDisplayTransition(readFile)
    let submit = app.buttons["advancedOperations.submit"].firstMatch
    XCTAssertTrue(submit.waitForExistence(timeout: 8))
    utilityProof("advanced-operation-form")
    let closeForm = app.buttons["Close"].firstMatch
    XCTAssertTrue(closeForm.isHittable)
    try await tapNativeToolbarActionAfterDisplayTransition(closeForm)
    try await poll { !submit.exists }
  }

  func testSettingsSearchOpensTheMatchingControlAndKeepsTheDesktop() async throws {
    try XCTSkipIf(peerMode == .real, "This journey edits only fixture desktop settings.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    applyFixtureAppearance()
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()
    try openNativeSettings()

    func activeSearchField() -> XCUIElement {
      app.searchFields.matching(identifier: "Search settings").allElementsBoundByIndex
        .last { $0.exists && $0.isHittable } ?? app.searchFields["Search settings"].firstMatch
    }
    func searchFor(_ query: String, result title: String) async throws -> XCUIElement {
      let search = activeSearchField()
      XCTAssertTrue(search.waitForExistence(timeout: 8) && search.isHittable)
      try await tapNativeToolbarActionAfterDisplayTransition(search)
      let clear = search.buttons["Clear text"].firstMatch
      if clear.isHittable {
        clear.tap()
        try await tapNativeToolbarActionAfterDisplayTransition(search)
      }
      search.typeText(query)
      let hit = app.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] %@", title)).firstMatch
      try await poll { hit.exists && hit.isHittable }
      return hit
    }

    let chatText = try await searchFor("chat text size", result: "Chat text size")
    try await assertDraftSurvivesDisplayTransitions("settings-search-query", field: activeSearchField(),
      value: "chat text size", availableAction: chatText)
    try await tapNativeToolbarActionAfterDisplayTransition(chatText)
    let textSize = app.sliders["Chat text size"].firstMatch
    try await poll { textSize.exists && textSize.isHittable && !self.app.keyboards.firstMatch.exists }
    utilityProof("settings-search-chat-text-size")

    tapNativeSettingsBack(from: "Appearance", to: "Settings")
    let desktop = try await searchFor("desktop settings", result: "Desktop Settings")
    try await tapNativeToolbarActionAfterDisplayTransition(desktop)
    let picker = app.buttons["Switch desktop"].firstMatch
    XCTAssertTrue(picker.waitForExistence(timeout: 8))
    try await tapNativeToolbarActionAfterDisplayTransition(picker)
    let chosen = "Native E2E Collision Host B"
    let option = app.buttons[chosen].firstMatch
    XCTAssertTrue(option.waitForExistence(timeout: 8))
    try await tapNativeToolbarActionAfterDisplayTransition(option)
    try await poll { picker.value as? String == chosen }

    let method = try await searchFor("merge method", result: "Merge method")
    try await tapNativeToolbarActionAfterDisplayTransition(method)
    let control = app.buttons["native-e2e.settings.git.merge-method"].firstMatch
    try await poll { control.exists && control.isHittable && !self.app.keyboards.firstMatch.exists }
    XCTAssertEqual(picker.value as? String, chosen)
    utilityProof("settings-search-merge-method")
    try await tapNativeToolbarActionAfterDisplayTransition(control)
    try await tapNativeToolbarActionAfterDisplayTransition(app.buttons["Rebase"].firstMatch)
    let save = app.buttons["native-e2e.settings.document.save"].firstMatch
    try await poll { save.isEnabled }
    try await tapNativeToolbarActionAfterDisplayTransition(save)
    try await waitForJournal(hostID: "collision-b", operationID: "route:settings-write", count: 1)
    try await poll { !save.isEnabled }
    let otherWrites = try await journalCount(hostID: "primary", operationID: "route:settings-write")
    XCTAssertEqual(otherWrites, 0)
  }

  func testMcpAppAndWarmThreadHistoryChangesAcrossDisplays() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses controlled WireLab MCP App and warm history-resume fixtures.")
    let isPad = UIDevice.current.userInterfaceIdiom == .pad
    XCUIDevice.shared.orientation = isPad ? .landscapeLeft : .portrait
    applyFixtureAppearance()
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/transcript-mcp-app-ready", method: "POST")
    _ = try await control(path: "/v1/checkpoints/thread-history-changes-ready", method: "POST")
    try await pairAndOpenFixtureThread(expectedResponse: "Deployment Dashboard")

    let card = app.descendants(matching: .any).matching(identifier: "native-e2e.mcp-app.card").firstMatch
    XCTAssertTrue(card.waitForExistence(timeout: 12), "Live MCP App card must render in the transcript")
    try await waitForJournal(hostID: "primary", operationID: "procedure:controlMcpApp", count: 1)
    let pingButton = app.webViews.buttons["Ping MCP App"].firstMatch
    XCTAssertTrue(pingButton.waitForExistence(timeout: 15), "Live MCP App sandbox WebView must render interactive HTML")
    try await assertNativeDuoDisplayTransitions("mcp-app-live-card", content: card, availableAction: pingButton) { pose in
      XCTAssertTrue(self.app.webViews.firstMatch.exists, pose)
    }
    pingButton.tap()
    XCTAssertTrue(app.webViews.staticTexts["MCP App Clicked"].waitForExistence(timeout: 10),
      "Tapping inside the MCP App WebView must execute its interactive state update")
    utilityProof("mcp-app-live-card")

    let historyBefore = try await journalCount(hostID: "primary", operationID: "route:thread-history")
    let more = app.buttons["native-e2e.thread.actions"].firstMatch
    XCTAssertTrue(more.waitForExistence(timeout: 10))
    try await tapNativeToolbarActionAfterDisplayTransition(more)
    try await tapThreadMenuAction("More")
    let refresh = app.buttons["Refresh transcript"].firstMatch
    XCTAssertTrue(refresh.waitForExistence(timeout: 8))
    refresh.tap()

    try await waitForJournal(hostID: "primary", operationID: "route:thread-history-changes", count: 1)
    let resumedDelta = app.staticTexts["Warm resume delta delivered"].firstMatch
    for _ in 0..<4 where !resumedDelta.exists {
      if resumedDelta.waitForExistence(timeout: 2) { break }
      app.swipeUp()
    }
    XCTAssertTrue(resumedDelta.waitForExistence(timeout: 10),
      "Warm thread-history-changes replay must append the incremental delta item")
    let historyAfter = try await journalCount(hostID: "primary", operationID: "route:thread-history")
    XCTAssertEqual(historyAfter, historyBefore,
      "Warm thread-history-changes resume must not trigger a full thread-history reload")
    if !card.exists { app.swipeDown() }
    XCTAssertTrue(card.exists, "Warm incremental replay must preserve existing rendered transcript items")
    utilityProof("warm-thread-history-changes")
  }

  func testPRWatchesHostUpdateAndEnvironmentDetailAcrossDisplays() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses controlled WireLab update, PR watch, and environment fixtures.")
    let isPad = UIDevice.current.userInterfaceIdiom == .pad
    XCUIDevice.shared.orientation = isPad ? .landscapeLeft : .portrait
    applyFixtureAppearance()
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/environment-management-ready", method: "POST")
    try await pairUntilHome()
    try openNativeSettings()

    revealAndOpenSettingsRow("native-e2e.settings.desktop")

    // 1. Host Updates screen
    revealAndOpenSettingsRow("native-e2e.settings.host-update")
    let checkUpdates = app.buttons["Check for Updates"].firstMatch
    XCTAssertTrue(checkUpdates.waitForExistence(timeout: 12))
    try await assertNativeDuoDisplayTransitions("host-update-screen", content: checkUpdates, availableAction: checkUpdates) { _ in
      XCTAssertTrue(checkUpdates.exists)
    }
    try await tapNativeToolbarActionAfterDisplayTransition(checkUpdates)
    try await waitForJournal(hostID: "primary", operationID: "route:host-update-check", count: 1)
    utilityProof("host-update-screen")

    tapNativeSettingsBack(from: "Update", to: "Desktop Settings")

    // 2. PR Watches screen
    revealAndOpenSettingsRow("native-e2e.settings.pr-watches")
    let prWatchesNav = app.navigationBars["PR Watches"].firstMatch
    XCTAssertTrue(prWatchesNav.waitForExistence(timeout: 10))
    let lookUp = app.buttons["Look Up"].firstMatch
    XCTAssertTrue(lookUp.waitForExistence(timeout: 8))
    try await assertNativeDuoDisplayTransitions("pr-watches-screen", content: prWatchesNav, availableAction: lookUp) { _ in
      XCTAssertTrue(prWatchesNav.exists)
    }
    try await tapNativeToolbarActionAfterDisplayTransition(lookUp)
    try await waitForJournal(hostID: "primary", operationID: "route:pr-watch-read", count: 1)
    utilityProof("pr-watches-screen")

    tapNativeSettingsBack(from: "PR Watches", to: "Desktop Settings")

    // 3. Environment Detail screen (Create -> Open Detail -> Probe Trust -> Accept Trust -> Upgrade)
    let envRow = app.buttons["Host-owned environments"].firstMatch
    for _ in 0..<6 where !envRow.isHittable { app.swipeUp() }
    XCTAssertTrue(envRow.waitForExistence(timeout: 8))
    try await tapNativeToolbarActionAfterDisplayTransition(envRow)

    let add = app.descendants(matching: .any).matching(identifier: "native-e2e.environments.add").firstMatch
    XCTAssertTrue(add.waitForExistence(timeout: 10))
    try await tapNativeToolbarActionAfterDisplayTransition(add)
    let fields = app.textFields
    let name = fields["native-e2e.environment-editor.name"]
    XCTAssertTrue(name.waitForExistence(timeout: 5)); name.tap(); name.typeText("Detail Audit Box")
    let target = fields["native-e2e.environment-editor.target"]
    target.tap(); target.typeText("audit@fixture.invalid")
    let port = fields["native-e2e.environment-editor.port"]
    port.tap(); port.typeText("2222")
    let confirm = app.descendants(matching: .any).matching(identifier: "native-e2e.environment-editor.confirm").firstMatch
    try await tapNativeToolbarActionAfterDisplayTransition(confirm)
    let create = app.buttons.matching(NSPredicate(format: "label == %@ AND identifier != %@", "Create on host", "native-e2e.environment-editor.confirm")).firstMatch
    XCTAssertTrue(create.waitForExistence(timeout: 5)); create.tap()

    let createdRow = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", "Detail Audit Box")).firstMatch
    XCTAssertTrue(createdRow.waitForExistence(timeout: 12))
    try await tapNativeToolbarActionAfterDisplayTransition(createdRow)

    let envDetailNav = app.navigationBars["Detail Audit Box"].firstMatch
    XCTAssertTrue(envDetailNav.waitForExistence(timeout: 10))
    try await assertNativeDuoDisplayTransitions("environment-detail-screen", content: envDetailNav, availableAction: nil) { _ in
      XCTAssertTrue(envDetailNav.exists)
    }
    let probeTrust = app.buttons["native-e2e.environment-detail.probe-trust"].firstMatch
    for _ in 0..<4 where !probeTrust.isHittable { app.swipeUp() }
    XCTAssertTrue(probeTrust.waitForExistence(timeout: 10))
    try await tapNativeToolbarActionAfterDisplayTransition(probeTrust)
    try await waitForJournal(hostID: "primary", operationID: "route:environment-trust-probe", count: 1)
    let fingerprintText = app.staticTexts["SHA256:NativeE2ETrustFixtureFingerprint0123456789A"].firstMatch
    for _ in 0..<3 where !fingerprintText.exists { app.swipeUp() }
    XCTAssertTrue(fingerprintText.waitForExistence(timeout: 10))

    let acceptTrust = app.buttons["native-e2e.environment-detail.accept-trust"].firstMatch
    for _ in 0..<3 where !acceptTrust.isHittable { app.swipeUp() }
    XCTAssertTrue(acceptTrust.waitForExistence(timeout: 8))
    try await tapNativeToolbarActionAfterDisplayTransition(acceptTrust)
    let confirmAccept = app.buttons.matching(NSPredicate(format: "label == %@ AND identifier != %@", "Accept host key", "native-e2e.environment-detail.accept-trust")).firstMatch
    XCTAssertTrue(confirmAccept.waitForExistence(timeout: 5)); confirmAccept.tap()
    try await waitForJournal(hostID: "primary", operationID: "route:environment-trust-accept", count: 1)

    let upgrade = app.buttons["native-e2e.environment-detail.upgrade"].firstMatch
    for _ in 0..<3 where !upgrade.isHittable { app.swipeUp() }
    XCTAssertTrue(upgrade.waitForExistence(timeout: 8))
    try await tapNativeToolbarActionAfterDisplayTransition(upgrade)
    let confirmUpgrade = app.buttons.matching(NSPredicate(format: "label == %@ AND identifier != %@", "Upgrade", "native-e2e.environment-detail.upgrade")).firstMatch
    XCTAssertTrue(confirmUpgrade.waitForExistence(timeout: 5)); confirmUpgrade.tap()
    try await waitForJournal(hostID: "primary", operationID: "route:environment-upgrade", count: 1)
    utilityProof("environment-detail-screen")
  }

  func testDesktopSettingsSeparateLocalGitAndUseTheSelectedHost() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses the WireLab's synthetic CLI session store.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    applyFixtureAppearance()
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    _ = try await control(path: "/v1/checkpoints/session-import-ready", method: "POST")
    try await pairBothFixtureHosts()

    func selectDesktop(_ label: String) async throws {
      let picker = app.buttons["Switch desktop"].firstMatch
      XCTAssertTrue(picker.waitForExistence(timeout: 5))
      try await tapNativeToolbarActionAfterDisplayTransition(picker)
      let option = app.buttons[label].firstMatch
      XCTAssertTrue(option.waitForExistence(timeout: 5))
      try await tapNativeToolbarActionAfterDisplayTransition(option)
    }

    let localMode = app.buttons["native-e2e.settings.git.create-pr-mode"].firstMatch
    let mergeMethod = app.buttons["native-e2e.settings.git.merge-method"].firstMatch
    try openNativeSettings()
    for _ in 0..<5 where !localMode.isHittable { app.swipeUp() }
    XCTAssertTrue(localMode.isHittable)
    XCTAssertFalse(mergeMethod.exists)
    try await tapNativeToolbarActionAfterDisplayTransition(localMode)
    try await tapNativeToolbarActionAfterDisplayTransition(app.buttons["Auto-generate"].firstMatch)
    try await poll {
      try !self.app.buttons["Open dialog"].exists
        && self.renderedScreenText(in: self.app.screenshot()).localizedCaseInsensitiveContains("Auto-generate")
    }
    utilityProof("device-git-create-pr-mode")

    revealAndOpenSettingsRow("native-e2e.settings.desktop")
    try await selectDesktop("Native E2E Collision Host B")
    revealAndOpenSettingsRow("native-e2e.settings.git")
    XCTAssertTrue(mergeMethod.waitForExistence(timeout: 10))
    XCTAssertFalse(localMode.exists)
    let save = app.buttons["native-e2e.settings.document.save"].firstMatch
    XCTAssertFalse(save.isEnabled)
    try await tapNativeToolbarActionAfterDisplayTransition(mergeMethod)
    try await tapNativeToolbarActionAfterDisplayTransition(app.buttons["Rebase"].firstMatch)
    try await poll { save.isEnabled }
    try await assertNativeDuoDisplayTransitions("desktop-git-merge-method", content: mergeMethod, availableAction: save) { _ in
      XCTAssertTrue(save.isEnabled)
    }
    utilityProof("desktop-git-merge-method")
    try await tapNativeToolbarActionAfterDisplayTransition(save)
    try await waitForJournal(hostID: "collision-b", operationID: "route:settings-write", count: 1)
    try await poll { !save.isEnabled }
    let primarySettingsWrites = try await journalCount(hostID: "primary", operationID: "route:settings-write")
    XCTAssertEqual(primarySettingsWrites, 0)

    tapNativeSettingsBack(from: "Git", to: "Desktop Settings")
    try await selectDesktop("Navigation Host A")
    revealAndOpenSettingsRow("native-e2e.settings.import")
    let selectedDesktop = app.descendants(matching: .any).matching(identifier: "native-e2e.session-import.desktop").firstMatch
    let agentFilter = app.buttons["native-e2e.session-import.agent-filter"].firstMatch
    let session = app.buttons["native-e2e.session-import.session.claude:session-1"]
    XCTAssertTrue(selectedDesktop.waitForExistence(timeout: 10))
    XCTAssertTrue(session.waitForExistence(timeout: 15), "Initial list on desktop A")
    try await selectDesktop("Native E2E Collision Host B")
    try await waitForJournal(hostID: "collision-b", operationID: "route:procedure-call", count: 1)
    try await selectDesktop("Navigation Host A")
    try await waitForJournal(hostID: "primary", operationID: "route:procedure-call", count: 2)
    XCTAssertTrue(session.waitForExistence(timeout: 15), "List after returning to desktop A")
    XCTAssertTrue(session.label.contains("CLI layout review"))
    XCTAssertTrue(session.label.contains("Fix the login form"))
    let run = app.buttons["native-e2e.session-import.run"]
    XCTAssertTrue(run.isHittable)
    XCTAssertEqual(run.label, "Import selected")
    XCTAssertFalse(run.isEnabled)
    utilityProof("desktop-import-disabled")
    try await tapNativeToolbarActionAfterDisplayTransition(session)
    XCTAssertTrue(run.isEnabled)
    utilityProof("desktop-import-enabled")
    try await assertNativeDuoDisplayTransitions("desktop-import-session", content: session, availableAction: run) { pose in
      XCTAssertTrue(session.isSelected)
      XCTAssertLessThan(selectedDesktop.frame.height, 96, pose)
      XCTAssertTrue(agentFilter.exists, pose)
      XCTAssertLessThan(agentFilter.frame.minY - selectedDesktop.frame.minY, 110, pose)
    }
    if UIDevice.current.userInterfaceIdiom == .pad {
      let search = app.searchFields["Search sessions"].firstMatch
      XCTAssertTrue(search.waitForExistence(timeout: 5) && search.isHittable)
      search.tap()
      let keyboard = app.keyboards.firstMatch
      XCTAssertTrue(keyboard.waitForExistence(timeout: 5))
      let listRequests = try await journalCount(hostID: "primary", operationID: "route:procedure-call")
      search.typeText("CLI layout review")
      try await waitForJournal(hostID: "primary", operationID: "route:procedure-call", count: listRequests + 1)
      try await poll { session.exists && session.isSelected && run.isEnabled && run.isHittable }
      utilityProof("desktop-import-search-keyboard")
      XCTAssertTrue(run.isHittable)
      XCTAssertFalse(run.frame.intersects(keyboard.frame))
    }
    try await tapNativeToolbarActionAfterDisplayTransition(run)
    XCTAssertTrue(app.staticTexts["Sessions imported."].waitForExistence(timeout: 15))
    let imported = app.descendants(matching: .any)["native-e2e.session-import.imported.claude:session-1"]
    for _ in 0..<3 where !imported.exists { app.swipeUp() }
    XCTAssertTrue(imported.exists)
    XCTAssertFalse(run.isEnabled)
    try await waitForJournal(hostID: "primary", operationID: "route:thread-command", count: 1)
    let host = try await scenarioState().host("primary")
    XCTAssertTrue(host.observedOperationIds.contains("procedure:listImportableSessions"))
    XCTAssertFalse(host.observedOperationIds.contains("route:thread-start-existing"))
    let otherHost = try await scenarioState().host("collision-b")
    XCTAssertFalse(otherHost.observedOperationIds.contains("route:thread-command"))
    let proof = XCTAttachment(screenshot: app.screenshot())
    proof.name = "native-session-import-completed"
    proof.lifetime = .keepAlways
    add(proof)
  }

  func testProductionHostImportKeepsSelectionAndReplaysTheStoredTranscript() async throws {
    let environment = ProcessInfo.processInfo.environment
    try XCTSkipUnless(peerMode == .real && environment["NATIVE_E2E_LIVE_IMPORT_PROBE"] != nil,
      "This journey imports the disposable transcript seeded on a production host.")
    let probe = try XCTUnwrap(environment["NATIVE_E2E_LIVE_IMPORT_PROBE"].flatMap(URL.init(string:)))
    let isPad = UIDevice.current.userInterfaceIdiom == .pad
    XCUIDevice.shared.orientation = isPad ? .landscapeLeft : .portrait
    try await pairUntilHome()
    try openNativeSettingsPage("native-e2e.settings.desktop")
    revealAndOpenSettingsRow("native-e2e.settings.import")

    let sessionID = "claude:9f1c6b22-0000-4000-8000-000000000001"
    let title = "Disposable CLI layout review"
    let prompt = "Review the disposable layout."
    let reply = "The disposable transcript was restored."
    let row = app.buttons["native-e2e.session-import.session.\(sessionID)"].firstMatch
    let run = app.buttons["native-e2e.session-import.run"].firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 16))
    XCTAssertTrue(row.label.contains(title) && row.label.contains(prompt))
    if !row.isHittable { app.swipeUp() }
    XCTAssertTrue(row.isHittable)
    XCTAssertFalse(run.isEnabled)
    try await tapNativeToolbarActionAfterDisplayTransition(row)
    do {
      try await poll(timeout: .seconds(5)) { row.isSelected && run.isEnabled }
    } catch {
      utilityProof("production-import-selection-missed")
      return XCTFail("The fixture row must be selected and Import enabled. Selected: \(row.isSelected). Enabled: \(run.isEnabled).")
    }
    assertNativeDuoToolbarRail(run)
    try await assertNativeDuoDisplayTransitions("production-import-selected", content: row, availableAction: nil) { pose in
      XCTAssertTrue(run.isHittable && run.isEnabled, pose)
      XCTAssertTrue(row.isSelected, pose)
    }
    utilityProof("production-import-selected")
    try await tapNativeToolbarActionAfterDisplayTransition(run)
    XCTAssertTrue(app.staticTexts["Sessions imported."].waitForExistence(timeout: 15))
    let imported = app.descendants(matching: .any)
      .matching(identifier: "native-e2e.session-import.imported.\(sessionID)").firstMatch
    XCTAssertTrue(imported.waitForExistence(timeout: 8))
    XCTAssertFalse(run.isEnabled)
    utilityProof("production-import-completed")

    func verify(_ stage: String) async throws {
      var request = URLRequest(url: probe.appendingPathComponent(stage))
      request.httpMethod = "POST"
      request.setValue("Harness \(capability)", forHTTPHeaderField: "Authorization")
      let (_, response) = try await URLSession.shared.data(for: request)
      XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, stage)
    }
    try await verify("imported")
    tapNativeSettingsBack(from: "Import", to: "Desktop Settings")
    tapNativeSettingsBack(from: "Desktop Settings", to: "Settings")
    tapNativeSettingsBack(from: "Settings", to: "More")
    let close = app.descendants(matching: .any).matching(identifier: "native-e2e.more.close").firstMatch
    XCTAssertTrue(close.waitForExistence(timeout: 5))
    close.tap()
    let thread = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@",
      "native-e2e.thread.", title)).firstMatch
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 15) && thread.isHittable)
    thread.tap()
    XCTAssertTrue(app.staticTexts[reply].waitForExistence(timeout: 15))
    XCTAssertTrue(app.staticTexts[prompt].exists)
    XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@",
      "Imported from an existing CLI session")).firstMatch.exists)
    utilityProof("production-import-transcript")
    try await verify("opened")
  }

  func testSavedCrewsUseNativeFormsAndRoundTripRolesBeforeDuplicateAndDelete() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses controlled Crew catalogs and settings.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/crews-ready", method: "POST")
    try await pairUntilHome()
    _ = try await control(path: "/v1/checkpoints/crews-ready", method: "POST")
    if !homeMoreButton.isHittable { app.buttons["native-e2e.sidebar-toggle"].tap() }
    homeMoreButton.tap()
    app.buttons["Settings"].tap()
    let crews = app.buttons["native-e2e.settings.crews"]
    for _ in 0..<4 { if crews.isHittable { break }; app.swipeUp() }
    XCTAssertTrue(crews.isHittable)
    crews.tap()
    let seed = app.buttons["native-e2e.crews.saved.native-review"]
    XCTAssertTrue(seed.waitForExistence(timeout: 10))
    let new = app.buttons["native-e2e.crews.new"]
    try await poll { new.isEnabled }
    new.tap()
    app.buttons["native-e2e.crews.template.pair"].tap()
    let name = app.textFields["native-e2e.crews.name"]
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    replaceCrewField(name, with: "Native crew")
    let sidekick = app.buttons["native-e2e.crew.role.sidekick"]
    for _ in 0..<3 { if sidekick.isHittable { break }; app.swipeUp() }
    sidekick.tap()
    let brief = app.textFields["native-e2e.crew.role-brief"]
    XCTAssertTrue(brief.waitForExistence(timeout: 5))
    replaceCrewField(brief, with: "Check the UI and retain this instruction")
    let parallel = app.steppers["native-e2e.crew.role-parallel"]
    app.buttons["native-e2e.crew.role-parallel-Increment"].tap()
    let fallback = app.buttons["native-e2e.crew.add-fallback"]
    for _ in 0..<4 { if fallback.isHittable { break }; app.swipeUp() }
    XCTAssertTrue(fallback.isHittable)
    fallback.tap()
    let fallbackModel = app.buttons["native-e2e.crew.model.fixture-reviewer.review-model"]
    XCTAssertTrue(fallbackModel.waitForExistence(timeout: 5)); fallbackModel.tap()
    app.navigationBars["Sidekick"].buttons.element(boundBy: 0).tap()
    app.buttons["native-e2e.crews.save"].tap()
    let saved = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "native-e2e.crews.saved.", "Native crew")).firstMatch
    XCTAssertTrue(saved.waitForExistence(timeout: 10))
    saved.tap()
    app.buttons["native-e2e.crew.role.sidekick"].tap()
    XCTAssertEqual(brief.value as? String, "Check the UI and retain this instruction")
    XCTAssertTrue(parallel.label.contains("2"))
    let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    proof.name = "saved-crew-native-role-editor"; proof.lifetime = .keepAlways; add(proof)
    app.navigationBars["Sidekick"].buttons.element(boundBy: 0).tap()
    app.buttons["Cancel"].tap()
    saved.press(forDuration: 1)
    app.buttons["Duplicate"].tap()
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    XCTAssertEqual(name.value as? String, "Native crew copy")
    app.buttons["native-e2e.crews.save"].tap()
    let copied = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "native-e2e.crews.saved.", "Native crew copy")).firstMatch
    XCTAssertTrue(copied.waitForExistence(timeout: 10))
    copied.press(forDuration: 1)
    app.buttons["Delete"].tap()
    app.buttons["Delete"].tap()
    try await poll { !copied.exists }
    XCTAssertTrue(seed.exists, "Deleting a copy must preserve other Crews")
    try await waitForJournal(hostID: "primary", operationID: "route:settings-write", count: 3)
  }

  func testNewThreadComposerClearsKeyboardOnFirstOpenReopenAndRotation() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses controlled composer catalogs.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/composer-controls-ready", method: "POST")
    try await pairUntilHome()
    _ = try await control(path: "/v1/checkpoints/composer-controls-ready", method: "POST")
    let create = app.buttons.matching(NSPredicate(format: "identifier IN %@", [
      "native-e2e.split-empty-new-task", "native-e2e.split-new-thread",
      "native-e2e.new-thread", "native-e2e.sidebar.new-thread",
    ])).firstMatch
    let prompt = app.textViews["native-e2e.new-thread-prompt"]
    let close = app.buttons["native-e2e.new-thread-close"]
    let send = app.buttons["native-e2e.new-thread-start"]
    for opening in 0..<2 {
      XCTAssertTrue(create.waitForExistence(timeout: 10)); create.tap()
      try await poll { prompt.exists && self.app.keyboards.firstMatch.exists }
      try await poll { prompt.isHittable && close.isHittable }
      let keyboardTop = app.keyboards.firstMatch.frame.minY
      XCTAssertTrue(send.exists)
      XCTAssertGreaterThan(send.frame.height, 0)
      XCTAssertGreaterThanOrEqual(prompt.frame.minY, app.frame.minY + 16)
      XCTAssertLessThanOrEqual(prompt.frame.maxY, keyboardTop + 4, "The input must clear the keyboard on opening \(opening)")
      XCTAssertLessThanOrEqual(send.frame.maxY, keyboardTop + 4, "The entire footer must clear the keyboard too")
      if opening == 0 { prompt.typeText("Keep this draft above the keyboard") }
      XCTAssertEqual(prompt.value as? String, "Keep this draft above the keyboard")
      try assertRenderedText("Keep this draft above the keyboard")
      let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      proof.name = "home-keyboard-visible-opening-\(opening)"; proof.lifetime = .keepAlways; add(proof)
      if opening == 0 {
        close.tap()
        try await poll { !self.app.keyboards.firstMatch.exists }
      }
    }
    try await rotateIPadJourney(to: .landscapeLeft)
    try await poll { self.app.keyboards.firstMatch.exists }
    try await poll { prompt.isHittable && close.isHittable }
    XCTAssertEqual(prompt.value as? String, "Keep this draft above the keyboard")
    XCTAssertLessThanOrEqual(send.frame.maxY, app.keyboards.firstMatch.frame.minY + 4)
    let landscape = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    landscape.name = "home-keyboard-visible-retained"; landscape.lifetime = .keepAlways; add(landscape)
    close.tap()
  }

  func testCrewPickerKeepsConfigurationAcrossRotation() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses controlled Crew catalogs and settings.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/crews-ready", method: "POST")
    try await pairUntilHome()
    _ = try await control(path: "/v1/checkpoints/crews-ready", method: "POST")
    let create = app.buttons.matching(NSPredicate(format: "identifier IN %@", [
      "native-e2e.split-empty-new-task", "native-e2e.split-new-thread",
      "native-e2e.new-thread", "native-e2e.sidebar.new-thread",
    ])).firstMatch
    XCTAssertTrue(create.waitForExistence(timeout: 10)); create.tap()
    let prompt = app.textViews["native-e2e.new-thread-prompt"]
    XCTAssertTrue(prompt.waitForExistence(timeout: 10))
    let beforeInput = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    beforeInput.name = "crew-new-thread-before-input"; beforeInput.lifetime = .keepAlways; add(beforeInput)
    try await poll { prompt.isHittable }
    if !app.keyboards.firstMatch.exists { prompt.tap() }
    try await poll { prompt.isHittable && self.app.keyboards.firstMatch.exists }
    XCTAssertLessThanOrEqual(prompt.frame.maxY, app.keyboards.firstMatch.frame.minY + 4,
      "The active input must remain above the keyboard")
    prompt.typeText("Keep the saved Crew selection")
    prompt.tap()
    XCTAssertTrue(prompt.exists, "Tapping inside an expanded composer must never dismiss it")
    XCTAssertEqual(prompt.value as? String, "Keep the saved Crew selection")
    try await poll { self.app.buttons["native-e2e.new-thread-start"].isEnabled }
    openNewThreadModelPicker()
    let singleModel = app.buttons["native-e2e.new-thread-model.codex.gpt-5"]
    XCTAssertTrue(singleModel.waitForExistence(timeout: 5)); singleModel.tap()
    XCTAssertEqual(prompt.value as? String, "Keep the saved Crew selection")
    openNewThreadModelPicker()
    let choice = app.buttons["native-e2e.new-thread-crew.native-review"]
    XCTAssertTrue(choice.waitForExistence(timeout: 10)); choice.tap()
    try await rotateIPadJourney(to: .landscapeLeft)
    XCTAssertEqual(prompt.value as? String, "Keep the saved Crew selection")
    let crew = app.buttons["native-e2e.composer.crew"]
    let combined = app.buttons["native-e2e.composer-selectors.combined"]
    try await poll { crew.isHittable || combined.isHittable }
    if crew.isHittable { crew.tap() } else {
      combined.tap()
      let edit = app.buttons["native-e2e.new-thread-crew.edit"]
      XCTAssertTrue(edit.waitForExistence(timeout: 5)); edit.tap()
    }
    XCTAssertTrue(app.buttons["native-e2e.crew.apply"].waitForExistence(timeout: 5))
    _ = scrollToCrewRole("reviewer")
    XCTAssertTrue(app.staticTexts["Fixture Review"].exists)
    app.buttons["native-e2e.crew.cancel"].tap()
    app.buttons["native-e2e.new-thread-close"].tap()
    try await waitForJournal(hostID: "primary", operationID: "route:settings-write", count: 1)
  }

  func testLiveCrewRosterKeepsRoleEditsAcrossRotation() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses controlled Crew catalogs and settings.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/crews-ready", method: "POST")
    try await pairUntilHome()
    _ = try await control(path: "/v1/checkpoints/crews-ready", method: "POST")
    let crew = app.buttons["native-e2e.composer.crew"]
    let combined = app.buttons["native-e2e.composer-selectors.combined"]
    let thread = app.buttons["native-e2e.thread.thread-fixture-001"]
    if !thread.isHittable { app.buttons["native-e2e.sidebar-toggle"].tap() }
    XCTAssertTrue(thread.waitForExistence(timeout: 5)); thread.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 10))
    let collapsed = app.buttons["native-e2e.composer-collapsed"]
    if collapsed.isHittable { collapsed.tap() }
    try await poll { crew.isHittable || combined.isHittable }
    if crew.isHittable { crew.tap() } else { combined.tap() }
    XCTAssertTrue(app.buttons["native-e2e.crew.apply"].waitForExistence(timeout: 5))
    let reviewer = scrollToCrewRole("reviewer")
    reviewer.tap()
    let brief = app.textFields["native-e2e.crew.role-brief"]
    XCTAssertTrue(brief.waitForExistence(timeout: 5))
    replaceCrewField(brief, with: "Preserve this live roster edit")
    try await rotateIPadJourney(to: .landscapeLeft)
    XCTAssertTrue(brief.waitForExistence(timeout: 10))
    XCTAssertEqual(brief.value as? String, "Preserve this live roster edit")
    app.navigationBars["Reviewer"].buttons.element(boundBy: 0).tap()
    app.buttons["native-e2e.crew.apply"].tap()
    if collapsed.isHittable { collapsed.tap() }
    try await poll { crew.isHittable || combined.isHittable }
    if crew.isHittable { crew.tap() } else { combined.tap() }
    scrollToCrewRole("reviewer").tap()
    XCTAssertEqual(brief.value as? String, "Preserve this live roster edit")
    let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    proof.name = "crew-live-roster-retained"; proof.lifetime = .keepAlways; add(proof)
    app.navigationBars["Reviewer"].buttons.element(boundBy: 0).tap()
    app.buttons["native-e2e.crew.cancel"].tap()
    if collapsed.isHittable { collapsed.tap() }
    try await poll { crew.isHittable || combined.isHittable }
    if crew.isHittable { crew.tap() } else { combined.tap() }
    XCTAssertTrue(app.buttons["native-e2e.crew.apply"].waitForExistence(timeout: 5))
    app.buttons["native-e2e.crew.actions"].tap()
    let handoff = app.buttons["native-e2e.crew.handoff"]
    XCTAssertTrue(handoff.waitForExistence(timeout: 5)); handoff.tap()
    XCTAssertTrue(app.buttons["native-e2e.thread.handoff-fork"].waitForExistence(timeout: 5),
      "The roster must dismiss before the existing provider handoff dialog opens")
    XCTAssertTrue(app.buttons["native-e2e.thread.handoff-move"].exists)
    let handoffProof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    handoffProof.name = "crew-roster-native-provider-handoff"; handoffProof.lifetime = .keepAlways; add(handoffProof)
    app.buttons["native-e2e.thread.handoff-fork"].firstMatch.tap()
    let cancelHandoff = app.buttons["native-e2e.thread.handoff-cancel"]
    XCTAssertTrue(cancelHandoff.waitForExistence(timeout: 5)); cancelHandoff.tap()
  }

  private func replaceCrewField(_ field: XCUIElement, with text: String) {
    field.tap()
    let old = field.value as? String ?? ""
    if !old.isEmpty {
      field.press(forDuration: 1)
      let selectAll = app.menuItems["Select All"]
      XCTAssertTrue(selectAll.waitForExistence(timeout: 5))
      selectAll.tap()
    }
    field.typeText(text)
    XCTAssertEqual(field.value as? String, text)
  }

  func assertRenderedText(_ expected: String) throws {
    let visible = try renderedScreenText()
    XCTAssertTrue(visible.localizedCaseInsensitiveContains(expected),
      "The screenshot must show '\(expected)'; recognized text: '\(visible)'")
  }

  func renderedScreenText(in snapshot: XCUIScreenshot? = nil) throws -> String {
    let screenshot = snapshot ?? XCUIScreen.main.screenshot()
    let image = try XCTUnwrap(screenshot.image.cgImage)
    return try recognizedText(in: image)
  }

  private func recognizedText(in image: CGImage) throws -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["en-US"]
    try VNImageRequestHandler(cgImage: image).perform([request])
    return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
      .joined(separator: " ").replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
  }

  private func scrollToCrewRole(_ id: String) -> XCUIElement {
    let role = app.buttons["native-e2e.crew.role.\(id)"]
    let form = app.collectionViews["native-e2e.crew.roster-form"]
    for _ in 0..<4 {
      if role.isHittable { break }
      // The middle of a short form can be a segmented picker. Scroll along
      // its margin so the gesture belongs to the collection, not a control.
      form.coordinate(withNormalizedOffset: CGVector(dx: 0.98, dy: 0.85))
        .press(forDuration: 0.1, thenDragTo: form.coordinate(withNormalizedOffset: CGVector(dx: 0.98, dy: 0.25)))
    }
    XCTAssertTrue(role.isHittable, "The role remains reachable in a short native form")
    return role
  }

  func testSideChatQuotesWaitForInputAndSlashCommandStartsAnIndependentQuestion() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses synthetic side-chat conversations.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/side-chat-ready", method: "POST")
    try await pairAndOpenFixtureThread()
    if app.frame.width >= 600 {
      try await rotateIPadJourney(to: .landscapeLeft)
    }
    app.staticTexts["Fixture response"].press(forDuration: 1)
    let ask = app.buttons["Ask in side chat"]
    XCTAssertTrue(ask.waitForExistence(timeout: 5))
    ask.tap()
    let initial = app.textViews["native-e2e.new-thread-prompt"]
    XCTAssertTrue(initial.waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["“Fixture response”"].exists)
    let before = try await scenarioState().host("primary")
    XCTAssertFalse(before.observedOperationIds.contains("route:thread-command"), "Quoting must wait for the user's question")
    initial.tap()
    initial.typeText("Explain quoted message")
    app.buttons["native-e2e.new-thread-start"].tap()
    XCTAssertTrue(app.staticTexts["Side reply: Explain quoted message"].waitForExistence(timeout: 15))
    app.buttons["native-e2e.side-chat.hide"].tap()
    app.staticTexts["Fixture response"].press(forDuration: 1)
    XCTAssertTrue(ask.waitForExistence(timeout: 5))
    ask.tap()
    let quotedFollowUp = app.textViews["native-e2e.composer"]
    XCTAssertTrue(quotedFollowUp.waitForExistence(timeout: 10),
      "Quoting into an existing side chat must expand its editor after consuming the queued context")
    XCTAssertTrue(app.staticTexts["“Fixture response”"].exists)
    quotedFollowUp.tap()
    quotedFollowUp.typeText("Explain this again")
    app.buttons["native-e2e.send"].tap()
    XCTAssertTrue(app.staticTexts["Side reply: Explain this again"].waitForExistence(timeout: 15))
    XCTAssertTrue(app.staticTexts["Side reply: Explain quoted message"].exists)
    app.buttons["native-e2e.side-chat.hide"].tap()
    let parent = app.buttons["native-e2e.composer-collapsed"]
    XCTAssertTrue(parent.waitForExistence(timeout: 10))
    parent.tap()
    let input = app.textViews["native-e2e.composer"]
    XCTAssertTrue(input.waitForExistence(timeout: 10))
    input.tap()
    input.typeText("/btw Separate question")
    app.buttons["native-e2e.send"].tap()
    XCTAssertTrue(app.staticTexts["Side reply: Separate question"].waitForExistence(timeout: 20),
      "/btw must transfer and start the side question, including the model/configuration and context")
    let side = app.descendants(matching: .any).matching(identifier: "native-e2e.side-chat.surface").firstMatch
    XCTAssertFalse(side.staticTexts["/btw Separate question"].exists)
    let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    proof.name = "side-chat-quote-and-slash-command"
    proof.lifetime = .keepAlways
    add(proof)
    app.buttons["native-e2e.side-chat.hide"].tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.staticTexts["Separate question"].exists, "The side question must not be inserted in the parent")
  }

  func testSideChatKeepsTheQuestionWhenParentContextCannotBeRead() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses a bounded source-history fault.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/side-chat-ready", method: "POST")
    try await pairAndOpenFixtureThread()
    app.buttons["native-e2e.composer-collapsed"].tap()
    let add = app.buttons["native-e2e.composer.add"]
    let inputProof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    inputProof.name = "parent-composer-above-keyboard"
    inputProof.lifetime = .keepAlways
    self.add(inputProof)
    XCTAssertTrue(add.isHittable, "The composer Add menu must remain tappable above the keyboard")
    add.tap()
    app.buttons["native-e2e.composer.side-chat"].tap()
    let input = app.textViews["native-e2e.new-thread-prompt"]
    XCTAssertTrue(input.waitForExistence(timeout: 10))
    input.tap()
    input.typeText("Keep my side question")
    _ = try await control(path: "/v1/faults/html-body-parent-history", method: "POST")
    app.buttons["native-e2e.new-thread-start"].tap()
    XCTAssertTrue(app.staticTexts["Could not read the parent conversation. Your question was not sent."].waitForExistence(timeout: 15))
    XCTAssertEqual(input.value as? String, "Keep my side question")
    let observed = try await scenarioState().host("primary")
    XCTAssertFalse(observed.observedOperationIds.contains("route:thread-command"), "A failed context read must never create a context-free side chat")
    _ = try await control(path: "/v1/faults/clear", method: "POST")
    app.buttons["native-e2e.new-thread-start"].tap()
    XCTAssertTrue(app.staticTexts["Side reply: Keep my side question"].waitForExistence(timeout: 15))
  }

  func testSideChatKeepsAnUnsentReplyAcrossRotation() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses synthetic side-chat conversations.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/side-chat-ready", method: "POST")
    try await pairAndOpenFixtureThread()
    app.buttons["native-e2e.composer-collapsed"].tap()
    let addMenu = app.buttons["native-e2e.composer.add"]
    let keyboardProof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    keyboardProof.name = "parent-composer-above-keyboard"
    keyboardProof.lifetime = .keepAlways
    add(keyboardProof)
    XCTAssertTrue(addMenu.isHittable, "The active composer must stay reachable above the keyboard")
    addMenu.tap()
    app.buttons["native-e2e.composer.side-chat"].tap()
    let initial = app.textViews["native-e2e.new-thread-prompt"]
    XCTAssertTrue(initial.waitForExistence(timeout: 10))
    initial.tap()
    initial.typeText("Rotation source question")
    app.buttons["native-e2e.new-thread-start"].tap()
    let surface = app.descendants(matching: .any).matching(identifier: "native-e2e.side-chat.surface").firstMatch
    XCTAssertTrue(surface.staticTexts["Side reply: Rotation source question"].waitForExistence(timeout: 15))
    surface.buttons["native-e2e.composer-collapsed"].tap()
    let editor = surface.textViews["native-e2e.composer"]
    XCTAssertTrue(editor.waitForExistence(timeout: 10))
    editor.tap()
    let unsent = "Keep this reply across the panel and sheet"
    editor.typeText(unsent)
    for orientation in journeyOrientations {
      try await rotateIPadJourney(to: orientation)
      let collapsed = surface.buttons["native-e2e.composer-collapsed"]
      if collapsed.waitForExistence(timeout: 2), collapsed.isHittable { collapsed.tap() }
      XCTAssertTrue(editor.waitForExistence(timeout: 10))
      XCTAssertEqual(editor.value as? String, unsent, "An adaptive presentation must retain the unsent reply")
      if orientation.isLandscape { try await assertKeyboardMovesOnlyTheActiveComposer(in: surface) }
      let combined = surface.descendants(matching: .any).matching(identifier: "native-e2e.composer-selectors.combined").firstMatch
      if combined.exists {
        XCTAssertGreaterThan(combined.frame.width, 100, "Combined selector text needs a readable measure")
        XCTAssertLessThanOrEqual(combined.frame.height, 80, "Selector values must not wrap one character per line")
      }
      let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      proof.name = orientation.isLandscape ? "side-chat-adaptive-landscape-draft" : "side-chat-adaptive-portrait-draft"
      proof.lifetime = .keepAlways
      add(proof)
    }
    surface.buttons["native-e2e.send"].tap()
    XCTAssertTrue(surface.staticTexts["Side reply: \(unsent)"].waitForExistence(timeout: 15))
    app.buttons["native-e2e.side-chat.hide"].tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 10))
  }

  private func assertKeyboardMovesOnlyTheActiveComposer(in surface: XCUIElement) async throws {
    surface.buttons["native-e2e.composer-collapse"].tap()
    try await poll { !self.app.keyboards.firstMatch.exists }
    let resting = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    resting.name = "side-chat-workspace-keyboard-hidden"
    resting.lifetime = .keepAlways
    add(resting)
    let workspace = app.buttons["native-e2e.sidebar.workspaces"]
    let workspaceY = workspace.exists ? workspace.frame.minY : nil
    let idleComposer = app.buttons.matching(identifier: "native-e2e.composer-collapsed").allElementsBoundByIndex.first {
      $0.frame.width > 100 && $0.frame.maxX <= surface.frame.minX + 1
    }
    let idleY = idleComposer?.frame.minY
    surface.buttons["native-e2e.composer-collapsed"].tap()
    try await poll { self.app.keyboards.firstMatch.exists }
    let send = surface.buttons["native-e2e.send"]
    XCTAssertTrue(send.waitForExistence(timeout: 10))
    XCTAssertLessThanOrEqual(send.frame.maxY, app.keyboards.firstMatch.frame.minY + 2,
      "The active input must stay above the docked keyboard")
    if let workspaceY { XCTAssertEqual(workspace.frame.minY, workspaceY, accuracy: 1, "The sidebar must retain its viewport") }
    if let idleY, let idleComposer { XCTAssertEqual(idleComposer.frame.minY, idleY, accuracy: 1, "An inactive composer must stay in place") }
  }

  func testSideChatUsesPrivateContextAndKeepsTheParentTranscriptLive() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses an independent synthetic side-chat runtime.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/side-chat-ready", method: "POST")
    try await pairAndOpenFixtureThread()
    let wide = app.frame.width >= 600
    if wide {
      try await rotateIPadJourney(to: .landscapeLeft)
    }
    let parentComposer = app.buttons["native-e2e.composer-collapsed"]
    XCTAssertTrue(parentComposer.waitForExistence(timeout: 10))
    parentComposer.tap()
    app.buttons["native-e2e.composer.add"].tap()
    let open = app.buttons["native-e2e.composer.side-chat"]
    XCTAssertTrue(open.waitForExistence(timeout: 5))
    open.tap()
    let initial = app.textViews["native-e2e.new-thread-prompt"]
    XCTAssertTrue(initial.waitForExistence(timeout: 10))
    initial.tap()
    initial.typeText("First side question")
    let launch = app.buttons["native-e2e.new-thread-start"]
    XCTAssertTrue(launch.isEnabled)
    launch.tap()
    let surface = app.descendants(matching: .any).matching(identifier: "native-e2e.side-chat.surface").firstMatch
    XCTAssertTrue(surface.waitForExistence(timeout: 15))
    XCTAssertTrue(surface.staticTexts["Side reply: First side question"].waitForExistence(timeout: 15))
    XCTAssertFalse(surface.staticTexts["Fixture response"].exists)
    XCTAssertFalse(surface.staticTexts["Private parent tool result"].exists,
      "The parent snapshot belongs only to the provider input")
    _ = try await control(path: "/v1/checkpoints/side-chat-parent-updated", method: "POST")
    if wide {
      XCTAssertTrue(app.staticTexts["Parent context changed"].waitForExistence(timeout: 10),
        "The parent must keep receiving its own events beside Side chat")
    }
    let compact = surface.buttons["native-e2e.composer-collapsed"]
    XCTAssertTrue(compact.waitForExistence(timeout: 10))
    compact.tap()
    let followUp = surface.textViews["native-e2e.composer"]
    XCTAssertTrue(followUp.waitForExistence(timeout: 10))
    followUp.tap()
    followUp.typeText("Second side question")
    surface.buttons["native-e2e.send"].tap()
    XCTAssertTrue(surface.staticTexts["Side reply: Second side question"].waitForExistence(timeout: 15))
    try await waitForJournal(hostID: "primary", operationID: "route:thread-history-items", count: 2)
    let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    proof.name = wide ? "side-chat-ipad-landscape-live-parent" : "side-chat-phone-private-context"
    proof.lifetime = .keepAlways
    add(proof)
    app.buttons["native-e2e.side-chat.hide"].tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 10))
    XCTAssertTrue(parentComposer.waitForExistence(timeout: 10))
    parentComposer.tap()
    app.buttons["native-e2e.composer.add"].tap()
    app.buttons["native-e2e.composer.side-chat"].tap()
    XCTAssertTrue(surface.staticTexts["Side reply: First side question"].waitForExistence(timeout: 10))
    XCTAssertTrue(surface.staticTexts["Side reply: Second side question"].exists,
      "Hiding and reopening must retain the independent conversation")
    app.buttons["native-e2e.side-chat.more"].tap()
    app.buttons["Close side chat"].firstMatch.tap()
    let close = app.buttons["Close side chat"].firstMatch
    XCTAssertTrue(close.waitForExistence(timeout: 5))
    close.tap()
    try await waitForJournal(hostID: "primary", operationID: "route:thread-command", count: 2)
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 10),
      "Closing the owned auxiliary conversation must leave the parent intact")
  }

  func testTranscriptShowsTurnTimesAndCompactComposerOpensBeforeSelectors() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses controlled completed-turn metadata.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/thread-timing-ready", method: "POST")
    try await pairAndOpenFixtureThread(expectedResponse: "The first change is complete.")
    if app.frame.width >= 600 {
      try await rotateIPadJourney(to: .landscapeLeft)
    }
    XCTAssertTrue(app.staticTexts["Review the first change"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["Inspect the related files"].exists)
    let times = app.staticTexts.matching(identifier: "native-e2e.user-message-time")
    let completed = app.staticTexts.matching(identifier: "native-e2e.turn-completed-time")
    try await poll { times.count == 2 && completed.count == 2 }
    XCTAssertEqual(app.staticTexts.matching(identifier: "native-e2e.assistant-message-time").count, 1)
    XCTAssertGreaterThanOrEqual(app.staticTexts["Inspect the related files"].frame.minY - completed.element(boundBy: 0).frame.maxY, 16,
      "The next user turn needs breathing room after the previous turn's footer")
    let group = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", "Expand activity")).firstMatch
    XCTAssertTrue(group.exists, "The tool-only duration must be visible while its group is collapsed")
    let frozen = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    frozen.name = "transcript-completed-turn-times"
    frozen.lifetime = .keepAlways
    add(frozen)
    _ = try await control(path: "/v1/checkpoints/thread-timing-live", method: "POST")
    let elapsed = app.descendants(matching: .any).matching(identifier: "native-e2e.turn-elapsed").firstMatch
    XCTAssertTrue(elapsed.waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["native-e2e.interrupt"].exists,
      "A refreshed live status must also offer the Stop action")
    let collapsed = app.buttons["native-e2e.composer-collapsed"]
    XCTAssertTrue(collapsed.exists)
    if app.frame.width < 600 {
      XCTAssertFalse(app.buttons["native-e2e.composer.model"].exists,
        "Compact collapsed content is informational; it must open the editor first")
    }
    let compact = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    compact.name = "transcript-live-time-compact-composer"
    compact.lifetime = .keepAlways
    add(compact)
    collapsed.tap()
    XCTAssertTrue(app.textViews["native-e2e.composer"].waitForExistence(timeout: 10))
    if !app.buttons["native-e2e.composer.model"].exists {
      let combined = app.buttons["native-e2e.composer-selectors.combined"]
      XCTAssertTrue(combined.waitForExistence(timeout: 5))
      combined.tap()
      let model = app.buttons["native-e2e.composer-controls.model"]
      XCTAssertTrue(model.waitForExistence(timeout: 5))
      XCTAssertTrue(model.isEnabled)
      model.tap()
      let option = app.buttons["Fixture model"].firstMatch
      XCTAssertTrue(option.waitForExistence(timeout: 5))
      option.tap()
      app.buttons["Save"].tap()
    }
    let live = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    live.name = "transcript-live-time-and-expanded-composer"
    live.lifetime = .keepAlways
    add(live)
  }

  func testNewThreadPluginsAndWorkspaceMCPSelectionsPersist() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses scoped fixture tool catalogs.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/composer-tools-ready", method: "POST")
    try await pairUntilHome()
    let create = app.buttons.matching(NSPredicate(format: "identifier IN %@", [
      "native-e2e.split-empty-new-task", "native-e2e.split-new-thread",
      "native-e2e.new-thread", "native-e2e.sidebar.new-thread",
    ])).firstMatch
    XCTAssertTrue(create.waitForExistence(timeout: 10))
    create.tap()
    let addButton = app.buttons["native-e2e.new-thread-add"]
    XCTAssertTrue(addButton.waitForExistence(timeout: 10))
    addButton.tap()
    let plugins = app.buttons["native-e2e.new-thread-plugins"]
    XCTAssertTrue(plugins.waitForExistence(timeout: 5))
    plugins.tap()
    let browser = app.switches["native-e2e.composer-plugin.browser"]
    XCTAssertTrue(browser.waitForExistence(timeout: 10))
    XCTAssertEqual(browser.value as? String, "0")
    browser.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
    try await poll { browser.value as? String == "1" && browser.isEnabled }
    app.buttons["Done"].tap()
    addButton.tap()
    app.buttons["native-e2e.new-thread-mcp"].tap()
    let server = app.switches["native-e2e.composer-mcp.workspace-review"]
    XCTAssertTrue(server.waitForExistence(timeout: 10))
    XCTAssertFalse(app.switches["native-e2e.composer-mcp.global-review"].exists,
      "A workspace server with the same name overrides the global row")
    XCTAssertTrue(app.switches["native-e2e.composer-mcp.global-build"].exists)
    XCTAssertEqual(server.value as? String, "0")
    server.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
    try await poll { server.value as? String == "1" && server.isEnabled }
    let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    proof.name = "composer-workspace-mcp-selections"
    proof.lifetime = .keepAlways
    add(proof)
    app.buttons["Done"].tap()
    addButton.tap()
    app.buttons["native-e2e.new-thread-plugins"].tap()
    XCTAssertTrue(browser.waitForExistence(timeout: 10))
    XCTAssertEqual(browser.value as? String, "1")
    app.buttons["Done"].tap()
    addButton.tap()
    app.buttons["native-e2e.new-thread-mcp"].tap()
    XCTAssertTrue(server.waitForExistence(timeout: 10))
    XCTAssertEqual(server.value as? String, "1")
    try await waitForJournal(hostID: "primary", operationID: "route:settings-write", count: 1)
    try await waitForJournal(hostID: "primary", operationID: "route:mcp-settings-command", count: 1)
  }

  func testPermissionFamilyResolvesOpenedRequest() async throws {
    try XCTSkipIf(
      peerMode == .real,
      "The permission family drives mock-only request-opened frame fixtures."
    )
    _ = try await control(path: "/v1/reset", method: "POST")
    try await pairAndOpenFixtureThread()
    _ = try await control(path: "/v1/frames/runtime-live-request-opened", method: "POST")
    let allow = app.buttons["native-e2e.request.option.allow"]
    XCTAssertTrue(allow.waitForExistence(timeout: 15))
    allow.tap()
    try await waitForJournal(hostID: "primary", operationID: "route:request-resolve", count: 1)
  }

  func testLongApprovalKeepsDecisionsReachableAcrossDisplays() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses a disposable approval request.")
    let isPad = UIDevice.current.userInterfaceIdiom == .pad
    XCUIDevice.shared.orientation = isPad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    try await pairAndOpenFixtureThread()
    _ = try await control(path: "/v1/checkpoints/long-approval-ready", method: "POST")

    let allow = app.buttons["native-e2e.request.option.allow"]
    let deny = app.buttons["native-e2e.request.option.deny"]
    let context = app.scrollViews["native-e2e.request.context"].firstMatch
    XCTAssertTrue(allow.waitForExistence(timeout: 15))
    utilityProof("approval-summary")
    XCTAssertTrue(toolbarActionClearsKeyboard(allow) && allow.isHittable)
    XCTAssertTrue(toolbarActionClearsKeyboard(deny) && deny.isHittable)
    XCTAssertTrue(context.exists, "A long summary must have a scrollable reading area.")

    let disclosure = app.buttons["native-e2e.request.details"].firstMatch
    for _ in 0..<4 where !disclosure.isHittable {
      context.swipeUp(velocity: .fast)
    }
    XCTAssertTrue(disclosure.isHittable, "The full summary and details must remain reachable.")
    disclosure.tap()
    for _ in 0..<4 {
      if try renderedScreenText().contains("Fixture detail 18") { break }
      context.swipeUp(velocity: .fast)
    }
    try assertRenderedText("Fixture detail 18")
    utilityProof("approval-details")

    // Leave the reader between the two ends to exercise an interior anchor.
    let dragStart = context.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.2))
    let dragEnd = context.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7))
    dragStart.press(forDuration: 0.1, thenDragTo: dragEnd, withVelocity: .slow, thenHoldForDuration: 0.25)
    let visible = try renderedScreenText()
    let readingLines = (8...17).map { "Fixture detail \($0)" }.filter { visible.contains($0) }
    let readingLine = try XCTUnwrap(readingLines.dropFirst(readingLines.count / 2).first)
    XCTAssertFalse(visible.contains("Fixture detail 18"))
    utilityProof("approval-reading-position")

    try await assertNativeDuoDisplayTransitions("approval-details", content: context, availableAction: nil) { _ in
      try await self.poll {
        guard self.toolbarActionClearsKeyboard(allow), self.toolbarActionClearsKeyboard(deny),
          allow.isHittable, deny.isHittable
        else { return false }
        let text = try self.renderedScreenText(in: context.screenshot())
        return text.contains(readingLine) && !text.contains("Fixture detail 18")
      }
    }
    XCTAssertTrue(allow.isHittable && deny.isHittable)
    allow.tap()
    try await waitForJournal(hostID: "primary", operationID: "route:request-resolve", count: 1)
    _ = try await control(path: "/v1/checkpoints/long-approval-resolved", method: "POST")
    try await poll { !allow.exists && !deny.exists }
    let resolutions = try await journalCount(hostID: "primary", operationID: "route:request-resolve")
    XCTAssertEqual(resolutions, 1)

    _ = try await control(path: "/v1/checkpoints/long-approval-ready", method: "POST")
    XCTAssertTrue(allow.waitForExistence(timeout: 10))
    try assertRenderedText("Review the fixture inspection")
  }

  func testEditableRequestsKeepDraftsAndSubmitAfterDisplayChanges() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses disposable requests.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    try await pairAndOpenFixtureThread()
    _ = try await control(path: "/v1/checkpoints/request-form-question-ready", method: "POST")

    let edit = app.buttons["native-e2e.request.form-edit"].firstMatch
    let submit = app.buttons["native-e2e.request.form-submit"].firstMatch
    let green = app.buttons["native-e2e.request.field.color.option.green"].firstMatch
    let caption = app.descendants(matching: .any)["native-e2e.request.field.caption"].firstMatch
    XCTAssertTrue(edit.waitForExistence(timeout: 12))
    edit.tap()
    XCTAssertTrue(submit.waitForExistence(timeout: 10))
    XCTAssertFalse(submit.isEnabled)
    green.tap()
    XCTAssertFalse(submit.isEnabled)
    caption.tap()
    caption.typeText("Gallery draft")
    XCTAssertEqual(caption.value as? String, "Gallery draft")
    XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
    try await poll {
      self.toolbarActionClearsKeyboard(caption) && caption.isHittable
        && self.toolbarActionClearsKeyboard(submit) && submit.isHittable
    }
    utilityProof("agent-question-filled")
    try await assertNativeDuoDisplayTransitions("agent-question", content: caption, availableAction: nil) { pose in
      try await self.poll {
        caption.value as? String == "Gallery draft"
          && self.toolbarActionClearsKeyboard(caption) && caption.isHittable
          && self.toolbarActionClearsKeyboard(submit) && submit.isHittable
      }
      XCTAssertEqual(caption.value as? String, "Gallery draft", pose)
    }
    submit.tap()
    try await waitForJournal(hostID: "primary", operationID: "route:request-resolve", count: 1)
    try await poll { !submit.exists }
    _ = try await control(path: "/v1/checkpoints/request-form-resolved", method: "POST")
    try await poll { !edit.exists }

    _ = try await control(path: "/v1/checkpoints/request-form-elicitation-ready", method: "POST")
    XCTAssertTrue(edit.waitForExistence(timeout: 10))
    edit.tap()
    XCTAssertTrue(submit.waitForExistence(timeout: 10))
    XCTAssertFalse(submit.isEnabled)
    let detailed = app.buttons["native-e2e.request.field.mode.option.detailed"].firstMatch
    detailed.tap()
    try await poll { self.toolbarActionClearsKeyboard(submit) && submit.isHittable }
    utilityProof("mcp-form-filled")
    submit.tap()
    try await waitForJournal(hostID: "primary", operationID: "route:request-resolve", count: 2)
    _ = try await control(path: "/v1/checkpoints/request-form-resolved", method: "POST")
    try await poll { !edit.exists && !submit.exists }
    let resolutions = try await journalCount(hostID: "primary", operationID: "route:request-resolve")
    XCTAssertEqual(resolutions, 2)
  }

  func testURLRequestKeepsItsDesktopAfterVisitingSafariAndFolding() async throws {
    let endpoint = ProcessInfo.processInfo.environment["NATIVE_E2E_URL_REQUEST_PROBE"]
    try XCTSkipUnless(peerMode == .mock && endpoint != nil, "This journey opens only the disposable browser fixture.")
    let probe = try XCTUnwrap(endpoint.flatMap(URL.init(string:)))
    func status(_ stage: String) async throws -> Int? {
      var request = URLRequest(url: probe.appendingPathComponent(stage))
      request.httpMethod = "POST"
      request.setValue("Harness \(capability)", forHTTPHeaderField: "Authorization")
      let (_, response) = try await URLSession.shared.data(for: request)
      return (response as? HTTPURLResponse)?.statusCode
    }
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()
    let prepared = try await status("prepare")
    XCTAssertEqual(prepared, 204)
    let thread = navigationHostThread(label: "Navigation Host A")
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
    let edit = app.buttons["native-e2e.request.form-edit"].firstMatch
    XCTAssertTrue(edit.waitForExistence(timeout: 15)); edit.tap()
    let link = app.descendants(matching: .any).matching(identifier: "native-e2e.request.form-link").firstMatch
    let decline = app.buttons["native-e2e.request.form-decline"].firstMatch
    XCTAssertTrue(link.waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["Review the connection on desktop A"].exists)
    XCTAssertFalse(app.buttons["native-e2e.request.form-submit"].exists)
    try await tapNativeToolbarActionAfterDisplayTransition(link)
    let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
    XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 15))
    try await poll { try await status("visited") == 204 }
    if ProcessInfo.processInfo.environment["NATIVE_E2E_DUO_TRANSITION_URL"] == nil {
      XCTAssertTrue(safari.staticTexts["Browser fixture for desktop A"].firstMatch.waitForExistence(timeout: 15))
    }
    utilityProof("url-request-safari")
    app.activate()
    utilityProof("url-request-foreground")
    try await poll { link.isHittable && decline.isEnabled }
    XCTAssertTrue(app.staticTexts["Review the connection on desktop A"].exists)
    try await assertNativeDuoDisplayTransitions("url-request", content: link, availableAction: decline) { _ in
      XCTAssertTrue(self.app.staticTexts["Review the connection on desktop A"].exists)
    }
    utilityProof("url-request-returned")
    try await tapNativeToolbarActionAfterDisplayTransition(decline)
    try await waitForJournal(hostID: "primary", operationID: "route:request-resolve", count: 1)
    try await poll { !link.exists }
    let acknowledged = try await status("declined")
    XCTAssertEqual(acknowledged, 204)
    let writesOnA = try await journalCount(hostID: "primary", operationID: "route:request-resolve")
    let writesOnB = try await journalCount(hostID: "collision-b", operationID: "route:request-resolve")
    XCTAssertEqual(writesOnA, 1)
    XCTAssertEqual(writesOnB, 0)
  }

  func testProviderHandoffMoveKeepsSourceAndDraftAcrossDisplays() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses a disposable provider handoff fixture.")
    try await openProviderHandoffFixture("provider-handoff-ready")

    let cancel = app.buttons["native-e2e.thread.handoff-cancel"].firstMatch
    try await openProviderHandoff("fork")
    XCTAssertTrue(cancel.waitForExistence(timeout: 8))
    try await tapNativeToolbarActionAfterDisplayTransition(cancel)
    try await poll { !cancel.exists }
    let cancelledWrites = try await journalCount(hostID: "primary", operationID: "route:thread-command")
    XCTAssertEqual(cancelledWrites, 0)

    try await openProviderHandoff("move")
    let prompt = app.textViews["native-e2e.new-thread-prompt"].firstMatch
    XCTAssertTrue(prompt.waitForExistence(timeout: 10)); prompt.tap()
    let value = "Continue this fixture handoff"
    prompt.typeText(value)
    let start = app.buttons["native-e2e.new-thread-start"].firstMatch
    try await poll { self.toolbarActionClearsKeyboard(start) && start.isHittable }
    XCTAssertTrue(app.keyboards.firstMatch.exists)
    utilityProof("provider-handoff-draft")
    try await assertDraftSurvivesDisplayTransitions("provider-handoff", field: prompt, value: value, availableAction: start)
    try await tapNativeToolbarActionAfterDisplayTransition(start)
    try await waitForJournal(hostID: "primary", operationID: "route:thread-command", count: 2)
    try await poll { !cancel.exists && !prompt.exists }
    if UIDevice.current.userInterfaceIdiom == .pad {
      let inspector = app.buttons["native-e2e.inspector-toggle"].firstMatch
      try await poll { inspector.isHittable }
    }
    utilityProof("provider-handoff-after-launch")
    let sourceWrites = try await journalCount(hostID: "primary", operationID: "route:thread-command")
    let overlappingIDWrites = try await journalCount(hostID: "collision-b", operationID: "route:thread-command")
    XCTAssertEqual(sourceWrites, 2)
    XCTAssertEqual(overlappingIDWrites, 0)
  }

  func testChatProviderSwitchKeepsTheSameThreadAcrossDisplays() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses a disposable provider switch fixture.")
    try await openProviderHandoffFixture("provider-switch-ready")
    try await openProviderHandoff("move")
    let prompt = app.textViews["native-e2e.new-thread-prompt"].firstMatch
    XCTAssertTrue(prompt.waitForExistence(timeout: 10)); prompt.tap()
    let value = "Continue inside this conversation"
    prompt.typeText(value)
    let start = app.buttons["native-e2e.new-thread-start"].firstMatch
    try await poll { self.toolbarActionClearsKeyboard(start) && start.isHittable }
    XCTAssertTrue(app.keyboards.firstMatch.exists)
    utilityProof("provider-switch-draft")
    try await assertDraftSurvivesDisplayTransitions("provider-switch", field: prompt, value: value, availableAction: start)
    try await tapNativeToolbarActionAfterDisplayTransition(start)
    try await waitForJournal(hostID: "primary", operationID: "route:thread-start-existing", count: 1)
    let divider = app.descendants(matching: .any).matching(identifier: "native-e2e.transcript.provider-handoff").firstMatch
    XCTAssertTrue(divider.waitForExistence(timeout: 15))
    utilityProof("provider-switch-in-existing-thread")
    XCTAssertTrue(divider.label.contains("Fixture Reviewer"), divider.label)
    XCTAssertTrue(app.staticTexts["Fixture response"].exists)
    for host in ["primary", "collision-b"] {
      let switches = try await journalCount(hostID: host, operationID: "route:thread-start-existing")
      let threadCommands = try await journalCount(hostID: host, operationID: "route:thread-command")
      XCTAssertEqual(switches, host == "primary" ? 1 : 0)
      XCTAssertEqual(threadCommands, 0)
    }
  }

  private func openProviderHandoffFixture(_ checkpoint: String) async throws {
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()
    _ = try await control(path: "/v1/checkpoints/\(checkpoint)", method: "POST")
    let sourceThread = navigationHostThread(label: "Navigation Host A")
    revealNavigationThread(sourceThread)
    XCTAssertTrue(sourceThread.waitForExistence(timeout: 10)); sourceThread.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 15))
    if UIDevice.current.userInterfaceIdiom == .pad { utilityProof("thread-navigation-controls") }
  }

  private func openProviderHandoff(_ mode: String) async throws {
    let actions = app.descendants(matching: .any).matching(identifier: "native-e2e.thread.actions").firstMatch
    XCTAssertTrue(actions.waitForExistence(timeout: 5), app.debugDescription)
    try await tapNativeToolbarActionAfterDisplayTransition(actions)
    let handoff = app.descendants(matching: .any).matching(identifier: "native-e2e.thread.handoff").firstMatch
    XCTAssertTrue(handoff.waitForExistence(timeout: 8))
    try await poll { handoff.isHittable }
    try await tapNativeToolbarActionAfterDisplayTransition(handoff)
    let choice = app.buttons["native-e2e.thread.handoff-\(mode)"].firstMatch
    XCTAssertTrue(choice.waitForExistence(timeout: 5))
    try await tapNativeToolbarActionAfterDisplayTransition(choice)
  }

  func testNewThreadDraftSurvivesCompactAndSplitTransitions() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses a synthetic project and does not start a provider.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    try await pairUntilHome()
    let create = app.buttons["native-e2e.new-thread"]
    XCTAssertTrue(create.waitForExistence(timeout: 10))
    create.tap()
    let prompt = app.textViews["native-e2e.new-thread-prompt"]
    XCTAssertTrue(prompt.waitForExistence(timeout: 10))
    prompt.tap()
    let draft = "Draft follows display changes"
    prompt.typeText(draft)
    XCTAssertEqual(prompt.value as? String, draft)
    try await rotateIPadJourney(to: .landscapeLeft)
    XCTAssertTrue(prompt.waitForExistence(timeout: 10))
    XCTAssertEqual(prompt.value as? String, draft)
    try await rotateIPadJourney(to: .portrait)
    XCTAssertTrue(prompt.waitForExistence(timeout: 10))
    XCTAssertEqual(prompt.value as? String, draft)
    let proof = XCTAttachment(screenshot: app.screenshot())
    proof.name = "new-thread-draft-retained"
    proof.lifetime = .keepAlways
    add(proof)
  }

  func testNewThreadSelectorsPreserveChoicesAndOfferOtherProviders() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses synthetic capability inventories.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    try await pairUntilHome()
    try await rotateIPadJourney(to: .landscapeLeft)
    _ = try await control(path: "/v1/checkpoints/composer-controls-ready", method: "POST")
    let create = app.buttons.matching(NSPredicate(format: "identifier IN %@", [
      "native-e2e.split-empty-new-task", "native-e2e.split-new-thread", "native-e2e.new-thread",
      "native-e2e.sidebar.new-thread",
    ])).firstMatch
    XCTAssertTrue(create.waitForExistence(timeout: 10))
    create.tap()
    let prompt = app.textViews["native-e2e.new-thread-prompt"]
    XCTAssertTrue(prompt.waitForExistence(timeout: 10))
    prompt.tap()
    let text = "Keep these composer choices"
    prompt.typeText(text)
    XCTAssertEqual(prompt.value as? String, text)
    let closeComposer = app.buttons["native-e2e.new-thread-close"]
    XCTAssertTrue(closeComposer.isHittable)
    XCTAssertLessThanOrEqual(closeComposer.frame.maxY, prompt.frame.minY,
      "Closing the new draft belongs in its header, above the input")
    let layoutProof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    layoutProof.name = "new-thread-controls-keyboard-layout"
    layoutProof.lifetime = .keepAlways
    add(layoutProof)
    let keyboard = app.keyboards.firstMatch
    if keyboard.exists {
      let send = app.buttons["native-e2e.new-thread-start"]
      XCTAssertTrue(send.exists)
      XCTAssertLessThanOrEqual(send.frame.maxY, keyboard.frame.minY,
        "The new-thread action row must remain above the software keyboard")
    }
    let combined = app.buttons["native-e2e.composer-selectors.combined"]
    let model = app.buttons["native-e2e.composer.model"]
    try await poll {
      (combined.exists && (combined.value as? String)?.contains("Fixture Pro") == true)
        || (model.exists && (model.value as? String)?.contains("Fixture Pro") == true)
    }
    let effort = app.buttons["native-e2e.composer.effort"]
    if effort.exists && effort.isHittable {
      effort.tap()
      app.buttons["High"].firstMatch.tap()
      let fast = app.buttons["native-e2e.composer.fast"]
      if fast.value as? String != "On" { fast.tap() }
      app.buttons["native-e2e.composer.permissions"].tap()
      app.buttons["Full access"].firstMatch.tap()
    } else {
      XCTAssertTrue(combined.isHittable)
      combined.tap()
      let field = app.buttons["native-e2e.composer-controls.effort"]
      XCTAssertTrue(field.waitForExistence(timeout: 5))
      field.tap()
      app.buttons["High"].firstMatch.tap()
      let fast = app.switches["native-e2e.composer-controls.fast"]
      if fast.value as? String != "1" {
        fast.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
      }
      XCTAssertEqual(fast.value as? String, "1")
      app.buttons["Full access"].firstMatch.tap()
      app.buttons["Done"].tap()
    }
    try await assertNewThreadSelections()
    let wide = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    wide.name = "new-thread-controls-retained"
    wide.lifetime = .keepAlways
    add(wide)
    try await rotateIPadJourney(to: .portrait)
    XCTAssertTrue(prompt.waitForExistence(timeout: 10))
    XCTAssertEqual(prompt.value as? String, text)
    try await assertNewThreadSelections()
    let narrow = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    narrow.name = "new-thread-controls-portrait"
    narrow.lifetime = .keepAlways
    add(narrow)

    // Choosing the current provider/model must not clear configured permissions.
    openNewThreadModelPicker()
    let current = app.buttons["native-e2e.new-thread-model.codex.gpt-5"]
    XCTAssertTrue(current.waitForExistence(timeout: 5))
    current.tap()
    try await assertNewThreadSelections()

    // Provider selection must also remain reachable from the combined form.
    openNewThreadModelPicker()
    let other = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Review Model")).firstMatch
    XCTAssertTrue(other.waitForExistence(timeout: 5))
    other.tap()
    XCTAssertTrue(prompt.waitForExistence(timeout: 10))
    XCTAssertEqual(prompt.value as? String, text)
    try await poll {
      (combined.exists && (combined.value as? String)?.contains("Review Model") == true)
        || (model.exists && (model.value as? String)?.contains("Review Model") == true)
    }
  }

  private func openNewThreadModelPicker() {
    let combined = app.buttons["native-e2e.composer-selectors.combined"]
    if combined.exists && combined.isHittable {
      combined.tap()
      let controlsModel = app.buttons["native-e2e.new-thread-controls.model"]
      if controlsModel.exists { controlsModel.tap() }
      else {
        XCTAssertTrue(app.buttons["native-e2e.new-thread-crew.edit"].waitForExistence(timeout: 5),
          "A compact Crew selector opens the model/Crew picker so users can switch back to a single model")
      }
    } else {
      app.buttons["native-e2e.composer.model"].tap()
    }
  }

  func testFamilySelectionShowsItsValuesAndSurvivesAdaptiveComposerReplacement() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses a synthetic family relation.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    try await pairUntilHome()
    _ = try await control(path: "/v1/checkpoints/composer-controls-ready", method: "POST")
    _ = try await control(path: "/v1/checkpoints/composer-family-ready", method: "POST")
    let create = app.buttons.matching(NSPredicate(format: "identifier IN %@", [
      "native-e2e.split-empty-new-task", "native-e2e.split-new-thread",
      "native-e2e.new-thread", "native-e2e.sidebar.new-thread",
    ])).firstMatch
    XCTAssertTrue(create.waitForExistence(timeout: 10))
    create.tap()
    let prompt = app.textViews["native-e2e.new-thread-prompt"]
    XCTAssertTrue(prompt.waitForExistence(timeout: 10))
    prompt.tap()
    let text = "Preserve the selected family member"
    prompt.typeText(text)
    XCTAssertEqual(prompt.value as? String, text)
    openNewThreadModelPicker()
    let family = app.buttons["native-e2e.new-thread-model.fixture-family.pair-alpha"]
    XCTAssertTrue(family.waitForExistence(timeout: 5))
    family.tap()
    let combined = app.buttons["native-e2e.composer-selectors.combined"]
    let lead = app.buttons["native-e2e.composer.family.lead"]
    try await poll { (combined.exists && combined.isHittable) || (lead.exists && lead.isHittable) }
    if lead.exists && lead.isHittable {
      XCTAssertEqual(lead.value as? String, "Alpha")
      lead.tap()
      app.buttons["native-e2e.composer.family.lead.beta"].tap()
      app.buttons["native-e2e.composer.fast"].tap()
    } else {
      combined.tap()
      app.buttons["native-e2e.composer-controls.family.lead"].tap()
      app.buttons["Beta"].firstMatch.tap()
      let fast = app.switches["native-e2e.composer-controls.fast"]
      fast.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
      XCTAssertEqual(fast.value as? String, "1")
      app.buttons["Done"].tap()
    }
    for landscape in (usesRotatingWindowFrames ? [true, false] : [false]) {
      try await rotateIPadJourney(to: landscape ? .landscapeLeft : .portrait)
      XCTAssertTrue(prompt.waitForExistence(timeout: 10))
      try await poll {
        if combined.exists && combined.isHittable {
          let value = combined.value as? String ?? ""
          return value.contains("Lead: Beta") && value.contains("Fast") && !value.contains("Fast:")
        }
        let fast = self.app.buttons["native-e2e.composer.fast"]
        return lead.exists && lead.isHittable && (lead.value as? String) == "Beta"
          && fast.exists && (fast.value as? String) == "On"
      }
      XCTAssertEqual(prompt.value as? String, text)
      let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      proof.name = landscape ? "family-controls-landscape" : "family-controls-portrait"
      proof.lifetime = .keepAlways
      add(proof)
    }
    let host = try await scenarioState().host("primary")
    XCTAssertFalse(host.observedOperationIds.contains("route:thread-command"))
  }

  func testNewThreadPlanLivesInAddMenuAndKeepsTheCurrentDraftAcrossLayouts() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses synthetic mode capabilities.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    try await pairUntilHome()
    _ = try await control(path: "/v1/checkpoints/composer-controls-ready", method: "POST")
    let create = app.buttons.matching(NSPredicate(format: "identifier IN %@", [
      "native-e2e.split-empty-new-task", "native-e2e.split-new-thread",
      "native-e2e.new-thread", "native-e2e.sidebar.new-thread",
    ])).firstMatch
    XCTAssertTrue(create.waitForExistence(timeout: 10))
    create.tap()
    let prompt = app.textViews["native-e2e.new-thread-prompt"]
    XCTAssertTrue(prompt.waitForExistence(timeout: 10))
    XCTAssertFalse(newThreadPlanSelected)
    let addButton = app.buttons["native-e2e.new-thread-add"]
    XCTAssertTrue(addButton.isHittable)
    addButton.tap()
    let plan = app.buttons["native-e2e.new-thread-plan"]
    XCTAssertTrue(plan.waitForExistence(timeout: 5))
    XCTAssertTrue(plan.isHittable, "Plan should be near the top of the add menu")
    let menu = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    menu.name = "new-thread-add-menu-plan"
    menu.lifetime = .keepAlways
    add(menu)
    plan.tap()
    try await poll { self.newThreadPlanSelected }

    // Closing and reopening an unsent draft keeps its explicit choice.
    app.buttons["native-e2e.new-thread-close"].tap()
    XCTAssertTrue(create.waitForExistence(timeout: 5))
    create.tap()
    XCTAssertTrue(prompt.waitForExistence(timeout: 10))
    try await poll { self.newThreadPlanSelected }
    try await rotateIPadJourney(to: .landscapeLeft)
    XCTAssertTrue(prompt.waitForExistence(timeout: 10))
    try await poll { self.newThreadPlanSelected }
    let active = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    active.name = "new-thread-plan-retained"
    active.lifetime = .keepAlways
    add(active)
    app.buttons["native-e2e.new-thread-add"].tap()
    XCTAssertTrue(plan.waitForExistence(timeout: 5))
    plan.tap()
    XCTAssertTrue(prompt.waitForExistence(timeout: 10))
    try await poll { !self.newThreadPlanSelected }

    // Photo actions remain available in one native sublevel.
    app.buttons["native-e2e.new-thread-add"].tap()
    app.buttons["native-e2e.new-thread-photos"].tap()
    XCTAssertTrue(app.buttons["native-e2e.new-thread-photo-picker"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["native-e2e.new-thread-screenshot-picker"].exists)
    XCTAssertTrue(app.buttons["native-e2e.new-thread-camera"].exists)
    try await rotateIPadJourney(to: .portrait)
    XCTAssertTrue(app.buttons["native-e2e.new-thread-photo-picker"].waitForExistence(timeout: 5),
      "Resizing the workspace must keep the open photo sublevel")
    let photos = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    photos.name = "new-thread-photo-actions"
    photos.lifetime = .keepAlways
    add(photos)
    let host = try await scenarioState().host("primary")
    XCTAssertFalse(host.observedOperationIds.contains("route:thread-command"))
    XCTAssertFalse(host.observedOperationIds.contains("route:thread-start-existing"))
  }

  private var newThreadPlanSelected: Bool {
    let combined = app.buttons["native-e2e.composer-selectors.combined"]
    return (combined.exists && (combined.value as? String)?.contains("Plan") == true)
      || app.buttons["native-e2e.composer.plan"].exists
  }

  private func assertNewThreadSelections() async throws {
    try await poll {
      let combined = self.app.buttons["native-e2e.composer-selectors.combined"]
      if combined.exists && combined.isHittable {
        let value = combined.value as? String ?? ""
        return ["High", "128K", "Fast", "Full access"].allSatisfy(value.contains) && !value.contains("Fast:")
      }
      let effort = self.app.buttons["native-e2e.composer.effort"]
      let fast = self.app.buttons["native-e2e.composer.fast"]
      let permissions = self.app.buttons["native-e2e.composer.permissions"]
      guard effort.exists, effort.isHittable, fast.exists, fast.isHittable,
        permissions.exists, permissions.isHittable else { return false }
      return (effort.value as? String)?.contains("High") == true
        && (fast.value as? String) == "On"
        && (permissions.value as? String) == "Full access"
    }
  }

  func testDraftOpenedOverAThreadStaysVisibleWhenTheLayoutCollapses() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses a synthetic project and does not start a provider.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    try await pairAndOpenFixtureThread()
    try XCTSkipUnless(usesRotatingWindowFrames, "This collapse regression uses an iPad rotation profile; Duo display transitions are qualified separately.")
    try await rotateIPadJourney(to: .landscapeLeft)
    let create = app.buttons["native-e2e.split-new-thread"]
    XCTAssertTrue(create.waitForExistence(timeout: 10))
    create.tap()
    let prompt = app.textViews["native-e2e.new-thread-prompt"]
    XCTAssertTrue(prompt.waitForExistence(timeout: 10))
    prompt.tap()
    let draft = "Draft stays in front of the conversation"
    prompt.typeText(draft)
    XCTAssertEqual(prompt.value as? String, draft)
    try await rotateIPadJourney(to: .portrait)
    XCTAssertTrue(prompt.waitForExistence(timeout: 10))
    XCTAssertEqual(prompt.value as? String, draft)
    app.buttons["native-e2e.new-thread-close"].tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 10))
  }

  func testTerminalKeystrokeFamilyWritesToPty() async throws {
    applyFixtureAppearance()
    try await pairUntilHome()
    homeMoreButton.tap()
    let terminal = app.buttons["native-e2e.more.terminal"]
    // Native lists materialize rows lazily; this destination can start below
    // the fold in a short window or with larger text.
    for _ in 0..<3 {
      if terminal.exists && terminal.isHittable { break }
      app.swipeUp()
    }
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
    if peerMode == .mock {
      let output = app.descendants(matching: .any).matching(
        NSPredicate(format: "label == %@", "Terminal output")
      ).firstMatch
      XCTAssertTrue(output.waitForExistence(timeout: 5))
      try assertTerminalCanvasFollowsFixtureAppearance(output)
    }
    input.tap()
    input.typeText("echo family-pty")
    if peerMode == .mock { utilityProof("terminal-command-appearance") }
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
    homeMoreButton.tap()
    try openGitWorkspaceFromMore(projectName: peerMode == .real ? "native-e2e-fixture" : "Fixture Project")
    if peerMode == .mock {
      // WireLab has no mutable repository. Prove the native Git workspace
      // reached the host through its real read procedures; the real-peer leg
      // below performs gitStageAll and the TS harness checks the index effect.
      for operationID in ["procedure:getGitStatus", "ws-client:git-state-interests"] {
        try await waitForObservedOperation(hostID: "primary", operationID: operationID)
      }
      return
    }
    try await stageAllInRealGitWorkspace()
  }

  private func openFixtureProjectWorkspace(projectName: String) {
    let projects = app.buttons["native-e2e.more.projects"]
    XCTAssertTrue(projects.waitForExistence(timeout: 5))
    projects.tap()
    let row = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label BEGINSWITH %@",
      "native-e2e.projects.project.", projectName)).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 10))
    row.tap()
  }

  private func openGitWorkspaceFromMore(projectName: String) throws {
    openFixtureProjectWorkspace(projectName: projectName)
    // Projects now opens its file workspace directly, keeping the host owner
    // bound while the existing Files/Git switcher chooses the review surface.
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
  }

  private func stageAllInRealGitWorkspace() async throws {
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
      // The covered workspace keeps its own Quick Actions menu in the tree;
      // target the pushed panel's menu explicitly.
      let quickActions = app.buttons["native-e2e.git.panel-quick-actions"]
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
    // The action must actually run: a controller that lost its workspace
    // context rejects it before any request and shows the failure label.
    let failure = app.descendants(matching: .any)["native-e2e.git.failure"]
    XCTAssertFalse(
      failure.waitForExistence(timeout: 5),
      "Stage All was rejected: \(failure.exists ? failure.label : "")"
    )
    try await waitForRealPeerReached()
  }

  func testBrowserMirrorAddressDraftSurvivesDisplaysAndNavigatesOnItsHost() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses a disposable browser workspace.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()
    openFixtureMore()
    let browser = app.buttons["native-e2e.more.browser-mirror"]
    XCTAssertTrue(browser.waitForExistence(timeout: 10))
    if !browser.isHittable { app.swipeUp() }
    browser.tap()

    let address = app.textFields["Address"].firstMatch
    XCTAssertTrue(address.waitForExistence(timeout: 10))
    let newTab = app.descendants(matching: .any)["native-e2e.browser.new-tab"].firstMatch
    XCTAssertTrue(newTab.waitForExistence(timeout: 5))
    assertNativeDuoToolbarRail(newTab)
    let go = app.descendants(matching: .any)["native-e2e.browser.go"].firstMatch
    try await poll { go.isEnabled }
    let browserCommand = "route:browser-command"
    let firstCount = try await journalCount(hostID: "collision-b", operationID: browserCommand)
    utilityProof("utility-browser-system-toolbar")

    let draft = "https://example.test/fold-draft"
    address.tap()
    try await pressNativeE2EShortcut("a", modifiers: .command)
    address.typeText(draft)
    try await assertDraftSurvivesDisplayTransitions("browser-address", field: address, value: draft, availableAction: go)
    let draftCount = try await journalCount(hostID: "collision-b", operationID: browserCommand)
    XCTAssertEqual(draftCount, firstCount)

    try await tapNativeToolbarActionAfterDisplayTransition(go)
    try await waitForJournal(hostID: "collision-b", operationID: browserCommand, count: firstCount + 1)
    let back = app.descendants(matching: .any)["native-e2e.browser.back"].firstMatch
    try await poll { address.value as? String == draft && back.isEnabled }
    assertNativeDuoToolbarRail(newTab)
    try await tapNativeToolbarActionAfterDisplayTransition(newTab)
    try await waitForJournal(hostID: "collision-b", operationID: browserCommand, count: firstCount + 2)
    try await poll { address.value as? String == "https://duckduckgo.com" }
    let selectedHostCount = try await journalCount(hostID: "collision-b", operationID: browserCommand)
    let otherHostCount = try await journalCount(hostID: "primary", operationID: browserCommand)
    XCTAssertEqual(selectedHostCount, firstCount + 2)
    XCTAssertEqual(otherHostCount, 0)
    utilityProof("utility-browser-new-tab-after-navigation")

    address.tap()
    address.typeText("browser-draft-only")
    XCTAssertTrue((address.value as? String)?.contains("browser-draft-only") == true)
    let desktop = app.buttons["Switch desktop"].firstMatch
    XCTAssertTrue(desktop.waitForExistence(timeout: 5))
    try await tapNativeToolbarActionAfterDisplayTransition(desktop)
    let otherHost = app.buttons["Navigation Host A"].firstMatch
    XCTAssertTrue(otherHost.waitForExistence(timeout: 5)); otherHost.tap()
    do {
      try await poll {
        desktop.value as? String == "Navigation Host A"
          && address.value as? String == "https://example.test/fixture"
          && go.isEnabled
      }
    } catch {
      utilityProof("utility-browser-desktop-switch-failure")
      throw error
    }
    let unchangedOtherHost = try await journalCount(hostID: "primary", operationID: browserCommand)
    let unchangedOriginalHost = try await journalCount(hostID: "collision-b", operationID: browserCommand)
    XCTAssertEqual(unchangedOtherHost, otherHostCount)
    XCTAssertEqual(unchangedOriginalHost, selectedHostCount)
    utilityProof("utility-browser-desktop-switch")
  }

  func testThreadHeaderLifecycleKeepsTheRenameDraftAndUsesItsPairedDesktop() async throws {
    try XCTSkipIf(peerMode == .real, "This journey mutates only a disposable fixture thread.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()
    let selected = navigationHostThread(label: "Native E2E Collision Host B")
    revealNavigationThread(selected)
    XCTAssertTrue(selected.waitForExistence(timeout: 10)); selected.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 10))
    let actions = app.buttons["native-e2e.thread.actions"]
    XCTAssertTrue(actions.waitForExistence(timeout: 5)); actions.tap()
    utilityProof("utility-thread-header-overflow")
    app.buttons["Rename"].firstMatch.tap()
    let title = app.textFields["native-e2e.thread.rename.title"].firstMatch
    XCTAssertTrue(title.waitForExistence(timeout: 5))
    title.tap()
    try await pressNativeE2EShortcut("a", modifiers: .command)
    let draft = "Renamed paired fixture"
    title.typeText(draft)
    let rename = app.descendants(matching: .any)["native-e2e.thread.rename.submit"].firstMatch
    utilityProof("utility-thread-rename-editing")
    try await assertDraftSurvivesDisplayTransitions("thread-rename", field: title, value: draft, availableAction: rename)
    let operation = "route:thread-command"
    let beforeRename = try await journalCount(hostID: "collision-b", operationID: operation)
    XCTAssertEqual(beforeRename, 0)
    rename.tap()
    try await waitForJournal(hostID: "collision-b", operationID: operation, count: 1)
    let threadTitle = app.buttons["native-e2e.thread-status"].firstMatch
    try await poll { threadTitle.label.contains(draft) }

    actions.tap()
    app.buttons["Pin to top"].firstMatch.tap()
    try await waitForJournal(hostID: "collision-b", operationID: operation, count: 2)
    let unsent = "Preserve this unsent draft"
    try await enterWorkspaceDraft(unsent)
    actions.tap()
    XCTAssertTrue(app.buttons["Unpin"].firstMatch.waitForExistence(timeout: 5))
    utilityProof("utility-thread-lifecycle-menu")
    app.buttons["Mark Done"].firstMatch.tap()
    try await waitForJournal(hostID: "collision-b", operationID: operation, count: 3)
    let currentTitle = app.buttons.matching(NSPredicate(format: "identifier == %@ AND label CONTAINS %@",
      "native-e2e.thread-status", draft)).firstMatch
    try await poll { !currentTitle.exists }
    utilityProof("utility-thread-done-dismissed")

    let completedRow = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@",
      "native-e2e.thread.", draft)).firstMatch
    XCTAssertFalse(completedRow.exists)
    try await showCompletedHomeThreads()
    XCTAssertTrue(completedRow.waitForExistence(timeout: 5)); completedRow.tap()
    try await poll { currentTitle.exists }
    try await assertWorkspaceDraft(unsent)
    XCTAssertTrue(app.staticTexts["Fixture response"].exists)
    utilityProof("utility-thread-done-reopened")
    let collapseComposer = app.buttons["native-e2e.composer-collapse"].firstMatch
    if collapseComposer.isHittable { collapseComposer.tap() }
    actions.tap()
    XCTAssertTrue(app.buttons["Mark Not Done"].firstMatch.waitForExistence(timeout: 5))
    app.buttons["Mark Not Done"].firstMatch.tap()
    try await waitForJournal(hostID: "collision-b", operationID: operation, count: 4)
    actions.tap()
    XCTAssertTrue(app.buttons["Mark Done"].firstMatch.waitForExistence(timeout: 5))
    try await tapThreadMenuAction("Delete")
    XCTAssertTrue(app.staticTexts["Delete this thread permanently?"].waitForExistence(timeout: 5))
    app.buttons["Cancel"].firstMatch.tap()
    let afterCancel = try await journalCount(hostID: "collision-b", operationID: operation)
    XCTAssertEqual(afterCancel, 4)
    XCTAssertTrue(threadTitle.label.contains(draft))

    actions.tap()
    try await tapThreadMenuAction("Archive")
    XCTAssertTrue(app.staticTexts["Archive this thread?"].waitForExistence(timeout: 5))
    app.buttons["Archive"].firstMatch.tap()
    try await waitForJournal(hostID: "collision-b", operationID: operation, count: 5)
    try await poll { !currentTitle.exists }
    let selectedCount = try await journalCount(hostID: "collision-b", operationID: operation)
    let otherCount = try await journalCount(hostID: "primary", operationID: operation)
    let duplicateCloseCount = try await journalCount(hostID: "collision-b", operationID: "route:thread-close")
    XCTAssertEqual(duplicateCloseCount, 0)
    XCTAssertEqual(selectedCount, 5)
    XCTAssertEqual(otherCount, 0)
    utilityProof("utility-thread-header-archive")
    if UIDevice.current.userInterfaceIdiom != .pad {
      try await selectCompactHomeThreadStatus("active")
      let otherRow = navigationHostThread(label: "Navigation Host A")
      XCTAssertTrue(otherRow.waitForExistence(timeout: 5))
      utilityProof("utility-thread-filter-active")
    }
  }

  private func showCompletedHomeThreads() async throws {
    if UIDevice.current.userInterfaceIdiom == .pad {
      let disclosure = app.descendants(matching: .any)["native-e2e.home.done-section"].firstMatch
      revealNavigationThread(disclosure)
      XCTAssertTrue(disclosure.waitForExistence(timeout: 5)); disclosure.tap()
      utilityProof("utility-thread-sidebar-done")
    } else {
      try await selectCompactHomeThreadStatus("done", verifyDisplays: true)
      utilityProof("utility-thread-filter-done")
    }
  }

  private func selectCompactHomeThreadStatus(_ status: String, verifyDisplays: Bool = false) async throws {
    let filter = app.buttons["native-e2e.project-filter"].firstMatch
    XCTAssertTrue(filter.waitForExistence(timeout: 5)); filter.tap()
    let row = app.buttons["native-e2e.thread-filter.\(status)"].firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5)); row.tap()
    try await poll { row.isSelected }
    let confirm = app.descendants(matching: .any)["native-e2e.project-filter.done"].firstMatch
    XCTAssertTrue(confirm.waitForExistence(timeout: 5))
    if verifyDisplays {
      XCTAssertTrue(row.label.contains("1"))
      let completedProject = app.descendants(matching: .any).matching(NSPredicate(
        format: "identifier BEGINSWITH %@ AND label CONTAINS %@",
        "native-e2e.project-actions.", "Native E2E Collision Host B")).firstMatch
      XCTAssertTrue(completedProject.waitForExistence(timeout: 5)); completedProject.tap()
      try await poll { row.label.contains("0") }
      app.buttons["All projects"].firstMatch.tap()
      try await poll { row.label.contains("1") }
      utilityProof("utility-thread-filter-sheet")
      try await assertNativeDuoDisplayTransitions("thread-filter", content: row, availableAction: confirm) { pose in
        XCTAssertTrue(row.isSelected)
        XCTAssertTrue(row.label.contains("1"))
        if pose == "outer" {
          XCTAssertGreaterThan(confirm.frame.midX, self.app.frame.minX + self.app.frame.width * 0.84)
        }
      }
    }
    confirm.tap()
    try await poll { !row.exists }
  }

  private func tapThreadMenuAction(_ label: String) async throws {
    let item = app.buttons[label].firstMatch
    for _ in 0..<3 {
      if item.exists && item.isHittable {
        item.tap()
        return
      }
      let visible = ["Thread info", "Find in chat", "Rename", "Notes & to-dos", "Open terminal",
        "Mark Done", "Mark Not Done", "Pin to top", "Unpin", "More", "Archive"]
        .map { app.buttons[$0].firstMatch }
        .filter { $0.exists && $0.isHittable }
        .sorted { $0.frame.midY < $1.frame.midY }
      let start = try XCTUnwrap(visible.last)
      let end = try XCTUnwrap(visible.first)
      start.press(forDuration: 0.05, thenDragTo: end)
    }
    let visibleItem = await waitForHittableButton(identifier: label, timeout: 5)
    try XCTUnwrap(visibleItem).tap()
  }

  func testLiveBrowserMirrorRendersAndRelaysInputAcrossDisplays() async throws {
    let environment = ProcessInfo.processInfo.environment
    try XCTSkipUnless(environment["NATIVE_E2E_LIVE_BROWSER_PAIRING_URL"] != nil,
      "This journey requires the isolated Electron screencast fixture.")
    let livePairingURL = try XCTUnwrap(environment["NATIVE_E2E_LIVE_BROWSER_PAIRING_URL"].flatMap(URL.init(string:)))
    let pageURL = try XCTUnwrap(environment["NATIVE_E2E_LIVE_BROWSER_PAGE_URL"].flatMap(URL.init(string:)))
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    try await pairUntilHome()
    openFixtureMore()
    app.buttons["native-e2e.more.connections"].tap()
    let add = app.buttons["native-e2e.connections.add"]
    XCTAssertTrue(add.waitForExistence(timeout: 10)); add.tap()
    try PairingLinkEntry.enter(livePairingURL, into: app)
    try await poll { !self.app.buttons["native-e2e.pair.submit"].exists }
    tapNativeSettingsBack(from: "Connections", to: "More")

    let browser = app.buttons["native-e2e.more.browser-mirror"]
    XCTAssertTrue(browser.waitForExistence(timeout: 10))
    if !browser.isHittable { app.swipeUp() }
    browser.tap()
    let address = app.textFields["Address"].firstMatch
    let frame = app.images["native-e2e.browser.frame"].firstMatch
    try await poll { address.value as? String == pageURL.absoluteString && frame.exists }
    try assertRenderedText("Mirror ready")
    utilityProof("utility-browser-live-ready")

    try await assertNativeDuoDisplayTransitions("browser-live", content: frame, availableAction: nil) { pose in
      XCTAssertEqual(address.value as? String, pageURL.absoluteString, pose)
    }
    try await tapNativeToolbarActionAfterDisplayTransition(frame)
    try await poll { try self.renderedScreenText().localizedCaseInsensitiveContains("Mirror tapped") }
    utilityProof("utility-browser-live-tapped")

    let desktop = app.buttons["Switch desktop"].firstMatch
    XCTAssertTrue(desktop.waitForExistence(timeout: 5))
    try await tapNativeToolbarActionAfterDisplayTransition(desktop)
    let fixtureHost = app.buttons["Navigation Host A"].firstMatch
    XCTAssertTrue(fixtureHost.waitForExistence(timeout: 5)); fixtureHost.tap()
    try await poll { address.value as? String == "https://example.test/fixture" && !frame.exists }
    let text = try renderedScreenText()
    XCTAssertFalse(text.localizedCaseInsensitiveContains("Mirror tapped"))
    utilityProof("utility-browser-live-after-switch")
  }

  func testOnboardingScannerFallbacksAndPairingUseTheSystemToolbars() async throws {
    try XCTSkipIf(peerMode == .real, "The pairing credential belongs only to the disposable WireLab host.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    app.launch()

    let scan = app.buttons["native-e2e.pair.scan"]
    XCTAssertTrue(scan.waitForExistence(timeout: 10)); scan.tap()
    XCTAssertTrue(app.staticTexts["No camera available"].waitForExistence(timeout: 8))
    let photo = app.descendants(matching: .any).matching(identifier: "native-e2e.pair.scan.photo").firstMatch
    let manual = app.descendants(matching: .any).matching(identifier: "native-e2e.pair.scan.use-manual").firstMatch
    let link = app.descendants(matching: .any).matching(identifier: "native-e2e.pair.scan.use-link").firstMatch
    for control in [photo, link, manual] { XCTAssertTrue(control.exists); assertNativeDuoToolbarRail(control) }
    utilityProof("utility-scanner-fallback-rail")
    try await tapNativeToolbarActionAfterDisplayTransition(photo)
    let cancelPhoto = app.buttons["Cancel"].firstMatch
    XCTAssertTrue(cancelPhoto.waitForExistence(timeout: 8)); cancelPhoto.tap()
    XCTAssertTrue(manual.waitForExistence(timeout: 8))
    try await tapNativeToolbarActionAfterDisplayTransition(manual)
    let token = app.secureTextFields["native-e2e.pair.token"]
    XCTAssertTrue(token.waitForExistence(timeout: 8))
    let close = app.descendants(matching: .any).matching(identifier: "native-e2e.pair.other-ways.close").firstMatch
    close.tap()
    XCTAssertTrue(scan.waitForExistence(timeout: 8)); scan.tap()
    XCTAssertTrue(link.waitForExistence(timeout: 8))
    try await tapNativeToolbarActionAfterDisplayTransition(link)

    let field = app.descendants(matching: .any).matching(NSPredicate(
      format: "identifier == %@ AND (elementType == %d OR elementType == %d)",
      "native-e2e.pairing-link", XCUIElement.ElementType.textField.rawValue, XCUIElement.ElementType.textView.rawValue
    )).firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 8))
    let submit = app.descendants(matching: .any).matching(identifier: "native-e2e.pair.submit").firstMatch
    XCTAssertTrue(submit.exists)
    if ProcessInfo.processInfo.environment["NATIVE_E2E_EXPECT_VERTICAL_TOOLBAR"] == "1" {
      XCTAssertGreaterThan(submit.frame.midX, app.frame.minX + app.frame.width * 0.84)
      XCTAssertLessThan(submit.frame.midY, field.frame.minY)
    }
    utilityProof("utility-onboarding-pair-rail")
    field.tap()
    let draft = "https://pairing-fixture.invalid"
    field.typeText(draft)
    XCTAssertTrue(app.keyboards.firstMatch.exists)
    try await assertDraftSurvivesDisplayTransitions("onboarding-pair-draft", field: field, value: draft)
    let pending = try await scenarioState().host("primary")
    XCTAssertFalse(pending.observedOperationIds.contains("route:token-exchange"))

    try PairingLinkEntry.enter(try await pairingURL(hostID: "primary"), into: app)
    try await confirmPairingIfNeeded()
    XCTAssertTrue(mockHomeReady.waitForExistence(timeout: 15))
    let final = try await scenarioState().host("primary")
    XCTAssertEqual(final.operationJournal.filter { $0.operationId == "route:token-exchange" }.count, 1)
    utilityProof("utility-onboarding-paired")
  }

  func testProjectActionsDraftStaysWithItsDesktopAcrossDisplays() async throws {
    try XCTSkipIf(peerMode == .real, "This journey edits only disposable project settings.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/project-actions-ready", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()
    openFixtureMore()
    app.buttons["native-e2e.more.connections"].tap()
    let rows = app.buttons.matching(identifier: "native-e2e.connection-row")
    let hostB = rows.matching(NSPredicate(format: "label BEGINSWITH %@", "Native E2E Collision Host B")).firstMatch
    XCTAssertTrue(hostB.waitForExistence(timeout: 5)); hostB.tap()
    try await poll { hostB.label.contains("selected connection") }
    let hostA = rows.matching(NSPredicate(format: "label BEGINSWITH %@", "Navigation Host A")).firstMatch
    XCTAssertTrue(hostA.exists); hostA.press(forDuration: 0.8)
    let projects = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Projects")).firstMatch
    XCTAssertTrue(projects.waitForExistence(timeout: 5)); projects.tap()
    let project = app.buttons["Actions Fixture Project"]
    XCTAssertTrue(project.waitForExistence(timeout: 10)); project.tap()
    let settings = app.buttons["Project Settings"].firstMatch
    XCTAssertTrue(settings.waitForExistence(timeout: 5)); settings.tap()
    let actions = app.buttons["native-e2e.settings.project-actions"]
    XCTAssertTrue(actions.waitForExistence(timeout: 5)); actions.tap()
    XCTAssertTrue(app.staticTexts["Existing fixture action"].waitForExistence(timeout: 5))

    _ = try await control(path: "/v1/checkpoints/project-actions-desktop-edit", method: "POST")
    let name = app.textFields["native-e2e.project-actions.new-name"]
    XCTAssertTrue(name.waitForExistence(timeout: 5)); name.tap(); name.typeText("New fixture action")
    let command = app.descendants(matching: .any).matching(identifier: "native-e2e.project-actions.new-command").firstMatch
    let value = "printf 'fixture only'"
    command.tap(); command.typeText(value)
    XCTAssertTrue(app.keyboards.firstMatch.exists)
    let save = app.descendants(matching: .any).matching(identifier: "native-e2e.project-actions.save").firstMatch
    XCTAssertFalse(save.isEnabled)
    let add = app.descendants(matching: .any).matching(identifier: "native-e2e.project-actions.add").firstMatch
    try await assertDraftSurvivesDisplayTransitions("project-actions", field: command, value: value, availableAction: add)
    XCTAssertEqual(name.value as? String, "New fixture action")
    try await tapNativeToolbarActionAfterDisplayTransition(add)
    try await poll { save.exists && save.isEnabled }
    let staged = try await scenarioState().host("primary")
    XCTAssertFalse(staged.observedOperationIds.contains("route:project-command"))
    utilityProof("utility-project-actions-staged")
    try await tapNativeToolbarActionAfterDisplayTransition(save)
    try await waitForJournal(hostID: "primary", operationID: "route:project-command", count: 1)
    _ = try await control(path: "/v1/checkpoints/project-actions-assert-save", method: "POST")
    XCTAssertTrue(actions.waitForExistence(timeout: 5)); actions.tap()
    for title in ["Existing fixture action", "Desktop fixture action", "New fixture action"] {
      XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 5), title)
    }
    let final = try await scenarioState()
    for host in ["primary", "collision-b"] {
      let journal = try final.host(host).operationJournal
      XCTAssertEqual(journal.filter { $0.operationId == "route:project-command" }.count, host == "primary" ? 1 : 0)
    }
    utilityProof("utility-project-actions-saved")
  }

  func testWorkspaceFileActionsFollowTheSystemRailAndPreserveSearch() async throws {
    try XCTSkipIf(peerMode == .real, "This journey creates a file on a disposable desktop.")
    let isPad = UIDevice.current.userInterfaceIdiom == .pad
    XCUIDevice.shared.orientation = isPad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/keyboard-workspace-ready", method: "POST")
    try await pairUntilHome()
    let thread = app.buttons["native-e2e.thread.thread-fixture-001"].firstMatch
    let sidebar = app.buttons["native-e2e.sidebar-toggle"].firstMatch
    if !thread.isHittable && sidebar.exists { sidebar.tap() }
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 15))
    if isPad { openFixtureMore() } else { openCompactThreadWorkspaceTools() }
    openFixtureProjectWorkspace(projectName: "Fixture Project")

    let search = app.descendants(matching: .any).matching(identifier: "native-e2e.project-files.search-action").firstMatch
    let create = app.descendants(matching: .any).matching(identifier: "native-e2e.project-files.create").firstMatch
    XCTAssertTrue(search.waitForExistence(timeout: 10))
    try await poll { search.isHittable && create.isHittable && create.isEnabled }
    assertNativeDuoToolbarRail(search)
    assertNativeDuoToolbarRail(create)
    utilityProof("utility-files-resting-actions")
    if isPad {
      let git = app.buttons["native-e2e.workspace.git"]
      let back = app.buttons["native-e2e.project-workspace.back"]
      XCTAssertTrue(git.isHittable && back.isHittable)
      XCTAssertLessThan(git.frame.maxX, app.frame.midX, "Keep Files and Git in the sidebar")
      XCTAssertGreaterThan(git.frame.midY, app.frame.maxY - app.frame.height * 0.2,
        "Keep Files and Git at the bottom of the sidebar")
      XCTAssertLessThan(search.frame.midX, app.frame.midX, "Keep Search with the file list")
      XCTAssertLessThan(search.frame.midY, app.frame.minY + app.frame.height * 0.125)
      XCTAssertLessThan(abs(back.frame.midY - search.frame.midY), 24, "Use one header row")
    }
    try await tapNativeToolbarActionAfterDisplayTransition(search)
    let query = app.textFields["Search files"]
    XCTAssertTrue(query.waitForExistence(timeout: 5))
    query.typeText("README")
    try await waitForObservedOperation(hostID: "primary", operationID: "procedure:searchProjectFiles")
    utilityProof("utility-files-search-with-keyboard")
    do {
      try await poll { self.toolbarActionClearsKeyboard(search) && search.isHittable && create.isHittable }
    } catch {
      let geometry = XCTAttachment(string: "Cancel: \(search.frame)\nCreate: \(create.frame)\nKeyboard: \(app.keyboards.firstMatch.frame)\nApp: \(app.frame)")
      geometry.name = "files-search-action-geometry"
      geometry.lifetime = .keepAlways
      add(geometry)
      throw error
    }
    try await assertDraftSurvivesDisplayTransitions("files-action-search", field: query, value: "README",
      availableAction: search)
    XCTAssertEqual(query.value as? String, "README")
    XCTAssertTrue(create.isHittable)
    try await tapNativeToolbarActionAfterDisplayTransition(search)
    try await poll { !query.exists && !self.app.keyboards.firstMatch.exists }
    assertNativeDuoToolbarRail(create)
    try await tapNativeToolbarActionAfterDisplayTransition(create)
    let createFile = app.buttons["Create project entry · File"].firstMatch
    try await poll { createFile.isHittable && createFile.isEnabled }
    createFile.coordinate(withNormalizedOffset: CGVector(dx: 0.65, dy: 0.5)).tap()
    utilityProof("utility-files-create-prompt")
    let alert = app.alerts.firstMatch
    let name = alert.textFields.firstMatch
    XCTAssertTrue(name.waitForExistence(timeout: 5)); name.typeText("rail-proof.txt")
    alert.buttons["Confirm"].tap()
    try await waitForJournal(hostID: "primary", operationID: "procedure:createProjectEntry", count: 1)
    let editor = app.textViews["native-e2e.project-file-editor"]
    XCTAssertTrue(editor.waitForExistence(timeout: 8))
    XCTAssertTrue(app.navigationBars["rail-proof.txt"].exists)
    utilityProof("utility-files-created-from-toolbar")
    if !isPad { tapNativeSettingsBack(from: "rail-proof.txt", to: "Files") }
    let created = app.descendants(matching: .any).matching(identifier: "native-e2e.project-file.rail-proof.txt").firstMatch
    XCTAssertTrue(created.waitForExistence(timeout: 8))
    if isPad {
      app.buttons["native-e2e.project-workspace.back"].tap()
      XCTAssertTrue(app.navigationBars["Projects"].waitForExistence(timeout: 5))
    }
  }

  func testTranscriptFileShareKeepsItsDesktopAndSurvivesTheFold() async throws {
    try await assertTranscriptFileShare(requiresBasenameLookup: false)
  }

  func testTranscriptBareFilenameSharesTheIndexedFileFromItsOwningDesktop() async throws {
    try await assertTranscriptFileShare(requiresBasenameLookup: true)
  }

  private func assertTranscriptFileShare(requiresBasenameLookup: Bool) async throws {
    let environment = ProcessInfo.processInfo.environment
    let probeKey = requiresBasenameLookup ? "NATIVE_E2E_TRANSCRIPT_BARE_FILE_PROBE" : "NATIVE_E2E_TRANSCRIPT_FILE_PROBE"
    try XCTSkipUnless(peerMode == .mock && environment[probeKey] != nil,
      "This journey uses a scoped simulator fixture for the staged attachment.")
    let probe = try XCTUnwrap(environment[probeKey].flatMap(URL.init(string:)))
    let checkpoint = requiresBasenameLookup ? "transcript-bare-download-held" : "transcript-file-held"
    let filename = requiresBasenameLookup ? "audit notes.txt" : "transcript-test.txt"
    let caption = requiresBasenameLookup ? "The editable transcript attachments are ready." : "The transcript attachment is ready."
    applyFixtureAppearance()
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    _ = try await control(path: "/v1/checkpoints/\(checkpoint)", method: "POST")
    try await pairBothFixtureHosts()
    let baseline = try await scenarioState()
    let thread = navigationHostThread(label: "Navigation Host A")
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
    XCTAssertTrue(app.staticTexts[caption].waitForExistence(timeout: 12))
    let download = app.buttons["Download \(filename)"].firstMatch
    XCTAssertTrue(download.waitForExistence(timeout: 8) && download.isEnabled)
    download.tap()
    let priorTickets = try baseline.host("primary").operationJournal.filter { $0.operationId == "route:file-media-ticket" }.count
    try await waitForJournal(hostID: "primary", operationID: "route:file-media-ticket", count: priorTickets + 1)
    try await assertNativeDuoDisplayTransitions("transcript-file-pending", content: download, availableAction: nil) { pose in
      XCTAssertFalse(download.isEnabled, pose)
    }
    _ = try await control(path: "/v1/checkpoints/transcript-file-release", method: "POST")

    func verify(_ stage: String) async throws {
      var request = URLRequest(url: probe.appendingPathComponent(stage))
      request.httpMethod = "POST"
      request.setValue("Harness \(capability)", forHTTPHeaderField: "Authorization")
      let (_, response) = try await URLSession.shared.data(for: request)
      XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, stage)
    }
    utilityProof("transcript-file-transfer-settled")
    try await verify("staged")
    let save = app.descendants(matching: .any)
      .matching(NSPredicate(format: "label CONTAINS[c] %@", "Save to Files")).firstMatch
    XCTAssertTrue(save.waitForExistence(timeout: 15))
    try await assertNativeDuoDisplayTransitions("transcript-file-share", content: save, availableAction: nil) { _ in
      XCTAssertTrue(save.exists)
    }
    utilityProof("transcript-file-share")
    let close = app.buttons.matching(NSPredicate(format: "label IN %@", ["Close", "Cancel"])).firstMatch
    XCTAssertTrue(close.waitForExistence(timeout: 5) && close.isHittable)
    close.tap()
    try await poll { !save.exists && download.isEnabled }
    try await verify("clean")
    let state = try await scenarioState()
    for (host, expected) in [("primary", 1), ("collision-b", 0)] {
      let previous = try baseline.host(host).operationJournal
      let operations = try state.host(host).operationJournal.dropFirst(previous.count).map(\.operationId)
      for operation in ["route:file-media-ticket", "route:file-media", "route:file-media-release"] {
        let count = operations.filter { $0 == operation }.count
        XCTAssertEqual(count, expected, "\(host) \(operation)")
      }
      let lookups = operations.filter { $0 == "procedure:searchProjectFiles" }.count
      XCTAssertEqual(lookups, requiresBasenameLookup && host == "primary" ? 1 : 0, host)
    }
  }

  private var sourceReferenceChips: XCUIElementQuery {
    app.descendants(matching: .any).matching(identifier: "native-e2e.transcript-source-reference")
  }

  private func openFixtureSourceLink(
    checkTranscriptDisplays: Bool = false
  ) async throws -> (probe: URL, transcript: XCUIElement, editor: XCUIElement, before: FamilyScenarioState) {
    let env = ProcessInfo.processInfo.environment
    try XCTSkipUnless(peerMode == .mock && env["NATIVE_E2E_SOURCE_LINK_PROBE"] != nil,
      "This journey uses two disposable desktops with different contents at the same path.")
    let probe = try XCTUnwrap(env["NATIVE_E2E_SOURCE_LINK_PROBE"].flatMap(URL.init(string:)))
    applyFixtureAppearance()
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await transcriptFixtureProbe(probe, "prepare")
    try await pairBothFixtureHosts()

    let thread = navigationHostThread(label: "Native E2E Collision Host B")
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
    let transcript = app.staticTexts["Inspect the source reference."].firstMatch
    XCTAssertTrue(transcript.waitForExistence(timeout: 10))
    let link = sourceReferenceChips.element(boundBy: 0)
    let codeLink = sourceReferenceChips.element(boundBy: 1)
    let listLink = sourceReferenceChips.element(boundBy: 2)
    func assertChips(_ context: String) {
      XCTAssertEqual(sourceReferenceChips.count, 3, context)
      for reference in [link, codeLink, listLink] {
        XCTAssertTrue(reference.isHittable, context)
        let frame = reference.frame
        XCTAssertGreaterThanOrEqual(frame.width + 0.001, 44, context)
        XCTAssertEqual(frame.height, transcript.frame.height, accuracy: 1, context)
        XCTAssertEqual(reference.label, "README.md", context)
        XCTAssertEqual(reference.value as? String, "README.md:48", context)
      }
    }
    utilityProof("source-link-transcript")
    XCTAssertTrue(link.waitForExistence(timeout: 5), app.debugDescription)
    assertChips("initial transcript")
    if checkTranscriptDisplays {
      try await assertNativeDuoDisplayTransitions("source-reference-chips", content: link, availableAction: nil,
        assertState: assertChips)
    }
    let before = try await scenarioState()
    try await tapNativeToolbarActionAfterDisplayTransition(checkTranscriptDisplays ? listLink : link)

    let editor = app.textViews["native-e2e.project-file-editor"].firstMatch
    XCTAssertTrue(editor.waitForExistence(timeout: 10))
    let contents = try XCTUnwrap(editor.value as? String)
    XCTAssertTrue(contents.contains("B SOURCE LINE 48"))
    XCTAssertFalse(contents.contains("A SOURCE LINE 48"))
    XCTAssertFalse(app.keyboards.firstMatch.exists)
    return (probe, transcript, editor, before)
  }

  @discardableResult
  private func transcriptFixtureProbe(_ probe: URL, _ stage: String) async throws -> Data {
    var request = URLRequest(url: probe.appendingPathComponent(stage))
    request.httpMethod = "POST"
    request.setValue("Harness \(capability)", forHTTPHeaderField: "Authorization")
    let (data, response) = try await URLSession.shared.data(for: request)
    XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, stage)
    return data
  }

  func testTranscriptSourceLinkOpensTheOwningDesktopFileAcrossDisplays() async throws {
    let (_, transcript, editor, before) = try await openFixtureSourceLink(checkTranscriptDisplays: true)
    let contents = try XCTUnwrap(editor.value as? String)
    utilityProof("source-link-editor")
    try await assertNativeDuoDisplayTransitions("source-link", content: editor, availableAction: nil) { pose in
      XCTAssertEqual(editor.value as? String, contents, pose)
    }

    let close = app.buttons["native-e2e.source-file.close"].firstMatch
    XCTAssertTrue(close.waitForExistence(timeout: 5))
    try await tapNativeToolbarActionAfterDisplayTransition(close)
    XCTAssertTrue(transcript.waitForExistence(timeout: 8) && transcript.isHittable)
    utilityProof("source-link-returned")

    let inlineLink = app.links.matching(NSPredicate(format: "label CONTAINS %@", "source in context")).firstMatch
    if inlineLink.isHittable {
      try await tapNativeToolbarActionAfterDisplayTransition(inlineLink)
    } else {
      // Some iOS versions expose a Text view's inline links through the
      // VoiceOver rotor. Exercise the badge where it is drawn in this row.
      let sentence = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Read the")).firstMatch
      XCTAssertTrue(sentence.waitForExistence(timeout: 6) && sentence.isHittable)
      try await tapNativeToolbarActionAfterDisplayTransition(sentence, offsetFromLeading: 94)
    }
    XCTAssertTrue(editor.waitForExistence(timeout: 10))
    XCTAssertEqual(editor.value as? String, contents)
    utilityProof("source-link-inline-editor")
    let state = try await scenarioState()
    for hostID in ["primary", "collision-b"] {
      let previous = try before.host(hostID).operationJournal
      let journal = try state.host(hostID).operationJournal.dropFirst(previous.count)
      XCTAssertEqual(journal.filter { $0.operationId == "procedure:readProjectFile" }.count,
        hostID == "collision-b" ? 2 : 0)
      XCTAssertFalse(journal.contains { $0.operationId == "procedure:writeProjectFile" })
    }
  }

  func testTranscriptTextAttachmentsOpenAndSaveInTheirOwningWorkspace() async throws {
    try XCTSkipIf(peerMode == .real, "This journey edits a disposable transcript attachment.")
    let isPad = UIDevice.current.userInterfaceIdiom == .pad
    XCUIDevice.shared.orientation = isPad ? .landscapeLeft : .portrait
    applyFixtureAppearance()
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    _ = try await control(path: "/v1/checkpoints/transcript-editable-files-ready", method: "POST")
    try await pairBothFixtureHosts()
    let baseline = try await scenarioState()
    let ownerBefore = try baseline.host("primary").operationJournal
    let otherBefore = try baseline.host("collision-b").operationJournal
    let row = navigationHostThread(label: "Navigation Host A")
    revealNavigationThread(row)
    XCTAssertTrue(row.waitForExistence(timeout: 10)); row.tap()
    let caption = app.staticTexts["The editable transcript attachments are ready."].firstMatch
    XCTAssertTrue(caption.waitForExistence(timeout: 10))

    let editor = app.textViews["native-e2e.project-file-editor"].firstMatch
    let close = app.buttons["native-e2e.source-file.close"].firstMatch
    func open(_ name: String, expecting content: String) async throws {
      let filename = app.buttons["native-e2e.transcript-project-file.open.\(name)"].firstMatch
      let download = app.buttons["Download \(name)"].firstMatch
      XCTAssertTrue(filename.waitForExistence(timeout: 8) && filename.isHittable)
      XCTAssertTrue(download.exists)
      try await tapNativeToolbarActionAfterDisplayTransition(filename)
      XCTAssertTrue(editor.waitForExistence(timeout: 10))
      try await poll { editor.value as? String == content }
      utilityProof("transcript-editor-\(name)")
    }
    func returnToChat() async throws {
      try await tapNativeToolbarActionAfterDisplayTransition(close)
      try await poll { caption.exists && !editor.exists }
    }

    try await open("activity.csv", expecting: "label,value\nopen,3\n")
    try await returnToChat()
    try await open("activity.tsv", expecting: "label\tvalue\nclosed\t5\n")
    try await returnToChat()
    try await open("audit notes.txt", expecting: "Notes from the selected desktop.\n")

    try await tapNativeToolbarActionAfterDisplayTransition(editor)
    XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 8))
    let marker = " Transcript artifact edit"
    editor.typeText(marker)
    let draft = try XCTUnwrap(editor.value as? String)
    XCTAssertTrue(draft.contains(marker))
    let save = app.buttons["native-e2e.project-file.save"].firstMatch
    let discard = app.buttons["native-e2e.project-file.discard"].firstMatch
    try await poll { save.exists && save.isEnabled && discard.exists && discard.isEnabled }
    try await assertDraftSurvivesDisplayTransitions("transcript-artifact-draft", field: editor, value: draft, availableAction: save)
    if isPad {
      try await rotateIPadJourney(to: .portrait)
      try await poll { editor.exists && editor.value as? String == draft && save.isEnabled }
    }
    let readCount = try await journalCount(hostID: "primary", operationID: "procedure:readProjectFile")
    _ = try await control(path: "/v1/checkpoints/transcript-editable-files-reconnect", method: "POST")
    try await waitForJournal(hostID: "primary", operationID: "procedure:readProjectFile", count: readCount + 1)
    try await poll { editor.exists && editor.value as? String == draft && save.isEnabled }
    utilityProof("transcript-artifact-reconnected")
    try await tapNativeToolbarActionAfterDisplayTransition(save)
    let priorWrites = ownerBefore.filter { $0.operationId == "procedure:writeProjectFile" }.count
    try await waitForJournal(hostID: "primary", operationID: "procedure:writeProjectFile", count: priorWrites + 1)
    try await poll { save.exists && !save.isEnabled && !discard.exists }
    utilityProof("transcript-artifact-saved")
    try await returnToChat()
    try await open("audit notes.txt", expecting: draft)
    try await returnToChat()

    let state = try await scenarioState()
    let owner = try state.host("primary").operationJournal.dropFirst(ownerBefore.count).map(\.operationId)
    let other = try state.host("collision-b").operationJournal.dropFirst(otherBefore.count).map(\.operationId)
    XCTAssertGreaterThanOrEqual(owner.filter { $0 == "procedure:searchProjectFiles" }.count, 2)
    XCTAssertGreaterThanOrEqual(owner.filter { $0 == "procedure:readProjectFile" }.count, 4)
    XCTAssertEqual(owner.filter { $0 == "procedure:writeProjectFile" }.count, 1)
    XCTAssertFalse(owner.contains("route:file-media-ticket"))
    XCTAssertFalse(other.contains { ["procedure:searchProjectFiles", "procedure:readProjectFile", "procedure:writeProjectFile", "route:file-media-ticket"].contains($0) })
  }

  func testLinkedFileDraftSurvivesReconnectAndSavesOnlyToItsDesktop() async throws {
    let (probe, transcript, editor, before) = try await openFixtureSourceLink()
    let previous = try before.host("collision-b").operationJournal
    let previousReads = previous.filter { $0.operationId == "procedure:readProjectFile" }.count
    let previousWrites = previous.filter { $0.operationId == "procedure:writeProjectFile" }.count
    let marker = " Kept after reconnect"
    editor.coordinate(withNormalizedOffset: CGVector(dx: 0.18, dy: 0.48)).tap()
    XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 6))
    editor.typeText(marker)
    let draft = try XCTUnwrap(editor.value as? String)
    XCTAssertTrue(draft.contains(marker))
    utilityProof("source-file-dirty")

    try await transcriptFixtureProbe(probe, "disconnect")
    try await waitForJournal(hostID: "collision-b", operationID: "procedure:readProjectFile", count: previousReads + 2)
    try await poll { editor.exists && editor.value as? String == draft }
    let beforeSave = try await journalCount(hostID: "collision-b", operationID: "procedure:writeProjectFile")
    XCTAssertEqual(beforeSave, previousWrites)
    utilityProof("source-file-reconnected")

    let save = app.buttons["native-e2e.project-file.save"].firstMatch
    try await poll { save.exists && save.isEnabled }
    try await tapNativeToolbarActionAfterDisplayTransition(save)
    try await waitForJournal(hostID: "collision-b", operationID: "procedure:writeProjectFile", count: previousWrites + 1)
    try await poll { save.exists && save.label == "Save file" && !save.isEnabled }
    XCTAssertEqual(editor.value as? String, draft)
    try await transcriptFixtureProbe(probe, "saved")
    let close = app.buttons["native-e2e.source-file.close"].firstMatch
    try await tapNativeToolbarActionAfterDisplayTransition(close)
    XCTAssertTrue(transcript.waitForExistence(timeout: 8) && transcript.isHittable)

    let reopened = sourceReferenceChips.element(boundBy: 1)
    XCTAssertTrue(reopened.waitForExistence(timeout: 5) && reopened.isHittable)
    reopened.tap()
    try await poll { editor.exists && editor.value as? String == draft }
    try await waitForJournal(hostID: "collision-b", operationID: "procedure:readProjectFile", count: previousReads + 3)
    let state = try await scenarioState()
    let previousPrimary = try before.host("primary").operationJournal
    let otherDesktop = try state.host("primary").operationJournal.dropFirst(previousPrimary.count)
    XCTAssertFalse(otherDesktop.contains {
      ["procedure:readProjectFile", "procedure:writeProjectFile"].contains($0.operationId)
    })
    utilityProof("source-file-save-reopened")
  }

  func testCheckpointRevertUsesTheToolBoundaryAndReportsLocalOnlyOutcome() async throws {
    let value = ProcessInfo.processInfo.environment["NATIVE_E2E_CHECKPOINT_REVERT_PROBE"]
    try XCTSkipUnless(peerMode == .mock && value != nil, "This journey reverts a disposable fixture conversation.")
    let probe = try XCTUnwrap(value.flatMap(URL.init(string:)))
    applyFixtureAppearance()
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await transcriptFixtureProbe(probe, "prepare")
    try await pairBothFixtureHosts()
    let thread = navigationHostThread(label: "Native E2E Collision Host B")
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()

    let prompt = app.staticTexts["Later checkpoint request"].firstMatch
    let reply = app.staticTexts["After checkpoint reply"].firstMatch
    XCTAssertTrue(prompt.waitForExistence(timeout: 10) && reply.exists)
    let menuAction = app.buttons["Revert to This Checkpoint"].firstMatch
    let confirm = app.buttons["Revert"].firstMatch
    let cancel = app.buttons["Cancel"].firstMatch
    func openConfirmation() {
      prompt.press(forDuration: 1)
      XCTAssertTrue(menuAction.waitForExistence(timeout: 6))
      menuAction.tap()
      XCTAssertTrue(confirm.waitForExistence(timeout: 6))
    }
    openConfirmation()
    cancel.tap()
    try await poll { !confirm.exists && reply.exists }
    let before = try await journalCount(hostID: "collision-b", operationID: "route:thread-checkpoint-revert")
    XCTAssertEqual(before, 0)

    let unsent = "Existing unsent draft"
    try await enterWorkspaceDraft(unsent)
    let collapse = app.buttons["native-e2e.composer-collapse"]
    XCTAssertTrue(collapse.isHittable)
    collapse.tap()
    try await poll { !self.app.keyboards.firstMatch.exists }

    openConfirmation()
    try await assertNativeDuoDisplayTransitions("checkpoint-confirmation", content: confirm, availableAction: nil) { pose in
      XCTAssertTrue(confirm.isHittable && cancel.exists, pose)
    }
    utilityProof("checkpoint-confirmation")
    try await tapNativeToolbarActionAfterDisplayTransition(confirm)
    let warning = app.staticTexts["Local history reverted"].firstMatch
    XCTAssertTrue(warning.waitForExistence(timeout: 12))
    utilityProof("checkpoint-local-only")
    let done = app.buttons["Done"].firstMatch
    XCTAssertTrue(done.isHittable); done.tap()
    try await poll { !reply.exists && !prompt.exists }
    let editor = app.textViews["native-e2e.composer"]
    let alternate = app.buttons["native-e2e.composer-alternate-draft"]
    let attachment = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "rollback-brief.pdf")).firstMatch
    try await poll {
      editor.exists && editor.value as? String == "Later checkpoint request"
        && alternate.isHittable && attachment.exists
    }
    XCTAssertEqual(alternate.label, "Restore previous draft")
    utilityProof("checkpoint-restored-prompt")

    alternate.tap()
    try await poll { editor.value as? String == unsent && !attachment.exists }
    XCTAssertEqual(alternate.label, "Restore reverted prompt")
    utilityProof("checkpoint-previous-draft")
    alternate.tap()
    try await poll { editor.value as? String == "Later checkpoint request" && attachment.exists }

    XCTAssertTrue(collapse.isHittable)
    collapse.tap()
    let collapsed = app.buttons["native-e2e.composer-collapsed"]
    try await poll { collapsed.isHittable && !self.app.keyboards.firstMatch.exists }
    try await assertNativeDuoDisplayTransitions(
      "checkpoint-restored-draft", content: collapsed, availableAction: alternate
    ) { pose in
      XCTAssertEqual(collapsed.value as? String, "Later checkpoint request", pose)
      XCTAssertTrue(attachment.exists && alternate.isHittable, pose)
    }
    XCTAssertTrue(app.staticTexts["Fixture response"].firstMatch.exists)
    try await transcriptFixtureProbe(probe, "verify")
    utilityProof("checkpoint-history")
  }

  func testUsageProviderReorderPersistsAcrossDisplaysAndRelaunch() async throws {
    let value = ProcessInfo.processInfo.environment["NATIVE_E2E_SIDEBAR_USAGE_PROBE"]
    try XCTSkipUnless(peerMode == .mock && value != nil, "This journey uses disposable provider-usage fixtures.")
    let probe = try XCTUnwrap(value.flatMap(URL.init(string:)))
    applyFixtureAppearance()
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await transcriptFixtureProbe(probe, "prepare")
    try await pairUntilHome()

    func openUsage() async throws {
      openFixtureMore()
      let usage = app.buttons.matching(NSPredicate(
        format: "label == %@ AND identifier != %@", "Usage", "native-e2e.sidebar.usage"
      )).firstMatch
      try await poll { usage.isHittable }
      usage.tap()
    }

    try await openUsage()
    let claude = app.staticTexts["claude-sample-a"].firstMatch
    let codex = app.staticTexts["codex-sample-a"].firstMatch
    let action = app.descendants(matching: .any).matching(identifier: "native-e2e.usage.reorder").firstMatch
    try await poll { claude.isHittable && codex.isHittable && action.isHittable }
    let initialFirst = claude.frame.midY < codex.frame.midY ? claude : codex
    let initialLast = initialFirst == claude ? codex : claude
    try await tapNativeToolbarActionAfterDisplayTransition(action)
    try await poll { action.label == "Done" }

    let handles = app.descendants(matching: .any)
      .matching(NSPredicate(format: "label BEGINSWITH[c] %@", "Reorder"))
    let handle = try XCTUnwrap(handles.allElementsBoundByIndex
      .filter { $0.isHittable && $0.frame.midY > initialFirst.frame.midY }
      .min { abs($0.frame.midY - initialLast.frame.midY) < abs($1.frame.midY - initialLast.frame.midY) },
      app.debugDescription)
    let destination = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(
      dx: handle.frame.midX - app.frame.minX,
      dy: initialFirst.frame.midY - app.frame.minY - 16
    ))
    handle.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
      .press(forDuration: 0.35, thenDragTo: destination)
    try await poll { initialLast.isHittable && initialFirst.isHittable && initialLast.frame.midY < initialFirst.frame.midY }
    utilityProof("usage-reorder-dragged")
    try await assertNativeDuoDisplayTransitions("usage-reordered", content: initialLast, availableAction: action) { pose in
      XCTAssertEqual(action.label, "Done", pose)
      XCTAssertTrue(claude.isHittable && codex.isHittable, pose)
      XCTAssertLessThan(initialLast.frame.midY, initialFirst.frame.midY, pose)
    }
    try await tapNativeToolbarActionAfterDisplayTransition(action)
    try await poll { action.label == "Edit" }

    app.terminate()
    app.launchArguments.removeAll { $0 == "-native-e2e-fresh-state" }
    app.launch()
    XCTAssertTrue(mockHomeReady.waitForExistence(timeout: 20))
    try await openUsage()
    try await poll { claude.isHittable && codex.isHittable }
    XCTAssertLessThan(initialLast.frame.midY, initialFirst.frame.midY)
    utilityProof("usage-reorder-relaunched")
    let state = try await scenarioState()
    for host in ["primary", "collision-b"] {
      XCTAssertFalse(try state.host(host).operationJournal.contains {
        $0.operationId == "route:settings-write"
      }, host)
    }
  }

  func testSidebarUsageFollowsTheSelectedDesktopAndOpensItsProvider() async throws {
    let value = ProcessInfo.processInfo.environment["NATIVE_E2E_SIDEBAR_USAGE_PROBE"]
    try XCTSkipUnless(peerMode == .mock && value != nil, "This journey uses two disposable provider-usage fixtures.")
    let probe = try XCTUnwrap(value.flatMap(URL.init(string:)))
    let driver = ProcessInfo.processInfo.environment["NATIVE_E2E_DUO_TRANSITION_URL"]
    applyFixtureAppearance()
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await transcriptFixtureProbe(probe, "prepare")

    func display(_ command: String) async throws {
      guard let driver else { return }
      let url = try XCTUnwrap(URL(string: "\(driver)/\(command)"))
      let (_, response) = try await URLSession.shared.data(from: url)
      XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, command)
    }
    try await display("move/inner")
    try await pairBothFixtureHosts()
    let innerWidth = app.frame.width
    let a = navigationHostThread(label: "Navigation Host A")
    let b = navigationHostThread(label: "Native E2E Collision Host B")
    func isOnScreen(_ element: XCUIElement) -> Bool {
      guard element.exists else { return false }
      let frame = element.frame
      return !frame.isEmpty && !frame.isInfinite && app.frame.contains(frame)
    }
    func reveal(_ row: XCUIElement) async throws {
      if !isOnScreen(row) {
        let toggle = app.buttons["native-e2e.sidebar-toggle"].firstMatch
        try await poll { isOnScreen(toggle) }
        toggle.tap()
      }
      try await poll { isOnScreen(row) }
    }
    let title = app.buttons["native-e2e.thread-status"].firstMatch
    try await reveal(a)
    a.tap()
    try await poll { title.exists && title.label.contains("Navigation Host A") }
    try await reveal(a)
    let claude = app.buttons["native-e2e.sidebar.usage.claude"].firstMatch
    let codex = app.buttons["native-e2e.sidebar.usage.codex"].firstMatch
    try await poll { claude.exists && (claude.value as? String)?.contains("34%") == true }
    XCTAssertTrue((codex.value as? String)?.contains("39%") == true)
    utilityProof("sidebar-usage-desktop-a")

    b.tap()
    try await poll { title.exists && title.label.contains("Native E2E Collision Host B") }
    try await reveal(b)
    try await waitForJournal(hostID: "collision-b", operationID: "route:provider-usage", count: 1)
    try await poll { !claude.exists && !codex.exists }
    try await transcriptFixtureProbe(probe, "release")
    try await poll { codex.exists && (codex.value as? String)?.contains("77%") == true }
    XCTAssertFalse(claude.exists)
    utilityProof("sidebar-usage-desktop-b")

    XCTAssertTrue(codex.isHittable); codex.tap()
    let account = app.staticTexts["codex-sample-b"].firstMatch
    let meter = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "77%")).firstMatch
    XCTAssertTrue(account.waitForExistence(timeout: 10))
    try await poll { meter.exists && meter.isHittable }
    utilityProof("sidebar-usage-provider")
    if driver != nil {
      for pose in ["partial", "outer", "inner"] {
        try await display("move/\(pose)")
        if pose == "outer" { try await poll { self.app.frame.width < innerWidth } }
        XCTAssertTrue(account.waitForExistence(timeout: 8), pose)
        XCTAssertTrue(meter.exists, pose)
        try await display("capture/sidebar-usage-provider-\(pose)")
        utilityProof("sidebar-usage-provider-\(pose)")
      }
    }
    try await transcriptFixtureProbe(probe, "verify")
  }

  func testTranscriptForkUsesTheSelectedTurnAndDesktopAcrossDisplays() async throws {
    let value = ProcessInfo.processInfo.environment["NATIVE_E2E_THREAD_FORK_PROBE"]
    try XCTSkipUnless(peerMode == .mock && value != nil, "This journey forks a disposable fixture thread.")
    let probe = try XCTUnwrap(value.flatMap(URL.init(string:)))
    applyFixtureAppearance()
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await transcriptFixtureProbe(probe, "prepare")
    try await pairBothFixtureHosts()
    let thread = navigationHostThread(label: "Native E2E Collision Host B")
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 10))
    thread.tap()

    let later = app.staticTexts["Later source reply"].firstMatch
    XCTAssertTrue(later.waitForExistence(timeout: 10))
    let forks = app.buttons.matching(NSPredicate(format: "label == %@", "Fork from here"))
    XCTAssertEqual(forks.count, 2)
    forks.element(boundBy: 0).tap()
    let field = app.textFields["Thread name"].firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 8))
    XCTAssertEqual(field.value as? String, "Fixture thread (fork)")
    let cancel = app.buttons["Cancel"].firstMatch
    XCTAssertTrue(cancel.isHittable)
    cancel.tap()
    try await poll { !field.exists && later.exists }
    let before = try await journalCount(hostID: "collision-b", operationID: "route:thread-command")
    XCTAssertEqual(before, 0)

    let draft = "Unsent source draft"
    try await enterWorkspaceDraft(draft)
    forks.element(boundBy: 0).tap()
    XCTAssertTrue(field.waitForExistence(timeout: 8))
    replaceCrewField(field, with: "Selected turn fork")
    let create = app.buttons["Create fork"].firstMatch
    try await assertNativeDuoDisplayTransitions("transcript-fork-title", content: field, availableAction: nil) { pose in
      XCTAssertEqual(field.value as? String, "Selected turn fork", pose)
      XCTAssertTrue(field.isHittable, pose)
      XCTAssertTrue(create.waitForExistence(timeout: 5))
      XCTAssertTrue(self.toolbarActionClearsKeyboard(create), pose)
      XCTAssertGreaterThanOrEqual(field.frame.minY + 1, create.frame.maxY, pose)
    }
    utilityProof("transcript-fork-title")
    try await tapNativeToolbarActionAfterDisplayTransition(create)

    let source = app.buttons["Forked from Fixture thread"].firstMatch
    XCTAssertTrue(source.waitForExistence(timeout: 12))
    try await poll { source.isHittable }
    XCTAssertTrue(app.staticTexts["Fixture response"].firstMatch.exists)
    XCTAssertTrue(app.staticTexts["Inherited history ends here"].firstMatch.exists)
    XCTAssertFalse(later.exists)
    if UIDevice.current.userInterfaceIdiom == .pad {
      let forkRow = app.buttons.matching(NSPredicate(
        format: "identifier BEGINSWITH %@ AND label CONTAINS %@ AND label CONTAINS %@",
        "native-e2e.thread.", "Selected turn fork", "Native E2E Collision Host B"
      )).firstMatch
      try await poll { forkRow.exists && forkRow.isSelected && thread.exists && !thread.isSelected }
    }
    utilityProof("transcript-fork-history")
    source.tap()
    XCTAssertTrue(later.waitForExistence(timeout: 10))
    if UIDevice.current.userInterfaceIdiom == .pad {
      try await poll { thread.exists && thread.isSelected }
    }
    try await assertWorkspaceDraft(draft)
    try await transcriptFixtureProbe(probe, "verify")
    utilityProof("transcript-fork-source")
  }

  func testQueuedFollowUpsEditAndSteerTheirOwnDesktopAcrossDisplays() async throws {
    let value = ProcessInfo.processInfo.environment["NATIVE_E2E_FOLLOW_UP_QUEUE_PROBE"]
    try XCTSkipUnless(peerMode == .mock && value != nil, "This journey edits a disposable desktop queue.")
    let probe = try XCTUnwrap(value.flatMap(URL.init(string:)))
    applyFixtureAppearance()
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()
    let thread = navigationHostThread(label: "Native E2E Collision Host B")
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 10))
    thread.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].firstMatch.waitForExistence(timeout: 10))
    try await transcriptFixtureProbe(probe, "publish")

    func action(_ name: String) -> XCUIElement { app.buttons["native-e2e.follow-ups.\(name)"].firstMatch }
    let open = action("open")
    let quickSteer = action("steer-first")
    XCTAssertTrue(open.waitForExistence(timeout: 8))
    XCTAssertTrue(quickSteer.isHittable && quickSteer.isEnabled)
    utilityProof("follow-ups-dock")
    open.tap()

    let first = action("row.first")
    XCTAssertTrue(first.waitForExistence(timeout: 8))
    XCTAssertTrue(first.label.contains("Desktop B first"))
    first.tap()
    let draft = app.descendants(matching: .any)["native-e2e.follow-ups.edit-draft"].firstMatch
    let save = action("save")
    XCTAssertTrue(draft.waitForExistence(timeout: 8))
    draft.tap()
    draft.typeText(" local edit")
    let edited = try XCTUnwrap(draft.value as? String)
    XCTAssertTrue(edited.contains("local edit"))
    try await assertNativeDuoDisplayTransitions("follow-ups-editor", content: draft, availableAction: nil) { pose in
      XCTAssertEqual(draft.value as? String, edited, pose)
      XCTAssertTrue(save.waitForExistence(timeout: 5))
      XCTAssertTrue(self.toolbarActionClearsKeyboard(save), pose)
      XCTAssertTrue(draft.isHittable, pose)
      XCTAssertGreaterThanOrEqual(draft.frame.minY + 1, save.frame.maxY, pose)
    }
    utilityProof("follow-ups-editor")
    try await tapNativeToolbarActionAfterDisplayTransition(save)
    try await poll { !draft.exists && first.exists && first.label.contains("local edit") }

    let second = action("row.second")
    XCTAssertTrue(second.isHittable)
    second.tap()
    XCTAssertTrue(draft.waitForExistence(timeout: 8))
    draft.tap()
    draft.typeText(" keep this")
    let unsaved = try XCTUnwrap(draft.value as? String)
    XCTAssertTrue(unsaved.contains("keep this"))
    try await transcriptFixtureProbe(probe, "clear")
    let changed = app.staticTexts["native-e2e.follow-ups.edit-status"].firstMatch
    try await poll {
      changed.exists && changed.label.contains("The queued message changed") && save.exists && !save.isEnabled
    }
    XCTAssertEqual(draft.value as? String, unsaved)
    utilityProof("follow-ups-removed-draft")
    try await tapNativeToolbarActionAfterDisplayTransition(action("cancel-edit"))
    try await poll { !draft.exists && self.app.staticTexts["No queued follow-ups."].firstMatch.exists }
    try await tapNativeToolbarActionAfterDisplayTransition(action("close"))

    try await transcriptFixtureProbe(probe, "restore")
    XCTAssertTrue(quickSteer.waitForExistence(timeout: 8) && quickSteer.isHittable)
    quickSteer.tap()
    try await waitForJournal(hostID: "collision-b", operationID: "procedure:steerQueuedThreadFollowUp", count: 1)
    try await poll { open.exists && open.label.contains("Desktop B second") }
    try await transcriptFixtureProbe(probe, "verify")
    utilityProof("follow-ups-steered")
  }

  func testTranscriptCodeCopiesTheSelectedBlockAcrossDisplays() async throws {
    let env = ProcessInfo.processInfo.environment
    try XCTSkipUnless(peerMode == .mock && env["NATIVE_E2E_TRANSCRIPT_CODE_PROBE"] != nil,
      "This journey checks the pasteboard on a disposable simulator.")
    let probe = try XCTUnwrap(env["NATIVE_E2E_TRANSCRIPT_CODE_PROBE"].flatMap(URL.init(string:)))
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/transcript-code-ready", method: "POST")
    try await pairUntilHome()
    let thread = navigationHostThread(label: "Navigation Host A")
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
    XCTAssertTrue(app.staticTexts["Copy only the selected code block."].waitForExistence(timeout: 10))

    let copies = app.buttons.matching(identifier: "native-e2e.transcript-code.copy")
    let first = copies.element(boundBy: 0)
    let second = copies.element(boundBy: 1)
    func verify(_ block: String) async throws {
      var request = URLRequest(url: probe.appendingPathComponent(block))
      request.httpMethod = "POST"
      request.setValue("Harness \(capability)", forHTTPHeaderField: "Authorization")
      let (_, response) = try await URLSession.shared.data(for: request)
      XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, block)
    }
    XCTAssertTrue(first.waitForExistence(timeout: 8))
    XCTAssertTrue(first.isHittable)
    XCTAssertEqual(first.label, "Copy code")
    first.tap()
    try await verify("first")
    utilityProof("transcript-code-first-copied")
    try await assertNativeDuoDisplayTransitions("transcript-code", content: second, availableAction: nil) { pose in
      XCTAssertEqual(copies.count, 2, pose)
      XCTAssertTrue(second.isHittable, pose)
    }
    XCTAssertTrue(second.isHittable)
    second.tap()
    try await verify("second")
    utilityProof("transcript-code-second-copied")
    let sends = try await journalCount(hostID: "primary", operationID: "route:thread-send")
    XCTAssertEqual(sends, 0)
  }

  func testTranscriptImagePreviewAndShareSurviveDisplayChanges() async throws {
    try XCTSkipUnless(peerMode == .mock, "This journey opens a synthetic transcript image.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    _ = try await control(path: "/v1/checkpoints/transcript-image-ready", method: "POST")
    try await pairBothFixtureHosts()
    let thread = navigationHostThread(label: "Navigation Host A")
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
    let caption = app.staticTexts["The transcript image is ready."].firstMatch
    XCTAssertTrue(caption.waitForExistence(timeout: 12))
    let image = app.buttons["Conversation image"].firstMatch
    XCTAssertTrue(image.waitForExistence(timeout: 10) && image.isHittable)
    image.tap()

    let preview = app.navigationBars["Image Preview"].firstMatch
    let share = app.buttons["Share Image"].firstMatch
    let copy = app.buttons["Copy Image"].firstMatch
    XCTAssertTrue(preview.waitForExistence(timeout: 8))
    XCTAssertTrue(share.isHittable && copy.isHittable)
    try await assertNativeDuoDisplayTransitions("transcript-image-preview", content: preview, availableAction: nil) { pose in
      XCTAssertTrue(share.isHittable && copy.isHittable, pose)
    }
    utilityProof("transcript-image-preview")
    share.tap()
    utilityProof("transcript-image-share-requested")
    let shareAction = app.descendants(matching: .any)
      .matching(NSPredicate(format: "label IN[c] %@", ["Copy", "Save Image", "Save to Photos"])).firstMatch
    guard shareAction.waitForExistence(timeout: 12) else {
      utilityProof("transcript-image-share-missing")
      return XCTFail("The native image share sheet did not show an image action.")
    }
    try await assertNativeDuoDisplayTransitions("transcript-image-share", content: shareAction, availableAction: nil) { _ in
      XCTAssertTrue(shareAction.exists)
    }
    utilityProof("transcript-image-share")
    let closeSheet = app.buttons.matching(NSPredicate(format: "label IN %@", ["Close", "Cancel"])).firstMatch
    XCTAssertTrue(closeSheet.waitForExistence(timeout: 5) && closeSheet.isHittable)
    closeSheet.tap()
    try await poll { !shareAction.exists && share.isHittable }
    app.buttons["Close Image Preview"].firstMatch.tap()
    try await poll { caption.isHittable && image.isHittable }
  }

  func testTranscriptPdfPreviewRetainsPageAndOwningDesktopAcrossDisplays() async throws {
    let value = ProcessInfo.processInfo.environment["NATIVE_E2E_TRANSCRIPT_PDF_PROBE"]
    try XCTSkipUnless(peerMode == .mock && value != nil, "This journey previews a disposable three-page PDF.")
    let probe = try XCTUnwrap(value.flatMap(URL.init(string:)))
    let isPad = UIDevice.current.userInterfaceIdiom == .pad
    XCUIDevice.shared.orientation = isPad ? .landscapeLeft : .portrait
    applyFixtureAppearance()
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    _ = try await control(path: "/v1/checkpoints/transcript-pdf-held", method: "POST")
    try await pairBothFixtureHosts()
    let thread = navigationHostThread(label: "Navigation Host A")
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()

    let caption = app.staticTexts["The transcript PDF is ready."].firstMatch
    XCTAssertTrue(caption.waitForExistence(timeout: 12))
    let download = app.buttons["Download transcript-preview.pdf"].firstMatch
    XCTAssertTrue(download.waitForExistence(timeout: 8) && download.isHittable)
    utilityProof("transcript-pdf-card")
    let preview = app.buttons["native-e2e.transcript-pdf.preview"].firstMatch
    XCTAssertTrue(preview.waitForExistence(timeout: 5) && preview.isHittable)
    try await tapNativeToolbarActionAfterDisplayTransition(preview)
    try await waitForJournal(hostID: "primary", operationID: "route:file-media-ticket", count: 1)
    try await assertNativeDuoDisplayTransitions("transcript-pdf-pending", content: caption, availableAction: nil) { _ in
      XCTAssertFalse(download.isEnabled)
    }
    _ = try await control(path: "/v1/checkpoints/transcript-file-release", method: "POST")
    try await transcriptFixtureProbe(probe, "staged")
    let close = app.buttons["native-e2e.transcript-pdf.close"].firstMatch
    try await poll { close.exists && close.isHittable }
    func shows(_ label: String) throws -> Bool {
      try renderedScreenText(in: app.screenshot()).localizedCaseInsensitiveContains(label)
    }
    try await poll { try shows("ALPHA PAGE") }
    utilityProof("transcript-pdf-first-page")

    for _ in 0..<3 {
      if try shows("BRAVO PAGE") { break }
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.53, dy: 0.76))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.53, dy: 0.3)))
    }
    try await poll { try shows("BRAVO PAGE") }

    try await assertNativeDuoDisplayTransitions("transcript-pdf-page", content: close, availableAction: close) { pose in
      // XCTest screenshots can sample the inactive display during a fold.
      // The fixture captures the selected simulator display for text recognition.
      try await self.poll {
        let screenshot = try await self.transcriptFixtureProbe(probe, "screen-\(pose)")
        let image = try XCTUnwrap(UIImage(data: screenshot)?.cgImage)
        return try self.recognizedText(in: image).localizedCaseInsensitiveContains("BRAVO PAGE")
      }
    }
    if isPad {
      try await rotateIPadJourney(to: .portrait)
      try await poll { try shows("BRAVO PAGE") }
    }
    utilityProof("transcript-pdf-second-page")
    try await tapNativeToolbarActionAfterDisplayTransition(close)
    try await poll { !close.exists && preview.isHittable && download.isHittable }
    try await transcriptFixtureProbe(probe, "clean")
    for (host, expected) in [("primary", 1), ("collision-b", 0)] {
      for operation in ["route:file-media-ticket", "route:file-media", "route:file-media-release"] {
        let count = try await journalCount(hostID: host, operationID: operation)
        XCTAssertEqual(count, expected, "\(host) \(operation)")
      }
    }
  }

  func testWideTranscriptTableScrollAndFindAcrossDisplays() async throws {
    try XCTSkipUnless(peerMode == .mock && ProcessInfo.processInfo.environment["NATIVE_E2E_WIDE_TABLE"] == "1",
      "This journey uses a disposable wide transcript table.")
    let isPad = UIDevice.current.userInterfaceIdiom == .pad
    XCUIDevice.shared.orientation = isPad ? .landscapeLeft : .portrait
    applyFixtureAppearance()
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/transcript-wide-table-ready", method: "POST")
    try await pairUntilHome()
    let thread = app.buttons["native-e2e.thread.thread-fixture-001"].firstMatch
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()

    let caption = app.staticTexts["The wide transcript table is ready."].firstMatch
    XCTAssertTrue(caption.waitForExistence(timeout: 12))
    utilityProof("wide-table-initial")
    let table = app.scrollViews["native-e2e.markdown-table"].firstMatch
    XCTAssertTrue(table.waitForExistence(timeout: 5) && table.isHittable)
    let near = table.staticTexts["Needle Near"].firstMatch
    let far = table.staticTexts["Needle Far"].firstMatch
    func shows(_ cell: XCUIElement) -> Bool {
      guard cell.exists && table.isHittable else { return false }
      let frame = cell.frame
      return table.frame.contains(CGPoint(x: frame.midX, y: frame.midY))
    }
    try await poll { shows(near) }
    XCTAssertFalse(shows(far))
    for _ in 0..<8 where !shows(far) { table.swipeLeft() }
    try await poll { shows(far) }
    utilityProof("wide-table-manual-scroll")

    let actions = app.descendants(matching: .any).matching(identifier: "native-e2e.thread.actions").firstMatch
    XCTAssertTrue(actions.waitForExistence(timeout: 8) && actions.isHittable)
    try await tapNativeToolbarActionAfterDisplayTransition(actions)
    let find = app.buttons["Find in chat"].firstMatch
    XCTAssertTrue(find.waitForExistence(timeout: 6) && find.isHittable)
    try await tapNativeToolbarActionAfterDisplayTransition(find)
    let query = app.textFields["native-e2e.chat-find-query"].firstMatch
    XCTAssertTrue(query.waitForExistence(timeout: 6)); query.tap(); query.typeText("Needle")
    let count = app.staticTexts["native-e2e.chat-find-count"].firstMatch
    try await poll { count.label == "1 of 2" && shows(near) }
    let next = app.buttons["native-e2e.chat-find-next"].firstMatch
    try await tapNativeToolbarActionAfterDisplayTransition(next)
    try await poll { count.label == "2 of 2" && shows(far) }

    try await assertNativeDuoDisplayTransitions("wide-table-find", content: table, availableAction: next) { _ in
      try await self.poll { count.label == "2 of 2" && shows(far) }
    }
    if isPad {
      try await rotateIPadJourney(to: .portrait)
      try await poll { count.label == "2 of 2" && shows(far) }
    }
    let previous = app.buttons["native-e2e.chat-find-previous"].firstMatch
    try await tapNativeToolbarActionAfterDisplayTransition(previous)
    try await poll { count.label == "1 of 2" && shows(near) }
    utilityProof("wide-table-find-return")
  }

  func testTranscriptHtmlVisualRetainsExpandedInteractionAcrossDisplays() async throws {
    try XCTSkipUnless(peerMode == .mock && ProcessInfo.processInfo.environment["NATIVE_E2E_TRANSCRIPT_HTML_VISUAL"] == "1",
      "This journey opens a disposable interactive transcript fixture.")
    let isPad = UIDevice.current.userInterfaceIdiom == .pad
    XCUIDevice.shared.orientation = isPad ? .landscapeLeft : .portrait
    applyFixtureAppearance()
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/transcript-html-visual-ready", method: "POST")
    try await pairUntilHome()
    let thread = app.buttons["native-e2e.thread.thread-fixture-001"].firstMatch
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()

    let caption = app.staticTexts["The transcript visual is ready."].firstMatch
    XCTAssertTrue(caption.waitForExistence(timeout: 12))
    let add = app.buttons["Add one"].firstMatch
    XCTAssertTrue(add.waitForExistence(timeout: 12) && add.isHittable)
    try await tapNativeToolbarActionAfterDisplayTransition(add)
    let one = app.staticTexts["Total 1"].firstMatch
    try await poll { one.exists }
    let expand = app.buttons["native-e2e.html-visual.expand"].firstMatch
    utilityProof("html-visual-inline")
    XCTAssertTrue(expand.waitForExistence(timeout: 4) && expand.isHittable)
    try await tapNativeToolbarActionAfterDisplayTransition(expand)

    let done = app.buttons["native-e2e.html-visual.done"].firstMatch
    try await poll { done.exists && done.isHittable && add.isHittable }
    try await poll { self.app.staticTexts["Total 0"].firstMatch.exists }
    try await tapNativeToolbarActionAfterDisplayTransition(add)
    try await tapNativeToolbarActionAfterDisplayTransition(add)
    let two = app.staticTexts["Total 2"].firstMatch
    try await poll { two.exists }
    utilityProof("html-visual-expanded")

    try await assertNativeDuoDisplayTransitions("html-visual-expanded", content: two, availableAction: done) { _ in
      XCTAssertTrue(add.isHittable && two.exists)
    }
    if isPad {
      try await rotateIPadJourney(to: .portrait)
      try await poll { two.exists && add.isHittable && done.isHittable }
    }
    try await tapNativeToolbarActionAfterDisplayTransition(add)
    try await poll { self.app.staticTexts["Total 3"].firstMatch.exists }
    try await tapNativeToolbarActionAfterDisplayTransition(done)
    try await poll { !done.exists && expand.isHittable && one.exists }
    utilityProof("html-visual-returned")
  }

  func testTranscriptVideoKeepsItsDesktopAndPlayerAcrossDisplayChanges() async throws {
    let value = ProcessInfo.processInfo.environment["NATIVE_E2E_TRANSCRIPT_VIDEO_PROBE"]
    try XCTSkipUnless(peerMode == .mock && value != nil,
      "This journey checks playback and private download cleanup on a disposable simulator.")
    let probe = try XCTUnwrap(value.flatMap(URL.init(string:)))
    let isPad = UIDevice.current.userInterfaceIdiom == .pad
    XCUIDevice.shared.orientation = isPad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    _ = try await control(path: "/v1/checkpoints/transcript-video-held", method: "POST")
    try await pairBothFixtureHosts()
    let thread = navigationHostThread(label: "Navigation Host A")
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
    let caption = app.staticTexts["The transcript video is ready."].firstMatch
    XCTAssertTrue(caption.waitForExistence(timeout: 12))
    let video = app.buttons["Play video: transcript-video.mp4"].firstMatch
    XCTAssertTrue(video.waitForExistence(timeout: 8) && video.isHittable)
    try await tapNativeToolbarActionAfterDisplayTransition(video)
    try await waitForJournal(hostID: "primary", operationID: "route:file-media-ticket", count: 1)
    try await assertNativeDuoDisplayTransitions("transcript-video-pending", content: video, availableAction: nil) { pose in
      XCTAssertFalse(video.isEnabled, pose)
    }
    if isPad {
      try await rotateIPadJourney(to: .portrait)
      try await poll { video.exists && !video.isEnabled }
    }
    _ = try await control(path: "/v1/checkpoints/transcript-file-release", method: "POST")
    try await transcriptFixtureProbe(probe, "staged")

    let done = app.buttons["Done"].firstMatch
    try await poll { done.exists && done.isHittable }
    utilityProof("transcript-video-player-opened")
    let playback = app.buttons["native-e2e.transcript-video.toggle-playback"].firstMatch
    func togglePlayback(from current: String, to next: String) async throws {
      try await poll {
        playback.exists && playback.label == current && self.toolbarActionClearsKeyboard(playback)
      }
      try await tapNativeToolbarActionAfterDisplayTransition(playback)
      try await poll { playback.exists && playback.label == next }
    }
    try await togglePlayback(from: "Play video", to: "Pause video")
    utilityProof("transcript-video-playing")
    try await togglePlayback(from: "Pause video", to: "Play video")

    try await assertNativeDuoDisplayTransitions("transcript-video-player", content: done, availableAction: done) { _ in
      try await togglePlayback(from: "Play video", to: "Pause video")
      try await togglePlayback(from: "Pause video", to: "Play video")
      try await self.transcriptFixtureProbe(probe, "staged")
    }
    if isPad {
      try await rotateIPadJourney(to: .landscapeLeft)
      try await poll { done.exists && done.isHittable }
    }
    utilityProof("transcript-video-player")
    try await tapNativeToolbarActionAfterDisplayTransition(done)
    try await poll { !done.isHittable && caption.isHittable && video.isHittable }
    try await transcriptFixtureProbe(probe, "clean")

    for (host, expected) in [("primary", 1), ("collision-b", 0)] {
      for operation in ["route:file-media-ticket", "route:file-media", "route:file-media-release"] {
        let count = try await journalCount(hostID: host, operationID: operation)
        XCTAssertEqual(count, expected, "\(host) \(operation)")
      }
    }
  }

  func testSystemNotificationPermissionAndSimulatedDelivery() async throws {
    let environment = ProcessInfo.processInfo.environment
    try XCTSkipUnless(peerMode == .mock && environment["NATIVE_E2E_SYSTEM_PUSH_PROBE"] != nil,
      "This journey injects synthetic iOS notifications on a disposable simulator.")
    let probe = try XCTUnwrap(environment["NATIVE_E2E_SYSTEM_PUSH_PROBE"].flatMap(URL.init(string:)))
    app.launchArguments.append("-native-e2e-notifications-fresh-preferences")
    applyFixtureAppearance()
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    _ = try await control(path: "/v1/checkpoints/transcript-image-ready", method: "POST")
    try await pairBothFixtureHosts()
    try openNativeSettingsPage("native-e2e.settings.notifications")

    let system = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let permission = app.buttons["Allow system notifications"].firstMatch
    XCTAssertTrue(permission.waitForExistence(timeout: 5))
    XCTAssertFalse(system.alerts.firstMatch.exists, "Permission waits for an explicit action.")
    let prompt = try await requestNativeNotificationPermission(permission)
    utilityProof("system-notification-permission")
    prompt.buttons["Allow"].tap()
    try await poll { !permission.exists }
    closeNativeNotificationSettings()

    func inject(_ stage: String) async throws {
      var request = URLRequest(url: probe.appendingPathComponent(stage))
      request.httpMethod = "POST"
      request.setValue("Harness \(capability)", forHTTPHeaderField: "Authorization")
      let (_, response) = try await URLSession.shared.data(for: request)
      XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, stage)
    }
    func banner(_ title: String) -> XCUIElement {
      system.descendants(matching: .any)
        .matching(NSPredicate(format: "label CONTAINS %@", title)).firstMatch
    }

    let threadB = navigationHostThread(label: "Native E2E Collision Host B")
    revealNavigationThread(threadB)
    XCTAssertTrue(threadB.waitForExistence(timeout: 10)); threadB.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 12))
    try await inject("other-desktop")
    XCTAssertFalse(banner("Fixture foreign foreground").waitForExistence(timeout: 2))
    try await inject("visible")
    let visible = banner("Fixture permitted foreground")
    XCTAssertTrue(visible.waitForExistence(timeout: 8))
    utilityProof("system-notification-foreground")
    try await poll { !visible.exists }

    let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
    settings.launch()
    XCTAssertTrue(settings.wait(for: .runningForeground, timeout: 8))
    try await poll(timeout: .seconds(8)) {
      let state = self.app.state
      return state == .runningBackground || state == .runningBackgroundSuspended
    }
    try await inject("background-routed")
    let routed = banner("Fixture routed background")
    XCTAssertTrue(routed.waitForExistence(timeout: 8) && routed.isHittable)
    utilityProof("system-notification-background")
    routed.tap()
    let confirm = app.buttons["Switch and Open"].firstMatch
    XCTAssertTrue(confirm.waitForExistence(timeout: 12))
    confirm.tap()
    XCTAssertTrue(app.staticTexts["The transcript image is ready."].waitForExistence(timeout: 12))
    utilityProof("system-notification-routed")

    if UIDevice.current.userInterfaceIdiom != .pad {
      let back = app.descendants(matching: .any).matching(identifier: "BackButton").firstMatch
      XCTAssertTrue(back.waitForExistence(timeout: 5) && back.isHittable)
      try await tapNativeToolbarActionAfterDisplayTransition(back)
    }
    try openNativeSettingsPage("native-e2e.settings.notifications")
    let master = app.switches["Enable Notifications"].firstMatch
    XCTAssertTrue(master.waitForExistence(timeout: 5))
    try await turnOffNotificationSwitch(master)
    closeNativeNotificationSettings()
    try await inject("disabled")
    XCTAssertFalse(banner("Fixture disabled foreground").waitForExistence(timeout: 3))
  }

  func testDeniedSystemNotificationPermissionOffersDeviceSettings() async throws {
    try XCTSkipUnless(peerMode == .mock &&
      ProcessInfo.processInfo.environment["NATIVE_E2E_SYSTEM_PUSH_PROBE"] != nil,
      "This journey denies permission on a fresh disposable simulator.")
    app.launchArguments.append("-native-e2e-notifications-fresh-preferences")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()
    try openNativeSettingsPage("native-e2e.settings.notifications")
    let prompt = try await requestNativeNotificationPermission(app.buttons["Allow system notifications"].firstMatch)
    let deny = prompt.buttons.matching(NSPredicate(format: "label ENDSWITH[c] %@ AND label != %@", "Allow", "Allow")).firstMatch
    XCTAssertTrue(deny.exists && deny.isHittable)
    utilityProof("system-notification-denial-prompt")
    deny.tap()
    let settingsLink = app.buttons["Open Notification Settings"].firstMatch
    XCTAssertTrue(settingsLink.waitForExistence(timeout: 8))
    utilityProof("system-notification-denied")
    try await tapNativeNotificationRow(settingsLink)
    let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
    XCTAssertTrue(settings.wait(for: .runningForeground, timeout: 10))
    let systemSwitch = settings.switches["Allow Notifications"].firstMatch
    if !systemSwitch.waitForExistence(timeout: 5) {
      // A newly created simulator can finish first-launch Settings setup
      // on the General page. Retry the same public link once Settings is warm.
      utilityProof("system-notification-settings-first-launch")
      app.activate()
      XCTAssertTrue(settingsLink.waitForExistence(timeout: 8))
      try await tapNativeNotificationRow(settingsLink)
      XCTAssertTrue(settings.wait(for: .runningForeground, timeout: 10))
    }
    XCTAssertTrue(systemSwitch.waitForExistence(timeout: 10))
    XCTAssertEqual(systemSwitch.value as? String, "0")
    utilityProof("system-notification-settings")
  }

  private func requestNativeNotificationPermission(_ permission: XCUIElement) async throws -> XCUIElement {
    try await tapNativeNotificationRow(permission)
    let system = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let systemPrompt = system.alerts.containing(.button, identifier: "Allow").firstMatch
    let appPrompt = app.alerts.containing(.button, identifier: "Allow").firstMatch
    do {
      try await poll(timeout: .seconds(8)) { systemPrompt.exists || appPrompt.exists }
    } catch {
      utilityProof("system-notification-permission-missing")
      throw error
    }
    return systemPrompt.exists ? systemPrompt : appPrompt
  }

  private func closeNativeNotificationSettings() {
    tapNativeSettingsBack(from: "Notifications", to: "Settings")
    tapNativeSettingsBack(from: "Settings", to: "More")
    let close = app.descendants(matching: .any).matching(identifier: "native-e2e.more.close").firstMatch
    XCTAssertTrue(close.waitForExistence(timeout: 5))
    close.tap()
  }

  private func tapNativeNotificationRow(_ row: XCUIElement, switchTrack: Bool = false) async throws {
    if let driver = ProcessInfo.processInfo.environment["NATIVE_E2E_DUO_TRANSITION_URL"] {
      let frame = row.frame
      let display = app.frame
      let x = frame.minX + frame.width * 0.30 - display.minX
      let y = frame.midY - display.minY
      let path = "\(driver)/tap/\(Int(x.rounded()))/\(Int(y.rounded()))"
      let (_, response) = try await URLSession.shared.data(from: try XCTUnwrap(URL(string: path)))
      XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
    } else if switchTrack {
      row.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
    } else {
      row.coordinate(withNormalizedOffset: CGVector(dx: 0.30, dy: 0.5)).tap()
    }
  }

  private func turnOffNotificationSwitch(_ toggle: XCUIElement) async throws {
    try await tapNativeNotificationRow(toggle, switchTrack: true)
    do {
      try await poll(timeout: .seconds(5)) { toggle.value as? String == "0" }
    } catch {
      utilityProof("notification-settings-switch-missed")
      XCTFail("Touch did not turn off \(toggle.label) at \(toggle.frame).")
    }
  }

  func testNotificationPreferencesPersistAndFilterLiveDesktopAlerts() async throws {
    try XCTSkipUnless(peerMode == .mock, "This journey uses synthetic desktop notifications.")
    let reset = "-native-e2e-notifications-fresh-preferences"
    app.launchArguments.append(reset)
    applyFixtureAppearance()
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    try await pairUntilHome()
    try openNativeSettingsPage("native-e2e.settings.notifications")

    let sound = app.switches["Play notification sound"].firstMatch
    let done = app.switches["Done"].firstMatch
    let attention = app.switches["Needs Attention"].firstMatch
    let error = app.switches["Error"].firstMatch
    let presentation = app.descendants(matching: .any)
      .matching(identifier: "native-e2e.notifications.presentation").firstMatch
    let backgroundOnly = "Only when unfocused"
    let always = "Always"

    func hasPresentation(_ value: String) -> Bool {
      presentation.value as? String == value || presentation.label.contains(value)
    }
    func choosePresentation(_ value: String) async throws {
      presentation.tap()
      let option = app.buttons[value].firstMatch
      XCTAssertTrue(option.waitForExistence(timeout: 5))
      option.tap()
      try await poll { hasPresentation(value) }
    }
    func assertAlertPreferences() {
      XCTAssertEqual(sound.value as? String, "0")
      XCTAssertEqual(done.value as? String, "0")
      XCTAssertEqual(attention.value as? String, "1")
      XCTAssertEqual(error.value as? String, "1")
    }
    XCTAssertTrue(sound.waitForExistence(timeout: 5))
    XCTAssertEqual(sound.value as? String, "1")
    XCTAssertEqual(done.value as? String, "1")
    XCTAssertTrue(hasPresentation(always))
    utilityProof("notification-settings-defaults")
    try await turnOffNotificationSwitch(sound)
    try await turnOffNotificationSwitch(done)
    try await choosePresentation(backgroundOnly)
    assertAlertPreferences()
    try await assertNativeDuoDisplayTransitions(
      "notification-preferences", content: presentation, availableAction: nil
    ) { _ in
      XCTAssertTrue(hasPresentation(backgroundOnly))
      assertAlertPreferences()
    }
    utilityProof("notification-settings-edited")

    app.terminate()
    app.launchArguments.removeAll { $0 == "-native-e2e-fresh-state" || $0 == reset }
    app.launch()
    XCTAssertTrue(mockHomeReady.waitForExistence(timeout: 20))
    try openNativeSettingsPage("native-e2e.settings.notifications")
    XCTAssertTrue(hasPresentation(backgroundOnly))
    assertAlertPreferences()
    utilityProof("notification-settings-relaunched")

    let banner = app.buttons["remote-user-notification-banner"].firstMatch
    closeNativeNotificationSettings()
    _ = try await control(path: "/v1/frames/event-notification-attention", method: "POST")
    XCTAssertFalse(banner.waitForExistence(timeout: 2), "Only when unfocused suppresses a foreground alert.")
    try openNativeSettingsPage("native-e2e.settings.notifications")
    try await choosePresentation(always)
    closeNativeNotificationSettings()
    _ = try await control(path: "/v1/frames/event-notification-done", method: "POST")
    XCTAssertFalse(banner.waitForExistence(timeout: 2), "Done remains switched off.")
    _ = try await control(path: "/v1/frames/event-notification-attention", method: "POST")
    XCTAssertTrue(banner.waitForExistence(timeout: 5))
    XCTAssertTrue(banner.label.contains("Fixture approval needed"))
    XCTAssertLessThanOrEqual(banner.frame.width, 441)
    utilityProof("notification-live-attention")
    banner.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 12))
    let settingsWrites = try await journalCount(hostID: "primary", operationID: "route:settings-write")
    XCTAssertEqual(settingsWrites, 0)
  }

  func testTranscriptImageGalleryPagesAndRetainsSelectionAcrossDisplays() async throws {
    try XCTSkipUnless(peerMode == .mock, "This journey opens two synthetic transcript images.")
    let isPad = UIDevice.current.userInterfaceIdiom == .pad
    XCUIDevice.shared.orientation = isPad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    _ = try await control(path: "/v1/checkpoints/transcript-image-gallery-ready", method: "POST")
    try await pairBothFixtureHosts()
    let thread = navigationHostThread(label: "Navigation Host A")
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
    let caption = app.staticTexts["The transcript image is ready."].firstMatch
    XCTAssertTrue(caption.waitForExistence(timeout: 10))
    let images = app.buttons.matching(NSPredicate(format: "label == %@", "Conversation image"))
    let image = images.firstMatch
    XCTAssertTrue(images.element(boundBy: 1).waitForExistence(timeout: 10))
    if !image.isHittable || !caption.isHittable { app.swipeDown() }
    XCTAssertTrue(image.isHittable)
    utilityProof("transcript-gallery-source")
    if isPad {
      // A virtualized image can expose a hit point in the split sidebar when
      // its row extends beyond the viewport. Touch the image beneath its caption.
      XCTAssertTrue(caption.isHittable)
      caption.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 1))
        .withOffset(CGVector(dx: 0, dy: 65)).tap()
    } else {
      image.tap()
    }

    let position = app.descendants(matching: .any)
      .matching(identifier: "native-e2e.transcript-image.position").firstMatch
    let next = app.buttons["Next image"].firstMatch
    let previous = app.buttons["Previous image"].firstMatch
    let copy = app.buttons["Copy Image"].firstMatch
    guard next.waitForExistence(timeout: 8), next.isHittable else {
      utilityProof("transcript-gallery-missing-controls")
      return XCTFail("The image viewer must expose Next image.")
    }
    XCTAssertEqual(position.label, "Image 2 of 2")
    assertNativeDuoToolbarRail(next)
    utilityProof("transcript-gallery-original")
    next.tap()
    try await poll { position.label == "Image 1 of 2" && copy.isEnabled }
    utilityProof("transcript-gallery-next")
    try await assertNativeDuoDisplayTransitions("transcript-gallery-selected", content: position, availableAction: nil) { pose in
      XCTAssertEqual(position.label, "Image 1 of 2", pose)
      XCTAssertTrue(previous.isHittable && next.isHittable, pose)
    }
    previous.tap()
    try await poll { position.label == "Image 2 of 2" && copy.isEnabled }

    let canvas = app.scrollViews["native-e2e.transcript-image.canvas"].firstMatch
    XCTAssertTrue(canvas.waitForExistence(timeout: 5) && canvas.isHittable)
    canvas.swipeLeft()
    try await poll { position.label == "Image 1 of 2" && copy.isEnabled }
    utilityProof("transcript-gallery-swiped")
    canvas.doubleTap()
    canvas.swipeRight()
    XCTAssertEqual(position.label, "Image 1 of 2", "Panning a zoomed image must keep the same image.")
    utilityProof("transcript-gallery-zoomed")
    app.buttons["Close Image Preview"].firstMatch.tap()
    try await poll { caption.isHittable && image.isHittable }
  }

  func testAudioPreviewKeepsRecordingAndRoutesToItsDesktopAcrossDisplays() async throws {
    let environment = ProcessInfo.processInfo.environment
    try XCTSkipUnless(peerMode == .mock && environment["NATIVE_E2E_VOICE_FOLD_PROBE"] != nil,
      "This journey records staged audio against two disposable Hex hosts.")
    let probe = try XCTUnwrap(environment["NATIVE_E2E_VOICE_FOLD_PROBE"].flatMap(URL.init(string:)))
    app.launchArguments.append("-native-e2e-voice-fresh-preferences")
    app.launchEnvironment["NATIVE_E2E_VOICE_FILE"] = "1"
    app.launchEnvironment["NATIVE_E2E_VOICE_WAV"] = Data([82,73,70,70,38,0,0,0,87,65,86,69,102,109,116,32,16,0,0,0,
      1,0,1,0,128,62,0,0,0,125,0,0,2,0,16,0,100,97,116,97,2,0,0,0,0,0]).base64EncodedString()
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()
    var request = URLRequest(url: probe)
    request.httpMethod = "POST"
    request.setValue("Harness \(capability)", forHTTPHeaderField: "Authorization")
    let (_, response) = try await URLSession.shared.data(for: request)
    XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
    try openNativeSettingsPage("native-e2e.settings.audio")
    let backend = app.buttons["native-e2e.audio.backend"].firstMatch
    XCTAssertTrue(backend.waitForExistence(timeout: 8)); backend.tap()
    let hex = app.buttons["Hex · Host engine"].firstMatch
    XCTAssertTrue(hex.waitForExistence(timeout: 5)); hex.tap()

    let start = app.buttons["native-e2e.audio.dictation.start"].firstMatch
    for _ in 0..<6 where !start.isHittable {
      let form = app.collectionViews["native-e2e.audio.settings"].firstMatch
      if form.exists {
        form.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.85))
          .press(forDuration: 0.1, thenDragTo: form.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.25)))
      } else { app.swipeUp() }
    }
    XCTAssertTrue(start.isHittable && start.isEnabled)
    try await tapNativeToolbarActionAfterDisplayTransition(start)
    let stop = app.buttons["native-e2e.audio.dictation.stop"].firstMatch
    let cancel = app.buttons["native-e2e.audio.dictation.cancel"].firstMatch
    XCTAssertTrue(stop.waitForExistence(timeout: 8))
    assertNativeDuoToolbarRail(stop)
    utilityProof("production-audio-recording")
    try await assertNativeDuoDisplayTransitions("audio-preview-recording", content: stop, availableAction: stop) { pose in
      XCTAssertTrue(stop.isHittable && cancel.isHittable, pose)
    }
    XCTAssertTrue(stop.isHittable && stop.isEnabled)
    assertNativeDuoToolbarRail(stop)
    try await tapNativeToolbarActionAfterDisplayTransition(stop)

    let transcript = app.staticTexts["native-e2e.audio.dictation.transcript"].firstMatch
    let clear = app.buttons["Clear transcript"].firstMatch
    XCTAssertTrue(transcript.waitForExistence(timeout: 15))
    XCTAssertEqual(transcript.label, "Fixture host transcript")
    try await assertNativeDuoDisplayTransitions("audio-preview-transcript", content: transcript, availableAction: nil) { pose in
      XCTAssertEqual(transcript.label, "Fixture host transcript", pose)
      XCTAssertTrue(clear.isHittable, pose)
    }
    utilityProof("production-audio-transcript")
    try await tapNativeToolbarActionAfterDisplayTransition(clear)
    XCTAssertFalse(transcript.exists)
    XCTAssertTrue(start.isEnabled && start.isHittable)
    func uploadCounts() async throws -> [String: Int] {
      var request = URLRequest(url: probe.appendingPathComponent("uploads"))
      request.httpMethod = "POST"
      request.setValue("Harness \(capability)", forHTTPHeaderField: "Authorization")
      let (data, response) = try await URLSession.shared.data(for: request)
      XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
      return try JSONDecoder().decode([String: Int].self, from: data)
    }
    let uploadsAfterPreview = try await uploadCounts()
    XCTAssertEqual(uploadsAfterPreview["begin"], 1)
    XCTAssertGreaterThan(uploadsAfterPreview["append"] ?? 0, 0)
    XCTAssertEqual(uploadsAfterPreview["finish"], 1)
    try await tapNativeToolbarActionAfterDisplayTransition(start)
    XCTAssertTrue(stop.waitForExistence(timeout: 8))
    try await tapNativeToolbarActionAfterDisplayTransition(cancel)
    XCTAssertTrue(start.waitForExistence(timeout: 5) && start.isEnabled)
    XCTAssertFalse(transcript.exists)
    let uploadsAfterCancel = try await uploadCounts()
    XCTAssertEqual(uploadsAfterPreview, uploadsAfterCancel)
    for (host, expected) in [("primary", false), ("collision-b", true)] {
      let operations = try await scenarioState().host(host).observedOperationIds
      XCTAssertEqual(operations.contains("procedure:hexVoice"), expected, host)
      XCTAssertFalse(operations.contains("route:thread-send"), host)
      XCTAssertFalse(operations.contains("route:thread-command"), host)
    }
  }

  func testArchivedThreadsGroupByArchiveDateAndRestoreOnlyTheSelectedDesktop() async throws {
    let probeURL = ProcessInfo.processInfo.environment["NATIVE_E2E_ARCHIVED_THREADS_PROBE"]
    try XCTSkipUnless(peerMode == .mock && probeURL != nil, "This journey uses isolated archives with colliding thread IDs.")
    let probe = try XCTUnwrap(probeURL.flatMap(URL.init(string:)))
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()
    var request = URLRequest(url: probe)
    request.httpMethod = "POST"
    request.setValue("Harness \(capability)", forHTTPHeaderField: "Authorization")
    let (_, response) = try await URLSession.shared.data(for: request)
    XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 204)

    try openNativeSettingsPage("native-e2e.settings.desktop")
    revealAndOpenSettingsRow("native-e2e.settings.archived")
    func selectDesktop(_ label: String) async throws {
      let picker = app.buttons["Switch desktop"].firstMatch
      XCTAssertTrue(picker.waitForExistence(timeout: 5))
      try await tapNativeToolbarActionAfterDisplayTransition(picker)
      let option = app.buttons[label].firstMatch
      XCTAssertTrue(option.waitForExistence(timeout: 5))
      try await tapNativeToolbarActionAfterDisplayTransition(option)
      try await poll { !option.exists }
    }

    let recent = app.buttons["native-e2e.archived.thread.thread-fixture-001"]
    let older = app.buttons["native-e2e.archived.thread.thread-fixture-archive-older"]
    try await selectDesktop("Navigation Host A")
    try await poll { recent.exists && recent.label.contains("Host A recent archive") }
    XCTAssertTrue(older.exists)
    XCTAssertLessThan(recent.frame.minY, older.frame.minY)
    let dates = app.staticTexts.matching(identifier: "native-e2e.archived.date")
    XCTAssertEqual(dates.count, 2)
    XCTAssertTrue(dates.element(boundBy: 0).label.contains("August 10"))
    XCTAssertTrue(dates.element(boundBy: 1).label.contains("August 6"))
    utilityProof("archived-threads-on-a")

    try await assertNativeDuoDisplayTransitions("archived-threads", content: recent, availableAction: nil) { _ in
      XCTAssertTrue(recent.label.contains("Host A recent archive"))
      XCTAssertLessThan(recent.frame.minY, older.frame.minY)
    }
    try await selectDesktop("Native E2E Collision Host B")
    try await poll { recent.exists && recent.label.contains("Host B recent archive") }
    try await tapNativeToolbarActionAfterDisplayTransition(recent)
    let unarchive = app.buttons["Unarchive"].firstMatch
    XCTAssertTrue(unarchive.waitForExistence(timeout: 5))
    try await tapNativeToolbarActionAfterDisplayTransition(unarchive)
    try await waitForJournal(hostID: "collision-b", operationID: "route:thread-command", count: 1)
    try await poll { !recent.exists && older.exists }
    utilityProof("archived-threads-restored-on-b")

    try await selectDesktop("Navigation Host A")
    try await poll { recent.exists && recent.label.contains("Host A recent archive") }
    let writesOnA = try await journalCount(hostID: "primary", operationID: "route:thread-command")
    let writesOnB = try await journalCount(hostID: "collision-b", operationID: "route:thread-command")
    XCTAssertEqual(writesOnA, 0)
    XCTAssertEqual(writesOnB, 1)
  }

  func testWorktreeSettingsKeepAnEditedPathAcrossDesktopRefreshAndDisplays() async throws {
    try XCTSkipUnless(peerMode == .mock, "This journey changes disposable desktop settings only.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    _ = try await control(path: "/v1/checkpoints/worktree-settings-ready", method: "POST")
    try await pairBothFixtureHosts()
    try openNativeSettingsPage("native-e2e.settings.worktrees")

    func switchDesktop(_ label: String) async throws {
      let picker = app.buttons["Switch desktop"].firstMatch
      XCTAssertTrue(picker.waitForExistence(timeout: 5))
      try await tapNativeToolbarActionAfterDisplayTransition(picker)
      let desktop = app.buttons[label].firstMatch
      XCTAssertTrue(desktop.waitForExistence(timeout: 5))
      try await tapNativeToolbarActionAfterDisplayTransition(desktop)
      try await poll { !desktop.exists }
    }

    try await switchDesktop("Navigation Host A")
    let storage = app.buttons["native-e2e.settings.worktrees.storage"].firstMatch
    let base = app.textFields["native-e2e.settings.worktrees.base"].firstMatch
    let save = app.descendants(matching: .any).matching(identifier: "native-e2e.settings.document.save").firstMatch
    XCTAssertTrue(base.waitForExistence(timeout: 8))
    XCTAssertEqual(base.value as? String, "/worktrees/host-a")
    base.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
    base.typeText("-typed")
    let localValue = try XCTUnwrap(base.value as? String)
    XCTAssertTrue(localValue.contains("-typed"))
    XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
    try await poll { self.toolbarActionClearsKeyboard(save) && save.isHittable }
    utilityProof("worktree-settings-keyboard")
    try await assertDraftSurvivesDisplayTransitions(
      "worktree-settings", field: base, value: localValue, availableAction: save)

    if app.keyboards.firstMatch.exists { base.typeText("\n") }
    let reads = try await journalCount(hostID: "primary", operationID: "route:settings-read")
    _ = try await control(path: "/v1/checkpoints/worktree-settings-desktop-edit", method: "POST")
    let refresh = app.descendants(matching: .any).matching(identifier: "native-e2e.settings.worktrees.refresh").firstMatch
    XCTAssertTrue(refresh.waitForExistence(timeout: 5))
    try await tapNativeToolbarActionAfterDisplayTransition(refresh)
    try await waitForJournal(hostID: "primary", operationID: "route:settings-read", count: reads + 1)
    try await poll { storage.exists && !base.exists }
    XCTAssertFalse(save.isEnabled)
    utilityProof("worktree-settings-refreshed-storage")
    storage.tap()
    let globalStorage = app.buttons["Global"].firstMatch
    XCTAssertTrue(globalStorage.waitForExistence(timeout: 5)); globalStorage.tap()
    try await poll { base.exists && base.value as? String == localValue }
    try await tapNativeToolbarActionAfterDisplayTransition(save)
    try await waitForJournal(hostID: "primary", operationID: "route:settings-write", count: 1)
    try await poll { save.exists && !save.isEnabled }

    try await switchDesktop("Native E2E Collision Host B")
    try await waitForJournal(hostID: "collision-b", operationID: "route:settings-read", count: 1)
    try await poll { storage.exists && (!base.exists || base.value as? String != localValue) }
    try await switchDesktop("Navigation Host A")
    try await poll { base.exists && base.value as? String == localValue }
    utilityProof("worktree-settings-saved")
    let primaryWrites = try await journalCount(hostID: "primary", operationID: "route:settings-write")
    let secondaryWrites = try await journalCount(hostID: "collision-b", operationID: "route:settings-write")
    XCTAssertEqual(primaryWrites, 1)
    XCTAssertEqual(secondaryWrites, 0)
  }

  func testAIHelperModelLimitsAndPersistenceStayWithTheirDesktopAcrossDisplays() async throws {
    let env = ProcessInfo.processInfo.environment
    try XCTSkipUnless(peerMode == .mock && env["NATIVE_E2E_GENERATION_MODELS_PROBE"] != nil,
      "This journey uses independent AI helper model catalogs on two fixture desktops.")
    let probe = try XCTUnwrap(env["NATIVE_E2E_GENERATION_MODELS_PROBE"].flatMap(URL.init(string:)))
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()

    func verify(_ stage: String) async throws {
      var request = URLRequest(url: probe.appendingPathComponent(stage))
      request.httpMethod = "POST"
      request.setValue("Harness \(capability)", forHTTPHeaderField: "Authorization")
      let (_, response) = try await URLSession.shared.data(for: request)
      XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, stage)
    }
    try await verify("prepare")
    try openNativeSettingsPage("native-e2e.settings.ai")
    func field(_ label: String) -> XCUIElement {
      app.buttons.matching(NSPredicate(format: "label == %@ OR label BEGINSWITH %@", label, label + ",")).firstMatch
    }
    func value(_ element: XCUIElement) -> String {
      let labels = element.label.components(separatedBy: ", ")
      return labels.count > 1 ? (labels.last ?? "") : (element.value as? String ?? "")
    }
    let title = field("Thread titles")
    let model = field("Model ID")
    let effort = field("Effort")
    let contextWindow = field("Context window")
    let thinking = app.switches["Thinking"].firstMatch
    let fast = app.switches["Fast mode"].firstMatch
    let save = app.descendants(matching: .any).matching(identifier: "native-e2e.settings.document.save").firstMatch
    func revealTitles() {
      if !model.exists {
        XCTAssertTrue(title.waitForExistence(timeout: 8))
        title.tap()
      }
    }
    func switchDesktop(_ label: String) {
      let picker = app.buttons["Switch desktop"].firstMatch
      XCTAssertTrue(picker.waitForExistence(timeout: 5)); picker.tap()
      let desktop = app.buttons[label].firstMatch
      XCTAssertTrue(desktop.waitForExistence(timeout: 5)); desktop.tap()
    }

    revealTitles()
    utilityProof("ai-helper-model-initial")
    try await poll { model.exists && value(model) == "Fixture Thorough" }
    XCTAssertEqual(value(effort).lowercased(), "high")
    XCTAssertEqual(fast.value as? String, "1")
    XCTAssertEqual(value(contextWindow), "Wide")
    XCTAssertEqual(thinking.value as? String, "0")
    model.tap()
    let quick = app.buttons["Fixture Quick"].firstMatch
    XCTAssertTrue(quick.waitForExistence(timeout: 5)); quick.tap()
    try await poll { value(model) == "Fixture Quick" && value(effort).lowercased() == "low" }
    XCTAssertEqual(fast.value as? String, "0")
    XCTAssertFalse(fast.isEnabled)
    effort.tap()
    XCTAssertFalse(app.buttons["high"].exists)
    let low = app.buttons["low"].firstMatch
    XCTAssertTrue(low.waitForExistence(timeout: 5)); low.tap()
    XCTAssertEqual(value(contextWindow), "Wide")
    XCTAssertEqual(thinking.value as? String, "0")
    contextWindow.tap()
    let standard = app.buttons["Standard"].firstMatch
    XCTAssertTrue(standard.waitForExistence(timeout: 5)); standard.tap()
    try await poll { value(contextWindow) == "Standard" }
    utilityProof("ai-helper-model-draft")
    try await assertNativeDuoDisplayTransitions("ai-helper-model", content: model, availableAction: save) { pose in
      XCTAssertEqual(value(model), "Fixture Quick", pose)
      XCTAssertEqual(value(effort).lowercased(), "low", pose)
      XCTAssertEqual(value(contextWindow), "Standard", pose)
    }
    try await verify("uncommitted")
    try await tapNativeToolbarActionAfterDisplayTransition(save)
    XCTAssertTrue(app.staticTexts["Changes saved."].waitForExistence(timeout: 8))
    try await verify("saved")
    switchDesktop("Navigation Host A")
    revealTitles()
    try await poll { model.exists && value(model) == "Fixture A Default" }
    switchDesktop("Native E2E Collision Host B")
    revealTitles()
    try await poll { model.exists && value(model) == "Fixture Quick" }
    XCTAssertEqual(value(effort).lowercased(), "low")
    XCTAssertEqual(value(contextWindow), "Standard")
    XCTAssertEqual(thinking.value as? String, "0")
    XCTAssertFalse(save.isEnabled)
    utilityProof("ai-helper-model-reloaded")
    try await verify("reloaded")
  }

  func testAIHelperFamilyEditsRetainTheirMemberAndDesktopAcrossDisplays() async throws {
    let env = ProcessInfo.processInfo.environment
    try XCTSkipUnless(peerMode == .mock && env["NATIVE_E2E_GENERATION_MODELS_PROBE"] != nil,
      "This journey uses two independent desktops with a synthetic model family.")
    let probe = try XCTUnwrap(env["NATIVE_E2E_GENERATION_MODELS_PROBE"].flatMap(URL.init(string:)))
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()

    func verify(_ stage: String) async throws {
      var request = URLRequest(url: probe.appendingPathComponent(stage))
      request.httpMethod = "POST"
      request.setValue("Harness \(capability)", forHTTPHeaderField: "Authorization")
      let (_, response) = try await URLSession.shared.data(for: request)
      XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, stage)
    }
    try await verify("prepare")
    try openNativeSettingsPage("native-e2e.settings.ai")

    func field(_ label: String) -> XCUIElement {
      app.buttons.matching(NSPredicate(format: "label == %@ OR label BEGINSWITH %@", label, label + ",")).firstMatch
    }
    func value(_ field: XCUIElement) -> String {
      let labels = field.label.components(separatedBy: ", ")
      return labels.count > 1 ? (labels.last ?? "") : (field.value as? String ?? "")
    }
    func choose(_ option: String, using field: XCUIElement) {
      XCTAssertTrue(field.waitForExistence(timeout: 8) && field.isEnabled)
      field.tap()
      let button = app.buttons[option].firstMatch
      XCTAssertTrue(button.waitForExistence(timeout: 5)); button.tap()
    }
    let model = field("Model ID")
    let lead = field("Lead")
    let effort = field("Effort")
    let fast = app.switches["Fast mode"].firstMatch
    let save = app.descendants(matching: .any).matching(identifier: "native-e2e.settings.document.save").firstMatch
    func revealTitles() {
      if !model.exists {
        let titles = field("Thread titles")
        XCTAssertTrue(titles.waitForExistence(timeout: 8)); titles.tap()
      }
    }
    func switchDesktop(_ label: String) {
      choose(label, using: app.buttons["Switch desktop"].firstMatch)
      revealTitles()
    }

    revealTitles()
    try await poll { model.exists && value(model) == "Fixture Solo" }
    choose("Fixture Family", using: model)
    try await poll { lead.exists && value(lead) == "Alpha" }
    XCTAssertEqual(value(effort), "low")
    XCTAssertFalse(fast.isEnabled)
    choose("Beta", using: lead)
    choose("high", using: effort)
    utilityProof("ai-helper-family-after-effort")
    try await poll { value(effort) == "high" }
    if let driver = env["NATIVE_E2E_DUO_TRANSITION_URL"] {
      // XCTest can keep the switch's initial disabled flag on the cover display.
      // The display driver uses the system accessibility activation and checks the switch.
      let url = try XCTUnwrap(URL(string: "\(driver)/activate/generation-fast"))
      let (_, response) = try await URLSession.shared.data(from: url)
      XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
    } else {
      XCTAssertTrue(fast.isEnabled)
      fast.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
    }
    try await poll { fast.value as? String == "1" }
    utilityProof("ai-helper-family-draft")

    try await assertNativeDuoDisplayTransitions("ai-helper-family", content: model, availableAction: save) { pose in
      XCTAssertEqual(value(model), "Fixture Family", pose)
      XCTAssertEqual(value(lead), "Beta", pose)
      XCTAssertEqual(value(effort), "high", pose)
      XCTAssertEqual(fast.value as? String, "1", pose)
    }
    try await verify("uncommitted")
    try await tapNativeToolbarActionAfterDisplayTransition(save)
    XCTAssertTrue(app.staticTexts["Changes saved."].waitForExistence(timeout: 8))
    try await verify("saved")

    switchDesktop("Navigation Host A")
    try await poll { model.exists && value(model) == "Fixture A Default" }
    XCTAssertFalse(lead.exists)
    switchDesktop("Native E2E Collision Host B")
    try await poll { model.exists && value(model) == "Fixture Family" }
    XCTAssertEqual(value(lead), "Beta")
    XCTAssertEqual(value(effort), "high")
    XCTAssertEqual(fast.value as? String, "1")
    XCTAssertFalse(save.isEnabled)
    utilityProof("ai-helper-family-reloaded")
    try await verify("reloaded")
  }

  func testThreadProjectNotesReadAndEditOnlyTheirOwnDesktopAcrossDisplays() async throws {
    try XCTSkipIf(peerMode == .real, "This journey edits notes on a disposable desktop.")
    applyFixtureAppearance()
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/project-notes-ready", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()
    let thread = navigationHostThread(label: "Navigation Host A")
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 15))
    let actions = app.buttons["native-e2e.thread.actions"].firstMatch
    XCTAssertTrue(actions.waitForExistence(timeout: 5)); actions.tap()
    try await tapThreadMenuAction("Notes & to-dos")
    let editor = app.textViews["native-e2e.notes.editor"].firstMatch
    XCTAssertTrue(editor.waitForExistence(timeout: 10))
    XCTAssertEqual(editor.value as? String, "Notes from the paired desktop")
    utilityProof("utility-notes-loaded")
    let write = "route:project-notes-write"
    // A load must stay read-only after the autosave debounce has elapsed.
    try await Task.sleep(for: .milliseconds(800))
    let writesAfterOpening = try await journalCount(hostID: "primary", operationID: write)
    XCTAssertEqual(writesAfterOpening, 0)

    let field = app.textFields["native-e2e.notes.new-todo"].firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    XCTAssertEqual(field.label, "Add a to-do…")
    let existingTodo = app.buttons["Mark as done: First fixture task"].firstMatch
    XCTAssertTrue(existingTodo.isHittable)
    XCTAssertGreaterThanOrEqual(field.frame.minY, existingTodo.frame.maxY - 1)
    XCTAssertLessThan(field.frame.minY - existingTodo.frame.maxY, 44, "Add follows the checklist")
    field.tap()
    let todo = "Keep across displays"
    field.typeText(todo)
    let keyboard = app.keyboards.firstMatch
    XCTAssertTrue(keyboard.waitForExistence(timeout: 5))
    let add = app.buttons["Add to-do"].firstMatch
    func assertEntryClearsKeyboard(_ display: String) {
      XCTAssertTrue(field.isHittable, "To-do field on \(display)")
      XCTAssertTrue(toolbarActionClearsKeyboard(add), "Add button clears the keyboard on \(display)")
      if keyboard.exists {
        XCTAssertLessThanOrEqual(field.frame.maxY, keyboard.frame.minY,
          "The field clears the keyboard on \(display)")
      }
    }
    utilityProof("utility-notes-keyboard")
    XCTAssertEqual(field.value as? String, todo)
    assertEntryClearsKeyboard("the initial display")
    try await assertNativeDuoDisplayTransitions("notes-new-todo", content: field, availableAction: add) { pose in
      XCTAssertEqual(field.value as? String, todo, "To-do draft on the \(pose) display")
      assertEntryClearsKeyboard(pose)
      if existingTodo.isHittable {
        XCTAssertGreaterThanOrEqual(field.frame.minY, existingTodo.frame.maxY - 1,
          "The entry and the checklist share their scroll layout on the \(pose) display")
      }
    }
    if UIDevice.current.userInterfaceIdiom == .pad {
      field.typeText("\n")
    } else {
      add.tap()
    }
    try await waitForJournal(hostID: "primary", operationID: write, count: 1)
    try await poll { !keyboard.exists }
    let row = app.buttons["Mark as done: \(todo)"].firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5)); row.tap()
    try await waitForJournal(hostID: "primary", operationID: write, count: 2)
    XCTAssertTrue(app.buttons["Mark as not done: \(todo)"].firstMatch.waitForExistence(timeout: 5))
    let otherWrites = try await journalCount(hostID: "collision-b", operationID: write)
    let ownerWrites = try await journalCount(hostID: "primary", operationID: write)
    XCTAssertEqual(otherWrites, 0)
    XCTAssertEqual(ownerWrites, 2)
    utilityProof("utility-notes-todo-persisted")

    _ = try await control(path: "/v1/checkpoints/project-notes-desktop-edit", method: "POST")
    let completed = app.buttons["Mark as not done: \(todo)"].firstMatch
    XCTAssertTrue(completed.isHittable)
    completed.tap()
    let loadSaved = app.buttons["native-e2e.notes.load-saved"].firstMatch
    XCTAssertTrue(loadSaved.waitForExistence(timeout: 8))
    XCTAssertTrue(app.buttons["Mark as done: \(todo)"].firstMatch.exists)
    XCTAssertEqual(editor.value as? String, "Notes from the paired desktop")
    utilityProof("utility-notes-conflict-draft-retained")
    loadSaved.tap()
    try await poll { editor.value as? String == "Saved on the paired desktop" && !loadSaved.exists }
    XCTAssertFalse(app.buttons["Mark as done: \(todo)"].firstMatch.exists)
    utilityProof("utility-notes-conflict-reloaded")
  }

  func applyFixtureAppearance() {
    if let style = ProcessInfo.processInfo.environment["NATIVE_E2E_INTERFACE_STYLE"]?.lowercased(),
      style == "light" || style == "dark"
    {
      app.launchArguments += ["-ios.appearance.mode", style]
    }
  }

  func testProjectFileSaveRetainsLaterEditsAcrossDisplays() async throws {
    try XCTSkipIf(peerMode == .real, "The fixture pauses the first write on a disposable desktop.")
    let isPad = UIDevice.current.userInterfaceIdiom == .pad
    XCUIDevice.shared.orientation = isPad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/hold-project-file-save", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()
    let thread = navigationHostThread(label: "Navigation Host A")
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 15))
    if isPad { openFixtureMore() } else { openCompactThreadWorkspaceTools() }
    openFixtureProjectWorkspace(projectName: "File Save Fixture Project")

    let file = app.descendants(matching: .any).matching(identifier: "native-e2e.project-file.README.md").firstMatch
    XCTAssertTrue(file.waitForExistence(timeout: 8))
    func openFile() { file.coordinate(withNormalizedOffset: CGVector(dx: 0.22, dy: 0.5)).tap() }
    openFile()
    let editor = app.textViews["native-e2e.project-file-editor"]
    XCTAssertTrue(editor.waitForExistence(timeout: 8))
    func focusEditor() {
      editor.coordinate(withNormalizedOffset: CGVector(dx: 0.08, dy: 0.30)).tap()
      XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
    }
    focusEditor()
    editor.typeText(" First write")
    let save = app.descendants(matching: .any).matching(identifier: "native-e2e.project-file.save").firstMatch
    utilityProof("utility-file-save-before-submit")
    if let driver = ProcessInfo.processInfo.environment["NATIVE_E2E_DUO_TRANSITION_URL"] {
      let url = try XCTUnwrap(URL(string: "\(driver)/capture/file-save-before-outer"))
      let (_, response) = try await URLSession.shared.data(from: url)
      XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
    }
    try await tapNativeToolbarActionAfterDisplayTransition(save)
    try await waitForJournal(hostID: "primary", operationID: "procedure:writeProjectFile", count: 1)
    XCTAssertFalse(save.isEnabled)
    if !app.keyboards.firstMatch.exists { focusEditor() }
    editor.typeText(" Later draft")
    let finalDraft = try XCTUnwrap(editor.value as? String)
    XCTAssertTrue(finalDraft.contains("First write"))
    XCTAssertTrue(finalDraft.contains("Later draft"))
    try await assertDraftSurvivesDisplayTransitions("project-file-save", field: editor, value: finalDraft)

    _ = try await control(path: "/v1/checkpoints/release-project-file-save", method: "POST")
    try await poll { save.exists && save.isEnabled }
    XCTAssertEqual(editor.value as? String, finalDraft)
    utilityProof("utility-file-save-later-draft")
    let preview = app.descendants(matching: .any).matching(identifier: "native-e2e.project-file.preview").firstMatch
    if preview.exists {
      try await tapNativeToolbarActionAfterDisplayTransition(preview)
    } else {
      let display = app.frame
      let overflow = try XCTUnwrap(app.buttons.allElementsBoundByIndex.first { button in
        let name = "\(button.label) \(button.identifier)".lowercased()
        return (name.contains("more") || name.contains("overflow") || name.contains("ellipsis"))
          && button.frame.midX > display.minX + display.width * 0.84
          && button.frame.midY < display.maxY - display.height * 0.4
      })
      try await tapNativeToolbarActionAfterDisplayTransition(overflow)
      let previewMenuItem = app.buttons["File contents"].firstMatch
      XCTAssertTrue(previewMenuItem.waitForExistence(timeout: 5)); previewMenuItem.tap()
    }
    XCTAssertTrue(app.staticTexts["File contents"].waitForExistence(timeout: 5))
    try await tapNativeToolbarActionAfterDisplayTransition(preview)
    XCTAssertTrue(editor.waitForExistence(timeout: 5))
    XCTAssertEqual(editor.value as? String, finalDraft)
    try await tapNativeToolbarActionAfterDisplayTransition(save)
    try await waitForJournal(hostID: "primary", operationID: "procedure:writeProjectFile", count: 2)
    let discard = app.descendants(matching: .any).matching(identifier: "native-e2e.project-file.discard").firstMatch
    try await poll { save.exists && !save.isEnabled && !discard.exists }

    if !file.exists || !file.isHittable { tapNativeSettingsBack(from: "README.md", to: "Files") }
    XCTAssertTrue(file.waitForExistence(timeout: 5)); openFile()
    try await waitForJournal(hostID: "primary", operationID: "procedure:readProjectFile", count: 2)
    XCTAssertTrue(editor.waitForExistence(timeout: 6))
    XCTAssertEqual(editor.value as? String, finalDraft)
    let final = try await scenarioState()
    for hostID in ["primary", "collision-b"] {
      let journal = try final.host(hostID).operationJournal
      XCTAssertEqual(journal.filter { $0.operationId == "procedure:writeProjectFile" }.count, hostID == "primary" ? 2 : 0)
    }
    utilityProof("utility-file-save-persisted")
  }

  func testPullRequestMetadataKeepsItsReviewAndDraftAcrossDisplays() async throws {
    try await openFixturePullRequestReview(checkpoint: "pull-request-metadata-ready")
    openFixtureMetadataSheet("labels")
    let label = app.buttons["native-e2e.pull-requests.label.documentation"]
    XCTAssertTrue(label.waitForExistence(timeout: 5))
    let applyLabels = app.descendants(matching: .any).matching(identifier: "native-e2e.pull-requests.labels.apply").firstMatch
    XCTAssertFalse(applyLabels.isEnabled)
    label.tap()
    XCTAssertTrue(applyLabels.isEnabled)
    assertNativeDuoToolbarRail(applyLabels)
    utilityProof("utility-pr-labels-staged")
    try await assertNativeDuoDisplayTransitions("pr-labels", content: label, availableAction: applyLabels) { _ in
      XCTAssertTrue(applyLabels.isEnabled)
    }
    let labelsBefore = try await scenarioState().host("primary")
    XCTAssertFalse(labelsBefore.observedOperationIds.contains("procedure:forgeSetPrLabels"))
    try await tapNativeToolbarActionAfterDisplayTransition(applyLabels)
    try await waitForJournal(hostID: "primary", operationID: "procedure:forgeSetPrLabels", count: 1)
    try await poll { !applyLabels.exists }
    XCTAssertTrue(app.staticTexts["documentation"].firstMatch.waitForExistence(timeout: 10))

    openFixtureMetadataSheet("reviewers")
    let suggestion = app.buttons["native-e2e.pull-requests.reviewer.suggested.octocat"]
    XCTAssertTrue(suggestion.waitForExistence(timeout: 5)); suggestion.tap()
    utilityProof("utility-pr-reviewers-staged")
    let search = app.textFields["native-e2e.pull-requests.reviewers.search"]
    XCTAssertTrue(search.waitForExistence(timeout: 5)); search.tap(); search.typeText("octo")
    XCTAssertTrue(app.keyboards.firstMatch.exists)
    let applyReviewers = app.descendants(matching: .any).matching(identifier: "native-e2e.pull-requests.reviewers.apply").firstMatch
    try await assertDraftSurvivesDisplayTransitions("pr-reviewers", field: search, value: "octo", availableAction: applyReviewers)
    let reviewersBefore = try await scenarioState().host("primary")
    XCTAssertFalse(reviewersBefore.observedOperationIds.contains("procedure:forgeRequestPrReviewers"))
    try await tapNativeToolbarActionAfterDisplayTransition(applyReviewers)
    try await waitForJournal(hostID: "primary", operationID: "procedure:forgeRequestPrReviewers", count: 1)
    try await poll { !applyReviewers.exists }
    openFixtureMetadataSheet("reviewers")
    XCTAssertTrue(app.buttons["native-e2e.pull-requests.reviewer.requested.octocat"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["native-e2e.pull-requests.reviewer.requested.acme/core"].exists)
    utilityProof("utility-pr-reviewers-saved")
    let final = try await scenarioState()
    for host in ["primary", "collision-b"] {
      let journal = try final.host(host).operationJournal
      for operation in ["procedure:forgeSetPrLabels", "procedure:forgeRequestPrReviewers"] {
        XCTAssertEqual(journal.filter { $0.operationId == operation }.count, host == "primary" ? 1 : 0)
      }
    }
  }

  func testPullRequestNavigatorAndGuideKeepTheirPositionAcrossDisplays() async throws {
    try await openFixturePullRequestReview(checkpoint: "pull-request-guide-ready")
    selectFixtureReviewSection("Conversation", id: "conversation")
    utilityProof("utility-pr-section-conversation")
    selectFixtureReviewSection("Guide", id: "guide")
    let first = app.staticTexts.matching(NSPredicate(format: "label =[c] %@", "Fixture guide first stop")).firstMatch
    XCTAssertTrue(first.waitForExistence(timeout: 6))
    let next = guideAction("next")
    XCTAssertTrue(next.waitForExistence(timeout: 5))
    assertNativeDuoToolbarRail(next)
    try await tapNativeToolbarActionAfterDisplayTransition(next)
    let second = app.staticTexts.matching(NSPredicate(format: "label =[c] %@", "Fixture guide second stop")).firstMatch
    let finish = guideAction("finish")
    XCTAssertTrue(second.waitForExistence(timeout: 5))
    XCTAssertTrue(finish.isEnabled)
    utilityProof("utility-pr-guide-second-stop")
    try await assertNativeDuoDisplayTransitions("pr-guide", content: second, availableAction: finish) { _ in
      XCTAssertTrue(second.exists)
      XCTAssertFalse(next.exists)
    }

    let instructions = guideAction("instructions")
    XCTAssertTrue(instructions.exists)
    instructions.tap(); instructions.typeText("Focus the second declaration")
    selectFixtureReviewSection("Conversation", id: "conversation")
    selectFixtureReviewSection("Guide", id: "guide")
    XCTAssertTrue(second.waitForExistence(timeout: 5))
    XCTAssertEqual(instructions.value as? String, "Focus the second declaration")
    try await tapNativeToolbarActionAfterDisplayTransition(finish)
    let run = app.buttons["Run"].firstMatch
    XCTAssertTrue(run.waitForExistence(timeout: 5))
    app.buttons["Cancel"].firstMatch.tap()
    try await poll { !run.exists }

    let write = guideAction("write")
    try await poll { write.exists && write.isEnabled }
    write.tap()
    try await waitForJournal(hostID: "primary", operationID: "procedure:forgeWritePrReviewGuide", count: 1)
    let refreshed = app.staticTexts.matching(NSPredicate(format: "label =[c] %@", "Refreshed guide first stop")).firstMatch
    XCTAssertTrue(refreshed.waitForExistence(timeout: 14))
    XCTAssertTrue(next.exists)
    utilityProof("utility-pr-guide-refreshed")
    let final = try await scenarioState()
    for host in ["primary", "collision-b"] {
      let journal = try final.host(host).operationJournal
      XCTAssertEqual(journal.filter { $0.operationId == "procedure:forgeWritePrReviewGuide" }.count, host == "primary" ? 1 : 0)
      XCTAssertFalse(journal.contains { $0.operationId == "procedure:forgeSubmitPrReview" })
    }
  }

  private func openFixturePullRequestReview(checkpoint: String) async throws {
    try XCTSkipIf(peerMode == .real, "Only the disposable WireLab review receives changes.")
    let isPad = UIDevice.current.userInterfaceIdiom == .pad
    XCUIDevice.shared.orientation = isPad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/\(checkpoint)", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()
    let thread = navigationHostThread(label: "Navigation Host A")
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 15))
    if isPad { openFixtureMore() } else { openCompactThreadWorkspaceTools() }
    let requests = app.buttons["native-e2e.more.shortcut.pullRequests"]
    XCTAssertTrue(requests.waitForExistence(timeout: 5)); requests.tap()
    let desktop = app.buttons["Switch desktop"].firstMatch
    XCTAssertTrue(desktop.waitForExistence(timeout: 5)); desktop.tap()
    let owner = app.buttons["Navigation Host A"]
    XCTAssertTrue(owner.waitForExistence(timeout: 5)); owner.tap()
    let review = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Metadata fixture pull request")).firstMatch
    XCTAssertTrue(review.waitForExistence(timeout: 12)); review.tap()
    XCTAssertTrue(app.staticTexts["bug"].firstMatch.waitForExistence(timeout: 10))
  }

  private func guideAction(_ name: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: "native-e2e.pull-requests.guide.\(name)").firstMatch
  }

  private func selectFixtureReviewSection(_ title: String, id: String) {
    let menu = app.descendants(matching: .any).matching(identifier: "native-e2e.pull-requests.sections.menu").firstMatch
    let choice: XCUIElement
    if menu.exists && menu.isHittable {
      menu.tap()
      choice = app.descendants(matching: .any).matching(identifier: "native-e2e.pull-requests.section.\(id)").firstMatch
    } else {
      let picker = app.descendants(matching: .any).matching(identifier: "native-e2e.pull-requests.sections.segmented").firstMatch
      choice = picker.buttons[title]
    }
    XCTAssertTrue(choice.waitForExistence(timeout: 5)); choice.tap()
  }

  private func openFixtureMetadataSheet(_ name: String) {
    let actions = app.descendants(matching: .any).matching(identifier: "native-e2e.pull-requests.review-actions").firstMatch
    XCTAssertTrue(actions.waitForExistence(timeout: 5)); actions.tap()
    let item = app.descendants(matching: .any).matching(identifier: "native-e2e.pull-requests.open-\(name)").firstMatch
    XCTAssertTrue(item.waitForExistence(timeout: 5)); item.tap()
  }

  func testCreatePullRequestDraftAndToolbarStayWithTheSelectedDesktopAcrossDisplays() async throws {
    let create = try await openFixturePullRequestCreation()
    assertNativeDuoToolbarRail(create)
    utilityProof("utility-create-pr-available")
    try await tapNativeToolbarActionAfterDisplayTransition(create)
    let title = app.textFields["native-e2e.github-operation.pr-title"]
    XCTAssertTrue(title.waitForExistence(timeout: 8))
    XCTAssertEqual(app.textFields["native-e2e.github-operation.pr-head"].value as? String, "feature/native-pr")
    XCTAssertEqual(app.textFields["native-e2e.github-operation.pr-base"].value as? String, "main")
    let submit = app.descendants(matching: .any).matching(identifier: "native-e2e.github-operation.submit").firstMatch
    XCTAssertFalse(submit.isEnabled)
    let draft = app.switches["native-e2e.github-operation.pr-draft"]
    if draft.value as? String == "0" {
      let switchCenter = max(0.5, 1 - 28 / max(draft.frame.width, 1))
      draft.coordinate(withNormalizedOffset: CGVector(dx: switchCenter, dy: 0.5)).tap()
    }
    XCTAssertEqual(draft.value as? String, "1")
    title.tap(); title.typeText("Fixture draft pull request")
    try await assertDraftSurvivesDisplayTransitions(
      "create-pr", field: title, value: "Fixture draft pull request", availableAction: submit
    )
    XCTAssertEqual(draft.value as? String, "1")
    let pending = try await scenarioState().host("primary")
    XCTAssertFalse(pending.observedOperationIds.contains("procedure:ghCreatePr"))
    try await tapNativeToolbarActionAfterDisplayTransition(submit)
    try await confirmFixturePullRequestCreation(create: create, summaryCount: 0)
  }

  func testAlternateCreatePullRequestModeGeneratesAndSubmitsOnce() async throws {
    let create = try await openFixturePullRequestCreation()
    create.press(forDuration: 0.8)
    let auto = app.descendants(matching: .any).matching(identifier: "native-e2e.git.create-pr-alternate").firstMatch
    XCTAssertTrue(auto.waitForExistence(timeout: 5)); auto.tap()
    try await confirmFixturePullRequestCreation(create: create, summaryCount: 1)
  }

  private func openFixturePullRequestCreation() async throws -> XCUIElement {
    try XCTSkipIf(peerMode == .real, "These pull requests use disposable WireLab peers.")
    let isPad = UIDevice.current.userInterfaceIdiom == .pad
    XCUIDevice.shared.orientation = isPad ? .landscapeLeft : .portrait
    app.launchArguments += ["-poracode.pull-request-creation-mode.v1", "dialog"]
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/pull-request-creation-ready", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()
    let thread = navigationHostThread(label: "Navigation Host A")
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 15))
    if isPad { openFixtureMore() } else { openCompactThreadWorkspaceTools() }
    try openGitWorkspaceFromMore(projectName: "PR Fixture Project")
    let create = app.descendants(matching: .any).matching(identifier: "project.git.createPullRequest").firstMatch
    try await poll { create.exists && create.isEnabled }
    if isPad { XCTAssertTrue(create.isHittable) }
    return create
  }

  private func confirmFixturePullRequestCreation(create: XCUIElement, summaryCount: Int) async throws {
    try await waitForJournal(hostID: "primary", operationID: "procedure:ghCreatePr", count: 1)
    // The fixture returns the new open PR from the authoritative catalog. The
    // current head then loses its Create action without a manual refresh.
    try await poll { !create.exists && !self.app.textFields["native-e2e.github-operation.pr-title"].exists }
    let state = try await scenarioState()
    for host in ["primary", "collision-b"] {
      let journal = try state.host(host).operationJournal
      XCTAssertEqual(journal.filter { $0.operationId == "procedure:ghCreatePr" }.count, host == "primary" ? 1 : 0)
      XCTAssertEqual(journal.filter { $0.operationId == "procedure:generatePrSummary" }.count, host == "primary" ? summaryCount : 0)
    }
    utilityProof("utility-create-pr-completed")
  }

  func testGitToolbarAndRemoteDraftKeepTheSelectedDesktopAcrossDisplays() async throws {
    try XCTSkipIf(peerMode == .real, "Only the two disposable WireLab peers receive these Git actions.")
    let isPad = UIDevice.current.userInterfaceIdiom == .pad
    XCUIDevice.shared.orientation = isPad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await scenarioAction(["type": "seed-multihost-collision"])
    try await pairBothFixtureHosts()
    let thread = navigationHostThread(label: "Native E2E Collision Host B")
    revealNavigationThread(thread)
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 15))
    if isPad { openFixtureMore() } else { openCompactThreadWorkspaceTools() }
    try openGitWorkspaceFromMore(projectName: "Fixture Project")

    app.buttons["native-e2e.git.panel-menu"].tap()
    let operations = app.descendants(matching: .any).matching(identifier: "native-e2e.git.open-operations").firstMatch
    XCTAssertTrue(operations.waitForExistence(timeout: 5)); operations.tap()
    utilityProof("utility-git-panel-opened")
    let menu = app.descendants(matching: .any).matching(identifier: "native-e2e.git.panel-quick-actions").firstMatch
    XCTAssertTrue(menu.waitForExistence(timeout: 5))
    let fetch = app.descendants(matching: .any).matching(identifier: "native-e2e.git.gitFetch").firstMatch
    try await poll { fetch.exists && fetch.isEnabled }
    assertNativeDuoToolbarRail(fetch)
    utilityProof("utility-git-operations")
    try await tapNativeToolbarActionAfterDisplayTransition(fetch)
    try await waitForJournal(hostID: "collision-b", operationID: "procedure:gitFetch", count: 1)

    try await poll { menu.exists && menu.isEnabled }
    menu.tap()
    let addRemote = app.descendants(matching: .any).matching(identifier: "native-e2e.git.gitAddRemote").firstMatch
    XCTAssertTrue(addRemote.waitForExistence(timeout: 5)); addRemote.tap()
    let name = app.textFields["native-e2e.git.remote.name"]
    XCTAssertTrue(name.waitForExistence(timeout: 5)); name.tap(); name.typeText("fixture")
    let url = app.textFields["native-e2e.git.remote.url"]
    let value = "https://remote.fixture.invalid/repo.git"
    url.tap(); url.typeText(value)
    let add = app.descendants(matching: .any).matching(identifier: "native-e2e.git.form.submit").firstMatch
    try await assertDraftSurvivesDisplayTransitions("git-remote", field: url, value: value, availableAction: add)
    XCTAssertEqual(name.value as? String, "fixture")
    let unsubmitted = try await scenarioState().host("collision-b")
    XCTAssertFalse(unsubmitted.observedOperationIds.contains("procedure:gitAddRemote"))
    try await tapNativeToolbarActionAfterDisplayTransition(add)
    try await waitForJournal(hostID: "collision-b", operationID: "procedure:gitAddRemote", count: 1)
    let final = try await scenarioState()
    for hostId in ["primary", "collision-b"] {
      let journal = try final.host(hostId).operationJournal
      for operation in ["procedure:gitFetch", "procedure:gitAddRemote"] {
        XCTAssertEqual(journal.filter { $0.operationId == operation }.count, hostId == "collision-b" ? 1 : 0)
      }
    }
    utilityProof("utility-git-remote-added")
  }

  func pairUntilHome() async throws {
    app.launch()
    if peerMode == .real, reusesRealPeerPairing {
      let homeReady = homeMoreButton
      XCTAssertTrue(
        homeReady.waitForExistence(timeout: 20),
        "The preserved real-peer pairing did not return to Home"
      )
      return
    }
    let primaryPairing = try await pairingURL(hostID: "primary")
    try PairingLinkEntry.enter(primaryPairing, into: app)
    try await confirmPairingIfNeeded()
    let homeReady: XCUIElement
    switch peerMode {
    case .mock:
      homeReady = mockHomeReady
    case .real:
      // The real host seeds no fixture thread; the project list is home.
      homeReady = homeMoreButton
    }
    guard homeReady.waitForExistence(timeout: 20) else {
      throw FamilyJourneyError.pairingNeverReachedHome(PairingLinkEntry.pendingState(in: app))
    }
  }

  func pairAndOpenFixtureThread(expectedResponse: String = "Fixture response") async throws {
    try await pairUntilHome()
    let thread = app.buttons["native-e2e.thread.thread-fixture-001"]
    let sidebar = app.buttons["native-e2e.sidebar-toggle"]
    if !thread.isHittable && sidebar.exists { sidebar.tap() }
    XCTAssertTrue(thread.waitForExistence(timeout: 15))
    thread.tap()
    XCTAssertTrue(app.staticTexts[expectedResponse].waitForExistence(timeout: 15))
  }

  private func confirmPairingIfNeeded() async throws {
    let confirm = app.buttons["native-e2e.pair.confirm"]
    let homeReady = peerMode == .real
      ? homeMoreButton
      : mockHomeReady
    // Wait for whichever comes first within one bound: on a loaded runner the
    // confirmation can appear after a short fixed wait, and then nothing
    // would ever confirm it. Throw instead of asserting: an XCTAssert failure
    // inside an async test does not unwind the method.
    //
    // 20s is the measured bound, not a guess: on the loaded CI runner, Home
    // appeared 2.6-12s after the Connect tap on every journey that actually
    // entered a pairing link.
    let deadline = Date().addingTimeInterval(20)
    while Date() < deadline {
      if confirm.exists {
        confirm.tap()
        app.tap()
        return
      }
      if homeReady.exists { return }
      _ = confirm.waitForExistence(timeout: 0.5)
    }
    throw FamilyJourneyError.pairingNeverReachedHome(PairingLinkEntry.pendingState(in: app))
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
      return rebasedOntoControlHost(url)
    }
    let body = try await scenarioAction(["type": "pairing-url", "hostId": hostID])
    guard let raw = body["pairingUrl"] as? String, let url = URL(string: raw) else {
      throw FamilyJourneyError.invalidHarnessResponse
    }
    return url
  }

  /// The harness mints pairing URLs on its loopback bind. On a physical device
  /// the driver rewrites the injected control URL to the device-reachable host
  /// and forwards the same ports, so a loopback pairing URL is rebased onto the
  /// control URL's host; simulator runs keep loopback and are unchanged.
  private func rebasedOntoControlHost(_ url: URL) -> URL {
    let loopback: Set<String> = ["127.0.0.1", "localhost", "::1"]
    guard let host = url.host, loopback.contains(host),
      let controlHost = controlURL.host, !loopback.contains(controlHost),
      var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    else { return url }
    // URL.host is unbracketed; URLComponents needs IPv6 literals bracketed.
    components.percentEncodedHost = controlHost.contains(":") ? "[\(controlHost)]" : controlHost
    return components.url ?? url
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

  func waitForJournal(hostID: String, operationID: String, count: Int) async throws {
    try await poll {
      try await self.journalCount(hostID: hostID, operationID: operationID) >= count
    }
  }

  func journalCount(hostID: String, operationID: String) async throws -> Int {
    let host = try await scenarioState().host(hostID)
    return host.operationJournal.filter { $0.operationId == operationID }.count
  }

  func waitForObservedOperation(hostID: String, operationID: String) async throws {
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

  func poll(
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

  func control(
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

private enum FamilyJourneyError: Error, CustomStringConvertible {
  case invalidHarnessResponse
  case timedOut
  case missingHost
  case pairingNeverReachedHome(String)

  var description: String {
    switch self {
    case .invalidHarnessResponse: return "the harness returned an unexpected response"
    case .timedOut: return "timed out waiting for the harness journal"
    case .missingHost: return "the harness has no such host"
    case let .pairingNeverReachedHome(state):
      return "pairing never reached Home: \(state)"
    }
  }
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
