import XCTest
@testable import App

/// Covers the native port of the PWA's terminal query handling: live PTY
/// output answers device-attribute/status queries while baseline replay only
/// advances the tracked cursor (mirroring `terminalQuerySuppression`).
final class TerminalQueryResponderTests: XCTestCase {
  func testLivePrimaryDeviceAttributeIsAnswered() {
    var replies: [String] = []
    let responder = TerminalQueryResponder { replies.append($0) }
    responder.offerLive("\u{1B}[0c")
    XCTAssertEqual(replies, ["\u{1B}[?1;2c"])
  }

  func testLiveCursorPositionReportTracksPosition() {
    var replies: [String] = []
    let responder = TerminalQueryResponder { replies.append($0) }
    responder.offerLive("ab\ncd")
    responder.offerLive("\u{1B}[6n")
    XCTAssertEqual(replies, ["\u{1B}[2;3R"])
  }

  func testBaselineReplayNeverAnswersQueries() {
    var replies: [String] = []
    let responder = TerminalQueryResponder { replies.append($0) }
    responder.offerBaseline("\u{1B}[0c\u{1B}[6n")
    XCTAssertTrue(replies.isEmpty)
  }

  func testSplitEscapeSequenceIsBuffered() {
    var replies: [String] = []
    let responder = TerminalQueryResponder { replies.append($0) }
    responder.offerLive("\u{1B}[")
    XCTAssertTrue(replies.isEmpty)
    responder.offerLive("0c")
    XCTAssertEqual(replies, ["\u{1B}[?1;2c"])
  }

  func testSecondaryDeviceAttributeAndStatusReport() {
    var replies: [String] = []
    let responder = TerminalQueryResponder { replies.append($0) }
    responder.offerLive("\u{1B}[>c")
    responder.offerLive("\u{1B}[5n")
    XCTAssertEqual(replies, ["\u{1B}[>0;276;0c", "\u{1B}[0n"])
  }
}
