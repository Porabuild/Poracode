import Foundation
import XCTest

@testable import App

/// Family-controls consumption in the native composers: the chooser collapses
/// represented members into one family row, the conditional selectors and the
/// common Effort/Fast controls resolve explicit edits through the relation,
/// and restored drafts keep their exact canonical UIDs and carriers through
/// save/reload. Toy relations only — no provider payload.
final class RichChatComposerFamilyControlsTests: XCTestCase {
  // MARK: - Fixtures

  /// Encoded relation (both common controls bound to the member UID): the
  /// `alpha·delta` and `bravo·beta·high` tuples are holes.
  private func encodedCapabilities() -> [String: JSONValue] {
    [
      "models": .array(
        [
          "solo", "duo-alpha-beta", "duo-alpha-beta-fast", "duo-alpha-beta-hi", "duo-bravo-beta",
          "duo-bravo-delta",
        ].map { .object(["id": .string($0), "label": .string($0)]) }),
      "efforts": .array([.string("low"), .string("high")]),
      "fastModels": .array([.string("solo")]),
      "modelFamilies": .array([
        .object([
          "model": .string("duo-alpha-beta"),
          "label": .string("Duo Family"),
          "selectors": .array([
            .object([
              "id": .string("lead"),
              "labelKey": .string("modelSelection.lead"),
              "options": .array([
                .object(["id": .string("alpha"), "label": .string("Alpha")]),
                .object(["id": .string("bravo"), "label": .string("Bravo")]),
              ]),
            ]),
            .object([
              "id": .string("mate"),
              "labelKey": .string("modelSelection.sidekick"),
              "options": .array([
                .object(["id": .string("beta"), "label": .string("Beta")]),
                .object(["id": .string("delta"), "label": .string("Delta")]),
              ]),
            ]),
          ]),
          "bindings": .object(["effort": .string("model"), "fast": .string("model")]),
          "members": .array([
            memberObject("duo-alpha-beta", lead: "alpha", mate: "beta", effort: "low", fast: false),
            memberObject(
              "duo-alpha-beta-fast", lead: "alpha", mate: "beta", effort: "low", fast: true),
            memberObject(
              "duo-alpha-beta-hi", lead: "alpha", mate: "beta", effort: "high", fast: false),
            memberObject("duo-bravo-beta", lead: "bravo", mate: "beta", effort: "low", fast: false),
            memberObject(
              "duo-bravo-delta", lead: "bravo", mate: "delta", effort: "low", fast: false),
          ]),
        ])
      ]),
    ]
  }

  /// Independent-carrier relation (both controls bound to the saved config),
  /// advertised alongside a live negotiated model menu. Every declared member
  /// is accepted in the raw inventory so selector edits can resolve exactly.
  private func independentCapabilities() -> [String: JSONValue] {
    [
      "models": .array(
        ["pair-alpha-beta", "pair-alpha-delta", "pair-bravo-beta", "standalone"].map {
          .object(["id": .string($0), "label": .string($0)])
        }),
      "efforts": .array([.string("low"), .string("high")]),
      "fastModels": .array([.string("pair-alpha-beta")]),
      "modelFamilies": .array([
        .object([
          "model": .string("pair-alpha-beta"),
          "label": .string("Pair Family"),
          "selectors": .array([
            .object([
              "id": .string("lead"),
              "labelKey": .string("modelSelection.lead"),
              "options": .array([
                .object(["id": .string("alpha"), "label": .string("Alpha")]),
                .object(["id": .string("bravo"), "label": .string("Bravo")]),
              ]),
            ]),
            .object([
              "id": .string("mate"),
              "labelKey": .string("modelSelection.sidekick"),
              "options": .array([
                .object(["id": .string("beta"), "label": .string("Beta")]),
                .object(["id": .string("delta"), "label": .string("Delta")]),
              ]),
            ]),
          ]),
          "bindings": .object(["effort": .string("config"), "fast": .string("config")]),
          "members": .array([
            memberObject("pair-alpha-beta", lead: "alpha", mate: "beta"),
            memberObject("pair-alpha-delta", lead: "alpha", mate: "delta"),
            memberObject("pair-bravo-beta", lead: "bravo", mate: "beta"),
          ]),
        ])
      ]),
    ]
  }

  private func memberObject(
    _ model: String, lead: String, mate: String, effort: String? = nil, fast: Bool? = nil
  ) -> JSONValue {
    var object: [String: JSONValue] = [
      "model": .string(model),
      "selections": .object(["lead": .string(lead), "mate": .string(mate)]),
    ]
    if let effort { object["effort"] = .string(effort) }
    if let fast { object["fast"] = .bool(fast) }
    return .object(object)
  }

  private func agentStatus(capabilities: [String: JSONValue]) throws -> AgentStatusRecord {
    try AgentStatusRecord(
      wire: .object([
        "kind": .string("provider"),
        "label": .string("Provider"),
        "installed": .bool(true),
        "authState": .string("authenticated"),
        "capabilities": .object(capabilities),
      ]))
  }

