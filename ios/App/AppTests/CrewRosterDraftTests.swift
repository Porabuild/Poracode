import XCTest
@testable import App

@MainActor final class CrewRosterDraftTests: XCTestCase {
  private let connection = ClientConnectionID()
  private let owner = ModelSelectionOwner(agentKind: "fixture", agentInstanceID: "actual-instance", presentationMode: .gui)

  private func status() throws -> AgentStatusRecord {
    let caps: [String: JSONValue] = [
      "models": .array(["member", "fast-member"].map { .object(["id": .string($0), "label": .string($0)]) }),
      "supportsFastMode": .bool(true),
      "modelFamilies": .array([.object([
        "model": .string("member"), "label": .string("Family"), "selectors": .array([]),
        "bindings": .object(["effort": .string("model"), "fast": .string("model")]),
        "redundantValues": .object(["effort": .array([.string("")]), "fast": .array([.bool(false)])]),
        "members": .array([
          .object(["model": .string("member"), "selections": .object([:]), "effort": .string("low"), "fast": .bool(false)]),
          .object(["model": .string("fast-member"), "selections": .object([:]), "effort": .string("low"), "fast": .bool(true)]),
        ]),
      ])]),
    ]
    return try .init(wire: .object(["kind": .string("fixture"), "label": .string("Fixture"),
      "installed": .bool(true), "authState": .string("authenticated"), "capabilities": .object(caps)]))
  }

  private func draft() throws -> CrewRosterDraft {
    let binding = ThreadCrewBinding(roles: [.init(id: "helper", label: "Helper", noEdits: true,
      selection: .init(agentKind: "helper", model: "mini"))])
    var config = ThreadConfig(model: "member", effort: "", contextSize: "128k", fast: false, thinking: false,
      workflows: false, mode: "plan", approvalPolicy: "review", approvalsReviewer: "user", sandboxMode: "read-only",
      browserMcp: false, crossagentMcp: true, computerUse: false, chromeMcp: true,
      mcpServerOverrides: ["server": false], pluginOverrides: ["plugin": true],
      executionEnvironment: .init(kind: "wsl", distro: "Fixture"), crew: binding.wire)
    config.selectionBinding = try XCTUnwrap(ModelSelectionBinding(owner: owner, model: "member", inertValues: [.effort: .string(""), .fast: .bool(false)]))
    return .init(connectionID: connection, binding: binding,
      lead: .init(agentKind: owner.agentKind, model: config.model, effort: config.effort, fast: config.fast, contextSize: config.contextSize),
      configuration: config)
  }

  func testHelperAndPolicyEditsKeepEveryLeadCarrierAndActualOwner() throws {
    let state = try draft(), previous = try XCTUnwrap(state.leadConfiguration)
    state.binding.policy = .crewFirst
    let role = try XCTUnwrap(state.role("helper"))
    role.wrappedValue.brief = "Check the change"
    role.wrappedValue.parallel = 3
    role.wrappedValue.selection.fast = false
    XCTAssertTrue(state.isValid)
    XCTAssertTrue(state.hasCompleteLeadConfiguration)
    XCTAssertEqual(state.leadConfiguration, previous)
    XCTAssertEqual(state.leadConfiguration?.selectionBinding?.owner, owner)
    XCTAssertNil(state.lead.savedSelection.effort)
    XCTAssertEqual(state.lead.effort, "", "saving a member never changes the inert lead carrier")
  }

  func testLeadFastDispatchesTheFamilyMutationRatherThanOverwritingInertFalse() throws {
    let state = try draft(), status = try status()
    state.leadConfiguration?.contextSize = "default"
    state.lead.contextSize = "default"
    let controls = RichChatComposerControlCatalog(agentStatus: status, presentationMode: .gui,
      configuration: try XCTUnwrap(state.leadConfiguration), agentInstanceID: owner.agentInstanceID)
    let catalog = CrewModelCatalog(statuses: [status], document: nil, leadKind: owner.agentKind,
      currentLead: state.lead, leadInstanceID: owner.agentInstanceID, liveLeadControls: controls)
    state.applyLeadFast(true, catalog: catalog)
    XCTAssertEqual(state.lead.model, "fast-member")
    XCTAssertEqual(state.leadConfiguration?.fast, false)
    XCTAssertEqual(state.displayedLeadFast(catalog: catalog), true)
    XCTAssertTrue(try XCTUnwrap(state.leadConfiguration?.selectionBinding).matches(try XCTUnwrap(state.leadConfiguration), owner: owner))
    XCTAssertEqual(state.leadConfiguration?.approvalPolicy, "review")
    XCTAssertEqual(state.leadConfiguration?.mcpServerOverrides, ["server": false])
    state.applyLeadFast(false, catalog: catalog)
    XCTAssertEqual(state.lead.model, "member")
    XCTAssertEqual(state.leadConfiguration?.fast, false)
    XCTAssertEqual(state.displayedLeadFast(catalog: catalog), false)
  }

