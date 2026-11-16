import SwiftUI
import XCTest
@testable import App

@MainActor
final class HomeQuickComposeStateTests: XCTestCase {
  private func session() async throws -> AppSession {
    let suite = "home-quick-compose-\(UUID().uuidString)"
    addTeardownBlock {
      UserDefaults(suiteName: suite)?.removePersistentDomain(forName: suite)
      let directory = FileManager.default.temporaryDirectory.appendingPathComponent("poracode-composition-hosts-\(suite)")
      try? FileManager.default.removeItem(at: directory)
    }
    let (session, _, _) = try await makeSession(suite: suite, apiFactory: { endpoint, _ in FakeRemoteAPI(endpoint: endpoint) })
    return session
  }

  func testWindowContextRetainsCompleteDraftAcrossEditorReplacement() async throws {
    let session = try await session(), host = ClientConnectionID()
    session.state.selectedConnectionId = host
    let store = HomeQuickComposeStore()
    let context = HomeQuickComposeStore.Context(connectionID: host, workspaceID: "work")
    let first = store.state(for: context, session: session, initialProjectID: "project")
    first.prompt = "Keep this draft"
    first.promptSelection = NSRange(location: 4, length: 3)
    first.configuredConfiguration = ThreadLaunchConfiguration(model: "selected-model", effort: "high",
      fast: true, workflows: true)
    first.attachments = [.init(name: "proof.png", mimeType: "image/png", remotePath: "/uploads/proof.png")]
    first.fileMentions = ["src/main.swift"]
    first.worktreeSelection = .worktree
    first.worktreeBranchName = "feature/draft"
    let replacement = store.state(for: context, session: session)
    XCTAssertTrue(first === replacement)
    XCTAssertEqual(replacement.threadID, first.threadID)
    XCTAssertEqual(replacement.prompt, "Keep this draft")
    XCTAssertEqual(replacement.promptSelection, NSRange(location: 4, length: 3))
    XCTAssertEqual(replacement.selectedModel, "selected-model")
    XCTAssertEqual(replacement.configuredConfiguration, first.configuredConfiguration)
    XCTAssertEqual(replacement.attachments.first?.remotePath, "/uploads/proof.png")
    XCTAssertEqual(replacement.fileMentions, ["src/main.swift"])
    XCTAssertEqual(replacement.worktreeSelection, .worktree)
    XCTAssertEqual(replacement.worktreeBranchName, "feature/draft")
  }

  func testEqualRawProjectIDsOnDifferentHostsAndWorkspacesNeverShareDrafts() async throws {
    let session = try await session(), a = ClientConnectionID(), b = ClientConnectionID()
    let store = HomeQuickComposeStore()
    session.state.selectedConnectionId = a
    let work = store.state(for: .init(connectionID: a, workspaceID: "work"), session: session, initialProjectID: "same-project")
    work.prompt = "Only host A"
    work.configuredConfiguration = ThreadLaunchConfiguration(model: "pro", workflows: true)
    let side = store.state(for: .init(connectionID: a, workspaceID: "side"), session: session, initialProjectID: "same-project")
    session.state.selectedConnectionId = b
    let other = store.state(for: .init(connectionID: b, workspaceID: "work"), session: session, initialProjectID: "same-project")
    XCTAssertFalse(work === side)
    XCTAssertFalse(work === other)
    XCTAssertTrue(side.prompt.isEmpty)
    XCTAssertTrue(other.prompt.isEmpty)
    XCTAssertNil(other.configuredConfiguration)
    XCTAssertEqual(work.connectionID, a)
    XCTAssertEqual(other.connectionID, b)
    XCTAssertEqual(store.existing(.init(connectionID: a, workspaceID: "work"))?.prompt, "Only host A")
  }

  func testExplicitProjectChangeKeepsTextAndClearsProjectScopedChoices() async throws {
    let state = HomeQuickComposeState(session: try await session(), initialProjectID: "a")
    state.prompt = "Keep text while choosing a project"
    state.configuredConfiguration = ThreadLaunchConfiguration(model: "old-model", workflows: true)
    state.fileMentions = ["old/project.swift"]
    state.projectID = "a"
    XCTAssertEqual(state.fileMentions, ["old/project.swift"])
    state.projectID = "b"
    XCTAssertEqual(state.prompt, "Keep text while choosing a project")
    XCTAssertNil(state.selectedModel)
    XCTAssertNil(state.configuredConfiguration)
    XCTAssertTrue(state.fileMentions.isEmpty)
  }

