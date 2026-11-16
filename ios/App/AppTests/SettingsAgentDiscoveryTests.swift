import XCTest
@testable import App

@MainActor final class SettingsAgentDiscoveryTests: XCTestCase {
  func testExplicitDiscoveryUsesGeneratedProcedureAndThePWALongTimeout() async throws {
    SettingsURLProtocol.reset()
    try SettingsURLProtocol.enqueue(["result": ["windows": SettingsFixtures.agentStatuses["windows"]!, "wsl": [], "fromCache": false]])
    let result = try await makeSettingsClient().settingsDiscoverAgents(.init(wslDistros: ["Ubuntu"]))
    XCTAssertFalse(result.fromCache)
    XCTAssertEqual(result.windows.first?.kind, "codex")
    let request = try XCTUnwrap(SettingsURLProtocol.requests.first)
    XCTAssertEqual(request.url?.path, "/prefix/api/git/call")
    XCTAssertEqual(request.httpMethod, "POST")
    XCTAssertEqual(request.timeoutInterval, 300)
    XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer host-token")
    let body = try JSONDecoder().decode(SettingsJSON.self, from: XCTUnwrap(SettingsURLProtocol.bodies.first!))
    XCTAssertEqual(body.objectValue?["procedure"], .string("refreshAgentStatuses"))
    XCTAssertEqual(body.objectValue?["payload"]?.objectValue?["wslDistros"], .array([.string("Ubuntu")]))
    XCTAssertEqual(SettingsURLProtocol.requestCount, 1)
  }

  func testMalformedScopeIsRefusedBeforeDialAndAnOlderHostIsNotRetried() async throws {
    SettingsURLProtocol.reset()
    do {
      _ = try await makeSettingsClient().settingsDiscoverAgents(.init(wslDistros: [""]))
      XCTFail("Invalid distro must fail validation")
    } catch {}
    XCTAssertEqual(SettingsURLProtocol.requestCount, 0)
    try SettingsURLProtocol.enqueue(["error": "Unsupported procedure", "code": "git_procedure_not_allowed"], status: 403)
    do {
      _ = try await makeSettingsClient().settingsDiscoverAgents(.init(wslDistros: []))
      XCTFail("Older host must reject discovery")
    } catch let error as RemoteClientError {
      XCTAssertEqual(error.status, 403)
    }
    XCTAssertEqual(SettingsURLProtocol.requestCount, 1)
  }

  func testUncertainAndMalformedSuccessfulDiscoveryRemainSingleAttempt() async throws {
    for response in [false, true] {
      SettingsURLProtocol.reset()
      if response { try SettingsURLProtocol.enqueue(["result": ["fromCache": "wrong-type"]]) }
      do {
        _ = try await makeSettingsClient().settingsDiscoverAgents(.init(wslDistros: []))
        XCTFail("Expected an uncertain result")
      } catch SettingsRemoteMutationError.ambiguousOutcome {}
      XCTAssertEqual(SettingsURLProtocol.requestCount, 1)
    }
  }

  func testPageReadsNeverDiscoverAndExplicitDiscoveryPublishesTheFreshInventory() async throws {
    let gateway = try DiscoveryGateway(), controller = SettingsHostInformationController(gateway: gateway)
    let lease = settingsLease(); controller.activate(lease)
    await controller.refresh(.agents)
    let before = await gateway.counts
    XCTAssertEqual(before.scans, 0); XCTAssertEqual(before.reads, 1)
    await controller.discoverAgents(.init(wslDistros: ["Ubuntu"]), lease: lease)
    let after = await gateway.counts
    XCTAssertEqual(after.scans, 1); XCTAssertEqual(after.reads, 2)
    XCTAssertEqual(controller.agentStatuses?.windows.first?.kind, "fresh")
    XCTAssertEqual(controller.agentStatuses?.wsl.first?.composerRecord?.envDistro, "Ubuntu")
    XCTAssertEqual(controller.agentsState, .loaded)
    XCTAssertFalse(controller.isDiscoveringAgents)
  }

  func testConcurrentRefreshesCoalesceAndCallerCancellationDoesNotCancelTheHostProbe() async throws {
    let gateway = try DiscoveryGateway(blocked: true), controller = SettingsHostInformationController(gateway: gateway)
    let lease = settingsLease(); controller.activate(lease)
    let first = Task { await controller.discoverAgents(.init(wslDistros: []), lease: lease) }
    await gateway.waitForScan()
    XCTAssertTrue(controller.isDiscoveringAgents)
    let second = Task { await controller.discoverAgents(.init(wslDistros: []), lease: lease) }
    let read = Task { await controller.refresh(.agents) }
    first.cancel()
    await gateway.releaseScan()
    await first.value; await second.value; await read.value
    let counts = await gateway.counts
    XCTAssertEqual(counts.scans, 1); XCTAssertEqual(counts.reads, 1)
    XCTAssertEqual(controller.agentsState, .loaded)
  }

