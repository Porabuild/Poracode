import XCTest
@testable import App

final class ModelSelectionBindingTests: XCTestCase {
  private let owner = ModelSelectionOwner(agentKind: "fixture:profile", agentInstanceID: "remote-instance", presentationMode: .gui)

  private func binding(model: String = "member", values: [ModelSelectionAxis: JSONValue] = [.effort: .string(""), .fast: .bool(false)]) throws -> ModelSelectionBinding {
    try XCTUnwrap(.init(owner: owner, model: model, inertValues: values))
  }

  private func configuration() throws -> ThreadConfig {
    var result = ThreadConfig(model: "member", effort: "", contextSize: "default", fast: false, thinking: false,
      approvalPolicy: "review", mcpServerOverrides: ["extra": false], pluginOverrides: ["tools": true], crew: .null)
    result.selectionBinding = try binding()
    return result
  }

  private func capabilities() -> [String: JSONValue] {
    [
      "models": .array(["member", "fast-member"].map { .object(["id": .string($0)]) }),
      "modelFamilies": .array([.object([
        "model": .string("member"), "label": .string("Family"), "selectors": .array([]),
        "bindings": .object(["effort": .string("model"), "fast": .string("model")]),
        "redundantValues": .object([
          "effort": .array([.string("")]), "fast": .array([.bool(false)]),
          "thinking": .array([.bool(false)]), "contextSize": .array([.string("default"), .string("")]),
        ]),
        "members": .array([
          .object(["model": .string("member"), "selections": .object([:]), "effort": .string("low"), "fast": .bool(false)]),
          .object(["model": .string("fast-member"), "selections": .object([:]), "effort": .string("low"), "fast": .bool(true)]),
        ]),
      ])]),
    ]
  }

  private func relation() throws -> ModelFamilySelection {
    try XCTUnwrap(ModelFamilies.project(capabilities()).first)
  }

  func testStrictRecognizedRecordRoundTripsAndRejectsUnknownOrFutureShapes() throws {
    let valid = try binding()
    XCTAssertEqual(try JSONDecoding.decode(ModelSelectionBinding.self, from: JSONDecoding.encoder.encode(valid)), valid)
    var invalid: [JSONValue] = [.null, .array([])]
    let original = try XCTUnwrap(valid.wireValue.objectValue)
    for (key, value) in ["version": JSONValue.number(2), "kind": .string("future"), "model": .string(""),
      "unknown": .bool(true), "inertValues": .object([:]), "owner": .object([:])] {
      var object = original
      object[key] = value
      invalid.append(.object(object))
    }
    for values in [["fast": .number(0)], ["effort": .null], ["newAxis": .bool(false)]] as [[String: JSONValue]] {
      var object = original
      object["inertValues"] = .object(values)
      invalid.append(.object(object))
    }
    for values in [
      ["agentKind": .string("fixture:profile"), "presentationMode": .string("gui"), "agentInstanceId": .null],
      ["agentKind": .string("fixture:profile"), "presentationMode": .string("gui"), "unknown": .bool(true)],
    ] as [[String: JSONValue]] {
      var object = original
      object["owner"] = .object(values)
      invalid.append(.object(object))
    }
    for raw in invalid {
      XCTAssertThrowsError(try JSONDecoding.decode(ModelSelectionBinding.self, from: JSONDecoding.encoder.encode(raw)))
      let record = JSONValue.object(["model": .string("member"), "selectionBinding": raw])
      let data = try JSONDecoding.encoder.encode(record)
      XCTAssertThrowsError(try JSONDecoding.decode(ThreadConfig.self, from: data))
      XCTAssertThrowsError(try JSONDecoding.decode(ThreadLaunchConfiguration.self, from: data))
    }
  }

