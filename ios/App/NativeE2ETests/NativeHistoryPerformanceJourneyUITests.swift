import UIKit
import XCTest

extension NativeFamilyJourneyUITests {
  /// An ordinary production host owns both histories. No cached client state
  /// is installed through a fixture or debug endpoint.
  func testRecentHistoriesReopenAfterSwitchRelaunchAndHostRestart() async throws {
    try XCTSkipUnless(ProcessInfo.processInfo.environment["NATIVE_E2E_HISTORY_PERFORMANCE"] == "1",
      "This journey requires the disposable production history host.")
    XCUIDevice.shared.orientation = .portrait
    try await pairUntilHome()
    var times: [String: Double] = [:]
    times["cold_a_ms"] = try openPerformanceHistory("a")
    times["cold_b_ms"] = try openPerformanceHistory("b")
    times["warm_a_ms"] = try openPerformanceHistory("a")
    historyPerformanceProof("validated-reopen")

    app.terminate()
    app.launchArguments.removeAll { $0 == "-native-e2e-fresh-state" }
    app.launch()
    times["relaunch_a_ms"] = try openPerformanceHistory("a")
    historyPerformanceProof("disk-cache-relaunch")
    _ = try await control(path: "/v1/real/restart", method: "POST")
    times["reconnected_b_ms"] = try openPerformanceHistory("b")
    try assertRenderedText("History B latest reply")
    historyPerformanceProof("host-restart")

    let data = try JSONSerialization.data(withJSONObject: times, options: [.prettyPrinted, .sortedKeys])
    let metrics = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
    metrics.name = "native-history-visible-open-metrics"; metrics.lifetime = .keepAlways; add(metrics)
  }

  private func openPerformanceHistory(_ suffix: String) throws -> Double {
    let row = app.buttons["native-e2e.thread.thread-history-perf-\(suffix)"]
    if !row.isHittable {
      let toggle = app.buttons["native-e2e.sidebar-toggle"].firstMatch
      if toggle.waitForExistence(timeout: 2), toggle.isHittable { toggle.tap() }
      else {
        let back = app.navigationBars.buttons.element(boundBy: 0)
        if back.exists, back.isHittable { back.tap() }
      }
    }
    XCTAssertTrue(row.waitForExistence(timeout: 20)); XCTAssertTrue(row.isHittable)
    let start = ContinuousClock.now
    row.tap()
    let marker = app.staticTexts["History \(suffix.uppercased()) latest reply"]
    XCTAssertTrue(marker.waitForExistence(timeout: 15))
    XCTAssertTrue(marker.isHittable)
    let elapsed = start.duration(to: .now).components
    return Double(elapsed.seconds) * 1_000 + Double(elapsed.attoseconds) / 1e15
  }

  private func historyPerformanceProof(_ name: String) {
    let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    proof.name = "native-history-\(name)"; proof.lifetime = .keepAlways; add(proof)
  }
}