  private func makeCatalog(
    _ capabilities: [String: JSONValue],
    configuration: ThreadConfig,
    sessionConfigOptions: JSONValue? = nil,
    hiddenModels: [String: [String]]? = nil
  ) throws -> RichChatComposerControlCatalog {
    RichChatComposerControlCatalog(
      agentStatus: try agentStatus(capabilities: capabilities),
      presentationMode: .gui,
      configuration: configuration,
      sessionConfigOptions: sessionConfigOptions,
      hiddenModels: hiddenModels
    )
  }

  private func config(
    model: String, effort: String? = nil, fast: Bool? = nil, thinking: Bool? = nil,
    contextSize: String? = nil
  ) -> ThreadConfig {
    var value = ThreadConfig.empty
    value.model = model
    value.effort = effort
    value.fast = fast
    value.thinking = thinking
    value.contextSize = contextSize
    return value
  }

  // MARK: - Chooser projection

  func testChooserCollapsesEncodedMembersIntoOneFamilyRow() throws {
    let catalog = try makeCatalog(
      encodedCapabilities(), configuration: config(model: "solo"))
    XCTAssertEqual(catalog.models.map(\.id), ["solo", "duo-alpha-beta"])
    XCTAssertEqual(catalog.models[1].label, "Duo Family")
    // The raw inventory stays available for non-member and exact-choice paths.
    XCTAssertEqual(catalog.rawModels.map(\.id).count, 6)
    XCTAssertEqual(catalog.modelLabel("solo"), "Solo")
    // A member reads as its family row — never the giant native pair label
    // (desktop trigger parity).
    XCTAssertEqual(catalog.modelLabel("duo-bravo-delta"), "Duo Family")
    XCTAssertEqual(catalog.modelLabel("duo-alpha-beta"), "Duo Family")
  }

  func testChooserDoesNotReinsertAConfiguredFamilyMember() throws {
    let catalog = try makeCatalog(
      encodedCapabilities(), configuration: config(model: "duo-alpha-beta-fast"))
    // Unrepresented raw choices stay (parity with the desktop projection); the
    // configured member is represented by its family row, not duplicated.
    XCTAssertEqual(
      catalog.models.map(\.id), ["solo", "duo-alpha-beta"],
      "the member is represented by its family row, not duplicated")
    XCTAssertFalse(
      catalog.models.contains { $0.id == "duo-alpha-beta-fast" },
      "the configured member is never reinserted beside its family row")
    XCTAssertEqual(catalog.modelLabel("duo-alpha-beta-fast"), "Duo Family")
  }

  func testChooserWithoutADescriptorKeepsTheRawListExactly() throws {
    var capabilities = encodedCapabilities()
    capabilities["modelFamilies"] = .array([])
    let catalog = try makeCatalog(capabilities, configuration: config(model: "solo"))
    XCTAssertEqual(catalog.models.map(\.id), catalog.rawModels.map(\.id))
  }

  // MARK: - Encoded family: display derives from the member

  func testRestoredEncodedDraftDisplaysMemberAxesWithoutRewritingCarriers() throws {
    // A restored Terminal composite: exact UID plus inert seeds.
    let draft = config(model: "duo-alpha-beta-fast", effort: "", fast: false)
    let catalog = try makeCatalog(encodedCapabilities(), configuration: draft)

    XCTAssertEqual(catalog.displayedEffort(for: draft), "low", "displayed effort from the UID")
    XCTAssertEqual(catalog.displayedFast(draft), true, "displayed Fast from the UID")
    XCTAssertEqual(draft.effort, "", "the inert stored seed is untouched")
    XCTAssertEqual(draft.fast, false)

    let selectors = catalog.familySelectors(for: draft)
    XCTAssertEqual(selectors.map(\.id), ["lead", "mate"])
    XCTAssertEqual(selectors[0].label, "Lead")
    XCTAssertEqual(selectors[0].currentOptionID, "alpha")
    XCTAssertEqual(selectors[1].currentOptionID, "beta")
  }

  func testMeaningfulStoredOverridesKeepTheRawViewAndTheirRejection() throws {
    let meaningful = config(model: "duo-alpha-beta", effort: "high")
    let catalog = try makeCatalog(encodedCapabilities(), configuration: meaningful)
    XCTAssertEqual(catalog.displayedEffort(for: meaningful), "high")
    XCTAssertEqual(catalog.familySelectors(for: meaningful).count, 2)
    // The chooser still resolves membership; the relation just never
    // re-interprets the saved meaningful override as a tuple request.
    XCTAssertEqual(catalog.models.map(\.id), ["solo", "duo-alpha-beta"])
  }

  // MARK: - Encoded family: explicit edits are atomic

