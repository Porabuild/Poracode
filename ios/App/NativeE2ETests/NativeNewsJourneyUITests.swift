import UIKit
import XCTest

extension NativeFamilyJourneyUITests {
  func testHomePromotionFollowsTheCompactThreadList() async throws {
    try XCTSkipIf(UIDevice.current.userInterfaceIdiom == .pad, "This placement belongs to compact Home.")
    try await prepareNewsJourney()

    let composer = app.buttons["native-e2e.new-thread"]
    let thread = app.buttons["native-e2e.thread.thread-fixture-001"]
    let controls = app.buttons["native-e2e.news.controls"]
    try await poll { composer.isHittable && thread.isHittable && controls.isHittable }
    selectNewsControl("Pause news")
    let promotion = try findNewsItem(prefix: "native-e2e.news.item.promotion:github-star")
    XCTAssertEqual(app.buttons.matching(identifier: "native-e2e.news.controls").count, 1)
    for element in [promotion, controls] {
      XCTAssertGreaterThanOrEqual(element.frame.minY, thread.frame.maxY)
      XCTAssertLessThanOrEqual(element.frame.maxY, composer.frame.minY)
    }
    newsProof("compact-list-footer")
  }

  func testNewsReleaseDetailsKeepNavigationAtTheBottom() async throws {
    try await prepareNewsJourney()
    openNewsDraft()
    let prompt = app.textViews["native-e2e.new-thread-prompt"]
    prompt.tap(); prompt.typeText("Keep the release-note draft")
    selectNewsControl("Pause news")
    let highlight = try findNewsItem(prefix: "native-e2e.news.item.changelog:")
    highlight.tap()
    let text = app.staticTexts["native-e2e.news.highlight-text"]
    XCTAssertTrue(text.waitForExistence(timeout: 10))
    try await poll { !self.app.keyboards.firstMatch.exists }
    let next = app.buttons["native-e2e.news.highlight.next"]
    XCTAssertTrue(next.waitForExistence(timeout: 5))
    newsProof("release-placement-before-assert")
    let layout = XCTAttachment(string: app.debugDescription)
    layout.name = "news-release-layout"; layout.lifetime = .keepAlways; add(layout)
    let viewport = app.collectionViews.containing(.staticText, identifier: "native-e2e.news.highlight-text").firstMatch
    XCTAssertTrue(viewport.waitForExistence(timeout: 5))
    XCTAssertTrue(viewport.frame.contains(text.frame), "The full release text must be inside the visible list viewport")
    XCTAssertGreaterThanOrEqual(next.frame.minY, text.frame.maxY, "Release navigation belongs below the release point")
    let initial = text.label
    next.tap()
    try await poll { text.label != initial }
    newsProof("release-bottom-controls")
    app.navigationBars["News"].buttons["Close"].tap()
    XCTAssertTrue((prompt.value as? String)?.contains("Keep the release-note draft") == true)
    finishNewsJourney()
  }

