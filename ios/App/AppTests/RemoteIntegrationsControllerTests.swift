import XCTest

@testable import App

@MainActor
final class RemoteIntegrationsControllerTests: XCTestCase {
  private func automationRun(_ id: String, status: String = "succeeded") throws -> RemoteIntegrationsScheduleRun {
    try JSONDecoding.decoder.decode(RemoteIntegrationsScheduleRun.self, from: Data("""
      {"id":"\(id)","scheduleId":"schedule","threadId":"thread","startedAt":"2026-10-13T12:00:00.000Z","status":"\(status)"}
      """.utf8))
  }

  func testDetailCompletionSurvivesConcurrentInboxPolling() async throws {
    let gateway = RemoteIntegrationsControllerGateway(holdDetail: true)
    let running = try automationRun("run", status: "running")
    let cancelled = try automationRun("run", status: "cancelled")
    await gateway.setAutomationRows([running])
    await gateway.setDetailRows([cancelled])
    let controller = RemoteIntegrationsAutomationsController(gateway: gateway)
    controller.activate(remoteIntegrationsLease())
    await controller.load()
    let detail = Task { await controller.refreshRun(running) }
    await gateway.waitForDetailRead()
    await gateway.setAutomationRows([])
    await controller.load()
    await gateway.releaseDetailRead()
    await detail.value
    XCTAssertTrue(controller.runs.isEmpty)
    XCTAssertEqual(controller.latestRunStates[running.id]?.status, .cancelled)
  }

  func testLateDetailCannotReplaceMutationOrNewHostState() async throws {
    for changeHost in [false, true] {
      let gateway = RemoteIntegrationsControllerGateway(holdDetail: true)
      let running = try automationRun("run", status: "running")
      await gateway.setDetailRows([try automationRun("run", status: "succeeded")])
      let controller = RemoteIntegrationsAutomationsController(gateway: gateway)
      controller.activate(remoteIntegrationsLease())
      let detail = Task { await controller.refreshRun(running) }
      await gateway.waitForDetailRead()
      if changeHost { controller.activate(remoteIntegrationsLease(generation: 2)) }
      else {
        await gateway.setRunCommandResult(try automationRun("run", status: "cancelled"))
        await controller.cancel(running)
      }
      await gateway.releaseDetailRead()
      await detail.value
      XCTAssertEqual(controller.latestRunStates[running.id]?.status, changeHost ? nil : .cancelled)
    }
  }

  func testPollingPreservesInFlightInboxExpansion() async throws {
    let gateway = RemoteIntegrationsControllerGateway(holdInbox: true)
    let first = try (0..<50).map { try automationRun("run-\($0)") }
    let second = try (50..<100).map { try automationRun("run-\($0)") }
    await gateway.setAutomationRows(first, older: second)
    let controller = RemoteIntegrationsAutomationsController(gateway: gateway)
    controller.activate(remoteIntegrationsLease())
    await controller.load()
    let expansion = Task { await controller.load(more: true) }
    await gateway.waitForAutomationPage()
    await controller.load()
    await gateway.releaseAutomationPage()
    await expansion.value
    XCTAssertEqual(controller.runs.count, 100)
    let counts = await gateway.automationCounts
    XCTAssertEqual(counts.reads, 2)
  }

  func testOldHostInboxCannotReplaceCurrentHostState() async throws {
    let gateway = RemoteIntegrationsControllerGateway(holdFirstAutomation: true)
    await gateway.setAutomationRows([try automationRun("old")])
    let controller = RemoteIntegrationsAutomationsController(gateway: gateway)
    controller.activate(remoteIntegrationsLease(generation: 1))
    let old = Task { await controller.load() }
    await gateway.waitForAutomationRead()
    controller.activate(remoteIntegrationsLease(generation: 2))
    await gateway.setAutomationRows([try automationRun("new")])
    await controller.load()
    await gateway.releaseAutomationRead()
    await old.value
    XCTAssertEqual(controller.runs.map(\.id), ["new"])
    XCTAssertEqual(controller.state, .loaded)
  }

  func testAmbiguousDetailActionIsNotRetriedAndKeepsItsFailureAfterRefresh() async throws {
    let gateway = RemoteIntegrationsControllerGateway()
    await gateway.setScheduleMutationError(.ambiguousOutcome)
    let controller = RemoteIntegrationsAutomationsController(gateway: gateway)
    controller.activate(remoteIntegrationsLease())
    await controller.cancel(try automationRun("run"))
    let counts = await gateway.automationCounts
    XCTAssertEqual(counts.commands, 1)
    XCTAssertEqual(counts.reads, 1)
    XCTAssertFalse(controller.busy)
    XCTAssertNotNil(controller.mutationFailure)
    XCTAssertEqual(controller.state, .loaded)
  }

