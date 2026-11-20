import XCTest
@testable import App

@MainActor final class SavedCrewsControllerTests: XCTestCase {
  private func selection() -> SettingsHostSelection {
    .init(name: "Fixture", access: .init(lease: .init(connectionID: ClientConnectionID(), generation: 1),
      protocolVersion: ProtocolConstants.remoteProtocolVersion, isOnline: true, isReady: true,
      capabilities: [.sessionRead, .sessionOperate]))
  }

  private func crew(_ id: String = "review") -> SavedCrew {
    .init(id: id, name: "Review", lead: .init(agentKind: "alpha", model: "pro"), policy: .crewOnly,
      roles: [.init(id: "helper", label: "Helper", selection: .init(agentKind: "beta", model: "mini"))])
  }

  private func gateway(_ crews: [JSONValue]? = []) throws -> CrewsSettingsGatewayDouble {
    var settings = try JSONDecoding.decode(SettingsReadResponse.self,
      from: SettingsFixtures.data(SettingsFixtures.settingsResponse)).settings
    settings.crews = crews
    return CrewsSettingsGatewayDouble(settings)
  }

  func testSaveReadsTheLatestHostStateAndPatchesOnlyCrews() async throws {
    let gateway = try gateway([crew().wire]), selection = selection()
    let controller = SavedCrewsController(gateway: gateway, now: { 100 })
    controller.activate(selection)
    await controller.load()
    var latest = crew(); latest.favorite = true; latest.lastUsedAt = 42
    let other = crew("other")
    await gateway.replace([latest.wire, other.wire])
    var edited = crew(); edited.name = "Edited"
    let applied = await controller.apply(.upsert(edited, basedOn: crew()), lease: selection.lease)
    XCTAssertTrue(applied)
    let patches = await gateway.patches
    XCTAssertEqual(patches.count, 1)
    XCTAssertEqual(Set(patches[0].values.keys), [.crews])
    XCTAssertEqual(controller.crews[0].name, "Edited")
    XCTAssertEqual(controller.crews[0].favorite, true)
    XCTAssertEqual(controller.crews[0].lastUsedAt, 42)
    XCTAssertEqual(controller.crews[1].wire, other.wire)
  }

  func testAmbiguousAppliedWriteIsReadBackExactlyOnceWithoutRetry() async throws {
    let gateway = try gateway(), selection = selection()
    await gateway.behave(.ambiguousApplied)
    let controller = SavedCrewsController(gateway: gateway)
    controller.activate(selection)
    let applied = await controller.apply(.upsert(crew(), basedOn: nil), lease: selection.lease)
    XCTAssertTrue(applied)
    let writes = await gateway.patches.count, reads = await gateway.readCount
    XCTAssertEqual(writes, 1)
    XCTAssertEqual(reads, 2)
    XCTAssertTrue(controller.ambiguousResultRefreshed)
    XCTAssertNil(controller.failure)
  }

  func testOldHostDroppingTheOptionalKeyDoesNotProduceASuccess() async throws {
    let gateway = try gateway(nil), selection = selection()
    await gateway.behave(.ignoreWrite)
    let controller = SavedCrewsController(gateway: gateway)
    controller.activate(selection)
    let applied = await controller.apply(.upsert(crew(), basedOn: nil), lease: selection.lease)
    XCTAssertFalse(applied)
    XCTAssertEqual(controller.failure, .mutation(.notApplied))
    let count = await gateway.patches.count
    XCTAssertEqual(count, 1)
  }

  func testHostSwitchWhileReadingStopsTheWriteAndDoesNotInstallAnotherHostsData() async throws {
    let gateway = try gateway([crew().wire]), first = selection(), second = selection()
    await gateway.blockNextRead()
    let controller = SavedCrewsController(gateway: gateway)
    controller.activate(first)
    let baseline = crew()
    let mutation = Task { await controller.apply(.delete(baseline), lease: first.lease) }
    await gateway.waitForRead()
    controller.activate(second)
    await gateway.releaseRead()
    let applied = await mutation.value
    XCTAssertFalse(applied)
    XCTAssertNil(controller.document)
    XCTAssertEqual(controller.selection, second)
    let writes = await gateway.patches
    XCTAssertTrue(writes.isEmpty)
  }

  func testLateCrewLoadCannotReplaceTheSelectedDesktopSnapshot() async throws {
    let original = crew("host-a")
    let current = crew("host-b")
    let gateway = try gateway([original.wire])
    let first = selection(), second = selection()
    let controller = SavedCrewsController(gateway: gateway)
    controller.activate(first)
    await gateway.blockNextRead()
    let stale = Task { await controller.load() }
    await gateway.waitForRead()

    controller.activate(second)
    XCTAssertTrue(controller.crews.isEmpty)
    await gateway.replace([current.wire])
    await controller.load()
    await gateway.releaseRead()
    await stale.value

    XCTAssertEqual(controller.selection, second)
    XCTAssertEqual(controller.crews.map(\.wire), [current.wire])
    XCTAssertEqual(controller.state, .loaded)
  }

