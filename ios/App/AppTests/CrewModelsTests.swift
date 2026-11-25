import XCTest
@testable import App

final class CrewModelsTests: XCTestCase {
  func testDisabledProvidersAreRemovedFromBothCrewRolesAndMenusFollowSettingsOrder() throws {
    let statuses = try ["alpha", "beta", "hidden"].map { kind in
      try AgentStatusRecord(wire: .object([
        "kind": .string(kind), "label": .string(kind), "installed": .bool(true),
        "authState": .string("authenticated"), "capabilities": .object([
          "models": .array([.object(["id": .string("pro"), "label": .string("Pro")])]),
          "presentationMode": .string("gui"),
        ]),
      ]))
    }
    var values = SettingsFixtures.settings
    values["disabledAgents"] = ["hidden"]
    values["providerOrder"] = ["beta", "beta", "alpha"]
    let settings = try JSONDecoding.decode(SettingsDocument.self, from: SettingsFixtures.data(values))
    let catalog = CrewModelCatalog(statuses: statuses, document: settings)
    XCTAssertEqual(catalog.leads.map { $0.agent.kind }, ["beta", "alpha"])
    XCTAssertEqual(catalog.helpers.map { $0.agent.kind }, ["beta", "alpha"])
    let locked = CrewModelCatalog(statuses: statuses, document: settings, leadKind: "hidden",
      currentLead: .init(agentKind: "hidden", model: "pro"))
    XCTAssertTrue(locked.leads.isEmpty)
    XCTAssertEqual(statuses.map(\.kind), ["alpha", "beta", "hidden"])
  }

  private func saved(_ id: String = "crew-one") -> SavedCrew {
    SavedCrew(id: id, name: "Review", lead: .init(agentKind: "alpha", model: "model-pro", fast: false),
      policy: .crewOnly, roles: [.init(id: "reviewer", label: "Reviewer", noEdits: true,
        selection: .init(agentKind: "beta", model: "model-mini", effort: "high", fast: false, contextSize: "128k"),
        fallbacks: [], parallel: 2)])
  }

  func testOldSettingsOmitCrewsAndSparseWritesUseTheExistingRootCodec() throws {
    let older = try JSONDecoding.decode(SettingsReadResponse.self,
      from: SettingsFixtures.data(SettingsFixtures.settingsResponse))
    XCTAssertNil(older.settings.crews)
    XCTAssertNil(older.settings.crossagentPausedProviders)
    XCTAssertNil(older.settings.crossagentHiddenModels)
    XCTAssertTrue(older.settings.savedCrews.isEmpty)
    var patch = SettingsPatch()
    patch[.crews] = try JSONDecoding.decode(SettingsJSON.self,
      from: JSONDecoding.encoder.encode(JSONValue.array([saved().wire])))
    let wire = try SettingsRemoteV3Contract.settingsWriteRequest(JSONDecoding.encoder.encode(patch))
    let value = try JSONDecoding.decode(JSONValue.self, from: wire)
    XCTAssertEqual(Set(value.objectValue?.keys.map { $0 } ?? []), ["crews"])
    XCTAssertEqual(value.objectValue?["crews"]?.arrayValue?.count, 1)
  }

  func testSavedValuesPreserveAbsenceFalseAndMetadataButRuntimeBindingIsClosed() throws {
    var raw = try XCTUnwrap(saved().wire.objectValue)
    raw["favorite"] = .bool(true); raw["lastUsedAt"] = .number(8)
    raw["retainedMetadata"] = .object(["value": .bool(true)])
    var role = try XCTUnwrap(raw["roles"]?.arrayValue?.first?.objectValue)
    role["savedOnly"] = .string("keep")
    raw["roles"] = .array([.object(role)])
    let parsed = try XCTUnwrap(SavedCrew(wire: .object(raw)))
    XCTAssertEqual(parsed.wire, .object(raw))
    XCTAssertNil(parsed.lead.effort)
    XCTAssertEqual(parsed.lead.fast, false)
    let binding = parsed.binding.wire
    XCTAssertNil(binding.objectValue?["retainedMetadata"])
    XCTAssertNil(binding.objectValue?["roles"]?.arrayValue?.first?.objectValue?["savedOnly"])
    XCTAssertNotNil(ThreadCrewBinding(wire: binding))
    var unknown = try XCTUnwrap(binding.objectValue)
    unknown["version"] = .number(2)
    XCTAssertNil(ThreadCrewBinding(wire: .object(unknown)))
    unknown["version"] = .number(1); unknown["futureField"] = .bool(true)
    XCTAssertNil(ThreadCrewBinding(wire: .object(unknown)))
  }