  func testDetachedEditorDoesNotCancelTheWindowDraftLaunch() async throws {
    let state = HomeQuickComposeState(session: try await session())
    let host = ThreadHostIdentity(clientConnectionID: ClientConnectionID(), desktopID: "fixture", host: "https://fixture.test")
    let target = ThreadLifecycleTarget(lease: .init(identity: host, generation: 1), threadID: "new-draft")
    state.lifecycle.activate(target)
    let old = UUID(), replacement = UUID()
    state.beginPresentation(old)
    state.endPresentation(old)
    state.beginPresentation(replacement)
    await Task.yield()
    state.endPresentation(old)
    XCTAssertTrue(state.isPresented(replacement))
    XCTAssertEqual(state.lifecycle.target, target)
    state.endPresentation(replacement)
    for _ in 0..<5 { await Task.yield() }
    XCTAssertEqual(state.lifecycle.target, target)
    state.beginPresentation(UUID())
    XCTAssertEqual(state.lifecycle.target, target)
  }

  func testStaleMediaCallbacksCannotDeselectTheReplacementOrUseAnotherHost() async throws {
    let session = try await session(), host = ClientConnectionID()
    session.state.selectedConnectionId = host
    let state = HomeQuickComposeState(session: session)
    let access = RichChatSessionAccess(lease: .init(connectionID: host, generation: 1),
      isOnline: true, isReady: true, capabilities: [.sessionRead, .sessionOperate])
    let old = UUID(), replacement = UUID()
    state.beginPresentation(old)
    state.synchronizeMedia(access: access, presentation: old)
    let target = state.mediaSuite.scope.target
    XCTAssertNotNil(target)
    state.beginPresentation(replacement)
    state.endPresentation(old)
    state.synchronizeMedia(access: nil, presentation: old)
    XCTAssertEqual(state.mediaSuite.scope.target, target)
    state.endPresentation(replacement)
    for _ in 0..<5 { await Task.yield() }
    XCTAssertEqual(state.mediaSuite.scope.target, target)

    let other = RichChatSessionAccess(lease: .init(connectionID: ClientConnectionID(), generation: 1),
      isOnline: true, isReady: true, capabilities: [.sessionRead, .sessionOperate])
    state.beginPresentation(replacement)
    state.synchronizeMedia(access: other, presentation: replacement)
    XCTAssertNil(state.mediaSuite.scope.target)
    state.synchronizeMedia(access: access, presentation: replacement)
    XCTAssertEqual(state.mediaSuite.scope.target, target)
  }

  func testHostChangesCannotNormalizeAwayTheRetainedProjectAndChoices() async throws {
    let session = try await session()
    session.state.selectedConnectionId = ClientConnectionID()
    let state = HomeQuickComposeState(session: session, initialProjectID: "saved-project")
    state.configuredConfiguration = ThreadLaunchConfiguration(model: "saved-model")
    state.presentationMode = .terminal
    state.fileMentions = ["src/saved.swift"]
    let editor = HomeQuickComposeView(session: session, isExpanded: .constant(true), draft: state) { _ in }
    session.state.selectedConnectionId = ClientConnectionID()
    editor.normalizeProject()
    editor.normalizePresentationMode()
    XCTAssertEqual(state.projectID, "saved-project")
    XCTAssertEqual(state.selectedModel, "saved-model")
    XCTAssertEqual(state.presentationMode, .terminal)
    XCTAssertEqual(state.fileMentions, ["src/saved.swift"])
  }

  func testSuccessfulSubmissionDiscardsOnlyItsOwnDraftAndStartsWorkflowModeOff() async throws {
    let session = try await session(), store = HomeQuickComposeStore()
    let context = HomeQuickComposeStore.Context(connectionID: nil, workspaceID: "work")
    let old = store.state(for: context, session: session)
    old.configuredConfiguration = ThreadLaunchConfiguration(model: "pro", workflows: true)
    store.discard(context, matching: old)
    let fresh = store.state(for: context, session: session)
    store.discard(context, matching: old)
    XCTAssertTrue(store.existing(context) === fresh)
    XCTAssertNil(fresh.configuredConfiguration)
    XCTAssertNotEqual(old.threadID, fresh.threadID)
  }

  func testIndependentComposerKeepsItsSeededWorktreePinned() async throws {
    let worktree = HomeComposerBranchSelection(branch: "feature/pinned", worktreePath: "/repo/.worktree")
    let state = HomeQuickComposeState(session: try await session(), initialProjectID: "project", initialWorktree: worktree)
    XCTAssertEqual(state.branchSelection, worktree)
    XCTAssertEqual(state.worktreeSelection, .worktree)
    XCTAssertEqual(state.projectID, "project")
  }

  func testIndependentLaunchCannotReAdmitItsExcludedSourceProvider() async throws {
    let (session, _, _) = try await configuredEditor()
    let seed = HomeThreadLaunchSeed(fixedProjectID: "p1", initialAgentKind: "fixture",
      initialModelID: "pro", initialPrompt: "Use another provider", excludedAgentKind: "fixture")
    let draft = HomeQuickComposeState(session: session, launchSeed: seed)
    let editor = HomeQuickComposeView(session: session, isExpanded: .constant(true), draft: draft) { _ in }
    XCTAssertTrue(editor.availableAgents.isEmpty)
    XCTAssertNil(editor.selectedAgent)
  }

