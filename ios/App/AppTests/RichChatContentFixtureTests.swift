import XCTest

#if canImport(App)
  @testable import App
#elseif canImport(RichChatDomain)
  @testable import RichChatDomain
#endif

final class RichChatContentFixtureTests: XCTestCase {
  func testCanonicalContentBlockMatrix() throws {
    let fixture = try loadRichChatFixture("rich-content-blocks.json")
    let accepted = try richFixtureArray(try XCTUnwrap(fixture["accepted"]))
    let decoded = try accepted.map { entry -> RichContentBlock in
      let object = try richFixtureObject(entry)
      return try RichContentDecoder.decodeBlock(try XCTUnwrap(object["block"]))
    }
    XCTAssertEqual(decoded.count, 7)
    XCTAssertTrue(matches(decoded[0], case: "text"))
    XCTAssertTrue(matches(decoded[1], case: "skill"))
    XCTAssertTrue(matches(decoded[2], case: "mcp"))
    XCTAssertTrue(matches(decoded[3], case: "thread"))
    XCTAssertTrue(matches(decoded[4], case: "diff"))
    XCTAssertTrue(matches(decoded[5], case: "image"))
    XCTAssertTrue(matches(decoded[6], case: "file"))

    let rejected = try richFixtureArray(try XCTUnwrap(fixture["rejected"]))
    for entry in rejected {
      let object = try richFixtureObject(entry)
      let id = try XCTUnwrap(object["id"]?.stringValue)
      XCTAssertThrowsError(
        try RichContentDecoder.decodeBlock(try XCTUnwrap(object["block"])),
        id
      )
    }
  }

  func testPersistedTranscriptHierarchyTimelineAndTurnMatrix() throws {
    let fixture = try loadRichChatFixture("rich-persisted-transcript.json")
    let items = try RichContentDecoder.decodeRuntimeItems(
      try XCTUnwrap(fixture["runtimeItems"])
    )
    let turns = try RichTimeline.decodeCompletedTurns(
      try XCTUnwrap(fixture["completedTurns"])
    )
    XCTAssertEqual(items.count, 6)
    XCTAssertEqual(items.filter { $0.parentItemID == "rich-parent-tool" }.count, 2)
    XCTAssertEqual(items[1].streams["assistant_text"], "Starting review.")
    XCTAssertEqual(turns.map(\.anchorItemID), ["rich-assistant-1", "rich-assistant-2"])
    XCTAssertEqual(turns.map(\.durationMilliseconds), [2_000, 5_000])

    let projection = RichTimeline.project(items)
    XCTAssertEqual(
      projection.rawRoots.map(\.item.id),
      ["rich-user-1", "rich-assistant-1", "rich-parent-tool", "rich-assistant-2"]
    )
    XCTAssertEqual(
      projection.rawRoots[2].children.map(\.item.id),
      [
        "rich-child-reasoning", "rich-child-answer",
      ])
    XCTAssertEqual(RichTimeline.visibleItemIDs(in: projection), items.map(\.id))
    XCTAssertEqual(
      RichTimeline.resolveCompletedTurnAnchors(turns, in: projection),
      turns
    )
  }

  func testCheckpointCaptureTurnAndListMatricesStayEquivalent() throws {
    let fixture = try loadRichChatFixture("checkpoint-turn-sequences.json")
    let captures = try decodeNestedCheckpoints(try XCTUnwrap(fixture["captures"]))
    let turns = try decodeNestedCheckpoints(try XCTUnwrap(fixture["turns"]))
    let list = try richFixtureObject(try XCTUnwrap(fixture["listResult"]))
    let listedCaptures = try RichCheckpointDecoder.decodeList(
      try XCTUnwrap(list["checkpoints"])
    )
    let listedTurns = try RichCheckpointDecoder.decodeList(try XCTUnwrap(list["turns"]))

    XCTAssertEqual(captures, listedCaptures)
    XCTAssertEqual(turns, listedTurns)
    XCTAssertTrue(captures.allSatisfy { !$0.isTurn })
    XCTAssertTrue(turns.allSatisfy(\.isTurn))
    XCTAssertTrue(
      turns.allSatisfy { turn in
        captures.contains { $0.checkpointItemID == turn.baseCheckpointItemID }
      })
    let rename = try XCTUnwrap(
      turns.flatMap { $0.changedFiles ?? [] }.first { $0.status == "renamed" }
    )
    XCTAssertEqual(rename.path, "src/renamed.ts")
    XCTAssertEqual(rename.oldPath, "src/new.ts")
  }

  func testHiddenTurnAnchorFallsBackWithoutDiscardingAnUnanchoredTurn() {
    let visible = RichRuntimeItem(
      id: "answer",
      type: RichItemType.assistantMessage,
      state: .completed,
      payload: nil,
      streams: ["assistant_text": "done"],
      parentItemID: nil
    )
    let hidden = RichRuntimeItem(
      id: "plan",
      type: RichItemType.plan,
      state: .completed,
      payload: nil,
      streams: [:],
      parentItemID: nil
    )
    let projection = RichTimeline.project([visible, hidden])
    let turn = RichCompletedTurn(
      startedAtMilliseconds: 0,
      endedAtMilliseconds: 1_000,
      anchorItemID: "plan"
    )
    XCTAssertEqual(
      RichTimeline.resolveCompletedTurnAnchors([turn], in: projection).first?.anchorItemID,
      "answer"
    )

    let leadingHidden = RichTimeline.project([hidden])
    XCTAssertNil(
      RichTimeline.resolveCompletedTurnAnchors([turn], in: leadingHidden).first?.anchorItemID
    )
  }

  private func decodeNestedCheckpoints(_ value: RichJSON) throws -> [RichCheckpoint] {
    try richFixtureArray(value).map { entry in
      let result = try richFixtureObject(
        try XCTUnwrap(
          try richFixtureObject(entry)["result"]
        ))
      return try RichCheckpointDecoder.decode(try XCTUnwrap(result["checkpoint"]))
    }
  }

  private func matches(_ block: RichContentBlock, case expected: String) -> Bool {
    switch (block, expected) {
    case (.text, "text"), (.skill, "skill"), (.mcp, "mcp"), (.thread, "thread"),
      (.diffComment, "diff"), (.image, "image"), (.file, "file"):
      true
    default:
      false
    }
  }
}
