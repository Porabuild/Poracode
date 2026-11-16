import UIKit
import XCTest

extension NativeFamilyJourneyUITests {
  func testSettingsShortcutsCanBePinnedReorderedOpenedAndRestoredAfterRelaunch() async throws {
    let environment = ProcessInfo.processInfo.environment
    try XCTSkipIf(environment["NATIVE_E2E_PEER_MODE"] == "real", "This journey uses the controlled workspace fixture.")
    app.launchArguments.append("-native-e2e-shortcuts-fresh-preferences")
    if let style = environment["NATIVE_E2E_INTERFACE_STYLE"] {
      app.launchArguments += ["-AppleInterfaceStyle", style, "-ios.appearance.mode", style.lowercased()]
    }
    let origin = try XCTUnwrap(environment["NATIVE_E2E_CONTROL_URL"])
    let feed = try XCTUnwrap(URL(string: "/v1/fixtures/changelog.json", relativeTo: URL(string: origin)))
    app.launchEnvironment["NATIVE_E2E_CHANGELOG_URL"] = feed.absoluteString
    _ = try await control(path: "/v1/checkpoints/changelog-good", method: "POST")
    XCUIDevice.shared.orientation = .portrait
    try await pairUntilHome()
    try await prepareShortcutLayout()
    try openShortcutPreferences()

    let appearance = app.switches["native-e2e.shortcuts.toggle.settings:appearance"]
    try revealShortcut(appearance)
    XCTAssertEqual(appearance.value as? String, "0")
    let pins = ["appearance", "audio", "notifications", "terminal", "git", "worktrees", "agentsGeneral", "changelog"]
    for pin in pins {
      let toggle = app.switches["native-e2e.shortcuts.toggle.settings:\(pin)"]
      try revealShortcut(toggle)
      XCTAssertEqual(toggle.value as? String, "0")
      if pin == "appearance" { shortcutProof("before-first-toggle") }
      toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
      try await poll { toggle.value as? String == "1" }
      if pin == "appearance" { shortcutProof("after-first-toggle") }
    }
    try revealShortcut(appearance, scrollingUp: false)
    try revealShortcut(app.switches["native-e2e.shortcuts.toggle.pullRequests"], scrollingUp: false)
    app.navigationBars["Home shortcuts"].buttons["Edit"].tap()
    let reorder = app.buttons["Reorder Appearance"]
    let first = app.buttons["Reorder Pull requests"]
    XCTAssertTrue(reorder.waitForExistence(timeout: 5))
    XCTAssertTrue(first.isHittable)
    reorder.press(forDuration: 0.6, thenDragTo: first)
    XCTAssertLessThan(appearance.frame.minY, app.switches["native-e2e.shortcuts.toggle.pullRequests"].frame.minY)
    shortcutProof("reordered-native-list")
    app.navigationBars["Home shortcuts"].buttons["General"].tap()
    app.navigationBars["General"].buttons["Settings"].tap()
    app.navigationBars["Settings"].buttons["More"].tap()
    let closeMore = app.buttons["native-e2e.more.close"]
    XCTAssertTrue(closeMore.waitForExistence(timeout: 5)); closeMore.tap()

    if UIDevice.current.userInterfaceIdiom == .pad {
      let direct = app.buttons["native-e2e.sidebar.settings:appearance"]
      XCTAssertTrue(direct.waitForExistence(timeout: 5)); XCTAssertTrue(direct.isHittable)
      XCTAssertGreaterThanOrEqual(direct.frame.width, 44)
      XCTAssertGreaterThanOrEqual(direct.frame.height, 44)
      XCTAssertFalse(app.buttons["native-e2e.sidebar.settings:changelog"].exists)
      let footerIDs = ["projects", "more-tools", "pullRequests", "schedules"] + pins.map { "settings:\($0)" }
      var measured = 0
      for id in footerIDs {
        let control = app.buttons["native-e2e.sidebar.\(id)"]
        if control.exists && control.isHittable {
          XCTAssertGreaterThanOrEqual(control.frame.width, 44)
          XCTAssertGreaterThanOrEqual(control.frame.height, 44)
          measured += 1
        }
      }
      XCTAssertGreaterThanOrEqual(measured, 3)
      shortcutProof("overflow-and-footer-targets")
      direct.tap()
      XCTAssertTrue(app.navigationBars["Appearance"].waitForExistence(timeout: 5))
      XCTAssertTrue(app.buttons["native-e2e.settings.close"].isHittable)
      shortcutProof("direct-sidebar-settings")
      app.buttons["native-e2e.settings.close"].tap()
    }

    try openShortcutMore()
    let overflow = app.buttons["native-e2e.more.shortcut.settings:changelog"]
    try revealShortcut(overflow)
    overflow.tap()
    XCTAssertTrue(app.navigationBars["Changelog"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["Workspace improvements"].waitForExistence(timeout: 10))
    XCTAssertEqual(app.navigationBars["Changelog"].buttons.matching(NSPredicate(format: "label == %@", "More")).count, 1)
    shortcutProof("more-settings-navigation")
    app.navigationBars["Changelog"].buttons["More"].tap()
    let hiddenAction = app.buttons["native-e2e.more.shortcut.githubActions"]
    try revealShortcut(hiddenAction, scrollingUp: false)
    XCTAssertTrue(hiddenAction.isHittable)
    app.buttons["native-e2e.more.close"].tap()

    app.terminate()
    app.launchArguments.removeAll { $0 == "-native-e2e-shortcuts-fresh-preferences" }
    XCUIDevice.shared.orientation = .portrait
    try await pairUntilHome()
    try await prepareShortcutLayout()
    try openShortcutPreferences()
    let restored = app.switches["native-e2e.shortcuts.toggle.settings:appearance"]
    XCTAssertTrue(restored.waitForExistence(timeout: 5))
    XCTAssertEqual(restored.value as? String, "1")
    XCTAssertLessThan(restored.frame.minY, app.switches["native-e2e.shortcuts.toggle.pullRequests"].frame.minY)
    shortcutProof("restored-after-relaunch")
    // Keep later journeys independent of this device-local customization.
    app.terminate()
    app.launchArguments.append("-native-e2e-shortcuts-fresh-preferences")
    app.launch()
  }

  private func prepareShortcutLayout() async throws {
    if UIDevice.current.userInterfaceIdiom == .pad {
      XCUIDevice.shared.orientation = .landscapeLeft
      try await poll { self.app.frame.width > self.app.frame.height }
    }
  }

  private func openShortcutPreferences() throws {
    try openNativeSettings()
    let general = app.buttons["native-e2e.settings.general"]
    XCTAssertTrue(general.waitForExistence(timeout: 5)); general.tap()
    let shortcuts = app.buttons["native-e2e.settings.shortcuts"]
    XCTAssertTrue(shortcuts.waitForExistence(timeout: 5)); shortcuts.tap()
    XCTAssertTrue(app.navigationBars["Home shortcuts"].waitForExistence(timeout: 5))
  }

  private func openShortcutMore() throws {
    let more = app.buttons.matching(NSPredicate(format: "identifier IN %@", [
      "native-e2e.session-menu", "native-e2e.sidebar.more-tools",
    ])).firstMatch
    XCTAssertTrue(more.waitForExistence(timeout: 5)); more.tap()
  }

  private func revealShortcut(_ element: XCUIElement, scrollingUp: Bool = true) throws {
    for _ in 0..<8 {
      if element.isHittable { break }
      if scrollingUp { app.swipeUp() } else { app.swipeDown() }
    }
    XCTAssertTrue(element.isHittable)
  }

  private func shortcutProof(_ name: String) {
    let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    attachment.name = "shortcuts-\(name)"
    attachment.lifetime = .keepAlways
    add(attachment)
  }
}
