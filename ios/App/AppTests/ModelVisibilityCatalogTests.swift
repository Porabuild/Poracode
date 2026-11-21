import XCTest
@testable import App

@MainActor final class ModelVisibilityCatalogTests: XCTestCase {
  private struct Fixture: Decodable {
    struct Group: Decodable { let kind: String; let labels: [String]; let keys: [String] }
    let version: Int
    let agents: [SettingsAgentStatus]
    let providerOrder: [String]
    let savedHidden: [String: [String]]
    let expectedGroups: [Group]
    let expectedEffectiveHidden: [String: [String]]
  }

  private func fixture() throws -> Fixture {
    try ProjectFixtureLoader.decode(Fixture.self, named: "client-model-visibility.json")
  }

  func testCatalogMatchesPWAForFamiliesRuntimeKeysAndUnifiedRows() throws {
    let fixture = try fixture()
    let catalog = ModelVisibilityCatalog(agents: fixture.agents.compactMap(\.composerRecord), providerOrder: fixture.providerOrder)
    XCTAssertEqual(fixture.version, 1)
    XCTAssertEqual(catalog.groups.count, fixture.expectedGroups.count)
    for (group, expected) in zip(catalog.groups, fixture.expectedGroups) {
      XCTAssertEqual(group.id, expected.kind)
      XCTAssertEqual(group.rows.map(\.label), expected.labels)
      XCTAssertEqual(group.surfaces.map(\.key), expected.keys)
    }
    XCTAssertEqual(catalog.effectiveHidden(saved: fixture.savedHidden), fixture.expectedEffectiveHidden.mapValues(Set.init))
    XCTAssertFalse(catalog.rows.flatMap(\.targets).flatMap(\.modelIDs).contains("auto"))
    XCTAssertFalse(catalog.rows.contains { $0.label == "Never shown" })
  }

  func testRowEditsPreserveDefaultsRetiredIDsAndOtherSurfaceKeys() throws {
    let fixture = try fixture(), catalog = ModelVisibilityCatalog(agents: fixture.agents.compactMap(\.composerRecord), providerOrder: fixture.providerOrder)
    let hidden = catalog.effectiveHidden(saved: fixture.savedHidden)
    let family = try XCTUnwrap(catalog.groups.first?.rows.first)
    XCTAssertEqual(family.targets.first?.modelIDs, ["pro", "pro-fast"])
    XCTAssertEqual(ModelVisibilityCatalog.state(family, hidden: hidden), .all)
    XCTAssertEqual(ModelVisibilityCatalog.toggling([family], visible: false, hidden: hidden), ["family-fixture": ["pro", "pro-fast"]])
    let shared = catalog.groups[1].rows[0]
    XCTAssertEqual(ModelVisibilityCatalog.state(shared, hidden: hidden), .some)
    let shown = ModelVisibilityCatalog.toggling([shared], visible: true, hidden: hidden)
    XCTAssertEqual(shown["named-fixture"], ["remote/terminal", "retired-model"])
    XCTAssertEqual(shown["named-fixture-bridge"], [])
    XCTAssertNil(shown["unrelated"])
    let explicit = catalog.effectiveHidden(saved: ["family-fixture": []])
    XCTAssertEqual(explicit["family-fixture"], [])
  }

  func testSearchAndGlobalEditsCoverFamilyMembersAndEveryRuntime() throws {
    let fixture = try fixture(), catalog = ModelVisibilityCatalog(agents: fixture.agents.compactMap(\.composerRecord))
    XCTAssertEqual(catalog.rows.filter { $0.matches("pro-fast") }.map(\.label), ["Pro Family"])
    XCTAssertEqual(catalog.rows.filter { $0.matches("Bridge shared") }.map(\.label), ["Shared"])
    let hidden = catalog.settingAll(visible: false).mapValues(Set.init)
    XCTAssertEqual(ModelVisibilityCatalog.visibleCount(catalog.rows, hidden: hidden), 0)
    XCTAssertEqual(ModelVisibilityCatalog.state(catalog.rows, hidden: hidden), .none)
    let shown = catalog.settingAll(visible: true)
    XCTAssertTrue(shown.values.allSatisfy(\.isEmpty))
    XCTAssertEqual(Set(shown.keys), Set(hidden.keys))
  }

