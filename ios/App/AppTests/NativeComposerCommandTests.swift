import XCTest
import SwiftUI
import Observation
@testable import App

final class NativeComposerCommandTests: XCTestCase {
  @MainActor func testEqualDraftValuesStillRefreshTheKeyboardBindingOwner() async throws {
    let first = KeyboardDraft(), second = KeyboardDraft()
    let model = KeyboardDraftSelection(first)
    let name = "native-composer-binding-\(UUID().uuidString)"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
    defer { defaults.removePersistentDomain(forName: name) }
    let registry = NativeCommandRegistry(bindings: NativeKeybindingStore(preferences: defaults))
    let owner = UUID()
    registry.focus = .init(role: .composer, isTextInput: true, ownerID: owner)
    let appeared = expectation(description: "Composer commands installed")
    let replaced = expectation(description: "Retained draft replaces the temporary draft")
    let controls = try catalog(capabilities, configuration: first.configuration)
    let root = KeyboardDraftCommandHarness(selection: model, owner: owner, catalog: controls,
      appeared: { appeared.fulfill() }, replaced: { replaced.fulfill() })
      .environment(\.nativeCommandRegistry, registry)
    let host = UIHostingController(rootView: root)
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    window.windowScene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
    window.rootViewController = host; window.isHidden = false
    defer { window.isHidden = true; window.rootViewController = nil }
    await fulfillment(of: [appeared], timeout: 5)
    model.active = second
    await fulfillment(of: [replaced], timeout: 5)
    await Task.yield()
    XCTAssertTrue(registry.perform(chord: try XCTUnwrap(NativeKeyChord("Meta+T"))))
    XCTAssertEqual(first.configuration.effort, "low", "A retired draft must not receive the shortcut")
    XCTAssertEqual(second.configuration.effort, "high", "Equal values must not hide a changed binding destination")
  }

  func testCyclesUseDisplayedDefaultsAndKeepUnrelatedConfiguration() throws {
    var initial = ThreadConfig(model: "solo")
    initial.pluginOverrides = ["preserve": false]
    initial.computerUse = true
    let controls = try catalog(capabilities, configuration: initial)
    let effort = try XCTUnwrap(NativeComposerConfigCommand.effort.applying(to: initial, catalog: controls))
    XCTAssertEqual(effort.effort, "low", "Auto starts at the first advertised option")
    XCTAssertEqual(effort.pluginOverrides, initial.pluginOverrides); XCTAssertEqual(effort.computerUse, true)
    let high = try XCTUnwrap(NativeComposerConfigCommand.effort.applying(to: effort, catalog: controls))
    XCTAssertEqual(high.effort, "high", "An explicit displayed Low value cycles to High")
    let fast = try XCTUnwrap(NativeComposerConfigCommand.fast.applying(to: initial, catalog: controls))
    XCTAssertEqual(fast.fast, true); XCTAssertEqual(fast.model, "solo")
    let plan = try XCTUnwrap(NativeComposerConfigCommand.plan.applying(to: initial, catalog: controls))
    XCTAssertEqual(plan.mode, "plan")
    XCTAssertEqual(NativeComposerConfigCommand.plan.applying(to: plan, catalog: controls)?.mode, "agent")
  }

  func testPermissionCycleAppliesAndLeavesTheCompoundFullAccessPreset() throws {
    let initial = ThreadConfig(model: "solo")
    let controls = try catalog(capabilities, configuration: initial)
    let full = try XCTUnwrap(NativeComposerConfigCommand.permission.applying(to: initial, catalog: controls))
    XCTAssertEqual(full.approvalPolicy, "never"); XCTAssertEqual(full.sandboxMode, "all-files")
    XCTAssertEqual(full.approvalsReviewer, "")
    let review = try XCTUnwrap(NativeComposerConfigCommand.permission.applying(to: full, catalog: controls))
    XCTAssertEqual(review.approvalPolicy, "review"); XCTAssertEqual(review.sandboxMode, "project")
    XCTAssertEqual(review.approvalsReviewer, "reviewer")
    var mismatched = full; mismatched.sandboxMode = "project"
    XCTAssertEqual(NativeComposerConfigCommand.permission.applying(to: mismatched, catalog: controls)?.approvalPolicy,
      "review", "An unmatched sandbox/policy combination is not displayed as a full-access selection")
  }

  func testEncodedFamilyEditsResolveMembersAndRejectMissingTuples() throws {
    var family = capabilities
    family["models"] = .array(["pair-low", "pair-high", "pair-fast"].map { .object(["id": .string($0), "label": .string($0)]) })
    family["fastModels"] = .array([])
    family["fastDisabledReason"] = .string("Ordinary Fast is disabled")
    family["modelFamilies"] = .array([.object([
      "model": .string("pair-low"), "label": .string("Pair"),
      "selectors": .array([.object(["id": .string("side"), "labelKey": .string("modelSelection.sidekick"),
        "options": .array([.object(["id": .string("a"), "label": .string("A")])])])]),
      "bindings": .object(["effort": .string("model"), "fast": .string("model")]),
      "members": .array([
        member("pair-low", effort: "low", fast: false), member("pair-high", effort: "high", fast: false),
        member("pair-fast", effort: "low", fast: true),
      ]),
    ])])
    var initial = ThreadConfig(model: "pair-low"); initial.effort = ""; initial.fast = false
    let controls = try catalog(family, configuration: initial)
    let high = try XCTUnwrap(NativeComposerConfigCommand.effort.applying(to: initial, catalog: controls))
    XCTAssertEqual(high.model, "pair-high"); XCTAssertEqual(high.effort, ""); XCTAssertEqual(high.fast, false)
    let fast = try XCTUnwrap(NativeComposerConfigCommand.fast.applying(to: initial, catalog: controls))
    XCTAssertEqual(fast.model, "pair-fast"); XCTAssertEqual(fast.effort, ""); XCTAssertEqual(fast.fast, false)
    XCTAssertEqual(controls.selectedModelRow(for: fast), "pair-low", "The direct picker and touch menu select the family row")
    let fastControls = try catalog(family, configuration: fast)
    XCTAssertNil(NativeComposerConfigCommand.effort.applying(to: fast, catalog: fastControls),
      "There is no high-effort/Fast member, so the keyboard must not invent that tuple")
  }

