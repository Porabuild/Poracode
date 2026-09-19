import XCTest

@testable import App

/// V5 plan 5.1: raw hardware-keyboard passthrough encodes the exact byte
/// sequences a PTY expects — plain characters verbatim, Ctrl chords as C0
/// control codes, and every other modified key as xterm-compatible CSI.
final class TerminalRawKeyInputTests: XCTestCase {
  private func encode(
    _ key: TerminalHardwareKeyEvent.Key,
    _ modifiers: TerminalHardwareKeyEvent.Modifiers = []
  ) -> String {
    TerminalRawKeyEncoder.encode(TerminalHardwareKeyEvent(key: key, modifiers: modifiers))
  }

  private static var control: TerminalHardwareKeyEvent.Modifiers { .control }
  private static var shift: TerminalHardwareKeyEvent.Modifiers { .shift }
  private static var command: TerminalHardwareKeyEvent.Modifiers { .command }
  private static var alternate: TerminalHardwareKeyEvent.Modifiers { .alternate }

  // MARK: plain keys

  func testPlainCharactersPassThroughVerbatim() {
    XCTAssertEqual(encode(.character("q"), []), "q")
    XCTAssertEqual(encode(.character(" "), []), " ")
    XCTAssertEqual(encode(.character("é"), []), "é")
  }

  func testPlainFunctionalKeysUseClassicSequences() {
    XCTAssertEqual(encode(.enter), "\r")
    XCTAssertEqual(encode(.backspace), "\u{7F}")
    XCTAssertEqual(encode(.tab), "\t")
    XCTAssertEqual(encode(.escape), "\u{1B}")
    XCTAssertEqual(encode(.up), "\u{1B}[A")
    XCTAssertEqual(encode(.down), "\u{1B}[B")
    XCTAssertEqual(encode(.right), "\u{1B}[C")
    XCTAssertEqual(encode(.left), "\u{1B}[D")
    XCTAssertEqual(encode(.home), "\u{1B}[H")
    XCTAssertEqual(encode(.end), "\u{1B}[F")
    XCTAssertEqual(encode(.pageUp), "\u{1B}[5~")
    XCTAssertEqual(encode(.pageDown), "\u{1B}[6~")
  }

  // MARK: Ctrl chords (the minimum set the plan names: C, D, L)

  func testControlChordsFoldToC0ControlCodes() {
    XCTAssertEqual(encode(.character("c"), .control), "\u{03}", "Ctrl+C interrupts")
    XCTAssertEqual(encode(.character("d"), .control), "\u{04}", "Ctrl+D is EOF")
    XCTAssertEqual(encode(.character("l"), .control), "\u{0C}", "Ctrl+L clears")
    XCTAssertEqual(encode(.character("a"), .control), "\u{01}")
    XCTAssertEqual(encode(.character("z"), .control), "\u{1A}")
    XCTAssertEqual(encode(.character("C"), .control), "\u{03}", "uppercase input folds identically")
  }

  func testControlPunctuationBandFoldsToC0() {
    XCTAssertEqual(encode(.character("@"), .control), "\u{00}")
    XCTAssertEqual(encode(.character("["), .control), "\u{1B}")
    XCTAssertEqual(encode(.character("\\"), .control), "\u{1C}")
    XCTAssertEqual(encode(.character("]"), .control), "\u{1D}")
    XCTAssertEqual(encode(.character("^"), .control), "\u{1E}")
    XCTAssertEqual(encode(.character("_"), .control), "\u{1F}")
  }

  func testShiftedControlChordStillFolds() {
    XCTAssertEqual(encode(.character("c"), [.control, .shift]), "\u{03}")
  }

  // MARK: shift

  func testShiftUppercasesCharacters() {
    XCTAssertEqual(encode(.character("a"), .shift), "A")
    XCTAssertEqual(encode(.character("A"), .shift), "A")
  }

  func testShiftTabIsBacktab() {
    XCTAssertEqual(encode(.tab, .shift), "\u{1B}[Z")
  }

  func testShiftedArrowsCarryTheShiftModifier() {
    XCTAssertEqual(encode(.up, .shift), "\u{1B}[1;2A")
    XCTAssertEqual(encode(.down, .shift), "\u{1B}[1;2B")
  }

  // MARK: modified CSI forms

  func testControlArrowsUseTheXtermModifierForm() {
    XCTAssertEqual(encode(.up, .control), "\u{1B}[1;5A")
    XCTAssertEqual(encode(.left, .control), "\u{1B}[1;5D")
  }

  func testCommandModifiedCharacterUsesCsiU() {
    XCTAssertEqual(encode(.character("c"), .command), "\u{1B}[67;9u")
    XCTAssertEqual(encode(.character("c"), [.control, .command]), "\u{1B}[67;13u")
  }

  func testAlternateModifiedCharacterUsesCsiU() {
    XCTAssertEqual(encode(.character("b"), .alternate), "\u{1B}[66;3u")
  }

  func testControlModifiedFunctionalKeysUseCsiU() {
    XCTAssertEqual(encode(.enter, .control), "\u{1B}[13;5u")
    XCTAssertEqual(encode(.backspace, .control), "\u{1B}[127;5u")
    XCTAssertEqual(encode(.escape, .control), "\u{1B}[27;5u")
    XCTAssertEqual(encode(.tab, .control), "\u{1B}[9;5u")
  }

  // MARK: UIKit mapping

  func testUIKitKeyCodeMappingProducesNormalizedEvents() {
    let event = TerminalTranscriptView.terminalEvent(
      keyCodeRawValue: TerminalTranscriptView.cUsage,
      charactersIgnoringModifiers: "c",
      modifierFlags: .control
    )
    XCTAssertEqual(
      event,
      TerminalHardwareKeyEvent(key: .character("c"), modifiers: .control)
    )

    let arrow = TerminalTranscriptView.terminalEvent(
      keyCodeRawValue: TerminalTranscriptView.upArrowUsage,
      charactersIgnoringModifiers: "",
      modifierFlags: []
    )
    XCTAssertEqual(arrow?.key, .up)
    XCTAssertEqual(arrow?.modifiers, [])

    // Functional keys map before any character fallback, even when the key
    // also reports a control character.
    let enter = TerminalTranscriptView.terminalEvent(
      keyCodeRawValue: TerminalTranscriptView.returnUsage,
      charactersIgnoringModifiers: "\r",
      modifierFlags: []
    )
    XCTAssertEqual(enter?.key, .enter)

    // Non-printing characters with no functional mapping are dropped.
    XCTAssertNil(
      TerminalTranscriptView.terminalEvent(
        keyCodeRawValue: 0x9999,
        charactersIgnoringModifiers: "\u{01}",
        modifierFlags: []
      )
    )
  }

  func testUIKitControlChordRoundTripsToThePTYByte() {
    let encoded = TerminalTranscriptView.terminalEvent(
      keyCodeRawValue: TerminalTranscriptView.dUsage,
      charactersIgnoringModifiers: "d",
      modifierFlags: .control
    )
      .map(TerminalRawKeyEncoder.encode)
    XCTAssertEqual(encoded, "\u{04}")
  }
}