  func testSourceSwitchKeepsTheNewHostCleanAndRejectsStaleStarts() async throws {
    let gateway = try DiscoveryGateway(blocked: true), controller = SettingsHostInformationController(gateway: gateway)
    let first = settingsLease(), second = settingsLease("2")
    controller.activate(first)
    let task = Task { await controller.discoverAgents(.init(wslDistros: []), lease: first) }
    await gateway.waitForScan()
    controller.activate(second)
    await gateway.releaseScan(); await task.value
    XCTAssertNil(controller.agentStatuses)
    XCTAssertEqual(controller.agentsState, .idle)
    XCTAssertFalse(controller.isDiscoveringAgents)
    await controller.discoverAgents(.init(wslDistros: []), lease: first)
    let counts = await gateway.counts
    XCTAssertEqual(counts.scans, 1); XCTAssertEqual(counts.reads, 0)
  }

  func testRejectedDiscoveryRetainsKnownDataAndDoesNotPretendToRefreshFromCache() async throws {
    let gateway = try DiscoveryGateway(rejects: true), controller = SettingsHostInformationController(gateway: gateway)
    let lease = settingsLease(); controller.activate(lease)
    await controller.refresh(.agents)
    let previous = controller.agentStatuses
    await controller.discoverAgents(.init(wslDistros: []), lease: lease)
    XCTAssertEqual(controller.agentStatuses, previous)
    XCTAssertEqual(controller.agentsState, .failed(.authorizationDenied))
    let counts = await gateway.counts
    XCTAssertEqual(counts.scans, 1); XCTAssertEqual(counts.reads, 1)
  }

  func testDiscoveryPreservesOtherDistrosButDoesNotReviveRemovedOrSupersededEntries() throws {
    let ubuntu = try discoveryStatus("ubuntu-new", distro: "Ubuntu"), debian = try discoveryStatus("debian", distro: "Debian")
    let old = SettingsAgentStatuses(windows: [], wsl: [try discoveryStatus("ubuntu-old", distro: "Ubuntu"), debian], updatedAt: "old")
    let discovered = SettingsAgentDiscoveryResult(windows: [], wsl: [ubuntu, debian], fromCache: false)
    let fetched = SettingsAgentStatuses(windows: [], wsl: [], updatedAt: "new")
    let merged = fetched.mergingDiscovery(discovered, requestedDistros: ["Ubuntu"], previous: old)
    XCTAssertEqual(merged.wsl.map(\.kind), ["ubuntu-new", "debian"])
    XCTAssertEqual(merged.updatedAt, "new")
    let complete = SettingsAgentStatuses(windows: [], wsl: [try discoveryStatus("authoritative", distro: "Ubuntu")], updatedAt: "new")
    XCTAssertEqual(complete.mergingDiscovery(discovered, requestedDistros: ["Ubuntu"], previous: old).wsl.map(\.kind), ["authoritative", "debian"])
    let removed = fetched.mergingDiscovery(.init(windows: [], wsl: [], fromCache: false), requestedDistros: ["Ubuntu"], previous: old)
    XCTAssertEqual(removed.wsl.map(\.kind), ["debian"])
  }

  func testUncertainDiscoveryReconcilesExactlyOnceAndRetainsUncertainFeedback() async throws {
    for failedRead in [false, true] {
      let gateway = try DiscoveryGateway(ambiguous: true, failingReads: failedRead)
      let controller = SettingsHostInformationController(gateway: gateway), lease = settingsLease()
      controller.activate(lease)
      await controller.discoverAgents(.init(wslDistros: []), lease: lease)
      let counts = await gateway.counts
      XCTAssertEqual(counts.scans, 1); XCTAssertEqual(counts.reads, 1)
      XCTAssertEqual(controller.agentsState, .failed(.ambiguousOutcome))
      XCTAssertEqual(controller.agentStatuses?.windows.first?.kind, failedRead ? nil : "fresh")
    }
  }

  func testManualRefreshAlsoReadsPreferencesChangedByAnotherClient() async throws {
    let gateway = try DiscoveryGateway(), composition = SettingsComposition(gateway: gateway)
    let selection = discoverySelection()
    composition.activate(selection); await composition.document.load()
    XCTAssertEqual(composition.document.document?.disabledAgents, [])
    try await gateway.changeDisabledAgents(["external-client-change"])
    await composition.refreshAgentSettings(.init(wslDistros: []), lease: selection.lease)
    XCTAssertEqual(composition.document.document?.disabledAgents, ["external-client-change"])
    let counts = await gateway.counts
    XCTAssertEqual(counts.scans, 1); XCTAssertEqual(counts.settingsReads, 2)
    let readonly = discoverySelection(capabilities: [.sessionRead])
    composition.activate(readonly)
    await composition.refreshAgentSettings(.init(wslDistros: []), lease: readonly.lease)
    let after = await gateway.counts
    XCTAssertEqual(after.scans, 1)
  }