  private func configuredEditor(modes: [String] = ["agent", "plan"]) async throws -> (AppSession, HomeQuickComposeState, HomeQuickComposeView) {
    let session = try await session()
    session.state.profile = makeProfile()
    session.state.selectedConnectionId = ClientConnectionID()
    session.state.snapshot = makeShell(seq: 1)
    let capabilities: [String: JSONValue] = [
      "models": .array(["pro", "pro-light"].map { .object(["id": .string($0), "label": .string($0)]) }),
      "efforts": .array([.string("low"), .string("high")]),
      "defaultEffort": .string("low"),
      "modes": .array(modes.map(JSONValue.string)),
      "fastModels": .array([.string("pro"), .string("pro-light")]),
      "workflowModels": .array([.string("pro"), .string("pro-light")]),
      "contextSizes": .array(["128k", "256k"].map { .object(["id": .string($0), "label": .string($0)]) }),
      "defaultApprovalPolicy": .string("review"),
      "approvalPolicies": .array([
        .object(["id": .string("review"), "label": .string("Review")]),
        .object(["id": .string("never"), "label": .string("No prompts")]),
      ]),
      "defaultSandboxMode": .string("project"),
      "bypassPermissions": .object([
        "approvalPolicy": .string("never"), "sandboxMode": .string("all-files"),
        "preferDeclaredApprovalPolicy": .bool(true),
      ]),
    ]
    session.state.replay.agentStatuses.upsert(try AgentStatusRecord(wire: .object([
      "kind": .string("fixture"), "label": .string("Fixture"),
      "installed": .bool(true), "authState": .string("authenticated"),
      "capabilities": .object(capabilities),
    ])))
    let draft = HomeQuickComposeState(session: session, initialProjectID: "p1")
    XCTAssertEqual(session.projects.map(\.id), ["p1"])
    let editor = HomeQuickComposeView(session: session, isExpanded: .constant(true), draft: draft) { _ in }
    return (session, draft, editor)
  }

  func testSharedControlsEditTheConfigurationThatWillBeLaunched() async throws {
    let (_, draft, editor) = try await configuredEditor()
    var configuration = editor.composerControlsBinding.wrappedValue
    let catalog = editor.composerControlsCatalog
    catalog.applyEffortEdit("high", to: &configuration)
    catalog.applyFastEdit(true, to: &configuration)
    catalog.applyPermissionPolicy("never", to: &configuration)
    configuration.contextSize = "256k"
    configuration.workflows = true
    editor.composerControlsBinding.wrappedValue = configuration
    let launch = try XCTUnwrap(editor.effectiveConfiguration)
    XCTAssertEqual(launch.model, "pro")
    XCTAssertEqual(launch.effort, "high")
    XCTAssertEqual(launch.fast, true)
    XCTAssertEqual(launch.contextSize, "256k")
    XCTAssertEqual(launch.approvalPolicy, "never")
    XCTAssertEqual(launch.sandboxMode, "all-files")
    XCTAssertEqual(launch.workflows, true)
    XCTAssertEqual(draft.configuredConfiguration?.effort, "high")
    XCTAssertEqual(editor.composerControlsBinding.wrappedValue, ThreadConfig(launch))
  }

  func testControlsOpenWithoutChangingDefaultPermissionsOrWorkflowMode() async throws {
    let (_, draft, editor) = try await configuredEditor()
    let before = try XCTUnwrap(editor.effectiveConfiguration)
    editor.openComposerControls()
    XCTAssertEqual(draft.selector, .controls)
    XCTAssertEqual(editor.effectiveConfiguration, before)
    XCTAssertNil(draft.configuredConfiguration)
    XCTAssertNil(draft.configuredConfiguration?.workflows)
    XCTAssertEqual(before.approvalPolicy, "review")
    XCTAssertNil(before.sandboxMode)
  }