  func testFamilyRowClickFromOutsideAdoptsTheDeclaredDefaultAtomically() throws {
    var draft = config(model: "solo", effort: "high", fast: true)
    let catalog = try makeCatalog(encodedCapabilities(), configuration: draft)
    catalog.applyFamilyRowSelection("duo-alpha-beta", to: &draft)
    XCTAssertEqual(draft.model, "duo-alpha-beta")
    XCTAssertEqual(draft.effort, "", "the encoded seed resets atomically")
    XCTAssertEqual(draft.fast, false)
  }

  func testFamilyRowClickInsideTheFamilyPreservesTheExactMember() throws {
    var draft = config(model: "duo-alpha-beta-fast", effort: "", fast: false)
    let catalog = try makeCatalog(encodedCapabilities(), configuration: draft)
    catalog.applyFamilyRowSelection("duo-alpha-beta", to: &draft)
    XCTAssertEqual(draft.model, "duo-alpha-beta-fast", "no representative rewrite")
    XCTAssertEqual(draft.effort, "")
    XCTAssertEqual(draft.fast, false)
  }

  func testSelectorEditResolvesTheExactSibling() throws {
    var draft = config(model: "duo-alpha-beta", effort: "", fast: false)
    let catalog = try makeCatalog(encodedCapabilities(), configuration: draft)
    catalog.applySelectorEdit(selectorID: "lead", value: "bravo", to: &draft)
    XCTAssertEqual(draft.model, "duo-bravo-beta")
    XCTAssertEqual(draft.effort, "")
    XCTAssertEqual(draft.fast, false)
  }

  func testSelectorEditIntoAHoleLeavesTheDraftUnchanged() throws {
    var draft = config(model: "duo-alpha-beta-hi", effort: "", fast: false)
    let catalog = try makeCatalog(encodedCapabilities(), configuration: draft)
    catalog.applySelectorEdit(selectorID: "lead", value: "bravo", to: &draft)
    XCTAssertEqual(draft.model, "duo-alpha-beta-hi", "no nearest substitution")
    // The unreachable option is filtered out of the menu in the first place.
    XCTAssertEqual(
      catalog.familySelectors(for: draft).first { $0.id == "lead" }?.options.map(\.id), ["alpha"])
  }

  func testEffortAndFastEditsResolveSingleAxesAtomically() throws {
    var draft = config(model: "duo-alpha-beta", effort: "", fast: false)
    let catalog = try makeCatalog(encodedCapabilities(), configuration: draft)

    catalog.applyEffortEdit("high", to: &draft)
    XCTAssertEqual(draft.model, "duo-alpha-beta-hi")
    XCTAssertEqual(draft.effort, "")
    XCTAssertEqual(draft.fast, false)

    // alpha·beta·high has no Fast sibling: the toggle is unavailable and the
    // resolved edit refuses instead of guessing.
    catalog.applyFastEdit(true, to: &draft)
    XCTAssertEqual(draft.model, "duo-alpha-beta-hi")
    XCTAssertFalse(catalog.supportsFast("duo-alpha-beta-hi"))

    // From the standard low member the Fast sibling exists and flips exactly
    // that member; the persisted carrier stays inert while the display
    // follows the UID.
    var standard = config(model: "duo-alpha-beta", effort: "", fast: false)
    catalog.applyFastEdit(true, to: &standard)
    XCTAssertEqual(standard.model, "duo-alpha-beta-fast")
    XCTAssertEqual(standard.fast, false)
    XCTAssertEqual(catalog.displayedFast(standard), true)

    // Fast off from the Fast sibling returns to the standard UID.
    catalog.applyFastEdit(false, to: &standard)
    XCTAssertEqual(standard.model, "duo-alpha-beta")
    XCTAssertEqual(catalog.displayedFast(standard), false)

    // A hole keeps everything: bravo·delta has no Fast sibling.
    var bravo = config(model: "duo-bravo-delta", effort: "", fast: false)
    catalog.applyFastEdit(true, to: &bravo)
    XCTAssertEqual(bravo.model, "duo-bravo-delta")
    XCTAssertFalse(catalog.supportsFast("duo-bravo-delta"))
  }

  func testEncodedEditsRefuseToBuryMeaningfulThinkingOrContext() throws {
    var draft = config(model: "solo", thinking: true)
    let catalog = try makeCatalog(encodedCapabilities(), configuration: draft)
    catalog.applyExactModelSelection("duo-alpha-beta", to: &draft)
    XCTAssertEqual(draft.model, "solo", "meaningful thinking is not silently carried beneath")

    var withContext = config(model: "duo-alpha-beta", effort: "", fast: false, contextSize: "128k")
    catalog.applyEffortEdit("high", to: &withContext)
    XCTAssertEqual(withContext.model, "duo-alpha-beta")
    XCTAssertEqual(withContext.contextSize, "128k", "meaningful context is untouched, edit refused")
  }

