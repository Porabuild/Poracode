import XCTest
@testable import App

@MainActor final class ComposerPreferencesTests: XCTestCase {
  private let owner = ModelSelectionOwner(agentKind: "fixture", presentationMode: .gui)

  func testProviderMenuOrderMatchesTheSharedPWAFixture() throws {
    struct Fixture: Decodable {
      struct Entry: Decodable {
        let id: String
        let providers: [String]
        let order: [String]
        let expected: [String]
      }
      let version: Int
      let cases: [Entry]
    }
    let fixture = try ProjectFixtureLoader.decode(Fixture.self, named: "client-provider-order.json")
    XCTAssertEqual(fixture.version, 1)
    for entry in fixture.cases {
      XCTAssertEqual(ComposerProviderCatalog.ordered(entry.providers, providerOrder: entry.order, kind: { $0 }),
        entry.expected, entry.id)
    }
  }

  func testAvailabilityFiltersDisabledProvidersWithoutChangingDiscoveryOrder() throws {
    func status(_ kind: String, installed: Bool = true, mode: String = "gui") throws -> AgentStatusRecord {
      try AgentStatusRecord(wire: .object([
        "kind": .string(kind), "label": .string(kind), "installed": .bool(installed),
        "authState": .string("authenticated"),
        "capabilities": .object(["presentationModes": .array([.string(mode)])]),
      ]))
    }
    let statuses = try [status("beta"), status("alpha"), status("hidden"),
      status("missing", installed: false), status("terminal", mode: "terminal")]
    var values = SettingsFixtures.settings
    values["disabledAgents"] = ["hidden", "unknown"]
    values["providerOrder"] = ["alpha", "beta"]
    let settings = try JSONDecoding.decode(SettingsDocument.self, from: SettingsFixtures.data(values))
    XCTAssertEqual(ComposerProviderCatalog.available(statuses, presentation: .gui, settings: settings).map(\.kind),
      ["beta", "alpha"])
    XCTAssertEqual(statuses.map(\.kind), ["beta", "alpha", "hidden", "missing", "terminal"])
    values["disabledAgents"] = ["alpha", "beta", "hidden", "terminal"]
    let disabled = try JSONDecoding.decode(SettingsDocument.self, from: SettingsFixtures.data(values))
    XCTAssertTrue(ComposerProviderCatalog.available(statuses, presentation: .gui, settings: disabled).isEmpty)
    XCTAssertEqual(ComposerProviderCatalog.available(statuses, presentation: .gui, settings: nil).map(\.kind),
      ["beta", "alpha", "hidden"])
    XCTAssertNil(ComposerProviderCatalog.selected("hidden", pinnedKind: nil, agents: statuses,
      presentation: .gui, settings: settings))
    XCTAssertEqual(ComposerProviderCatalog.selected("hidden", pinnedKind: "hidden", agents: statuses,
      presentation: .gui, settings: settings)?.kind, "hidden")
    XCTAssertNil(ComposerProviderCatalog.selected("hidden", pinnedKind: "other", agents: statuses,
      presentation: .gui, settings: settings))
    XCTAssertNil(ComposerProviderCatalog.selected("missing", pinnedKind: "missing", agents: statuses,
      presentation: .gui, settings: settings))
    XCTAssertNil(ComposerProviderCatalog.selected("hidden", pinnedKind: "hidden", agents: statuses,
      presentation: .terminal, settings: settings))
  }

  func testRestorationMatchesTheSharedPWAFixtures() throws {
    struct Fixture: Decodable {
      struct Entry: Decodable {
        let id: String
        let project: ThreadConfig?
        let provider: ThreadConfig?
        let preferences: [String: ComposerModelPreference]
        let expected: ThreadConfig
      }
      let capabilities: [String: JSONValue]
      let cases: [Entry]
    }
    let fixture = try ProjectFixtureLoader.decode(Fixture.self, named: "client-composer-preferences.json")
    XCTAssertEqual(fixture.cases.count, 8)
    for entry in fixture.cases {
      XCTAssertEqual(ComposerPreferenceResolution.saved(project: entry.project, provider: entry.provider,
        preferences: entry.preferences, capabilities: fixture.capabilities), entry.expected, entry.id)
    }
  }