  func testAJoinedPageRefreshCannotCancelAnInFlightPreferenceWrite() async throws {
    let gateway = try DiscoveryGateway(blocked: true, blockWrites: true)
    let composition = SettingsComposition(gateway: gateway), selection = discoverySelection()
    composition.activate(selection); await composition.document.load()
    let scan = Task { await composition.discoverAgents(.init(wslDistros: []), lease: selection.lease) }
    await gateway.waitForScan()
    let refresh = Task { await composition.refresh(route: .agents, query: .init()) }
    let write = Task { await composition.writeSettings(.init(values: [.disabledAgents: .array([.string("user-choice")])])) }
    await gateway.waitForWrite()
    await gateway.releaseScan(); await scan.value; await refresh.value
    XCTAssertTrue(composition.document.isWriting)
    let whileWriting = await gateway.counts
    XCTAssertEqual(whileWriting.settingsReads, 1)
    await gateway.releaseWrite(); await write.value
    let wasCancelled = await gateway.writeWasCancelled
    XCTAssertFalse(wasCancelled)
    XCTAssertEqual(composition.document.document?.disabledAgents, ["user-choice"])
    XCTAssertEqual(composition.mutationNotice, .saved)
  }

  func testAJoinedRefreshCannotReplaceUncertainPreferenceWriteReconciliation() async throws {
    let gateway = try DiscoveryGateway(blocked: true, ambiguousWrites: true, blockReconciliation: true)
    let composition = SettingsComposition(gateway: gateway), selection = discoverySelection()
    composition.activate(selection); await composition.document.load()
    let scan = Task { await composition.discoverAgents(.init(wslDistros: []), lease: selection.lease) }
    await gateway.waitForScan()
    let refresh = Task { await composition.refresh(route: .agents, query: .init()) }
    let write = Task { await composition.writeSettings(.init(values: [.disabledAgents: .array([.string("choice")])])) }
    await gateway.waitForReconciliation()
    XCTAssertTrue(composition.isMutating)
    XCTAssertFalse(composition.document.isWriting)
    await gateway.releaseScan(); await scan.value; await refresh.value
    let counts = await gateway.counts
    XCTAssertEqual(counts.settingsReads, 2, "Initial read plus exactly one write reconciliation")
    await gateway.releaseReconciliation(); await write.value
    let cancelled = await gateway.reconciliationWasCancelled
    XCTAssertFalse(cancelled)
    XCTAssertEqual(composition.mutationNotice, .ambiguousRefreshed)
  }
}

private func discoverySelection(capabilities: Set<SettingsCapability> = [.sessionRead, .sessionOperate]) -> SettingsHostSelection {
  .init(name: "Fixture", access: .init(lease: settingsLease(), protocolVersion: ProtocolConstants.remoteProtocolVersion,
    isOnline: true, isReady: true, capabilities: capabilities))
}

private func discoveryStatus(_ kind: String, distro: String? = nil) throws -> SettingsAgentStatus {
  var value: [String: SettingsJSON] = ["kind": .string(kind), "label": .string(kind), "installed": .bool(true),
    "authState": .string("authenticated"), "capabilities": .object([:]), "envKind": .string(distro == nil ? "posix" : "wsl")]
  if let distro { value["envDistro"] = .string(distro) }
  return try .init(payload: .object(value))
}