  func testAbsentCapabilitiesDoNotClaimComposerControlShortcuts() throws {
    let initial = ThreadConfig(model: "unknown")
    let controls = RichChatComposerControlCatalog(agentStatus: nil, presentationMode: .gui, configuration: initial)
    for command in NativeComposerConfigCommand.allCases {
      XCTAssertFalse(command.isAvailable(configuration: initial, catalog: controls))
      XCTAssertNil(command.applying(to: initial, catalog: controls))
    }
  }

  func testTemporarilyDisabledFastDoesNotMutateTheConfiguration() throws {
    var disabled = capabilities
    disabled["fastDisabledReason"] = .string("Temporarily unavailable")
    let initial = ThreadConfig(model: "solo")
    let controls = try catalog(disabled, configuration: initial)
    XCTAssertTrue(controls.supportsFast(initial.model))
    XCTAssertFalse(controls.canEditFast(initial))
    XCTAssertFalse(NativeComposerConfigCommand.fast.isAvailable(configuration: initial, catalog: controls))
    XCTAssertNil(NativeComposerConfigCommand.fast.applying(to: initial, catalog: controls))
  }

  func testCrewFastEditsOnlyTheLeadAndEffortStaysInTheRoster() throws {
    var initial = ThreadConfig(model: "solo")
    initial.crew = ThreadCrewBinding(roles: [.init(id: "review", label: "Review",
      selection: .init(agentKind: "helper", model: "review", fast: false))]).wire
    let controls = try catalog(capabilities, configuration: initial)
    XCTAssertFalse(NativeComposerConfigCommand.effort.isAvailable(configuration: initial, catalog: controls))
    let fast = try XCTUnwrap(NativeComposerConfigCommand.fast.applying(to: initial, catalog: controls))
    XCTAssertEqual(fast.fast, true)
    XCTAssertEqual(fast.crew, initial.crew, "The lead shortcut must not change any helper's Fast selection")
  }

  private var capabilities: [String: JSONValue] {
    ["presentationModes": .array([.string("gui")]),
      "models": .array([.object(["id": .string("solo"), "label": .string("Solo")])]),
      "modes": .array([.string("agent"), .string("plan")]),
      "efforts": .array([.string("low"), .string("high")]), "defaultEffort": .string("low"),
      "fastModels": .array([.string("solo")]),
      "approvalPolicies": .array([.string("review"), .string("never")]),
      "defaultApprovalPolicy": .string("review"), "defaultSandboxMode": .string("project"),
      "defaultApprovalsReviewer": .string("reviewer"),
      "bypassPermissions": .object(["approvalPolicy": .string("never"), "sandboxMode": .string("all-files")])]
  }

  private func member(_ id: String, effort: String, fast: Bool) -> JSONValue {
    .object(["model": .string(id), "selections": .object(["side": .string("a")]),
      "effort": .string(effort), "fast": .bool(fast)])
  }

  private func catalog(_ capabilities: [String: JSONValue], configuration: ThreadConfig) throws -> RichChatComposerControlCatalog {
    let status = try AgentStatusRecord(wire: .object(["kind": .string("provider"), "label": .string("Provider"),
      "installed": .bool(true), "authState": .string("authenticated"), "capabilities": .object(capabilities)]))
    return .init(agentStatus: status, presentationMode: .gui, configuration: configuration)
  }
}

@MainActor @Observable private final class KeyboardDraft {
  var configuration: ThreadConfig = { var value = ThreadConfig(model: "solo"); value.effort = "low"; return value }()
}

@MainActor @Observable private final class KeyboardDraftSelection {
  var active: KeyboardDraft
  init(_ active: KeyboardDraft) { self.active = active }
}

@MainActor private struct KeyboardDraftCommandHarness: View {
  let selection: KeyboardDraftSelection
  let owner: UUID
  let catalog: RichChatComposerControlCatalog
  let appeared: () -> Void
  let replaced: () -> Void

  var body: some View {
    let current = selection.active
    Text("Composer")
      .modifier(NativeComposerCommands(ownerID: owner,
        configuration: .init(get: { current.configuration }, set: { current.configuration = $0 }),
        catalog: catalog, enabled: true, chooseModel: {}, stateOwnerID: ObjectIdentifier(current)))
      .onAppear(perform: appeared)
      .onChange(of: ObjectIdentifier(current)) { _, _ in replaced() }
  }
}