  func testExactMemberPickAndNonFamilyPickTakeTheirOwnPaths() throws {
    let catalog = try makeCatalog(encodedCapabilities(), configuration: config(model: "solo"))

    // An exact member id resolves through the relation: atomic patch with the
    // encoded inert seeds. The representative's exact row is an exact pick —
    // never a family-row no-op.
    var memberDraft = config(model: "solo", effort: "high", fast: true)
    catalog.applyExactModelSelection("duo-alpha-beta-hi", to: &memberDraft)
    XCTAssertEqual(memberDraft.model, "duo-alpha-beta-hi")
    XCTAssertEqual(memberDraft.effort, "")
    var representativeDraft = config(model: "duo-alpha-beta-hi", effort: "", fast: false)
    catalog.applyExactModelSelection("duo-alpha-beta", to: &representativeDraft)
    XCTAssertEqual(
      representativeDraft.model, "duo-alpha-beta", "the exact representative member is selected")
    XCTAssertTrue(catalog.isProjectedFamilyRow("duo-alpha-beta"))
    XCTAssertFalse(catalog.isProjectedFamilyRow("duo-alpha-beta-hi"))

    // A target outside any relation keeps the ordinary model-change behavior
    // (ladder-reset defaulting), never the encoded seeds.
    var outsideDraft = config(model: "duo-alpha-beta", effort: "", fast: false)
    catalog.applyExactModelSelection("solo", to: &outsideDraft)
    XCTAssertEqual(outsideDraft.model, "solo")
    XCTAssertNil(outsideDraft.effort, "the ordinary defaulting applies, not an encoded seed")
    XCTAssertEqual(outsideDraft.fast, false)
    XCTAssertEqual(outsideDraft.thinking, false)
  }

  // MARK: - Independent family: native carriers stay independent

  func testIndependentSelectorEditPatchesOnlyTheModel() throws {
    var draft = config(model: "pair-alpha-beta", effort: "low", fast: true)
    let catalog = try makeCatalog(independentCapabilities(), configuration: draft)
    catalog.applySelectorEdit(selectorID: "mate", value: "delta", to: &draft)
    XCTAssertEqual(draft.model, "pair-alpha-delta")
    XCTAssertEqual(draft.effort, "low", "the saved independent effort is retained")
    XCTAssertEqual(draft.fast, true, "the saved independent Fast is retained")
  }

  func testIndependentEffortAndFastEditsLeaveTheModelAlone() throws {
    var draft = config(model: "pair-alpha-beta", effort: "low", fast: false)
    let catalog = try makeCatalog(independentCapabilities(), configuration: draft)
    catalog.applyEffortEdit("high", to: &draft)
    XCTAssertEqual(draft.model, "pair-alpha-beta")
    XCTAssertEqual(draft.effort, "high")
    catalog.applyFastEdit(true, to: &draft)
    XCTAssertEqual(draft.model, "pair-alpha-beta")
    XCTAssertEqual(draft.fast, true)
    XCTAssertEqual(catalog.displayedFast(draft), true)
  }

  func testIndependentDraftSaveReloadRoundTripsEveryCarrier() throws {
    var draft = config(model: "pair-alpha-beta", effort: "low", fast: true)
    let catalog = try makeCatalog(independentCapabilities(), configuration: draft)
    catalog.applySelectorEdit(selectorID: "lead", value: "bravo", to: &draft)
    // Save = the draft itself; reload = a fresh catalog built from it.
    let reloaded = try makeCatalog(independentCapabilities(), configuration: draft)
    XCTAssertEqual(reloaded.displayedEffort(for: draft), "low")
    XCTAssertEqual(reloaded.displayedFast(draft), true)
    XCTAssertEqual(
      reloaded.familySelectors(for: draft).first { $0.id == "lead" }?.currentOptionID, "bravo")
    XCTAssertEqual(
      reloaded.familySelectors(for: draft).first { $0.id == "mate" }?.currentOptionID, "beta")
  }

  // MARK: - Live inventory intersection

  func testLiveNegotiatedMenuIntersectsTheRelationAndNeverWidens() throws {
    let live: JSONValue = .array([
      .object([
        "type": .string("select"), "id": .string("model"), "role": .string("model"),
        "currentValue": .string("pair-alpha-beta"),
        "values": .array([
          .object(["value": .string("standalone"), "name": .string("Standalone")]),
          .object(["value": .string("pair-alpha-beta"), "name": .string("Pair A")]),
        ]),
      ])
    ])
    let catalog = try makeCatalog(
      independentCapabilities(),
      configuration: config(model: "pair-alpha-beta"),
      sessionConfigOptions: live
    )
    // The live menu is the accepted authority: pair-alpha-delta retired, the
    // family row stays for the surviving member, nothing is widened.
    XCTAssertEqual(catalog.models.map(\.id), ["standalone", "pair-alpha-beta"])
    XCTAssertEqual(catalog.models[1].label, "Pair Family")
    XCTAssertFalse(catalog.models.contains { $0.id == "pair-alpha-delta" })
    XCTAssertTrue(
      ModelFamilies.pickerRepresents(
        "pair-alpha-delta", capabilities: independentCapabilities(), acceptedIDs: nil))
    XCTAssertFalse(
      ModelFamilies.pickerRepresents(
        "pair-alpha-delta", capabilities: independentCapabilities(),
        acceptedIDs: Set(["standalone", "pair-alpha-beta"])))
  }