  func testBulkWriteIsSingleAuthoritativeMutationAndKeepsUnrelatedSettings() async throws {
    let gateway = try VisibilitySettingsGateway(), composition = SettingsComposition(gateway: gateway)
    let selection = selection()
    composition.activate(selection); await composition.document.load()
    let controller = SettingsModelVisibilityController(composition: composition, lease: selection.lease)
    let task = try XCTUnwrap(controller.setHidden(["fixture": ["model"]]))
    XCTAssertFalse(controller.canEdit)
    XCTAssertNil(controller.setHidden(["fixture": []]))
    await task.value
    let writes = await gateway.writes
    XCTAssertEqual(writes.count, 1)
    XCTAssertEqual(writes[0].values[.hiddenModels]?.objectValue?["unrelated"], .array([.string("keep-me")]))
    XCTAssertEqual(composition.document.document?.hiddenModels["fixture"], ["model"])
    XCTAssertTrue(controller.canEdit)
  }

  func testReadOnlyStaleAndNotYetLoadedSheetsCannotWrite() async throws {
    let gateway = try VisibilitySettingsGateway(), composition = SettingsComposition(gateway: gateway)
    let current = selection()
    composition.activate(current)
    let controller = SettingsModelVisibilityController(composition: composition, lease: current.lease)
    XCTAssertNil(controller.setHidden(["fixture": []]))
    await composition.document.load()
    let pending = try XCTUnwrap(controller.setHidden(["fixture": []]))
    composition.activate(selection(lease: settingsLease("2")))
    await pending.value
    XCTAssertFalse(controller.isCurrent)
    XCTAssertNil(controller.setHidden(["fixture": []]))
    let readonly = selection(capabilities: [.sessionRead])
    composition.activate(readonly); await composition.document.load()
    let disabled = SettingsModelVisibilityController(composition: composition, lease: readonly.lease)
    XCTAssertFalse(disabled.canEdit)
    XCTAssertNil(disabled.setHidden(["fixture": []]))
    let count = await gateway.writes.count
    XCTAssertEqual(count, 0)
  }

  func testRejectedSaveKeepsTheAuthoritativeVisibility() async throws {
    let gateway = try VisibilitySettingsGateway(rejects: true), composition = SettingsComposition(gateway: gateway)
    let current = selection(); composition.activate(current); await composition.document.load()
    let controller = SettingsModelVisibilityController(composition: composition, lease: current.lease)
    await controller.setHidden(["unrelated": []])?.value
    XCTAssertEqual(composition.document.document?.hiddenModels["unrelated"], ["keep-me"])
    XCTAssertNotNil(composition.mutationFailure)
    XCTAssertTrue(controller.canEdit)
  }

  func testSimpleModelVisibilitySeedsDefaultsAndHonorsExplicitShowAll() throws {
    let agent = try AgentStatusRecord(wire: .object([
      "kind": .string("provider"), "label": .string("Provider"), "installed": .bool(true),
      "authState": .string("authenticated"), "capabilities": .object([
        "models": .array(["old-a", "old-b"].map { .object(["id": .string($0), "label": .string($0)]) }),
        "defaultHiddenModels": .array([.string("old-a"), .string("old-b")]),
      ]),
    ]))
    let catalog = ModelVisibilityCatalog(agents: [agent])
    XCTAssertEqual(catalog.effectiveHidden(saved: [:])["provider"], ["old-a", "old-b"])
    XCTAssertEqual(catalog.effectiveHidden(saved: ["provider": []])["provider"], [])
    XCTAssertEqual(catalog.effectiveHidden(saved: ["provider": ["custom"]])["provider"], ["custom"])
    let oldA = try XCTUnwrap(catalog.rows.first)
    XCTAssertEqual(ModelVisibilityCatalog.toggling([oldA], visible: true,
      hidden: catalog.effectiveHidden(saved: [:])), ["provider": ["old-b"]])
  }

