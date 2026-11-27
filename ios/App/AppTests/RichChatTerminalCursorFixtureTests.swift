import XCTest

#if canImport(App)
  @testable import App
#elseif canImport(RichChatDomain)
  @testable import RichChatDomain
#endif

final class RichChatTerminalCursorFixtureTests: XCTestCase {
  func testTerminalCursorSequenceMatrix() throws {
    let fixture = try loadRichChatFixture("terminal-cursor-sequence.json")
    for stepValue in try richFixtureArray(try XCTUnwrap(fixture["steps"])) {
      let step = try richFixtureObject(stepValue)
      let id = try XCTUnwrap(step["id"]?.stringValue)
      let currentWatchID = try XCTUnwrap(step["currentWatchId"]?.stringValue)
      let frame = try TerminalCursorFrameDecoder.decode(try XCTUnwrap(step["message"]))
      let expected = try richFixtureObject(try XCTUnwrap(step["expected"]))
      let previous = try decodePrevious(step["previous"])

      XCTAssertEqual(
        TerminalCursorReconciler.isStale(frame: frame, currentWatchID: currentWatchID),
        expected["stale"]?.boolValue,
        id
      )
      XCTAssertEqual(
        TerminalCursorReconciler.isAppendCompatible(previous: previous, frame: frame),
        expected["appendCompatible"]?.boolValue,
        id
      )
      let state: TerminalCursorState
      if let previous {
        state = .established(
          watchID: currentWatchID,
          generation: previous.generation,
          toCursor: previous.toCursor
        )
      } else {
        state = .watching(currentWatchID)
      }
      let result = TerminalCursorReconciler.reconcile(state: state, frame: frame)
      XCTAssertEqual(result.action.rawValue, expected["consumerAction"]?.stringValue, id)
      XCTAssertEqual(result.isStaleWatch, id == "stale-watch", id)
      if id == "overlap" {
        XCTAssertEqual(result.appendedText, "xy")
        XCTAssertEqual(result.state.toCursor, 9)
      }
      if id == "baseline" { XCTAssertEqual(result.state.transcript, "hello") }
      if id == "null-generation" { XCTAssertNil(result.state.generation) }
    }
  }

  func testCursorCoordinatesAndOverlapSlicingUseUTF16Units() throws {
    let baseline = TerminalCursorFrame(
      kind: .baseline,
      terminalID: "terminal",
      watchID: "watch",
      generation: "generation",
      fromCursor: 0,
      toCursor: 2,
      data: "😀"
    )
    XCTAssertTrue(TerminalCursorReconciler.isValid(baseline))
    var result = TerminalCursorReconciler.reconcile(
      state: .watching("watch"), frame: baseline
    )
    XCTAssertEqual(result.action, .replace)

    let append = TerminalCursorFrame(
      kind: .output,
      terminalID: "terminal",
      watchID: "watch",
      generation: "generation",
      fromCursor: 2,
      toCursor: 4,
      data: "🚀"
    )
    result = TerminalCursorReconciler.reconcile(state: result.state, frame: append)
    XCTAssertEqual(result.action, .append)
    XCTAssertEqual(result.state.transcript, "😀🚀")
    XCTAssertEqual(result.state.toCursor, 4)

    let splitSurrogateOverlap = TerminalCursorFrame(
      kind: .output,
      terminalID: "terminal",
      watchID: "watch",
      generation: "generation",
      fromCursor: 2,
      toCursor: 4,
      data: "🚀"
    )
    let impossibleState = TerminalCursorState.established(
      watchID: "watch", generation: "generation", toCursor: 3
    )
    let impossible = TerminalCursorReconciler.reconcile(
      state: impossibleState, frame: splitSurrogateOverlap
    )
    XCTAssertEqual(impossible.action, .resync)
    XCTAssertEqual(impossible.reason, .invalidUTF16Boundary)
  }

