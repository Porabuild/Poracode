import XCTest

extension NativeFamilyJourneyUITests {
  func testNewThreadShowsModelDetailsBesideTheVoiceButton() async throws {
    guard ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] != "real" else {
      throw XCTSkip("This visual journey uses the controlled composer catalog.")
    }
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/composer-controls-ready", method: "POST")
    try await pairUntilHome()
    _ = try await control(path: "/v1/checkpoints/composer-controls-ready", method: "POST")
    let create = app.buttons.matching(NSPredicate(format: "identifier IN %@", [
      "native-e2e.split-empty-new-task", "native-e2e.split-new-thread",
      "native-e2e.new-thread", "native-e2e.sidebar.new-thread",
    ])).firstMatch
    XCTAssertTrue(create.waitForExistence(timeout: 10)); create.tap()
    let input = app.textViews["native-e2e.new-thread-prompt"]
    XCTAssertTrue(input.waitForExistence(timeout: 10))
    // Qualify the user-requested Fast-off caption explicitly. Provider defaults
    // now match the PWA, where supported models may start with Fast enabled.
    try await setPreferenceFast(false)
    input.tap(); input.typeText("Keep all model details visible")
    let combined = app.buttons["native-e2e.composer-selectors.combined"]
    if combined.exists {
      let summary = combined.value as? String ?? ""
      XCTAssertTrue(summary.contains("128K"))
      XCTAssertTrue(summary.contains("Ask When Needed"), "Narrow visuals retain the complete accessible selection")
      XCTAssertFalse(summary.contains("Fast"), "Disabled Fast stays out of the summary")
      XCTAssertFalse(summary.contains("Work"), "The ordinary mode stays out of the summary")
      XCTAssertFalse(summary.contains("Plan"), "Plan appears only when enabled")
      let detail = combined.staticTexts["native-e2e.composer-selectors.detail-line"]
      XCTAssertTrue(detail.exists, "The compact picker retains its second line")
      XCTAssertLessThanOrEqual(detail.frame.height, 17, "The secondary caption must remain a single line")
    } else {
      try assertRenderedText("128K")
      try assertRenderedText("Ask When Needed")
    }
    let addButton = app.buttons["native-e2e.new-thread-add"]
    let microphone = app.buttons["native-e2e.voice.start"]
    let send = app.buttons["native-e2e.new-thread-start"]
    XCTAssertEqual(addButton.frame.midY, microphone.frame.midY, accuracy: 1)
    XCTAssertEqual(microphone.frame.midY, send.frame.midY, accuracy: 1)
    XCTAssertLessThanOrEqual(input.frame.height, 60, "A short draft must not reserve several blank lines")
    let initialHeight = input.frame.height
    let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    proof.name = "composer-model-details-with-voice"; proof.lifetime = .keepAlways; add(proof)
    input.typeText("\nSecond line\nThird line")
    XCTAssertGreaterThan(input.frame.height, initialHeight + 20, "The editor must grow with the actual draft")
    XCTAssertLessThanOrEqual(send.frame.maxY, app.keyboards.firstMatch.frame.minY + 4)
    let grown = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    grown.name = "composer-grows-with-draft"; grown.lifetime = .keepAlways; add(grown)
    input.typeText("\nFourth line\nFifth line\nSixth line\nSeventh line")
    XCTAssertTrue((input.value as? String)?.hasSuffix("Seventh line") == true, "The complete draft must stay intact")
    XCTAssertLessThanOrEqual(input.frame.height, 140, "Long drafts must scroll inside a bounded editor")
    try assertRenderedText("Seventh line")
    XCTAssertLessThanOrEqual(send.frame.maxY, app.keyboards.firstMatch.frame.minY + 4)
    let long = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    long.name = "composer-long-draft-scroll"; long.lifetime = .keepAlways; add(long)
    app.buttons["native-e2e.new-thread-close"].tap()
  }

  /// Explicit real-ASR qualification: the runner stages OpenAI's public JFK
  /// sample in this owned simulator's tmp folder. No host microphone is used.
  func testOnDeviceVoiceDictationReviewsAndInsertsWithoutSending() async throws {
    guard ProcessInfo.processInfo.environment["NATIVE_E2E_VOICE_REAL_ASR"] == "1" else {
      throw XCTSkip("Real ASR requires the staged audio fixture and model-download qualification run.")
    }
    app.launchEnvironment["NATIVE_E2E_VOICE_FILE"] = "1"
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/composer-controls-ready", method: "POST")
    try await pairUntilHome()
    _ = try await control(path: "/v1/checkpoints/composer-controls-ready", method: "POST")
    let create = app.buttons.matching(NSPredicate(format: "identifier IN %@", [
      "native-e2e.split-empty-new-task", "native-e2e.split-new-thread",
      "native-e2e.new-thread", "native-e2e.sidebar.new-thread",
    ])).firstMatch
    XCTAssertTrue(create.waitForExistence(timeout: 10)); create.tap()
    let input = app.textViews["native-e2e.new-thread-prompt"]
    XCTAssertTrue(input.waitForExistence(timeout: 10)); input.tap()
    input.typeText("Existing draft")
    try configureVoiceBackend("Built-in · This device")
    let microphone = app.buttons["native-e2e.voice.start"]
    XCTAssertTrue(microphone.waitForExistence(timeout: 5)); microphone.tap()
    let stop = app.buttons["native-e2e.voice.stop"]
    XCTAssertTrue(stop.waitForExistence(timeout: 10))
    try await rotateIPadJourney(to: .landscapeLeft)
    XCTAssertTrue(stop.waitForExistence(timeout: 10), "Recording must survive an adaptive layout change")
    XCUIDevice.shared.orientation = .portrait
    XCTAssertTrue(stop.waitForExistence(timeout: 10)); stop.tap()
    let insert = app.buttons["native-e2e.voice.insert"]
    let clock = ContinuousClock(), deadline = ContinuousClock.now.advanced(by: .seconds(600))
    while !insert.exists, clock.now < deadline {
      if app.staticTexts["Voice input could not complete. Try again."].exists {
        XCTFail("Real Whisper transcription failed"); return
      }
      try await Task.sleep(for: .seconds(1))
    }
    XCTAssertTrue(insert.exists, "Real on-device recognition must produce a reviewable transcript")
    let transcript = app.textViews["native-e2e.voice.transcript"]
    let recognized = try XCTUnwrap(transcript.value as? String).lowercased()
    XCTAssertTrue(recognized.contains("ask not"), recognized)
    XCTAssertTrue(recognized.contains("country"), recognized)
    let review = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    review.name = "voice-real-whisper-review"; review.lifetime = .keepAlways; add(review)
    insert.tap()
    XCTAssertTrue(input.waitForExistence(timeout: 10))
    let draft = try XCTUnwrap(input.value as? String)
    XCTAssertTrue(draft.hasPrefix("Existing draft"))
    XCTAssertTrue(draft.lowercased().contains("ask not"))
    XCTAssertTrue(app.buttons["native-e2e.new-thread-start"].exists, "Dictation inserts into the draft; it must not send a turn")
    let result = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    result.name = "voice-real-whisper-inserted"; result.lifetime = .keepAlways; add(result)
    app.buttons["native-e2e.new-thread-close"].tap()
  }

  func testHostVoiceSetupAndDictationUseTheGeneratedRemoteContract() async throws {
    guard ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] != "real" else {
      throw XCTSkip("The host-voice management journey uses the controlled engine fixture.")
    }
    app.launchEnvironment["NATIVE_E2E_VOICE_FILE"] = "1"
    app.launchEnvironment["NATIVE_E2E_VOICE_WAV"] = Data([82,73,70,70,38,0,0,0,87,65,86,69,102,109,116,32,16,0,0,0,
      1,0,1,0,128,62,0,0,0,125,0,0,2,0,16,0,100,97,116,97,2,0,0,0,0,0]).base64EncodedString()
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/voice-ready", method: "POST")
    try await pairUntilHome()
    _ = try await control(path: "/v1/checkpoints/voice-ready", method: "POST")
    let create = app.buttons.matching(NSPredicate(format: "identifier IN %@", [
      "native-e2e.split-empty-new-task", "native-e2e.split-new-thread",
      "native-e2e.new-thread", "native-e2e.sidebar.new-thread",
    ])).firstMatch
    XCTAssertTrue(create.waitForExistence(timeout: 10)); create.tap()
    let input = app.textViews["native-e2e.new-thread-prompt"]
    XCTAssertTrue(input.waitForExistence(timeout: 10)); input.tap()
    input.typeText("Host draft")
    try configureVoiceBackend("Hex · Host engine", prepareHost: true)
    app.buttons["native-e2e.voice.start"].tap()
    let stop = app.buttons["native-e2e.voice.stop"]
    XCTAssertTrue(stop.waitForExistence(timeout: 10)); stop.tap()
    let insert = app.buttons["native-e2e.voice.insert"]
    XCTAssertTrue(insert.waitForExistence(timeout: 15))
    XCTAssertEqual(app.textViews["native-e2e.voice.transcript"].value as? String, "Fixture host transcript")
    insert.tap()
    XCTAssertEqual(input.value as? String, "Host draft Fixture host transcript")
    app.buttons["native-e2e.new-thread-close"].tap()
  }

  func testThreadVoiceCancellationKeepsTheDraftAndInsertionTargetsTheOpenConversation() async throws {
    guard ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] != "real" else {
      throw XCTSkip("This voice ownership journey uses the controlled host engine.")
    }
    app.launchEnvironment["NATIVE_E2E_VOICE_FILE"] = "1"
    app.launchEnvironment["NATIVE_E2E_VOICE_WAV"] = Data([82,73,70,70,38,0,0,0,87,65,86,69,102,109,116,32,16,0,0,0,
      1,0,1,0,128,62,0,0,0,125,0,0,2,0,16,0,100,97,116,97,2,0,0,0,0,0]).base64EncodedString()
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/voice-ready", method: "POST")
    try await pairUntilHome()
    _ = try await control(path: "/v1/checkpoints/voice-ready", method: "POST")
    let thread = app.buttons["native-e2e.thread.thread-fixture-001"]
    let sidebar = app.buttons["native-e2e.sidebar-toggle"]
    if !thread.isHittable, sidebar.exists { sidebar.tap() }
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
    XCTAssertTrue(app.staticTexts["Fixture response"].waitForExistence(timeout: 10))
    app.buttons["native-e2e.composer-collapsed"].tap()
    let input = app.textViews["native-e2e.composer"]
    XCTAssertTrue(input.waitForExistence(timeout: 10)); input.typeText("Retain the original draft")
    try configureVoiceBackend("Hex · Host engine", prepareHost: true)
    XCTAssertEqual(input.value as? String, "Retain the original draft", "Cancelling capture must leave the draft intact")
    let microphone = app.buttons["native-e2e.voice.start"]
    XCTAssertTrue(microphone.isHittable); microphone.tap()
    let stop = app.buttons["native-e2e.voice.stop"]
    XCTAssertTrue(stop.waitForExistence(timeout: 10)); stop.tap()
    let insert = app.buttons["native-e2e.voice.insert"]
    XCTAssertTrue(insert.waitForExistence(timeout: 15)); insert.tap()
    XCTAssertEqual(input.value as? String, "Retain the original draft Fixture host transcript")
    try assertRenderedText("128K")
    try assertRenderedText("Ask When Needed")
    let addButton = app.buttons["native-e2e.composer.add"]
    let send = app.buttons["native-e2e.send"]
    XCTAssertEqual(addButton.frame.midY, microphone.frame.midY, accuracy: 1)
    XCTAssertEqual(microphone.frame.midY, send.frame.midY, accuracy: 1)
    XCTAssertLessThan(app.buttons["native-e2e.composer-collapse"].frame.maxY, addButton.frame.minY,
      "Collapse belongs beside the editor; it must not force Send onto a detached row")
    XCTAssertFalse(app.staticTexts["Retain the original draft Fixture host transcript"].exists,
      "Dictation must not submit the current draft as a turn")
    let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    proof.name = "thread-voice-inserted-without-sending"; proof.lifetime = .keepAlways; add(proof)
    app.buttons["native-e2e.composer-collapse"].tap()
  }

  func testAudioSettingsPreviewsAndClearsHostDictationWithoutSending() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses the isolated Hex fixture.")
    app.launchEnvironment["NATIVE_E2E_VOICE_FILE"] = "1"
    app.launchEnvironment["NATIVE_E2E_VOICE_WAV"] = Data([82,73,70,70,38,0,0,0,87,65,86,69,102,109,116,32,16,0,0,0,
      1,0,1,0,128,62,0,0,0,125,0,0,2,0,16,0,100,97,116,97,2,0,0,0,0,0]).base64EncodedString()
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/voice-ready", method: "POST")
    try await pairUntilHome()
    _ = try await control(path: "/v1/checkpoints/voice-ready", method: "POST")
    try openNativeSettingsPage("native-e2e.settings.audio")
    try selectVoiceBackend("Hex · Host engine", prepareHost: true)
    let recognized = try await previewSettingsDictation(timeout: .seconds(15))
    XCTAssertEqual(recognized, "Fixture host transcript")
    try verifySettingsDictationPreview()

    let start = app.buttons["native-e2e.audio.dictation.start"]
    XCTAssertTrue(start.isHittable); start.tap()
    let stop = app.buttons["native-e2e.audio.dictation.stop"]
    XCTAssertTrue(stop.waitForExistence(timeout: 5))
    app.buttons["native-e2e.audio.dictation.cancel"].tap()
    XCTAssertFalse(app.staticTexts["native-e2e.audio.dictation.transcript"].exists)
    XCTAssertTrue(start.isEnabled)
    let operations = try await settingsDictationOperations()
    XCTAssertTrue(operations.contains("procedure:hexVoice"))
  }

  func testAudioSettingsPreviewsOnDeviceDictationWithoutUsingTheHost() async throws {
    try XCTSkipUnless(ProcessInfo.processInfo.environment["NATIVE_E2E_VOICE_REAL_ASR"] == "1",
      "Real ASR requires the staged audio fixture and model qualification run.")
    app.launchEnvironment["NATIVE_E2E_VOICE_FILE"] = "1"
    _ = try await control(path: "/v1/reset", method: "POST")
    try await pairUntilHome()
    try openNativeSettingsPage("native-e2e.settings.audio")
    try selectVoiceBackend("Built-in · This device")
    let recognized = try await previewSettingsDictation(timeout: .seconds(600)).lowercased()
    XCTAssertTrue(recognized.contains("ask not"), recognized)
    XCTAssertTrue(recognized.contains("country"), recognized)
    try verifySettingsDictationPreview()
    let operations = try await settingsDictationOperations()
    XCTAssertFalse(operations.contains("procedure:hexVoice"))
  }

  private func settingsDictationOperations() async throws -> Set<String> {
    let state = try await control(path: "/v1/scenario/state")
    let operations = Set(try XCTUnwrap(state["observedOperationIds"] as? [String]))
    XCTAssertTrue(operations.isDisjoint(with: ["route:thread-send", "route:thread-start-existing", "route:thread-command"]))
    return operations
  }

  private func previewSettingsDictation(timeout: Duration) async throws -> String {
    let start = app.buttons["native-e2e.audio.dictation.start"]
    for _ in 0..<6 where !start.isHittable { scrollVoiceSettings() }
    XCTAssertTrue(start.isHittable && start.isEnabled); start.tap()
    let stop = app.buttons["native-e2e.audio.dictation.stop"]
    guard stop.waitForExistence(timeout: 10) else {
      let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      screenshot.name = "voice-settings-dictation-start-failure"
      screenshot.lifetime = .keepAlways
      add(screenshot)
      XCTFail("Dictation did not start. Rendered text: \(try renderedScreenText())")
      return ""
    }
    XCTAssertTrue(stop.isHittable, "Stop must remain reachable when recording replaces Start")
    let activity = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    activity.name = "voice-settings-recording-controls"
    activity.lifetime = .keepAlways
    add(activity)
    stop.tap()
    let transcript = app.staticTexts["native-e2e.audio.dictation.transcript"]
    try await poll(timeout: timeout) { transcript.exists }
    return transcript.label
  }

  private func verifySettingsDictationPreview() throws {
    XCTAssertTrue(app.navigationBars["Audio"].exists)
    XCTAssertFalse(app.buttons["native-e2e.voice.insert"].exists)
    let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    screenshot.name = "voice-settings-dictation-preview"; screenshot.lifetime = .keepAlways; add(screenshot)
    app.buttons["Clear transcript"].tap()
    XCTAssertFalse(app.staticTexts["native-e2e.audio.dictation.transcript"].exists)
    XCTAssertTrue(app.buttons["native-e2e.audio.dictation.start"].exists)
  }

  func configureVoiceBackend(_ name: String, prepareHost: Bool = false) throws {
    app.buttons["native-e2e.voice.start"].tap()
    let audio = app.buttons["Audio"]
    XCTAssertTrue(audio.waitForExistence(timeout: 10)); audio.tap()
    try selectVoiceBackend(name, prepareHost: prepareHost)
    app.navigationBars["Audio"].buttons.element(boundBy: 0).tap()
    app.buttons["native-e2e.voice.cancel"].tap()
  }

  private func selectVoiceBackend(_ name: String, prepareHost: Bool = false) throws {
    let picker = app.buttons["native-e2e.audio.backend"]
    XCTAssertTrue(picker.waitForExistence(timeout: 5)); picker.tap()
    let menuProof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    menuProof.name = "voice-backend-picker"; menuProof.lifetime = .keepAlways; add(menuProof)
    let option = app.buttons[name].firstMatch
    let found = option.waitForExistence(timeout: 5)
    XCTAssertTrue(found); option.tap()
    if name == "Built-in · This device" {
      app.buttons["native-e2e.audio.local-model"].tap()
      let model = ProcessInfo.processInfo.environment["NATIVE_E2E_VOICE_MODEL"] == "base"
        ? "Better (Whisper base)" : "Fastest (Whisper tiny)"
      let choice = app.buttons[model].firstMatch
      XCTAssertTrue(choice.waitForExistence(timeout: 5)); choice.tap()
    }
    if prepareHost {
      let install = app.buttons["native-e2e.audio.hex.install"]
      for _ in 0..<6 { if install.isHittable { break }; scrollVoiceSettings() }
      XCTAssertTrue(install.waitForExistence(timeout: 5)); install.tap()
      let prepare = app.buttons["native-e2e.audio.hex.prepare"]
      let installed = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      installed.name = "voice-host-after-install"; installed.lifetime = .keepAlways; add(installed)
      for _ in 0..<6 { if prepare.isHittable { break }; scrollVoiceSettings() }
      XCTAssertTrue(prepare.waitForExistence(timeout: 10))
      let deadline = ContinuousClock.now.advanced(by: .seconds(10))
      while !prepare.isEnabled, ContinuousClock.now < deadline { Thread.sleep(forTimeInterval: 0.1) }
      XCTAssertTrue(prepare.isEnabled)
      prepare.tap()
      let status = app.descendants(matching: .any).matching(identifier: "native-e2e.audio.hex.status").firstMatch
      for _ in 0..<6 { if status.exists { break }; scrollVoiceSettings() }
      XCTAssertTrue(status.waitForExistence(timeout: 10))
      let ready = NSPredicate(format: "value == %@", "Ready")
      expectation(for: ready, evaluatedWith: status)
      waitForExpectations(timeout: 10)
    }
    let settings = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    settings.name = "voice-audio-settings"; settings.lifetime = .keepAlways; add(settings)
  }

  private func scrollVoiceSettings() {
    let form = app.collectionViews["native-e2e.audio.settings"].firstMatch
    if form.exists {
      form.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.85))
        .press(forDuration: 0.1, thenDragTo: form.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.25)))
    } else { app.swipeUp() }
  }
}
