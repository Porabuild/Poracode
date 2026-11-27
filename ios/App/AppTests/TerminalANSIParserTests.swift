import XCTest

@testable import App

final class TerminalANSIParserTests: XCTestCase {
  func testCursorPaddingBoundsTheWholeDocumentAndKeepsTheRecentSuffix() {
    let paddedRow = String(repeating: " ", count: 1_000) + "X\n"
    let source = "oldest sentinel\n" + String(repeating: "\u{1B}[1000CX\n", count: 500) + "tail 漢字🌐"
    let output = TerminalANSIParser.render(source).plainText
    XCTAssertLessThanOrEqual(
      output.utf16.count, 2 * TerminalCursorReconciler.maximumTranscriptUTF16Units)
    XCTAssertFalse(output.contains("oldest sentinel"))
    XCTAssertTrue(output.hasSuffix(paddedRow + paddedRow + "tail 漢字🌐"))
  }

  func testWidePlainTextUsesTheFullRetainedTranscriptBudget() {
    let source = String(repeating: "漢", count: TerminalCursorReconciler.maximumTranscriptUTF16Units)
    XCTAssertEqual(TerminalANSIParser.render(source).plainText, source)
  }

  func testErasingAndResettingReleaseTheRenderedBudget() {
    let erasedRows = String(repeating: "\u{1B}[1000CX\r\u{1B}[2K\r", count: 500)
    XCTAssertEqual(
      TerminalANSIParser.render("KEEP\n" + erasedRows + "DONE").plainText, "KEEP\nDONE")
    let expanded = String(repeating: "\u{1B}[1000CX\n", count: 500)
    let wide = String(repeating: "漢", count: TerminalCursorReconciler.maximumTranscriptUTF16Units)
    XCTAssertEqual(TerminalANSIParser.render(expanded + "\u{1B}[2J" + wide).plainText, wide)
  }

  func testSingleRowBudgetTrimmingPreservesCompleteWideCells() {
    let wide = String(repeating: "漢", count: 190_000)
    let output = TerminalANSIParser.render("\u{1B}[199999C" + wide + "\u{1B}[2D🌐").plainText
    XCTAssertTrue(output.hasSuffix(String(wide.dropLast()) + "🌐"))
    XCTAssertLessThanOrEqual(
      output.utf16.count, 2 * TerminalCursorReconciler.maximumTranscriptUTF16Units)
  }

  func testTabAtTheFullRowBudgetTerminatesAndPreservesItsSpacing() {
    let wide = String(repeating: "漢", count: 190_000)
    let output = TerminalANSIParser.render("\u{1B}[199999C" + wide + "\tZ").plainText
    XCTAssertTrue(output.hasSuffix(wide + String(repeating: " ", count: 8) + "Z"))
    XCTAssertLessThanOrEqual(
      output.utf16.count, 2 * TerminalCursorReconciler.maximumTranscriptUTF16Units)
  }

  func testHostileCursorArgumentsStayInsideTheRetainedTranscriptBudget() {
    let rendered = TerminalANSIParser.render(
      "a\u{1B}[\(Int.max)Cy\u{1B}[\(Int.min)Gz"
    ).plainText
    XCTAssertTrue(rendered.hasPrefix("z"))
    XCTAssertTrue(rendered.hasSuffix("y"))
    XCTAssertLessThanOrEqual(
      rendered.utf16.count, TerminalCursorReconciler.maximumTranscriptUTF16Units + 1)
  }

  func testLargeUniformTranscriptKeepsItsTextAndOneStyleRun() {
    let source = String(repeating: "漢字🌐 plain ", count: 10_000)
    let rendered = TerminalANSIParser.render(source)
    XCTAssertEqual(rendered.plainText, source)
    XCTAssertEqual(rendered.runs.count, 1)
  }

  func testSharedUnicodeColumnProjection() throws {
    let fixture = try loadRichChatFixture("terminal-unicode-projection.json")
    for item in try richFixtureArray(try XCTUnwrap(fixture["cases"])) {
      let value = try richFixtureObject(item)
      let source = try XCTUnwrap(value["input"]?.stringValue)
      let expected = try XCTUnwrap(value["expected"]?.stringValue)
      XCTAssertEqual(
        TerminalANSIParser.render(source).plainText, expected, value["id"]?.stringValue ?? "")
    }
  }

