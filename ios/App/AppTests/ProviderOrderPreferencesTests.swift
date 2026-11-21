import XCTest
@testable import App

@MainActor final class ProviderOrderPreferencesTests: XCTestCase {
  private let a = ClientConnectionID()
  private let b = ClientConnectionID()

  func testAReleasedComposerEnvelopeReadsHostOrderWithoutWritingDefaults() throws {
    let defaults = try isolatedDefaults()
    let old = Data(#"{"version":1,"providerConfigs":{},"futureMetadata":"keep"}"#.utf8)
    defaults.set(old, forKey: ComposerPreferencesStore.key)
    let store = ComposerPreferencesStore(defaults: defaults)
    XCTAssertTrue(store.machineProviderOrder.isSynced)
    XCTAssertEqual(store.providerOrder(connectionID: a, location: nil, fallback: ["beta", "alpha"]), ["beta", "alpha"])
    XCTAssertEqual(defaults.data(forKey: ComposerPreferencesStore.key), old)
    XCTAssertTrue(store.updateMachineProviderOrder { $0.setSynced(false) })
    let saved = try document(defaults)
    XCTAssertEqual(saved["version"], .number(1))
    XCTAssertEqual(saved["futureMetadata"], .string("keep"))
    XCTAssertEqual(saved["providerConfigs"], .object([:]))
  }

  func testHostAndDistroIdentitiesDoNotCollideAndResetKeepsTheOtherMachines() {
    let native = ProviderOrderMachine(connectionID: a)
    let wsl = ProviderOrderMachine(connectionID: a, distro: "Ubuntu/wsl:東京")
    let other = ProviderOrderMachine(connectionID: b, distro: "Ubuntu/wsl:東京")
    XCTAssertEqual(Set([native.id, wsl.id, other.id]).count, 3)
    var prefs = ProviderOrderPreferences()
    XCTAssertTrue(prefs.setSynced(false))
    XCTAssertTrue(prefs.setOrder(["", "beta", "alpha", "beta"], for: native))
    XCTAssertTrue(prefs.setOrder(["wsl"], for: wsl))
    XCTAssertEqual(prefs.order(for: native, fallback: ["global"]), ["beta", "alpha"])
    XCTAssertEqual(prefs.order(for: wsl, fallback: ["global"]), ["wsl"])
    XCTAssertEqual(prefs.order(for: other, fallback: ["global"]), ["global"])
    XCTAssertTrue(prefs.setOrder([], for: native))
    XCTAssertFalse(prefs.hasOverride(for: native))
    XCTAssertEqual(prefs.order(for: native, fallback: ["new-host-order"]), ["new-host-order"])
    XCTAssertEqual(prefs.order(for: wsl, fallback: []), ["wsl"])
  }

  func testSyncedModeIgnoresOverridesAndRelockingClearsOnlyOrderFields() {
    let machine = ProviderOrderMachine(connectionID: a)
    var prefs = ProviderOrderPreferences(rawValue: .object([
      "version": .number(1), "mode": .string("per-machine"), "futureRoot": .string("keep"),
      "machines": .object([machine.id: .object([
        "providerOrder": .array([.string("local")]), "futureMachine": .bool(false),
      ])]),
    ]))
    XCTAssertTrue(prefs.setSynced(true))
    XCTAssertEqual(prefs.order(for: machine, fallback: ["host"]), ["host"])
    XCTAssertTrue(prefs.setSynced(false))
    XCTAssertEqual(prefs.order(for: machine, fallback: ["host"]), ["local"])
    XCTAssertTrue(prefs.lockToHostOrder())
    XCTAssertTrue(prefs.isSynced)
    XCTAssertFalse(prefs.hasOverride(for: machine))
    XCTAssertEqual(prefs.rawValue?.objectValue?["futureRoot"], .string("keep"))
    XCTAssertEqual(prefs.rawValue?.objectValue?["machines"]?.objectValue?[machine.id]?.objectValue?["futureMachine"], .bool(false))
  }

  func testAnExplicitStoredEmptyOrderIsDifferentFromAReset() {
    let machine = ProviderOrderMachine(connectionID: a)
    var prefs = ProviderOrderPreferences(rawValue: .object([
      "version": .number(1), "mode": .string("per-machine"),
      "machines": .object([machine.id: .object(["providerOrder": .array([])])]),
    ]))
    XCTAssertEqual(prefs.order(for: machine, fallback: ["host"]), [])
    XCTAssertTrue(prefs.setOrder([], for: machine))
    XCTAssertEqual(prefs.order(for: machine, fallback: ["host"]), ["host"])
  }

  func testFutureAndMalformedOrderDocumentsAreNotRewritten() throws {
    let machine = ProviderOrderMachine(connectionID: a)
    let invalid: [JSONValue] = [
      .object(["version": .number(2), "opaque": .array([.bool(false), .string("keep")])]),
      .object(["version": .number(1), "mode": .string("future")]),
      .object(["version": .number(1), "machines": .array([])]),
      .null,
    ]
    for raw in invalid {
      let defaults = try isolatedDefaults()
      let bytes = try JSONEncoder().encode(JSONValue.object(["version": .number(1), "machineProviderOrder": raw]))
      defaults.set(bytes, forKey: ComposerPreferencesStore.key)
      let store = ComposerPreferencesStore(defaults: defaults)
      XCTAssertFalse(store.machineProviderOrder.canEdit)
      XCTAssertFalse(store.updateMachineProviderOrder { $0.setSynced(false) })
      XCTAssertFalse(store.updateMachineProviderOrder { $0.setOrder(["changed"], for: machine) })
      XCTAssertEqual(defaults.data(forKey: ComposerPreferencesStore.key), bytes)
      XCTAssertEqual(store.providerOrder(connectionID: a, location: nil, fallback: ["host"]), ["host"])
    }
  }

  func testOpaqueMachineEntryBlocksItsEditAndRelockButNotAnotherMachine() {
    let old = ProviderOrderMachine(connectionID: a), current = ProviderOrderMachine(connectionID: b)
    let opaque = JSONValue.object(["providerOrder": .object(["future": .bool(true)])])
    var prefs = ProviderOrderPreferences(rawValue: .object([
      "version": .number(1), "mode": .string("per-machine"), "machines": .object([old.id: opaque]),
    ]))
    XCTAssertFalse(prefs.canEdit(old))
    XCTAssertFalse(prefs.setOrder(["replace"], for: old))
    XCTAssertFalse(prefs.canLockToHostOrder)
    XCTAssertFalse(prefs.lockToHostOrder())
    XCTAssertTrue(prefs.setOrder(["new"], for: current))
    XCTAssertEqual(prefs.rawValue?.objectValue?["machines"]?.objectValue?[old.id], opaque)
  }

  func testOverridesReopenAndDoNotChangeSavedModelSelections() throws {
    let defaults = try isolatedDefaults(), store = ComposerPreferencesStore(defaults: nil)
    let owner = ModelSelectionOwner(agentKind: "fixture", presentationMode: .gui)
    store.rememberConfiguration(.init(model: "current", fast: false), owner: owner, capabilities: [:], homeScope: false)
    let initial = store.providerConfiguration(for: owner)
    XCTAssertTrue(store.updateMachineProviderOrder { prefs in
      prefs.setSynced(false) && prefs.setOrder(["another", "fixture"], for: .init(connectionID: self.a))
    })
    XCTAssertEqual(store.providerConfiguration(for: owner), initial)
    let persistent = ComposerPreferencesStore(defaults: defaults)
    XCTAssertTrue(persistent.updateMachineProviderOrder { prefs in
      prefs.setSynced(false) && prefs.setOrder(["fixture"], for: .init(connectionID: self.a, distro: "Ubuntu"))
    })
    let reopened = ComposerPreferencesStore(defaults: defaults)
    XCTAssertEqual(reopened.providerOrder(connectionID: a,
      location: .wsl(distro: "Ubuntu", linuxPath: "/repo", uncPath: "opaque"), fallback: []), ["fixture"])
    XCTAssertEqual(reopened.providerOrder(connectionID: b, location: nil, fallback: ["other-host"]), ["other-host"])
  }

  func testFutureOuterEnvelopeStillBlocksAllOrderWrites() throws {
    let defaults = try isolatedDefaults(), bytes = Data(#"{"version":2,"opaque":"keep"}"#.utf8)
    defaults.set(bytes, forKey: ComposerPreferencesStore.key)
    let store = ComposerPreferencesStore(defaults: defaults)
    XCTAssertFalse(store.updateMachineProviderOrder { $0.setSynced(false) })
    XCTAssertEqual(defaults.data(forKey: ComposerPreferencesStore.key), bytes)
  }

  func testLateAdoptionKeepsConcurrentPreferenceEdits() {
    let store = ComposerPreferencesStore(defaults: nil), machine = ProviderOrderMachine(connectionID: a)
    XCTAssertTrue(store.updateMachineProviderOrder { $0.setSynced(false) && $0.setOrder(["old"], for: machine) })
    let captured = store.machineProviderOrder
    XCTAssertTrue(store.updateMachineProviderOrder { $0.setOrder(["new"], for: machine) })
    XCTAssertFalse(store.lockMachineProviderOrder(matching: captured))
    XCTAssertFalse(store.machineProviderOrder.isSynced)
    XCTAssertEqual(store.machineProviderOrder.order(for: machine, fallback: []), ["new"])
    XCTAssertTrue(store.lockMachineProviderOrder(matching: store.machineProviderOrder))
    XCTAssertTrue(store.machineProviderOrder.isSynced)
    XCTAssertFalse(store.machineProviderOrder.hasOverride(for: machine))
  }

  func testCatalogScopeUsesTheProjectsExactDistroBeforeSelectingCapabilities() throws {
    func status(_ environment: String?, _ distro: String?, model: String) throws -> AgentStatusRecord {
      var fields: [String: JSONValue] = ["kind": .string("fixture"), "label": .string("Fixture"),
        "installed": .bool(true), "authState": .string("authenticated"),
        "capabilities": .object(["models": .array([.object(["id": .string(model), "label": .string(model)])])])]
      fields["envKind"] = environment.map(JSONValue.string)
      fields["envDistro"] = distro.map(JSONValue.string)
      return try AgentStatusRecord(wire: .object(fields))
    }
    let records = try [status("posix", nil, model: "native"), status("wsl", "Ubuntu", model: "ubuntu"),
      status("wsl", "Debian", model: "debian"), status(nil, nil, model: "legacy-native")]
    let location = ProjectLocation.wsl(distro: "Ubuntu", linuxPath: "/repo", uncPath: "opaque")
    let scoped = ComposerProviderCatalog.inEnvironment(records, location: location)
    XCTAssertEqual(scoped.map(\.identity), [records[1].identity])
    XCTAssertEqual(CrewModelCatalog(statuses: scoped, document: nil).leads.map(\.model), ["ubuntu"])
    XCTAssertEqual(ComposerProviderCatalog.inEnvironment(records, location: nil).map(\.identity),
      [records[0].identity, records[3].identity])
    XCTAssertTrue(ComposerProviderCatalog.inEnvironment(records,
      location: .wsl(distro: "Missing", linuxPath: "/repo", uncPath: "opaque")).isEmpty)
    let legacyWSL = try status("wsl", nil, model: "legacy-wsl")
    XCTAssertEqual(ComposerProviderCatalog.inEnvironment(records + [legacyWSL], location: location).map(\.identity),
      [records[1].identity], "An exact distro wins over legacy unscoped WSL records")
    XCTAssertEqual(ComposerProviderCatalog.inEnvironment(records + [legacyWSL],
      location: .wsl(distro: "Missing", linuxPath: "/repo", uncPath: "opaque")).map(\.identity),
      [legacyWSL.identity], "The released undistroed WSL fallback matches getProjectAgentStatuses")
  }

  func testOversizedOrderIsRejectedWithoutChangingMemoryOrDisk() throws {
    let defaults = try isolatedDefaults(), store = ComposerPreferencesStore(defaults: defaults)
    XCTAssertTrue(store.updateMachineProviderOrder { $0.setSynced(false) })
    let before = store.machineProviderOrder, bytes = defaults.data(forKey: ComposerPreferencesStore.key)
    XCTAssertFalse(store.updateMachineProviderOrder {
      $0.setOrder([String(repeating: "x", count: 4_194_305)], for: .init(connectionID: self.a))
    })
    XCTAssertEqual(store.machineProviderOrder, before)
    XCTAssertEqual(defaults.data(forKey: ComposerPreferencesStore.key), bytes)
  }

  private func isolatedDefaults() throws -> UserDefaults {
    let name = "machine-order-unit-" + UUID().uuidString
    let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
    addTeardownBlock { UserDefaults(suiteName: name)?.removePersistentDomain(forName: name) }
    return defaults
  }

  private func document(_ defaults: UserDefaults) throws -> [String: JSONValue] {
    try JSONDecoder().decode([String: JSONValue].self, from: XCTUnwrap(defaults.data(forKey: ComposerPreferencesStore.key)))
  }
}
