import UIKit

/// The read-only terminal transcript with hardware-keyboard passthrough.
///
/// The normalized event type and the PTY byte encoding live in the generated
/// `TerminalKeyEncoding.swift` (`TerminalRawKeyEncoder`, rendered from the
/// shared `terminalKeyEncodingSpec.ts`); this file owns only the UIKit press
/// mapping and the view plumbing.
///
/// The view stays non-editable — the transcript is host-owned output, never
/// user text — so raw input arrives through the responder-chain `presses`
/// events UIKit delivers to the first responder for physical keyboards,
/// instead of the text-input system. Tapping the transcript claims first
/// responder; on-screen typing keeps using the command field and key
/// accessory, which remain the touch affordances for the PTY.
final class TerminalTranscriptView: UITextView {
  /// Called with the PTY byte sequence for each handled hardware keypress.
  var onRawKeyInput: ((String) -> Void)?

  override var canBecomeFirstResponder: Bool { true }

  override init(frame: CGRect, textContainer: NSTextContainer?) {
    super.init(frame: frame, textContainer: textContainer)
    let focusTap = UITapGestureRecognizer(
      target: self,
      action: #selector(focusForRawInput)
    )
    focusTap.cancelsTouchesInView = false
    addGestureRecognizer(focusTap)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

  @objc private func focusForRawInput() {
    guard !isFirstResponder else { return }
    becomeFirstResponder()
  }

  override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
    guard let encoded = Self.encode(presses: presses) else {
      super.pressesBegan(presses, with: event)
      return
    }
    onRawKeyInput?(encoded)
  }

  private static func encode(presses: Set<UIPress>) -> String? {
    var encoded = ""
    for press in presses {
      guard let key = press.key,
        let event = terminalEvent(
          keyCodeRawValue: key.keyCode.rawValue,
          charactersIgnoringModifiers: key.charactersIgnoringModifiers ?? "",
          modifierFlags: key.modifierFlags
        )
      else { continue }
      encoded += TerminalRawKeyEncoder.encode(event)
    }
    return encoded.isEmpty ? nil : encoded
  }

  /// Maps a UIKit key onto the normalized event. `UIKey` cannot be built in
  /// tests and its `KeyCode` type name is SDK-dependent, so this takes the
  /// stable USB HID usage value behind `key.keyCode` plus the two values the
  /// view reads alongside it.
  static func terminalEvent(
    keyCodeRawValue: Int,
    charactersIgnoringModifiers: String,
    modifierFlags: UIKeyModifierFlags
  ) -> TerminalHardwareKeyEvent? {
    var modifiers: TerminalHardwareKeyEvent.Modifiers = []
    if modifierFlags.contains(.shift) { modifiers.insert(.shift) }
    if modifierFlags.contains(.control) { modifiers.insert(.control) }
    if modifierFlags.contains(.alternate) { modifiers.insert(.alternate) }
    if modifierFlags.contains(.command) { modifiers.insert(.command) }

    let key: TerminalHardwareKeyEvent.Key
    switch keyCodeRawValue {
    case Self.upArrowUsage: key = .up
    case Self.downArrowUsage: key = .down
    case Self.leftArrowUsage: key = .left
    case Self.rightArrowUsage: key = .right
    case Self.escapeUsage: key = .escape
    case Self.tabUsage: key = .tab
    case Self.returnUsage: key = .enter
    case Self.backspaceUsage: key = .backspace
    case Self.homeUsage: key = .home
    case Self.endUsage: key = .end
    case Self.pageUpUsage: key = .pageUp
    case Self.pageDownUsage: key = .pageDown
    default:
      let character = charactersIgnoringModifiers
      guard character.count == 1, let scalar = character.unicodeScalars.first,
        scalar.value >= 0x20
      else {
        return nil
      }
      key = .character(character)
    }
    return TerminalHardwareKeyEvent(key: key, modifiers: modifiers)
  }

  // USB HID keyboard usage values (the stable codes `UIKey.KeyCode` wraps).
  static let aUsage: Int = 0x04
  static let cUsage: Int = 0x07
  static let dUsage: Int = 0x08
  static let lUsage: Int = 0x0F
  static let escapeUsage: Int = 0x29
  static let backspaceUsage: Int = 0x2A
  static let tabUsage: Int = 0x2B
  static let returnUsage: Int = 0x58
  static let leftArrowUsage: Int = 0x50
  static let rightArrowUsage: Int = 0x4F
  static let downArrowUsage: Int = 0x51
  static let upArrowUsage: Int = 0x52
  static let pageUpUsage: Int = 0x4B
  static let pageDownUsage: Int = 0x4E
  static let homeUsage: Int = 0x4A
  static let endUsage: Int = 0x4D
}
