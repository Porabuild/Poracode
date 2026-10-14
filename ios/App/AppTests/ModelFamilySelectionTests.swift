import Foundation
import XCTest

@testable import App

/// Neutral projection/edit semantics for the optional `modelFamilies`
/// capability relation, mirrored from `src/shared/modelFamilySelection.test.ts`.
/// Two independent selectors with holes, one family binding both encoded
/// controls to the member UID and one binding them to the saved config — no
/// provider payload appears anywhere in this suite.
final class ModelFamilySelectionTests: XCTestCase {
  // MARK: - Fixtures

  /// Duo members are (lead, mate, effort, fast) tuples; `duo-alpha-delta` and
  /// every high/strong-Fast combination off `alpha·beta` are holes.
  private func duoMembers() -> [JSONValue] {
    [
      member("duo-alpha-beta", lead: "alpha", mate: "beta", effort: "low", fast: false),
      member("duo-alpha-beta-fast", lead: "alpha", mate: "beta", effort: "low", fast: true),
      member("duo-alpha-beta-hi", lead: "alpha", mate: "beta", effort: "high", fast: false),
      member("duo-bravo-beta", lead: "bravo", mate: "beta", effort: "low", fast: false),
      member("duo-bravo-delta", lead: "bravo", mate: "delta", effort: "low", fast: false),
    ]
  }

  private func duoFamily(
    model: String = "duo-alpha-beta",
    members: [JSONValue]? = nil,
    selectors: [JSONValue]? = nil,
    bindings: (String, String) = ("model", "model"),
    label: String = "Duo"
  ) -> JSONValue {
    .object([
      "model": .string(model),
      "label": .string(label),
      "selectors": .array(
        selectors ?? [
          selector(
            "lead", labelKey: "modelSelection.lead",
            options: [("alpha", "Alpha"), ("bravo", "Bravo")]),
          selector(
            "mate", labelKey: "modelSelection.sidekick",
            options: [("beta", "Beta"), ("delta", "Delta")]),
        ]),
      "bindings": .object(["effort": .string(bindings.0), "fast": .string(bindings.1)]),
      "members": .array(members ?? duoMembers()),
    ])
  }

  /// Independent-carrier relation: members carry selector coordinates only.
  private func pairFamily() -> JSONValue {
    .object([
      "model": .string("pair-charlie-beta"),
      "label": .string("Pair"),
      "selectors": .array([
        selector(
          "lead", labelKey: "modelSelection.lead",
          options: [("charlie", "Charlie"), ("echo", "Echo")]),
        selector(
          "mate", labelKey: "modelSelection.sidekick",
          options: [("beta", "Beta"), ("delta", "Delta")]),
      ]),
      "bindings": .object(["effort": .string("config"), "fast": .string("config")]),
      "members": .array([
        member("pair-charlie-beta", lead: "charlie", mate: "beta", effort: "high"),
        member("pair-charlie-delta", lead: "charlie", mate: "delta"),
        member("pair-echo-beta", lead: "echo", mate: "beta"),
        member("pair-echo-delta", lead: "echo", mate: "delta"),
      ]),
    ])
  }

  private func capability(
    models: [String]? = nil,
    families: [JSONValue]
  ) -> [String: JSONValue] {
    let allIDs =
      models ?? [
        "solo", "duo-alpha-beta", "duo-alpha-beta-fast", "duo-alpha-beta-hi", "duo-bravo-beta",
        "duo-bravo-delta", "pair-charlie-beta", "pair-charlie-delta", "pair-echo-beta",
        "pair-echo-delta",
      ]
    return [
      "models": .array(allIDs.map { .object(["id": .string($0), "label": .string($0)]) }),
      "efforts": .array([.string("low"), .string("high")]),
      "modelEfforts": .object(["solo": .array([.string("low"), .string("high")])]),
      "fastModels": .array([.string("solo")]),
      "modelFamilies": .array(families),
    ]
  }