  func testSameProviderModelPicksRetainPermissionsContextAndSkills() async throws {
    let (_, draft, editor) = try await configuredEditor()
    XCTAssertNil(draft.selectedAgentKind, "the displayed default provider is initially implicit")
    var configuration = editor.composerControlsBinding.wrappedValue
    editor.composerControlsCatalog.applyEffortEdit("high", to: &configuration)
    editor.composerControlsCatalog.applyFastEdit(true, to: &configuration)
    editor.composerControlsCatalog.applyPermissionPolicy("never", to: &configuration)
    configuration.contextSize = "256k"
    configuration.workflows = true
    editor.composerControlsBinding.wrappedValue = configuration
    let skill = RichChatSelectedSkill(name: "Review", path: "/skills/review", invocation: "$review",
      provider: "fixture", scope: .project, pluginID: nil, pluginName: nil)
    draft.skills = [skill]
    XCTAssertEqual(draft.selectedAgentKind, "fixture", "a local edit pins the provider with its complete config")
    editor.selectModel(.init(agentKind: "fixture", modelID: "pro", label: "Pro"))
    XCTAssertEqual(editor.composerControlsBinding.wrappedValue, configuration)
    XCTAssertEqual(draft.skills, [skill])
    editor.selectModel(.init(agentKind: "fixture", modelID: "pro-light", label: "Pro Light"))
    let next = editor.composerControlsBinding.wrappedValue
    XCTAssertEqual(next.model, "pro-light")
    XCTAssertEqual(next.effort, "low", "A different model starts from its own preference/default")
    XCTAssertEqual(next.fast, true)
    XCTAssertEqual(next.contextSize, "256k")
    XCTAssertEqual(next.approvalPolicy, "never")
    XCTAssertEqual(next.sandboxMode, "all-files")
    XCTAssertEqual(next.workflows, true)
    XCTAssertEqual(draft.skills, [skill])
    editor.selectModel(.init(agentKind: "fixture", modelID: "pro", label: "Pro"))
    XCTAssertEqual(editor.effectiveConfiguration?.effort, "high", "Returning restores this model's remembered effort")
  }

  func testControlsRestoreTheProjectsSavedPermissionsLikeThePWA() async throws {
    let (session, _, editor) = try await configuredEditor()
    var snapshot = try XCTUnwrap(session.state.snapshot)
    snapshot.projects[0].lastDraftConfig = .object([
      "agentKind": .string("fixture"), "model": .string("pro"),
      "approvalPolicy": .string("never"), "sandboxMode": .string("all-files"),
      "approvalsReviewer": .string("earlier-reviewer"), "workflows": .bool(true),
    ])
    session.state.snapshot = snapshot
    let current = try XCTUnwrap(editor.effectiveConfiguration)
    XCTAssertEqual(current.approvalPolicy, "never")
    XCTAssertEqual(current.sandboxMode, "all-files")
    XCTAssertEqual(current.approvalsReviewer, "earlier-reviewer")
    XCTAssertNil(current.workflows)
  }

  func testOrdinaryProjectDefaultsUseDeviceModelChoicesWithoutRewritingTheRecord() async throws {
    let (session, _, editor) = try await configuredEditor()
    for fast in [nil, false, true] as [Bool?] {
      let saved = ThreadConfig(model: "pro", effort: "", contextSize: "", fast: fast,
        thinking: false, workflows: true, mode: "agent", approvalPolicy: "never",
        approvalsReviewer: "", sandboxMode: "all-files", browserMcp: false,
        crossagentMcp: true, computerUse: false, chromeMcp: false,
        mcpServerOverrides: ["custom-server": false], pluginOverrides: ["review": false],
        executionEnvironment: .init(kind: "wsl", distro: "Ubuntu-22.04"), crew: .null)
      let raw = try savedDraft(saved)
      var snapshot = try XCTUnwrap(session.state.snapshot)
      snapshot.projects[0].lastDraftConfig = raw
      session.state.snapshot = snapshot
      session.composerPreferences.rememberModel(ThreadConfig(model: "pro", fast: fast),
        owner: .init(agentKind: "fixture", presentationMode: .gui))
      var expected = ThreadLaunchConfiguration(saved)
      expected.workflows = nil
      expected.effort = "low"
      expected.contextSize = "128k"
      expected.fast = fast ?? true
      expected.thinking = nil
      XCTAssertEqual(editor.effectiveConfiguration, expected,
        "Ordinary models use device preferences/defaults; project metadata remains untouched")
      XCTAssertEqual(session.state.snapshot?.projects[0].lastDraftConfig, raw)
    }
  }

  func testExplicitClearsAndMCPChangesKeepTheRestOfTheLaunchSelection() async throws {
    let (session, draft, editor) = try await configuredEditor()
    var snapshot = try XCTUnwrap(session.state.snapshot)
    snapshot.projects[0].lastDraftConfig = try savedDraft(ThreadConfig(model: "pro", effort: "high",
      contextSize: "256k", fast: true, thinking: true, approvalPolicy: "never", sandboxMode: "all-files",
      mcpServerOverrides: ["custom-server": false], pluginOverrides: ["review": true], crew: .null))
    session.state.snapshot = snapshot
    var edited = editor.composerControlsBinding.wrappedValue
    edited.effort = nil
    edited.fast = nil
    edited.contextSize = ""
    edited.thinking = false
    editor.composerControlsBinding.wrappedValue = edited
    XCTAssertEqual(editor.effectiveConfiguration, ThreadLaunchConfiguration(edited))
    editor.mcpBinding(.browser).wrappedValue = true
    edited.browserMcp = true
    XCTAssertEqual(editor.composerControlsBinding.wrappedValue, edited)
    editor.disableMCPMention("browser")
    edited.browserMcp = false
    XCTAssertEqual(editor.composerControlsBinding.wrappedValue, edited)
    XCTAssertEqual(draft.configuredConfiguration, ThreadLaunchConfiguration(edited))
    let encoded = try JSONDecoding.decode(JSONValue.self,
      from: JSONDecoding.encoder.encode(try XCTUnwrap(editor.effectiveConfiguration))).objectValue
    XCTAssertNil(encoded?["effort"])
    XCTAssertNil(encoded?["fast"])
    XCTAssertEqual(encoded?["contextSize"], .string(""))
    XCTAssertEqual(encoded?["crew"], .null)
  }

