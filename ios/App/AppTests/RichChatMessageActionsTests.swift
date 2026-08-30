import Foundation
import XCTest

@testable import App

final class RichChatMessageActionsTests: XCTestCase {
  func testRevertPlanMatchesTheCheckpointBeforeAUserMessage() {
    let items = [
      item("user-1", RichItemType.userMessage),
      item("answer-1", RichItemType.assistantMessage),
      item("user-2", RichItemType.userMessage),
      item("answer-2", RichItemType.assistantMessage),
      item("user-3", RichItemType.userMessage),
    ]
    let turns = [
      RichCompletedTurn(
        startedAtMilliseconds: 0, endedAtMilliseconds: 1_000, anchorItemID: "answer-1"),
      RichCompletedTurn(
        startedAtMilliseconds: 2_000, endedAtMilliseconds: 3_000, anchorItemID: "answer-2"),
    ]
    let checkpoint = RichCheckpoint(
      threadID: "thread-rich",
      checkpointItemID: "answer-1",
      ref: "refs/checkpoint",
      commit: "abc",
      capturedAt: "2026-01-01T00:00:00Z",
      baseCheckpointItemID: nil,
      baseRef: nil,
      changedFiles: nil
    )

    let plan = RichChatMessageRevertPlanner.plan(
      userItemID: "user-2",
      items: items,
      completedTurns: turns,
      checkpoints: RichChatCheckpointCollection(checkpoints: [checkpoint], turns: [])
    )

    XCTAssertEqual(
      plan,
      RichChatMessageRevertPlan(
        userItemID: "user-2",
        checkpointItemID: "answer-1",
        rollbackTurnCount: 1,
        hasFileCheckpoint: true
      )
    )
  }

  func testRevertPlanFallsBackToLaterAssistantCountAndRequiresAPriorAnswer() {
    let items = [
      item("user-1", RichItemType.userMessage),
      item("answer-1", RichItemType.assistantMessage),
      item("user-2", RichItemType.userMessage),
      item("answer-2", RichItemType.assistantMessage),
      item("user-3", RichItemType.userMessage),
    ]

    let plan = RichChatMessageRevertPlanner.plan(
      userItemID: "user-2",
      items: items,
      completedTurns: [],
      checkpoints: RichChatCheckpointCollection(checkpoints: [], turns: [])
    )

    XCTAssertEqual(plan?.rollbackTurnCount, 1)
    XCTAssertEqual(plan?.hasFileCheckpoint, false)
    XCTAssertNil(
      RichChatMessageRevertPlanner.plan(
        userItemID: "user-1",
        items: items,
        completedTurns: [],
        checkpoints: RichChatCheckpointCollection(checkpoints: [], turns: [])
      )
    )
  }

  func testCopyMatchesUserAndFinalAssistantMessageBehavior() {
    let user = item("user", RichItemType.userMessage)
    let answer = item("answer", RichItemType.assistantMessage)
    let nextUser = item("next-user", RichItemType.userMessage)

    XCTAssertTrue(
      RichChatMessageCopyEligibility.isEligible(
        item: user, text: "Prompt", items: [user], isTurnActive: true
      )
    )
    XCTAssertTrue(
      RichChatMessageCopyEligibility.isEligible(
        item: answer, text: "Answer", items: [answer, nextUser], isTurnActive: true
      )
    )
    XCTAssertTrue(
      RichChatMessageCopyEligibility.isEligible(
        item: answer, text: "Answer", items: [answer], isTurnActive: false
      )
    )
    XCTAssertFalse(
      RichChatMessageCopyEligibility.isEligible(
        item: answer, text: "Answer", items: [answer], isTurnActive: true
      )
    )
  }

