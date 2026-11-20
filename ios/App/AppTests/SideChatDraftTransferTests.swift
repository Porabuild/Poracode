import XCTest
@testable import App

final class SideChatDraftTransferTests: XCTestCase {
  func testSlashCommandKeepsTheQuestionAndDoesNotClaimOtherCommands() {
    XCTAssertEqual(SideChatCommand.question(in: "/btw"), "")
    XCTAssertEqual(SideChatCommand.question(in: "  /btw Why?\nAnd this?  "), "Why?\nAnd this?")
    XCTAssertEqual(SideChatCommand.question(in: "/btw\tQuestion"), "Question")
    for ordinary in ["/btweet question", "Ask /btw something", "/plan", "Question"] {
      XCTAssertNil(SideChatCommand.question(in: ordinary))
    }
  }

  func testTransferPreservesEveryCanonicalContextKindAndSelectionMarker() throws {
    let segments: [RichPromptSegment] = [
      .text(content: "Question"), .selectedText(content: "Quoted message"), .file(path: "/source/file"),
      .attachment(path: "/attachments/image", mimeType: "image/png"),
      .diffComment(path: "/source/file", lineNumber: 8, side: .new, staged: true, body: "Review this"),
      .skill(name: "review", path: "/skills/review", invocation: "/review", provider: "fixture", scope: "project", pluginID: "p1", pluginName: "Review tools"),
      .mcp(id: "server", name: "Review"), .thread(threadID: "reference", title: "Reference"),
    ]
    for segment in segments {
      let encoded = try JSONDecoding.encoder.encode(segment.lifecyclePromptSegment())
      XCTAssertEqual(try RichJSON.decode(encoded), segment.richChatWireValue)
    }
    let ordinary = try RichJSON.decode(JSONDecoding.encoder.encode(ThreadPromptSegment.text(content: "Question")))
    XCTAssertNil(ordinary.objectValue?["selection"], "Pre-upgrade ordinary text keeps its exact shape")
    let selected = RichPromptSegment.selectedText(content: "Quoted message")
    XCTAssertEqual(try RichPendingSteerDecoder.decodeSegment(selected.richChatWireValue), selected)
    XCTAssertThrowsError(try RichPromptSegment.skill(name: "bad", path: nil, invocation: "/bad", provider: "fixture",
      scope: "future-unknown", pluginID: nil, pluginName: nil).lifecyclePromptSegment())
  }

  @MainActor
  func testQueuedQuoteSurvivesUntilItsChildDraftIsPrepared() {
    let store = RichChatComposerDraftStore(), key = RichChatComposerDraftKey(connectionID: ClientConnectionID(), threadID: "child")
    store.enqueue(.selectedText(content: "Parent excerpt"), for: key)
    let state = store.acquireState(for: key)
    state.prepare(for: key, baseConfiguration: .empty)
    XCTAssertTrue(state.consumeQueuedSegments(), "The page must receive the focus signal after restoring its draft")
    XCTAssertEqual(state.segments, [.selectedText(content: "Parent excerpt")])
    XCTAssertFalse(state.consumeQueuedSegments())
    XCTAssertEqual(state.segments.count, 1)
    store.releaseState(state, for: key)
  }
}
