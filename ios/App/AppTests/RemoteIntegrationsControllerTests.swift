import XCTest

@testable import App

@MainActor
final class RemoteIntegrationsControllerTests: XCTestCase {
  func testScheduleMutationAttemptsOnceThenPerformsOneAuthoritativeRefresh() async {
    let gateway = RemoteIntegrationsControllerGateway()
    await gateway.setScheduleMutationError(.ambiguousOutcome)
    let controller = RemoteIntegrationsSchedulesController(gateway: gateway)
    controller.activate(remoteIntegrationsLease())

    await controller.perform(.delete(id: RemoteIntegrationsFixtures.scheduleID))

    let counts = await gateway.counts
    XCTAssertEqual(counts.scheduleMutations, 1)
    XCTAssertEqual(counts.scheduleReads, 1)
    XCTAssertEqual(controller.notice, .ambiguousRefreshed)
    XCTAssertEqual(controller.state, .loaded)
  }

  func testPRMutationAttemptsOnceThenPerformsOneReadForSameKey() async {
    let gateway = RemoteIntegrationsControllerGateway()
    await gateway.setPRMutationError(.ambiguousOutcome)
    let controller = RemoteIntegrationsPRWatchController(gateway: gateway)
    controller.activate(remoteIntegrationsLease())
    let key = RemoteIntegrationsPRWatchKey(projectId: "project", prNumber: 42)
    await controller.load(key)

    await controller.check()

    let counts = await gateway.counts
    XCTAssertEqual(counts.prMutations, 1)
    XCTAssertEqual(counts.prReads, 2)
    XCTAssertEqual(controller.key, key)
    XCTAssertEqual(controller.notice, .ambiguousRefreshed)
  }

  func testHostSwitchCancelsLateCompletionAndClearsOldData() async {
    let gateway = RemoteIntegrationsControllerGateway(blockFirstScheduleRead: true)
    let controller = RemoteIntegrationsSchedulesController(gateway: gateway)
    let first = remoteIntegrationsLease("1")
    let second = remoteIntegrationsLease("2")
    controller.activate(first)

    let load = Task { await controller.load() }
    await gateway.waitForFirstScheduleRead()
    controller.activate(second)
    await gateway.releaseFirstScheduleRead()
    await load.value

    XCTAssertEqual(controller.lease, second)
    XCTAssertEqual(controller.state, .idle)
    XCTAssertTrue(controller.schedules.isEmpty)
  }

  func testUpdateMutationAlsoUsesSingleReadOnAmbiguity() async {
    let gateway = RemoteIntegrationsControllerGateway()
    await gateway.setUpdateMutationError(.ambiguousOutcome)
    let controller = RemoteIntegrationsUpdateController(gateway: gateway)
    controller.activate(remoteIntegrationsLease())

    await controller.check()

    let counts = await gateway.counts
    XCTAssertEqual(counts.updateMutations, 1)
    XCTAssertEqual(counts.updateReads, 1)
    XCTAssertEqual(controller.notice, .ambiguousRefreshed)
  }

  func testPresentationDeactivationCancelsLateReadAndClearsFeatureState() async {
    let gateway = RemoteIntegrationsControllerGateway(blockFirstScheduleRead: true)
    let composition = RemoteIntegrationsComposition(gateway: gateway)
    let selection = RemoteIntegrationsHostSelection(
      name: "Fixture Host",
      access: remoteIntegrationsAccess(remoteIntegrationsLease())
    )
    composition.activate(selection)

    let load = Task { await composition.schedules.load() }
    await gateway.waitForFirstScheduleRead()
    composition.deactivateTransientWork()
    await gateway.releaseFirstScheduleRead()
    await load.value

    XCTAssertNil(composition.selection)
    XCTAssertNil(composition.schedules.lease)
    XCTAssertEqual(composition.schedules.state, .idle)
    XCTAssertTrue(composition.schedules.schedules.isEmpty)
    XCTAssertEqual(composition.lifecycleGeneration, 1)
  }

  func testPresentationDeactivationPreventsLateInstallStateFromBeingAccepted() async {
    let gateway = RemoteIntegrationsControllerGateway(blockInstall: true)
    let composition = RemoteIntegrationsComposition(gateway: gateway)
    composition.activate(
      RemoteIntegrationsHostSelection(
        name: "Fixture Host",
        access: remoteIntegrationsAccess(remoteIntegrationsLease())
      )
    )

    let install = Task { await composition.update.install() }
    await gateway.waitForInstall()
    composition.deactivateTransientWork()
    await gateway.releaseInstall()
    await install.value

    XCTAssertNil(composition.update.lease)
    XCTAssertNil(composition.update.notice)
    XCTAssertFalse(composition.update.isMutating)
    let counts = await gateway.counts
    XCTAssertEqual(counts.updateMutations, 1)
  }
}