  func testNativeTimelineOffersCopyAndCoordinatedRevertFromLongPress() throws {
    let timeline = try Self.source("App/Features/RichChat/UI/RichChatTimelineView.swift")
    let components = try Self.source(
      "App/Features/RichChat/UI/RichChatTranscriptComponents.swift"
    )
    let textComponents = try Self.source(
      "App/Features/RichChat/UI/RichChatMessageTextComponents.swift"
    )
    let controller = try Self.source(
      "App/Features/RichChat/Controllers/RichChatConversationController.swift"
    )

    XCTAssertTrue(components.contains(".contextMenu { messageActions }"))
    XCTAssertTrue(components.contains("UIPasteboard.general.string = text"))
    XCTAssertTrue(components.contains("actions.revertPlan(itemID: item.id)"))
    XCTAssertTrue(timeline.contains("conversation.revertToCheckpoint("))
    XCTAssertTrue(controller.contains("try? await gateway.rollbackRichConversation("))
    XCTAssertTrue(controller.contains("try await gateway.restoreRichCheckpoint("))
    XCTAssertTrue(controller.contains("try await gateway.truncateRichRuntime("))
    XCTAssertTrue(textComponents.contains("struct RichChatMessageText: View"))
    XCTAssertTrue(textComponents.contains("fullHeight > collapsedHeight + 0.5"))
    XCTAssertTrue(textComponents.contains("expanded ? RichChatStrings.hideDetails"))
  }

  func testNativeTranscriptUsesReusablePWAAlignedSurfaces() throws {
    let timeline = try Self.source("App/Features/RichChat/UI/RichChatTimelineView.swift")
    let entries = try Self.source(
      "App/Features/RichChat/UI/RichChatTimelineEntriesView.swift"
    )
    let components = try Self.source(
      "App/Features/RichChat/UI/RichChatTranscriptComponents.swift"
    )
    let activityComponents = try Self.source(
      "App/Features/RichChat/UI/RichChatTranscriptActivityComponents.swift"
    )
    let textComponents = try Self.source(
      "App/Features/RichChat/UI/RichChatMessageTextComponents.swift"
    )

    XCTAssertLessThan(timeline.split(separator: "\n").count, 300)
    XCTAssertTrue(timeline.contains("RichChatTimelineEntryView("))
    XCTAssertTrue(entries.contains("RichChatTranscriptItemView("))
    XCTAssertTrue(components.contains("case RichItemType.userMessage:"))
    XCTAssertTrue(components.contains("case RichItemType.assistantMessage:"))
    XCTAssertTrue(components.contains("case RichItemType.reasoning:"))
    XCTAssertTrue(components.contains("RichChatMessageSurface(kind: .prompt)"))
    XCTAssertTrue(components.contains("RichChatMessageSurface(kind: .assistant)"))
    XCTAssertTrue(activityComponents.contains("struct RichChatReasoningRow: View"))
    XCTAssertTrue(activityComponents.contains("struct RichChatActivityRow: View"))
    XCTAssertTrue(textComponents.contains("struct RichChatMessageText: View"))
    XCTAssertLessThan(components.split(separator: "\n").count, 300)
    XCTAssertLessThan(activityComponents.split(separator: "\n").count, 300)
    XCTAssertLessThan(textComponents.split(separator: "\n").count, 300)
    XCTAssertTrue(components.contains("@Environment(\\.poracodeTheme)"))
    XCTAssertFalse(components.contains("Color.accentColor.opacity(0.14)"))
  }

  func testNativeImagesExposePreviewZoomCopyAndSystemShare() throws {
    let source = try Self.source("App/Features/RichChat/UI/RichChatImageView.swift")

    XCTAssertTrue(source.contains(".fullScreenCover(item: $preview)"))
    XCTAssertTrue(source.contains("RichChatZoomableImageView"))
    XCTAssertTrue(source.contains("maximumZoomScale = 5"))
    XCTAssertTrue(source.contains("UIPasteboard.general.image = image"))
    XCTAssertTrue(source.contains("UIActivityViewController(activityItems: [image]"))
    XCTAssertFalse(RichChatMessageActionStrings.copyImage.isEmpty)
    XCTAssertFalse(RichChatMessageActionStrings.shareImage.isEmpty)
    XCTAssertFalse(RichChatMessageActionStrings.openImagePreview.isEmpty)
    XCTAssertFalse(RichChatMessageActionStrings.closeImagePreview.isEmpty)
  }

