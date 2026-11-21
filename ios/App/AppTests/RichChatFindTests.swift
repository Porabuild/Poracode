import XCTest
@testable import App

@MainActor final class RichChatFindTests: XCTestCase {
  func testCommittedHistoryStaysDisplayableDuringARefreshForItsOwnLease() {
    let connectionID = ClientConnectionID()
    let lease = RichChatHostLease(connectionID: connectionID, generation: 1)
    let target = RichChatThreadTarget(lease: lease, threadID: "thread")
    let reply = item("reply", type: RichItemType.assistantMessage, stream: "assistant_text", text: "A retained reply")
    var state = RichChatTranscriptControllerState(target: target,
      transcript: RichTranscriptState(threadID: target.threadID, items: [reply]), snapshotSequence: 2)
    XCTAssertTrue(state.canDisplayHistory(for: lease))
    state.loadState = .loading
    XCTAssertTrue(state.canDisplayHistory(for: lease))
    XCTAssertFalse(state.canDisplayHistory(for: .init(connectionID: connectionID, generation: 2)))
    state.snapshotSequence = nil
    XCTAssertFalse(state.canDisplayHistory(for: lease))
  }

  func testWindowRetainsFindAndTheSuiteForOverlappingPagesOfTheSameHostThread() {
    let firstHost = ClientConnectionID()
    let secondHost = ClientConnectionID()
    let route = CompositeRemoteID(connectionId: firstHost, remoteId: "shared-id")
    let otherHostRoute = CompositeRemoteID(connectionId: secondHost, remoteId: "shared-id")
    let session = RichChatWindowSession()
    let otherWindow = RichChatWindowSession()
    func makeSuite() -> RichChatControllerSuite { RichChatControllerSuite(gateway: RichChatControllerGatewayFake()) }
    let first = session.acquire(thread: route, makeSuite: makeSuite)
    let beforeActivation = session.acquire(thread: route, makeSuite: makeSuite)
    XCTAssertTrue(beforeActivation === first)
    let find = first.find
    session.retain(first)
    find.open()
    find.query = .init(text: "MARK", matchesCase: true)
    find.update(entries: RichTimeline.project([item("reply", type: RichItemType.assistantMessage,
      stream: "assistant_text", text: "MARK MARK")]).visibleEntries)
    find.step(1)

    let rebuilt = session.acquire(thread: route, makeSuite: makeSuite)
    let rebuiltPageFind = rebuilt.find
    XCTAssertTrue(rebuilt.suite === first.suite)
    XCTAssertTrue(rebuiltPageFind === find)
    XCTAssertTrue(rebuiltPageFind.isPresented)
    XCTAssertEqual(rebuiltPageFind.query, .init(text: "MARK", matchesCase: true))
    XCTAssertEqual(rebuiltPageFind.selection?.occurrence, 1)
    let otherHost = session.acquire(thread: otherHostRoute, makeSuite: makeSuite)
    let otherWindowThread = otherWindow.acquire(thread: route, makeSuite: makeSuite)
    XCTAssertFalse(otherHost.suite === first.suite)
    XCTAssertFalse(otherWindowThread.suite === first.suite)
    XCTAssertTrue(session.retains(first))

    session.retain(otherHost)
    XCTAssertFalse(find.isPresented)
    XCTAssertFalse(session.retains(first))
    XCTAssertEqual(otherHost.find.query.text, "")
  }

  func testRebuiltTailKeepsBookmarkUntilOlderHistoryReturns() {
    let find = RichChatFindState()
    let older = item("older", type: RichItemType.assistantMessage, stream: "assistant_text", text: "first match")
    let latest = item("latest", type: RichItemType.assistantMessage, stream: "assistant_text", text: "latest match")
    let all = RichTimeline.project([older, latest]).visibleEntries
    find.open()
    find.query.text = "match"
    find.update(entries: all)
    XCTAssertEqual(find.selection?.itemID, "older")
    find.update(entries: RichTimeline.project([latest]).visibleEntries)
    XCTAssertEqual(find.selection?.itemID, "latest")
    find.update(entries: all)
    XCTAssertEqual(find.selection?.itemID, "older")
  }

  func testNavigatesOccurrencesAndPreservesSelectionAfterOlderHistoryLoads() {
    let find = RichChatFindState()
    let reply = item("reply", type: RichItemType.assistantMessage, stream: "assistant_text",
      text: "## Fixture\n\nHere is **fixture**.")
    let older = item("older", type: RichItemType.assistantMessage, stream: "assistant_text", text: "Older fixture")
    find.open()
    find.query.text = "fixture"
    find.update(entries: RichTimeline.project([reply]).visibleEntries)
    XCTAssertEqual(find.matches.count, 2)
    XCTAssertEqual(find.selection?.part, .markdown(visual: 0, block: 0, piece: 0))
    find.step(-1)
    XCTAssertEqual(find.selection?.part, .markdown(visual: 0, block: 1, piece: 0))
    find.update(entries: RichTimeline.project([older, reply]).visibleEntries)
    XCTAssertEqual(find.currentIndex, 2)
    find.step(1)
    XCTAssertEqual(find.selection?.itemID, "older")
  }

  func testChangingTheQueryInvalidatesTheRevealOfAnEarlierRangeInTheSameParagraph() throws {
    let find = RichChatFindState()
    let reply = item("reply", type: RichItemType.assistantMessage, stream: "assistant_text", text: "first and last")
    let entries = RichTimeline.project([reply]).visibleEntries
    find.open()
    find.query.text = "first"
    find.update(entries: entries)
    let first = try XCTUnwrap(find.revealTarget)

    find.query.text = "last"
    XCTAssertNil(find.revealTarget)
    find.update(entries: entries)
    let last = try XCTUnwrap(find.revealTarget)
    XCTAssertEqual(first.match, last.match)
    XCTAssertNotEqual(first, last)
  }

