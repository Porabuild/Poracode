import XCTest

extension NativeFamilyJourneyUITests {
  func testCollapsedToolRowsKeepCompactSpacingAndUsableDisclosures() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey measures controlled transcript rows.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/tool-presentation-ready", method: "POST")
    try await pairUntilHome()
    openToolFixtureThread()
    let group = app.buttons["native-e2e.activity-group.tool-command"]
    XCTAssertTrue(group.waitForExistence(timeout: 10)); group.tap()
    let command = app.buttons["native-e2e.tool-details.tool-command"]
    let result = app.buttons["native-e2e.tool-details.tool-result"]
    let file = app.buttons["native-e2e.tool-details.tool-file"]
    XCTAssertTrue(command.waitForExistence(timeout: 5))
    XCTAssertTrue(result.exists); XCTAssertTrue(file.exists)
    for row in [command, result, file] {
      XCTAssertLessThanOrEqual(row.frame.height, 36)
      XCTAssertTrue(row.isHittable)
    }
    XCTAssertLessThanOrEqual(result.frame.midY - command.frame.midY, 36)
    XCTAssertLessThanOrEqual(file.frame.midY - result.frame.midY, 36)
    toolPresentationProof("tool-compact-collapsed-rows")
    result.tap()
    let body = app.textViews["native-e2e.tool-section.tool-result.1"]
    XCTAssertTrue(body.waitForExistence(timeout: 5))
    XCTAssertEqual(body.value as? String, "Complete finding: preserve both workspace panes. 東京 🧭")
    toolPresentationProof("tool-compact-expanded-result")
    result.tap()
    XCTAssertFalse(body.exists)
  }

  func testHostToolCatalogRendersCompleteLiveAndReopenedDetails() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses controlled canonical payloads and complete output.")
    let isPad = UIDevice.current.userInterfaceIdiom == .pad
    XCUIDevice.shared.orientation = isPad ? .landscapeLeft : .portrait
    app.launchArguments += ["-AppleInterfaceStyle", isPad ? "Dark" : "Light",
      "-ios.appearance.mode", isPad ? "dark" : "light"]
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/tool-presentation-ready", method: "POST")
    try await pairUntilHome()
    if isPad { try await assertSidebarActionsAligned("landscape") }
    openToolFixtureThread()
    let group = app.buttons["native-e2e.activity-group.tool-command"]
    XCTAssertTrue(group.waitForExistence(timeout: 10)); group.tap()

    let command = app.buttons["native-e2e.tool-details.tool-command"]
    XCTAssertTrue(command.waitForExistence(timeout: 5))
    let headingReady = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
      command.label.contains("View 5:12") && command.label.contains("App.tsx") && command.label.contains("1.2s")
    }, object: app)
    XCTAssertEqual(XCTWaiter.wait(for: [headingReady], timeout: 5), .completed,
      "Native command headings must use the same shell meaning as the PWA")
    XCTAssertTrue(group.label.contains("view"), "Collapsed group categories must include interpreted reads")
    command.tap()
    let output = app.textViews["native-e2e.tool-section.tool-command.1"]
    XCTAssertTrue(output.waitForExistence(timeout: 5))
    let complete = output.value as? String ?? ""
    XCTAssertTrue(complete.contains("END OF COMPLETE COMMAND OUTPUT"))
    XCTAssertGreaterThan(complete.utf16.count, 40_000)
    XCTAssertFalse(complete.contains("\u{001B}"))
    toolPresentationProof("tool-complete-command-output")
    XCTAssertLessThanOrEqual(command.frame.height, 60,
      "Accessibility must expose the header's touch bounds, not the complete tool body")
    if isPad {
      XCTAssertLessThanOrEqual(command.frame.height, 32, "Wide transcript activity rows should stay compact")
    } else {
      // The requested dense secondary disclosure row is 32pt. Primary
      // controls and accessibility-size rows retain their 44pt targets.
      let scale = UIScreen.main.scale
      XCTAssertGreaterThanOrEqual((command.frame.height * scale).rounded(), (32 * scale).rounded())
      XCTAssertLessThanOrEqual(command.frame.height, 36, "Phone tool rows must not reserve oversized blank gaps")
    }
    try await rotateIPadJourney(to: isPad ? .portrait : .landscapeLeft)
    scrollTranscript(up: true)
    scrollTranscript(up: false)
    XCTAssertTrue((output.value as? String ?? "").contains("END OF COMPLETE COMMAND OUTPUT"))
    tapVisibleToolHeader("native-e2e.tool-details.tool-command")
    let commandClosed = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in !output.exists }, object: app)
    XCTAssertEqual(XCTWaiter.wait(for: [commandClosed], timeout: 5), .completed)

    let result = app.buttons["native-e2e.tool-details.tool-result"]
    XCTAssertTrue(result.waitForExistence(timeout: 5))
    let mcpHeadingReady = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
      result.label.contains("workspace docs: search")
    }, object: app)
    XCTAssertEqual(XCTWaiter.wait(for: [mcpHeadingReady], timeout: 5), .completed,
      "Native MCP headings must use the PWA's readable server and tool labels")
    if isPad {
      let compactRows = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
        result.frame.midY - command.frame.midY <= 36
      }, object: app)
      XCTAssertEqual(XCTWaiter.wait(for: [compactRows], timeout: 5), .completed,
        "Consecutive collapsed tool calls should not add oversized gaps")
    }
    result.tap()
    let args = app.textViews["native-e2e.tool-section.tool-result.0"]
    XCTAssertTrue(args.waitForExistence(timeout: 5))
    XCTAssertTrue((args.value as? String ?? "").contains("\"enabled\": false"))
    let body = app.textViews["native-e2e.tool-section.tool-result.1"]
    XCTAssertTrue(body.waitForExistence(timeout: 5))
    XCTAssertEqual(body.value as? String, "Complete finding: preserve both workspace panes. 東京 🧭")
    if isPad {
      XCTAssertLessThanOrEqual(body.frame.height, 60, "A short result should fit its content")
      let surface = app.descendants(matching: .any).matching(identifier: "native-e2e.tool-section-container.tool-result.1").firstMatch
      XCTAssertTrue(surface.exists)
      XCTAssertLessThanOrEqual(surface.frame.height, 72, "The complete short-result surface must remain compact")
    }
    toolPresentationProof("tool-full-result-and-arguments")
    _ = try await control(path: "/v1/checkpoints/tool-presentation-live", method: "POST")
    try await waitForToolResult(body, text: "Live finding: all three layouts verified.")
    XCUIDevice.shared.orientation = isPad ? .landscapeLeft : .portrait
    try await waitForToolResult(body, text: "Live finding: all three layouts verified.")
    scrollTranscript(up: true)
    scrollTranscript(up: false)
    try await waitForToolResult(body, text: "Live finding: all three layouts verified.")
    toolPresentationProof("tool-live-result-retained")
    tapVisibleToolHeader("native-e2e.tool-details.tool-result")
    let collapsed = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in !body.exists }, object: app)
    XCTAssertEqual(XCTWaiter.wait(for: [collapsed], timeout: 5), .completed,
      "Tapping the visible header must collapse its result")

    let file = app.buttons["native-e2e.tool-details.tool-file"]
    XCTAssertTrue(file.waitForExistence(timeout: 5)); tapVisibleToolHeader("native-e2e.tool-details.tool-file")
    let diff = app.descendants(matching: .any).matching(identifier: "native-e2e.tool-section.tool-file.1").firstMatch
    XCTAssertTrue(diff.waitForExistence(timeout: 5))
    XCTAssertFalse(app.textViews["native-e2e.tool-section.tool-file.2"].exists,
      "The unified diff replaces redundant args/result code sections")
    toolPresentationProof("tool-native-unified-diff")

    app.terminate()
    app.launchArguments.removeAll { $0 == "-native-e2e-fresh-state" }
    app.launch()
    if !group.waitForExistence(timeout: 3) { openToolFixtureThread() }
    XCTAssertTrue(group.waitForExistence(timeout: 10)); group.tap()
    XCTAssertTrue(result.waitForExistence(timeout: 5)); result.tap()
    try await waitForToolResult(body, text: "Live finding: all three layouts verified.")
    toolPresentationProof("tool-details-reopened-from-history")
    XCUIDevice.shared.orientation = .portrait
    if isPad { try await assertSidebarActionsAligned("portrait") }
  }

  private func assertSidebarActionsAligned(_ layout: String) async throws {
    let filter = app.buttons["native-e2e.project-filter"].firstMatch
    let create = app.buttons["native-e2e.sidebar.new-thread"].firstMatch
    if !create.isHittable {
      let toggle = app.buttons["native-e2e.sidebar-toggle"].firstMatch
      XCTAssertTrue(toggle.waitForExistence(timeout: 10)); toggle.tap()
    }
    XCTAssertTrue(filter.waitForExistence(timeout: 5))
    XCTAssertTrue(create.waitForExistence(timeout: 5))
    let deadline = ContinuousClock.now.advanced(by: .seconds(5))
    while (!filter.isHittable || !create.isHittable), ContinuousClock.now < deadline {
      try await Task.sleep(for: .milliseconds(100))
    }
    XCTAssertTrue(filter.isHittable); XCTAssertTrue(create.isHittable)
    XCTAssertEqual(filter.frame.midX, create.frame.midX, accuracy: 0.5,
      "Sidebar actions must share a trailing column in \(layout)")
    toolPresentationProof("sidebar-aligned-\(layout)")
  }

  private func openToolFixtureThread() {
    let thread = app.buttons["native-e2e.thread.thread-fixture-001"].firstMatch
    if !thread.isHittable, app.buttons["native-e2e.sidebar-toggle"].exists { app.buttons["native-e2e.sidebar-toggle"].tap() }
    XCTAssertTrue(thread.waitForExistence(timeout: 10)); thread.tap()
  }

  private func waitForToolResult(_ body: XCUIElement, text: String) async throws {
    let deadline = ContinuousClock.now.advanced(by: .seconds(10))
    while (!body.exists || body.value as? String != text), ContinuousClock.now < deadline {
      try await Task.sleep(for: .milliseconds(100))
    }
    guard body.exists else { return XCTFail("The expanded tool body disappeared during layout adaptation") }
    XCTAssertEqual(body.value as? String, text)
  }

  private func tapVisibleToolHeader(_ identifier: String) {
    let candidates = app.buttons.matching(identifier: identifier)
    let timeline = app.descendants(matching: .any).matching(identifier: "native-e2e.timeline").firstMatch
    XCTAssertTrue(timeline.exists)
    for _ in 0..<4 {
      for button in candidates.allElementsBoundByIndex where button.isHittable {
        var visible = button.frame.intersection(timeline.frame).intersection(app.frame)
        let composer = app.buttons["native-e2e.composer-collapsed"].firstMatch
        if composer.exists { visible = visible.intersection(CGRect(
          x: app.frame.minX, y: timeline.frame.minY, width: app.frame.width,
          height: max(0, composer.frame.minY - timeline.frame.minY))) }
        if !visible.isNull, visible.height >= min(24, button.frame.height) {
          // A partially clipped SwiftUI button can report hittable while XCTest's
          // automatic scroll-to-visible loops in the lazy stack after rotation.
          // Tap the measured visible area, just as a finger does, without that route.
          button.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(
            dx: visible.midX - button.frame.minX, dy: visible.midY - button.frame.minY)).tap()
          return
        }
      }
      let header = candidates.firstMatch
      scrollTranscript(up: header.exists && header.frame.midY > timeline.frame.midY)
    }
    XCTFail("The open tool header could not be reached by scrolling the transcript")
  }

  private func scrollTranscript(up: Bool) {
    let timeline = app.descendants(matching: .any).matching(identifier: "native-e2e.timeline").firstMatch
    // Drag the transcript gutter so a long command's nested text scroller
    // does not consume the gesture. Derive x from content, keeping it inside
    // the phone's landscape safe area rather than its excluded screen edge.
    let header = app.buttons["native-e2e.tool-details.tool-command"]
    let bounds = timeline.frame.intersection(app.frame)
    let x = max(bounds.minX + 2, min(bounds.maxX - 2, header.frame.minX - 12))
    let origin = timeline.coordinate(withNormalizedOffset: .zero)
    let start = origin.withOffset(CGVector(dx: x - timeline.frame.minX,
      dy: bounds.minY - timeline.frame.minY + bounds.height * (up ? 0.7 : 0.3)))
    let end = origin.withOffset(CGVector(dx: x - timeline.frame.minX,
      dy: bounds.minY - timeline.frame.minY + bounds.height * (up ? 0.3 : 0.7)))
    start.press(forDuration: 0.05, thenDragTo: end)
  }

  private func toolPresentationProof(_ name: String) {
    let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    proof.name = name; proof.lifetime = .keepAlways; add(proof)
  }
}