  func testTerminalColumnReplayFixtureRendersTheRecordedLogicalTail() throws {
    let fixture = try loadRichChatFixture("terminal-column-replay.json")
    for item in try richFixtureArray(try XCTUnwrap(fixture["cases"])) {
      let value = try richFixtureObject(item)
      let id = try XCTUnwrap(value["id"]?.stringValue)
      let input = try XCTUnwrap(value["input"]?.stringValue)
      let expected = try richFixtureArray(try XCTUnwrap(value["expectedTail"]))
        .map { try XCTUnwrap($0.stringValue) }
      let markers = try richFixtureArray(try XCTUnwrap(value["columnChanges"])).map { entry in
        let object = try richFixtureObject(entry)
        let columns: Int?
        if object["columns"] == .null {
          columns = nil
        } else {
          columns = Int(try XCTUnwrap(object["columns"]?.exactInt64Value))
        }
        return TerminalCursorColumnChange(
          fromCursor: try XCTUnwrap(object["fromCursor"]?.exactInt64Value),
          columns: columns
        )
      }
      let rendered = TerminalANSIParser.render(input, fromCursor: 0, columnChanges: markers)
        .plainText
      let actual = rendered.split(separator: "\n").map {
        $0.trimmingCharacters(in: .whitespaces)
      }
      XCTAssertEqual(Array(actual.suffix(expected.count)), expected, id)
    }
  }

  func testUnknownAndAbsentColumnMarkersKeepTheWidthlessProjection() throws {
    let fixture = try loadRichChatFixture("terminal-column-replay.json")
    let item = try XCTUnwrap(richFixtureArray(try XCTUnwrap(fixture["cases"])).first)
    let value = try richFixtureObject(item)
    let input = try XCTUnwrap(value["input"]?.stringValue)
    let legacy = TerminalANSIParser.render(input).plainText
    // An explicit null marker is an unknown span: identical to no markers.
    XCTAssertEqual(
      TerminalANSIParser.render(
        input,
        columnChanges: [TerminalCursorColumnChange(fromCursor: 0, columns: nil)]
      ).plainText,
      legacy
    )
    // A known width followed by an unknown tail returns to widthless output
    // for the tail — here the whole document stays legacy once nil applies.
    XCTAssertEqual(
      TerminalANSIParser.render(
        input,
        columnChanges: [
          TerminalCursorColumnChange(fromCursor: 0, columns: 48),
          TerminalCursorColumnChange(fromCursor: 10, columns: nil),
        ]
      ).plainText,
      legacy
    )
  }

  func testWidthLimitedCursorForwardStaysInsideTheRowWithoutOverflow() {
    let rendered = TerminalANSIParser.render(
      "a\u{1B}[\(Int.max)Cy",
      columnChanges: [TerminalCursorColumnChange(fromCursor: 0, columns: 20)]
    ).plainText
    XCTAssertEqual(rendered, "a" + String(repeating: " ", count: 18) + "y")
  }

  func testWideGlyphWrappingOffTheLastColumnClearsTheBoundaryCell() {
    let rendered = TerminalANSIParser.render(
      String(repeating: "x", count: 20) + "\u{1B}[20G界",
      columnChanges: [TerminalCursorColumnChange(fromCursor: 0, columns: 20)]
    ).plainText
    XCTAssertEqual(rendered, String(repeating: "x", count: 19) + " " + "界")
  }

  func testWidthMarkerInsideACSISequenceAppliesBeforeTheCommandExecutes() {
    let rendered = TerminalANSIParser.render(
      "a\u{1B}[25GY",
      columnChanges: [
        TerminalCursorColumnChange(fromCursor: 0, columns: 20),
        TerminalCursorColumnChange(fromCursor: 3, columns: 40),
      ]
    ).plainText
    XCTAssertEqual(rendered, "a" + String(repeating: " ", count: 23) + "Y")
  }