  func testLegacyAbsenceAndExactConfigurationSurviveEveryNativeConversion() throws {
    let legacy = Data(#"{"model":"member","effort":"","fast":false}"#.utf8)
    let old = try JSONDecoding.decode(ThreadConfig.self, from: legacy)
    XCTAssertNil(old.selectionBinding)
    let oldWire = try JSONDecoding.decode(JSONValue.self, from: JSONDecoding.encoder.encode(ThreadLaunchConfiguration(old)))
    XCTAssertNil(oldWire["selectionBinding"])
    let complete = try configuration()
    XCTAssertEqual(ThreadConfig(ThreadLaunchConfiguration(complete)), complete)
    XCTAssertEqual(ThreadConfig(complete.lifecycleLaunchConfiguration), complete)
    let launch = ThreadLaunchConfiguration(complete)
    XCTAssertEqual(try JSONDecoding.decode(ThreadLaunchConfiguration.self, from: JSONDecoding.encoder.encode(launch)), launch)
    XCTAssertEqual(complete.richChatObject["selectionBinding"]?.objectValue?["model"], .string("member"))
    var unbound = complete
    unbound.selectionBinding = nil
    XCTAssertNotEqual(complete, unbound)
  }

  func testMatchingUsesFullActualOwnerAndExactPresenceWithoutErasingOtherControls() throws {
    var config = try configuration()
    let record = try XCTUnwrap(config.selectionBinding)
    XCTAssertTrue(record.matches(config, owner: owner))
    for other in [
      ModelSelectionOwner(agentKind: "fixture", agentInstanceID: "remote-instance", presentationMode: .gui),
      ModelSelectionOwner(agentKind: owner.agentKind, presentationMode: .gui),
      ModelSelectionOwner(agentKind: owner.agentKind, agentInstanceID: "other", presentationMode: .gui),
      ModelSelectionOwner(agentKind: owner.agentKind, agentInstanceID: owner.agentInstanceID, presentationMode: .terminal),
    ] { XCTAssertFalse(record.matches(config, owner: other)) }
    config.effort = nil
    XCTAssertFalse(record.matches(config, owner: owner))
    config.effort = "default"
    XCTAssertFalse(record.matches(config, owner: owner))
    config.effort = ""
    config.fast = nil
    XCTAssertFalse(record.matches(config, owner: owner))
    config.fast = false
    config.thinking = true
    config.contextSize = "large"
    XCTAssertTrue(record.matches(config, owner: owner), "unrecorded controls are outside the claim")
  }

  func testOnlyAResolvedFamilyEditMintsPresentDeclaredValues() throws {
    let previous = ThreadConfig(model: "outside")
    let next = try configuration()
    let family = try relation()
    let minted = try XCTUnwrap(ModelSelectionBindings.applying(.familyMember(family), previous: previous, next: next, owner: owner))
    XCTAssertEqual(minted.selectionBinding?.inertValues, [.effort: .string(""), .fast: .bool(false),
      .thinking: .bool(false), .contextSize: .string("default")])
    XCTAssertTrue(try XCTUnwrap(minted.selectionBinding).matches(minted, owner: owner))
    var absent = next
    absent.fast = nil
    absent.thinking = nil
    absent.contextSize = nil
    absent.effort = nil
    XCTAssertNil(ModelSelectionBindings.applying(.familyMember(family), previous: previous, next: absent, owner: owner)?.selectionBinding)
    var noDeclaration = family
    noDeclaration.redundantValues = nil
    XCTAssertNil(ModelSelectionBindings.applying(.familyMember(noDeclaration), previous: previous, next: next, owner: owner)?.selectionBinding)
    XCTAssertNil(ModelSelectionBindings.applying(.familyMember(family), previous: previous, next: next, owner: nil))
    var nonmember = next
    nonmember.model = "outside"
    XCTAssertNil(ModelSelectionBindings.applying(.familyMember(family), previous: previous, next: nonmember, owner: owner))
    let invalid = ModelFamilySelection(model: family.model, label: family.label, selectors: family.selectors,
      bindings: family.bindings, members: family.members + family.members, redundantValues: family.redundantValues)
    XCTAssertNil(ModelSelectionBindings.applying(.familyMember(invalid), previous: previous, next: next, owner: owner))
  }

  func testExactPicksAndOwnerRetargetsDropEvenSameValueEvidence() throws {
    let previous = try configuration()
    for event in [.exactModel, .ownerRetarget] as [ModelSelectionMutation] {
      let next = try XCTUnwrap(ModelSelectionBindings.applying(event, previous: previous, next: previous, owner: owner))
      XCTAssertNil(next.selectionBinding)
      var expected = previous
      expected.selectionBinding = nil
      XCTAssertEqual(next, expected)
    }
  }

  func testIndependentAndNativeAcknowledgedAxesAreRevokedEvenWithoutAValueChange() throws {
    let previous = try configuration()
    for event in [.independentCarriers([.effort]), .nativeAcknowledgement([.effort])] as [ModelSelectionMutation] {
      let next = try XCTUnwrap(ModelSelectionBindings.applying(event, previous: previous, next: previous, owner: owner))
      XCTAssertEqual(next.selectionBinding?.inertValues, [.fast: .bool(false)])
    }
    let reduced = try XCTUnwrap(ModelSelectionBindings.applying(.independentCarriers([.effort, .fast]), previous: previous, next: previous, owner: owner))
    XCTAssertNil(reduced.selectionBinding)
    var mismatched = previous
    mismatched.fast = true
    XCTAssertNil(ModelSelectionBindings.applying(.independentCarriers([.effort]), previous: previous, next: mismatched, owner: owner)?.selectionBinding)
    var changedModel = previous
    changedModel.model = "fast-member"
    XCTAssertNil(ModelSelectionBindings.applying(.nativeAcknowledgement([]), previous: previous, next: changedModel, owner: owner)?.selectionBinding)
  }

  func testUnrelatedEditsRetainOnlyPreviouslyMatchingEvidenceAndNeverRepairControls() throws {
    let previous = try configuration()
    var next = previous
    next.mode = "plan"
    next.browserMcp = true
    XCTAssertEqual(ModelSelectionBindings.applying(.unrelated, previous: previous, next: next, owner: owner), next)
    var unstamped = previous
    unstamped.selectionBinding = nil
    XCTAssertNil(ModelSelectionBindings.applying(.unrelated, previous: unstamped, next: next, owner: owner)?.selectionBinding,
      "an injected next record has no authority")
    var stale = previous
    stale.fast = true
    let rejected = try XCTUnwrap(ModelSelectionBindings.applying(.unrelated, previous: stale, next: stale, owner: owner))
    XCTAssertNil(rejected.selectionBinding)
    XCTAssertEqual(rejected.fast, true)
    XCTAssertEqual(ModelSelectionBindings.validated(previous, owner: owner), previous)
    XCTAssertNil(ModelSelectionBindings.validated(previous, owner: nil).selectionBinding)
  }

  func testNativeCatalogPreservesOperationIntentAndRevokesDirectControls() throws {
    let agent = try AgentStatusRecord(wire: .object([
      "kind": .string(owner.agentKind), "label": .string("Fixture"),
      "installed": .bool(true), "authState": .string("authenticated"), "capabilities": .object(capabilities()),
    ]))
    var selected = ThreadConfig(model: "outside", contextSize: "default", thinking: false)
    let catalog = RichChatComposerControlCatalog(agentStatus: agent, presentationMode: .gui,
      configuration: selected, agentInstanceID: owner.agentInstanceID)
    catalog.applyFamilyRowSelection("member", to: &selected)
    XCTAssertEqual(selected.model, "member")
    XCTAssertEqual(selected.selectionBinding?.inertValues, [.effort: .string(""), .fast: .bool(false),
      .thinking: .bool(false), .contextSize: .string("default")])
    XCTAssertEqual(selected.selectionBinding?.owner, owner)
    let initial = selected
    catalog.applyFamilyRowSelection("member", to: &selected)
    XCTAssertEqual(selected, initial, "a retained family row must not create a different selection")
    catalog.applyThinkingEdit(false, to: &selected)
    XCTAssertNil(selected.selectionBinding?.inertValues[.thinking])
    catalog.applyContextSizeEdit("default", to: &selected)
    XCTAssertEqual(selected.selectionBinding?.inertValues, [.effort: .string(""), .fast: .bool(false)])
    catalog.applyFastEdit(true, to: &selected)
    XCTAssertEqual(selected.model, "fast-member")
    XCTAssertEqual(selected.fast, false, "the displayed Fast coordinate belongs to the exact UID")
    XCTAssertTrue(try XCTUnwrap(selected.selectionBinding).matches(selected, owner: owner))
    catalog.applyExactModelSelection("fast-member", to: &selected)
    XCTAssertNil(selected.selectionBinding, "a raw same-UID pick is distinct from a projected family row")
    catalog.applyFamilyRowSelection("member", to: &selected)
    XCTAssertEqual(selected.model, "fast-member")
    XCTAssertNil(selected.selectionBinding, "a family row no-op cannot stamp an unstamped restore")
  }

  func testProjectionDoesNotRepairMalformedDeclarationsBeforeMinting() throws {
    let original = capabilities()
    let family = try XCTUnwrap(original["modelFamilies"]?.arrayValue?.first?.objectValue)
    var candidates: [[String: JSONValue]] = []
    for key in ["selectors", "members", "bindings"] {
      var invalid = family
      invalid.removeValue(forKey: key)
      candidates.append(invalid)
    }
    for key in ["effort", "fast"] {
      var invalid = family
      var members = try XCTUnwrap(family["members"]?.arrayValue)
      var member = try XCTUnwrap(members[0].objectValue)
      member[key] = .null
      members[0] = .object(member)
      invalid["members"] = .array(members)
      candidates.append(invalid)
    }
    var unknownRedundancy = family
    unknownRedundancy["redundantValues"] = .object(["unknown": .array([.bool(false)])])
    candidates.append(unknownRedundancy)
    for declaration in candidates {
      var invalid = original
      invalid["modelFamilies"] = .array([.object(declaration)])
      XCTAssertTrue(ModelFamilies.project(invalid).isEmpty)
    }
  }

  func testGeneratedLifecycleRequestsCarryTheExactRecognizedBinding() throws {
    let config = try configuration()
    let request = ThreadRelaunchRequest(projectID: "project-1", agentKind: owner.agentKind,
      config: ThreadLaunchConfiguration(config), prompt: "verify", agentInstanceID: owner.agentInstanceID,
      presentationMode: .gui)
    let body = try GeneratedRemoteV3Contract.threadCommandRequest(threadID: "new-thread",
      command: .start(request), commandID: "selection-binding-start").body
    let value = try JSONDecoding.decode(JSONValue.self, from: body)
    XCTAssertEqual(value["config"]?["selectionBinding"], config.selectionBinding?.wireValue)
    XCTAssertEqual(value["agentInstanceId"], .string("remote-instance"))
    var existing = ThreadLifecycleTestValues.startExisting(threadID: "existing-thread")
    existing.config = config.lifecycleLaunchConfiguration
    existing.agentInstanceID = owner.agentInstanceID
    existing.presentationMode = .gui
    let resumed = try GeneratedRemoteV3Contract.threadStartExistingRequest(existing, commandID: "selection-binding-resume").body
    XCTAssertEqual(try JSONDecoding.decode(JSONValue.self, from: resumed)["config"]?["selectionBinding"], config.selectionBinding?.wireValue)
  }
}