  // MARK: - Surface whitelist

  func testSurfaceOverrideReplacesTheRootRelationAndTheTerminalSurfaceKeepsIt() throws {
    let rootMember = memberObject("duo-alpha-beta", lead: "alpha", mate: "beta", effort: "low", fast: false)
    let overrideMember = memberObject("pair-alpha-beta", lead: "alpha", mate: "beta")
    let agent = try AgentStatusRecord(
      wire: .object([
        "kind": .string("provider"),
        "label": .string("Provider"),
        "installed": .bool(true),
        "authState": .string("authenticated"),
        "capabilities": .object([
          "models": .array([
            .object(["id": .string("duo-alpha-beta"), "label": .string("duo-alpha-beta")]),
            .object(["id": .string("pair-alpha-beta"), "label": .string("pair-alpha-beta")]),
          ]),
          "modelFamilies": .array([
            .object([
              "model": .string("duo-alpha-beta"),
              "label": .string("Root Encoded"),
              "selectors": .array([
                .object([
                  "id": .string("lead"), "labelKey": .string("modelSelection.lead"),
                  "options": .array([
                    .object(["id": .string("alpha"), "label": .string("Alpha")]),
                  ]),
                ]),
                .object([
                  "id": .string("mate"), "labelKey": .string("modelSelection.sidekick"),
                  "options": .array([
                    .object(["id": .string("beta"), "label": .string("Beta")]),
                  ]),
                ]),
              ]),
              "bindings": .object(["effort": .string("model"), "fast": .string("model")]),
              "members": .array([rootMember]),
            ])
          ]),
          "presentationCapabilities": .object([
            "gui": .object([
              "models": .array([
                .object(["id": .string("pair-alpha-beta"), "label": .string("pair-alpha-beta")]),
              ]),
              "efforts": .array([]),
              "modelEfforts": .object([:]),
              "modelFamilies": .array([
                .object([
                  "model": .string("pair-alpha-beta"),
                  "label": .string("GUI Independent"),
                  "selectors": .array([
                    .object([
                      "id": .string("lead"), "labelKey": .string("modelSelection.lead"),
                      "options": .array([
                        .object(["id": .string("alpha"), "label": .string("Alpha")]),
                      ]),
                    ]),
                    .object([
                      "id": .string("mate"), "labelKey": .string("modelSelection.sidekick"),
                      "options": .array([
                        .object(["id": .string("beta"), "label": .string("Beta")]),
                      ]),
                    ]),
                  ]),
                  "bindings": .object(["effort": .string("config"), "fast": .string("config")]),
                  "members": .array([overrideMember]),
                ])
              ]),
            ])
          ]),
        ]),
      ]))

    let gui = HomeComposerCatalog.capabilities(for: agent, presentationMode: .gui)
    XCTAssertEqual(
      ModelFamilies.project(gui).map(\.label), ["GUI Independent"],
      "the root relation never leaks across a presentation override")
    let terminal = HomeComposerCatalog.capabilities(for: agent, presentationMode: .terminal)
    XCTAssertEqual(
      ModelFamilies.project(terminal).map(\.label), ["Root Encoded"],
      "the surface without an override keeps the root relation")
  }

  // MARK: - Home composer consumption

  func testHomePickerProjectsFamilyRowsAndKeepsRawChoices() throws {
    let agent = try agentStatus(capabilities: encodedCapabilities())
    let raw = HomeComposerCatalog.models(for: agent, presentationMode: .gui)
    XCTAssertEqual(raw.map(\.modelID).count, 6)
    let picker = HomeComposerCatalog.pickerModels(for: agent, presentationMode: .gui)
    XCTAssertEqual(picker.map(\.modelID), ["solo", "duo-alpha-beta"])
    XCTAssertEqual(picker[1].label, "Duo Family")
    XCTAssertEqual(picker[1].agentKind, agent.kind)
  }

  func testHomeDefaultEffortIsAbsentForEncodedMembers() throws {
    let capabilities = encodedCapabilities()
    XCTAssertNil(
      HomeComposerCatalog.defaultEffort(capabilities: capabilities, modelID: "duo-alpha-beta"))
    // A model outside any family keeps the ordinary default lookup.
    XCTAssertNil(HomeComposerCatalog.defaultEffort(capabilities: capabilities, modelID: "solo"))
  }

