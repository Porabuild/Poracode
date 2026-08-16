import XCTest

@testable import App

final class TerminalANSIParserTests: XCTestCase {
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
  }
}