  func testBoundsUseWireUTF16AndRejectFractionalOrOverflowingIntegers() {
    XCTAssertNil(JSONValue.number(Double(Int.max)).numberInt)
    XCTAssertNil(JSONValue.number(.infinity).numberInt)
    XCTAssertNil(JSONValue.number(.nan).numberInt)
    XCTAssertNil(JSONValue.number(1.5).numberInt)
    XCTAssertEqual(JSONValue.number(-1).numberInt, -1)
    var crew = saved()
    crew.name = String(repeating: "😀", count: 20)
    XCTAssertTrue(crew.isValid)
    crew.name += "😀"
    XCTAssertFalse(crew.isValid)
    var role = saved().roles[0]
    role.parallel = 5
    XCTAssertFalse(role.isValid)
    role.parallel = 1; role.fallbacks = Array(repeating: role.selection, count: 4)
    XCTAssertFalse(role.isValid)
  }

  func testRoleNormalizationUsesJavaScriptWhitespaceWithoutMergingDistinctStoredLabels() {
    XCTAssertEqual(CrewWire.collapsed("\u{FEFF}A\t\nB\u{00A0}"), "A B")
    XCTAssertEqual(CrewWire.collapsed("A\u{0085}B"), "A\u{0085}B")
    let roles = [CrewRole(id: "a", label: "A\u{0085}B", selection: .init(agentKind: "fixture", model: "mini")),
      CrewRole(id: "b", label: "A B", selection: .init(agentKind: "fixture", model: "mini"))]
    XCTAssertEqual(CrewWire.normalized(roles).count, 2)
  }

  func testMutationsMergeLatestMetadataAndPreserveUnrelatedRecords() throws {
    let baseline = saved()
    var latest = baseline
    latest.favorite = true; latest.lastUsedAt = 9
    var edit = baseline
    edit.name = "Changed"
    let sibling = saved("crew-sibling").wire
    let mutation = CrewMutation.upsert(edit, basedOn: baseline)
    let result = try mutation.applying(to: [latest.wire, sibling], now: 12)
    let changed = try XCTUnwrap(SavedCrew(wire: result[0]))
    XCTAssertEqual(changed.name, "Changed")
    XCTAssertEqual(changed.favorite, true)
    XCTAssertEqual(changed.lastUsedAt, 9)
    XCTAssertEqual(changed.updatedAt, 12)
    XCTAssertEqual(result[1], sibling)
    XCTAssertTrue(mutation.isSatisfied(by: result))
  }

  func testStaleEditsAndDeletesCannotSilentlyOverwriteAnotherClientsCrew() throws {
    let baseline = saved()
    var otherClient = baseline
    otherClient.roles[0].brief = "Updated elsewhere"
    XCTAssertThrowsError(try CrewMutation.upsert(baseline, basedOn: baseline).applying(to: [otherClient.wire], now: 10)) {
      XCTAssertEqual($0 as? CrewMutationFailure, .conflict)
    }
    XCTAssertThrowsError(try CrewMutation.delete(baseline).applying(to: [otherClient.wire], now: 10)) {
      XCTAssertEqual($0 as? CrewMutationFailure, .conflict)
    }
    let full = (0..<24).map { saved("crew-\($0)").wire }
    XCTAssertThrowsError(try CrewMutation.upsert(saved("new"), basedOn: nil).applying(to: full, now: 10)) {
      XCTAssertEqual($0 as? CrewMutationFailure, .limitReached)
    }
    XCTAssertEqual(try CrewMutation.delete(baseline).applying(to: [], now: 10), [])
  }

  func testRemoteHelpersUseRootModelsAndExplicitVisibilityRatherThanGuiVariants() throws {
    let models: [JSONValue] = ["root-pro", "root-mini", "hidden", "variant-hidden", "provider-default-hidden"].map {
      .object(["id": .string($0), "label": .string($0)])
    }
    let alpha = try AgentStatusRecord(wire: .object([
      "kind": .string("alpha"), "label": .string("Alpha"), "installed": .bool(true), "authState": .string("authenticated"),
      "capabilities": .object(["models": .array(models), "runtimeLabel": .string("acp"),
        "defaultHiddenModels": .array([.string("provider-default-hidden")]),
        "presentationCapabilities": .object(["gui": .object(["models": .array([.object(["id": .string("gui-model"), "label": .string("GUI")])])])])]),
      "runtimeVariants": .object(["acp": .object(["presentationMode": .string("gui"), "capabilities": .object([
        "models": .array([.object(["id": .string("variant-model"), "label": .string("Variant")])]),
      ])])]),
    ]))
    var settings = SettingsFixtures.settings
    settings["hiddenModels"] = ["alpha": ["hidden"], "alpha-acp": ["variant-hidden"]]
    let document = try JSONDecoding.decode(SettingsDocument.self, from: SettingsFixtures.data(settings))
    let catalog = CrewModelCatalog(statuses: [alpha], document: document)
    XCTAssertEqual(catalog.leads.map(\.model), ["variant-model"])
    XCTAssertEqual(catalog.helpers.map(\.model), ["root-pro", "root-mini", "provider-default-hidden"])
    let helper = catalog.defaultHelper(for: .init(agentKind: "alpha", model: "root-pro"))
    XCTAssertEqual(helper?.model, "root-mini")
    XCTAssertTrue(CrewModelCatalog(statuses: [alpha], document: document, pausedHelpers: ["alpha"]).helpers.isEmpty)
    settings["crossagentHiddenModels"] = ["alpha": ["root-mini"]]
    let hidden = try JSONDecoding.decode(SettingsDocument.self, from: SettingsFixtures.data(settings))
    XCTAssertFalse(CrewModelCatalog(statuses: [alpha], document: hidden).helpers.contains { $0.model == "root-mini" })
    settings["crossagentPausedProviders"] = ["alpha"]
    let paused = try JSONDecoding.decode(SettingsDocument.self, from: SettingsFixtures.data(settings))
    XCTAssertTrue(CrewModelCatalog(statuses: [alpha], document: paused).helpers.isEmpty)
  }

