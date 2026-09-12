import XCTest

@testable import App

@MainActor
final class SettingsIntegrationsOAuthTests: XCTestCase {
  func testOAuthTimeoutIsBoundedAndNeverReplaysBeginOrWait() async {
    let gateway = SettingsIntegrationsGatewayFake()
    await gateway.setBeginResult(
      .redirect(
        flowID: "flow-1", authorizationURL: "https://auth.example.test/authorize?state=secret"
      ))
    let browser = SettingsIntegrationsBrowserFake()
    let sleeper = SettingsIntegrationsSleepGate()
    let controller = makeController(gateway: gateway, browser: browser, sleeper: sleeper)

    let running = Task { await controller.start(server: SettingsIntegrationsFixtures.server) }
    await waitUntil { await gateway.count(.waitMcpServerOauth) == 1 }
    await sleeper.release()
    await running.value

    XCTAssertEqual(controller.lifecycle, .timedOut)
    let beginCount = await gateway.count(.beginMcpServerOauth)
    let waitCount = await gateway.count(.waitMcpServerOauth)
    XCTAssertEqual(beginCount, 1)
    XCTAssertEqual(waitCount, 1)
    XCTAssertEqual(browser.openedCount, 1)
    XCTAssertFalse(String(describing: controller.lifecycle).contains("secret"))
  }

  func testUserCancellationPropagatesWithoutFailureOrReplay() async {
    let gateway = SettingsIntegrationsGatewayFake()
    await gateway.setBeginResult(
      .redirect(
        flowID: "flow-1", authorizationURL: "https://auth.example.test/authorize"
      ))
    let controller = makeController(
      gateway: gateway,
      browser: SettingsIntegrationsBrowserFake(),
      sleeper: SettingsIntegrationsSleepGate()
    )
    let running = Task { await controller.start(server: SettingsIntegrationsFixtures.server) }
    await waitUntil { await gateway.count(.waitMcpServerOauth) == 1 }

    controller.cancel()
    await running.value

    XCTAssertEqual(controller.lifecycle, .cancelled)
    let beginCount = await gateway.count(.beginMcpServerOauth)
    let waitCount = await gateway.count(.waitMcpServerOauth)
    XCTAssertEqual(beginCount, 1)
    XCTAssertEqual(waitCount, 1)
  }

  func testBackgroundPausesAndForegroundResumesOnlyTheCapturedFlow() async {
    let gateway = SettingsIntegrationsGatewayFake()
    await gateway.setBeginResult(
      .redirect(
        flowID: "flow-1", authorizationURL: "https://auth.example.test/authorize"
      ))
    let sleeper = SettingsIntegrationsSleepGate()
    let browser = SettingsIntegrationsBrowserFake()
    let controller = makeController(gateway: gateway, browser: browser, sleeper: sleeper)
    let running = Task { await controller.start(server: SettingsIntegrationsFixtures.server) }
    await waitUntil { await gateway.count(.waitMcpServerOauth) == 1 }
    controller.suspendForBackground()
    await running.value
    XCTAssertEqual(controller.lifecycle, .paused)

    let resumed = Task { await controller.resumeAfterForeground() }
    await waitUntil { await gateway.count(.waitMcpServerOauth) == 2 }
    await gateway.resumeWait(.authorized)
    await resumed.value

    XCTAssertEqual(controller.lifecycle, .ready(authenticatedCount: 0))
    let beginCount = await gateway.count(.beginMcpServerOauth)
    let waitCount = await gateway.count(.waitMcpServerOauth)
    let statusCount = await gateway.count(.getMcpOauthStatus)
    XCTAssertEqual(beginCount, 1)
    XCTAssertEqual(waitCount, 2)
    XCTAssertEqual(statusCount, 1)
    XCTAssertEqual(browser.openedCount, 1)
  }

  func testSupersessionCancelsOldFlowAndKeepsNewestResult() async {
    let gateway = SettingsIntegrationsGatewayFake()
    await gateway.setBeginResult(
      .redirect(
        flowID: "flow-1", authorizationURL: "https://auth.example.test/authorize"
      ))
    let controller = makeController(
      gateway: gateway,
      browser: SettingsIntegrationsBrowserFake(),
      sleeper: SettingsIntegrationsSleepGate()
    )
    let first = Task { await controller.start(server: SettingsIntegrationsFixtures.server) }
    await waitUntil { await gateway.count(.waitMcpServerOauth) == 1 }
    await gateway.setBeginResult(.authorized)

    await controller.start(server: SettingsIntegrationsFixtures.server)
    await first.value

    XCTAssertEqual(controller.lifecycle, .ready(authenticatedCount: 0))
    let beginCount = await gateway.count(.beginMcpServerOauth)
    let waitCount = await gateway.count(.waitMcpServerOauth)
    XCTAssertEqual(beginCount, 2)
    XCTAssertEqual(waitCount, 1)
  }