  func testWorkflowModeIsOnlyRestoredFromTheCurrentDraftAndRequiresModelSupport() async throws {
    let (session, draft, editor) = try await configuredEditor()
    var snapshot = try XCTUnwrap(session.state.snapshot)
    snapshot.projects[0].lastDraftConfig = try savedDraft(ThreadConfig(model: "pro", workflows: true))
    session.state.snapshot = snapshot
    XCTAssertNil(editor.effectiveConfiguration?.workflows)
    var edited = editor.composerControlsBinding.wrappedValue
    edited.workflows = true
    editor.composerControlsBinding.wrappedValue = edited
    XCTAssertEqual(editor.effectiveConfiguration?.workflows, true)
    edited.model = "unadvertised"
    editor.composerControlsBinding.wrappedValue = edited
    XCTAssertNil(editor.effectiveConfiguration?.workflows)
    XCTAssertEqual(draft.configuredConfiguration?.workflows, true,
      "An unsupported surface must not rewrite the retained user choice")
    draft.projectID = "another-project"
    XCTAssertNil(draft.configuredConfiguration)
    XCTAssertNil(editor.effectiveConfiguration?.workflows)
  }

  private func savedDraft(_ configuration: ThreadConfig) throws -> JSONValue {
    let data = try JSONDecoding.encoder.encode(configuration)
    var object = try XCTUnwrap(JSONDecoding.decode(JSONValue.self, from: data).objectValue)
    object["agentKind"] = .string("fixture")
    return .object(object)
  }

  func testRemoteDefaultUpdatesCannotRetargetALocalDraftOrAnUnavailableProvider() async throws {
    let (session, draft, editor) = try await configuredEditor()
    let originalAgent = try XCTUnwrap(editor.selectedAgent)
    let other = try AgentStatusRecord(wire: .object([
      "kind": .string("other"), "label": .string("Other"),
      "installed": .bool(true), "authState": .string("authenticated"),
      "capabilities": .object(editor.composerControlsCatalog.capabilities),
    ]))
    session.state.replay.agentStatuses.upsert(other)
    var edited = editor.composerControlsBinding.wrappedValue
    edited.fast = true
    edited.approvalPolicy = "never"
    editor.composerControlsBinding.wrappedValue = edited
    var snapshot = try XCTUnwrap(session.state.snapshot)
    snapshot.projects[0].lastDraftConfig = .object([
      "agentKind": .string("other"), "model": .string("pro-light"),
    ])
    session.state.snapshot = snapshot
    XCTAssertEqual(editor.selectedAgent?.kind, "fixture")
    XCTAssertEqual(editor.composerControlsBinding.wrappedValue, edited)
    session.state.replay.agentStatuses.removeAll()
    session.state.replay.agentStatuses.upsert(other)
    XCTAssertNil(editor.selectedAgent, "another provider cannot inherit this provider's model or permissions")
    XCTAssertNil(editor.effectiveConfiguration)
    XCTAssertEqual(draft.configuredConfiguration, ThreadLaunchConfiguration(edited))
    session.state.replay.agentStatuses.upsert(originalAgent)
    XCTAssertEqual(editor.composerControlsBinding.wrappedValue, edited)
  }

