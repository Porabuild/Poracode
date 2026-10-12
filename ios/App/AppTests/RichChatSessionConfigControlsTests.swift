import Foundation
import XCTest

@testable import App

/// Negotiated-first composer controls: the host's per-thread
/// `sessionConfigOptions` inventory overlays the static capability projection
/// only where the live session actually negotiated — the model menu replaces
/// the static accepted values, and the effort/context ladders of the model
/// descriptor's `currentValue` are authoritative, including an observed-empty
/// control (`[]`), while optimistically picked models keep the static
/// projection. Absent (older host), `null` (retired), empty, and malformed
/// inventories keep the exact static behavior; native mode ids never become
/// mode options, and the fast/thinking toggles gate on nonempty live selects
/// alone. Nothing is ever invented onto a control and no unanchored static
/// choice is dropped.
@MainActor
final class RichChatSessionConfigControlsTests: XCTestCase {
  private static let pairMedium = "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium"
  private static let pairHigh = "fusion-gpt-6-astra-high-sidekick-swe-2-high"

  override func setUp() {
    super.setUp()
    BoundedCatalogURLProtocol.reset()
  }

  override func tearDown() {
    BoundedCatalogURLProtocol.reset()
    super.tearDown()
  }

  // MARK: - The Fusion repro: 3-run static ladder → 5-run live ladder

  /// The live `thought_level` ladder replaces the bounded-probe 3-run static
  /// ladder while the session's current effort (`low`) stays put — the exact
  /// gap this lane exists for.
  func testLiveEffortLadderReplacesStaticThreeRungLadderAtTheSameCurrentEffort() throws {
    let catalog = try makeCatalog(
      configuration: ThreadConfig(model: Self.pairHigh, effort: "low"),
      sessionConfigOptions: .array([
        Self.model(currentValue: Self.pairHigh),
        Self.effort(currentValue: "low"),
      ])
    )

    XCTAssertEqual(
      catalog.effortOptions(for: Self.pairHigh).map(\.id),
      ["low", "medium", "high", "xhigh", "max"],
      "the full negotiated five-run ladder is offered, not the static three"
    )
    XCTAssertEqual(
      catalog.effortOptions(for: Self.pairHigh).map(\.label),
      ["Low", "Medium", "High", "XHigh", "Max"],
      "native labels win for named levels"
    )
    XCTAssertEqual(
      catalog.effortDefault(for: Self.pairHigh), "low",
      "the native current value is the truthful default"
    )
    XCTAssertTrue(
      catalog.effortOptions(for: Self.pairHigh).contains { $0.id == "low" },
      "the session's current effort stays selectable after the ladder widens"
    )
  }

  /// A natively unordered ladder reads weakest → strongest on the canonical
  /// alias mapping: provider spellings (`extra-high`) fold onto the shared
  /// ladder id the Desktop renderer and Android write into `ThreadConfig`,
  /// canonical duplicates deduplicate on first appearance, and unknown tiers
  /// trail in discovery order. The retained raw JSON keeps the native ids.
  func testLiveEffortLadderCanonicalizesAliasesAndDeduplicates() throws {
    let catalog = try makeCatalog(
      configuration: ThreadConfig(model: Self.pairHigh),
      sessionConfigOptions: .array([
        Self.model(currentValue: Self.pairHigh),
        Self.effort(currentValue: "low", values: ["xhigh", "extra-high", "low", "on", "medium"]),
      ])
    )

    XCTAssertEqual(
      catalog.effortOptions(for: Self.pairHigh).map(\.id),
      ["low", "medium", "xhigh", "on"],
      "aliases canonicalize (extra-high ~ xhigh, deduplicated), unknown tiers trail"
    )
    XCTAssertEqual(
      catalog.effortOptions(for: Self.pairHigh).map(\.label),
      ["Low", "Medium", "XHigh", "On"],
      "the first source value's native name labels the canonical id"
    )
  }

  /// The native current effort canonicalizes too: an aliased `currentValue`
  /// selects the shared ladder id, and a ladder advertising both spellings of
  /// the same tier offers one canonical option.
  func testAliasCurrentEffortValueCanonicalizesOntoTheSharedLadder() throws {
    let catalog = try makeCatalog(
      configuration: ThreadConfig(model: Self.pairHigh),
      sessionConfigOptions: .array([
        Self.model(currentValue: Self.pairHigh),
        Self.effort(currentValue: "extra-high", values: ["extra-high", "xhigh"]),
      ])
    )

    XCTAssertEqual(
      catalog.effortOptions(for: Self.pairHigh).map(\.id), ["xhigh"],
      "canonical aliases collapse into a single option"
    )
    XCTAssertEqual(
      catalog.effortOptions(for: Self.pairHigh).map(\.label), ["Extra High"],
      "the first source value's native name survives the fold"
    )
    XCTAssertEqual(
      catalog.effortDefault(for: Self.pairHigh), "xhigh",
      "the aliased native current value selects the canonical shared id"
    )
  }