private actor RemoteIntegrationsControllerGateway: RemoteIntegrationsGateway {
  struct Counts: Sendable {
    let updateReads: Int
    let updateMutations: Int
    let scheduleReads: Int
    let scheduleMutations: Int
    let prReads: Int
    let prMutations: Int
  }

  private var updateReads = 0
  private var updateMutations = 0
  private var scheduleReads = 0
  private var scheduleMutations = 0
  private var prReads = 0
  private var prMutations = 0
  private var updateMutationError: RemoteIntegrationsGatewayError?
  private var scheduleMutationError: RemoteIntegrationsGatewayError?
  private var prMutationError: RemoteIntegrationsGatewayError?
  private let blockFirstScheduleRead: Bool
  private let blockInstall: Bool
  private var firstScheduleReadStarted = false
  private var installStarted = false
  private var startWaiters: [CheckedContinuation<Void, Never>] = []
  private var installStartWaiters: [CheckedContinuation<Void, Never>] = []
  private var release: CheckedContinuation<Void, Never>?
  private var installRelease: CheckedContinuation<Void, Never>?

  init(blockFirstScheduleRead: Bool = false, blockInstall: Bool = false) {
    self.blockFirstScheduleRead = blockFirstScheduleRead
    self.blockInstall = blockInstall
  }

  var counts: Counts {
    Counts(
      updateReads: updateReads,
      updateMutations: updateMutations,
      scheduleReads: scheduleReads,
      scheduleMutations: scheduleMutations,
      prReads: prReads,
      prMutations: prMutations
    )
  }

  func setUpdateMutationError(_ value: RemoteIntegrationsGatewayError?) {
    updateMutationError = value
  }
  func setScheduleMutationError(_ value: RemoteIntegrationsGatewayError?) {
    scheduleMutationError = value
  }
  func setPRMutationError(_ value: RemoteIntegrationsGatewayError?) {
    prMutationError = value
  }

  func hostUpdate(
    lease: RemoteIntegrationsHostLease
  ) -> RemoteIntegrationsHostUpdateState {
    updateReads += 1
    return .init(currentVersion: "1.0", status: .unavailable)
  }

  func checkHostUpdate(
    lease: RemoteIntegrationsHostLease
  ) throws -> RemoteIntegrationsHostUpdateState {
    updateMutations += 1
    if let updateMutationError { throw updateMutationError }
    return .init(currentVersion: "1.0", status: .unavailable)
  }

  func installHostUpdate(lease: RemoteIntegrationsHostLease) async throws {
    updateMutations += 1
    if blockInstall {
      installStarted = true
      let waiters = installStartWaiters
      installStartWaiters.removeAll()
      for waiter in waiters { waiter.resume() }
      await withCheckedContinuation { installRelease = $0 }
    }
    if let updateMutationError { throw updateMutationError }
  }

  func schedules(
    lease: RemoteIntegrationsHostLease
  ) async -> RemoteIntegrationsSchedulesResponse {
    scheduleReads += 1
    if blockFirstScheduleRead, scheduleReads == 1 {
      firstScheduleReadStarted = true
      let waiters = startWaiters
      startWaiters.removeAll()
      for waiter in waiters { waiter.resume() }
      await withCheckedContinuation { release = $0 }
    }
    return .init(schedules: [], schedule: nil)
  }

  func scheduleRuns(
    id: String,
    lease: RemoteIntegrationsHostLease
  ) -> RemoteIntegrationsScheduleRunsResponse {
    .init(runs: [])
  }

  func scheduleCommand(
    _ command: RemoteIntegrationsScheduleCommand,
    lease: RemoteIntegrationsHostLease
  ) throws -> RemoteIntegrationsSchedulesResponse {
    scheduleMutations += 1
    if let scheduleMutationError { throw scheduleMutationError }
    return .init(schedules: [], schedule: nil)
  }

  func prWatch(
    _ key: RemoteIntegrationsPRWatchKey,
    lease: RemoteIntegrationsHostLease
  ) -> RemoteIntegrationsPRWatchResponse {
    prReads += 1
    return .init(watch: nil)
  }

  func checkPRWatch(
    _ key: RemoteIntegrationsPRWatchKey,
    lease: RemoteIntegrationsHostLease
  ) throws {
    prMutations += 1
    if let prMutationError { throw prMutationError }
  }

  func upsertPRWatch(
    _ input: RemoteIntegrationsPRWatchInput,
    lease: RemoteIntegrationsHostLease
  ) throws -> RemoteIntegrationsPRWatch {
    prMutations += 1
    if let prMutationError { throw prMutationError }
    throw RemoteIntegrationsGatewayError.invalidResponse
  }

  func deletePRWatch(
    _ key: RemoteIntegrationsPRWatchKey,
    lease: RemoteIntegrationsHostLease
  ) throws {
    prMutations += 1
    if let prMutationError { throw prMutationError }
  }

  func waitForFirstScheduleRead() async {
    guard !firstScheduleReadStarted else { return }
    await withCheckedContinuation { startWaiters.append($0) }
  }

  func releaseFirstScheduleRead() {
    release?.resume()
    release = nil
  }

  func waitForInstall() async {
    guard !installStarted else { return }
    await withCheckedContinuation { installStartWaiters.append($0) }
  }

  func releaseInstall() {
    installRelease?.resume()
    installRelease = nil
  }
}
