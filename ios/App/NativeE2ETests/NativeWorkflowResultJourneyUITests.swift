import XCTest

extension NativeFamilyJourneyUITests {
  func testWorkflowResultRowsSharePWAContentAndKeepExpansionAcrossRotation() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses controlled structured workflow results.")
    let isPad = UIDevice.current.userInterfaceIdiom == .pad
    app.launchArguments += ["-AppleInterfaceStyle", isPad ? "Dark" : "Light",
      "-ios.appearance.mode", isPad ? "dark" : "light"]
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/workflow-viewer-ready", method: "POST")
    try await pairUntilHome()
    let thread = app.buttons["native-e2e.thread.thread-fixture-001"].firstMatch
    if !thread.isHittable, app.buttons["native-e2e.sidebar-toggle"].exists { app.buttons["native-e2e.sidebar-toggle"].tap() }
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
    let list = app.buttons["native-e2e.tool-body-list.body:workflow-fixture-launch:0"].firstMatch
    XCTAssertTrue(list.waitForExistence(timeout: 10)); XCTAssertTrue(list.label.contains("2 titles")); list.tap()
    let row = app.buttons["native-e2e.tool-body-row.body:workflow-fixture-launch:0:0"].firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5)); row.tap()
    XCTAssertTrue(app.staticTexts["Retain every pane and the draft."].waitForExistence(timeout: 5))
    let field = app.textViews["native-e2e.tool-body-field.body:workflow-fixture-launch:0:0.2"].firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5)); XCTAssertEqual(field.value as? String, "false")
    workflowProof("workflow-results-parent-portrait")
    try await rotateIPadJourney(to: .landscapeLeft)
    XCTAssertTrue(row.waitForExistence(timeout: 5)); XCTAssertEqual(row.value as? String, "Expanded")
    XCTAssertEqual(field.value as? String, "false")
    workflowProof("workflow-results-parent-retained")
    let tool = app.buttons["native-e2e.tool-details.workflow-fixture-launch"].firstMatch
    XCTAssertTrue(tool.waitForExistence(timeout: 5)); tool.tap()
    let open = app.buttons["native-e2e.workflow-open.workflow-fixture-launch"].firstMatch
    XCTAssertTrue(open.waitForExistence(timeout: 5)); open.tap()
    let agent = app.descendants(matching: .any).matching(identifier: "native-e2e.workflow-agent.inspect-1").firstMatch
    XCTAssertTrue(agent.waitForExistence(timeout: 10)); agent.tap()
    XCTAssertTrue(app.staticTexts["Inspect agent full transcript"].waitForExistence(timeout: 10))
    openWorkflowAgentTools()
    let agentList = app.buttons["native-e2e.tool-body-list.body:agent-results:0"].firstMatch
    let timeline = app.collectionViews["native-e2e.workflow-agent-detail"]
    for _ in 0..<3 where !agentList.isHittable { timeline.swipeUp() }
    XCTAssertTrue(agentList.waitForExistence(timeout: 5)); agentList.tap()
    let resultHeadingID = "native-e2e.tool-details.agent-results"
    let resultHeading = app.descendants(matching: .any)[resultHeadingID].firstMatch
    XCTAssertTrue(resultHeading.exists)
    XCTAssertFalse(app.buttons[resultHeadingID].exists,
      "A resolved result without a viewer destination must not offer an empty disclosure.")
    let agentRow = app.buttons["native-e2e.tool-body-row.body:agent-results:0:0"].firstMatch
    XCTAssertTrue(agentRow.waitForExistence(timeout: 5)); agentRow.tap()
    let agentField = app.textViews["native-e2e.tool-body-field.body:agent-results:0:0.2"].firstMatch
    for _ in 0..<3 where !agentField.exists { timeline.swipeUp() }
    XCTAssertTrue(agentField.waitForExistence(timeout: 5)); XCTAssertEqual(agentField.value as? String, "false")
    workflowProof("workflow-results-agent-retained")
    XCUIDevice.shared.orientation = .portrait
    XCTAssertTrue(agentRow.waitForExistence(timeout: 5)); XCTAssertEqual(agentRow.value as? String, "Expanded")
    XCTAssertEqual(agentField.value as? String, "false")
    workflowProof("workflow-results-agent-portrait")
    app.buttons["native-e2e.workflow-close"].firstMatch.tap()
  }

  func testWorkflowFailuresAndLongTitlesRemainReadableAtAccessibilitySizes() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses controlled rejected results and long finding titles.")
    let isPad = UIDevice.current.userInterfaceIdiom == .pad
    app.launchArguments += ["-AppleInterfaceStyle", isPad ? "Dark" : "Light",
      "-ios.appearance.mode", isPad ? "dark" : "light",
      "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/workflow-results-stress-ready", method: "POST")
    try await pairUntilHome()
    let thread = app.buttons["native-e2e.thread.thread-fixture-001"].firstMatch
    if !thread.isHittable, app.buttons["native-e2e.sidebar-toggle"].exists { app.buttons["native-e2e.sidebar-toggle"].tap() }
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
    let tool = app.buttons["native-e2e.tool-details.workflow-fixture-launch"].firstMatch
    if !tool.exists {
      let group = app.buttons["native-e2e.activity-group.workflow-fixture-launch"].firstMatch
      XCTAssertTrue(group.waitForExistence(timeout: 5)); group.tap()
    }
    let timeline = app.collectionViews["native-e2e.timeline"].firstMatch
    let list = app.buttons["native-e2e.tool-body-list.body:workflow-fixture-launch:0"].firstMatch
    revealWorkflowResult(list, in: timeline); list.tap()
    let row = app.buttons["native-e2e.tool-body-row.body:workflow-fixture-launch:0:0"].firstMatch
    revealWorkflowResult(row, in: timeline); row.tap()
    assertCompleteFindingTitle("body:workflow-fixture-launch:0:0", timeline: timeline)
    assertCompactStatusGeometry()
    workflowProof("workflow-results-long-title-parent-accessibility")
    assertCompleteWorkflowFailure("workflow-fixture-rejected", timeline: timeline)
    workflowProof("workflow-results-rejected-parent-accessibility")
    for _ in 0..<8 where !tool.isHittable { timeline.swipeDown() }
    XCTAssertTrue(tool.isHittable); tool.tap()
    let open = app.buttons["native-e2e.workflow-open.workflow-fixture-launch"].firstMatch
    revealWorkflowResult(open, in: timeline); open.tap()
    let agent = app.descendants(matching: .any).matching(identifier: "native-e2e.workflow-agent.inspect-1").firstMatch
    XCTAssertTrue(agent.waitForExistence(timeout: 10)); agent.tap()
    XCTAssertTrue(app.staticTexts["Inspect agent full transcript"].waitForExistence(timeout: 10))
    openWorkflowAgentTools()
    let agentTimeline = app.collectionViews["native-e2e.workflow-agent-detail"].firstMatch
    let agentList = app.buttons["native-e2e.tool-body-list.body:agent-results:0"].firstMatch
    revealWorkflowResult(agentList, in: agentTimeline); agentList.tap()
    let agentRow = app.buttons["native-e2e.tool-body-row.body:agent-results:0:0"].firstMatch
    revealWorkflowResult(agentRow, in: agentTimeline); agentRow.tap()
    assertCompleteFindingTitle("body:agent-results:0:0", timeline: agentTimeline)
    workflowProof("workflow-results-long-title-agent-accessibility")
    assertCompleteWorkflowFailure("agent-rejected", timeline: agentTimeline)
    workflowProof("workflow-results-rejected-agent-accessibility")
    app.buttons["native-e2e.workflow-close"].firstMatch.tap()
  }

  private func revealWorkflowResult(_ element: XCUIElement, in timeline: XCUIElement) {
    for _ in 0..<8 where !element.isHittable { timeline.swipeUp() }
    XCTAssertTrue(element.waitForExistence(timeout: 5))
    XCTAssertTrue(element.isHittable)
  }

  private func assertCompleteFindingTitle(_ disclosureID: String, timeline: XCUIElement) {
    let title = app.staticTexts["native-e2e.tool-body-title.\(disclosureID)"].firstMatch
    XCTAssertTrue(title.waitForExistence(timeout: 5))
    let bar = app.navigationBars.firstMatch
    let menu = app.buttons["native-e2e.thread.actions"].firstMatch
    let headerBottom = bar.exists ? bar.frame.maxY : (menu.exists ? menu.frame.maxY : app.frame.minY + 140)
    let visibleTop = max(timeline.frame.minY, headerBottom) + 20
    for _ in 0..<8 {
      let top = title.frame.minY
      if top >= visibleTop - 24, top < timeline.frame.maxY - 44 { break }
      let distance = visibleTop - top
      let limit = min(220, timeline.frame.height * 0.28)
      let start = timeline.coordinate(withNormalizedOffset: .init(dx: 0.07, dy: 0.5))
      start.press(forDuration: 0.05, thenDragTo: start.withOffset(.init(dx: 0, dy: max(-limit, min(limit, distance)))))
    }
    XCTAssertGreaterThanOrEqual(title.frame.minY, visibleTop - 24)
    XCTAssertLessThan(title.frame.minY, timeline.frame.maxY - 44)
    XCTAssertEqual(title.label, "Keep the complete workflow finding title readable when the chat becomes narrow, text grows for accessibility, and the user rotates between portrait and landscape")
    XCTAssertGreaterThan(title.frame.height, 34, "The complete title must wrap instead of staying clipped to one line.")
  }

  private func assertCompleteWorkflowFailure(_ itemID: String, timeline: XCUIElement) {
    let tool = app.buttons["native-e2e.tool-details.\(itemID)"].firstMatch
    revealWorkflowResult(tool, in: timeline)
    XCTAssertTrue((tool.value as? String)?.contains("Error") == true)
    tool.tap()
    let result = app.textViews["native-e2e.tool-section.\(itemID).1"].firstMatch
    revealWorkflowResult(result, in: timeline)
    XCTAssertTrue((result.value as? String)?.contains("Workflow script validation failed. Keep the complete rejection reason available.") == true)
  }
}