  func testHomeFastAvailabilityFollowsTheEncodedRelation() throws {
    var config = ThreadConfig.empty
    config.model = "duo-alpha-beta"
    XCTAssertTrue(ModelFamilies.fastAvailable(encodedCapabilities(), config: config))
    config.model = "duo-bravo-delta"
    XCTAssertFalse(ModelFamilies.fastAvailable(encodedCapabilities(), config: config))
    config.model = "solo"
    XCTAssertTrue(ModelFamilies.fastAvailable(encodedCapabilities(), config: config))
  }

  // MARK: - Model visibility (user override + provider defaults)

  /// A flat inventory whose provider defaults hide two retired ids.
  private func hiddenCapabilities() -> [String: JSONValue] {
    [
      "models": .array(
        ["recommended", "retired-a", "retired-b", "kept"].map {
          .object(["id": .string($0), "label": .string($0)])
        }),
      "defaultHiddenModels": .array([.string("retired-a"), .string("retired-b")]),
    ]
  }

  func testHomePickerHidesProviderDefaultsButKeepsTheConfiguredModelListed() throws {
    let agent = try agentStatus(capabilities: hiddenCapabilities())
    // The raw inventory stays the exact-choice authority — schedules, handoff,
    // and preferred-id launch resolution never see the visibility filter.
    XCTAssertEqual(
      HomeComposerCatalog.models(for: agent, presentationMode: .gui).map(\.modelID).count, 4)
    XCTAssertEqual(
      HomeComposerCatalog.pickerModels(for: agent, presentationMode: .gui).map(\.modelID),
      ["recommended", "kept"])
    // The configured hidden model is re-admitted at its advertised position —
    // exactly the current selection, never the whole hidden set.
    XCTAssertEqual(
      HomeComposerCatalog.pickerModels(
        for: agent, presentationMode: .gui, userHiddenModels: nil, currentModelID: "retired-a"
      ).map(\.modelID),
      ["recommended", "retired-a", "kept"])
  }

  func testHomePickerUserVisibilityOverrideWinsWithExactEmptyMeaningShowAll() throws {
    let agent = try agentStatus(capabilities: hiddenCapabilities())
    // The configured model is deliberately one no list hides, so every
    // assertion reads the pure filter effect.
    func pickerIDs(_ hidden: [String: [String]]?) -> [String] {
      HomeComposerCatalog.pickerModels(
        for: agent, presentationMode: .gui, userHiddenModels: hidden,
        currentModelID: "kept"
      ).map(\.modelID)
    }
    // Exact empty list: the user chose show all — provider defaults step aside.
    XCTAssertEqual(
      pickerIDs(["provider": []]),
      ["recommended", "retired-a", "retired-b", "kept"])
    // A saved provider list replaces the defaults outright.
    XCTAssertEqual(
      pickerIDs(["provider": ["recommended"]]),
      ["retired-a", "retired-b", "kept"])
    // The plain per-agent list (the native settings toggles'
    // key) applies before the provider defaults.
    XCTAssertEqual(
      pickerIDs(["provider": ["retired-a"]]),
      ["recommended", "retired-b", "kept"])
    // No user list at all: the provider defaults apply.
    XCTAssertEqual(pickerIDs(nil), ["recommended", "kept"])
    XCTAssertEqual(pickerIDs([:]), ["recommended", "kept"])
  }

  func testVisibilityKeysRequireSelectedDeclaredGUIVariantOnBothSurfaces() throws {
    func check(
      _ overrides: [String: [String]], _ expected: [String],
      runtimeLabel: String? = nil, variantMode: String? = nil,
      presentation: ThreadPresentationMode = .gui
    ) throws {
      let capabilities = hiddenCapabilities()
      var selectedCapabilities = capabilities
      if let runtimeLabel {
        selectedCapabilities["presentationCapabilities"] = .object([
          "gui": .object(capabilities.merging(["runtimeLabel": .string(runtimeLabel)]) { _, new in new })
        ])
      }
      var wire: [String: JSONValue] = [
        "kind": .string("provider"), "label": .string("Provider"), "installed": .bool(true),
        "authState": .string("authenticated"), "capabilities": .object(selectedCapabilities),
      ]
      if let variantMode {
        wire["runtimeVariants"] = .object([
          "acp": .object(["presentationMode": .string(variantMode), "capabilities": .object(capabilities)])
        ])
      }
      let agent = try AgentStatusRecord(wire: .object(wire))
      XCTAssertEqual(HomeComposerCatalog.pickerModels(
        for: agent, presentationMode: presentation, userHiddenModels: overrides,
        currentModelID: "kept").map(\.modelID), expected)
      XCTAssertEqual(RichChatComposerControlCatalog(
        agentStatus: agent, presentationMode: presentation, configuration: config(model: "kept"),
        hiddenModels: overrides).models.map(\.id), expected)
    }
    let all = ["recommended", "retired-a", "retired-b", "kept"]
    let defaults = ["recommended", "kept"]
    try check(["provider": [], "provider-gui": ["recommended"]], all)
    try check(["provider-gui": []], defaults)
    try check(["provider": ["recommended"], "provider-acp": []], all,
      runtimeLabel: "ACP", variantMode: "gui")
    try check(["provider": [], "provider-acp": ["recommended"]], ["retired-a", "retired-b", "kept"],
      runtimeLabel: "ACP", variantMode: "gui")
    try check(["provider": []], all, runtimeLabel: "ACP", variantMode: "gui")
    try check(["provider-acp": []], defaults, runtimeLabel: "ACP", variantMode: "terminal")
    try check(["provider-acp": []], defaults, runtimeLabel: "Other", variantMode: "gui")
    try check(["provider-acp": []], defaults, runtimeLabel: "ACP", variantMode: "gui", presentation: .terminal)
  }