  func testLeadCapabilityUsesDeclaredConfigurationOwnershipAndPresentation() {
    XCTAssertTrue(CrewModelCatalog.canLead([:], presentation: .gui))
    XCTAssertFalse(CrewModelCatalog.canLead([:], presentation: .terminal))
    XCTAssertFalse(CrewModelCatalog.canLead(["mcpConfigSource": .string("agentSettings")], presentation: .gui))
    let owned: [String: JSONValue] = ["mcpConfigSource": .string("agentSettings"), "crossagentMcpRouting": .string("provider-session")]
    XCTAssertTrue(CrewModelCatalog.canLead(owned, presentation: .gui))
    XCTAssertFalse(CrewModelCatalog.canLead(owned, presentation: .terminal))
  }

  func testHelperPreferencesSurviveTheActualSettingsReadCodec() throws {
    var response = SettingsFixtures.settingsResponse
    var settings = SettingsFixtures.settings
    settings["crossagentPausedProviders"] = ["alpha"]
    settings["crossagentHiddenModels"] = ["beta": ["mini"]]
    response["settings"] = settings
    let canonical = try SettingsRemoteV3Contract.settingsReadResponse(SettingsFixtures.data(response))
    let document = try JSONDecoding.decode(SettingsReadResponse.self, from: canonical).settings
    XCTAssertEqual(document.crossagentPausedProviders, ["alpha"])
    XCTAssertEqual(document.crossagentHiddenModels, ["beta": ["mini"]])
  }

  func testHelperCostHintsMatchJavaScriptWholeWordBoundaries() {
    XCTAssertEqual(CrewModelTier.classify(id: "model-MINI", label: ""), .fastCheap)
    XCTAssertEqual(CrewModelTier.classify(id: "gemini", label: ""), .balanced)
    XCTAssertEqual(CrewModelTier.classify(id: "mini_pro", label: ""), .balanced)
    XCTAssertEqual(CrewModelTier.classify(id: "模型mini模型", label: ""), .fastCheap)
    XCTAssertEqual(CrewModelTier.classify(id: "model", label: "ſpark"), .balanced)
    XCTAssertEqual(CrewModelTier.classify(id: "model", label: "Ultra"), .maximum)
  }

