import XCTest

extension NativeFamilyJourneyUITests {
  func testWorkflowViewerLearnsALateReferenceAndOpensFromTheWorkflowRoster() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses controlled workflow reference delivery.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/workflow-viewer-waiting", method: "POST")
    try await pairUntilHome()
    let thread = app.buttons["native-e2e.thread.thread-fixture-001"].firstMatch
    if !thread.isHittable, app.buttons["native-e2e.sidebar-toggle"].exists { app.buttons["native-e2e.sidebar-toggle"].tap() }
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
    let tool = app.buttons["native-e2e.tool-details.workflow-fixture-launch"].firstMatch
    XCTAssertTrue(tool.waitForExistence(timeout: 10)); tool.tap()
    let open = app.buttons["native-e2e.workflow-open.workflow-fixture-launch"].firstMatch
    XCTAssertTrue(open.waitForExistence(timeout: 5)); open.tap()
    XCTAssertTrue(app.staticTexts["Waiting for workflow agents"].waitForExistence(timeout: 10))
    _ = try await control(path: "/v1/checkpoints/workflow-reference-ready", method: "POST")
    let agent = app.descendants(matching: .any).matching(identifier: "native-e2e.workflow-agent.inspect-1").firstMatch
    XCTAssertTrue(agent.waitForExistence(timeout: 10))
    workflowProof("workflow-viewer-late-reference")
    app.buttons["native-e2e.workflow-close"].firstMatch.tap()
    let roster = app.buttons["native-e2e.info-control.delegated-agents:workflow"].firstMatch
    XCTAssertTrue(roster.waitForExistence(timeout: 10)); roster.tap()
    let run = app.buttons["native-e2e.workflow-roster-open.workflow-fixture-launch"].firstMatch
    XCTAssertTrue(run.waitForExistence(timeout: 5)); run.tap()
    XCTAssertTrue(agent.waitForExistence(timeout: 10))
    workflowProof("workflow-viewer-roster-navigation")
    app.buttons["native-e2e.workflow-close"].firstMatch.tap()
  }

  func testWorkflowViewerPreservesAgentSelectionAndStreamsItsCompleteTranscriptAcrossRotation() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses the controlled workflow manifest and agent transcript.")
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
    let tool = app.buttons["native-e2e.tool-details.workflow-fixture-launch"].firstMatch
    XCTAssertTrue(tool.waitForExistence(timeout: 10)); tool.tap()
    let open = app.buttons["native-e2e.workflow-open.workflow-fixture-launch"].firstMatch
    XCTAssertTrue(open.waitForExistence(timeout: 5)); open.tap()
    let inspect = app.buttons["native-e2e.workflow-agent.inspect-1"].firstMatch
    let inspectLink = app.descendants(matching: .any).matching(identifier: "native-e2e.workflow-agent.inspect-1").firstMatch
    XCTAssertTrue(inspectLink.waitForExistence(timeout: 10)); (inspect.exists ? inspect : inspectLink).tap()
    XCTAssertTrue(app.staticTexts["Inspect agent full transcript"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["Review the complete workspace"].exists)
    openWorkflowAgentTools()
    let inspectCommand = app.buttons["native-e2e.tool-details.agent-command"].firstMatch
    XCTAssertTrue(inspectCommand.waitForExistence(timeout: 5)); inspectCommand.tap()
    let inspectOutput = app.textViews["native-e2e.tool-section.agent-command.1"]
    XCTAssertTrue(inspectOutput.waitForExistence(timeout: 5))
    XCTAssertEqual(inspectOutput.value as? String, "Workspace checks passed\n")
    workflowProof("workflow-viewer-agent-portrait")
    XCUIDevice.shared.orientation = .landscapeLeft
    XCTAssertTrue(app.navigationBars["source"].waitForExistence(timeout: 5))
    XCTAssertEqual(inspectOutput.value as? String, "Workspace checks passed\n")
    let reply = app.staticTexts["Inspect agent full transcript"]
    let agentTimeline = app.collectionViews["native-e2e.workflow-agent-detail"]
    for _ in 0..<3 where !reply.exists { agentTimeline.swipeUp() }
    XCTAssertTrue(reply.waitForExistence(timeout: 5))
    workflowProof("workflow-viewer-agent-landscape")
    let phase = app.descendants(matching: .any).matching(identifier: "native-e2e.workflow-phase").firstMatch
    if !phase.isHittable {
      let back = app.navigationBars.buttons["Workflow"].firstMatch
      XCTAssertTrue(back.waitForExistence(timeout: 5)); back.tap()
    }
    XCTAssertTrue(phase.waitForExistence(timeout: 5)); phase.tap()
    let verifyPhase = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Verify")).firstMatch
    XCTAssertTrue(verifyPhase.waitForExistence(timeout: 5)); verifyPhase.tap()
    let verify = app.descendants(matching: .any).matching(identifier: "native-e2e.workflow-agent.verify-1").firstMatch
    XCTAssertTrue(verify.waitForExistence(timeout: 5)); verify.tap()
    XCTAssertTrue(app.staticTexts["Verify agent is checking the workspace"].waitForExistence(timeout: 10))
    _ = try await control(path: "/v1/checkpoints/workflow-liveness-completed", method: "POST")
    XCTAssertTrue(app.staticTexts["Verify agent completed"].waitForExistence(timeout: 10))
    workflowProof("workflow-viewer-manifest-completed")
    openWorkflowAgentTools()
    let command = app.buttons["native-e2e.tool-details.agent-command"].firstMatch
    XCTAssertTrue(command.waitForExistence(timeout: 5)); command.tap()
    let output = app.textViews["native-e2e.tool-section.agent-command.1"]
    XCTAssertTrue(output.waitForExistence(timeout: 5))
    XCTAssertEqual(output.value as? String, "Workspace checks passed\n")
    workflowProof("workflow-viewer-complete-tool-output")
    command.tap()
    let mcp = app.buttons["native-e2e.tool-details.agent-mcp"].firstMatch
    XCTAssertTrue(mcp.waitForExistence(timeout: 5)); mcp.tap()
    let mcpResult = app.textViews["native-e2e.tool-section.agent-mcp.1"]
    XCTAssertTrue(mcpResult.waitForExistence(timeout: 5)); XCTAssertEqual(mcpResult.value as? String, "Full MCP result")
    workflowProof("workflow-viewer-transient-mcp-result")
    app.buttons["native-e2e.workflow-close"].firstMatch.tap()
    XCTAssertTrue(tool.waitForExistence(timeout: 5))
    XCUIDevice.shared.orientation = .portrait
  }

  func testWorkflowManifestKeepsSettledThreadActiveAndEndsWithoutAnotherChatEvent() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses the controlled canonical workflow manifest.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/workflow-liveness-ready", method: "POST")
    try await pairUntilHome()
    let thread = app.buttons["native-e2e.thread.thread-fixture-001"].firstMatch
    if !thread.isHittable, app.buttons["native-e2e.sidebar-toggle"].exists {
      app.buttons["native-e2e.sidebar-toggle"].tap()
    }
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
    let status = app.buttons["native-e2e.thread-status"].firstMatch
    let workflow = app.buttons["native-e2e.info-control.delegated-agents:workflow"].firstMatch
    try await waitForWorkflow {
      status.exists && (status.value as? String)?.contains("Waiting for background tasks") == true && workflow.exists
    }
    XCTAssertEqual(workflow.value as? String, "1")
    workflow.tap()
    XCTAssertTrue(app.staticTexts["Verify the workspace in the background"].waitForExistence(timeout: 5))
    workflowProof("workflow-active-details")
    app.buttons["Done"].firstMatch.tap()
    XCUIDevice.shared.orientation = .landscapeLeft
    try await waitForWorkflow { workflow.exists && workflow.isHittable }
    workflowProof("workflow-active-landscape")
    _ = try await control(path: "/v1/checkpoints/workflow-liveness-completed", method: "POST")
    try await waitForWorkflow {
      status.exists && (status.value as? String)?.contains("Finished") == true && !workflow.exists
    }
    XCTAssertFalse(app.buttons["native-e2e.interrupt"].exists, "A presentation tracker must not invent a foreground runtime")
    workflowProof("workflow-terminal-without-chat-event")
    XCUIDevice.shared.orientation = .portrait
  }

  func testWorkflowKeepsPollingAfterLeavingTheTranscript() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses the controlled workflow read fixture.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/workflow-liveness-ready", method: "POST")
    try await pairUntilHome()
    let thread = app.buttons["native-e2e.thread.thread-fixture-001"].firstMatch
    if !thread.isHittable, app.buttons["native-e2e.sidebar-toggle"].exists {
      app.buttons["native-e2e.sidebar-toggle"].tap()
    }
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
    let status = app.buttons["native-e2e.thread-status"].firstMatch
    try await waitForWorkflow { status.exists && (status.value as? String)?.contains("Waiting for background tasks") == true }
    let back = app.navigationBars.buttons["Back"].firstMatch
    // iOS can label the native back button with the previous page's title.
    // Select its leading navigation position on compact layouts as well.
    let compactBack = app.frame.width < 600 ? app.navigationBars.buttons.allElementsBoundByIndex.first {
      $0.exists && $0.isHittable && $0.frame.minX < app.frame.width * 0.15
        && $0.identifier != "native-e2e.sidebar-toggle" && $0.identifier != "native-e2e.thread-status"
    } : nil
    if let compactBack { compactBack.tap() }
    else if back.exists && back.isHittable {
      back.tap()
    } else {
      let sidebar = app.buttons["native-e2e.sidebar-toggle"]
      if !thread.isHittable, sidebar.exists { sidebar.tap() }
      XCTAssertTrue(thread.isHittable); thread.press(forDuration: 1)
      let project = app.buttons.matching(NSPredicate(format: "label IN %@", ["Project", "Open project"])).firstMatch
      XCTAssertTrue(project.waitForExistence(timeout: 5)); project.tap()
    }
    try await waitForWorkflow { !status.exists && thread.exists && (thread.value as? String)?.contains("Working") == true }
    workflowProof("workflow-sidebar-after-navigation")
    _ = try await control(path: "/v1/checkpoints/workflow-liveness-failed", method: "POST")
    try await waitForWorkflow { thread.exists && (thread.value as? String)?.contains("Finished") == true }
    workflowProof("workflow-sidebar-after-manifest-failure")
  }

  private func waitForWorkflow(_ condition: @escaping @MainActor () -> Bool) async throws {
    let deadline = ContinuousClock.now.advanced(by: .seconds(10))
    while !condition(), ContinuousClock.now < deadline { try await Task.sleep(for: .milliseconds(100)) }
    XCTAssertTrue(condition(), "The native workflow presentation did not reach the expected manifest state")
  }

  func workflowProof(_ name: String) {
    let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    proof.name = name; proof.lifetime = .keepAlways; add(proof)
  }

  func openWorkflowAgentTools() {
    let group = app.buttons["native-e2e.activity-group.agent-command"].firstMatch
    XCTAssertTrue(group.waitForExistence(timeout: 5))
    XCTAssertTrue(group.label.contains("view"), "The shared interpreted heading must classify the file read")
    XCTAssertTrue(group.label.contains("MCP"))
    group.tap()
    let command = app.buttons["native-e2e.tool-details.agent-command"].firstMatch
    XCTAssertTrue(command.waitForExistence(timeout: 5))
    XCTAssertTrue(command.label.contains("View 5:12")); XCTAssertTrue(command.label.contains("App.tsx"))
    let mcp = app.buttons["native-e2e.tool-details.agent-mcp"].firstMatch
    XCTAssertTrue(mcp.waitForExistence(timeout: 5)); XCTAssertTrue(mcp.label.contains("workspace docs: search"))
  }
}