  // MARK: - Optimistic model pick vs the native model descriptor

  /// Picking another model optimistically must not inherit the previous
  /// model's negotiated ladder: the static per-model projection stays in
  /// charge until the host's model descriptor reports the new model as the
  /// negotiated one.
  func testOptimisticModelPickUsesStaticLadderUntilTheNativeDescriptorReportsIt() throws {
    let catalog = try makeCatalog(
      configuration: ThreadConfig(model: Self.pairHigh, effort: "low"),
      capabilities: [
        "models": .array([
          .object(["id": .string("static-beta"), "label": .string("Static Beta")]),
          .object(["id": .string(Self.pairHigh), "label": .string("Fusion Pair")]),
        ]),
        "efforts": .array([.string("medium"), .string("high"), .string("max")]),
        "modelEfforts": .object([
          "static-beta": .array([.string("minimal"), .string("medium"), .string("max")])
        ]),
      ],
      sessionConfigOptions: .array([
        Self.model(currentValue: Self.pairHigh),
        Self.effort(currentValue: "low"),
      ])
    )

    // Before the pick: the live ladder serves the negotiated model.
    XCTAssertEqual(
      catalog.effortOptions(for: Self.pairHigh).map(\.id),
      ["low", "medium", "high", "xhigh", "max"]
    )
    // Optimistic pick: the previous model's ladder must not follow the new
    // model — the static per-model ladder serves it instead.
    var configuration = ThreadConfig(model: Self.pairHigh, effort: "low")
    catalog.applyModel("static-beta", to: &configuration)
    XCTAssertEqual(
      catalog.effortOptions(for: "static-beta").map(\.id),
      ["minimal", "medium", "max"],
      "an optimistically picked model keeps the static ladder"
    )
    XCTAssertNil(
      catalog.effortDefault(for: "static-beta"),
      "no native default is claimed for a model the session has not negotiated"
    )
    XCTAssertEqual(
      configuration.effort, nil,
      "the optimistic reset still runs on the static projection"
    )
    // The sheet rebuilds the catalog against the picked draft: the optimistic
    // pick is inserted so it stays selectable, without shadowing the live menu.
    let optimistic = try makeCatalog(
      configuration: ThreadConfig(model: "static-beta", effort: "low"),
      capabilities: [
        "models": .array([
          .object(["id": .string("static-beta"), "label": .string("Static Beta")]),
          .object(["id": .string(Self.pairHigh), "label": .string("Fusion Pair")]),
        ]),
        "efforts": .array([.string("medium"), .string("high"), .string("max")]),
        "modelEfforts": .object([
          "static-beta": .array([.string("minimal"), .string("medium"), .string("max")])
        ]),
      ],
      sessionConfigOptions: .array([
        Self.model(currentValue: Self.pairHigh),
        Self.effort(currentValue: "low"),
      ])
    )
    XCTAssertEqual(
      optimistic.models.map(\.id),
      ["static-beta", "adaptive", Self.pairMedium, Self.pairHigh]
    )

    // The host reports the new model negotiated: its own ladder takes over.
    let settled = try makeCatalog(
      configuration: ThreadConfig(model: "static-beta", effort: "low"),
      capabilities: [
        "models": .array([
          .object(["id": .string("static-beta"), "label": .string("Static Beta")])
        ]),
        "efforts": .array([.string("medium"), .string("high"), .string("max")]),
      ],
      sessionConfigOptions: .array([
        Self.model(currentValue: "static-beta"),
        Self.effort(currentValue: "low", values: ["low", "medium", "high", "xhigh", "max"]),
      ])
    )
    XCTAssertEqual(
      settled.effortOptions(for: "static-beta").map(\.id),
      ["low", "medium", "high", "xhigh", "max"],
      "once the descriptor reports the model, the live ladder serves it"
    )
  }

