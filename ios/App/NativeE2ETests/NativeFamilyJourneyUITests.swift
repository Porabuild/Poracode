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

  func testImportSettingsListsAndImportsCLITranscriptWithoutStartingProvider() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses the WireLab's synthetic CLI session store.")
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/session-import-ready", method: "POST")
    try await pairUntilHome()
    if !homeMoreButton.isHittable {
      let sidebar = app.buttons["native-e2e.sidebar-toggle"]
      XCTAssertTrue(sidebar.waitForExistence(timeout: 5))
      sidebar.tap()
    }
    XCTAssertTrue(homeMoreButton.waitForExistence(timeout: 10))
    homeMoreButton.tap()
    app.buttons["Settings"].tap()
    let entry = app.buttons["Import"]
    for _ in 0..<4 {
      if entry.isHittable { break }
      app.swipeUp()
    }
    XCTAssertTrue(entry.isHittable)
    entry.tap()
    let session = app.buttons["native-e2e.session-import.session.claude:session-1"]
    XCTAssertTrue(session.waitForExistence(timeout: 15), "listImportableSessions did not populate the native list")
    XCTAssertTrue(session.label.contains("CLI layout review"))
    XCTAssertTrue(session.label.contains("Fix the login form"))
    session.tap()
    let run = app.buttons["native-e2e.session-import.run"]
    XCTAssertTrue(run.isEnabled)
    run.tap()
    XCTAssertTrue(app.staticTexts["Sessions imported."].waitForExistence(timeout: 15))
    XCTAssertTrue(app.descendants(matching: .any)["native-e2e.session-import.imported.claude:session-1"].exists)
    XCTAssertFalse(run.isEnabled)
    try await waitForJournal(hostID: "primary", operationID: "route:procedure-call", count: 1)
    try await waitForJournal(hostID: "primary", operationID: "route:thread-command", count: 1)
    let host = try await scenarioState().host("primary")
    XCTAssertTrue(host.observedOperationIds.contains("procedure:listImportableSessions"))
    XCTAssertFalse(host.observedOperationIds.contains("route:thread-start-existing"))
    let proof = XCTAttachment(screenshot: app.screenshot())
    proof.name = "native-session-import-completed"
    proof.lifetime = .keepAlways
    add(proof)
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
    XCUIDevice.shared.orientation = .landscapeLeft
    try await poll { self.app.frame.width > self.app.frame.height && self.app.keyboards.firstMatch.exists }
    try await poll { prompt.isHittable && close.isHittable }
    XCTAssertEqual(prompt.value as? String, "Keep this draft above the keyboard")
    XCTAssertLessThanOrEqual(send.frame.maxY, app.keyboards.firstMatch.frame.minY + 4)
    let landscape = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    landscape.name = "home-keyboard-visible-landscape"; landscape.lifetime = .keepAlways; add(landscape)
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
    XCUIDevice.shared.orientation = .landscapeLeft
    try await poll { self.app.frame.width > self.app.frame.height }
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
    XCUIDevice.shared.orientation = .landscapeLeft
    try await poll { self.app.frame.width > self.app.frame.height }
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
    proof.name = "crew-live-roster-retained-after-rotation"; proof.lifetime = .keepAlways; add(proof)
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
    let screenshot = XCUIScreen.main.screenshot()
    let image = try XCTUnwrap(screenshot.image.cgImage)
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["en-US"]
    try VNImageRequestHandler(cgImage: image).perform([request])
    let visible = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
      .joined(separator: " ").replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
    XCTAssertTrue(visible.localizedCaseInsensitiveContains(expected),
      "The screenshot must show '\(expected)'; recognized text: '\(visible)'")
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
      XCUIDevice.shared.orientation = .landscapeLeft
      try await poll { self.app.frame.width > self.app.frame.height }
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
    for orientation in [UIDeviceOrientation.landscapeLeft, .portrait] {
      XCUIDevice.shared.orientation = orientation
      try await poll { orientation.isLandscape ? self.app.frame.width > self.app.frame.height : self.app.frame.height > self.app.frame.width }
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
      XCUIDevice.shared.orientation = .landscapeLeft
      try await poll { self.app.frame.width > self.app.frame.height }
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
      XCUIDevice.shared.orientation = .landscapeLeft
      try await poll { self.app.frame.width > self.app.frame.height }
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
    try await pairAndOpenFixtureThread()
    _ = try await control(path: "/v1/frames/runtime-live-request-opened", method: "POST")
    let allow = app.buttons["native-e2e.request.option.allow"]
    XCTAssertTrue(allow.waitForExistence(timeout: 15))
    allow.tap()
    try await waitForJournal(hostID: "primary", operationID: "route:request-resolve", count: 1)
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
    XCUIDevice.shared.orientation = .landscapeLeft
    try await poll { self.app.frame.width > self.app.frame.height }
    XCTAssertTrue(prompt.waitForExistence(timeout: 10))
    XCTAssertEqual(prompt.value as? String, draft)
    XCUIDevice.shared.orientation = .portrait
    try await poll { self.app.frame.height > self.app.frame.width }
    XCTAssertTrue(prompt.waitForExistence(timeout: 10))
    XCTAssertEqual(prompt.value as? String, draft)
    let proof = XCTAttachment(screenshot: app.screenshot())
    proof.name = "new-thread-draft-after-layout-transitions"
    proof.lifetime = .keepAlways
    add(proof)
  }

  func testNewThreadSelectorsPreserveChoicesAndOfferOtherProviders() async throws {
    try XCTSkipIf(peerMode == .real, "This journey uses synthetic capability inventories.")
    XCUIDevice.shared.orientation = .landscapeLeft
    _ = try await control(path: "/v1/reset", method: "POST")
    try await pairUntilHome()
    try await poll { self.app.frame.width > self.app.frame.height }
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
    wide.name = "new-thread-controls-landscape"
    wide.lifetime = .keepAlways
    add(wide)
    XCUIDevice.shared.orientation = .portrait
    try await poll { self.app.frame.height > self.app.frame.width }
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
    for landscape in [true, false] {
      XCUIDevice.shared.orientation = landscape ? .landscapeLeft : .portrait
      try await poll { landscape ? self.app.frame.width > self.app.frame.height : self.app.frame.height > self.app.frame.width }
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
    XCUIDevice.shared.orientation = .landscapeLeft
    try await poll { self.app.frame.width > self.app.frame.height }
    XCTAssertTrue(prompt.waitForExistence(timeout: 10))
    try await poll { self.newThreadPlanSelected }
    let active = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    active.name = "new-thread-plan-landscape"
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
    XCUIDevice.shared.orientation = .portrait
    try await poll { self.app.frame.height > self.app.frame.width }
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
    XCUIDevice.shared.orientation = .landscapeLeft
    _ = try await control(path: "/v1/reset", method: "POST")
    try await pairAndOpenFixtureThread()
    let create = app.buttons["native-e2e.split-new-thread"]
    XCTAssertTrue(create.waitForExistence(timeout: 10))
    create.tap()
    let prompt = app.textViews["native-e2e.new-thread-prompt"]
    XCTAssertTrue(prompt.waitForExistence(timeout: 10))
    prompt.tap()
    let draft = "Draft stays in front of the conversation"
    prompt.typeText(draft)
    XCTAssertEqual(prompt.value as? String, draft)
    XCUIDevice.shared.orientation = .portrait
    try await poll { self.app.frame.height > self.app.frame.width }
    XCTAssertTrue(prompt.waitForExistence(timeout: 10))
    XCTAssertEqual(prompt.value as? String, draft)
    app.buttons["native-e2e.new-thread-close"].tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 10))
  }

  func testTerminalKeystrokeFamilyWritesToPty() async throws {
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
    homeMoreButton.tap()
    let projects = app.buttons["native-e2e.more.projects"]
    XCTAssertTrue(projects.waitForExistence(timeout: 5))
    projects.tap()
    let name = peerMode == .real ? "native-e2e-fixture" : "Fixture Project"
    let row = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label BEGINSWITH %@",
      "native-e2e.projects.project.", name)).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 10))
    row.tap()
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