  func testCrossProviderFamilyRowUsesTheTargetRelationAndOwnerDespiteAnEqualUID() async throws {
    let (session, _, editor) = try await configuredEditor()
    let capability: [String: JSONValue] = [
      "models": .array(["pro", "pro-fast"].map { .object(["id": .string($0), "label": .string($0)]) }),
      "modelFamilies": .array([.object([
        "model": .string("pro"), "label": .string("Target Family"), "selectors": .array([]),
        "bindings": .object(["effort": .string("model"), "fast": .string("model")]),
        "redundantValues": .object(["effort": .array([.string("")]), "fast": .array([.bool(false)])]),
        "members": .array([
          .object(["model": .string("pro"), "selections": .object([:]), "effort": .string("low"), "fast": .bool(false)]),
          .object(["model": .string("pro-fast"), "selections": .object([:]), "effort": .string("low"), "fast": .bool(true)]),
        ]),
      ])]),
    ]
    session.state.replay.agentStatuses.upsert(try AgentStatusRecord(wire: .object([
      "kind": .string("target"), "label": .string("Target"), "installed": .bool(true),
      "authState": .string("authenticated"), "capabilities": .object(capability),
    ])))
    var previous = editor.composerControlsBinding.wrappedValue
    previous.effort = "high"
    previous.fast = true
    previous.browserMcp = true
    editor.composerControlsBinding.wrappedValue = previous
    editor.selectModel(.init(agentKind: "target", modelID: "pro", label: "Target Family"))
    let selected = editor.composerControlsBinding.wrappedValue
    XCTAssertEqual(editor.selectedAgent?.kind, "target")
    XCTAssertEqual(selected.model, "pro")
    XCTAssertEqual(selected.effort, "")
    XCTAssertEqual(selected.fast, false)
    XCTAssertNil(selected.browserMcp)
    let owner = ModelSelectionOwner(agentKind: "target", presentationMode: .gui)
    XCTAssertEqual(selected.selectionBinding?.inertValues, [.effort: .string(""), .fast: .bool(false)])
    XCTAssertTrue(try XCTUnwrap(selected.selectionBinding).matches(selected, owner: owner))
  }

  func testBoundProjectRestoreRetainsOnlyMatchingPresentationWithoutRewritingJSON() async throws {
    let (session, draft, editor) = try await configuredEditor()
    var capabilities = editor.composerControlsCatalog.capabilities
    capabilities["modelFamilies"] = .array([.object([
      "model": .string("pro"), "label": .string("Fixture Family"), "selectors": .array([]),
      "bindings": .object(["effort": .string("model"), "fast": .string("model")]),
      "redundantValues": .object(["effort": .array([.string("")]), "fast": .array([.bool(false)])]),
      "members": .array([
        .object(["model": .string("pro"), "selections": .object([:]), "effort": .string("low"), "fast": .bool(false)]),
        .object(["model": .string("pro-light"), "selections": .object([:]), "effort": .string("low"), "fast": .bool(true)]),
      ]),
    ])])
    session.state.replay.agentStatuses.upsert(try AgentStatusRecord(wire: .object([
      "kind": .string("fixture"), "label": .string("Fixture"), "installed": .bool(true),
      "authState": .string("authenticated"), "capabilities": .object(capabilities),
    ])))
    var selected = ThreadConfig(model: "pro", effort: "", fast: false)
    let owner = ModelSelectionOwner(agentKind: "fixture", presentationMode: .gui)
    selected.selectionBinding = try XCTUnwrap(.init(owner: owner, model: selected.model,
      inertValues: [.effort: .string(""), .fast: .bool(false)]))
    let raw = try savedDraft(selected)
    var snapshot = try XCTUnwrap(session.state.snapshot)
    snapshot.projects[0].lastDraftConfig = raw
    session.state.snapshot = snapshot
    XCTAssertEqual(editor.effectiveConfiguration?.selectionBinding, selected.selectionBinding)
    XCTAssertEqual(session.state.snapshot?.projects[0].lastDraftConfig, raw)
    draft.presentationMode = .terminal
    XCTAssertNil(editor.effectiveConfiguration?.selectionBinding)
    XCTAssertEqual(session.state.snapshot?.projects[0].lastDraftConfig, raw)
  }

  func testPreviousConversationPermissionsAreNotASavedDraftPreference() async throws {
    let (session, _, editor) = try await configuredEditor()
    var snapshot = try XCTUnwrap(session.state.snapshot)
    var previous = makeThread(id: "previous")
    previous.agentKind = "fixture"
    previous.config = ThreadConfig(model: "pro", approvalPolicy: "never", sandboxMode: "all-files")
    snapshot.threads = [previous]
    session.state.snapshot = snapshot
    XCTAssertEqual(editor.effectiveConfiguration?.approvalPolicy, "review")
    XCTAssertNil(editor.effectiveConfiguration?.sandboxMode)
  }

  func testRestoringPermissionsRejectsValuesFromAnotherSurface() {
    let configuration = ThreadLaunchConfiguration(model: "pro", approvalPolicy: "old-policy", sandboxMode: "old-sandbox")
    let capabilities: [String: JSONValue] = [
      "approvalPolicies": .array([.object(["id": .string("review"), "label": .string("Review")])]),
      "sandboxModes": .array([.object(["id": .string("project"), "label": .string("Project")])]),
      "defaultApprovalPolicy": .string("review"),
      "defaultSandboxMode": .string("project"),
    ]
    let restored = HomeQuickComposePermissionDefaults.resolve(configuration, saved: true, capabilities: capabilities)
    XCTAssertEqual(restored.approvalPolicy, "review")
    XCTAssertNil(restored.sandboxMode)
    let missing = HomeQuickComposePermissionDefaults.resolve(configuration, saved: true, capabilities: [:])
    XCTAssertNil(missing.approvalPolicy)
    XCTAssertNil(missing.sandboxMode)
  }