  /// Without a negotiated current model (no model descriptor, or one without
  /// a `currentValue`) there is no anchor, so live ladders never apply.
  func testLiveLaddersWithoutANegotiatedModelAnchorStayStatic() throws {
    let cases: [(String, JSONValue?)] = [
      ("no inventory", nil),
      ("effort descriptor without a model descriptor", .array([Self.effort(currentValue: "low")])),
      (
        "model descriptor without a currentValue",
        .array([Self.model(currentValue: nil), Self.effort(currentValue: "low")])
      ),
    ]
    for (label, inventory) in cases {
      let catalog = try makeCatalog(
        configuration: ThreadConfig(model: Self.pairHigh),
        sessionConfigOptions: inventory
      )
      XCTAssertEqual(
        catalog.effortOptions(for: Self.pairHigh).map(\.id),
        ["medium", "high", "max"],
        "\(label) keeps the static ladder"
      )
      XCTAssertNil(catalog.effortDefault(for: Self.pairHigh), label)
    }
  }

  // MARK: - Live model menu: exact ids, labels, groups, pairs

  func testLiveModelMenuReplacesStaticValuesWithExactGroupsAndPairs() throws {
    let catalog = try makeCatalog(
      configuration: ThreadConfig(model: "adaptive"),
      capabilities: [
        "models": .array([
          .object(["id": .string("stale-probe-a"), "label": .string("Stale A")]),
          .object(["id": .string("stale-probe-b"), "label": .string("Stale B")]),
        ])
      ],
      sessionConfigOptions: .array([Self.groupedModelMenu()])
    )

    XCTAssertEqual(
      catalog.modelSections(),
      [
        .init(groupID: nil, heading: nil, options: [.init(id: "adaptive", label: "Adaptive")]),
        .init(
          groupID: "fusion", heading: "Fusion",
          options: [
            .init(id: Self.pairMedium, label: "Fusion (Fable 5.1 Medium + SWE-2 Medium)"),
            .init(id: Self.pairHigh, label: "Fusion (GPT-6 Astra High + SWE-2 High)"),
          ]
        ),
      ],
      "the live menu projects exact ids, exact native labels, and exact declared groups"
    )
    XCTAssertEqual(
      catalog.modelSections().flatMap(\.options).map(\.id),
      catalog.models.map(\.id),
      "the live menu is a pure re-projection: no choice lost, duplicated, or reordered"
    )
  }

  func testLiveModelMenuGrouplessValueGainsAFirstSeenHumanizedHeading() throws {
    var menu = Self.groupedModelMenu()
    menu = .object([
      "type": .string("select"),
      "id": .string("model"),
      "role": .string("model"),
      "currentValue": .string(Self.pairHigh),
      "values": .array([
        .object(["value": .string("adaptive"), "name": .string("Adaptive")]),
        .object([
          "value": .string(Self.pairMedium), "name": .string("Fusion (Fable 5.1 Medium + SWE-2 Medium)"),
          "group": .string("fusion"),
        ]),
        .object([
          "value": .string(Self.pairHigh), "name": .string("Fusion (GPT-6 Astra High + SWE-2 High)"),
          "group": .string("undeclared"),
        ]),
      ]),
      "groups": .array([.object(["id": .string("fusion"), "name": .string("Fusion")])]),
    ])
    let catalog = try makeCatalog(
      configuration: ThreadConfig(model: "adaptive"),
      sessionConfigOptions: .array([menu])
    )

    XCTAssertEqual(
      catalog.modelSections().first { $0.groupID == "undeclared" }?.heading, "Undeclared",
      "an undeclared membership target keeps its first-seen humanized heading"
    )
  }

  // MARK: - Old hosts, retired inventories, empty and malformed payloads

  /// Absence (older host), explicit `null` (retired inventory), `[]` (active
  /// but empty session), and a non-array payload all keep the exact static
  /// projection — no stale ladder, no invented blank.
  func testAbsentRetiredEmptyAndMalformedInventoriesKeepExactStaticBehavior() throws {
    let staticCatalog = try makeCatalog(
      configuration: ThreadConfig(model: "adaptive", effort: "medium")
    )

    for inventory in [
      JSONValue?.none, .null, .array([]),
      .object(["unexpected": .bool(true)]),
    ] {
      let catalog = try makeCatalog(
        configuration: ThreadConfig(model: "adaptive", effort: "medium"),
        sessionConfigOptions: inventory
      )
      XCTAssertEqual(catalog.models.map(\.id), staticCatalog.models.map(\.id), "\(inventory)")
      XCTAssertEqual(catalog.models.map(\.label), staticCatalog.models.map(\.label), "\(inventory)")
      XCTAssertEqual(
        catalog.effortOptions(for: "adaptive").map(\.id),
        staticCatalog.effortOptions(for: "adaptive").map(\.id), "\(inventory)"
      )
      XCTAssertEqual(catalog.modelSections(), staticCatalog.modelSections(), "\(inventory)")
      XCTAssertEqual(
        catalog.modeOptions(for: "adaptive").map(\.id),
        staticCatalog.modeOptions(for: "adaptive").map(\.id), "\(inventory)"
      )
      XCTAssertEqual(
        catalog.contextOptions(for: "adaptive").map(\.id),
        staticCatalog.contextOptions(for: "adaptive").map(\.id), "\(inventory)"
      )
      XCTAssertNil(catalog.effortDefault(for: "adaptive"), "\(inventory)")
    }
  }