  func testConcurrentTapDoesNotCancelAnAcceptedMutation() async throws {
    let gateway = try gateway(), selection = selection()
    await gateway.blockNextRead()
    let controller = SavedCrewsController(gateway: gateway)
    controller.activate(selection)
    let firstCrew = crew(), other = crew("other")
    let first = Task { await controller.apply(.upsert(firstCrew, basedOn: nil), lease: selection.lease) }
    await gateway.waitForRead()
    let secondApplied = await controller.apply(.upsert(other, basedOn: nil), lease: selection.lease)
    XCTAssertFalse(secondApplied)
    await gateway.releaseRead()
    let firstApplied = await first.value
    XCTAssertTrue(firstApplied)
    let patches = await gateway.patches
    XCTAssertEqual(patches.count, 1)
    XCTAssertEqual(controller.crews.map(\.id), [firstCrew.id])
  }

  func testSameLeaseConnectivityUpdatesKeepTheAcceptedMutationOwner() async throws {
    let gateway = try gateway(), selection = selection()
    await gateway.blockNextRead()
    let controller = SavedCrewsController(gateway: gateway)
    controller.activate(selection)
    let value = crew()
    let mutation = Task { await controller.apply(.upsert(value, basedOn: nil), lease: selection.lease) }
    await gateway.waitForRead()
    let offline = SettingsHostSelection(name: "Fixture", access: .init(lease: selection.lease,
      protocolVersion: ProtocolConstants.remoteProtocolVersion, isOnline: false, isReady: true,
      capabilities: [.sessionRead, .sessionOperate]))
    controller.activate(offline)
    XCTAssertTrue(controller.isMutating)
    XCTAssertFalse(controller.canWrite)
    controller.activate(selection)
    await controller.load()
    XCTAssertTrue(controller.isMutating)
    await gateway.releaseRead()
    let applied = await mutation.value
    XCTAssertTrue(applied)
    XCTAssertEqual(controller.crews.map(\.id), [value.id])
    let writes = await gateway.patches.count, reads = await gateway.readCount
    XCTAssertEqual(writes, 1)
    XCTAssertEqual(reads, 1)
  }
}

private actor CrewsSettingsGatewayDouble: SettingsSessionGateway {
  enum Behavior: Equatable, Sendable { case success, ambiguousApplied, ignoreWrite }
  private var document: SettingsDocument
  private var behavior: Behavior = .success
  private var block = false
  private var blocked = false
  private var blockedWaiters: [CheckedContinuation<Void, Never>] = []
  private var release: CheckedContinuation<Void, Never>?
  private(set) var patches: [SettingsPatch] = []
  private(set) var readCount = 0

  init(_ document: SettingsDocument) { self.document = document }
  func behave(_ behavior: Behavior) { self.behavior = behavior }
  func replace(_ values: [JSONValue]) { document.crews = values }
  func blockNextRead() { block = true }
  func waitForRead() async {
    if blocked { return }
    await withCheckedContinuation { blockedWaiters.append($0) }
  }
  func releaseRead() { release?.resume(); release = nil; blocked = false }

  func readSettings(lease: SettingsHostLease) async throws -> SettingsReadResponse {
    readCount += 1
    let captured = document
    if block {
      block = false; blocked = true
      blockedWaiters.forEach { $0.resume() }; blockedWaiters = []
      await withCheckedContinuation { release = $0 }
    }
    return .init(settings: captured)
  }

  func writeSettings(_ patch: SettingsPatch, lease: SettingsHostLease) async throws -> SettingsReadResponse {
    patches.append(patch)
    if behavior != .ignoreWrite, let value = patch[.crews] {
      document.crews = try JSONDecoding.decode([JSONValue].self, from: JSONDecoding.encoder.encode(value))
    }
    if behavior == .ambiguousApplied { throw SettingsGatewayError.ambiguousOutcome }
    return .init(settings: document)
  }

  func agentStatuses(lease: SettingsHostLease) async throws -> SettingsAgentStatuses { throw SettingsGatewayError.transport }
  func providerUsage(lease: SettingsHostLease) async throws -> SettingsProviderUsage { throw SettingsGatewayError.transport }
  func profileDevices(lease: SettingsHostLease) async throws -> SettingsProfileDevices { throw SettingsGatewayError.transport }
  func profileCoreStats(_ request: SettingsProfileStatsRequest, lease: SettingsHostLease) async throws -> SettingsProfileCoreStats { throw SettingsGatewayError.transport }
  func profileTokenStats(_ request: SettingsProfileStatsRequest, lease: SettingsHostLease) async throws -> SettingsProfileTokenStats { throw SettingsGatewayError.transport }
  func setProfileIdentity(_ identity: SettingsProfileIdentity, lease: SettingsHostLease) async throws -> SettingsProfileIdentityResponse { throw SettingsGatewayError.transport }
}
