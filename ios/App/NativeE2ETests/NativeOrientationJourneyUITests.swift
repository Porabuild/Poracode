import UIKit
import XCTest

extension NativeFamilyJourneyUITests {
  // Geometry-based rotation checks belong to the iPad profile. Phone suites
  // keep feature assertions in portrait; Duo inner rotation is qualified from
  // actual display captures because its AX app frame can remain portrait.
  var usesRotatingWindowFrames: Bool { UIDevice.current.userInterfaceIdiom == .pad }

  var journeyOrientations: [UIDeviceOrientation] {
    usesRotatingWindowFrames ? [.landscapeLeft, .portrait] : [.portrait]
  }

  func rotateIPadJourney(to requested: UIDeviceOrientation) async throws {
    guard usesRotatingWindowFrames else { return }
    XCUIDevice.shared.orientation = requested
    try await poll {
      requested.isLandscape ? self.app.frame.width > self.app.frame.height : self.app.frame.height > self.app.frame.width
    }
  }

  func testCompactPhoneKeepsPortraitWhenTheDeviceTurns() async throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["NATIVE_E2E_PEER_MODE"] == "real",
      "This policy check uses disposable onboarding state.")
    _ = try await control(path: "/v1/reset", method: "POST")
    XCUIDevice.shared.orientation = .portrait
    app.launch()
    let connect = app.buttons["native-e2e.pair.manual"]
    XCTAssertTrue(connect.waitForExistence(timeout: 15))
    try XCTSkipIf(UIDevice.current.userInterfaceIdiom == .pad || app.frame.width >= 600,
      "This policy check targets compact phone displays.")
    defer { XCUIDevice.shared.orientation = .portrait }
    for pose: UIDeviceOrientation in [.portrait, .landscapeLeft, .landscapeRight] {
      XCUIDevice.shared.orientation = pose
      try await poll { self.app.frame.height > self.app.frame.width && connect.isHittable }
      let geometry = XCTAttachment(string: "window=\(app.frame), devicePose=\(pose.rawValue)")
      geometry.name = "orientation-compact-\(pose.rawValue)-geometry"; geometry.lifetime = .keepAlways; add(geometry)
      let screenshot = XCTAttachment(screenshot: app.screenshot())
      screenshot.name = "orientation-compact-\(pose.rawValue)"; screenshot.lifetime = .keepAlways; add(screenshot)
    }
  }
}