  /// Once the session anchors a native current model, its effort control is
  /// authoritative: an observed-empty value list and a missing effort selector
  /// both project an empty ladder (`[]`) for that model — never the static
  /// ladder the bounded probe recorded. The live model menu still applies.
  func testEmptyValuedEffortControlIsAuthoritativeEmptyForTheNativeModel() throws {
    for (label, inventory) in [
      ("empty effort values", [Self.model(currentValue: Self.pairHigh), Self.effort(currentValue: nil, values: [])]),
      ("no effort selector", [Self.model(currentValue: Self.pairHigh)]),
    ] {
      let catalog = try makeCatalog(
        configuration: ThreadConfig(model: Self.pairHigh, effort: "medium"),
        sessionConfigOptions: .array(inventory)
      )
      XCTAssertEqual(
        catalog.effortOptions(for: Self.pairHigh).map(\.id), [],
        "\(label): the native model's ladder is authoritative, even when empty"
      )
      XCTAssertNil(
        catalog.effortDefault(for: Self.pairHigh), "\(label): no default is claimed"
      )
      XCTAssertTrue(
        catalog.models.map(\.id).contains(Self.pairHigh),
        "\(label): the live model menu itself still applies"
      )
    }
  }

  /// An observed-empty model select is still the live menu — the static model
  /// list drops, the currently configured model is inserted for display, and
  /// duplicate advertised values deduplicate on first appearance.
  func testEmptyValuedModelSelectRemainsObservedWithConfiguredModelInserted() throws {
    let menu = Self.model(
      currentValue: Self.pairHigh,
      values: [
        ["value": "adaptive", "name": "Adaptive"],
        ["value": "adaptive", "name": "Adaptive, again"],
      ]
    )
    let catalog = try makeCatalog(
      configuration: ThreadConfig(model: Self.pairHigh),
      sessionConfigOptions: .array([menu])
    )
    XCTAssertEqual(
      catalog.models.map(\.id), [Self.pairHigh, "adaptive"],
      "the configured model leads for display, duplicates deduplicate, nothing static leaks"
    )

    let emptied = try makeCatalog(
      configuration: ThreadConfig(model: Self.pairHigh),
      sessionConfigOptions: .array([
        Self.model(currentValue: Self.pairHigh, values: [])
      ])
    )
    XCTAssertEqual(
      emptied.models.map(\.id), [Self.pairHigh],
      "an observed-empty model select stays the live menu with only the configured model"
    )
  }

  /// Booleans, unsupported shapes, untagged selects, unknown roles, and
  /// malformed entries are inventory only — nothing maps onto a control and
  /// no static choice is dropped.
  func testUnsupportedAndUnrecognizedInventoryNeverMapsOntoControls() throws {
    let catalog = try makeCatalog(
      configuration: ThreadConfig(model: "adaptive"),
      capabilities: [
        "models": .array([.object(["id": .string("adaptive"), "label": .string("Adaptive")])]),
        "efforts": .array([.string("medium"), .string("high"), .string("max")]),
        "modes": .array([.string("agent"), .string("plan")]),
        "contextSizes": .array([.string("128k")]),
        "fastModels": .array([.string("adaptive")]),
        "thinkingModels": .array([.string("adaptive")]),
      ],
      sessionConfigOptions: .array([
        .string("not-an-object"),
        .object(["type": .string("select"), "values": .array([])]),
        .object(["type": .string("file"), "id": .string("attachment"), "role": .string("model")]),
        .object([
          "type": .string("boolean"), "id": .string("fast"),
          "role": .string("fast"), "currentValue": .bool(true),
        ]),
        .object([
          "type": .string("select"), "id": .string("thinking"),
          "role": .string("thinking"),
          "values": .array([.object(["value": .string("on")])]),
        ]),
        .object([
          "type": .string("select"), "id": .string("language"),
          "values": .array([.object(["value": .string("en")])]),
        ]),
        .object([
          "type": .string("select"), "id": .string("temperature"),
          "role": .string("temperature"),
          "values": .array([.object(["value": .string("0.7")])]),
        ]),
      ])
    )

    XCTAssertEqual(catalog.models.map(\.id), ["adaptive"])
    XCTAssertEqual(catalog.effortOptions(for: "adaptive").map(\.id), ["medium", "high", "max"])
    XCTAssertEqual(catalog.modeOptions(for: "adaptive").map(\.id), ["agent", "plan"])
    XCTAssertEqual(catalog.contextOptions(for: "adaptive").map(\.id), ["128k"])
    XCTAssertTrue(catalog.supportsFast("adaptive"))
    XCTAssertTrue(catalog.supportsThinking("adaptive"))
  }