  func testDevicePreferencesReopenWithFalseAndEmptyCarriersButWithoutTransientFields() throws {
    let defaults = try isolatedDefaults()
    let store = ComposerPreferencesStore(defaults: defaults)
    XCTAssertNil(defaults.data(forKey: ComposerPreferencesStore.key), "Reading is not persistence")
    let configuration = ThreadConfig(model: "plain", effort: "high", contextSize: "", fast: false,
      thinking: false, workflows: true, mode: "plan", approvalPolicy: "review", browserMcp: true,
      crew: .object(["roles": .array([])]))
    store.rememberConfiguration(configuration, owner: owner, capabilities: ["modes": .array([.string("agent"), .string("plan")])], homeScope: false)
    let reopened = ComposerPreferencesStore(defaults: defaults)
    let value = try XCTUnwrap(reopened.providerConfiguration(for: owner))
    XCTAssertEqual(value.model, "plain")
    XCTAssertEqual(value.fast, false)
    XCTAssertEqual(value.thinking, false)
    XCTAssertEqual(value.contextSize, "")
    XCTAssertEqual(value.mode, "agent")
    XCTAssertNil(value.workflows)
    XCTAssertNil(value.crew)
    XCTAssertNil(value.browserMcp)
    XCTAssertEqual(reopened.modelPreferences(for: owner)["plain"], .init(effort: "high", fast: false))
  }

  func testHomeSavesPerModelChoicesWithoutChangingProviderPreset() throws {
    let store = ComposerPreferencesStore(defaults: nil)
    store.rememberConfiguration(.init(model: "plain", fast: false), owner: owner, capabilities: [:], homeScope: true)
    XCTAssertNil(store.providerConfiguration(for: owner))
    XCTAssertEqual(store.modelPreferences(for: owner)["plain"]?.fast, false)
  }