  func testEraseLineAtThePendingWrapColumnPreservesTheFullRow() {
    let rendered = TerminalANSIParser.render(
      String(repeating: "x", count: 20) + "\u{1B}[K" + "Y",
      columnChanges: [TerminalCursorColumnChange(fromCursor: 0, columns: 20)]
    ).plainText
    XCTAssertEqual(rendered, String(repeating: "x", count: 20) + "Y")
  }

  func testWidthChangeAtThePendingWrapColumnKeepsTheLogicalPosition() {
    let markers = { (next: Int?) in
      [
        TerminalCursorColumnChange(fromCursor: 0, columns: 20),
        TerminalCursorColumnChange(fromCursor: 20, columns: next),
      ]
    }
    let source = String(repeating: "x", count: 20) + "Y"
    XCTAssertEqual(
      TerminalANSIParser.render(source, columnChanges: markers(40)).plainText,
      String(repeating: "x", count: 20) + "Y"
    )
    XCTAssertEqual(
      TerminalANSIParser.render(source, columnChanges: markers(nil)).plainText,
      String(repeating: "x", count: 20) + "Y"
    )
  }

  func testKnownWidthTabMovesToTheNextStopWithoutFillingCells() {
    let columnChanges = [TerminalCursorColumnChange(fromCursor: 0, columns: 20)]
    XCTAssertEqual(
      TerminalANSIParser.render(
        String(repeating: "x", count: 18) + "\tY",
        columnChanges: columnChanges
      ).plainText,
      String(repeating: "x", count: 18) + " Y"
    )
    XCTAssertEqual(
      TerminalANSIParser.render(
        String(repeating: "x", count: 20) + "\tY",
        columnChanges: columnChanges
      ).plainText,
      String(repeating: "x", count: 20) + "Y"
    )
  }

  func testColumnMarkersAreAbsoluteSoAShiftedTranscriptMatches() throws {
    let fixture = try loadRichChatFixture("terminal-column-replay.json")
    let item = try XCTUnwrap(richFixtureArray(try XCTUnwrap(fixture["cases"])).first)
    let value = try richFixtureObject(item)
    let input = try XCTUnwrap(value["input"]?.stringValue)
    let shifted = TerminalANSIParser.render(
      input,
      fromCursor: 500,
      columnChanges: [
        TerminalCursorColumnChange(fromCursor: 500, columns: 48),
        TerminalCursorColumnChange(fromCursor: 834, columns: 100),
      ]
    ).plainText
    let unshifted = TerminalANSIParser.render(
      input,
      columnChanges: [
        TerminalCursorColumnChange(fromCursor: 0, columns: 48),
        TerminalCursorColumnChange(fromCursor: 334, columns: 100),
      ]
    ).plainText
    XCTAssertEqual(shifted, unshifted)
  }

  func testSGRStylesAreRenderedWithoutEscapeText() {
    let rendered = TerminalANSIParser.render("plain \u{1B}[31;1mred\u{1B}[0m done")

    XCTAssertEqual(rendered.plainText, "plain red done")
    XCTAssertEqual(
      rendered.runs.first(where: { $0.text == "red" })?.style,
      TerminalANSIStyle(foreground: .standard(1), bold: true)
    )
  }

  func testCarriageReturnAndBackspaceOverwriteCurrentLine() {
    let rendered = TerminalANSIParser.render("progress 10%\rprogress 20%\nabc\u{8}Z")

    XCTAssertEqual(rendered.plainText, "progress 20%\nabZ")
  }

  func testCRLFOutputSurvivesTheNextPromptRedraw() {
    // Swift treats CRLF as one Character. A PTY's line ending must advance
    // the row before the shell redraws its prompt with carriage return.
    let rendered = TerminalANSIParser.render(
      "welcome\r\nPORACODE_NATIVE_QA_20260908\r\n\rprompt > \u{1B}[K"
    )

    XCTAssertEqual(rendered.plainText, "welcome\nPORACODE_NATIVE_QA_20260908\nprompt > ")
  }

  func testEraseLineAndClearScreenApplyTerminalProjection() {
    XCTAssertEqual(TerminalANSIParser.render("secret\r\u{1B}[2Kpublic").plainText, "public")
    XCTAssertEqual(TerminalANSIParser.render("old\ntext\u{1B}[2Jnew").plainText, "new")
  }