  func testInboxRetainsInspectedRunWithoutAccumulatingPreviousQueries() async throws {
    let gateway = RemoteIntegrationsControllerGateway()
    let inspected = try automationRun("inspected")
    await gateway.setAutomationRows([inspected])
    let controller = RemoteIntegrationsAutomationsController(gateway: gateway)
    controller.activate(remoteIntegrationsLease())
    await controller.load()
    await gateway.setAutomationRows([])
    await gateway.setRunCommandResult(inspected)
    await controller.mark(inspected, archived: true)
    XCTAssertTrue(controller.runs.isEmpty)
    XCTAssertEqual(Set(controller.latestRunStates.keys), [inspected.id])
    await gateway.setAutomationRows([try automationRun("other")])
    controller.filter = "all"
    await controller.load(reset: true)
    XCTAssertEqual(Set(controller.latestRunStates.keys), [inspected.id, "other"])
  }

  func testCompletionCapabilityOnlyGatesHeartbeatEvaluation() {
    var draft = RemoteIntegrationsAutomationDraft()
    draft.mode = "heartbeat"; draft.evaluateCompletion = true; draft.stopWhen = "Done"
    XCTAssertFalse(draft.completionIsAvailable(supported: false))
    XCTAssertTrue(draft.completionIsAvailable(supported: true))
    draft.mode = "new-thread"
    XCTAssertTrue(draft.completionIsAvailable(supported: false))
    draft.mode = "heartbeat"; draft.evaluateCompletion = false
    XCTAssertTrue(draft.completionIsAvailable(supported: false))
  }