  func testNativeMarkdownParsesPWAContentBlocksWithoutLeavingSyntaxInProse() {
    let source = """
      # Rendering sample

      1. **Readable hierarchy**
      2. Compact spacing

      ```javascript
      const status = "ready";
      ```

      | Surface | State |
      | --- | --- |
      | PWA | Connected |

      > Important details stay visible.
      """

    XCTAssertEqual(
      RichChatMarkdownParser.parse(source),
      [
        .heading(level: 1, text: "Rendering sample"),
        .orderedList(["**Readable hierarchy**", "Compact spacing"]),
        .code(language: "javascript", source: "const status = \"ready\";"),
        .table(headers: ["Surface", "State"], rows: [["PWA", "Connected"]]),
        .quote("Important details stay visible."),
      ]
    )
  }

  func testActivitySummarySeparatesReasoningFromToolActivity() {
    let summary = RichChatActivityGroupSummary(
      members: [
        RichVisibleTimelineNode(item: item("thought", RichItemType.reasoning), children: []),
        RichVisibleTimelineNode(item: item("tool", "tool_call"), children: []),
      ]
    )

    XCTAssertEqual(summary.activityCount, 1)
    XCTAssertEqual(summary.reasoningCount, 1)
  }

  func testNativeSyntaxHighlightingMatchesThePWAJavaScriptTokenClasses() {
    let tokens = RichChatSyntaxHighlighter.tokens(
      source: "const status = \"ready\"; console.log(status);",
      language: "javascript"
    )

    XCTAssertTrue(tokens.contains(RichChatSyntaxToken(text: "const", kind: .keyword)))
    XCTAssertTrue(tokens.contains(RichChatSyntaxToken(text: "\"ready\"", kind: .string)))
    XCTAssertTrue(tokens.contains(RichChatSyntaxToken(text: "log", kind: .function)))
  }

  func testNativeSyntaxHighlightingRecognizesMarkdownStructure() {
    let tokens = RichChatSyntaxHighlighter.tokens(
      source: "- Shared files and `README.md`",
      language: "markdown"
    )

    XCTAssertTrue(tokens.contains(RichChatSyntaxToken(text: "- ", kind: .markup)))
    XCTAssertTrue(tokens.contains(RichChatSyntaxToken(text: "`README.md`", kind: .markup)))
  }

  func testMessageActionStringsAreTranslatedInEveryLocale() throws {
    let locales: Set<String> = [
      "en", "de", "es", "fr", "ja", "ko", "pl", "pt-BR", "ru", "tr", "uk", "vi", "zh-Hans",
    ]
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
      .appendingPathComponent("App/Resources/RichChatMessageActions.xcstrings")
    let root = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
    )
    let strings = try XCTUnwrap(root["strings"] as? [String: Any])
    XCTAssertEqual(strings.count, 16)

    for (key, raw) in strings {
      let entry = try XCTUnwrap(raw as? [String: Any], key)
      let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
      XCTAssertEqual(Set(localizations.keys), locales, key)
      for (locale, rawLocalization) in localizations {
        let localization = try XCTUnwrap(
          rawLocalization as? [String: Any], "\(key):\(locale)"
        )
        let unit = try XCTUnwrap(
          localization["stringUnit"] as? [String: Any], "\(key):\(locale)"
        )
        XCTAssertFalse(
          (unit["value"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ?? true,
          "\(key):\(locale)"
        )
      }
    }
  }

  private func item(
    _ id: String,
    _ type: String,
    state: RichItemState = .completed,
    parentItemID: String? = nil
  ) -> RichRuntimeItem {
    RichRuntimeItem(
      id: id,
      type: type,
      state: state,
      payload: nil,
      streams: [:],
      parentItemID: parentItemID
    )
  }

  private static func source(_ relativePath: String) throws -> String {
    let root = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
    return try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
  }
}
