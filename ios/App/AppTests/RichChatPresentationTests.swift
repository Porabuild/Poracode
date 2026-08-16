import XCTest

@testable import App

final class RichChatPresentationTests: XCTestCase {
  func testContextIndicatorOnlyRendersOnAuthoritativeOccupancy() {
    // No usage at all, and no reported window: nothing to show.
    XCTAssertNil(RichChatPresentation.contextUsage(nil))
    XCTAssertNil(RichChatPresentation.contextUsage(RichContextUsage()))
    XCTAssertNil(
      RichChatPresentation.contextUsage(RichContextUsage(usedTokens: 128, maxTokens: nil)))
    // A window with no reported occupancy is never turned into an estimate.
    XCTAssertNil(
      RichChatPresentation.contextUsage(RichContextUsage(usedTokens: nil, maxTokens: 8192)))
    XCTAssertNil(
      RichChatPresentation.contextUsage(
        RichContextUsage(usedTokens: nil, maxTokens: 8192, breakdown: [])))

    let summary = RichChatPresentation.contextUsage(
      RichContextUsage(usedTokens: 128, maxTokens: 8192))
    XCTAssertEqual(summary?.percent, 2)
    XCTAssertEqual(summary?.remainingTokens, 8064)
    XCTAssertEqual(summary?.maxTokens, 8192)

    // Breakdown-only occupancy renders the window without a fabricated percent.
    let breakdownOnly = RichChatPresentation.contextUsage(
      RichContextUsage(
        usedTokens: nil,
        maxTokens: 8192,
        breakdown: [RichContextBreakdownEntry(id: "system", label: "System", tokens: 40)]
      ))
    XCTAssertNotNil(breakdownOnly)
    XCTAssertNil(breakdownOnly?.percent)
    XCTAssertNil(breakdownOnly?.remainingTokens)

    // Overflowing reports clamp instead of exceeding the window.
    let overflow = RichChatPresentation.contextUsage(
      RichContextUsage(usedTokens: 20_000, maxTokens: 8192))
    XCTAssertEqual(overflow?.percent, 100)
    XCTAssertEqual(overflow?.remainingTokens, 0)
  }

  func testContextStringsAreLocalizedWithFullCatalogParity() throws {
    let catalog = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("App/Resources/Localizable.xcstrings")
    let root = try XCTUnwrap(
      try JSONSerialization.jsonObject(with: Data(contentsOf: catalog)) as? [String: Any])
    let strings = try XCTUnwrap(root["strings"] as? [String: Any])

    var allLocales: Set<String> = []
    for entry in strings.values {
      guard let object = entry as? [String: Any],
        let localizations = object["localizations"] as? [String: Any]
      else { continue }
      allLocales.formUnion(localizations.keys)
    }
    XCTAssertEqual(allLocales.count, 13, "en plus the 12 shipped translations")

    let contextKeys = [
      "rich_chat_context_window", "rich_chat_context_unknown",
      "rich_chat_context_percent", "rich_chat_context_tokens",
    ]
    for key in contextKeys {
      let entry = try XCTUnwrap(strings[key] as? [String: Any], key)
      let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
      XCTAssertEqual(Set(localizations.keys), allLocales, "\(key) locale parity")
      for locale in allLocales {
        let localization = try XCTUnwrap(
          localizations[locale] as? [String: Any], "\(key)/\(locale)")
        let unit = try XCTUnwrap(localization["stringUnit"] as? [String: Any], "\(key)/\(locale)")
        let value = try XCTUnwrap(unit["value"] as? String, "\(key)/\(locale)")
        let state = try XCTUnwrap(unit["state"] as? String, "\(key)/\(locale)")
        XCTAssertFalse(value.isEmpty, "\(key)/\(locale) must not ship empty")
        XCTAssertEqual(state, "translated", "\(key)/\(locale)")
      }
    }

    XCTAssertFalse(RichChatStrings.contextWindow.isEmpty)
    XCTAssertFalse(RichChatStrings.contextUsageUnknown.isEmpty)
    XCTAssertTrue(RichChatStrings.contextPercent(42).contains("42"))
    let tokens = RichChatStrings.contextTokens(used: 128, maxTokens: 8192)
    XCTAssertFalse(tokens.contains("%"), "format specifiers must be substituted")
    XCTAssertFalse(tokens.isEmpty)
  }

  func testRequestResolutionPreservesWireIDAndMultiSelection() throws {
    let request = RichOpenRequest(
      requestID: .number(1),
      threadID: "thread",
      type: .toolUserInput,
      payload: RichRequestPayload(
        summary: "Choose",
        details: nil,
        options: nil,
        multiSelect: true
      ),
      receivedAtMilliseconds: 0
    )

    let result = try XCTUnwrap(
      RichChatPresentation.requestResolution(request: request, optionIDs: ["a", "b"])
    )

    XCTAssertEqual(result.requestID, .number(1))
    XCTAssertEqual(result.method, "requestPermission")
    XCTAssertEqual(
      result.response,
      .object([
        "optionId": .string("a"),
        "optionIds": .array([.string("a"), .string("b")]),
      ])
    )
  }

  func testTimelineTextPrefersStreamsAndGoalUsesLatestPayload() {
    let assistant = RichRuntimeItem(
      id: "assistant",
      type: RichItemType.assistantMessage,
      state: .completed,
      payload: .object([
        "content": .array([.object(["kind": .string("text"), "text": .string("old")])])
      ]),
      streams: ["assistant_text": "streamed"],
      parentItemID: nil
    )
    let goal = RichRuntimeItem(
      id: "goal",
      type: RichItemType.goal,
      state: .completed,
      payload: .object([
        "objective": .string("Ship native chat"),
        "status": .string("active"),
        "availableActions": .array([.string("edit"), .string("pause"), .string("unknown")]),
      ]),
      streams: [:],
      parentItemID: nil
    )

    XCTAssertEqual(RichChatPresentation.text(for: assistant), "streamed")
    XCTAssertEqual(
      RichChatPresentation.latestGoal(in: [assistant, goal]),
      RichGoalPresentation(
        objective: "Ship native chat",
        status: "active",
        availableActions: ["edit", "pause"]
      )
    )
  }

  func testInlineDataImageDecodesButUnsupportedRawSVGSkipsBitmapDecode() throws {
    let dataURL = "data:image/png;base64,aGVsbG8="
    let dataClassification = try XCTUnwrap(RichImagePolicy.classify(dataURL))
    XCTAssertEqual(
      RichChatPresentation.inlineImageData(
        source: dataURL,
        classification: dataClassification
      ),
      Data("hello".utf8)
    )

    let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"
    let svgClassification = try XCTUnwrap(RichImagePolicy.classify(svg))
    XCTAssertNil(
      RichChatPresentation.inlineImageData(source: svg, classification: svgClassification),
    )
  }
}