  func testMissingDistroAndPreviousUndistroedWSLKeepHostModelsReachable() throws {
    let fixture = try fixture()
    let native = fixture.agents[0]
    var legacyPayload = try XCTUnwrap(fixture.agents[1].payload.objectValue)
    legacyPayload["envKind"] = .string("wsl")
    let legacy = try SettingsAgentStatus(payload: .object(legacyPayload))
    var distroPayload = try XCTUnwrap(fixture.agents[2].payload.objectValue)
    distroPayload["envKind"] = .string("wsl"); distroPayload["envDistro"] = .string("Ubuntu")
    let ubuntu = try SettingsAgentStatus(payload: .object(distroPayload))
    let before = SettingsAgentMachineScope(statuses: .init(windows: [native], wsl: [legacy, ubuntu], updatedAt: ""), preferredDistro: "Ubuntu")
    XCTAssertEqual(before.distro, "Ubuntu")
    XCTAssertEqual(before.agents.map(\.kind), ["named-fixture"])
    let after = SettingsAgentMachineScope(statuses: .init(windows: [native], wsl: [legacy], updatedAt: ""), preferredDistro: "Ubuntu")
    XCTAssertNil(after.distro)
    XCTAssertEqual(after.agents.map(\.kind), ["acme", "family-fixture"])
    let legacyOnly = SettingsAgentMachineScope(statuses: .init(windows: [], wsl: [legacy], updatedAt: ""), preferredDistro: nil)
    XCTAssertEqual(ModelVisibilityCatalog(agents: legacyOnly.agents).groups.map(\.id), ["family-fixture"])
    let duplicate = SettingsAgentMachineScope(statuses: .init(windows: [native], wsl: [native, legacy], updatedAt: ""), preferredDistro: nil)
    XCTAssertEqual(ModelVisibilityCatalog(agents: duplicate.agents).groups.map(\.id), ["acme", "family-fixture"])
  }

  func testUnifiedAliasesRetainEveryContributingSurfaceIdentity() {
    func surface(_ name: String, model: String, label: String) -> ModelVisibilitySurface {
      .init(id: name, label: name, mode: .gui, key: name, capabilities: [:], rows: [
        .init(id: name + model, label: label, detail: nil, groupID: nil, groupLabel: nil, isFamily: false,
          targets: [.init(key: name, modelIDs: [model])], searchText: label),
      ])
    }
    let rows = ModelVisibilityRows.unified([
      surface("first", model: "first-id", label: "Shared"),
      surface("second", model: "second-id", label: "Shared"),
      surface("third", model: "second-id", label: "Another label"),
    ])
    XCTAssertEqual(rows.count, 1)
    XCTAssertEqual(rows[0].targets.map(\.key), ["first", "second", "third"])
    XCTAssertEqual(rows[0].badges, [])
  }

  private func selection(lease: SettingsHostLease = settingsLease(),
    capabilities: Set<SettingsCapability> = [.sessionRead, .sessionOperate]) -> SettingsHostSelection {
    .init(name: "Fixture", access: .init(lease: lease, protocolVersion: ProtocolConstants.remoteProtocolVersion,
      isOnline: true, isReady: true, capabilities: capabilities))
  }
}

private actor VisibilitySettingsGateway: SettingsSessionGateway {
  private var value: SettingsReadResponse
  let rejects: Bool
  private(set) var writes: [SettingsPatch] = []
  init(rejects: Bool = false) throws {
    self.rejects = rejects
    var settings = SettingsFixtures.settings
    settings["hiddenModels"] = ["unrelated": ["keep-me"]]
    value = try JSONDecoder().decode(SettingsReadResponse.self, from: SettingsFixtures.data(["settings": settings]))
  }
  func readSettings(lease: SettingsHostLease) -> SettingsReadResponse { value }
  func writeSettings(_ patch: SettingsPatch, lease: SettingsHostLease) throws -> SettingsReadResponse {
    writes.append(patch)
    if rejects { throw SettingsGatewayError.transport }
    var settings = try JSONDecoder().decode(SettingsJSON.self, from: JSONEncoder().encode(value.settings)).objectValue ?? [:]
    for (key, value) in patch.values { settings[key.rawValue] = value }
    value = try JSONDecoder().decode(SettingsReadResponse.self, from: JSONEncoder().encode(SettingsJSON.object(["settings": .object(settings)])))
    return value
  }
  func agentStatuses(lease: SettingsHostLease) throws -> SettingsAgentStatuses { throw SettingsGatewayError.transport }
  func providerUsage(lease: SettingsHostLease) throws -> SettingsProviderUsage { throw SettingsGatewayError.transport }
  func profileDevices(lease: SettingsHostLease) throws -> SettingsProfileDevices { throw SettingsGatewayError.transport }
  func profileCoreStats(_ request: SettingsProfileStatsRequest, lease: SettingsHostLease) throws -> SettingsProfileCoreStats { throw SettingsGatewayError.transport }
  func profileTokenStats(_ request: SettingsProfileStatsRequest, lease: SettingsHostLease) throws -> SettingsProfileTokenStats { throw SettingsGatewayError.transport }
  func setProfileIdentity(_ identity: SettingsProfileIdentity, lease: SettingsHostLease) throws -> SettingsProfileIdentityResponse { throw SettingsGatewayError.transport }
}
