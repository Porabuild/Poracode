import UIKit
import XCTest

extension NativeFamilyJourneyUITests {
  func testChangelogRefreshSurvivesNavigationAndSavedNotesRemainOfflineAfterRelaunch() async throws {
    try configureChangelogJourney()
    try await setChangelogMode("good")
    try await pairUntilHome()
    try await rotateChangelogIfPad()
    try openNativeChangelog()
    XCTAssertTrue(app.staticTexts["Workspace improvements"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["New"].exists)
    XCTAssertTrue(app.staticTexts["Improved"].exists)
    XCTAssertTrue(app.staticTexts["Fixed"].exists)
    let refresh = app.buttons["native-e2e.changelog.refresh"]
    try await poll { refresh.isEnabled }
    try assertNativePageActionAtLowerEdge(refresh, pageID: "native-e2e.changelog.list", name: "changelog-loaded")
    changelogProof("loaded-notes")

    try await setChangelogMode("hold")
    refresh.tap()
    try await poll { !refresh.isEnabled }
    try await poll {
      try await self.control(path: "/v1/fixtures/changelog/state")["heldReads"] as? Int == 1
    }
    app.navigationBars["Changelog"].buttons["Settings"].tap()
    try await setChangelogMode("updated")
    let entry = app.buttons["native-e2e.settings.changelog"]
    XCTAssertTrue(entry.isHittable); entry.tap()
    XCTAssertTrue(app.staticTexts["Updated release notes"].waitForExistence(timeout: 10))
    try await poll { refresh.isEnabled }
    changelogProof("refreshed-after-navigation")

    try await setChangelogMode("error")
    refresh.tap()
    let cached = app.descendants(matching: .any).matching(identifier: "native-e2e.changelog.cached").firstMatch
    XCTAssertTrue(cached.waitForExistence(timeout: 10))
    XCTAssertTrue(app.staticTexts["Updated release notes"].exists)
    changelogProof("offline-saved-notes")

    app.terminate()
    app.launchArguments.removeAll { $0 == "-native-e2e-changelog-fresh-cache" }
    XCUIDevice.shared.orientation = .portrait
    try await pairUntilHome()
    try await rotateChangelogIfPad()
    try openNativeChangelog()
    XCTAssertTrue(app.staticTexts["Updated release notes"].waitForExistence(timeout: 10))
    XCTAssertTrue(cached.waitForExistence(timeout: 10))
    changelogProof("offline-after-relaunch")
    let releases = app.descendants(matching: .any).matching(identifier: "native-e2e.changelog.releases").firstMatch
    for _ in 0..<6 { if releases.isHittable { break }; app.swipeUp() }
    XCTAssertTrue(releases.isHittable)
  }

  func testChangelogWithoutCachedContentHasNativeRetryAndExternalReleaseFallback() async throws {
    try configureChangelogJourney()
    try await setChangelogMode("invalid")
    try await pairUntilHome()
    try await rotateChangelogIfPad()
    try openNativeChangelog()
    let empty = app.descendants(matching: .any).matching(identifier: "native-e2e.changelog.empty").firstMatch
    XCTAssertTrue(empty.waitForExistence(timeout: 10))
    XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "native-e2e.changelog.releases").firstMatch.exists)
    let refresh = app.buttons["native-e2e.changelog.refresh"]
    XCTAssertTrue(refresh.isEnabled); XCTAssertTrue(refresh.isHittable)
    changelogProof("empty-error-fallback")
    try await setChangelogMode("good")
    refresh.tap()
    XCTAssertTrue(app.staticTexts["Workspace improvements"].waitForExistence(timeout: 10))
    XCTAssertFalse(empty.exists)
    changelogProof("retry-success")
  }

  func testChangelogTotalDeadlineStopsTrickledReadRetainsNotesAndAllowsRetry() async throws {
    try configureChangelogJourney()
    try await setChangelogMode("good")
    try await pairUntilHome()
    try await rotateChangelogIfPad()
    try openNativeChangelog()
    XCTAssertTrue(app.staticTexts["Workspace improvements"].waitForExistence(timeout: 10))
    let refresh = app.buttons["native-e2e.changelog.refresh"]
    try await poll { refresh.isEnabled }
    try await setChangelogMode("trickle")
    refresh.tap()
    try await poll { !refresh.isEnabled }
    try await poll {
      try await self.control(path: "/v1/fixtures/changelog/state")["streamingReads"] as? Int == 1
    }
    let cached = app.descendants(matching: .any).matching(identifier: "native-e2e.changelog.cached").firstMatch
    XCTAssertTrue(cached.waitForExistence(timeout: 30))
    XCTAssertTrue(refresh.isEnabled)
    try await poll {
      try await self.control(path: "/v1/fixtures/changelog/state")["streamingReads"] as? Int == 0
    }
    XCTAssertTrue(app.staticTexts["Workspace improvements"].exists)
    changelogProof("total-deadline-saved-notes")
    try await setChangelogMode("updated")
    refresh.tap()
    XCTAssertTrue(app.staticTexts["Updated release notes"].waitForExistence(timeout: 10))
    try await poll { refresh.isEnabled }
    XCTAssertFalse(cached.exists)
    changelogProof("retry-after-deadline")
  }

  private func configureChangelogJourney() throws {
    let environment = ProcessInfo.processInfo.environment
    try XCTSkipIf(environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey controls the mock publisher feed independently of paired-host state.")
    let origin = try XCTUnwrap(environment["NATIVE_E2E_CONTROL_URL"])
    let url = try XCTUnwrap(URL(string: "/v1/fixtures/changelog.json", relativeTo: URL(string: origin)))
    app.launchEnvironment["NATIVE_E2E_CHANGELOG_URL"] = url.absoluteString
    app.launchArguments.append("-native-e2e-changelog-fresh-cache")
    if let style = environment["NATIVE_E2E_INTERFACE_STYLE"] {
      app.launchArguments += ["-AppleInterfaceStyle", style, "-ios.appearance.mode", style.lowercased()]
    }
    XCUIDevice.shared.orientation = .portrait
  }

  private func rotateChangelogIfPad() async throws {
    if UIDevice.current.userInterfaceIdiom == .pad {
      XCUIDevice.shared.orientation = .landscapeLeft
      try await poll { self.app.frame.width > self.app.frame.height }
    }
  }

  private func openNativeChangelog() throws {
    try openNativeSettings()
    let entry = app.buttons["native-e2e.settings.changelog"]
    for _ in 0..<5 { if entry.isHittable { break }; app.swipeUp() }
    XCTAssertTrue(entry.isHittable); entry.tap()
  }

  private func setChangelogMode(_ mode: String) async throws {
    _ = try await control(path: "/v1/checkpoints/changelog-\(mode)", method: "POST")
  }

  private func changelogProof(_ name: String) {
    let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    attachment.name = "changelog-\(name)"
    attachment.lifetime = .keepAlways
    add(attachment)
  }
}
