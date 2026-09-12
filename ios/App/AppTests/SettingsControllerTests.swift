import XCTest

@testable import App

@MainActor
final class SettingsControllerTests: XCTestCase {
  func testNewestRequestWinsEvenWhenCancelledTransportReturnsLate() async throws {
    let first = try response(provider: "first")
    let second = try response(provider: "second")
    let gateway = SettingsControllerGateway(first: first, second: second)
    let controller = SettingsDocumentController(gateway: gateway)
    controller.activate(settingsLease())

    let old = Task { await controller.load() }
    await gateway.waitForFirstRequest()
    let newest = Task { await controller.load() }
    await newest.value
    XCTAssertEqual(controller.document?.titleGenProvider, "second")

    await gateway.releaseFirst()
    await old.value
    XCTAssertEqual(controller.document?.titleGenProvider, "second")
    XCTAssertEqual(controller.state, .loaded)
  }

  func testHostSwitchClearsStateAndLateOldHostCannotInstall() async throws {
    let first = try response(provider: "host-a")
    let gateway = SettingsControllerGateway(first: first, second: first)
    let controller = SettingsDocumentController(gateway: gateway)
    let hostA = settingsLease("1")
    let hostB = settingsLease("2")
    controller.activate(hostA)

    let load = Task { await controller.load() }
    await gateway.waitForFirstRequest()
    controller.activate(hostB)
    await gateway.releaseFirst()
    await load.value

    XCTAssertEqual(controller.lease, hostB)
    XCTAssertNil(controller.document)
    XCTAssertEqual(controller.state, .idle)
  }

  func testControllerSurfacesAmbiguousMutationWithoutRetry() async throws {
    let value = try response(provider: "original")
    let gateway = SettingsControllerGateway(
      first: value, second: value, mutationError: .ambiguousOutcome
    )
    let controller = SettingsDocumentController(gateway: gateway)
    controller.activate(settingsLease())

    await controller.write(SettingsPatch(values: [.titleGenFast: .bool(true)]))
    XCTAssertEqual(controller.state, .failed(.ambiguousOutcome))
    let writeCount = await gateway.writeCount
    XCTAssertEqual(writeCount, 1)
  }

  private func response(provider: String) throws -> SettingsReadResponse {
    var settings = SettingsFixtures.settings
    settings["titleGenProvider"] = provider
    return try JSONDecoder().decode(
      SettingsReadResponse.self, from: SettingsFixtures.data(["settings": settings])
    )
  }
}

private actor SettingsControllerGateway: SettingsSessionGateway {
  let first: SettingsReadResponse
  let second: SettingsReadResponse
  let mutationError: SettingsGatewayError?
  private var reads = 0
  private(set) var writeCount = 0
  private var firstStarted = false
  private var firstStartWaiters: [CheckedContinuation<Void, Never>] = []
  private var firstRelease: CheckedContinuation<Void, Never>?

  init(
    first: SettingsReadResponse,
    second: SettingsReadResponse,
    mutationError: SettingsGatewayError? = nil
  ) {
    self.first = first
    self.second = second
    self.mutationError = mutationError
  }

  func readSettings(lease: SettingsHostLease) async throws -> SettingsReadResponse {
    reads += 1
    if reads == 1 {
      firstStarted = true
      let waiters = firstStartWaiters
      firstStartWaiters.removeAll()
      waiters.forEach { $0.resume() }
      await withCheckedContinuation { firstRelease = $0 }
      return first
    }
    return second
  }

  func waitForFirstRequest() async {
    guard !firstStarted else { return }
    await withCheckedContinuation { firstStartWaiters.append($0) }
  }

  func releaseFirst() {
    firstRelease?.resume()
    firstRelease = nil
  }

  func writeSettings(
    _ patch: SettingsPatch,
    lease: SettingsHostLease
  ) throws -> SettingsReadResponse {
    writeCount += 1
    if let mutationError { throw mutationError }
    return second
  }

  func agentStatuses(lease: SettingsHostLease) throws -> SettingsAgentStatuses {
    throw SettingsGatewayError.transport
  }
  func providerUsage(lease: SettingsHostLease) throws -> SettingsProviderUsage {
    throw SettingsGatewayError.transport
  }
  func profileDevices(lease: SettingsHostLease) throws -> SettingsProfileDevices {
    throw SettingsGatewayError.transport
  }
  func profileCoreStats(
    _ request: SettingsProfileStatsRequest, lease: SettingsHostLease
  ) throws -> SettingsProfileCoreStats { throw SettingsGatewayError.transport }
  func profileTokenStats(
    _ request: SettingsProfileStatsRequest, lease: SettingsHostLease
  ) throws -> SettingsProfileTokenStats { throw SettingsGatewayError.transport }
  func setProfileIdentity(
    _ identity: SettingsProfileIdentity, lease: SettingsHostLease
  ) throws -> SettingsProfileIdentityResponse { throw SettingsGatewayError.transport }
}