private actor DiscoveryGateway: SettingsSessionGateway {
  private var scanned = false
  private var reads = 0
  private var scans = 0
  private let blocked: Bool
  private let rejects: Bool
  private let ambiguous: Bool
  private let failingReads: Bool
  private let blockWrites: Bool
  private let ambiguousWrites: Bool
  private let blockReconciliation: Bool
  private var reconciliationStarted = false
  private var reconciliationWaiters: [CheckedContinuation<Void, Never>] = []
  private var reconciliationRelease: CheckedContinuation<Void, Never>?
  private(set) var reconciliationWasCancelled = false
  private var settingsValue: SettingsReadResponse
  private var settingsReads = 0
  private var writes = 0
  private(set) var writeWasCancelled = false
  private let discovered: SettingsAgentDiscoveryResult
  private var startedWaiters: [CheckedContinuation<Void, Never>] = []
  private var release: CheckedContinuation<Void, Never>?
  private var writeStartedWaiters: [CheckedContinuation<Void, Never>] = []
  private var writeRelease: CheckedContinuation<Void, Never>?
  init(blocked: Bool = false, rejects: Bool = false, ambiguous: Bool = false,
    failingReads: Bool = false, blockWrites: Bool = false,
    ambiguousWrites: Bool = false, blockReconciliation: Bool = false) throws {
    self.blocked = blocked; self.rejects = rejects; self.ambiguous = ambiguous
    self.failingReads = failingReads; self.blockWrites = blockWrites
    self.ambiguousWrites = ambiguousWrites; self.blockReconciliation = blockReconciliation
    settingsValue = try JSONDecoder().decode(SettingsReadResponse.self, from: SettingsFixtures.data(SettingsFixtures.settingsResponse))
    discovered = .init(windows: [try discoveryStatus("fresh")], wsl: [try discoveryStatus("wsl", distro: "Ubuntu")], fromCache: false)
  }
  var counts: (reads: Int, scans: Int, settingsReads: Int) { (reads, scans, settingsReads) }
  func waitForScan() async {
    if scanned { return }
    await withCheckedContinuation { startedWaiters.append($0) }
  }
  func releaseScan() { release?.resume(); release = nil }
  func discoverAgents(_ request: SettingsAgentDiscoveryRequest, lease: SettingsHostLease) async throws -> SettingsAgentDiscoveryResult {
    scans += 1; scanned = true
    startedWaiters.forEach { $0.resume() }; startedWaiters.removeAll()
    if blocked { await withCheckedContinuation { release = $0 } }
    if rejects { throw SettingsGatewayError.http(statusCode: 403, code: "git_procedure_not_allowed", missingScope: nil) }
    if ambiguous { throw SettingsGatewayError.ambiguousOutcome }
    return discovered
  }
  func agentStatuses(lease: SettingsHostLease) throws -> SettingsAgentStatuses {
    reads += 1
    if failingReads { throw SettingsGatewayError.transport }
    return .init(windows: [try discoveryStatus(scanned ? "fresh" : "cached")], wsl: [], updatedAt: "2026-11-16T12:00:00Z")
  }
  func readSettings(lease: SettingsHostLease) async -> SettingsReadResponse {
    settingsReads += 1
    if blockReconciliation, settingsReads == 2 {
      reconciliationStarted = true
      reconciliationWaiters.forEach { $0.resume() }; reconciliationWaiters.removeAll()
      await withCheckedContinuation { reconciliationRelease = $0 }
      reconciliationWasCancelled = Task.isCancelled
    }
    return settingsValue
  }
  func waitForReconciliation() async {
    if reconciliationStarted { return }
    await withCheckedContinuation { reconciliationWaiters.append($0) }
  }
  func releaseReconciliation() { reconciliationRelease?.resume(); reconciliationRelease = nil }
  func changeDisabledAgents(_ agents: [String]) throws {
    var object = try JSONDecoder().decode(SettingsJSON.self, from: JSONEncoder().encode(settingsValue.settings)).objectValue ?? [:]
    object["disabledAgents"] = .array(agents.map(SettingsJSON.string))
    settingsValue = try JSONDecoder().decode(SettingsReadResponse.self, from: JSONEncoder().encode(SettingsJSON.object(["settings": .object(object)])))
  }
  func waitForWrite() async {
    if writes > 0 { return }
    await withCheckedContinuation { writeStartedWaiters.append($0) }
  }
  func releaseWrite() { writeRelease?.resume(); writeRelease = nil }
  func writeSettings(_ patch: SettingsPatch, lease: SettingsHostLease) async throws -> SettingsReadResponse {
    writes += 1
    writeStartedWaiters.forEach { $0.resume() }; writeStartedWaiters.removeAll()
    if blockWrites { await withCheckedContinuation { writeRelease = $0 } }
    writeWasCancelled = Task.isCancelled
    if ambiguousWrites { throw SettingsGatewayError.ambiguousOutcome }
    if let agents = patch.values[.disabledAgents]?.arrayValue?.compactMap(\.stringValue) { try changeDisabledAgents(agents) }
    return settingsValue
  }
  func providerUsage(lease: SettingsHostLease) throws -> SettingsProviderUsage { throw SettingsGatewayError.transport }
  func profileDevices(lease: SettingsHostLease) throws -> SettingsProfileDevices { throw SettingsGatewayError.transport }
  func profileCoreStats(_ request: SettingsProfileStatsRequest, lease: SettingsHostLease) throws -> SettingsProfileCoreStats { throw SettingsGatewayError.transport }
  func profileTokenStats(_ request: SettingsProfileStatsRequest, lease: SettingsHostLease) throws -> SettingsProfileTokenStats { throw SettingsGatewayError.transport }
  func setProfileIdentity(_ identity: SettingsProfileIdentity, lease: SettingsHostLease) throws -> SettingsProfileIdentityResponse { throw SettingsGatewayError.transport }
}