  /// Live `mode`-role selects never project onto the mode picker: native mode
  /// ids (`smart`, `bypass`, `ask`) are the agent's approval choices, not the
  /// app's `ThreadConfig.mode` enum, and dispatching them would write invalid
  /// controls. The static mode options stay for every model. The live context
  /// select keeps its faithful overlay, scoped to the negotiated model.
  func testNativeModeIDsNeverBecomeModeOptionsWhileContextOverlaysTheNegotiatedModel() throws {
    let inventory: JSONValue = .array([
      Self.model(currentValue: Self.pairHigh),
      .object([
        "type": .string("select"), "id": .string("mode"), "role": .string("mode"),
        "currentValue": .string("bypass"),
        "values": .array([
          .object(["value": .string("smart"), "name": .string("Smart")]),
          .object(["value": .string("bypass"), "name": .string("Bypass")]),
          .object(["value": .string("plan"), "name": .string("Plan")]),
        ]),
        "groups": .array([]),
      ]),
      .object([
        "type": .string("select"), "id": .string("context"), "role": .string("context"),
        "currentValue": .string("200k"),
        "values": .array([
          .object(["value": .string("200k")]),
          .object(["value": .string("1m")]),
        ]),
        "groups": .array([]),
      ]),
    ])
    let catalog = try makeCatalog(
      configuration: ThreadConfig(model: Self.pairHigh),
      sessionConfigOptions: inventory
    )

    for modelID in [Self.pairHigh, "adaptive"] {
      XCTAssertEqual(
        catalog.modeOptions(for: modelID).map(\.id), ["agent", "plan"],
        "static app mode options serve \(modelID); no native approval id may leak"
      )
    }
    XCTAssertFalse(
      catalog.modeOptions(for: Self.pairHigh).map(\.id)
        .contains { ["smart", "bypass"].contains($0) },
      "native approval-choice ids are invalid ThreadConfig.mode values"
    )
    XCTAssertEqual(catalog.contextOptions(for: Self.pairHigh).map(\.id), ["200k", "1m"])
    // Foreign model: static context projection.
    XCTAssertEqual(catalog.contextOptions(for: "adaptive").map(\.id), ["64k", "128k"])
    // An observed-empty context select is authoritative for the anchored model.
    let emptied = try makeCatalog(
      configuration: ThreadConfig(model: Self.pairHigh),
      sessionConfigOptions: .array([
        Self.model(currentValue: Self.pairHigh),
        .object([
          "type": .string("select"), "id": .string("context"), "role": .string("context"),
          "values": .array([]),
          "groups": .array([]),
        ]),
      ])
    )
    XCTAssertEqual(
      emptied.contextOptions(for: Self.pairHigh).map(\.id), [],
      "an observed-empty context select replaces the static projection"
    )
  }