  func testRGBIndexedAndUnknownSequencesRemainBoundedPlainText() {
    let rendered = TerminalANSIParser.render(
      "\u{1B}[38;2;300;-1;12mA\u{1B}[48;5;200mB\u{1B}[?25lC"
    )

    XCTAssertEqual(rendered.plainText, "ABC")
    XCTAssertEqual(rendered.runs[0].style.foreground, .rgb(255, 0, 12))
    XCTAssertEqual(rendered.runs[1].style.background, .indexed(200))
  }

  func testOperatingSystemControlMetadataIsNotRenderedOrExposedToAccessibility() {
    let source = "before\u{1B}]0;private title\u{7}after\u{1B}]8;;https://example.test\u{1B}\\link"

    XCTAssertEqual(TerminalANSIParser.render(source).plainText, "beforeafterlink")
  }

  func testViewportMeasurementStaysInsideWireBounds() {
    XCTAssertNil(TerminalViewportMetrics.size(for: .zero))
    let size = TerminalViewportMetrics.size(for: CGSize(width: 10_000, height: 10_000))
    XCTAssertNotNil(size)
    XCTAssertTrue((1...1_000).contains(size?.columns ?? 0))
    XCTAssertTrue((1...1_000).contains(size?.rows ?? 0))
    XCTAssertEqual(PoracodeTerminalTextSize.resolve(7), 8)
    XCTAssertEqual(PoracodeTerminalTextSize.resolve(13), 13)
    XCTAssertEqual(PoracodeTerminalTextSize.resolve(21), 20)
    XCTAssertTrue(PoracodeTerminalTextSize.storageKey.hasSuffix(".v1"))
    XCTAssertTrue(PoracodeTerminalTextSize.projectStorageKey.hasSuffix(".v1"))
  }

  func testProjectTerminalSizeFallsBackToTheLegacySharedValueUntilCustomized() throws {
    let suite = "poracode.tests.terminal-size.\(UUID().uuidString)"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    defaults.set(17, forKey: PoracodeTerminalTextSize.storageKey)

    XCTAssertEqual(PoracodeTerminalTextSizeRole.agent.initialValue(in: defaults), 17)
    XCTAssertEqual(PoracodeTerminalTextSizeRole.project.initialValue(in: defaults), 17)

    defaults.set(11, forKey: PoracodeTerminalTextSize.projectStorageKey)
    XCTAssertEqual(PoracodeTerminalTextSizeRole.project.initialValue(in: defaults), 11)
  }

  func testVirtualTerminalAccessoryMatchesCompactKeyboardSequences() {
    XCTAssertEqual(TerminalVirtualKeyEncoder.encode(.escape), "\u{1B}")
    XCTAssertEqual(TerminalVirtualKeyEncoder.encode(.tab), "\t")
    XCTAssertEqual(TerminalVirtualKeyEncoder.encode(.enter), "\r")
    XCTAssertEqual(TerminalVirtualKeyEncoder.encode(.backspace), "\u{7F}")
    XCTAssertEqual(TerminalVirtualKeyEncoder.encode(.up), "\u{1B}[A")
    XCTAssertEqual(TerminalVirtualKeyEncoder.encode(.left), "\u{1B}[D")
    XCTAssertEqual(TerminalVirtualKeyEncoder.encode(.c, modifiers: [.control]), "\u{3}")
    XCTAssertEqual(TerminalVirtualKeyEncoder.encode(.tab, modifiers: [.control]), "\u{1B}[9;5u")
    XCTAssertEqual(TerminalVirtualKeyEncoder.encode(.tab, modifiers: [.shift]), "\u{1B}[Z")
    XCTAssertEqual(
      TerminalVirtualKeyEncoder.encode(.right, modifiers: [.shift, .command]),
      "\u{1B}[1;10C"
    )
    XCTAssertEqual(
      TerminalVirtualKeyEncoder.encode(.t, modifiers: [.command]),
      "\u{1B}[84;9u"
    )
  }
}