  func testTheLatestPositionSurvivesReindexingAndNextCanRevisitTheSameMatch() throws {
    let find = RichChatFindState()
    let reply = item("reply", type: RichItemType.assistantMessage, stream: "assistant_text", text: "first and last")
    let entries = RichTimeline.project([reply]).visibleEntries
    find.open()
    find.query.text = "first"
    find.update(entries: entries)
    let original = try XCTUnwrap(find.revealTarget)
    find.rememberLatestPosition()
    XCTAssertEqual(find.selection, original.match)
    XCTAssertEqual(find.revealTarget, original)
    XCTAssertNil(find.viewportRevealTarget)
    find.update(entries: [])
    find.update(entries: entries)
    XCTAssertNil(find.viewportRevealTarget)

    find.forgetLatestPosition()
    XCTAssertEqual(find.viewportRevealTarget, original)
    find.rememberLatestPosition()
    find.step(1)
    XCTAssertEqual(find.viewportRevealTarget, original)
    XCTAssertEqual(find.repeatRevealRequest, 1)
    find.rememberLatestPosition()
    find.query.text = "last"
    find.update(entries: entries)
    XCTAssertEqual(find.viewportRevealTarget?.query.text, "last")

    find.rememberLatestPosition()
    find.close()
    find.open()
    XCTAssertEqual(find.viewportRevealTarget?.query.text, "last")
  }

  func testSearchUsesDisplayTextAndRevealsGroupedReasoningWhileSkippingToolOutput() throws {
    let think = item("think", type: RichItemType.reasoning, stream: "reasoning_text", text: "Fixture fixture")
    let command = item("cmd", type: "command_execution", stream: "command_output", text: "Fixture fixture")
    let reply = item("reply", type: RichItemType.assistantMessage, stream: "assistant_text",
      text: "[Fixture](https://example.test/hidden)")
    let projection = RichTimeline.project([think, command, reply])
    let find = RichChatFindState()
    find.open()
    find.query = .init(text: "Fixture", matchesCase: true)
    find.update(entries: projection.visibleEntries)
    XCTAssertEqual(find.matches.map(\.itemID), ["think", "reply"])
    XCTAssertEqual(try XCTUnwrap(find.selection).rowID, projection.visibleEntries[0].stableID)

    find.query.text = "https://example.test/hidden"
    find.update(entries: projection.visibleEntries)
    XCTAssertTrue(find.matches.isEmpty)
    find.close()
    XCTAssertFalse(find.isPresented)
    XCTAssertNil(find.selection)
    XCTAssertEqual(find.query, .init(text: "https://example.test/hidden", matchesCase: true))
  }

  func testFindIncludesMarkdownFileCardNames() {
    let reply = item("reply", type: RichItemType.assistantMessage, stream: "assistant_text",
      text: "[Report](file:///tmp/Review.pdf)")
    let find = RichChatFindState()
    find.open()
    find.query.text = "review.pdf"
    find.update(entries: RichTimeline.project([reply]).visibleEntries)
    XCTAssertEqual(find.matches.first?.part, .markdown(visual: 0, block: 0, piece: 0))
  }

  func testFindIncludesSourceChipFilenamesAndAuthoredLabels() {
    let reply = item("reply", type: RichItemType.assistantMessage, stream: "assistant_text",
      text: """
        [Linked **source**](./src/README.md:48)

        `src/README.md:48`

        - Read the documentation
        - [Setup guide](./src/README.md:15)

        1. [Usage guide](./src/README.md:58)
        2. Read [inline help](./src/README.md:86).
        """)
    let entries = RichTimeline.project([reply]).visibleEntries
    let find = RichChatFindState()
    find.open()
    find.query.text = "README.md"
    find.update(entries: entries, projectLocation: .posix(path: "/repo/project"))
    XCTAssertEqual(find.matches.map(\.part), [
      .markdown(visual: 0, block: 0, piece: 0), .markdown(visual: 0, block: 1, piece: 0),
      .markdown(visual: 0, block: 2, piece: 1), .markdown(visual: 0, block: 3, piece: 0),
    ])

    find.query.text = "Linked source"
    find.update(entries: entries, projectLocation: .posix(path: "/repo/project"))
    XCTAssertEqual(find.matches.map(\.part), [.markdown(visual: 0, block: 0, piece: 0)])

    find.query.text = "guide"
    find.update(entries: entries, projectLocation: .posix(path: "/repo/project"))
    XCTAssertEqual(find.matches.map(\.part), [
      .markdown(visual: 0, block: 2, piece: 1), .markdown(visual: 0, block: 3, piece: 0),
    ])

    find.query.text = "inline help"
    find.update(entries: entries, projectLocation: .posix(path: "/repo/project"))
    XCTAssertEqual(find.matches.map(\.part), [.markdown(visual: 0, block: 3, piece: 1)])
  }

  func testCaseFoldingAndNonOverlappingRangesWorkWithUnicode() {
    let text = "👋café CAFÉ aaa"
    let all = RichChatFindQuery(text: "café").ranges(in: text)
    XCTAssertEqual(all.map { String(text[$0]) }, ["café", "CAFÉ"])
    XCTAssertEqual(RichChatFindQuery(text: "café", matchesCase: true).ranges(in: text).count, 1)
    XCTAssertEqual(RichChatFindQuery(text: "aa").ranges(in: text).count, 1)
  }

  private func item(_ id: String, type: String, stream: String, text: String) -> RichRuntimeItem {
    .init(id: id, type: type, state: .completed, payload: nil, streams: [stream: text], parentItemID: nil)
  }
}
