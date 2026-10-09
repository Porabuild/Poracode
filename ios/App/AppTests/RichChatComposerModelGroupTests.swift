import Foundation
import XCTest

@testable import App

/// Group projection and selection identity for the shared rich-chat model
/// chooser. Locks the negotiated `subProviders`/`modelSubProvider` capability
/// fields to ordered chooser sections — ungrouped models first, declared
/// sections in advertised order, redundant singleton headings collapsed — and
/// keeps every choice selectable under its exact advertised id.
final class RichChatComposerModelGroupTests: XCTestCase {
  func testGroupedCapabilityProjectsOrderedSectionsWithExactSelectionIDs() throws {
    let catalog = try makeCatalog(
      models: [
        ("m-plain", "Plain"),
        ("m-one", "One"),
        ("m-two-a", "Two A"),
        ("m-two-b", "Two B"),
      ],
      subProviders: [
        ("group-one", "Group One"),
        ("group-two", "Group Two"),
      ],
      membership: ["m-one": "group-one", "m-two-a": "group-two", "m-two-b": "group-two"]
    )

    XCTAssertEqual(catalog.modelSections(), [
      .init(groupID: nil, heading: nil, options: [.init(id: "m-plain", label: "Plain")]),
      .init(
        groupID: "group-one", heading: "Group One",
        options: [.init(id: "m-one", label: "One")]),
      .init(
        groupID: "group-two", heading: "Group Two",
        options: [.init(id: "m-two-a", label: "Two A"), .init(id: "m-two-b", label: "Two B")]),
    ])
    // Sectioning is a pure re-projection of the advertised list: no choice is
    // lost, duplicated, or reordered, so every row keeps its exact id.
    XCTAssertEqual(catalog.modelSections().flatMap(\.options), catalog.models)
  }

  func testFlatCapabilityProjectsOneUnheadedRunExactlyAsAdvertised() throws {
    let catalog = try makeCatalog(
      models: [("m-b", "B"), ("m-a", "A")],
      subProviders: [],
      membership: [:]
    )

    XCTAssertEqual(catalog.modelSections(), [
      .init(
        groupID: nil, heading: nil,
        options: [.init(id: "m-b", label: "B"), .init(id: "m-a", label: "A")])
    ])
  }

  func testSingletonSectionCollapsesOnlyWhenItsHeadingRepeatsTheModelLabel() throws {
    let catalog = try makeCatalog(
      models: [("m-same", "Fable 5.1"), ("m-case", "Fable 5.1"), ("m-other", "Pro One")],
      subProviders: [
        ("same", "Fable 5.1"),
        ("case", "FABLE 5.1"),
        ("other", "One"),
      ],
      membership: ["m-same": "same", "m-case": "case", "m-other": "other"]
    )

    XCTAssertEqual(
      catalog.modelSections().first { $0.groupID == "same" }?.heading, nil,
      "a lone model whose label equals the heading renders without it")
    XCTAssertEqual(
      catalog.modelSections().first { $0.groupID == "case" }?.heading, nil,
      "heading collapse compares labels case-insensitively")
    XCTAssertEqual(
      catalog.modelSections().first { $0.groupID == "other" }?.heading, "One",
      "a lone model with a distinct label keeps its heading")
  }

  func testMultiModelSectionKeepsItsHeadingEvenWhenAMemberRepeatsIt() throws {
    let catalog = try makeCatalog(
      models: [("m-led", "Group One"), ("m-tail", "Other"), ("m-x", "X")],
      subProviders: [
        ("g", "Group One"),
        ("solo", "X"),
      ],
      membership: ["m-led": "g", "m-tail": "g", "m-x": "solo"]
    )

    XCTAssertEqual(
      catalog.modelSections().first { $0.groupID == "g" }?.heading, "Group One",
      "headings only collapse for sections with exactly one visible model")
  }

