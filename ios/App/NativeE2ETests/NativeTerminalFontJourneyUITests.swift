import UIKit
import XCTest

extension NativeFamilyJourneyUITests {
  func testTerminalFontPickerPersistsCancelsAndResets() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey uses disposable device preferences and the controlled peer.")
    app.launchArguments.append("-native-e2e-terminal-font-fresh-preferences")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    try await pairUntilHome()
    try openTerminalFontSettings()
    let standard = app.buttons["native-e2e.terminal.font.default"]
    let choose = app.buttons["native-e2e.terminal.font.choose"]
    XCTAssertTrue(standard.isSelected)
    choose.tap()
    fontProof("picker-opened")
    let courier = app.staticTexts["Courier New"].firstMatch
    if !courier.waitForExistence(timeout: 3), app.searchFields.firstMatch.exists {
      app.searchFields.firstMatch.tap(); app.searchFields.firstMatch.typeText("Courier")
    }
    XCTAssertTrue(courier.waitForExistence(timeout: 5)); courier.tap()
    try await poll { choose.isHittable && choose.label.contains("Courier") }
    XCTAssertTrue(choose.isSelected); XCTAssertFalse(standard.isSelected)
    fontProof("selected")

    choose.tap()
    fontProof("picker-reopened")
    let hierarchy = XCTAttachment(string: app.debugDescription)
    hierarchy.name = "terminal-font-picker-reopened-layout"; hierarchy.lifetime = .keepAlways; add(hierarchy)
    let cancel = app.buttons["Cancel"].firstMatch
    XCTAssertTrue(cancel.waitForExistence(timeout: 5)); cancel.tap()
    XCTAssertTrue(choose.waitForExistence(timeout: 5)); XCTAssertTrue(choose.label.contains("Courier"))

    app.terminate()
    app.launchArguments.removeAll { $0 == "-native-e2e-terminal-font-fresh-preferences" }
    try await pairUntilHome()
    try openTerminalFontSettings()
    XCTAssertTrue(choose.label.contains("Courier")); XCTAssertTrue(choose.isSelected)
    fontProof("restored")
    standard.tap()
    XCTAssertTrue(standard.isSelected); XCTAssertFalse(choose.isSelected)
    XCTAssertFalse(app.staticTexts["native-e2e.terminal.font.unavailable"].exists)
    fontProof("default")
  }

  private func openTerminalFontSettings() throws {
    try openNativeSettingsPage("native-e2e.settings.terminal")
    XCTAssertTrue(app.buttons["native-e2e.terminal.font.choose"].waitForExistence(timeout: 5))
  }

  private func fontProof(_ name: String) {
    let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    proof.name = "terminal-font-\(name)"; proof.lifetime = .keepAlways; add(proof)
  }
}
