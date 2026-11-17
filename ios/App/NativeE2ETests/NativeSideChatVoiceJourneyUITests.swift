import XCTest

extension NativeFamilyJourneyUITests {
  func testSideChatInheritsProjectContextAndKeepsItsNativeActionsInThePanel() async throws {
    let surface = try await prepareSideChatVoiceQuestion()
    app.buttons["native-e2e.side-chat.more"].tap()
    let newChat = app.buttons["Start a new side chat"]
    XCTAssertTrue(newChat.waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["Close side chat"].exists)
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.45, dy: 0.5)).tap()
    try await poll { !newChat.exists }
    XCTAssertEqual(surface.textViews["native-e2e.new-thread-prompt"].value as? String, "Side question")
    sideChatVoiceProof("side-chat-native-controls-and-inherited-context")
    try assertSideChatVoiceLeavesParentDraft()
  }

  func testSideChatDictationTargetsTheQuestionAndReplyWithoutChangingTheParentDraft() async throws {
    let surface = try await prepareSideChatVoiceQuestion()
    let question = surface.textViews["native-e2e.new-thread-prompt"]
    try configureVoiceBackend("Hex · Host engine", prepareHost: true)
    XCTAssertEqual(question.value as? String, "Side question", "Cancelling voice settings must preserve the side question")
    try insertSideChatDictation()
    let spokenQuestion = "Side question Fixture host transcript"
    XCTAssertEqual(question.value as? String, spokenQuestion)
    XCTAssertFalse(surface.staticTexts["Side reply: \(spokenQuestion)"].exists, "Dictation must not launch a side conversation")
    sideChatVoiceProof("side-chat-voice-question-before-send")

    surface.buttons["native-e2e.new-thread-start"].tap()
    XCTAssertTrue(surface.staticTexts["Side reply: \(spokenQuestion)"].waitForExistence(timeout: 15))
    surface.buttons["native-e2e.composer-collapsed"].tap()
    let reply = surface.textViews["native-e2e.composer"]
    XCTAssertTrue(reply.waitForExistence(timeout: 10)); reply.tap(); reply.typeText("Unsent side reply")
    try insertSideChatDictation()
    let spokenReply = "Unsent side reply Fixture host transcript"
    XCTAssertEqual(reply.value as? String, spokenReply)
    XCTAssertFalse(surface.staticTexts["Side reply: \(spokenReply)"].exists, "Dictation inserts; Send remains explicit")
    sideChatVoiceProof("side-chat-voice-reply-without-sending")
    try assertSideChatVoiceLeavesParentDraft()
  }

  func testSideChatRecordingSurvivesAdaptivePresentationAndKeepsItsDraftOwner() async throws {
    try await verifySideChatRecording(orientations: [.landscapeLeft, .portrait])
  }

  func testSideChatRecordingCanFinishInTheRotatedLayout() async throws {
    try await verifySideChatRecording(orientations: [.landscapeLeft])
  }

  func testSideChatRecordingCanMoveFromLandscapeToPortrait() async throws {
    try await verifySideChatRecording(orientations: [.portrait], startingAt: .landscapeLeft)
  }

  private func verifySideChatRecording(orientations: [UIDeviceOrientation], startingAt: UIDeviceOrientation = .portrait) async throws {
    let surface = try await prepareSideChatVoiceQuestion()
    let question = surface.textViews["native-e2e.new-thread-prompt"]
    try configureVoiceBackend("Hex · Host engine", prepareHost: true)
    if startingAt != .portrait && usesRotatingWindowFrames {
      try await rotateIPadJourney(to: startingAt)
      XCTAssertTrue(question.waitForExistence(timeout: 10))
    }
    app.buttons["native-e2e.voice.start"].tap()
    let stop = app.buttons["native-e2e.voice.stop"]
    XCTAssertTrue(stop.waitForExistence(timeout: 10))
    for orientation in (usesRotatingWindowFrames ? orientations : [.portrait]) {
      try await rotateIPadJourney(to: orientation)
      XCTAssertTrue(stop.waitForExistence(timeout: 10), "Recording must keep its side-chat owner while the workspace adapts")
      sideChatVoiceProof(orientation.isLandscape ? "side-chat-recording-landscape" : "side-chat-recording-portrait")
    }
    stop.tap()
    let insert = app.buttons["native-e2e.voice.insert"]
    let ready = insert.waitForExistence(timeout: 15)
    sideChatVoiceProof("side-chat-review-retained")
    XCTAssertTrue(ready); insert.tap()
    XCTAssertTrue(question.waitForExistence(timeout: 10))
    XCTAssertEqual(question.value as? String, "Side question Fixture host transcript")
    let close = app.buttons["native-e2e.side-chat.hide"]
    XCTAssertTrue(close.isHittable, "The native toolbar close action must remain reachable after rotation")
    XCTAssertFalse(surface.buttons["native-e2e.new-thread-close"].exists,
      "The side-chat composer uses the panel's close action")
    let navigationBar = app.navigationBars["Side chat"]
    if navigationBar.exists {
      XCTAssertLessThanOrEqual(question.frame.intersection(navigationBar.frame).height, 0.5,
        "The navigation toolbar must not cover the text input")
    }
    sideChatVoiceProof("side-chat-voice-inserted-after-adaptation")
    if UIDevice.current.userInterfaceIdiom == .pad, app.frame.width > app.frame.height {
      let sidebarRow = app.buttons["native-e2e.thread.thread-fixture-001"].firstMatch
      if sidebarRow.isHittable { app.buttons["native-e2e.sidebar-toggle"].firstMatch.tap() }
      let timeline = app.collectionViews["native-e2e.timeline"].firstMatch
      try await poll { timeline.frame.width <= self.app.frame.width - 360 && timeline.frame.width >= 560 }
      XCTAssertGreaterThanOrEqual(surface.frame.width, 336)
      sideChatVoiceProof("side-chat-docked-wide-workspace")
    }
    try assertSideChatVoiceLeavesParentDraft()
  }

  private func prepareSideChatVoiceQuestion() async throws -> XCUIElement {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This ownership journey uses a controlled host ASR result; it does not qualify a physical microphone or Hex binary.")
    app.launchEnvironment["NATIVE_E2E_VOICE_FILE"] = "1"
    app.launchEnvironment["NATIVE_E2E_VOICE_WAV"] = Data([82,73,70,70,38,0,0,0,87,65,86,69,102,109,116,32,16,0,0,0,
      1,0,1,0,128,62,0,0,0,125,0,0,2,0,16,0,100,97,116,97,2,0,0,0,0,0]).base64EncodedString()
    if let style = ProcessInfo.processInfo.environment["NATIVE_E2E_INTERFACE_STYLE"] {
      app.launchArguments += ["-AppleInterfaceStyle", style, "-ios.appearance.mode", style.lowercased()]
    }
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/side-chat-ready", method: "POST")
    _ = try await control(path: "/v1/checkpoints/voice-ready", method: "POST")
    try await pairAndOpenFixtureThread()
    app.buttons["native-e2e.composer-collapsed"].tap()
    let parent = app.textViews["native-e2e.composer"]
    XCTAssertTrue(parent.waitForExistence(timeout: 10)); parent.tap(); parent.typeText("Keep the parent draft")
    app.buttons["native-e2e.composer.add"].tap()
    app.buttons["native-e2e.composer.side-chat"].tap()
    let surface = app.descendants(matching: .any).matching(identifier: "native-e2e.side-chat.surface").firstMatch
    let question = surface.textViews["native-e2e.new-thread-prompt"]
    XCTAssertTrue(question.waitForExistence(timeout: 10)); question.tap(); question.typeText("Side question")
    XCTAssertFalse(surface.staticTexts["Fixture Project"].exists,
      "A side question inherits the parent project without repeating a project header")
    XCTAssertFalse(surface.buttons["native-e2e.new-thread-close"].exists)
    let more = app.buttons["native-e2e.side-chat.more"], close = app.buttons["native-e2e.side-chat.hide"]
    XCTAssertTrue(more.isHittable); XCTAssertTrue(close.isHittable)
    XCTAssertTrue(more.frame.intersection(close.frame).isNull)
    let detail = surface.staticTexts["native-e2e.composer-selectors.detail-line"]
    if surface.buttons["native-e2e.composer-selectors.combined"].exists {
      XCTAssertTrue(detail.exists, "A compact picker keeps its second line")
      XCTAssertLessThanOrEqual(detail.frame.height, 17,
        "The model name and its optional details must occupy at most two lines total")
    }
    if UIDevice.current.userInterfaceIdiom == .pad, app.frame.width < 960 {
      let mainBar = app.navigationBars["Fixture thread"].firstMatch
      if mainBar.exists {
        XCTAssertGreaterThanOrEqual(more.frame.minY, mainBar.frame.maxY,
          "Side-chat actions belong to its panel, not the parent chat toolbar")
        XCTAssertGreaterThanOrEqual(close.frame.minY, mainBar.frame.maxY)
      }
      // The 360pt pane reserves the shared 12pt content inset on each edge.
      XCTAssertGreaterThanOrEqual(surface.frame.width, 336, "The side chat must remain wide enough for its controls")
      let timeline = app.collectionViews["native-e2e.timeline"].firstMatch
      XCTAssertGreaterThanOrEqual(timeline.frame.width, app.frame.width - 20,
        "The portrait inspector should overlay the main chat rather than shrink it")
    }
    return surface
  }

  private func insertSideChatDictation() throws {
    let microphone = app.buttons["native-e2e.voice.start"]
    XCTAssertTrue(microphone.waitForExistence(timeout: 5)); microphone.tap()
    let stop = app.buttons["native-e2e.voice.stop"]
    XCTAssertTrue(stop.waitForExistence(timeout: 10)); stop.tap()
    let insert = app.buttons["native-e2e.voice.insert"]
    XCTAssertTrue(insert.waitForExistence(timeout: 15))
    XCTAssertEqual(app.textViews["native-e2e.voice.transcript"].value as? String, "Fixture host transcript")
    insert.tap()
  }

  private func assertSideChatVoiceLeavesParentDraft() throws {
    let hide = app.buttons["native-e2e.side-chat.hide"]
    XCTAssertTrue(hide.waitForExistence(timeout: 5)); hide.tap()
    let collapsed = app.buttons["native-e2e.composer-collapsed"]
    XCTAssertTrue(collapsed.waitForExistence(timeout: 10)); collapsed.tap()
    let parent = app.textViews["native-e2e.composer"]
    XCTAssertTrue(parent.waitForExistence(timeout: 10))
    XCTAssertEqual(parent.value as? String, "Keep the parent draft", "Side-chat dictation must never target the parent composer")
  }

  private func sideChatVoiceProof(_ name: String) {
    let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    proof.name = name; proof.lifetime = .keepAlways; add(proof)
  }
}