  func testSearchNarrowsVisibleRunsAndReEvaluatesSingletonHeadings() throws {
    let catalog = try makeCatalog(
      models: [
        ("m-plain", "Plain"),
        ("m-led", "Group One"),
        ("m-tail", "Other"),
      ],
      subProviders: [("g", "Group One")],
      membership: ["m-led": "g", "m-tail": "g"]
    )

    // Both members visible: the heading stays.
    XCTAssertEqual(catalog.modelSections(matching: ""), [
      .init(groupID: nil, heading: nil, options: [.init(id: "m-plain", label: "Plain")]),
      .init(
        groupID: "g", heading: "Group One",
        options: [.init(id: "m-led", label: "Group One"), .init(id: "m-tail", label: "Other")]),
    ])
    // Narrowed to the one member whose label repeats the heading: the heading
    // collapses against the visible set, and the choice itself never leaves.
    XCTAssertEqual(catalog.modelSections(matching: "group one"), [
      .init(groupID: "g", heading: nil, options: [.init(id: "m-led", label: "Group One")])
    ])
    // Search matching only ungrouped models drops the empty section entirely.
    XCTAssertEqual(catalog.modelSections(matching: "plain"), [
      .init(groupID: nil, heading: nil, options: [.init(id: "m-plain", label: "Plain")])
    ])
    XCTAssertEqual(
      catalog.modelSections(matching: "group one").flatMap(\.options).map(\.id),
      catalog.models.map(\.id).filter { $0 == "m-led" },
      "the visible projection preserves advertised order")
  }

  func testUnknownBlankAndUnadvertisedGroupMembershipNeverHidesModels() throws {
    let catalog = try makeCatalog(
      models: [("m-ghost", "Ghost"), ("m-blank", "Blank"), ("m-free", "Free")],
      subProviders: [
        ("  ", "Whitespace"),
        ("empty", "Empty"),
        ("ghost", "Renamed"),
        ("ghost", "Second"),
      ],
      membership: [
        "m-ghost": "undeclared",
        "m-blank": "   ",
        "stale-model": "empty",
      ]
    )

    XCTAssertEqual(catalog.modelSections(), [
      .init(
        groupID: nil, heading: nil,
        options: [.init(id: "m-blank", label: "Blank"), .init(id: "m-free", label: "Free")]),
      .init(
        groupID: "undeclared", heading: "Undeclared",
        options: [.init(id: "m-ghost", label: "Ghost")]),
    ])
  }

  func testDuplicateDeclaredSectionKeepsFirstLabelAndAdvertisedMemberOrder() throws {
    let catalog = try makeCatalog(
      models: [("m-z", "Zed"), ("m-a", "Ay")],
      subProviders: [
        ("g", "First"),
        ("g", "Second"),
      ],
      membership: ["m-z": "g", "m-a": "g"]
    )

    XCTAssertEqual(catalog.modelSections(), [
      .init(
        groupID: "g", heading: "First",
        options: [.init(id: "m-z", label: "Zed"), .init(id: "m-a", label: "Ay")])
    ])
  }

  func testFusionCompositePairKeepsExactIDsAndNeverDecomposes() throws {
    let pairMedium = "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium"
    let pairHigh = "fusion-claude-fable-5-1-medium-sidekick-swe-2-high"
    let catalog = try makeCatalog(
      models: [
        ("adaptive", "Adaptive"),
        (pairMedium, "Fusion (Claude Fable 5.1 Medium + SWE-2 Medium)"),
        (pairHigh, "Fusion (Claude Fable 5.1 Medium + SWE-2 High)"),
      ],
      subProviders: [("fusion", "Fusion")],
      membership: [pairMedium: "fusion", pairHigh: "fusion"]
    )

    XCTAssertEqual(catalog.modelSections(), [
      .init(groupID: nil, heading: nil, options: [.init(id: "adaptive", label: "Adaptive")]),
      .init(
        groupID: "fusion", heading: "Fusion",
        options: [
          .init(id: pairMedium, label: "Fusion (Claude Fable 5.1 Medium + SWE-2 Medium)"),
          .init(id: pairHigh, label: "Fusion (Claude Fable 5.1 Medium + SWE-2 High)"),
        ])
    ])

    // Picking a pair keeps the exact composite id end to end — no effort or
    // thinking decomposition of a Fusion entry.
    var configuration = ThreadConfig(model: "adaptive", effort: "high", thinking: true)
    catalog.applyModel(pairHigh, to: &configuration)
    XCTAssertEqual(configuration.model, pairHigh)
    XCTAssertEqual(configuration.thinking, false)
  }