  /// The first-class fast/thinking toggles gate on the presence of a nonempty
  /// live select for the negotiated model — and only a select: boolean and
  /// unsupported role shapes never grant the gate, a missing role clears it
  /// (the static capability list is authoritative again for every other
  /// model), and the toggle state itself is never inferred from native ids.
  func testFastThinkingGatesFollowNonemptySelectsOnTheNativeModel() throws {
    let staticModels: JSONValue = .array([
      .object(["id": .string("adaptive"), "label": .string("Adaptive")])
    ])
    let staticEfforts: JSONValue = .array([.string("medium"), .string("high"), .string("max")])
    let base: [String: JSONValue] = [
      "models": staticModels,
      "efforts": staticEfforts,
      "modes": .array([.string("agent"), .string("plan")]),
      "fastModels": .array([.string(Self.pairHigh), .string("adaptive")]),
      "thinkingModels": .array([.string(Self.pairHigh)]),
    ]
    func catalog(
      _ extras: [JSONValue],
      capabilities: [String: JSONValue]
    ) throws -> RichChatComposerControlCatalog {
      try makeCatalog(
        configuration: ThreadConfig(model: Self.pairHigh),
        capabilities: capabilities,
        sessionConfigOptions: .array([Self.model(currentValue: Self.pairHigh)] + extras)
      )
    }
    let fastSelect: JSONValue = .object([
      "type": .string("select"), "id": .string("fast"), "role": .string("fast"),
      "currentValue": .string("on"),
      "values": .array([.object(["value": .string("on")]), .object(["value": .string("off")])]),
      "groups": .array([]),
    ])
    let emptyFastSelect: JSONValue = .object([
      "type": .string("select"), "id": .string("fast"), "role": .string("fast"),
      "values": .array([]),
      "groups": .array([]),
    ])
    let fastBoolean: JSONValue = .object([
      "type": .string("boolean"), "id": .string("fast"),
      "role": .string("fast"), "currentValue": .bool(true),
    ])
    let thinkingSelect: JSONValue = .object([
      "type": .string("select"), "id": .string("thinking"), "role": .string("thinking"),
      "values": .array([.object(["value": .string("on")])]),
      "groups": .array([]),
    ])
    let bare: [String: JSONValue] = ["models": staticModels, "efforts": staticEfforts]

    // A nonempty fast select grants the gate; the thinking boolean does not.
    let granted = try catalog([fastSelect, fastBoolean], capabilities: base)
    XCTAssertTrue(granted.supportsFast(Self.pairHigh))
    XCTAssertFalse(
      granted.supportsThinking(Self.pairHigh),
      "a boolean role shape never grants the toggle gate"
    )
    // A nonempty thinking select grants a gate the static list lacks.
    let thinking = try catalog([thinkingSelect], capabilities: bare)
    XCTAssertTrue(thinking.supportsThinking(Self.pairHigh))
    // A missing role and an observed-empty select both clear the anchored
    // model's gate, even though the static list still lists the model.
    XCTAssertFalse(
      try catalog([], capabilities: base).supportsFast(Self.pairHigh),
      "a missing role clears the native model's toggle gate"
    )
    XCTAssertFalse(try catalog([emptyFastSelect], capabilities: base).supportsFast(Self.pairHigh))
    // Pending other models keep the static capability projection.
    let pending = try catalog([fastSelect], capabilities: base)
    XCTAssertTrue(pending.supportsFast("adaptive"), "static gate survives for other models")
    XCTAssertFalse(pending.supportsThinking("adaptive"))
  }

  // MARK: - Retain / retire / replace on the thread row

  /// The live row merge honors the tri-state contract: absent leaves the
  /// retained inventory alone, `null` retires it, an array (including empty)
  /// replaces it, and the thread exit drops it with the retiring session.
  func testThreadStateInventoryRetainsReplacesAndRetires() async throws {
    let fixture = BoundedCatalogHostFixture()
    let harness = try await BoundedCatalogSessionHarness.make(
      fixture: fixture,
      threadCount: 2,
      projectCount: 1,
      configurePolicy: policy()
    )
    await harness.waitUntil("threads converge", timeout: 10) {
      harness.session.snapshot?.threads.count == 2
    }

    func state(_ seq: Int, extra: [String: JSONValue]) {
      harness.session.handleServerMessageForTests(
        .event(
          seq: seq,
          event: .object(
            [
              "type": .string("thread-state"),
              "threadId": .string("t00000"),
              "status": .string("idle"),
              "attention": .string("idle"),
              "canResumeWithConfig": .bool(true),
            ].merging(extra) { _, new in new }
          )
        )
      )
    }

    // Arrive.
    state(10, extra: ["sessionConfigOptions": .array([Self.effort(currentValue: "low")])])
    XCTAssertEqual(
      harness.session.snapshot?.threads.first { $0.id == "t00000" }?.sessionConfigOptions,
      .array([Self.effort(currentValue: "low")])
    )
    // Older-host frame without the field: retained.
    state(11, extra: [:])
    XCTAssertEqual(
      harness.session.snapshot?.threads.first { $0.id == "t00000" }?.sessionConfigOptions,
      .array([Self.effort(currentValue: "low")])
    )
    // Explicit null: retired.
    state(12, extra: ["sessionConfigOptions": .null])
    XCTAssertNil(
      harness.session.snapshot?.threads.first { $0.id == "t00000" }?.sessionConfigOptions
    )
    // Active-but-empty session: replaced, a stale ladder never survives it.
    state(13, extra: ["sessionConfigOptions": .array([])])
    XCTAssertEqual(
      harness.session.snapshot?.threads.first { $0.id == "t00000" }?.sessionConfigOptions,
      .array([])
    )

    // The session incarnation retires: the inventory drops with it.
    harness.session.handleServerMessageForTests(
      .event(seq: 14, event: .object([
        "type": .string("thread-exited"),
        "threadId": .string("t00000"),
        "exitCode": .null,
      ]))
    )
    XCTAssertNil(
      harness.session.snapshot?.threads.first { $0.id == "t00000" }?.sessionConfigOptions,
      "a retired owner's inventory cannot keep driving the composer"
    )
  }