  func testSavedPermissionTupleSurvivesDelayedCapabilityLists() {
    let saved = ThreadLaunchConfiguration(model: "pro", approvalPolicy: "never",
      approvalsReviewer: "", sandboxMode: "all-files")
    var capabilities: [String: JSONValue] = [
      "defaultApprovalPolicy": .string("review"), "defaultSandboxMode": .string("project"),
      "defaultApprovalsReviewer": .string("automatic"),
      "bypassPermissions": .object([
        "approvalPolicy": .string("never"), "sandboxMode": .string("all-files"),
      ]),
    ]
    let pending = HomeQuickComposePermissionDefaults.resolve(saved, saved: true, capabilities: capabilities)
    XCTAssertEqual(pending, saved)
    capabilities["approvalPolicies"] = .array(["review", "never"].map { .object(["id": .string($0)]) })
    capabilities["sandboxModes"] = .array(["project", "all-files"].map { .object(["id": .string($0)]) })
    XCTAssertEqual(HomeQuickComposePermissionDefaults.resolve(pending, saved: true, capabilities: capabilities), saved)
  }

  func testStaleControlsCannotWriteToADraftAfterHostSelectionChanges() async throws {
    let (session, draft, editor) = try await configuredEditor()
    let before = editor.composerControlsBinding.wrappedValue
    var updated = before
    updated.fast = true
    session.state.selectedConnectionId = ClientConnectionID()
    editor.composerControlsBinding.wrappedValue = updated
    editor.openComposerControls()
    XCTAssertNil(draft.configuredConfiguration)
    XCTAssertNil(draft.selector)
    XCTAssertNil(draft.configuredConfiguration?.fast)
  }

  func testLegacyPlanDefaultsDoNotEnablePlanForANewDraft() async throws {
    let (session, draft, editor) = try await configuredEditor()
    var snapshot = try XCTUnwrap(session.state.snapshot)
    let stored: JSONValue = .object([
      "agentKind": .string("fixture"), "model": .string("pro"),
      "mode": .string("plan"), "contextSize": .string("256k"),
    ])
    snapshot.projects[0].lastDraftConfig = stored
    session.state.snapshot = snapshot
    XCTAssertEqual(editor.effectiveConfiguration?.mode, "agent")
    XCTAssertEqual(editor.effectiveConfiguration?.contextSize, "256k")
    XCTAssertEqual(session.state.snapshot?.projects[0].lastDraftConfig, stored,
      "Reading a legacy preference must not rewrite it")
    XCTAssertNil(draft.configuredConfiguration)

    snapshot.projects[0].lastDraftConfig = nil
    var previous = makeThread(id: "previous-plan")
    previous.agentKind = "fixture"
    previous.config = ThreadConfig(model: "pro", mode: "plan")
    snapshot.threads = [previous]
    session.state.snapshot = snapshot
    XCTAssertEqual(editor.effectiveConfiguration?.mode, "agent")
  }

  func testPlanIsAnExplicitDraftChoiceAndSurvivesModelEdits() async throws {
    let (session, draft, editor) = try await configuredEditor()
    var configuration = editor.composerControlsBinding.wrappedValue
    editor.composerControlsCatalog.applyPermissionPolicy("never", to: &configuration)
    configuration.contextSize = "256k"
    configuration.fast = true
    editor.composerControlsBinding.wrappedValue = configuration
    draft.selector = .add
    XCTAssertTrue(editor.canTogglePlan)
    editor.togglePlan()
    configuration.mode = "plan"
    XCTAssertEqual(editor.composerControlsBinding.wrappedValue, configuration)
    XCTAssertNil(draft.selector)
    editor.selectModel(.init(agentKind: "fixture", modelID: "pro-light", label: "Pro Light"))
    XCTAssertEqual(editor.effectiveConfiguration?.mode, "plan")
    editor.togglePlan()
    XCTAssertEqual(editor.effectiveConfiguration?.mode, "agent")
    XCTAssertEqual(editor.effectiveConfiguration?.approvalPolicy, "never")
    XCTAssertEqual(editor.effectiveConfiguration?.contextSize, "256k")
    let fresh = HomeQuickComposeState(session: session, initialProjectID: "p1")
    let next = HomeQuickComposeView(session: session, isExpanded: .constant(true), draft: fresh) { _ in }
    XCTAssertNotEqual(next.effectiveConfiguration?.mode, "plan")
  }

  func testPlanUnavailableOnUnsupportedSurfaceOrAfterHostChange() async throws {
    let (_, unsupported, editor) = try await configuredEditor(modes: ["agent"])
    XCTAssertFalse(editor.canTogglePlan)
    editor.togglePlan()
    XCTAssertNil(unsupported.configuredConfiguration)
    let (session, draft, available) = try await configuredEditor()
    session.state.selectedConnectionId = ClientConnectionID()
    draft.selector = .add
    available.togglePlan()
    XCTAssertNil(draft.configuredConfiguration)
    XCTAssertEqual(draft.selector, .add)
  }

