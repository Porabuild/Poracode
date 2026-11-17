import UIKit
import XCTest

extension NativeFamilyJourneyUITests {
  func testLargeHistoryBodiesLoadOnlyOnExpansionAndRemainCompleteAfterRelaunch() async throws {
    try XCTSkipUnless(ProcessInfo.processInfo.environment["NATIVE_E2E_DEFERRED_HISTORY"] == "1",
      "This journey requires the production host with observed large tool histories.")
    XCUIDevice.shared.orientation = UIDevice.current.userInterfaceIdiom == .pad ? .landscapeLeft : .portrait
    _ = try await control(path: "/v1/history-metrics/reset", method: "POST")
    try await pairUntilHome()
    try openDeferredHistoryThread()
    historyPerformanceProof("first-compact-open")
    let group = app.buttons["native-e2e.activity-group.lazy-command"]
    XCTAssertTrue(group.waitForExistence(timeout: 15))
    try await assertDeferredBodyCounts(command: 0, file: 0)
    group.tap()
    let command = app.buttons["native-e2e.tool-details.lazy-command"]
    XCTAssertTrue(command.waitForExistence(timeout: 10))
    try await assertDeferredBodyCounts(command: 0, file: 0)
    historyPerformanceProof("compact-tool-headers")
    app.buttons["native-e2e.tool-details.lazy-command"].tap()
    let output = app.textViews["native-e2e.tool-section.lazy-command.1"]
    XCTAssertTrue(output.waitForExistence(timeout: 15))
    let text = output.value as? String ?? ""
    XCTAssertTrue(text.contains("FULL LAZY COMMAND OUTPUT"))
    XCTAssertTrue(text.contains("END OF COMPLETE COMMAND OUTPUT"))
    XCTAssertGreaterThan(text.utf16.count, 100_000)
    try await assertDeferredBodyCounts(command: 1, file: 0)
    historyPerformanceProof("complete-command-on-expansion")
    app.buttons["native-e2e.tool-details.lazy-command"].tap()
    try await poll { !output.exists }
    app.buttons["native-e2e.tool-details.lazy-file"].tap()
    let diff = app.descendants(matching: .any).matching(
      NSPredicate(format: "identifier BEGINSWITH %@", "native-e2e.tool-section.lazy-file.")).firstMatch
    XCTAssertTrue(diff.waitForExistence(timeout: 15))
    try assertRenderedText("ADDED LAZY DIFF")
    try await assertDeferredBodyCounts(command: 1, file: 1)
    historyPerformanceProof("complete-diff-on-expansion")

    app.terminate()
    app.launchArguments.removeAll { $0 == "-native-e2e-fresh-state" }
    app.launch()
    try openDeferredHistoryThread()
    XCTAssertTrue(group.waitForExistence(timeout: 15))
    group.tap()
    XCTAssertTrue(command.waitForExistence(timeout: 10))
    try await assertDeferredBodyCounts(command: 1, file: 1)
    app.buttons["native-e2e.tool-details.lazy-command"].tap()
    XCTAssertTrue(output.waitForExistence(timeout: 15))
    XCTAssertTrue((output.value as? String ?? "").contains("END OF COMPLETE COMMAND OUTPUT"))
    try await assertDeferredBodyCounts(command: 2, file: 1)
    historyPerformanceProof("compact-cache-relaunch-details")
  }

  func testDeferredHistoryFailureRetriesWithCompleteFallbackWhenCatalogIsUnavailable() async throws {
    try XCTSkipUnless(ProcessInfo.processInfo.environment["NATIVE_E2E_DEFERRED_HISTORY"] == "1",
      "This journey requires the controlled production-host observation proxy.")
    XCUIDevice.shared.orientation = .portrait
    _ = try await control(path: "/v1/history-metrics/reset", method: "POST")
    _ = try await control(path: "/v1/history-metrics/faults", method: "POST",
      body: ["catalogUnavailable": true, "failNextDetail": true])
    try await pairUntilHome()
    try openDeferredHistoryThread()
    historyPerformanceProof("fallback-first-open")
    let group = app.buttons["native-e2e.activity-group.lazy-command"]
    XCTAssertTrue(group.waitForExistence(timeout: 15)); group.tap()
    let header = app.buttons["native-e2e.tool-details.lazy-command"]
    XCTAssertTrue(header.waitForExistence(timeout: 10))
    XCTAssertEqual(header.value as? String, "Collapsed")
    app.buttons["native-e2e.tool-details.lazy-command"].tap()
    let retry = app.buttons["native-e2e.history-details.retry.lazy-command"]
    XCTAssertTrue(retry.waitForExistence(timeout: 15))
    XCTAssertEqual(header.value as? String, "Expanded")
    try await assertDeferredBodyCounts(command: 1, file: 0)
    historyPerformanceProof("detail-failure-retry")
    retry.tap()
    let fallback = app.textViews["native-e2e.history-details.fallback.lazy-command"]
    XCTAssertTrue(fallback.waitForExistence(timeout: 15))
    let complete = fallback.value as? String ?? ""
    XCTAssertTrue(complete.contains("FULL LAZY COMMAND OUTPUT"))
    XCTAssertTrue(complete.contains("END OF COMPLETE COMMAND OUTPUT"))
    XCTAssertTrue(complete.contains("streams")); XCTAssertGreaterThan(complete.utf16.count, 100_000)
    XCTAssertFalse(retry.exists)
    let spinner = app.descendants(matching: .any).matching(identifier: "native-e2e.history-details.loading.lazy-command").firstMatch
    XCTAssertFalse(spinner.exists)
    try await assertDeferredBodyCounts(command: 2, file: 0)
    let metrics = try await control(path: "/v1/history-metrics")
    XCTAssertGreaterThan(metrics["catalogOmissions"] as? Int ?? 0, 0)
    historyPerformanceProof("complete-catalog-fallback")
    app.buttons["native-e2e.tool-details.lazy-command"].tap()
    XCTAssertEqual(header.value as? String, "Collapsed")
    XCTAssertFalse(fallback.exists)
  }

  private func openDeferredHistoryThread() throws {
    if app.buttons["native-e2e.activity-group.lazy-command"].waitForExistence(timeout: 2) { return }
    let recent = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Large history review")).firstMatch
    if recent.exists, recent.isHittable { recent.tap(); return }
    let row = app.buttons["native-e2e.thread.thread-deferred-history"]
    if !row.isHittable {
      let toggle = app.buttons["native-e2e.sidebar-toggle"]
      if toggle.exists, toggle.isHittable { toggle.tap() }
    }
    historyPerformanceProof("history-navigation")
    XCTAssertTrue(row.waitForExistence(timeout: 20)); XCTAssertTrue(row.isHittable); row.tap()
  }

  private func assertDeferredBodyCounts(command: Int, file: Int) async throws {
    let metrics = try await control(path: "/v1/history-metrics")
    let counts = metrics["detailCounts"] as? [String: Int] ?? [:]
    XCTAssertEqual(counts["lazy-command", default: 0], command)
    XCTAssertEqual(counts["lazy-file", default: 0], file)
  }

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