  /// A provider-straggler frame for a different agent kind can never replace
  /// the surviving session's inventory — the existing owner guard, locked for
  /// this field.
  func testForeignProviderFrameCannotReplaceInventory() async throws {
    let fixture = BoundedCatalogHostFixture()
    let harness = try await BoundedCatalogSessionHarness.make(
      fixture: fixture,
      threadCount: 1,
      projectCount: 1,
      configurePolicy: policy()
    )
    await harness.waitUntil("threads converge", timeout: 10) {
      harness.session.snapshot?.threads.count == 1
    }

    harness.session.handleServerMessageForTests(
      .event(
        seq: 20,
        event: .object([
          "type": .string("thread-state"),
          "threadId": .string("t00000"),
          "status": .string("idle"),
          "attention": .string("idle"),
          "canResumeWithConfig": .bool(true),
          "sessionConfigOptions": .array([Self.effort(currentValue: "low")]),
        ])
      )
    )
    XCTAssertEqual(
      harness.session.snapshot?.threads.first { $0.id == "t00000" }?.sessionConfigOptions,
      .array([Self.effort(currentValue: "low")])
    )

    harness.session.handleServerMessageForTests(
      .event(
        seq: 21,
        event: .object([
          "type": .string("thread-state"),
          "threadId": .string("t00000"),
          "agentKind": .string("other-provider"),
          "status": .string("idle"),
          "attention": .string("idle"),
          "canResumeWithConfig": .bool(true),
          "sessionConfigOptions": .null,
        ])
      )
    )
    XCTAssertEqual(
      harness.session.snapshot?.threads.first { $0.id == "t00000" }?.sessionConfigOptions,
      .array([Self.effort(currentValue: "low")]),
      "a straggler frame from another provider cannot retire the live inventory"
    )
  }

  /// The row carries the inventory through a REST snapshot decode too.
  func testRemoteThreadDecodesTheInventoryVerbatim() throws {
    let payload: [String: Any] = [
      "id": "thread-1",
      "projectId": "project-1",
      "title": "Thread",
      "agentKind": "provider",
      "config": ["model": "model-a"],
      "status": "idle",
      "attention": "none",
      "createdAt": "2026-08-22T00:00:00Z",
      "updatedAt": "2026-08-22T00:00:00Z",
      "sessionConfigOptions": [
        [
          "type": "select",
          "id": "thought_level",
          "role": "effort",
          "currentValue": "low",
          "values": [["value": "low", "name": "Low"], ["value": "max", "name": "Max"]],
          "groups": [],
        ]
      ],
    ]
    let thread = try JSONDecoder().decode(RemoteThread.self, from: JSONSerialization.data(withJSONObject: payload))
    XCTAssertEqual(
      thread.sessionConfigOptions,
      .array([
        .object([
          "type": .string("select"),
          "id": .string("thought_level"),
          "role": .string("effort"),
          "currentValue": .string("low"),
          "values": .array([
            .object(["value": .string("low"), "name": .string("Low")]),
            .object(["value": .string("max"), "name": .string("Max")]),
          ]),
          "groups": .array([]),
        ])
      ])
    )
    // Absent on older hosts: decodes to nil without rejecting the row.
    var older = payload
    older.removeValue(forKey: "sessionConfigOptions")
    let legacy = try JSONDecoder().decode(
      RemoteThread.self, from: JSONSerialization.data(withJSONObject: older)
    )
    XCTAssertNil(legacy.sessionConfigOptions)
  }

  // MARK: - Fixtures

  private func policy() -> (BoundedCatalogPolicy) -> BoundedCatalogPolicy {
    { policy in
      var next = policy
      next.drainDebounceMs = 1
      next.periodicReconcileEnabled = false
      return next
    }
  }