  func testBundledProviderPolicyRetainsPaidOptInsAndRefusesFutureFormats() throws {
    let registry = try XCTUnwrap(ProviderUIRegistry.bundled)
    XCTAssertEqual(registry.version, 2)
    let explicitOff = try XCTUnwrap(registry.providers.first { !$0.value.defaultFastEnabled })
    XCTAssertFalse(registry.fast(for: explicitOff.key))
    XCTAssertFalse(registry.fast(for: explicitOff.key + ":work"))
    let previous = Data(#"{"version":1,"defaultFastEnabled":true,"providers":{"fixture":{"order":0,"defaultFastEnabled":false}}}"#.utf8)
    let legacy = try XCTUnwrap(ProviderUIRegistry.decode(previous))
    XCTAssertFalse(legacy.fast(for: "fixture"))
    XCTAssertEqual(legacy.visibilityKey(for: "fixture", mode: .gui, runtime: nil), "fixture")
    let future = Data(#"{"version":3,"defaultFastEnabled":true,"providers":{"fixture":{"order":0,"defaultFastEnabled":false}}}"#.utf8)
    XCTAssertNil(ProviderUIRegistry.decode(future))
  }

  @MainActor
  func testCrewInspectorTreatsFastOffAndNoFastCarrierAsTheSameSelection() {
    let saved = CrewMemberSelection(agentKind: "alpha", model: "model-pro", effort: "high")
    XCTAssertTrue(CrewInspectorCard.same(.init(agentKind: "alpha", model: "model-pro", effort: "high", fast: false), saved))
    XCTAssertTrue(CrewInspectorCard.same(saved, .init(agentKind: "alpha", model: "model-pro", effort: "high", fast: false)))
    XCTAssertFalse(CrewInspectorCard.same(.init(agentKind: "alpha", model: "model-pro", effort: "high", fast: true), saved))
    XCTAssertFalse(CrewInspectorCard.same(saved, .init(agentKind: "alpha", model: "model-pro", effort: "high", fast: true)))
  }

  @MainActor
  func testFreshHomeDraftReconcilesItsRememberedCrewToTheSavedRosterAndLead() {
    let saved = saved()
    let stale = ThreadCrewBinding(crewID: saved.id, name: "Old name", policy: .crewFirst,
      roles: [.init(id: "reviewer", label: "Reviewer",
        selection: .init(agentKind: "alpha", model: "model-old"))])
    let reconciled = HomeCrewRestore.savedCrew(for: stale, in: [saved],
      currentLead: .init(agentKind: "alpha", model: "model-old", effort: "low"),
      hasConfiguredConfiguration: false)
    XCTAssertEqual(reconciled, saved)
  }

  @MainActor
  func testConfiguredHomeDraftNeverOverwritesItsUserEditedSelection() {
    let saved = saved()
    let stale = ThreadCrewBinding(crewID: saved.id, name: "Old name", policy: .crewOnly,
      roles: [.init(id: "reviewer", label: "Reviewer",
        selection: .init(agentKind: "alpha", model: "model-old"))])
    XCTAssertNil(HomeCrewRestore.savedCrew(for: stale, in: [saved],
      currentLead: .init(agentKind: "alpha", model: "model-old"),
      hasConfiguredConfiguration: true))
  }

  @MainActor
  func testMatchingCrewLeadAndBindingNeedNoReconciliationIncludingAbsentFast() {
    let saved = saved()
    // saved.lead carries fast: false; an absent remembered Fast is equivalent.
    let lead = CrewMemberSelection(agentKind: saved.lead.agentKind, model: saved.lead.model,
      effort: saved.lead.effort)
    XCTAssertNil(HomeCrewRestore.savedCrew(for: saved.binding, in: [saved],
      currentLead: lead, hasConfiguredConfiguration: false))
    // A stale roster still adopts the saved binding when the lead already matches.
    let stale = ThreadCrewBinding(crewID: saved.id, name: saved.name, policy: saved.policy,
      roles: [.init(id: "reviewer", label: "Reviewer", selection: lead)])
    XCTAssertEqual(HomeCrewRestore.savedCrew(for: stale, in: [saved],
      currentLead: lead, hasConfiguredConfiguration: false), saved)
    // No remembered binding or no matching saved crew is a no-op.
    XCTAssertNil(HomeCrewRestore.savedCrew(for: nil, in: [saved], currentLead: lead,
      hasConfiguredConfiguration: false))
    XCTAssertNil(HomeCrewRestore.savedCrew(
      for: ThreadCrewBinding(crewID: "missing", roles: saved.roles), in: [saved],
      currentLead: lead, hasConfiguredConfiguration: false))
  }

  @MainActor
  func testFreshCrewBoundDraftHoldsLaunchOnlyWhileCrewsArePending() {
    let binding = ThreadCrewBinding(crewID: "crew-one", roles: [
      .init(id: "reviewer", label: "Reviewer",
        selection: .init(agentKind: "alpha", model: "model-pro")),
    ])
    // A fresh draft waits only while the saved-crews load has not finished.
    XCTAssertTrue(HomeCrewRestore.holdsLaunch(hasConfiguredConfiguration: false,
      crewsLoadPending: true, remembered: binding))
    XCTAssertFalse(HomeCrewRestore.holdsLaunch(hasConfiguredConfiguration: false,
      crewsLoadPending: false, remembered: binding))
    // A user-edited draft never waits, even before the crews load.
    XCTAssertFalse(HomeCrewRestore.holdsLaunch(hasConfiguredConfiguration: true,
      crewsLoadPending: true, remembered: binding))
    // A crew-less remembered selection never waits.
    XCTAssertFalse(HomeCrewRestore.holdsLaunch(hasConfiguredConfiguration: false,
      crewsLoadPending: true, remembered: ThreadCrewBinding(roles: binding.roles)))
    XCTAssertFalse(HomeCrewRestore.holdsLaunch(hasConfiguredConfiguration: false,
      crewsLoadPending: true, remembered: nil))
  }
}
