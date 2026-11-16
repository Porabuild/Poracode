import UIKit
import XCTest

extension NativeFamilyJourneyUITests {
  func testEmptyAgentInventoryCanBeDiscoveredAndTheHostProbeSurvivesLeavingSettings() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This journey discovers a controlled agent without running provider binaries.")
    if let style = ProcessInfo.processInfo.environment["NATIVE_E2E_INTERFACE_STYLE"] {
      app.launchArguments += ["-AppleInterfaceStyle", style, "-ios.appearance.mode", style.lowercased()]
    }
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/reset", method: "POST")
    _ = try await control(path: "/v1/checkpoints/agent-discovery-ready", method: "POST")
    try await pairUntilHome()
    if UIDevice.current.userInterfaceIdiom == .pad {
      XCUIDevice.shared.orientation = .landscapeLeft
      try await poll { self.app.frame.width > self.app.frame.height }
    }
    try openNativeModelsSettings()
    let discover = app.buttons["native-e2e.settings.agents.discover"]
    XCTAssertTrue(discover.waitForExistence(timeout: 10))
    XCTAssertTrue(discover.isEnabled)
    XCTAssertTrue(discover.isHittable)
    XCTAssertGreaterThanOrEqual(discover.frame.width, 44)
    XCTAssertFalse(app.switches["native-e2e.settings.agent-enabled.fixture-discovered"].exists)
    discoveryProof("empty-inventory-refresh")
    try assertNativePageActionAtLowerEdge(discover, pageID: "native-e2e.settings.agents.list", name: "discovery-empty")
    discover.tap()
    let pending = app.descendants(matching: .any).matching(identifier: "native-e2e.settings.agents.discovering").firstMatch
    XCTAssertTrue(pending.waitForExistence(timeout: 10))
    XCTAssertFalse(discover.isEnabled)
    discoveryProof("host-probe-pending")
    try closeNativeModelsSettings()
    _ = try await control(path: "/v1/checkpoints/agent-discovery-release", method: "POST")
    try openNativeModelsSettings()
    let fresh = app.switches["native-e2e.settings.agent-enabled.fixture-discovered"]
    XCTAssertTrue(fresh.waitForExistence(timeout: 10))
    try await poll { fresh.isEnabled && discover.isEnabled }
    XCTAssertFalse(pending.exists)
    let status = app.descendants(matching: .any)
      .matching(identifier: "native-e2e.settings.agents.status.fixture-discovered").firstMatch
    for _ in 0..<4 { if status.isHittable { break }; app.swipeUp() }
    XCTAssertTrue(status.isHittable)
    XCTAssertTrue(status.label.contains("Installed"))
    discoveryProof("fresh-host-inventory")
    let modelList = app.buttons["native-e2e.settings.models.open"]
    for _ in 0..<4 { if modelList.isHittable { break }; app.swipeDown() }
    XCTAssertTrue(modelList.isHittable)
    modelList.tap()
    let model = app.buttons["native-e2e.settings.models.row.fixture-discovered:discovered-pro"]
    XCTAssertTrue(model.waitForExistence(timeout: 5))
    XCTAssertEqual(model.value as? String, "Visible")
    discoveryProof("discovered-model-visible")
  }

  private func discoveryProof(_ name: String) {
    let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    attachment.name = "agent-discovery-\(name)"
    attachment.lifetime = .keepAlways
    add(attachment)
  }
}