  /// Static "Adaptive 3" world: the bounded probe saw only Medium/High/Max for
  /// the unprobed Fusion pair.
  private func makeCatalog(
    configuration: ThreadConfig,
    capabilities: [String: JSONValue]? = nil,
    sessionConfigOptions: JSONValue? = nil
  ) throws -> RichChatComposerControlCatalog {
    let resolved: [String: JSONValue] = capabilities ?? [
      "models": .array([
        .object(["id": .string("adaptive"), "label": .string("Adaptive")]),
        .object([
          "id": .string(Self.pairMedium),
          "label": .string("Fusion (Fable 5.1 Medium + SWE-2 Medium)"),
        ]),
        .object([
          "id": .string(Self.pairHigh),
          "label": .string("Fusion (GPT-6 Astra High + SWE-2 High)"),
        ]),
      ]),
      "efforts": .array([.string("medium"), .string("high"), .string("max")]),
      "modes": .array([.string("agent"), .string("plan")]),
      "contextSizes": .array([.string("64k"), .string("128k")]),
    ]
    return RichChatComposerControlCatalog(
      agentStatus: try AgentStatusRecord(
        wire: .object([
          "kind": .string("provider"),
          "label": .string("Provider"),
          "installed": .bool(true),
          "authState": .string("authenticated"),
          "capabilities": .object(resolved),
        ])
      ),
      presentationMode: .gui,
      configuration: configuration,
      sessionConfigOptions: sessionConfigOptions
    )
  }

  /// The live model descriptor for the Fusion receipt: ungrouped Adaptive plus
  /// the two Fusion composite pairs under a declared group.
  private static func groupedModelMenu() -> JSONValue {
    .object([
      "type": .string("select"),
      "id": .string("model"),
      "role": .string("model"),
      "currentValue": .string(pairHigh),
      "values": .array([
        .object(["value": .string("adaptive"), "name": .string("Adaptive")]),
        .object([
          "value": .string(pairMedium),
          "name": .string("Fusion (Fable 5.1 Medium + SWE-2 Medium)"),
          "group": .string("fusion"),
        ]),
        .object([
          "value": .string(pairHigh),
          "name": .string("Fusion (GPT-6 Astra High + SWE-2 High)"),
          "group": .string("fusion"),
        ]),
      ]),
      "groups": .array([.object(["id": .string("fusion"), "name": .string("Fusion")])]),
    ])
  }

  private static func model(currentValue: String?) -> JSONValue {
    var object: [String: JSONValue] = [
      "type": .string("select"),
      "id": .string("model"),
      "role": .string("model"),
      "values": .array([
        .object(["value": .string("adaptive"), "name": .string("Adaptive")]),
        .object(["value": .string(pairMedium), "name": .string("Fusion (…Medium)")]),
        .object(["value": .string(pairHigh), "name": .string("Fusion (…High)")]),
      ]),
      "groups": .array([.object(["id": .string("fusion"), "name": .string("Fusion")])]),
    ]
    if let currentValue { object["currentValue"] = .string(currentValue) }
    return .object(object)
  }

  /// A model descriptor with hand-written values (and no declared groups).
  private static func model(currentValue: String?, values: [[String: String]]) -> JSONValue {
    var object: [String: JSONValue] = [
      "type": .string("select"),
      "id": .string("model"),
      "role": .string("model"),
      "values": .array(values.map { .object($0.mapValues { .string($0) }) }),
      "groups": .array([]),
    ]
    if let currentValue { object["currentValue"] = .string(currentValue) }
    return .object(object)
  }

  private static func effort(
    currentValue: String?,
    values: [String] = ["low", "medium", "high", "xhigh", "max"]
  ) -> JSONValue {
    var object: [String: JSONValue] = [
      "type": .string("select"),
      "id": .string("thought_level"),
      "role": .string("effort"),
      "values": .array(values.map { value in
        .object(["value": .string(value), "name": .string(Self.effortName(value))])
      }),
      "groups": .array([]),
    ]
    if let currentValue { object["currentValue"] = .string(currentValue) }
    return .object(object)
  }

  /// Native names exactly as the live receipt advertises them.
  private static func effortName(_ value: String) -> String {
    switch value {
    case "extra-high": return "Extra High"
    case "on": return "On"
    case "xhigh": return "XHigh"
    default:
      return value.prefix(1).uppercased() + value.dropFirst()
    }
  }
}