  func testPausingAndEditingAutomationPreservesCompleteSelectionAndPolicy() throws {
    let raw = Data(#"""
      {
        "id":"995f9ee6-83de-44da-a90a-4f4e3425bbac","name":"Check progress","prompt":"Read progress",
        "agentKind":"codex","enabled":true,"projectId":null,
        "config":{"model":"member","effort":"","fast":false,"thinking":false,"contextSize":"default",
          "selectionBinding":{"version":1,"kind":"family-member","owner":{"agentKind":"codex","presentationMode":"gui"},"model":"member","inertValues":{"fast":false}}},
        "recurrence":{"kind":"cron","expression":"0 9 * * 1-5","timeZone":"US/Pacific"},
        "automation":{"version":1,"mode":{"kind":"heartbeat","targetThreadId":"target"},"maxRuntimeSeconds":3600,"maxIterations":4,
          "stopOnError":false,"misfirePolicy":"run-latest","retryPolicy":{"kind":"exponential","maxAttempts":3,"initialDelaySeconds":10,"maxDelaySeconds":60},
          "completionPolicy":{"kind":"ai-evaluated","stopWhen":"Progress is complete","confidenceThreshold":0.9}},
        "createdAt":"2026-10-13T12:00:00.000Z","updatedAt":"2026-10-13T12:00:00.000Z","lastStatus":"never"
      }
      """#.utf8)
    let task = try JSONDecoding.decoder.decode(RemoteIntegrationsScheduledTask.self, from: raw)
    let original = try JSONDecoding.decoder.decode(JSONValue.self, from: raw)
    let paused = try JSONDecoding.decoder.decode(JSONValue.self, from: JSONDecoding.encoder.encode(task.input(enabled: false)))
    XCTAssertEqual(paused["enabled"], .bool(false))
    XCTAssertEqual(paused["config"], original["config"])
    XCTAssertEqual(paused["automation"], original["automation"])
    var draft = RemoteIntegrationsScheduleDraft(task)
    draft.name = "Updated name"
    let edited = try JSONDecoding.decoder.decode(JSONValue.self, from: JSONDecoding.encoder.encode(draft.value()))
    XCTAssertEqual(edited["config"], original["config"])
    XCTAssertEqual(edited["automation"], original["automation"])
    XCTAssertEqual(edited["recurrence"], original["recurrence"])
  }

  func testSavedResultKeepsWaitingAndRetryCancellationAvailable() throws {
    for status in ["waiting-for-approval", "failed"] {
      let raw = Data("""
        {"id":"run","scheduleId":"schedule","threadId":"deleted","startedAt":"2026-10-13T12:00:00.000Z",
         "status":"\(status)","attempt":2,"iteration":4,
         "result":{"summary":"Saved progress","unread":true,"archivedAt":null,"stopReason":"retry-pending"}}
        """.utf8)
      let run = try JSONDecoding.decoder.decode(RemoteIntegrationsScheduleRun.self, from: raw)
      XCTAssertTrue(run.canCancel)
      XCTAssertTrue(run.unread)
      XCTAssertEqual(run.attempt, 2)
      XCTAssertEqual(run.iteration, 4)
    }
    XCTAssertNil(RemoteAutomationsStrings.stopReason("legacy-success"))
  }

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

  private var automationReads = 0
  private var runCommands = 0
  private var automationRows: [RemoteIntegrationsScheduleRun] = []
  private var olderRows: [RemoteIntegrationsScheduleRun] = []
  private var commandRun: RemoteIntegrationsScheduleRun?
  private let holdFirstAutomation: Bool
  private let holdInbox: Bool
  private let holdDetail: Bool
  private var detailRows: [RemoteIntegrationsScheduleRun] = []
  private var detailStarted = false
  private var detailWaiters: [CheckedContinuation<Void, Never>] = []
  private var detailRelease: CheckedContinuation<Void, Never>?
  private var automationStarted = false
  private var pageStarted = false
  private var automationWaiters: [CheckedContinuation<Void, Never>] = []
  private var pageWaiters: [CheckedContinuation<Void, Never>] = []
  private var automationRelease: CheckedContinuation<Void, Never>?
  private var pageRelease: CheckedContinuation<Void, Never>?
  var automationCounts: (reads: Int, commands: Int) { (automationReads, runCommands) }
  func setAutomationRows(_ rows: [RemoteIntegrationsScheduleRun], older: [RemoteIntegrationsScheduleRun] = []) { automationRows = rows; olderRows = older }
  func setDetailRows(_ rows: [RemoteIntegrationsScheduleRun]) { detailRows = rows }
  func waitForDetailRead() async { if !detailStarted { await withCheckedContinuation { detailWaiters.append($0) } } }
  func releaseDetailRead() { detailRelease?.resume(); detailRelease = nil }
  func setRunCommandResult(_ run: RemoteIntegrationsScheduleRun) { commandRun = run }
  func waitForAutomationRead() async { if !automationStarted { await withCheckedContinuation { automationWaiters.append($0) } } }
  func waitForAutomationPage() async { if !pageStarted { await withCheckedContinuation { pageWaiters.append($0) } } }
  func releaseAutomationRead() { automationRelease?.resume(); automationRelease = nil }
  func releaseAutomationPage() { pageRelease?.resume(); pageRelease = nil }

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

  init(blockFirstScheduleRead: Bool = false, blockInstall: Bool = false, holdFirstAutomation: Bool = false, holdInbox: Bool = false, holdDetail: Bool = false) {
    self.holdDetail = holdDetail
    self.holdFirstAutomation = holdFirstAutomation; self.holdInbox = holdInbox
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
  ) async -> RemoteIntegrationsScheduleRunsResponse {
    let rows = detailRows
    if holdDetail {
      detailStarted = true
      let waiters = detailWaiters; detailWaiters.removeAll()
      for waiter in waiters { waiter.resume() }
      await withCheckedContinuation { detailRelease = $0 }
    }
    return .init(runs: rows)
  }

  func scheduleCommand(
    _ command: RemoteIntegrationsScheduleCommand,
    lease: RemoteIntegrationsHostLease
  ) throws -> RemoteIntegrationsSchedulesResponse {
    scheduleMutations += 1
    if let scheduleMutationError { throw scheduleMutationError }
    return .init(schedules: [], schedule: nil)
  }

  func automations(_ input: JSONValue, lease: RemoteIntegrationsHostLease) async throws -> RemoteIntegrationsAutomationsResponse {
    automationReads += 1
    let rows = automationRows
    if holdFirstAutomation, automationReads == 1 {
      automationStarted = true
      let waiters = automationWaiters; automationWaiters.removeAll()
      for waiter in waiters { waiter.resume() }
      await withCheckedContinuation { automationRelease = $0 }
    }
    return .init(schedules: [], runs: rows, unreadCount: rows.count)
  }
  func scheduleInbox(_ input: JSONValue, lease: RemoteIntegrationsHostLease) async throws -> RemoteIntegrationsScheduleRunsResponse {
    if holdInbox {
      pageStarted = true
      let waiters = pageWaiters; pageWaiters.removeAll()
      for waiter in waiters { waiter.resume() }
      await withCheckedContinuation { pageRelease = $0 }
    }
    return .init(runs: olderRows)
  }
  func scheduleRunCommand(_ input: JSONValue, lease: RemoteIntegrationsHostLease) async throws -> RemoteIntegrationsRunCommandResponse {
    runCommands += 1
    if let scheduleMutationError { throw scheduleMutationError }
    return .init(run: commandRun, cancelled: nil)
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