  func testV2ResumeSuffixBaselineAppendsAtTheDurablePosition() throws {
    let state = TerminalCursorState.established(
      watchID: "watch", generation: "generation-a", toCursor: 108, transcript: "kept"
    )
    let continuation = TerminalCursorFrame(
      kind: .baseline,
      terminalID: "terminal",
      watchID: "watch",
      generation: "generation-a",
      fromCursor: 108,
      toCursor: 111,
      data: "ijk"
    )
    let appended = TerminalCursorReconciler.reconcile(state: state, frame: continuation)
    XCTAssertEqual(appended.action, .append)
    XCTAssertEqual(appended.state.transcript, "keptijk")
    XCTAssertEqual(appended.state.toCursor, 111)

    let fullWindow = TerminalCursorFrame(
      kind: .baseline,
      terminalID: "terminal",
      watchID: "watch",
      generation: "generation-a",
      fromCursor: 0,
      toCursor: 3,
      data: "xyz"
    )
    let replaced = TerminalCursorReconciler.reconcile(state: state, frame: fullWindow)
    XCTAssertEqual(replaced.action, .replace)
    XCTAssertEqual(replaced.state.transcript, "xyz")

    let generationChange = TerminalCursorFrame(
      kind: .baseline,
      terminalID: "terminal",
      watchID: "watch",
      generation: "generation-b",
      fromCursor: 108,
      toCursor: 111,
      data: "ijk"
    )
    let resnapshotted = TerminalCursorReconciler.reconcile(state: state, frame: generationChange)
    XCTAssertEqual(resnapshotted.action, .replace)
  }

  func testV2ContinuationClearsAPendingResyncAndTheUpToDateMarkerIgnoresCleanly() throws {
    // A drift RESYNC armed needsResync; the authoritative continuation
    // covers everything through its toCursor, so it must clear the flag
    // (otherwise every later output keeps returning RESYNC).
    var drifted = TerminalCursorState.established(
      watchID: "watch", generation: "generation-a", toCursor: 108, transcript: "kept"
    )
    drifted.needsResync = true
    let continuation = TerminalCursorFrame(
      kind: .baseline,
      terminalID: "terminal",
      watchID: "watch",
      generation: "generation-a",
      fromCursor: 108,
      toCursor: 111,
      data: "ijk"
    )
    let appended = TerminalCursorReconciler.reconcile(state: drifted, frame: continuation)
    XCTAssertEqual(appended.action, .append)
    XCTAssertFalse(appended.state.needsResync)

    // Up-to-date marker: empty continuation at the retained position.
    let marker = TerminalCursorFrame(
      kind: .baseline,
      terminalID: "terminal",
      watchID: "watch",
      generation: "generation-a",
      fromCursor: 111,
      toCursor: 111,
      data: ""
    )
    let current = TerminalCursorReconciler.reconcile(state: appended.state, frame: marker)
    XCTAssertEqual(current.action, .ignore)
    XCTAssertFalse(current.state.needsResync)
    XCTAssertEqual(current.state.transcript, "keptijk")
  }

  func testV1LiveOutputReadsAnOptionalObservedWidth() throws {
    func outputMessage(columns: RichJSON?) -> RichJSON {
      var sync: [String: RichJSON] = [
        "version": .number(1),
        "watchId": .string("watch-1"),
        "generation": .string("generation-1"),
        "fromCursor": .number(0),
        "toCursor": .number(5),
      ]
      if let columns { sync["terminalColumns"] = columns }
      return .object([
        "type": .string("terminal-output"),
        "id": .string("terminal-1"),
        "data": .string("hello"),
        "cursorSync": .object(sync),
      ])
    }

    let measured = try TerminalCursorFrameDecoder.decode(outputMessage(columns: .number(48)))
    XCTAssertEqual(
      measured.columnChanges, [TerminalCursorColumnChange(fromCursor: 0, columns: 48)])

    // Unusable widths and absent fields stay widthless; the frame is intact.
    for unusable in [RichJSON.number(10), .number(401), .string("wide"), .null] {
      let frame = try TerminalCursorFrameDecoder.decode(outputMessage(columns: unusable))
      XCTAssertEqual(frame.data, "hello")
      XCTAssertEqual(frame.columnChanges, [])
    }
    let absent = try TerminalCursorFrameDecoder.decode(outputMessage(columns: nil))
    XCTAssertEqual(absent.columnChanges, [])
  }