  func testWindowDraftRetainsNativeSublevelsAcrossPresenterReplacement() async throws {
    let session = try await session(), store = HomeQuickComposeStore()
    let context = HomeQuickComposeStore.Context(connectionID: session.selectedConnectionId, workspaceID: "work")
    let first = store.state(for: context, session: session, initialProjectID: "p1")
    first.selector = .add
    first.selectorPath = [.photos]
    let replacement = store.state(for: context, session: session)
    XCTAssertEqual(replacement.selectorPath, [.photos])
    replacement.selector = .controls
    XCTAssertTrue(replacement.selectorPath.isEmpty)
    replacement.selectorPath = [.models]
    replacement.selector = nil
    XCTAssertEqual(replacement.selectorPath, [.models], "Dismissal must not also pop the visible stack")
    replacement.selector = .add
    XCTAssertTrue(replacement.selectorPath.isEmpty)
  }

  func testFreshDraftRestoresDeviceChoicesWithoutReusingPlanOrTransientCrew() async throws {
    let (session, draft, editor) = try await configuredEditor()
    let originalProject = session.state.snapshot?.projects[0]
    var selected = editor.composerControlsBinding.wrappedValue
    selected.effort = "high"
    selected.fast = false
    selected.contextSize = "256k"
    selected.approvalPolicy = "never"
    selected.sandboxMode = "all-files"
    selected.mode = "plan"
    editor.composerControlsBinding.wrappedValue = selected

    let fresh = HomeQuickComposeState(session: session, initialProjectID: "p1")
    let restored = HomeQuickComposeView(session: session, isExpanded: .constant(true), draft: fresh) { _ in }
    var expected = selected
    expected.mode = "agent"
    XCTAssertEqual(restored.effectiveConfiguration, ThreadLaunchConfiguration(expected))
    XCTAssertNil(fresh.configuredConfiguration, "Reading saved choices must not masquerade as a new user edit")
    XCTAssertEqual(session.state.snapshot?.projects[0], originalProject,
      "An old host without catalog mutations must keep its project record intact")
    XCTAssertEqual(draft.configuredConfiguration?.mode, "plan", "The existing unsent draft keeps its explicit Plan choice")

    // Provider presets travel to another project; Crew and per-draft tool
    // selections do not. These fields may still be saved for the original project.
    let owner = ModelSelectionOwner(agentKind: "fixture", presentationMode: .gui)
    selected.crew = .object(["privateDraft": .bool(true)])
    selected.browserMcp = true
    session.composerPreferences.rememberConfiguration(selected, owner: owner,
      capabilities: editor.composerControlsCatalog.capabilities, homeScope: false)
    let provider = try XCTUnwrap(session.composerPreferences.providerConfiguration(for: owner))
    XCTAssertNil(provider.crew)
    XCTAssertNil(provider.browserMcp)
    XCTAssertEqual(provider.fast, false)
    XCTAssertEqual(provider.mode, "agent")
  }

  func testCapableHostProjectDefaultsWinOverAnOlderLocalCopy() async throws {
    let (session, _, editor) = try await configuredEditor()
    var old = editor.composerControlsBinding.wrappedValue
    old.effort = "high"
    old.fast = false
    editor.composerControlsBinding.wrappedValue = old
    let fresh = HomeQuickComposeState(session: session, initialProjectID: "p1")
    XCTAssertNotNil(fresh.restoredSelection)
    let restored = HomeQuickComposeView(session: session, isExpanded: .constant(true), draft: fresh) { _ in }
    var snapshot = try XCTUnwrap(session.state.snapshot)
    let serverChoice = try savedDraft(ThreadConfig(model: "pro-light", approvalPolicy: "review", sandboxMode: "project"))
    snapshot.projects[0].lastDraftConfig = serverChoice
    session.state.snapshot = snapshot
    session.state.catalogMutationsSupported = true
    fresh.reconcileProjectPreferenceAuthority(worktreeMode: true)
    XCTAssertNil(fresh.restoredSelection)
    XCTAssertEqual(restored.effectiveConfiguration?.model, "pro-light")
    XCTAssertEqual(restored.effectiveConfiguration?.effort, "low")
    XCTAssertEqual(restored.effectiveConfiguration?.approvalPolicy, "review")
    XCTAssertEqual(fresh.worktreeSelection, .worktree)
    let reopened = HomeQuickComposeState(session: session, initialProjectID: "p1")
    XCTAssertNil(reopened.restoredSelection)
    XCTAssertEqual(session.state.snapshot?.projects[0].lastDraftConfig, serverChoice)
    XCTAssertEqual(session.composerPreferences.modelPreferences(for:
      .init(agentKind: "fixture", presentationMode: .gui))["pro"]?.effort, "high")
  }
}