  func testUnsupportedEnvelopeIsNeverRewritten() throws {
    let defaults = try isolatedDefaults()
    let bytes = Data(#"{"version":2,"future":{"opaque":true}}"#.utf8)
    defaults.set(bytes, forKey: ComposerPreferencesStore.key)
    let store = ComposerPreferencesStore(defaults: defaults)
    XCTAssertTrue(store.incompatible)
    store.rememberConfiguration(.init(model: "plain", fast: true), owner: owner, capabilities: [:], homeScope: false)
    store.rememberProject(.init(model: "plain"), owner: owner, connectionID: ClientConnectionID(), projectID: "p", worktreeMode: false)
    XCTAssertEqual(defaults.data(forKey: ComposerPreferencesStore.key), bytes)
  }

  func testSameVersionUnknownFieldsSurviveAnExplicitPreferenceEdit() throws {
    let defaults = try isolatedDefaults()
    ComposerPreferencesStore(defaults: defaults).rememberConfiguration(.init(model: "plain", fast: true),
      owner: owner, capabilities: [:], homeScope: false)
    var raw = try object(defaults)
    raw["futureMetadata"] = .string("keep")
    var records = try XCTUnwrap(raw["providerConfigs"]?.objectValue)
    let key = try XCTUnwrap(records.keys.first)
    var record = try XCTUnwrap(records[key]?.objectValue)
    var fields = try XCTUnwrap(record["configuration"]?.objectValue)
    fields["futureChoice"] = .string("keep")
    record["configuration"] = .object(fields)
    record["futureRecordMetadata"] = .bool(true)
    records[key] = .object(record); raw["providerConfigs"] = .object(records)
    defaults.set(try JSONEncoder().encode(raw), forKey: ComposerPreferencesStore.key)
    let store = ComposerPreferencesStore(defaults: defaults)
    store.rememberConfiguration(.init(model: "plain", fast: false), owner: owner, capabilities: [:], homeScope: false)
    let saved = try object(defaults)
    XCTAssertEqual(saved["futureMetadata"], .string("keep"))
    XCTAssertEqual(saved["providerConfigs"]?.objectValue?[key]?.objectValue?["futureRecordMetadata"], .bool(true))
    XCTAssertEqual(saved["providerConfigs"]?.objectValue?[key]?.objectValue?["configuration"]?.objectValue?["futureChoice"], .string("keep"))
  }

  func testFutureSelectionBindingCannotBeStrippedByAnOlderPreferenceWriter() throws {
    let defaults = try isolatedDefaults()
    ComposerPreferencesStore(defaults: defaults).rememberConfiguration(.init(model: "plain"),
      owner: owner, capabilities: [:], homeScope: false)
    var raw = try object(defaults)
    var records = try XCTUnwrap(raw["providerConfigs"]?.objectValue)
    let key = try XCTUnwrap(records.keys.first)
    var record = try XCTUnwrap(records[key]?.objectValue)
    var fields = try XCTUnwrap(record["configuration"]?.objectValue)
    fields["selectionBinding"] = .object(["version": .number(2), "opaque": .bool(true)])
    record["configuration"] = .object(fields); records[key] = .object(record)
    raw["providerConfigs"] = .object(records)
    let bytes = try JSONEncoder().encode(raw)
    defaults.set(bytes, forKey: ComposerPreferencesStore.key)
    let store = ComposerPreferencesStore(defaults: defaults)
    XCTAssertNil(store.providerConfiguration(for: owner))
    store.rememberConfiguration(.init(model: "other", fast: false), owner: owner, capabilities: [:], homeScope: false)
    XCTAssertEqual(defaults.data(forKey: ComposerPreferencesStore.key), bytes)
  }

  func testProviderInstancesAndHostProjectsCannotShareTheWrongSelection() throws {
    let store = ComposerPreferencesStore(defaults: nil)
    let a = ModelSelectionOwner(agentKind: "fixture", agentInstanceID: "a", presentationMode: .gui)
    let b = ModelSelectionOwner(agentKind: "fixture", agentInstanceID: "b", presentationMode: .gui)
    store.rememberConfiguration(.init(model: "plain", effort: "high", fast: false), owner: a, capabilities: [:], homeScope: false)
    XCTAssertNil(store.providerConfiguration(for: b))
    XCTAssertTrue(store.modelPreferences(for: b).isEmpty)
    let first = ClientConnectionID(), second = ClientConnectionID()
    store.rememberProject(.init(model: "plain", contextSize: ""), owner: a, connectionID: first, projectID: "same", worktreeMode: true)
    XCTAssertNil(store.projectSelection(connectionID: second, projectID: "same"))
    let record = try XCTUnwrap(store.projectSelection(connectionID: first, projectID: "same"))
    XCTAssertEqual(record.owner, a)
    XCTAssertEqual(record.configuration.contextSize, "")
    XCTAssertTrue(record.worktreeMode)
  }

  private func isolatedDefaults() throws -> UserDefaults {
    let name = "composer-preferences-unit-" + UUID().uuidString
    let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
    addTeardownBlock { UserDefaults(suiteName: name)?.removePersistentDomain(forName: name) }
    return defaults
  }

  func testProjectPreferenceWritesStayOrderedAndCoalescePendingEdits() async throws {
    let gateway = ProjectControllerGatewayFake(), refresh = ProjectControllerRefreshSchedulerFake()
    let barrier = ProjectControllerTestBarrier()
    await gateway.setCommandBarriers([barrier])
    await gateway.enqueueCommand(.value(.bounded(.init(project: nil))))
    await gateway.enqueueCommand(.value(.bounded(.init(project: nil))))
    let access = ProjectControllerSession(lease: .init(connectionId: ClientConnectionID(), generation: 1),
      isOnline: true, isReady: true, capabilities: [.projectsManage])
    let writer = ComposerProjectPreferenceWriter(gateway: gateway, refresh: refresh, access: { access })
    writer.remember(configuration: .init(model: "first"), owner: owner, projectID: "p", worktreeMode: false)
    await barrier.waitUntilReached()
    writer.remember(configuration: .init(model: "intermediate"), owner: owner, projectID: "p", worktreeMode: false)
    writer.remember(configuration: .init(model: "last", fast: false), owner: owner, projectID: "p", worktreeMode: true)
    let inFlight = await gateway.commandCalls
    XCTAssertEqual(inFlight.count, 1)
    await barrier.release()
    await settle { writer.isIdle }
    let calls = await gateway.commandCalls
    XCTAssertEqual(calls.count, 2)
    XCTAssertNotEqual(calls[0].operationId, calls[1].operationId)
    guard case .setDraftConfig(_, let payload) = calls[1].command else { return XCTFail("Expected narrow intent") }
    XCTAssertEqual(payload?.objectValue?["model"], .string("last"))
    XCTAssertEqual(payload?.objectValue?["fast"], .bool(false))
    XCTAssertEqual(payload?.objectValue?["worktreeMode"], .bool(true))
  }

  func testHostSwitchDropsQueuedPreferenceWritesAndUncertainResponseIsNotReplayed() async throws {
    let gateway = ProjectControllerGatewayFake(), refresh = ProjectControllerRefreshSchedulerFake()
    let barrier = ProjectControllerTestBarrier()
    await gateway.setCommandBarriers([barrier])
    await gateway.enqueueCommand(.failure(.ambiguousOutcome))
    var access = ProjectControllerSession(lease: .init(connectionId: ClientConnectionID(), generation: 1),
      isOnline: true, isReady: true, capabilities: [.projectsManage])
    let writer = ComposerProjectPreferenceWriter(gateway: gateway, refresh: refresh, access: { access })
    writer.remember(configuration: .init(model: "first"), owner: owner, projectID: "p", worktreeMode: false)
    await barrier.waitUntilReached()
    writer.remember(configuration: .init(model: "old-queued"), owner: owner, projectID: "p", worktreeMode: false)
    access = ProjectControllerSession(lease: .init(connectionId: ClientConnectionID(), generation: 2),
      isOnline: true, isReady: true, capabilities: [.projectsManage])
    await barrier.release()
    await settle { writer.isIdle }
    let calls = await gateway.commandCalls
    XCTAssertEqual(calls.count, 1)
    let refreshes = await refresh.leases
    XCTAssertTrue(refreshes.isEmpty)
  }

  func testInstanceOwnedSelectionCannotPublishAnAmbiguousProjectDefault() async {
    let gateway = ProjectControllerGatewayFake(), refresh = ProjectControllerRefreshSchedulerFake()
    let access = ProjectControllerSession(lease: .init(connectionId: ClientConnectionID(), generation: 1),
      isOnline: true, isReady: true, capabilities: [.projectsManage])
    let writer = ComposerProjectPreferenceWriter(gateway: gateway, refresh: refresh, access: { access })
    writer.remember(configuration: .init(model: "plain"), owner: .init(agentKind: "fixture", agentInstanceID: "exact", presentationMode: .gui),
      projectID: "p", worktreeMode: false)
    XCTAssertTrue(writer.isIdle)
    let calls = await gateway.commandCalls
    XCTAssertTrue(calls.isEmpty)
  }

  private func settle(_ condition: () -> Bool) async {
    for _ in 0..<1_000 { if condition() { return }; await Task.yield() }
    XCTFail("Preference writes did not settle")
  }
  private func object(_ defaults: UserDefaults) throws -> [String: JSONValue] {
    try JSONDecoder().decode([String: JSONValue].self, from: XCTUnwrap(defaults.data(forKey: ComposerPreferencesStore.key)))
  }
}
