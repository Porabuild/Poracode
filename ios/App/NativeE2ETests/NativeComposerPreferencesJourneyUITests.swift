import XCTest

extension NativeFamilyJourneyUITests {
  func testMachineProviderOrderIsLocalUntilRelockedAndKeepsTheDraft() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey changes only controlled provider-order fixtures.")
    if let style = ProcessInfo.processInfo.environment["NATIVE_E2E_INTERFACE_STYLE"] {
      app.launchArguments += ["-AppleInterfaceStyle", style, "-ios.appearance.mode", style.lowercased()]
    }
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/provider-order-ready", method: "POST")
    try await pairUntilHome()
    _ = try await control(path: "/v1/checkpoints/provider-order-ready", method: "POST")
    openPreferenceDraft()
    let prompt = app.textViews["native-e2e.new-thread-prompt"]
    prompt.tap(); prompt.typeText("Keep the selected model and this draft")
    let before = preferenceSummary
    let journalStart = try await preferenceOperationIDs().count
    app.buttons["native-e2e.new-thread-close"].tap()
    try openProviderOrderSettings()
    let synced = app.switches["native-e2e.settings.provider-order.synced"]
    XCTAssertTrue(synced.waitForExistence(timeout: 10))
    XCTAssertEqual(synced.value as? String, "1")
    synced.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
    XCTAssertEqual(synced.value as? String, "0")
    let machine = app.buttons["native-e2e.settings.provider-order.machine"]
    XCTAssertTrue(machine.waitForExistence(timeout: 5))
    let nativeMachineLabel = try XCTUnwrap(machine.staticTexts.allElementsBoundByIndex
      .first { $0.label != "Machine" }?.label)
    try selectProviderOrderMachine("WSL · Ubuntu")
    try await moveReviewerToTop()
    preferenceProof("wsl-specific-provider-order")
    try selectProviderOrderMachine(nativeMachineLabel)
    let nativeMain = providerOrderRow("codex"), nativeReviewer = providerOrderRow("fixture-reviewer")
    XCTAssertLessThan(nativeMain.frame.midY, nativeReviewer.frame.midY,
      "WSL display changes must not change the native machine's order")
    try await moveReviewerToTop()
    let reset = app.buttons["native-e2e.settings.provider-order.reset"]
    XCTAssertTrue(reset.waitForExistence(timeout: 5)); reset.tap()
    let main = providerOrderRow("codex"), reviewer = providerOrderRow("fixture-reviewer")
    try await poll { main.frame.midY < reviewer.frame.midY }
    try await moveReviewerToTop()
    preferenceProof("machine-specific-provider-order")
    let localOperations = Array(try await preferenceOperationIDs().dropFirst(journalStart))
    XCTAssertFalse(localOperations.contains("route:settings-write"),
      "Machine-specific display edits must not be sent to the host")
    try closeNativeModelsSettings()
    openPreferenceDraft()
    XCTAssertEqual(prompt.value as? String, "Keep the selected model and this draft")
    XCTAssertEqual(preferenceSummary, before, "Reordering a menu must not select another model")
    let picker = try await preferenceControl("model")
    let usesCombinedControls = picker.identifier == "native-e2e.composer-selectors.combined"
    picker.tap()
    if usesCombinedControls {
      app.buttons["native-e2e.new-thread-controls.model"].tap()
    }
    let reviewModel = app.buttons["native-e2e.new-thread-model.fixture-reviewer.review-model"]
    let mainModel = app.buttons["native-e2e.new-thread-model.codex.gpt-5"]
    XCTAssertTrue(reviewModel.waitForExistence(timeout: 5)); XCTAssertTrue(mainModel.exists)
    XCTAssertLessThan(reviewModel.frame.midY, mainModel.frame.midY)
    preferenceProof("machine-order-in-retained-model-picker")
    if usesCombinedControls { app.navigationBars["Model"].buttons["BackButton"].tap() }
    app.navigationBars[usesCombinedControls ? "Composer controls" : "Model"].buttons["Done"].tap()
    app.buttons["native-e2e.new-thread-close"].tap()
    try openProviderOrderSettings()
    XCTAssertEqual(synced.value as? String, "0")
    synced.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
    try await poll { synced.value as? String == "1" && synced.isEnabled }
    XCTAssertLessThan(reviewer.frame.midY, main.frame.midY, "The adopted host order stays visible after relocking")
    synced.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
    try selectProviderOrderMachine("WSL · Ubuntu")
    XCTAssertFalse(app.buttons["native-e2e.settings.provider-order.reset"].exists,
      "Relocking clears the old WSL override as well as the native one")
    XCTAssertLessThan(reviewer.frame.midY, main.frame.midY)
    synced.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
    XCTAssertEqual(synced.value as? String, "1")
    let operations = Array(try await preferenceOperationIDs().dropFirst(journalStart))
    XCTAssertEqual(operations.filter { $0 == "route:settings-write" }.count, 1)
    XCTAssertFalse(operations.contains("route:project-command"))
    preferenceProof("machine-order-adopted-by-host")
  }

  private func providerOrderRow(_ kind: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: "native-e2e.settings.provider-order.row.\(kind)").firstMatch
  }

  private func selectProviderOrderMachine(_ label: String) throws {
    let picker = app.buttons["native-e2e.settings.provider-order.machine"]
    XCTAssertTrue(picker.isHittable)
    picker.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
    let option = app.buttons[label].firstMatch
    guard option.waitForExistence(timeout: 5) else {
      XCTFail("The machine menu must expose its visible target: \(label)"); return
    }
    option.tap()
  }

  private func moveReviewerToTop() async throws {
    let bar = app.navigationBars["Models"]
    if bar.buttons["Edit"].exists { bar.buttons["Edit"].tap() }
    let handles = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Reorder"))
    XCTAssertGreaterThanOrEqual(handles.count, 2, "Native ordering exposes its reorder handles")
    let sorted = handles.allElementsBoundByIndex.sorted { $0.frame.midY < $1.frame.midY }
    guard sorted.count >= 2 else { return }
    sorted[1].press(forDuration: 0.8, thenDragTo: sorted[0])
    let main = providerOrderRow("codex"), reviewer = providerOrderRow("fixture-reviewer")
    try await poll { reviewer.frame.midY < main.frame.midY }
    bar.buttons["Done"].tap()
  }

  private func openProviderOrderSettings() throws {
    try openNativeModelsSettings()
    let synced = app.switches["native-e2e.settings.provider-order.synced"]
    for _ in 0..<4 { if synced.isHittable { break }; app.swipeUp() }
    XCTAssertTrue(synced.isHittable)
  }


  func testDisabledProviderSettingsRefreshTheRetainedNewThreadDraft() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey edits only the controlled peer's provider preferences.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    let journalStart = try await preferenceOperationIDs().count
    _ = try await control(path: "/v1/checkpoints/composer-controls-ready", method: "POST")
    try await pairUntilHome()
    _ = try await control(path: "/v1/checkpoints/composer-controls-ready", method: "POST")
    openPreferenceDraft()
    try await choosePreferenceModel("fixture-reviewer.review-model")
    let prompt = app.textViews["native-e2e.new-thread-prompt"]
    prompt.tap(); prompt.typeText("Keep this unsent draft")
    app.buttons["native-e2e.new-thread-close"].tap()

    let more = app.buttons.matching(NSPredicate(format: "identifier IN %@", [
      "native-e2e.session-menu", "native-e2e.sidebar.more-tools",
    ])).firstMatch
    if !more.isHittable { app.buttons["native-e2e.sidebar-toggle"].tap() }
    XCTAssertTrue(more.waitForExistence(timeout: 10)); more.tap()
    app.buttons["Settings"].tap()
    let models = app.buttons["Models"].firstMatch
    for _ in 0..<4 { if models.isHittable { break }; app.swipeUp() }
    XCTAssertTrue(models.isHittable); models.tap()
    let enabled = app.switches["native-e2e.settings.agent-enabled.fixture-reviewer"]
    XCTAssertTrue(enabled.waitForExistence(timeout: 10))
    await fulfillment(of: [XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in enabled.isEnabled },
      object: enabled)], timeout: 10)
    XCTAssertEqual(enabled.value as? String, "1")
    enabled.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
    preferenceProof("provider-switch-after-tapping")
    XCTAssertEqual(enabled.value as? String, "0")
    let deadline = ContinuousClock.now.advanced(by: .seconds(10))
    while !(try await preferenceOperationIDs()).dropFirst(journalStart).contains("route:settings-write"), ContinuousClock.now < deadline {
      try await Task.sleep(for: .milliseconds(100))
    }
    let recorded = try await preferenceOperationIDs()
    XCTAssertTrue(recorded.dropFirst(journalStart).contains("route:settings-write"))
    preferenceProof("provider-disabled-in-native-settings")
    app.navigationBars["Models"].buttons["Settings"].tap()
    app.navigationBars["Settings"].buttons["More"].tap()
    let done = app.buttons["native-e2e.more.close"]
    XCTAssertTrue(done.waitForExistence(timeout: 5)); done.tap()

    openPreferenceDraft()
    let updated = NSPredicate { _, _ in self.preferenceSummary.contains("Fixture Pro") }
    await fulfillment(of: [XCTNSPredicateExpectation(predicate: updated, object: app)], timeout: 10)
    XCTAssertEqual(prompt.value as? String, "Keep this unsent draft")
    let picker = try await preferenceControl("model")
    picker.tap()
    if picker.identifier == "native-e2e.composer-selectors.combined" {
      app.buttons["native-e2e.new-thread-controls.model"].tap()
    }
    XCTAssertTrue(app.buttons["native-e2e.new-thread-model.codex.gpt-5"].waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons["native-e2e.new-thread-model.fixture-reviewer.review-model"].exists)
    preferenceProof("disabled-provider-removed-from-retained-draft-picker")
    let operations = Array(try await preferenceOperationIDs().dropFirst(journalStart))
    XCTAssertEqual(operations.filter { $0 == "route:settings-write" }.count, 1)
    XCTAssertFalse(operations.contains("route:project-command"), "Refreshing a disabled provider is not a preference write")
  }

  func testComposerChoicesSurviveRelaunchWithoutWritingLegacyHostSettings() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey qualifies device-owned preferences against the controlled legacy catalog.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    let journalStart = try await preferenceOperationIDs().count
    _ = try await control(path: "/v1/checkpoints/composer-controls-ready", method: "POST")
    try await pairUntilHome()
    _ = try await control(path: "/v1/checkpoints/composer-controls-ready", method: "POST")
    openPreferenceDraft()
    try await choosePreferenceModel("fixture-reviewer.review-model")
    try await choosePreferenceEffort("High")
    XCTAssertTrue(preferenceSummary.contains("High"), "Before closing: \(preferenceSummary)")
    app.buttons["native-e2e.new-thread-add"].tap()
    let plan = app.buttons["native-e2e.new-thread-plan"]
    XCTAssertTrue(plan.waitForExistence(timeout: 5)); plan.tap()
    XCTAssertTrue(preferenceSummary.contains("Plan"))
    app.buttons["native-e2e.new-thread-close"].tap()

    // Keep the same app data and pairing. Only the debug reset argument is
    // removed; a second pairing or reset would not prove real persistence.
    relaunchWithPreferenceData()
    openPreferenceDraft()
    XCTAssertTrue(preferenceSummary.contains("Review Model"))
    XCTAssertTrue(preferenceSummary.contains("High"), "After relaunching: \(preferenceSummary)")
    XCTAssertFalse(preferenceSummary.contains("Plan"))
    XCTAssertFalse(preferenceSummary.contains("Work"))
    XCTAssertFalse(preferenceSummary.contains("Fast"), "The selected model does not support Fast")
    preferenceProof("composer-reviewer-restored-after-relaunch")

    try await choosePreferenceModel("codex.gpt-5")
    XCTAssertTrue(preferenceSummary.contains("Low"), "Another provider keeps its own effort default")
    try await setPreferenceFast(false)
    try await choosePreferenceModel("fixture-reviewer.review-model")
    XCTAssertTrue(preferenceSummary.contains("High"))
    try await choosePreferenceModel("codex.gpt-5")
    XCTAssertFalse(preferenceSummary.contains("Fast"), "An explicit false must survive a provider round trip")
    app.buttons["native-e2e.new-thread-close"].tap()
    relaunchWithPreferenceData()
    openPreferenceDraft()
    XCTAssertTrue(preferenceSummary.contains("Fixture Pro"))
    XCTAssertFalse(preferenceSummary.contains("Fast"))
    XCTAssertFalse(preferenceSummary.contains("Work"))
    preferenceProof("composer-fast-off-restored-after-relaunch")
    let operations = Array(try await preferenceOperationIDs().dropFirst(journalStart))
    XCTAssertFalse(operations.contains("route:project-command"))
    XCTAssertFalse(operations.contains("route:settings-write"), "Browser/device preferences must not become shared host settings")
    app.buttons["native-e2e.new-thread-close"].tap()
  }

  func testComposerSelectionUsesAdvertisedNarrowProjectPreferenceIntent() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses the catalog-mutations contract fixture.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    let journalStart = try await preferenceOperationIDs().count
    _ = try await control(path: "/v1/checkpoints/composer-preferences-ready", method: "POST")
    try await pairUntilHome()
    _ = try await control(path: "/v1/checkpoints/composer-preferences-ready", method: "POST")
    openPreferenceDraft()
    try await choosePreferenceModel("fixture-reviewer.review-model")
    try await choosePreferenceEffort("High")
    XCTAssertTrue(preferenceSummary.contains("Review Model"))
    XCTAssertTrue(preferenceSummary.contains("High"))
    let deadline = ContinuousClock.now.advanced(by: .seconds(10))
    var operations = Array(try await preferenceOperationIDs().dropFirst(journalStart))
    while !operations.contains("route:project-command"), ContinuousClock.now < deadline {
      try await Task.sleep(for: .milliseconds(100))
      operations = Array(try await preferenceOperationIDs().dropFirst(journalStart))
    }
    XCTAssertTrue(operations.contains("route:project-command"))
    XCTAssertFalse(operations.contains("route:settings-write"))
    preferenceProof("composer-capability-gated-project-choice")
    app.buttons["native-e2e.new-thread-close"].tap()
  }

  private var preferenceSummary: String {
    let combined = app.buttons["native-e2e.composer-selectors.combined"]
    if combined.exists { return combined.value as? String ?? "" }
    return ["model", "effort", "permissions", "plan"].compactMap {
      let button = app.buttons["native-e2e.composer.\($0)"]
      guard button.exists else { return nil }
      return [button.label, button.value as? String].compactMap { $0 }.joined(separator: " ")
    }.joined(separator: ", ")
  }

  private func openPreferenceDraft() {
    let candidates = app.buttons.matching(NSPredicate(format: "identifier IN %@", [
      "native-e2e.split-empty-new-task", "native-e2e.split-new-thread",
      "native-e2e.new-thread", "native-e2e.sidebar.new-thread",
    ]))
    let visible = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
      candidates.allElementsBoundByIndex.contains { $0.isHittable }
    }, object: app)
    XCTAssertEqual(XCTWaiter.wait(for: [visible], timeout: 10), .completed)
    guard let create = candidates.allElementsBoundByIndex.first(where: { $0.isHittable }) else {
      return XCTFail("No visible new-thread action")
    }
    create.tap()
    XCTAssertTrue(app.textViews["native-e2e.new-thread-prompt"].waitForExistence(timeout: 10))
  }

  private func choosePreferenceModel(_ identity: String) async throws {
    let control = try await preferenceControl("model")
    if control.identifier == "native-e2e.composer-selectors.combined" {
      control.tap()
      let model = app.buttons["native-e2e.new-thread-controls.model"]
      XCTAssertTrue(model.waitForExistence(timeout: 5)); model.tap()
    } else { control.tap() }
    let option = app.buttons["native-e2e.new-thread-model.\(identity)"]
    XCTAssertTrue(option.waitForExistence(timeout: 5)); option.tap()
    _ = try await preferenceControl("model")
  }

  private func choosePreferenceEffort(_ label: String) async throws {
    let control = try await preferenceControl("effort")
    if control.identifier == "native-e2e.composer.effort" {
      control.tap(); app.buttons[label].firstMatch.tap()
    } else {
      app.buttons["native-e2e.composer-selectors.combined"].tap()
      let effort = app.buttons["native-e2e.composer-controls.effort"]
      XCTAssertTrue(effort.waitForExistence(timeout: 5)); effort.tap()
      app.buttons[label].firstMatch.tap()
      app.buttons["Done"].tap()
    }
    _ = try await preferenceControl("model")
  }

  func setPreferenceFast(_ enabled: Bool) async throws {
    let control = try await preferenceControl("fast")
    if control.identifier == "native-e2e.composer.fast" {
      if (control.value as? String == "On") != enabled { control.tap() }
      XCTAssertEqual(control.value as? String, enabled ? "On" : "Off")
    } else {
      app.buttons["native-e2e.composer-selectors.combined"].tap()
      let toggle = app.switches["native-e2e.composer-controls.fast"]
      XCTAssertTrue(toggle.waitForExistence(timeout: 5))
      if (toggle.value as? String == "1") != enabled {
        toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
      }
      XCTAssertEqual(toggle.value as? String, enabled ? "1" : "0")
      app.buttons["Done"].tap()
    }
    _ = try await preferenceControl("model")
  }

  private func preferenceControl(_ name: String) async throws -> XCUIElement {
    let identifiers = ["native-e2e.composer.\(name)", "native-e2e.composer-selectors.combined"]
    let deadline = ContinuousClock.now.advanced(by: .seconds(5))
    var ready: XCUIElement?
    while ready == nil, ContinuousClock.now < deadline {
      for identifier in identifiers {
        let candidate = app.buttons[identifier]
        if candidate.exists && candidate.isHittable { ready = candidate; break }
      }
      if ready == nil { try await Task.sleep(for: .milliseconds(100)) }
    }
    return try XCTUnwrap(ready, "Wait for the previous native sheet to dismiss before the next edit")
  }

  private func relaunchWithPreferenceData() {
    app.terminate()
    app.launchArguments.removeAll { $0 == "-native-e2e-fresh-state" }
    app.launch()
  }

  private func preferenceOperationIDs() async throws -> [String] {
    let state = try await control(path: "/v1/scenario/state")
    let hosts = state["hosts"] as? [[String: Any]] ?? []
    return hosts.flatMap { ($0["operationJournal"] as? [[String: Any]] ?? []).compactMap { $0["operationId"] as? String } }
  }

  private func preferenceProof(_ name: String) {
    let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    proof.name = name; proof.lifetime = .keepAlways; add(proof)
  }
}