  func testProviderRetargetNeverClaimsTheOldProvidersFullConfiguration() throws {
    let state = try draft(), status = try status()
    let catalog = CrewModelCatalog(statuses: [status], document: nil)
    state.updateLead(.init(agentKind: "other", model: "outside"), catalog: catalog)
    XCTAssertFalse(state.hasCompleteLeadConfiguration)
    XCTAssertNil(state.leadConfiguration)
    state.updateLead(.init(agentKind: "fixture", model: "member"), catalog: catalog)
    XCTAssertFalse(state.hasCompleteLeadConfiguration, "a model edit cannot resurrect another provider's configuration")
  }

  func testSameUIDExactModelPickRevokesFamilyEvidence() throws {
    let state = try draft(), status = try status()
    state.leadConfiguration?.contextSize = "default"; state.lead.contextSize = "default"
    let catalog = CrewModelCatalog(statuses: [status], document: nil, currentLead: state.lead,
      leadInstanceID: owner.agentInstanceID)
    let choice = try XCTUnwrap(catalog.choice(for: state.lead, lead: true))
    state.updateLead(catalog.replacing(state.lead, with: choice), catalog: catalog, exact: true)
    XCTAssertEqual(state.lead.model, "member")
    XCTAssertNil(state.leadConfiguration?.selectionBinding)
    XCTAssertEqual(state.leadConfiguration?.approvalPolicy, "review")
  }

  func testStagedFastCanReturnFromAHiddenMemberBeforeTheOuterCatalogRebuilds() throws {
    let state = try draft(), status = try status()
    state.leadConfiguration?.contextSize = "default"; state.lead.contextSize = "default"
    var raw = SettingsFixtures.settings
    raw["hiddenModels"] = ["fixture": ["fast-member"]]
    let document = try JSONDecoding.decode(SettingsDocument.self, from: SettingsFixtures.data(raw))
    let original = RichChatComposerControlCatalog(agentStatus: status, presentationMode: .gui,
      configuration: try XCTUnwrap(state.leadConfiguration), hiddenModels: document.hiddenModels, agentInstanceID: owner.agentInstanceID)
    let first = CrewModelCatalog(statuses: [status], document: document, currentLead: state.lead, liveLeadControls: original)
    state.applyLeadFast(true, catalog: first)
    XCTAssertEqual(state.lead.model, "fast-member")
    let updated = CrewModelCatalog(statuses: [status], document: document, currentLead: state.lead, liveLeadControls: original)
    XCTAssertNotNil(updated.choice(for: state.lead, lead: true))
    XCTAssertFalse(updated.helpers.contains { $0.model == "fast-member" })
    state.applyLeadFast(false, catalog: updated)
    XCTAssertEqual(state.lead.model, "member")
    XCTAssertEqual(state.leadConfiguration?.selectionBinding?.owner, owner)
  }

  func testSavedLeadDefaultsTurnFastOffAndKeepAnUnspecifiedContext() throws {
    let state = try draft()
    var raw = try status().raw
    var capabilities = try XCTUnwrap(raw["capabilities"]?.objectValue)
    capabilities.removeValue(forKey: "modelFamilies")
    raw["capabilities"] = .object(capabilities)
    let status = try AgentStatusRecord(wire: .object(raw))
    let catalog = CrewModelCatalog(statuses: [status], document: nil)
    state.lead.fast = true; state.leadConfiguration?.fast = true
    state.updateLead(.init(agentKind: "fixture", model: "member"), catalog: catalog, exact: true)
    XCTAssertEqual(state.leadConfiguration?.fast, false, "a pre-Fast saved Crew explicitly opts out like the PWA")
    XCTAssertEqual(state.leadConfiguration?.effort, "")
    XCTAssertEqual(state.leadConfiguration?.contextSize, "128k")
    XCTAssertNil(state.leadConfiguration?.selectionBinding)
  }