  private func member(
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

  private func selector(
    _ id: String, labelKey: String, options: [(String, String)]
  ) -> JSONValue {
    .object([
      "id": .string(id),
      "labelKey": .string(labelKey),
      "options": .array(options.map { .object(["id": .string($0.0), "label": .string($0.1)]) }),
    ])
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

  private var capabilities: [String: JSONValue] {
    capability(families: [duoFamily(), pairFamily()])
  }

  // MARK: - Projection

  func testProjectPassesValidDescriptorsAndKeepsRawModelsUntouched() {
    let families = ModelFamilies.project(capabilities)
    XCTAssertEqual(families.map(\.label), ["Duo", "Pair"])
    XCTAssertEqual(families[0].members.count, 5)
    XCTAssertEqual(families[1].members.count, 4)
    // The raw inventory stays the compatible selection authority.
    XCTAssertTrue(
      capabilities["models"]?.arrayValue?.contains {
        $0.objectValue?["id"]?.stringValue == "duo-alpha-beta-fast"
      } == true)
    XCTAssertTrue(ModelFamilies.project(capability(families: [])).isEmpty)
  }

  func testIntersectsWithAcceptedInventoryAndSubstitutesRemovedDefault() {
    let reduced = capability(
      models: ["solo", "duo-alpha-beta-fast", "duo-alpha-beta-hi", "duo-bravo-beta", "duo-bravo-delta"],
      families: [duoFamily()]
    )
    let families = ModelFamilies.project(reduced)
    XCTAssertEqual(families.count, 1)
    // The retired declared default substitutes to the first surviving member
    // inside the projection only; the input descriptor is never rewritten.
    XCTAssertEqual(families[0].model, "duo-alpha-beta-fast")
    XCTAssertEqual(families[0].members.count, 4)
  }

  func testDropsInvalidDescriptorsInsteadOfSurfacingHalfARelation() {
    let first = member("duo-alpha-beta", lead: "alpha", mate: "beta", effort: "low", fast: false)
    let broken: [[String: JSONValue]] = [
      // duplicate tuple
      cast(
        duoFamilyObject()
          .adding("members", .array(duoMembers() + [first.withModel("duo-copy")]))),
      // duplicate member UID
      cast(duoFamilyObject().adding("members", .array(duoMembers() + [first]))),
      // model-bound effort missing on one member
      cast(
        duoFamilyObject().adding(
          "members",
          .array(duoMembers().enumerated().map { index, value in
            index == 1 ? memberWithout(value, removing: "effort") : value
          }))),
      // unknown labelKey
      cast(
        duoFamilyObject().adding(
          "selectors",
          .array([
            selector("lead", labelKey: "nope.missing", options: [("alpha", "Alpha"), ("bravo", "Bravo")]),
            selector(
              "mate", labelKey: "modelSelection.sidekick",
              options: [("beta", "Beta"), ("delta", "Delta")]),
          ]))),
      // model-bound fast missing on one member
      cast(
        duoFamilyObject().adding(
          "members",
          .array(duoMembers().enumerated().map { index, value in
            index == 1 ? memberWithout(value, removing: "fast") : value
          }))),
      // member misses a declared selector
      cast(
        duoFamilyObject().adding(
          "members",
          .array([
            .object([
              "model": .string("duo-x"),
              "selections": .object(["lead": .string("alpha")]),
              "effort": .string("low"),
              "fast": .bool(false),
            ])
          ]))),
      // member carries an undeclared selector
      cast(
        duoFamilyObject().adding(
          "members",
          .array([
            .object([
              "model": .string("duo-x"),
              "selections": .object([
                "lead": .string("alpha"), "mate": .string("beta"), "ghost": .string("zeta"),
              ]),
              "effort": .string("low"),
              "fast": .bool(false),
            ])
          ]))),
      // option value outside its selector
      cast(
        duoFamilyObject().adding(
          "members",
          .array([
            .object([
              "model": .string("duo-x"),
              "selections": .object(["lead": .string("ghost"), "mate": .string("beta")]),
              "effort": .string("low"),
              "fast": .bool(false),
            ])
          ]))),
      // empty relation
      cast(duoFamilyObject().adding("members", .array([]))),
      // no member in the accepted inventory
      cast(
        duoFamilyObject().adding(
          "members",
          .array([
            member("elsewhere", lead: "alpha", mate: "beta", effort: "low", fast: false)
          ]))),
      // descriptor default is not one of its own members
      cast(duoFamilyObject().adding("model", .string("duo-elsewhere"))),
    ]
    for family in broken {
      XCTAssertEqual(
        ModelFamilies.project(capability(families: [.object(family)])), [],
        "expected \(family["label"]?.stringValue ?? "descriptor") to be dropped")
    }
  }

  func testDropsLaterFamilyWhoseRepresentativeCollidesWithAnEarlierRow() {
    // One owner per member: the later Pair family keeps its representative but
    // its `charlie·delta` member was renamed onto Duo's `duo-alpha-beta`, so
    // the member collision drops the whole descriptor (the TS fixture shape).
    let overlapping = cast(
      pairFamilyObject().adding(
        "members",
        .array([
          member("pair-charlie-beta", lead: "charlie", mate: "beta"),
          member("duo-alpha-beta", lead: "charlie", mate: "delta"),
          member("pair-echo-beta", lead: "echo", mate: "beta"),
          member("pair-echo-delta", lead: "echo", mate: "delta"),
        ])))
    let overlappingCapabilities = capability(families: [duoFamily(), .object(overlapping)])
    XCTAssertEqual(
      ModelFamilies.project(overlappingCapabilities).map(\.label), ["Duo"])
    XCTAssertEqual(
      ModelFamilies.family(for: "duo-alpha-beta", in: overlappingCapabilities)?.label, "Duo")
    XCTAssertNil(
      ModelFamilies.family(for: "pair-charlie-beta", in: overlappingCapabilities),
      "the dropped family's representative resolves to nothing")
    XCTAssertTrue(
      ModelFamilies.pickerModels(
        accepted: [("duo-alpha-beta", "duo-alpha-beta"), ("pair-charlie-beta", "pair-charlie-beta")],
        capabilities: overlappingCapabilities
      ).contains { $0.id == "pair-charlie-beta" },
      "the overlapping family stays on the raw fallback")
  }

  func testDropsCoordinatesABindingDoesNotOwn() {
    let noisy = cast(
      pairFamilyObject().adding(
        "members",
        .array([
          member("pair-charlie-beta", lead: "charlie", mate: "beta", effort: "high", fast: true),
          member("pair-charlie-delta", lead: "charlie", mate: "delta"),
          member("pair-echo-beta", lead: "echo", mate: "beta"),
          member("pair-echo-delta", lead: "echo", mate: "delta"),
        ])))
    let families = ModelFamilies.project(capability(families: [.object(noisy)]))
    XCTAssertEqual(families.count, 1)
    // Config-bound coordinates are dropped from the projected members.
    XCTAssertNil(families[0].members.first { $0.model == "pair-charlie-beta" }?.effort)
    XCTAssertNil(families[0].members.first { $0.model == "pair-charlie-beta" }?.fast)
  }

  // MARK: - Lookup and display

  func testResolvesExactMemberUIDsOnly() {
    XCTAssertEqual(ModelFamilies.family(for: "duo-bravo-delta", in: capabilities)?.label, "Duo")
    XCTAssertNil(ModelFamilies.family(for: "solo", in: capabilities))
    XCTAssertNil(ModelFamilies.family(for: "retired-uid", in: capabilities))
    XCTAssertNil(ModelFamilies.family(for: nil, in: capabilities))
  }

  func testDerivesEncodedAxesFromTheMemberIgnoringInertStoredSeeds() {
    // A raw Fast UID plus an inert stored `fast: false` displays Fast.
    let display = ModelFamilies.displayConfig(
      capabilities, config: config(model: "duo-alpha-beta-fast", effort: "", fast: false))
    XCTAssertEqual(display?.effort, "low")
    XCTAssertEqual(display?.fast, true)

    let standard = ModelFamilies.displayConfig(
      capabilities, config: config(model: "duo-alpha-beta", fast: false))
    XCTAssertEqual(standard?.effort, "low")
    XCTAssertEqual(standard?.fast, false)
  }

  func testRefusesToReinterpretMeaningfulStoredOverridesOnModelBoundAxes() {
    XCTAssertNil(
      ModelFamilies.displayConfig(
        capabilities, config: config(model: "duo-alpha-beta", effort: "high")))
    XCTAssertNil(
      ModelFamilies.displayConfig(
        capabilities, config: config(model: "duo-alpha-beta", fast: true)))
  }

  func testKeepsIndependentCarriersForConfigBoundFamilies() {
    let display = ModelFamilies.displayConfig(
      capabilities, config: config(model: "pair-charlie-beta", effort: "low", fast: true))
    XCTAssertEqual(display?.model, "pair-charlie-beta")
    XCTAssertEqual(display?.effort, "low", "the saved independent effort passes through")
    XCTAssertEqual(display?.fast, true, "the saved independent Fast passes through")
  }

  // MARK: - Selector options and ladders

  func testFiltersOptionsToCoordinatesReachableFromTheCurrentMember() {
    // duo-alpha-beta + mate delta has no member at any effort → delta omitted;
    // the current choice is always included.
    XCTAssertEqual(
      ModelFamilies.selectorOptions(
        capabilities, config: config(model: "duo-alpha-beta"), selectorID: "mate"
      ).map(\.id), ["beta"])
    XCTAssertEqual(
      ModelFamilies.selectorOptions(
        capabilities, config: config(model: "duo-alpha-beta"), selectorID: "lead"
      ).map(\.id), ["alpha", "bravo"])
    // The encoded effort is held: bravo·beta at high has no member, and the
    // current member's effort is low.
    XCTAssertEqual(
      ModelFamilies.selectorOptions(
        capabilities, config: config(model: "duo-alpha-beta-hi"), selectorID: "lead"
      ).map(\.id), ["alpha"])
  }

  func testOffersTheFullIndependentGridForConfigBoundSelectors() {
    XCTAssertEqual(
      ModelFamilies.selectorOptions(
        capabilities, config: config(model: "pair-charlie-beta"), selectorID: "lead"
      ).map(\.id), ["charlie", "echo"])
    XCTAssertEqual(
      ModelFamilies.selectorOptions(
        capabilities, config: config(model: "pair-charlie-beta"), selectorID: "mate"
      ).map(\.id), ["beta", "delta"])
  }

  func testReturnsNoOptionsWithoutFamilyContextOrUnknownSelector() {
    XCTAssertTrue(
      ModelFamilies.selectorOptions(
        capabilities, config: config(model: "solo"), selectorID: "lead"
      ).isEmpty)
    XCTAssertTrue(
      ModelFamilies.selectorOptions(
        capabilities, config: config(model: "duo-alpha-beta"), selectorID: "ghost"
      ).isEmpty)
  }

  func testDerivesTheEncodedLadderFromReachableMembers() {
    // From duo-bravo-delta: same selections, only effort varies → low only.
    XCTAssertEqual(
      ModelFamilies.efforts(capabilities, config: config(model: "duo-bravo-delta")), ["low"])
    // From duo-alpha-beta at low: low and high reachable.
    XCTAssertEqual(
      ModelFamilies.efforts(capabilities, config: config(model: "duo-alpha-beta")), ["low", "high"]
    )
  }

  func testSortsTheEncodedLadderWeakestToStrongest() {
    var members = duoMembers()
    members.append(
      member("duo-alpha-beta-max", lead: "alpha", mate: "beta", effort: "max", fast: false))
    members.append(
      member("duo-alpha-beta-min", lead: "alpha", mate: "beta", effort: "minimal", fast: false))
    let family = cast(duoFamilyObject().adding("members", .array(members)))
    let extended = capability(
      models: [
        "duo-alpha-beta", "duo-alpha-beta-fast", "duo-alpha-beta-hi", "duo-bravo-beta",
        "duo-bravo-delta", "duo-alpha-beta-max", "duo-alpha-beta-min",
      ],
      families: [.object(family)]
    )
    let ladder = ModelFamilies.efforts(extended, config: config(model: "duo-alpha-beta"))
    XCTAssertEqual(ladder, ["minimal", "low", "high", "max"])
  }

  func testFallsBackToTheOrdinaryLadderOutsideAModelBoundFamily() {
    // Unsorted, exactly as advertised — the config-bound and absent paths.
    let scoped = capability(
      models: ["solo", "pair-charlie-beta"],
      families: [pairFamily()]
    )
    XCTAssertEqual(
      ModelFamilies.efforts(scoped, config: config(model: "pair-charlie-beta")), ["low", "high"])
    XCTAssertEqual(
      ModelFamilies.efforts(capabilities, config: config(model: "solo")), ["low", "high"])
  }

  func testGatesFastOnAnOppositeFastSiblingInsideAModelBoundFamily() {
    XCTAssertTrue(
      ModelFamilies.fastAvailable(capabilities, config: config(model: "duo-alpha-beta")))
    XCTAssertFalse(
      ModelFamilies.fastAvailable(capabilities, config: config(model: "duo-alpha-beta-hi")),
      "no opposite-Fast sibling at alpha·beta·high")
    XCTAssertFalse(
      ModelFamilies.fastAvailable(capabilities, config: config(model: "duo-bravo-delta")))
    // Outside a model-bound family the ordinary fastModels capability applies.
    XCTAssertTrue(ModelFamilies.fastAvailable(capabilities, config: config(model: "solo")))
  }

  // MARK: - Edits

  func testResolvesASelectorEditIntoAnAtomicEncodedPatch() {
    // `bravo·beta` → `bravo·delta` exists; `alpha·delta` is a hole (covered by
    // the incomplete-tuple test), so the edit starts from the bravo·beta member.
    let patch = ModelFamilies.apply(
      .selector(selectorID: "mate", value: "delta"),
      to: config(model: "duo-bravo-beta", effort: "", fast: false),
      capabilities: capabilities
    )
    XCTAssertEqual(patch?.model, "duo-bravo-delta", "the complete tuple resolves to the exact UID")
    XCTAssertEqual(patch?.effort, "")
    XCTAssertEqual(patch?.fast, false)
  }

  func testReturnsNilForSelectorEditsWithoutACompleteTuple() {
    let base = config(model: "duo-alpha-beta", effort: "", fast: false)
    // bravo·beta·high does not exist — no nearest-effort substitution.
    XCTAssertNil(
      ModelFamilies.apply(
        .selector(selectorID: "lead", value: "bravo"),
        to: config(model: "duo-alpha-beta-hi", effort: "", fast: false),
        capabilities: capabilities
      ))
    // alpha·delta has no member at any coordinate.
    XCTAssertNil(
      ModelFamilies.apply(.selector(selectorID: "mate", value: "delta"), to: base,
        capabilities: capabilities))
    // Unknown option.
    XCTAssertNil(
      ModelFamilies.apply(
        .selector(selectorID: "mate", value: "ghost"), to: base, capabilities: capabilities))
    // No family context.
    XCTAssertNil(
      ModelFamilies.apply(.selector(selectorID: "mate", value: "beta"), to: config(model: "solo"),
        capabilities: capabilities))
  }

  func testResolvesEffortAndFastEditsAlongSingleAxesOnly() {
    // Effort up from duo-alpha-beta: exact sibling, no other axis moves.
    let effort = ModelFamilies.apply(
      .effort("high"), to: config(model: "duo-alpha-beta", effort: "", fast: false),
      capabilities: capabilities)
    XCTAssertEqual(effort?.model, "duo-alpha-beta-hi")
    XCTAssertEqual(effort?.effort, "")
    XCTAssertEqual(effort?.fast, false)

    // Fast on from duo-alpha-beta: the encoded Fast sibling.
    let fastOn = ModelFamilies.apply(
      .fast(true), to: config(model: "duo-alpha-beta", effort: "", fast: false),
      capabilities: capabilities)
    XCTAssertEqual(fastOn?.model, "duo-alpha-beta-fast")

    // Fast off where stored fast was already false but the UID encodes Fast.
    let fastOff = ModelFamilies.apply(
      .fast(false), to: config(model: "duo-alpha-beta-fast", effort: "", fast: false),
      capabilities: capabilities)
    XCTAssertEqual(fastOff?.model, "duo-alpha-beta")

    // Holes stay holes.
    XCTAssertNil(
      ModelFamilies.apply(.effort("high"), to: config(model: "duo-bravo-delta"),
        capabilities: capabilities))
    XCTAssertNil(
      ModelFamilies.apply(.fast(true), to: config(model: "duo-bravo-delta"),
        capabilities: capabilities))
  }

  func testRetainsTheCurrentMemberWhenTheFamilyRowIsClickedInsideTheFamily() {
    // The projected row click keeps the actual selected member.
    let patch = ModelFamilies.apply(
      .family("duo-alpha-beta"),
      to: config(model: "duo-alpha-beta-fast", effort: "", fast: false),
      capabilities: capabilities
    )
    XCTAssertEqual(patch?.isEmpty, true, "the actual selected member is preserved")

    // A fresh family pick adopts the declared default member.
    let fresh = ModelFamilies.apply(
      .family("duo-alpha-beta"), to: config(model: "solo"), capabilities: capabilities)
    XCTAssertEqual(fresh?.model, "duo-alpha-beta")
    XCTAssertEqual(fresh?.effort, "")
    XCTAssertEqual(fresh?.fast, false)

    // A family pick of another representative adopts that family's default;
    // its config-bound carriers are not touched.
    let other = ModelFamilies.apply(
      .family("pair-charlie-beta"), to: config(model: "duo-alpha-beta"), capabilities: capabilities)
    XCTAssertEqual(other?.model, "pair-charlie-beta")
    XCTAssertNil(other?.effort)
    XCTAssertNil(other?.fast)

    // Only representatives carry the family intent.
    XCTAssertNil(
      ModelFamilies.apply(
        .family("duo-bravo-beta"), to: config(model: "duo-alpha-beta"), capabilities: capabilities))
  }

  func testSelectsTheExactRepresentativeForAnExactPickNeverAFamilyNoOp() {
    // The favorite-of-representative case: High is selected and the exact
    // choice of the Medium representative must restore that exact member.
    let exact = ModelFamilies.apply(
      .model("duo-alpha-beta"),
      to: config(model: "duo-alpha-beta-hi", effort: "", fast: false),
      capabilities: capabilities
    )
    XCTAssertEqual(exact?.model, "duo-alpha-beta")
    XCTAssertEqual(exact?.effort, "")
    XCTAssertEqual(exact?.fast, false)

    // Even when the exact pick names the member already selected, a deliberate
    // click is still an edit and rewrites the inert seeds.
    let selected = ModelFamilies.apply(
      .model("duo-alpha-beta"),
      to: config(model: "duo-alpha-beta", effort: "", fast: false),
      capabilities: capabilities
    )
    XCTAssertEqual(selected?.model, "duo-alpha-beta")
    XCTAssertEqual(selected?.effort, "")
    XCTAssertEqual(selected?.fast, false)

    // Config-bound families patch only the model, carriers untouched.
    let independent = ModelFamilies.apply(
      .model("pair-charlie-beta"),
      to: config(model: "pair-charlie-delta", effort: "low", fast: true),
      capabilities: capabilities
    )
    XCTAssertEqual(independent?.model, "pair-charlie-beta")
    XCTAssertNil(independent?.effort)
    XCTAssertNil(independent?.fast)
  }

  func testAdoptsTheDeclaredDefaultForAFreshFamilyPickAndExactMembersOtherwise() {
    let fresh = ModelFamilies.apply(
      .model("duo-alpha-beta"), to: config(model: "solo"), capabilities: capabilities)
    XCTAssertEqual(fresh?.model, "duo-alpha-beta")
    XCTAssertEqual(fresh?.effort, "")
    XCTAssertEqual(fresh?.fast, false)

    let exact = ModelFamilies.apply(
      .model("duo-bravo-delta"), to: config(model: "solo"), capabilities: capabilities)
    XCTAssertEqual(exact?.model, "duo-bravo-delta")
  }

  func testUsesOrdinaryPatchesOutsideFamiliesAndRejectsUnknownModels() {
    let patch = ModelFamilies.apply(.model("solo"), to: config(model: "solo"),
      capabilities: capabilities)
    XCTAssertEqual(patch?.model, "solo")
    XCTAssertNil(patch?.effort)
    XCTAssertNil(patch?.fast)

    let effort = ModelFamilies.apply(.effort("high"), to: config(model: "solo"),
      capabilities: capabilities)
    XCTAssertEqual(effort?.effort, "high")
    XCTAssertNil(effort?.model)

    let fast = ModelFamilies.apply(.fast(true), to: config(model: "solo"),
      capabilities: capabilities)
    XCTAssertEqual(fast?.fast, true)
    XCTAssertNil(fast?.model)

    XCTAssertNil(
      ModelFamilies.apply(.model("ghost"), to: config(model: "solo"), capabilities: capabilities))
  }

  func testKeepsIndependentCarriersForConfigBoundFamilyEdits() {
    let model = ModelFamilies.apply(
      .model("pair-echo-delta"),
      to: config(model: "pair-charlie-beta", effort: "low", fast: true),
      capabilities: capabilities
    )
    XCTAssertEqual(model?.model, "pair-echo-delta", "a pair change patches only the model")
    XCTAssertNil(model?.effort, "the saved independent effort is retained, not cleared")
    XCTAssertNil(model?.fast, "the saved independent Fast is retained, not cleared")

    let effort = ModelFamilies.apply(
      .effort("high"), to: config(model: "pair-charlie-beta", effort: "low", fast: true),
      capabilities: capabilities)
    XCTAssertEqual(effort?.effort, "high")
    XCTAssertNil(effort?.model, "the model stays unchanged")

    let fast = ModelFamilies.apply(
      .fast(false), to: config(model: "pair-charlie-beta", effort: "low", fast: true),
      capabilities: capabilities)
    XCTAssertEqual(fast?.fast, false)
    XCTAssertNil(fast?.model)
  }

  func testRefusesAResolvedFamilyEditOverMeaningfulThinkingOrContext() {
    XCTAssertNil(
      ModelFamilies.apply(
        .model("duo-alpha-beta"),
        to: config(model: "solo", thinking: true),
        capabilities: capabilities
      ))
    XCTAssertNil(
      ModelFamilies.apply(
        .selector(selectorID: "mate", value: "delta"),
        to: config(model: "duo-alpha-beta", effort: "", fast: false, contextSize: "128k"),
        capabilities: capabilities
      ))
    // The host's `contextSize: "default"` seed is inert, not a meaningful
    // override — a resolved family edit rides over it.
    XCTAssertNotNil(
      ModelFamilies.apply(
        .model("duo-alpha-beta"),
        to: config(model: "solo", contextSize: "default"),
        capabilities: capabilities
      ))
    XCTAssertNotNil(
      ModelFamilies.apply(
        .selector(selectorID: "lead", value: "bravo"),
        to: config(model: "duo-alpha-beta", effort: "", fast: false, contextSize: "default"),
        capabilities: capabilities
      ))
    // Config-bound families patch only the model, so unrelated carriers are
    // never a reason to refuse.
    XCTAssertNotNil(
      ModelFamilies.apply(
        .model("pair-echo-delta"),
        to: config(model: "pair-charlie-beta", thinking: true, contextSize: "128k"),
        capabilities: capabilities
      ))
  }

  // MARK: - Picker projection

  func testPickerModelsCollapseFamiliesAndPreserveEveryOtherRow() {
    let raw: [(id: String, label: String)] = [
      ("solo", "Solo"),
      ("duo-alpha-beta", "duo-alpha-beta"),
      ("duo-alpha-beta-fast", "duo-alpha-beta-fast"),
      ("duo-alpha-beta-hi", "duo-alpha-beta-hi"),
      ("duo-bravo-beta", "duo-bravo-beta"),
      ("duo-bravo-delta", "duo-bravo-delta"),
      ("pair-charlie-beta", "pair-charlie-beta"),
    ]
    let rows = ModelFamilies.pickerModels(accepted: raw, capabilities: capabilities)
    XCTAssertEqual(rows.map(\.id), [
      "solo", "duo-alpha-beta", "pair-charlie-beta",
    ])
    XCTAssertEqual(rows[1].label, "Duo", "the family row carries the declared label")
    // No descriptor → the same rows back.
    let bare = capability(families: [])
    XCTAssertEqual(
      ModelFamilies.pickerModels(accepted: raw, capabilities: bare).map(\.id), raw.map(\.id))
  }

  func testPickerProjectionNeverWidensAReducedLiveInventory() {
    let raw: [(id: String, label: String)] = [
      ("solo", "Solo"), ("duo-alpha-beta", "duo-alpha-beta"), ("duo-alpha-beta-hi", "duo-alpha-beta-hi"),
    ]
    let rows = ModelFamilies.pickerModels(
      accepted: raw, capabilities: capabilities, acceptedIDs: Set(["solo", "duo-alpha-beta"]))
    XCTAssertEqual(rows.map(\.id), ["solo", "duo-alpha-beta"])
    XCTAssertEqual(rows[1].label, "Duo")
    // No accepted member left → the descriptor disappears entirely.
    XCTAssertEqual(
      ModelFamilies.pickerModels(
        accepted: raw, capabilities: capabilities, acceptedIDs: Set(["solo"])
      ).map(\.id), ["solo"])
    XCTAssertTrue(
      ModelFamilies.pickerRepresents("duo-alpha-beta", capabilities: capabilities, acceptedIDs: Set(["solo", "duo-alpha-beta"])))
    XCTAssertFalse(
      ModelFamilies.pickerRepresents("duo-alpha-beta-hi", capabilities: capabilities, acceptedIDs: Set(["solo", "duo-alpha-beta"])))
  }

  // MARK: - Selector labels

  func testRecognizedLabelKeysMapToLocalizedAppLabels() {
    XCTAssertEqual(ModelFamilies.localizedSelectorLabel("modelSelection.lead"), "Lead")
    XCTAssertEqual(ModelFamilies.localizedSelectorLabel("modelSelection.sidekick"), "Sidekick")
    XCTAssertNil(ModelFamilies.localizedSelectorLabel("nope.missing"))
    XCTAssertNil(ModelFamilies.localizedSelectorLabel(""))
  }

  // MARK: - Patch application

  func testPatchApplicationTouchesOnlyCarriedAxes() {
    var configuration = config(model: "solo", effort: "low", fast: true)
    configuration.apply(
      ModelSelectionPatch(model: "duo-alpha-beta", effort: "", fast: false))
    XCTAssertEqual(configuration.model, "duo-alpha-beta")
    XCTAssertEqual(configuration.effort, "")
    XCTAssertEqual(configuration.fast, false)

    var retained = config(model: "pair-charlie-beta", effort: "low", fast: true)
    retained.apply(ModelSelectionPatch(model: "pair-echo-delta"))
    XCTAssertEqual(retained.effort, "low", "an absent patch axis leaves the carrier alone")
    XCTAssertEqual(retained.fast, true)
    XCTAssertEqual(retained.model, "pair-echo-delta")
  }

  // MARK: - JSON helpers

  private func duoFamilyObject() -> [String: JSONValue] {
    guard let object = duoFamily().objectValue else { fatalError("fixture must be an object") }
    return object
  }

  private func pairFamilyObject() -> [String: JSONValue] {
    guard let object = pairFamily().objectValue else { fatalError("fixture must be an object") }
    return object
  }

  private func cast(_ object: [String: JSONValue]) -> [String: JSONValue] { object }

  private func memberWithout(_ value: JSONValue, removing key: String) -> JSONValue {
    guard var object = value.objectValue else { return value }
    object.removeValue(forKey: key)
    return .object(object)
  }
}

extension Dictionary where Key == String, Value == JSONValue {
  fileprivate func adding(_ key: String, _ value: JSONValue) -> [String: JSONValue] {
    var copy = self
    copy[key] = value
    return copy
  }
}

extension JSONValue {
  fileprivate func withModel(_ model: String) -> JSONValue {
    guard var object = objectValue else { return self }
    object["model"] = .string(model)
    return .object(object)
  }
}
