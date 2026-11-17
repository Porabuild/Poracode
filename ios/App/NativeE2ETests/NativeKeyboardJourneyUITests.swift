import UIKit
import XCTest

extension NativeFamilyJourneyUITests {
  func testKeyboardBindingsEditPersistAndRouteThroughTheActiveScene() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses the controlled workspace fixture.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    app.launchArguments.append("-native-e2e-keybindings-fresh-preferences")
    _ = try await control(path: "/v1/reset", method: "POST")
    try await pairUntilHome()

    try await keyboardKey(0x36, command: true, shift: true)
    keyboardProof("after-settings-key")
    XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 5), "Shift-command-comma must open Poracode settings")
    let shortcuts = app.buttons["native-e2e.settings.shortcuts"]
    XCTAssertTrue(shortcuts.waitForExistence(timeout: 5)); shortcuts.tap()
    let search = app.searchFields.firstMatch
    XCTAssertTrue(search.waitForExistence(timeout: 5)); search.tap(); search.typeText("New Thread")
    let command = app.buttons["native-e2e.keyboard.command.thread.new"]
    XCTAssertTrue(command.waitForExistence(timeout: 5)); command.tap()
    let binding = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "native-e2e.keyboard.binding.thread.new.")).firstMatch
    XCTAssertTrue(binding.waitForExistence(timeout: 5)); binding.tap()
    keyboardProof("binding-editor-opened")
    let keys = app.textFields["native-e2e.keyboard.keys"]
    XCTAssertTrue(keys.waitForExistence(timeout: 5)); keys.tap()
    try await keyboardKey(0x04, command: true)
    keys.typeText("Command+Shift+J")
    let save = app.buttons["native-e2e.keyboard.save"]
    let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true AND hittable == true"), object: save)
    XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 5), .completed)
    XCTAssertEqual(keys.value as? String, "Command+Shift+J")
    XCTAssertTrue(save.isEnabled); XCTAssertTrue(save.isHittable)
    XCTAssertGreaterThanOrEqual(save.frame.height, 44)
    if app.keyboards.firstMatch.exists { XCTAssertLessThanOrEqual(save.frame.maxY, app.keyboards.firstMatch.frame.minY) }
    keyboardProof("shortcut-editor-above-keyboard")
    save.tap()
    XCTAssertTrue(binding.waitForExistence(timeout: 5))
    XCTAssertTrue(binding.label.contains("⇧⌘J"))
    binding.tap()
    app.buttons["native-e2e.keyboard.record"].tap()
    XCTAssertTrue(app.otherElements["native-e2e.keyboard.capture"].waitForExistence(timeout: 5)
      || app.staticTexts["Press a key combination. Press Escape to cancel."].exists)
    try await keyboardKey(0x11, command: true, shift: true)
    XCTAssertFalse(app.buttons["native-e2e.new-thread-close"].exists, "Recording a shortcut must not execute the app action")
    XCTAssertEqual(keys.value as? String, "Shift+Command+N")
    XCTAssertTrue(save.isEnabled); save.tap()
    XCTAssertTrue(binding.waitForExistence(timeout: 5)); XCTAssertTrue(binding.label.contains("⇧⌘N"))
    keyboardProof("recorded-native-shortcut")
    let back = app.navigationBars["New Thread"].buttons["Keyboard Shortcuts"]
    XCTAssertTrue(back.waitForExistence(timeout: 5))
    let close = app.buttons["native-e2e.settings.close"]
    func rect(_ frame: CGRect) -> [String: Double] {
      ["x": frame.minX, "y": frame.minY, "width": frame.width, "height": frame.height]
    }
    let frameReport: [String: Any] = ["back": rect(back.frame),
      "close": close.exists ? rect(close.frame) : [:],
      "navigationBars": app.navigationBars.allElementsBoundByIndex.map(\.label)]
    let geometry = XCTAttachment(data: try JSONSerialization.data(withJSONObject: frameReport, options: [.sortedKeys]),
      uniformTypeIdentifier: "public.json")
    geometry.name = "keyboard-navigation-geometry"; geometry.lifetime = .keepAlways; add(geometry)
    back.tap()
    XCTAssertTrue(app.navigationBars["Keyboard Shortcuts"].waitForExistence(timeout: 5), "Back must return to the shortcut catalog")
    keyboardProof("back-to-shortcut-catalog")
    app.navigationBars["Keyboard Shortcuts"].buttons["Settings"].tap()
    XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["native-e2e.settings.close"].waitForExistence(timeout: 5))
    app.buttons["native-e2e.settings.close"].tap()

    let prompt = app.textViews["native-e2e.new-thread-prompt"]
    try await keyboardKey(0x11, command: true)
    XCTAssertFalse(prompt.waitForExistence(timeout: 1), "The replaced shortcut must retire")
    try await keyboardKey(0x11, command: true, shift: true)
    XCTAssertTrue(prompt.waitForExistence(timeout: 5))
    prompt.tap(); prompt.typeText("Retain this native draft")
    try await keyboardKey(0x04, command: true)
    prompt.typeText("Editing shortcuts still work")
    XCTAssertEqual(prompt.value as? String, "Editing shortcuts still work")
    try await keyboardKey(0x05, command: true)
    XCTAssertTrue(prompt.exists); XCTAssertEqual(prompt.value as? String, "Editing shortcuts still work")
    keyboardProof("rebound-command-and-standard-editing")
    app.buttons["native-e2e.new-thread-close"].tap()

    app.terminate()
    app.launchArguments.removeAll { $0 == "-native-e2e-keybindings-fresh-preferences" }
    try await pairUntilHome()
    try await keyboardKey(0x11, command: true)
    XCTAssertFalse(prompt.waitForExistence(timeout: 1))
    try await keyboardKey(0x11, command: true, shift: true)
    XCTAssertTrue(prompt.waitForExistence(timeout: 5), "Custom shortcuts must survive app relaunch")
    keyboardProof("shortcut-restored-after-relaunch")
  }

  func testComposerHardwareKeysUseTheFocusedDraftAndRespectModalPickers() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses the controlled capability catalog and audio capture.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    app.launchArguments.append("-native-e2e-keybindings-fresh-preferences")
    app.launchEnvironment["NATIVE_E2E_VOICE_FILE"] = "1"
    app.launchEnvironment["NATIVE_E2E_VOICE_WAV"] = Data([82,73,70,70,38,0,0,0,87,65,86,69,102,109,116,32,16,0,0,0,
      1,0,1,0,128,62,0,0,0,125,0,0,2,0,16,0,100,97,116,97,2,0,0,0,0,0]).base64EncodedString()
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/composer-controls-ready", method: "POST")
    try await pairUntilHome()
    _ = try await control(path: "/v1/checkpoints/composer-controls-ready", method: "POST")
    try await keyboardKey(0x11, command: true)
    let prompt = app.textViews["native-e2e.new-thread-prompt"]
    XCTAssertTrue(prompt.waitForExistence(timeout: 10))
    try await setPreferenceFast(false)
    prompt.tap(); prompt.typeText("Keep this focused draft")
    XCTAssertTrue(keyboardComposerSummary.contains("Fixture Pro"))
    XCTAssertTrue(keyboardComposerSummary.contains("Low"))
    try await keyboardKey(0x17, command: true)
    try await poll { self.keyboardComposerSummary.contains("High") }
    try await keyboardKey(0x09, command: true, shift: true)
    try await poll { self.keyboardComposerSummary.contains("Fast") }
    try await keyboardKey(0x0F, command: true, shift: true)
    try await poll { self.keyboardComposerSummary.contains("Plan") }
    XCTAssertEqual(prompt.value as? String, "Keep this focused draft", "The plan shortcut must not insert or send a newline")
    try await keyboardKey(0x13, command: true)
    try await poll { !self.keyboardComposerSummary.contains("Ask When Needed") }
    try await keyboardKey(0x13, command: true)
    try await poll { self.keyboardComposerSummary.contains("Ask When Needed") }
    keyboardProof("composer-shortcuts-edit-selections")

    try await keyboardKey(0x10, command: true, shift: true)
    let model = app.buttons["native-e2e.new-thread-model.codex.gpt-5"]
    XCTAssertTrue(model.waitForExistence(timeout: 5), "The model shortcut must open the native model chooser")
    try await keyboardKey(0x17, command: true)
    XCTAssertTrue(model.exists, "A modal model picker must block composer shortcuts behind it")
    keyboardProof("composer-shortcut-native-model-picker")
    app.buttons["Done"].tap()
    XCTAssertTrue(prompt.waitForExistence(timeout: 5))
    XCTAssertTrue(keyboardComposerSummary.contains("High"), "The blocked shortcut must not edit the underlying draft")
    prompt.typeText(" preserved")
    try await keyboardKey(0x07, command: true, shift: true)
    let stop = app.buttons["native-e2e.voice.stop"]
    XCTAssertTrue(stop.waitForExistence(timeout: 10), "Dictation uses the existing recorder and native review sheet")
    try await keyboardKey(0x11, command: true)
    XCTAssertTrue(stop.exists, "The voice sheet must block actions behind it")
    keyboardProof("composer-shortcut-starts-dictation")
    app.buttons["native-e2e.voice.cancel"].tap()
    XCTAssertTrue(prompt.waitForExistence(timeout: 5))
    XCTAssertEqual(prompt.value as? String, "Keep this focused draft preserved")
    XCTAssertTrue(app.buttons["native-e2e.new-thread-start"].exists)
    app.buttons["native-e2e.new-thread-close"].tap()
  }

  func testMainAndSideChatHardwareKeysFollowTheActualFocusedEditor() async throws {
    try XCTSkipUnless(UIDevice.current.userInterfaceIdiom == .pad,
      "Two simultaneous docked chat editors require an iPad-sized window.")
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses the controlled side-chat capability catalog.")
    XCUIDevice.shared.orientation = .landscapeLeft
    app.launchArguments.append("-native-e2e-keybindings-fresh-preferences")
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/composer-controls-ready", method: "POST")
    _ = try await control(path: "/v1/checkpoints/side-chat-ready", method: "POST")
    try await pairAndOpenFixtureThread()
    _ = try await control(path: "/v1/checkpoints/composer-controls-ready", method: "POST")
    let sidebar = app.buttons["native-e2e.sidebar-toggle"]
    if app.buttons["native-e2e.thread.thread-fixture-001"].isHittable && sidebar.exists { sidebar.tap() }
    app.buttons["native-e2e.composer-collapsed"].tap()
    let main = app.textViews["native-e2e.composer"].firstMatch
    XCTAssertTrue(main.waitForExistence(timeout: 5)); main.tap()
    try await keyboardKey(0x10, command: true, shift: true)
    let model = app.buttons["native-e2e.keyboard.model.gpt-5"]
    XCTAssertTrue(model.waitForExistence(timeout: 5))
    try await keyboardKey(0x11, command: true)
    XCTAssertTrue(model.exists, "A running-thread model picker must block background New Thread")
    model.tap()
    main.typeText("Parent keyboard draft")
    try await keyboardKey(0x17, command: true)
    try await poll { self.keyboardComposerSummary.contains("Low") }
    try await keyboardKey(0x17, command: true)
    try await poll { self.keyboardComposerSummary.contains("High") }
    keyboardProof("parent-composer-keyboard-controls")
    app.buttons["native-e2e.composer.add"].tap()
    app.buttons["native-e2e.composer.side-chat"].tap()
    let initial = app.textViews["native-e2e.new-thread-prompt"]
    XCTAssertTrue(initial.waitForExistence(timeout: 10)); initial.tap()
    let side = app.descendants(matching: .any).matching(identifier: "native-e2e.side-chat.surface").firstMatch
    initial.typeText("Focused side question")
    let nextEffort = keyboardComposerSummary(in: side).contains("Low") ? "High" : "Low"
    try await keyboardKey(0x17, command: true)
    try await poll { self.keyboardComposerSummary(in: side).contains(nextEffort) }
    if nextEffort == "High" {
      try await keyboardKey(0x17, command: true)
      try await poll { self.keyboardComposerSummary(in: side).contains("Low") }
    }
    let launch = app.buttons["native-e2e.new-thread-start"]
    keyboardProof("side-draft-before-launch")
    XCTAssertTrue(launch.isEnabled, "The edited side draft must remain sendable")
    launch.tap()
    let replied = side.staticTexts["Side reply: Focused side question"].waitForExistence(timeout: 15)
    if !replied {
      keyboardProof("side-launch-incomplete")
      let state = XCTAttachment(string: app.debugDescription)
      state.name = "keyboard-side-launch-state"; state.lifetime = .keepAlways; add(state)
    }
    XCTAssertTrue(replied)
    side.buttons["native-e2e.composer-collapsed"].tap()
    let sideInput = side.textViews["native-e2e.composer"]
    XCTAssertTrue(sideInput.waitForExistence(timeout: 5)); sideInput.tap(); sideInput.typeText("Side keyboard draft")
    let previousSideControls = keyboardComposerSummary(in: side)
    keyboardProof("side-composer-before-key")
    try await keyboardKey(0x17, command: true)
    keyboardProof("side-composer-after-key")
    let controls = XCTAttachment(string: "Before: \(previousSideControls)\nAfter: \(keyboardComposerSummary(in: side))\n\(side.debugDescription)")
    controls.name = "keyboard-side-control-state"; controls.lifetime = .keepAlways; add(controls)
    try await poll { self.keyboardComposerSummary(in: side).contains("High") }
    try hideComposerKeyboard()
    keyboardProof("both-composers-keyboard-hidden")
    let parentInput = try focusKeyboardComposer(in: app, beforeX: side.frame.minX)
    XCTAssertTrue(keyboardComposerSummary(in: app, beforeX: side.frame.minX).contains("High"))
    try await keyboardKey(0x17, command: true)
    try await poll { self.keyboardComposerSummary(in: self.app, beforeX: side.frame.minX).contains("Low") }
    XCTAssertEqual(parentInput.value as? String, "Parent keyboard draft")
    try hideComposerKeyboard()
    let restoredSideInput = try focusKeyboardComposer(in: side)
    XCTAssertTrue(keyboardComposerSummary(in: side).contains("High"), "Changing the parent must leave the side-chat controls alone")
    XCTAssertEqual(restoredSideInput.value as? String, "Side keyboard draft")
    keyboardProof("focused-main-and-side-chat-actions")
    app.buttons["native-e2e.side-chat.hide"].tap()
  }

  private var keyboardComposerSummary: String { keyboardComposerSummary(in: app) }

  private func hideComposerKeyboard() throws {
    guard app.keyboards.firstMatch.exists else { return }
    let hide = app.keyboards.buttons["Hide keyboard"]
    XCTAssertTrue(hide.waitForExistence(timeout: 5)); hide.tap()
  }

  private func focusKeyboardComposer(in root: XCUIElement, beforeX: CGFloat? = nil) throws -> XCUIElement {
    func input() -> XCUIElement? {
      root.textViews.matching(identifier: "native-e2e.composer").allElementsBoundByIndex.first { field in
        beforeX.map { field.frame.maxX <= $0 } ?? true
      }
    }
    if input() == nil {
      let collapsed = try XCTUnwrap(root.buttons.matching(identifier: "native-e2e.composer-collapsed")
        .allElementsBoundByIndex.first { button in beforeX.map { button.frame.maxX <= $0 } ?? true })
      collapsed.tap()
    }
    let field = try XCTUnwrap(input()); field.tap(); return field
  }

  private func keyboardComposerSummary(in root: XCUIElement, beforeX: CGFloat? = nil) -> String {
    func button(_ identifier: String) -> XCUIElement? {
      root.buttons.matching(identifier: identifier).allElementsBoundByIndex.first { element in
        beforeX.map { element.frame.maxX <= $0 } ?? true
      }
    }
    if let combined = button("native-e2e.composer-selectors.combined") { return combined.value as? String ?? "" }
    return ["model", "effort", "permissions", "plan", "fast"].compactMap { name in
      guard let control = button("native-e2e.composer.\(name)") else { return nil }
      return [control.label, control.value as? String].compactMap { $0 }.joined(separator: " ")
    }.joined(separator: ", ")
  }

  private func keyboardKey(_ key: Int, command: Bool = false, shift: Bool = false) async throws {
    let names = [0x36: ",", 0x04: "a", 0x11: "n", 0x05: "b", 0x17: "t", 0x09: "f", 0x13: "p", 0x10: "m", 0x07: "d", 0x0F: "l"]
    let name = try XCTUnwrap(names[key])
    var flags: XCUIElement.KeyModifierFlags = []
    if command { flags.insert(.command) }
    if shift { flags.insert(.shift) }
    app.typeKey(XCUIKeyboardKey(rawValue: name), modifierFlags: flags)
  }

  private func keyboardProof(_ name: String) {
    let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    proof.name = "keyboard-\(name)"; proof.lifetime = .keepAlways; add(proof)
  }
}