  func testV1LiveOutputIgnoresWidthOnEmptyData() throws {
    let frame = try TerminalCursorFrameDecoder.decode(.object([
      "type": .string("terminal-output"),
      "id": .string("terminal-1"),
      "data": .string(""),
      "cursorSync": .object([
        "version": .number(1),
        "watchId": .string("watch-1"),
        "generation": .string("generation-1"),
        "fromCursor": .number(7),
        "toCursor": .number(7),
        "terminalColumns": .number(100),
      ]),
    ]))
    XCTAssertEqual(frame.columnChanges, [])
  }

  func testV1ReadyResultReadsColumnChangesAndDropsMalformedOnes() throws {
    func resultMessage(
      changes: RichJSON?, data: String = "hello world", from: Int64 = 0, to: Int64 = 11
    ) -> RichJSON {
      var result: [String: RichJSON] = [
        "status": .string("ready"),
        "generation": .string("generation-1"),
        "fromCursor": .number(Decimal(from)),
        "toCursor": .number(Decimal(to)),
        "data": .string(data),
      ]
      if let changes { result["columnChanges"] = changes }
      return .object([
        "type": .string("terminal-watch-result"),
        "id": .string("terminal-1"),
        "cursorSync": .object([
          "version": .number(1),
          "watchId": .string("watch-1"),
          "result": .object(result),
        ]),
      ])
    }

    let accepted = try TerminalCursorFrameDecoder.decode(
      resultMessage(
        changes: .array([
          .object(["fromCursor": .number(0), "columns": .number(48)]),
          .object(["fromCursor": .number(5), "columns": .null]),
          .object(["fromCursor": .number(8), "columns": .number(100)]),
        ])
      )
    )
    XCTAssertEqual(
      accepted.columnChanges,
      [
        TerminalCursorColumnChange(fromCursor: 0, columns: 48),
        TerminalCursorColumnChange(fromCursor: 5, columns: nil),
        TerminalCursorColumnChange(fromCursor: 8, columns: 100),
      ]
    )

    // Malformed optional chronology becomes empty while the raw frame stays.
    let malformed: [RichJSON] = [
      .array([.object(["fromCursor": .number(9), "columns": .number(48)]),
              .object(["fromCursor": .number(2), "columns": .number(100)])]),
      .array([.object(["fromCursor": .number(0), "columns": .number(10)])]),
      .array([.object(["fromCursor": .number(0)])]),
      .array([.string("bogus")]),
      .string("bogus"),
      .number(48),
    ]
    for changes in malformed {
      let frame = try TerminalCursorFrameDecoder.decode(resultMessage(changes: changes))
      XCTAssertEqual(frame.data, "hello world")
      XCTAssertEqual(frame.toCursor, 11)
      XCTAssertEqual(frame.columnChanges, [])
    }
    let absent = try TerminalCursorFrameDecoder.decode(resultMessage(changes: nil))
    XCTAssertEqual(absent.columnChanges, [])

    // An empty ready payload carries no width history, mirroring the scalar path.
    let emptyReady = try TerminalCursorFrameDecoder.decode(
      resultMessage(
        changes: .array([.object(["fromCursor": .number(0), "columns": .number(48)])]),
        data: "", from: 0, to: 0
      )
    )
    XCTAssertEqual(emptyReady.columnChanges, [])
  }

  private func decodePrevious(_ value: RichJSON?) throws -> TerminalCursorPosition? {
    guard let value, value != .null else { return nil }
    let object = try richFixtureObject(value)
    let generation: String?
    if object["generation"] == .null {
      generation = nil
    } else {
      generation = try XCTUnwrap(object["generation"]?.stringValue)
    }
    return TerminalCursorPosition(
      generation: generation,
      toCursor: try XCTUnwrap(object["toCursor"]?.exactInt64Value)
    )
  }
}