  func testChooserHidesProviderDefaultsAndKeepsTheConfiguredModelLabeledAndEditable() throws {
    let catalog = try makeCatalog(
      hiddenCapabilities(), configuration: config(model: "retired-a"))
    // The hidden ids leave the chooser; the configured hidden model is
    // re-admitted at its advertised position so the picker can label it.
    XCTAssertEqual(catalog.models.map(\.id), ["recommended", "retired-a", "kept"])
    XCTAssertEqual(catalog.modelLabel("retired-a"), "Retired A")
    // Hiding is a menu preference, never a capability change: the visible
    // rows keep selecting exactly, and the retained hidden model keeps its
    // resolved edits.
    var draft = config(model: "retired-a")
    catalog.applyExactModelSelection("kept", to: &draft)
    XCTAssertEqual(draft.model, "kept")
  }

  func testChooserUserVisibilityOverrideBeatsProviderDefaultsWithExactEmptyMeaningShowAll() throws {
    // The configured model is deliberately one no list hides, so every
    // assertion reads the pure filter effect.
    func modelIDs(_ hidden: [String: [String]]?) throws -> [String] {
      try makeCatalog(
        hiddenCapabilities(),
        configuration: config(model: "kept"),
        hiddenModels: hidden
      ).models.map(\.id)
    }
    // Exact empty list: show all — the provider defaults never apply.
    XCTAssertEqual(
      try modelIDs(["provider": []]),
      ["recommended", "retired-a", "retired-b", "kept"])
    // A saved provider list replaces the defaults outright.
    XCTAssertEqual(
      try modelIDs(["provider": ["recommended"]]),
      ["retired-a", "retired-b", "kept"])
    // The plain per-agent list applies before the defaults.
    XCTAssertEqual(
      try modelIDs(["provider": ["retired-a"]]),
      ["recommended", "retired-b", "kept"])
    // No user list: provider defaults.
    XCTAssertEqual(try modelIDs(nil), ["recommended", "kept"])
  }

  func testHiddenFamilyRowLeavesTheChooserUntilAConfiguredMemberRevivesIt() throws {
    var capabilities = encodedCapabilities()
    let duoMembers = [
      "duo-alpha-beta", "duo-alpha-beta-fast", "duo-alpha-beta-hi", "duo-bravo-beta",
      "duo-bravo-delta",
    ]
    capabilities["defaultHiddenModels"] = .array(duoMembers.map { .string($0) })
    // Every member hidden: the family row disappears instead of advertising
    // an empty relation.
    let withoutMember = try makeCatalog(
      capabilities, configuration: config(model: "solo"))
    XCTAssertEqual(withoutMember.models.map(\.id), ["solo"])
    // The configured hidden member is re-admitted: its family row revives
    // (the declared representative stays hidden, so the projected row stands
    // at the surviving member) and the exact member stays resumable.
    let withMember = try makeCatalog(
      capabilities, configuration: config(model: "duo-bravo-beta"))
    XCTAssertEqual(withMember.models.map(\.id), ["solo", "duo-bravo-beta"])
    XCTAssertEqual(withMember.models[1].label, "Duo Family")
    XCTAssertEqual(withMember.modelLabel("duo-bravo-beta"), "Duo Family")
    var draft = config(model: "duo-bravo-beta")
    withMember.applyExactModelSelection("duo-bravo-beta", to: &draft)
    XCTAssertEqual(draft.model, "duo-bravo-beta", "the hidden configured member stays resumable")
  }

