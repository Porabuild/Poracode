import SwiftUI
import UIKit
import XCTest

@testable import App

/// The terminal input must carry commands verbatim: smart punctuation used to
/// rewrite typed quotes and dashes (`'` → `’`, `--` → `—`), corrupting shell
/// commands, so the entry surface is a trait-configured `UITextView` whose
/// Return key sends while pasted text — newlines included — only ever
/// inserts.
@MainActor
final class TerminalCommandFieldTests: XCTestCase {
  // MARK: - Verbatim input traits

  func testTheFieldDisablesEverySmartMutationTrait() {
    let view = TerminalCommandTextView()

    XCTAssertEqual(view.smartQuotesType, .no)
    XCTAssertEqual(view.smartDashesType, .no)
    XCTAssertEqual(view.smartInsertDeleteType, .no)
    XCTAssertEqual(view.autocorrectionType, .no)
    XCTAssertEqual(view.spellCheckingType, .no)
    XCTAssertEqual(view.autocapitalizationType, .none)
  }

  func testTheKeyboardStaysUnicodeCapable() {
    let view = TerminalCommandTextView()

    XCTAssertEqual(view.keyboardType, .default)
    XCTAssertNotEqual(
      view.keyboardType,
      .asciiCapable,
      "Commands carry Unicode (CJK, emoji); the keyboard must not be narrowed"
    )
  }

  func testTheReturnKeySendsAndIsEnabledOnlyWithContent() {
    let view = TerminalCommandTextView()

    XCTAssertEqual(view.returnKeyType, .send)
    XCTAssertTrue(view.enablesReturnKeyAutomatically)
  }

  func testTheFieldShipsTerminalSurfaceDefaults() {
    let view = TerminalCommandTextView()

    XCTAssertEqual(view.backgroundColor, .clear)
    XCTAssertEqual(view.overrideUserInterfaceStyle, .dark)
    XCTAssertEqual(view.keyboardAppearance, .dark)
    XCTAssertEqual(view.textContainer.lineFragmentPadding, 0)
    XCTAssertEqual(
      view.textContainerInset.top,
      TerminalCommandFieldLayout.verticalInset
    )
    XCTAssertTrue(view.isAccessibilityElement)
    XCTAssertTrue(view.isSelectable)
    XCTAssertTrue(view.isEditable)
  }

  // MARK: - Return sends, paste only inserts

  func testReturnSubmitsAndNeverEntersTheCommand() {
    var submissions = 0
    let coordinator = makeCoordinator(onSubmit: { submissions += 1 })
    let view = TerminalCommandTextView()
    view.delegate = coordinator

    let decision = coordinator.textView(
      view,
      shouldChangeTextIn: NSRange(location: 3, length: 0),
      replacementText: "\n"
    )

    XCTAssertFalse(decision, "The newline must never become part of the command")
    XCTAssertEqual(submissions, 1)
  }

  func testTypedTextAndMultiLinePastesAreInsertedVerbatim() {
    var submissions = 0
    let coordinator = makeCoordinator(onSubmit: { submissions += 1 })
    let view = TerminalCommandTextView()
    view.delegate = coordinator

    for replacement in ["'", "\"", "--", "漢字🌐", "printf 'a'\necho done"] {
      XCTAssertTrue(
        coordinator.textView(
          view,
          shouldChangeTextIn: NSRange(location: 0, length: 0),
          replacementText: replacement
        ),
        "Insertion must be allowed for: \(replacement)"
      )
    }
    XCTAssertEqual(submissions, 0)
  }

  func testAPastedNewlineIsInsertedAndNeverExecutes() {
    var submissions = 0
    let coordinator = makeCoordinator(onSubmit: { submissions += 1 })
    let view = TerminalCommandTextView()
    view.delegate = coordinator
    _ = view.becomeFirstResponder()

    UIPasteboard.general.string = "\n"
    view.paste(nil)

    XCTAssertEqual(view.text, "\n", "A lone-newline paste is content, not a send")
    XCTAssertEqual(submissions, 0)
    XCTAssertFalse(view.isPasting, "The paste intent must not stick")

    UIPasteboard.general.string = "printf 'a'\necho done"
    view.paste(nil)

    XCTAssertEqual(view.text, "\nprintf 'a'\necho done", "Pasted commands keep their newlines")
    XCTAssertEqual(submissions, 0)
  }

  func testAPastedNewlineReplacementNeverSubmitsWhileTheIntentFlagIsSet() {
    var submissions = 0
    let coordinator = makeCoordinator(onSubmit: { submissions += 1 })
    let view = TerminalCommandTextView()
    view.delegate = coordinator

    view.isPasting = true
    XCTAssertTrue(
      coordinator.textView(
        view,
        shouldChangeTextIn: NSRange(location: 0, length: 0),
        replacementText: "\n"
      ),
      "A paste-flagged newline inserts instead of sending"
    )
    XCTAssertEqual(submissions, 0)
  }