  func testHostOrProjectChangeCannotInstallStaleOAuthState() async {
    let gateway = SettingsIntegrationsGatewayFake()
    await gateway.setBeginResult(
      .redirect(
        flowID: "flow-1", authorizationURL: "https://auth.example.test/authorize"
      ))
    let controller = makeController(
      gateway: gateway,
      browser: SettingsIntegrationsBrowserFake(),
      sleeper: SettingsIntegrationsSleepGate()
    )
    let first = settingsIntegrationsAccess(
      settingsIntegrationsContext(project: SettingsIntegrationsFixtures.posix)
    )
    controller.activate(first)
    let running = Task { await controller.start(server: SettingsIntegrationsFixtures.server) }
    await waitUntil { await gateway.count(.waitMcpServerOauth) == 1 }

    controller.activate(
      settingsIntegrationsAccess(
        settingsIntegrationsContext(generation: 2, project: SettingsIntegrationsFixtures.wsl)
      ))
    await running.value

    XCTAssertEqual(controller.lifecycle, .idle)
    XCTAssertTrue(controller.authenticatedURLs.isEmpty)
  }

  func testUnsafeAuthorizationURLIsNeverOpened() async {
    let gateway = SettingsIntegrationsGatewayFake()
    await gateway.setBeginResult(
      .redirect(
        flowID: "flow-1", authorizationURL: "http://auth.example.test/?token=secret"
      ))
    let browser = SettingsIntegrationsBrowserFake()
    let controller = makeController(
      gateway: gateway, browser: browser, sleeper: SettingsIntegrationsSleepGate()
    )

    await controller.start(server: SettingsIntegrationsFixtures.server)

    XCTAssertEqual(browser.openedCount, 0)
    XCTAssertEqual(controller.lifecycle, .failed(.invalidResponse))
  }

  func testAuthorizationURLPolicyRequiresHTTPSHostAndNoUserInfo() throws {
    XCTAssertEqual(
      try SettingsIntegrationsAuthorizationURLPolicy.validatedURL(
        "https://auth.example.test/authorize?state=opaque"
      ).host,
      "auth.example.test"
    )
    for raw in [
      "http://auth.example.test/authorize",
      "https:///authorize",
      "https://user@auth.example.test/authorize",
      "https://user:password@auth.example.test/authorize",
    ] {
      XCTAssertThrowsError(try SettingsIntegrationsAuthorizationURLPolicy.validatedURL(raw)) {
        XCTAssertEqual($0 as? SettingsIntegrationsGatewayError, .invalidResponse)
      }
    }
  }

  func testAmbiguousClearAttemptsOnceAndPerformsOneStatusRead() async {
    let gateway = SettingsIntegrationsGatewayFake()
    await gateway.setFailure(.ambiguousOutcome, for: .clearMcpServerOauth)
    let controller = makeController(
      gateway: gateway,
      browser: SettingsIntegrationsBrowserFake(),
      sleeper: SettingsIntegrationsSleepGate()
    )

    await controller.clear(server: SettingsIntegrationsFixtures.server)

    let clearCount = await gateway.count(.clearMcpServerOauth)
    let statusCount = await gateway.count(.getMcpOauthStatus)
    XCTAssertEqual(clearCount, 1)
    XCTAssertEqual(statusCount, 1)
    XCTAssertEqual(controller.lifecycle, .ready(authenticatedCount: 0))
  }

  private func makeController(
    gateway: SettingsIntegrationsGatewayFake,
    browser: SettingsIntegrationsBrowserFake,
    sleeper: SettingsIntegrationsSleepGate
  ) -> SettingsIntegrationsOAuthController {
    let controller = SettingsIntegrationsOAuthController(
      gateway: gateway,
      browser: browser,
      waitLimit: .seconds(1),
      sleep: { duration in try await sleeper.sleep(duration) }
    )
    controller.activate(settingsIntegrationsAccess(settingsIntegrationsContext()))
    return controller
  }

  private func waitUntil(
    _ condition: @escaping @Sendable () async -> Bool
  ) async {
    for _ in 0..<1_000 {
      if await condition() { return }
      await Task.yield()
    }
    XCTFail("Condition was not reached")
  }
}

private actor SettingsIntegrationsSleepGate {
  private var continuation: CheckedContinuation<Void, any Error>?

  func sleep(_ duration: Duration) async throws {
    try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { continuation = $0 }
    } onCancel: {
      Task { await self.cancel() }
    }
  }

  func release() {
    continuation?.resume(returning: ())
    continuation = nil
  }

  private func cancel() {
    continuation?.resume(throwing: CancellationError())
    continuation = nil
  }
}