  func testNewsShowsHostFactsReleaseDetailsAndRetainsTheNewThreadDraft() async throws {
    try await prepareNewsJourney()
    openNewsDraft()
    let prompt = app.textViews["native-e2e.new-thread-prompt"]
    selectNewsControl("Pause news")
    let initial = try findNewsItem(prefix: "native-e2e.news.item.usage:")
    let initialID = initial.identifier
    prompt.tap(); prompt.typeText("Keep this native news draft")
    let controls = app.buttons["native-e2e.news.controls"]
    XCTAssertTrue(controls.waitForExistence(timeout: 15))
    // AX subtracts fractional screen coordinates (44 can become
    // 43.99999999999994). Remove sub-nanopoint export noise, keeping 44pt.
    let precision: CGFloat = 1_000_000_000
    XCTAssertGreaterThanOrEqual((controls.frame.width * precision).rounded() / precision, 44)
    XCTAssertGreaterThanOrEqual((controls.frame.height * precision).rounded() / precision, 44)
    selectNewsControl("Resume news")
    prompt.tap()
    try await poll(timeout: .seconds(27)) {
      let current = self.app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "native-e2e.news.item.")).firstMatch
      return current.exists && current.identifier != initialID
    }
    XCTAssertTrue(app.keyboards.firstMatch.exists, "Idle prompt focus must not pause news rotation indefinitely")
    selectNewsControl("Pause news")
    let streak = try findNewsItem(prefix: "native-e2e.news.item.insight:streak")
    XCTAssertTrue(streak.label.contains("4"))
    newsProof("host-streak-and-draft")

    if UIDevice.current.userInterfaceIdiom == .pad {
      XCUIDevice.shared.orientation = .portrait
      try await poll { self.app.frame.height > self.app.frame.width }
      XCTAssertTrue(app.buttons["native-e2e.news.item.insight:streak"].waitForExistence(timeout: 10))
      XCTAssertTrue((prompt.value as? String)?.contains("Keep this native news draft") == true)
      XCUIDevice.shared.orientation = .landscapeLeft
      try await poll { self.app.frame.width > self.app.frame.height }
    }

    streak.tap()
    XCTAssertTrue(app.navigationBars["Profile"].waitForExistence(timeout: 10))
    app.buttons["native-e2e.settings.close"].tap()
    openNewsDraft()
    XCTAssertTrue((prompt.value as? String)?.contains("Keep this native news draft") == true)
    let highlight = try findNewsItem(prefix: "native-e2e.news.item.changelog:")
    highlight.tap()
    let full = app.staticTexts["native-e2e.news.highlight-text"]
    XCTAssertTrue(full.waitForExistence(timeout: 10))
    try await poll { !self.app.keyboards.firstMatch.exists }
    XCTAssertFalse(full.label.isEmpty)
    XCTAssertTrue(app.staticTexts["native-e2e.news.highlight-position"].label.contains("Point"))
    let nextPoint = app.buttons["native-e2e.news.highlight.next"]
    XCTAssertTrue(nextPoint.waitForExistence(timeout: 5))
    XCTAssertGreaterThanOrEqual(nextPoint.frame.minY, full.frame.maxY, "Release navigation belongs below the release point")
    newsProof("expanded-release-point")
    app.navigationBars["News"].buttons["Close"].tap()
    let remote = try findNewsItem(prefix: "native-e2e.news.item.remote:native-public-update")
    XCTAssertTrue(remote.label.contains("Native public update"))
    newsProof("validated-public-update")
    let crossagents = try findNewsItem(prefix: "native-e2e.news.item.remote:native-crossagents")
    crossagents.tap()
    XCTAssertTrue(app.switches["native-e2e.composer-plugin.crossagents"].waitForExistence(timeout: 10))
    newsProof("crossagents-plugin-action")
    app.navigationBars["Plugins"].buttons["Done"].tap()
    finishNewsJourney()
  }

  func testNewsSettingsHidePersonalItemsAndPersistAcrossRelaunch() async throws {
    try await prepareNewsJourney()
    try openNativeSettings()
    app.buttons["native-e2e.settings.general"].tap()
    let enabled = app.switches["native-e2e.news.enabled"]
    let activity = app.switches["native-e2e.news.activity"]
    revealNewsSetting(enabled)
    XCTAssertEqual(enabled.value as? String, "1")
    revealNewsSetting(activity)
    activity.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
    try await poll { activity.value as? String == "0" }
    enabled.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
    try await poll { enabled.value as? String == "0" }
    XCTAssertFalse(activity.exists)
    newsProof("general-news-disabled")
    closeNewsGeneral()
    openNewsDraft()
    XCTAssertFalse(app.buttons["native-e2e.news.controls"].exists)
    app.buttons["native-e2e.new-thread-close"].tap()

    app.terminate()
    app.launchArguments.removeAll { $0 == "-native-e2e-news-fresh-state" }
    XCUIDevice.shared.orientation = .portrait
    try await pairUntilHome()
    try openNativeSettings()
    app.buttons["native-e2e.settings.general"].tap()
    revealNewsSetting(enabled)
    XCTAssertEqual(enabled.value as? String, "0")
    enabled.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
    try await poll { activity.exists }
    XCTAssertEqual(activity.value as? String, "0")
    newsProof("retained-news-preferences")
    closeNewsGeneral()
    openNewsDraft()
    selectNewsControl("Pause news")
    for _ in 0..<15 {
      let personal = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ OR identifier BEGINSWITH %@",
        "native-e2e.news.item.insight:", "native-e2e.news.item.usage:")).firstMatch
      XCTAssertFalse(personal.exists)
      selectNewsControl("Next")
    }
    newsProof("activity-filtered-carousel")
    finishNewsJourney()
  }

  private func prepareNewsJourney() async throws {
    let env = ProcessInfo.processInfo.environment
    try XCTSkipIf(env["NATIVE_E2E_PEER_MODE"] == "real", "This journey uses controlled public news and host profile facts.")
    app.launchArguments.append("-native-e2e-news-fresh-state")
    if let style = env["NATIVE_E2E_INTERFACE_STYLE"] {
      app.launchArguments += ["-AppleInterfaceStyle", style, "-ios.appearance.mode", style.lowercased()]
    }
    let origin = try XCTUnwrap(env["NATIVE_E2E_CONTROL_URL"])
    for (key, path) in [("NATIVE_E2E_NEWS_URL", "/v1/fixtures/news.json"), ("NATIVE_E2E_CHANGELOG_URL", "/v1/fixtures/changelog.json")] {
      app.launchEnvironment[key] = try XCTUnwrap(URL(string: path, relativeTo: URL(string: origin))).absoluteString
    }
    _ = try await control(path: "/v1/checkpoints/news-ready", method: "POST")
    _ = try await control(path: "/v1/checkpoints/changelog-good", method: "POST")
    XCUIDevice.shared.orientation = .portrait
    try await pairUntilHome()
    if UIDevice.current.userInterfaceIdiom == .pad {
      XCUIDevice.shared.orientation = .landscapeLeft
      try await poll { self.app.frame.width > self.app.frame.height }
    }
  }

  private func openNewsDraft() {
    let buttons = app.buttons.matching(NSPredicate(format: "identifier IN %@", ["native-e2e.split-empty-new-task", "native-e2e.split-new-thread", "native-e2e.new-thread", "native-e2e.sidebar.new-thread"]))
    guard let button = buttons.allElementsBoundByIndex.first(where: { $0.isHittable }) else { return XCTFail("Missing native new-thread action") }
    button.tap()
    XCTAssertTrue(app.textViews["native-e2e.new-thread-prompt"].waitForExistence(timeout: 10))
  }

  private func selectNewsControl(_ label: String) {
    let control = app.buttons["native-e2e.news.controls"]
    XCTAssertTrue(control.waitForExistence(timeout: 10)); control.tap()
    let action = app.buttons[label].firstMatch
    XCTAssertTrue(action.waitForExistence(timeout: 5)); action.tap()
  }

  private func findNewsItem(prefix: String) throws -> XCUIElement {
    var seen: [String] = []
    for _ in 0..<20 {
      seen += app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "native-e2e.news.item.")).allElementsBoundByIndex.map {
        "\($0.identifier) [\($0.elementType)]"
      }
      let item = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", prefix)).firstMatch
      if item.exists { return item }
      selectNewsControl("Next")
    }
    XCTFail("Requested news item \(prefix) was not in the carousel; saw \(Set(seen).sorted())")
    return app.buttons.matching(identifier: prefix).firstMatch
  }

  private func revealNewsSetting(_ element: XCUIElement) {
    for _ in 0..<5 { if element.exists && element.isHittable { break }; app.swipeUp() }
    XCTAssertTrue(element.isHittable)
  }

  private func closeNewsGeneral() {
    app.navigationBars["General"].buttons["Settings"].tap()
    app.navigationBars["Settings"].buttons["More"].tap()
    app.buttons["native-e2e.more.close"].tap()
  }

  private func finishNewsJourney() {
    app.terminate()
    app.launchArguments.append("-native-e2e-news-fresh-state")
    app.launch()
  }

  private func newsProof(_ name: String) {
    let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    attachment.name = "news-\(name)"; attachment.lifetime = .keepAlways; add(attachment)
  }
}