  func testUnmappedCompositeIDsStayUngrouped() throws {
    let catalog = try makeCatalog(
      models: [("fusion-a-b", "Fusion (A + B)"), ("vendor/x", "X")],
      subProviders: [],
      membership: [:]
    )

    XCTAssertEqual(catalog.modelSections().first { $0.groupID == nil }?.options, [
      .init(id: "fusion-a-b", label: "Fusion (A + B)")
    ])
    // The shape-based fallback splits only `/`- or `:`-separated ids.
    XCTAssertEqual(
      catalog.modelSections().first { $0.groupID == "vendor" }?.heading, "Vendor")
  }

  /// Scaled-down shape of the live grouped receipt (54 groups / 123 models):
  /// single-model families advertise a section whose heading equals the model
  /// label, so the chooser renders them as plain rows and only genuinely
  /// multi-model families get headings.
  func testLiveGroupedReceiptShapeRendersHeadingsAndCollapsesSingletons() throws {
    let pairMedium = "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium"
    let pairHigh = "fusion-claude-fable-5-1-medium-sidekick-swe-2-high"
    let catalog = try makeCatalog(
      models: [
        ("adaptive", "Adaptive"),
        ("swe-2-high", "SWE-2"),
        (pairMedium, "Fusion (Claude Fable 5.1 Medium + SWE-2 Medium)"),
        (pairHigh, "Fusion (Claude Fable 5.1 Medium + SWE-2 High)"),
        ("glm-5-3-flash", "GLM-5.3 Flash"),
      ],
      subProviders: [
        ("Adaptive", "Adaptive"),
        ("swe-2", "SWE-2"),
        ("fusion", "Fusion"),
        ("glm-5-3-flash", "GLM-5.3 Flash"),
      ],
      membership: [
        "adaptive": "Adaptive",
        "swe-2-high": "swe-2",
        pairMedium: "fusion",
        pairHigh: "fusion",
        "glm-5-3-flash": "glm-5-3-flash",
      ]
    )

    XCTAssertEqual(catalog.modelSections(), [
      .init(
        groupID: "Adaptive", heading: nil,
        options: [.init(id: "adaptive", label: "Adaptive")]),
      .init(groupID: "swe-2", heading: nil, options: [.init(id: "swe-2-high", label: "SWE-2")]),
      .init(
        groupID: "fusion", heading: "Fusion",
        options: [
          .init(id: pairMedium, label: "Fusion (Claude Fable 5.1 Medium + SWE-2 Medium)"),
          .init(id: pairHigh, label: "Fusion (Claude Fable 5.1 Medium + SWE-2 High)"),
        ]),
      .init(
        groupID: "glm-5-3-flash", heading: nil,
        options: [.init(id: "glm-5-3-flash", label: "GLM-5.3 Flash")]),
    ])
  }

  func testControlsSheetRendersProjectedSectionsWithProviderHeadings() throws {
    let source = try Self.source("App/Features/RichChat/UI/RichChatComposerConfiguration.swift")
    XCTAssertTrue(source.contains("catalog.modelSections()"))
    XCTAssertTrue(source.contains("Section(header: Text(heading))"))
  }

  private func makeCatalog(
    models: [(id: String, label: String)],
    subProviders: [(id: String, label: String)],
    membership: [String: String]
  ) throws -> RichChatComposerControlCatalog {
    try RichChatComposerControlCatalog(
      agentStatus: AgentStatusRecord(
        wire: .object([
          "kind": .string("provider"),
          "label": .string("Provider"),
          "installed": .bool(true),
          "authState": .string("authenticated"),
          "capabilities": .object([
            "models": .array(
              models.map { .object(["id": .string($0.id), "label": .string($0.label)]) }),
            "subProviders": .array(
              subProviders.map {
                .object(["id": .string($0.id), "label": .string($0.label)])
              }),
            "modelSubProvider": .object(
              membership.mapValues(JSONValue.string)),
          ]),
        ])),
      presentationMode: .gui,
      configuration: ThreadConfig(model: models.first?.id ?? "")
    )
  }

  private static func source(_ relativePath: String) throws -> String {
    let root = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
    return try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
  }
}
