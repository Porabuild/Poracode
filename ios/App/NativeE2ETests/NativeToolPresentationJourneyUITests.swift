import XCTest

extension NativeFamilyJourneyUITests {
  func testSameFileEditsCombineAndFindRevealsInterleavedReasoning() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses controlled edits.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/tool-same-file-edits-ready", method: "POST")
    try await pairUntilHome()
    openToolFixtureThread()
    let group = app.buttons["native-e2e.activity-group.same-file-first"].firstMatch
    let run = app.buttons["native-e2e.edit-run.same-file-first"].firstMatch
    let other = app.buttons["native-e2e.tool-details.separate-file-edit"].firstMatch
    let patch = app.descendants(matching: .any)["native-e2e.edit-run-diff.same-file-first"].firstMatch
    XCTAssertTrue(group.waitForExistence(timeout: 10))
    group.tap()
    XCTAssertTrue(run.waitForExistence(timeout: 5))
    XCTAssertTrue(run.label.contains("2 edits"))
    XCTAssertTrue(run.label.contains("src/layout.ts"))
    XCTAssertTrue(other.exists)
    run.tap()
    XCTAssertTrue(patch.waitForExistence(timeout: 5))
    XCTAssertTrue(patch.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "keep focus")).firstMatch.exists)
    XCTAssertTrue(patch.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "keep footer")).firstMatch.exists)
    toolPresentationProof("same-file-edit-patch")
    try await assertNativeDuoDisplayTransitions("same-file-edit-patch", content: patch, availableAction: nil) { _ in
      try await self.poll { run.exists && patch.exists && other.exists }
    }
    try await poll { run.isHittable }
    run.tap()
    try await poll { group.isHittable && !patch.exists }
    group.tap()
    for openBeforeFind in [false, true] {
      if openBeforeFind {
        group.tap()
        XCTAssertTrue(run.waitForExistence(timeout: 5))
        run.tap()
        XCTAssertTrue(patch.waitForExistence(timeout: 5))
      }
      app.buttons["native-e2e.thread.actions"].firstMatch.tap()
      app.buttons["Find in chat"].firstMatch.tap()
      let query = app.textFields["native-e2e.chat-find-query"]
      XCTAssertTrue(query.waitForExistence(timeout: 5))
      if query.value as? String != "Interleaved review note" { query.typeText("Interleaved review note") }
      try await poll {
        self.app.staticTexts["native-e2e.chat-find-count"].label == "1 of 1"
          && self.app.staticTexts["Interleaved review note."].firstMatch.isHittable
      }
      toolPresentationProof(openBeforeFind ? "same-file-open-reasoning-find" : "same-file-reasoning-find")
      app.buttons["native-e2e.chat-find-close"].tap()
      try await poll { group.exists && run.exists == openBeforeFind && patch.exists == openBeforeFind }
    }
  }

  func testToolPatchShowsEachFileAndRetainsItAcrossDisplays() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses a controlled multi-file patch.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/tool-multi-file-patch-ready", method: "POST")
    try await pairUntilHome()
    openToolFixtureThread()
    let group = app.buttons["native-e2e.activity-group.tool-command"].firstMatch
    XCTAssertTrue(group.waitForExistence(timeout: 10))
    group.tap()
    let file = app.buttons["native-e2e.tool-details.tool-file"].firstMatch
    XCTAssertTrue(file.waitForExistence(timeout: 5))
    tapVisibleToolHeader("native-e2e.tool-details.tool-file")
    let diff = app.descendants(matching: .any)["native-e2e.tool-section.tool-file.1"].firstMatch
    let first = diff.staticTexts["native-e2e.diff-file.0"].firstMatch
    let second = diff.staticTexts["native-e2e.diff-file.1"].firstMatch
    XCTAssertTrue(first.waitForExistence(timeout: 5))
    XCTAssertEqual(first.label, "src/layout.ts")
    XCTAssertTrue(second.waitForExistence(timeout: 5))
    XCTAssertEqual(second.label, "docs/layout.md")
    let change = diff.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Second file review")).firstMatch
    if !change.isHittable { diff.swipeUp() }
    try await poll { second.isHittable && change.isHittable }
    toolPresentationProof("multi-file-tool-patch")
    try await assertNativeDuoDisplayTransitions("multi-file-tool-patch", content: diff, availableAction: nil) { pose in
      XCTAssertEqual(first.label, "src/layout.ts", pose)
      XCTAssertEqual(second.label, "docs/layout.md", pose)
    }
  }

  func testLongToolActivityShowsRecentCallsAndRevealsEarlierHistory() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses controlled live transcript events.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/tool-presentation-ready", method: "POST")
    try await pairUntilHome()
    openToolFixtureThread()
    XCTAssertTrue(app.staticTexts["Tool presentation review is ready."].waitForExistence(timeout: 10))
    _ = try await control(path: "/v1/checkpoints/tool-activity-burst", method: "POST")

    let group = app.buttons["native-e2e.activity-group.burst-reasoning"].firstMatch
    let reveal = app.buttons["native-e2e.activity-reveal.burst-reasoning"].firstMatch
    let oldest = app.buttons["native-e2e.tool-details.burst-command-1"].firstMatch
    let third = app.buttons["native-e2e.tool-details.burst-command-3"].firstMatch
    let sixth = app.buttons["native-e2e.tool-details.burst-command-6"].firstMatch
    let seventh = app.buttons["native-e2e.tool-details.burst-command-7"].firstMatch
    let newest = app.buttons["native-e2e.tool-details.burst-command-10"].firstMatch
    XCTAssertTrue(reveal.waitForExistence(timeout: 10))
    let usesShortViewport = ProcessInfo.processInfo.environment["NATIVE_E2E_EXPECT_VERTICAL_TOOLBAR"] == "1"
    try await poll { third.exists != usesShortViewport && seventh.exists && newest.exists }
    toolPresentationProof("activity-window-latest")
    XCTAssertEqual(third.exists, !usesShortViewport)
    XCTAssertEqual(sixth.exists, !usesShortViewport)
    XCTAssertTrue(seventh.exists)
    XCTAssertTrue(newest.exists)
    XCTAssertFalse(oldest.exists)

    reveal.tap()
    try await poll { reveal.label == "Show less" && oldest.exists }
    toolPresentationProof("activity-window-show-all")
    try await assertNativeDuoDisplayTransitions("activity-window", content: reveal, availableAction: nil) { _ in
      XCTAssertEqual(reveal.label, "Show less")
      XCTAssertTrue(oldest.exists)
    }
    try await poll { reveal.isHittable }
    reveal.tap()
    try await poll { !oldest.exists && reveal.label == "Show all" }
    _ = try await control(path: "/v1/checkpoints/tool-activity-append", method: "POST")
    XCTAssertTrue(app.buttons["native-e2e.tool-details.activity-append"].waitForExistence(timeout: 5))
    XCTAssertFalse(third.exists)
    if usesShortViewport { XCTAssertFalse(seventh.exists) }
    _ = try await control(path: "/v1/checkpoints/tool-activity-burst-finish", method: "POST")
    XCTAssertTrue(app.staticTexts["The activity review is complete."].waitForExistence(timeout: 8))
    try await poll { !reveal.exists && group.exists }
    group.tap()
    XCTAssertTrue(reveal.waitForExistence(timeout: 5))
    XCTAssertFalse(oldest.exists)

    app.buttons["native-e2e.thread.actions"].firstMatch.tap()
    app.buttons["Find in chat"].firstMatch.tap()
    let field = app.textFields["native-e2e.chat-find-query"]
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    field.typeText("Earliest audit detail")
    let count = app.staticTexts["native-e2e.chat-find-count"]
    try await poll { count.label == "1 of 1" && oldest.exists }
    XCTAssertTrue(app.staticTexts["Earliest audit detail before the command sequence."].firstMatch.isHittable)
    XCTAssertFalse(newest.exists)
    toolPresentationProof("activity-window-find-earlier")
    app.buttons["native-e2e.chat-find-close"].tap()
    try await poll { reveal.exists && !oldest.exists }
  }

  func testLiveToolGroupTracksTheTailAndPreservesManualCollapse() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses controlled live transcript events.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/tool-presentation-ready", method: "POST")
    try await pairUntilHome()
    openToolFixtureThread()
    XCTAssertTrue(app.staticTexts["Tool presentation review is ready."].waitForExistence(timeout: 10))
    let history = app.buttons["native-e2e.activity-group.tool-command"].firstMatch
    XCTAssertTrue(history.exists)
    XCTAssertFalse(app.buttons["native-e2e.tool-details.tool-command"].exists)

    _ = try await control(path: "/v1/checkpoints/tool-activity-start", method: "POST")
    let live = app.buttons["native-e2e.activity-group.activity-read"].firstMatch
    let search = app.buttons["native-e2e.tool-details.activity-search"].firstMatch
    XCTAssertTrue(live.waitForExistence(timeout: 8))
    XCTAssertTrue(search.waitForExistence(timeout: 4), "The live tool group should open automatically")
    toolPresentationProof("activity-live-open")
    live.tap()
    try await poll { !search.exists }
    _ = try await control(path: "/v1/checkpoints/tool-activity-append", method: "POST")
    try await poll { live.label.contains("2") }
    XCTAssertFalse(search.exists)
    try await assertNativeDuoDisplayTransitions("activity-collapsed", content: live, availableAction: nil) { _ in
      XCTAssertFalse(search.exists)
    }
    live.tap()
    XCTAssertTrue(search.waitForExistence(timeout: 5))
    _ = try await control(path: "/v1/checkpoints/tool-activity-finish", method: "POST")
    XCTAssertTrue(app.staticTexts["The activity review is complete."].waitForExistence(timeout: 8))
    try await poll { !search.exists }
    toolPresentationProof("activity-history-collapsed")
    live.tap()
    XCTAssertTrue(search.waitForExistence(timeout: 5))
    search.tap()
    XCTAssertEqual(search.value as? String, "Expanded")
    toolPresentationProof("activity-history-reopened")
  }

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

  func testToolDisclosureAppearsWhenTheLiveResultArrives() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey stages a tool result on a fixture desktop.")
    applyFixtureAppearance()
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/tool-disclosure-ready", method: "POST")
    try await pairUntilHome()
    openToolFixtureThread()
    let group = app.buttons["native-e2e.activity-group.tool-command"].firstMatch
    XCTAssertTrue(group.waitForExistence(timeout: 10)); group.tap()
    let result = app.buttons["native-e2e.tool-details.tool-result"].firstMatch
    let body = app.textViews["native-e2e.tool-section.tool-result.1"].firstMatch
    let information = app.descendants(matching: .any).matching(identifier: "native-e2e.tool-details.tool-result").firstMatch
    XCTAssertTrue(information.waitForExistence(timeout: 5))
    XCTAssertTrue(information.label.contains("search"))
    XCTAssertFalse(result.exists)
    XCTAssertFalse(body.exists)
    toolPresentationProof("tool-row-without-details")

    _ = try await control(path: "/v1/checkpoints/tool-presentation-live", method: "POST")
    try await poll { result.exists && result.isEnabled }
    XCTAssertEqual(result.value as? String, "Collapsed")
    tapVisibleToolHeader("native-e2e.tool-details.tool-result")
    let output = "Live finding: all three layouts verified."
    try await waitForToolResult(body, text: output)
    try await assertNativeDuoDisplayTransitions("tool-disclosure", content: body, availableAction: nil) { pose in
      XCTAssertEqual(body.value as? String, output, pose)
    }
    toolPresentationProof("tool-row-with-live-details")
    tapVisibleToolHeader("native-e2e.tool-details.tool-result")
    try await poll { !body.exists && result.isEnabled }
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