  func testReturnDuringIMECompositionBelongsToTheKeyboard() {
    var submissions = 0
    let coordinator = makeCoordinator(onSubmit: { submissions += 1 })
    let view = TerminalCommandTextView()
    view.delegate = coordinator

    view.setMarkedText("漢字", selectedRange: NSRange(location: 0, length: 0))
    XCTAssertNotNil(view.markedTextRange)

    XCTAssertTrue(
      coordinator.textView(
        view,
        shouldChangeTextIn: NSRange(location: 2, length: 0),
        replacementText: "\n"
      ),
      "While composition is marked, Return goes to the IME, not to the host"
    )
    XCTAssertEqual(submissions, 0)

    view.unmarkText()
    XCTAssertNil(view.markedTextRange)
    XCTAssertFalse(
      coordinator.textView(
        view,
        shouldChangeTextIn: NSRange(location: 2, length: 0),
        replacementText: "\n"
      ),
      "Once composed, Return sends"
    )
    XCTAssertEqual(submissions, 1)
  }

  func testADisabledFieldNeverSubmits() {
    var submissions = 0
    let coordinator = TerminalCommandField.Coordinator(
      parent: makeField(isDisabled: true, onSubmit: { submissions += 1 })
    )
    let view = TerminalCommandTextView()

    XCTAssertTrue(
      coordinator.textView(
        view,
        shouldChangeTextIn: NSRange(location: 0, length: 0),
        replacementText: "\n"
      )
    )
    XCTAssertEqual(submissions, 0, "A disabled field has no sender")
  }

  // MARK: - Binding roundtrip

  func testTypingReachesTheBindingUntouched() {
    var bound = ""
    let field = makeField(text: Binding(get: { bound }, set: { bound = $0 }))
    let coordinator = TerminalCommandField.Coordinator(parent: field)
    let view = TerminalCommandTextView()
    let command = "printf '漢字🌐' --flag='quoted value'"

    view.text = command
    coordinator.textViewDidChange(view)

    XCTAssertEqual(bound, command, "The binding must receive the exact typed text")
  }

  // MARK: - Multiline sizing (the previous lineLimit(1...4))

  func testHeightGrowsByWholeLinesFromOneToTheFourLineCap() {
    let lineHeight: CGFloat = 16
    let insets = TerminalCommandFieldLayout.verticalInset * 2

    XCTAssertEqual(
      TerminalCommandFieldLayout.height(fitted: lineHeight + insets, lineHeight: lineHeight),
      lineHeight + insets,
      "A single line is the resting height"
    )
    XCTAssertEqual(
      TerminalCommandFieldLayout.height(fitted: lineHeight + insets + 1, lineHeight: lineHeight),
      lineHeight * 2 + insets,
      "A wrapped sliver still gets a whole line"
    )
    XCTAssertEqual(
      TerminalCommandFieldLayout.height(fitted: 10_000, lineHeight: lineHeight),
      lineHeight * CGFloat(TerminalCommandFieldLayout.maximumLines) + insets,
      "Beyond the cap the text view scrolls instead of growing"
    )
    XCTAssertEqual(
      TerminalCommandFieldLayout.height(fitted: 0, lineHeight: lineHeight),
      lineHeight + insets
    )
  }

  // MARK: - Access vs availability

  func testAvailabilityDistinguishesAccessFromConnectivity() {
    XCTAssertEqual(TerminalInputAvailability.resolve(canOperate: true, isLive: true), .operable)
    XCTAssertEqual(
      TerminalInputAvailability.resolve(canOperate: false, isLive: true),
      .readOnly,
      "A live transport with a denied scope is the only genuine read-only state"
    )
    XCTAssertEqual(
      TerminalInputAvailability.resolve(canOperate: false, isLive: false),
      .unavailable,
      "A lost host connection must not be reported as read-only"
    )
    XCTAssertEqual(TerminalInputAvailability.resolve(canOperate: true, isLive: false), .unavailable)
  }

  // MARK: - Fixtures

  private func makeField(
    text: Binding<String> = .constant(""),
    isDisabled: Bool = false,
    onSubmit: @escaping () -> Void = {}
  ) -> TerminalCommandField {
    TerminalCommandField(
      text: text,
      pointSize: 13,
      isDisabled: isDisabled,
      accessibilityLabel: "Terminal input",
      onSubmit: onSubmit
    )
  }

  private func makeCoordinator(onSubmit: @escaping () -> Void = {})
    -> TerminalCommandField
    .Coordinator
  {
    TerminalCommandField.Coordinator(parent: makeField(onSubmit: onSubmit))
  }
}