  func testRosterContextConfirmationUsesTheExistingDeclaredSessionPolicy() throws {
    let state = try draft()
    var raw = try status().raw
    var capabilities = try XCTUnwrap(raw["capabilities"]?.objectValue)
    capabilities.removeValue(forKey: "modelFamilies")
    capabilities["contextSizeChangeReloadsSession"] = .bool(true)
    raw["capabilities"] = .object(capabilities)
    let status = try AgentStatusRecord(wire: .object(raw))
    let catalog = CrewModelCatalog(statuses: [status], document: nil)
    state.binding.policy = .crewFirst
    XCTAssertFalse(state.requiresContextConfirmation(catalog: catalog, hasStartedSession: true))
    var lead = state.lead; lead.contextSize = "256k"
    state.updateLead(lead, catalog: catalog)
    XCTAssertTrue(state.requiresContextConfirmation(catalog: catalog, hasStartedSession: true))
    XCTAssertFalse(state.requiresContextConfirmation(catalog: catalog, hasStartedSession: false))
    capabilities.removeValue(forKey: "contextSizeChangeReloadsSession")
    raw["capabilities"] = .object(capabilities)
    let older = CrewModelCatalog(statuses: [try AgentStatusRecord(wire: .object(raw))], document: nil)
    XCTAssertFalse(state.requiresContextConfirmation(catalog: older, hasStartedSession: true))
  }

  func testComposerReplacementKeepsRosterButRetargetingNeverShowsAnotherHostsEditor() throws {
    let draft = RichChatThreadDraftState(store: .init())
    let first = RichChatComposerDraftKey(connectionID: connection, threadID: "thread")
    draft.prepare(for: first, baseConfiguration: .empty)
    let roster = try self.draft()
    draft.crewRoster = roster; draft.composerControlDestination = .crew
    draft.prepare(for: first, baseConfiguration: .empty)
    XCTAssertTrue(draft.crewRoster === roster)
    let second = RichChatComposerDraftKey(connectionID: ClientConnectionID(), threadID: "thread")
    draft.prepare(for: second, baseConfiguration: .empty)
    XCTAssertNil(draft.crewRoster)
    XCTAssertNil(draft.composerControlDestination)
  }

  func testStaleFallbackOrRoleBindingsCannotWriteIntoAReplacementRoster() throws {
    let state = try draft(), status = try status()
    let catalog = CrewModelCatalog(statuses: [status], document: nil)
    let role = try XCTUnwrap(state.role("helper"))
    role.wrappedValue.fallbacks = [.init(agentKind: "fallback", model: "mini")]
    let fallback = try XCTUnwrap(state.member(.fallback(role: "helper", index: 0), catalog: catalog))
    role.wrappedValue.fallbacks = []
    fallback.wrappedValue = .init(agentKind: "unexpected", model: "model")
    XCTAssertEqual(state.binding.roles[0].fallbacks, [])
    state.binding.roles.removeAll()
    role.wrappedValue.label = "Stale"
    XCTAssertTrue(state.binding.roles.isEmpty)
  }

  func testCrewRunsUseHostCrossagentMarkersAndRoleAliasesIncludingRunningCompletedItems() {
    func run(_ id: String, marked: Bool, state: RichItemState = .completed, parent: String? = nil, status: String = "completed") -> RichRuntimeItem {
      .init(id: id, type: "tool_call", state: state, payload: .object([
        "isCrossagent": .bool(marked), "name": .string("delegate"), "status": .string(status),
        "args": .object(["agentType": .string(" Reviewer "), "description": .string("Inspect change")]),
      ]), streams: [:], parentItemID: parent)
    }
    let values = CrewRunPresentation.project([run("a", marked: true), run("b", marked: true, status: "running"),
      run("nested", marked: true, parent: "a"), run("ordinary", marked: false)])
    XCTAssertEqual(values.map(\.id), ["a", "b"])
    XCTAssertEqual(values.map(\.role), ["reviewer", "reviewer"])
    XCTAssertEqual(values.map(\.isRunning), [false, true])
  }
}