  func testModelRowsCarryCatalogPricingWhileFamilyRowsClaimNoPrice() throws {
    var capabilities = encodedCapabilities()
    let priced: [String: String] = [
      "solo": "$0.5/$2 per Mtok", "duo-alpha-beta": "$1/$5 per Mtok",
      "duo-alpha-beta-fast": "$2/$8 per Mtok", "duo-bravo-beta": "$3/$9 per Mtok",
    ]
    capabilities["models"] = .array(
      (capabilities["models"]?.arrayValue ?? []).map { value in
        guard var object = value.objectValue, let id = object["id"]?.stringValue,
          let description = priced[id]
        else { return value }
        object["description"] = .string(description)
        return .object(object)
      })
    let catalog = try makeCatalog(capabilities, configuration: config(model: "solo"))
    XCTAssertEqual(catalog.models.map(\.id), ["solo", "duo-alpha-beta"])
    XCTAssertEqual(catalog.models[0].modelDescription, "$0.5/$2 per Mtok")
    // The projected family row stands for every member: it never claims the
    // representative's cost as the family's price.
    XCTAssertNil(catalog.models[1].modelDescription)
    XCTAssertEqual(catalog.modelLabel("duo-alpha-beta"), "Duo Family")

    // Live negotiated rows inherit the same static catalog pricing for their
    // exact ids.
    let live: JSONValue = .array([
      .object([
        "type": .string("select"), "id": .string("model"), "role": .string("model"),
        "currentValue": .string("solo"),
        "values": .array([
          .object(["value": .string("solo"), "name": .string("Solo Native")]),
          .object(["value": .string("duo-alpha-beta"), "name": .string("Duo Native")]),
        ]),
      ])
    ])
    let liveCatalog = try makeCatalog(
      capabilities, configuration: config(model: "solo"), sessionConfigOptions: live)
    XCTAssertEqual(liveCatalog.models.map(\.id), ["solo", "duo-alpha-beta"])
    XCTAssertEqual(liveCatalog.models[0].label, "Solo Native")
    XCTAssertEqual(liveCatalog.models[0].modelDescription, "$0.5/$2 per Mtok")
    XCTAssertNil(liveCatalog.models[1].modelDescription, "the family row still claims no price")
  }

  // MARK: - Wiring and localization gates

  func testComposerSourcesWireTheFamilyEditCallbacks() throws {
    let configuration = try Self.source("App/Features/RichChat/UI/RichChatComposerConfiguration.swift")
    XCTAssertTrue(
      configuration.contains("catalog.isProjectedFamilyRow(model)")
        && configuration.contains("catalog.applyFamilyRowSelection(model, to: &draft)")
        && configuration.contains("catalog.applyExactModelSelection(model, to: &draft)"),
      "the model binding dispatches the row's own family/exact intent")
    XCTAssertTrue(
      configuration.contains("catalog.applySelectorEdit(selectorID: control.id, value: $0, to: &draft)"),
      "the conditional selector pick resolves through the relation")
    XCTAssertTrue(
      configuration.contains("catalog.applyEffortEdit($0, to: &draft)"),
      "the effort pick resolves through the relation")
    XCTAssertTrue(
      configuration.contains("get: { catalog.displayedFast(draft) }"),
      "the Fast toggle displays the member-derived state")
    let inline = try Self.source("App/Features/RichChat/UI/RichChatComposerInlineControls.swift")
    XCTAssertTrue(
      inline.contains("catalog.displayedEffort(for: configuration)"),
      "the compact summary shows the member-derived effort")

    let homeContent = try Self.source("App/Features/Home/Views/HomeQuickComposeContent.swift")
    XCTAssertTrue(
      homeContent.contains("applyComposerEffort(effort)")
        && homeContent.contains("applyComposerFastToggle()"),
      "the Home common controls resolve explicit edits at the boundary")
    XCTAssertTrue(
      homeContent.contains("composerDisplayedFast"), "the Home Fast button displays the relation state"
    )
    let homeSheets = try Self.source("App/Features/Home/HomeComposerSelectorSheets.swift")
    XCTAssertTrue(
      homeSheets.contains("effectiveModelIsRepresentedByRow(model)"),
      "the Home model row matches any member its family row represents")
  }

  func testFamilySelectorLabelsAreTranslatedInEveryLocale() throws {
    let locales: Set<String> = [
      "en", "de", "es", "fr", "ja", "ko", "pl", "pt-BR", "ru", "tr", "uk", "vi", "zh-Hans",
    ]
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("App/Resources/Localizable.xcstrings")
    let root = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
    )
    let strings = try XCTUnwrap(root["strings"] as? [String: Any])
    for key in ["model.selection.lead", "model.selection.sidekick"] {
      let entry = try XCTUnwrap(strings[key] as? [String: Any], key)
      let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
      XCTAssertEqual(Set(localizations.keys), locales, key)
      for (locale, raw) in localizations {
        let unit = try XCTUnwrap(
          (raw as? [String: Any])?["stringUnit"] as? [String: Any], "\(key):\(locale)")
        XCTAssertFalse(
          (unit["value"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ?? true, "\(key):\(locale)")
      }
    }
  }

  private static func source(_ relativePath: String) throws -> String {
    let root = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
    return try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
  }
}
