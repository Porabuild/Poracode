import UIKit

/// One hardware-keyboard press, normalized away from UIKit types so the PTY
/// byte encoding is unit-testable without constructing `UIPress` events.
struct TerminalHardwareKeyEvent: Equatable, Sendable {
  enum Key: Equatable, Sendable {
    case character(String)
    case up
    case down
    case left
    case right
    case escape
    case tab
    case enter
    case backspace
    case home
    case end
    case pageUp
    case pageDown
  }

  struct Modifiers: OptionSet, Sendable {
    let rawValue: UInt

    static let shift = Modifiers(rawValue: 1 << 0)
    static let control = Modifiers(rawValue: 1 << 1)
    static let alternate = Modifiers(rawValue: 1 << 2)
    static let command = Modifiers(rawValue: 1 << 3)
  }

  var key: Key
  var modifiers: Modifiers
}

/// Encodes a hardware keyboard event into the byte sequence a PTY expects.
///
/// Plain characters pass through verbatim so typing reaches the remote shell
/// unchanged. Control alone maps to the classic C0 control codes (Ctrl+C ->
/// ETX, Ctrl+D -> EOT, Ctrl+L -> FF); every other modified key uses the
/// xterm-compatible CSI forms: `\u{1B}[1;<modifier><arrow>` for arrows and
/// `\u{1B}[<code>;<modifier>u` (CSI-u) for the rest.
enum TerminalRawKeyEncoder {
  static func encode(_ event: TerminalHardwareKeyEvent) -> String {
    let modifiers = event.modifiers
    switch event.key {
    case .character(let character):
      // Shift is realized by case, and Ctrl by the C0 fold, exactly when
      // control and shift are the only modifiers.
      if modifiers.subtracting([.shift, .control]).isEmpty {
        if modifiers.contains(.control), let control = controlCode(for: character) {
          return String(UnicodeScalar(control))
        }
        return modifiers.contains(.shift) ? character.uppercased() : character
      }
    default:
      if modifiers.isEmpty { return unmodified(event.key) }
      if modifiers == .shift, event.key == .tab { return "\u{1B}[Z" }
    }

    let modifier = csiModifier(modifiers)
    if let suffix = arrowSuffix(event.key) { return "\u{1B}[1;\(modifier)\(suffix)" }
    guard let codePoint = codePoint(event.key) else {
      // Unmappable modified keys fall back to the bare sequence rather than
      // dropping the keystroke silently.
      return unmodified(event.key)
    }
    return "\u{1B}[\(codePoint);\(modifier)u"
  }

  /// Bare-key sequences, with lowercase applied for shifted letters so the
  /// remote shell sees what the user sees.
  private static func unmodified(_ key: TerminalHardwareKeyEvent.Key) -> String {
    switch key {
    case .character(let character): character
    case .escape: "\u{1B}"
    case .tab: "\t"
    case .enter: "\r"
    case .backspace: "\u{7F}"
    case .up: "\u{1B}[A"
    case .down: "\u{1B}[B"
    case .right: "\u{1B}[C"
    case .left: "\u{1B}[D"
    case .home: "\u{1B}[H"
    case .end: "\u{1B}[F"
    case .pageUp: "\u{1B}[5~"
    case .pageDown: "\u{1B}[6~"
    }
  }

  /// C0 control codes for the ASCII set terminals treat as control chords:
  /// letters, plus the `@[\]^_` band that sits directly below them.
  private static func controlCode(for character: String) -> UInt8? {
    guard let ascii = character.uppercased().utf8.first, ascii >= 0x40, ascii <= 0x5F,
      character.utf8.count == 1
    else {
      return nil
    }
    // 0x40 ('@') maps to NUL and '_' maps to US; both are classic chords.
    return ascii &- 0x40
  }

  /// xterm modifier parameter: 1 + shift(1) + alt(2) + ctrl(4) + cmd(8).
  private static func csiModifier(_ modifiers: TerminalHardwareKeyEvent.Modifiers) -> Int {
    1
      + (modifiers.contains(.shift) ? 1 : 0)
      + (modifiers.contains(.alternate) ? 2 : 0)
      + (modifiers.contains(.control) ? 4 : 0)
      + (modifiers.contains(.command) ? 8 : 0)
  }

  private static func arrowSuffix(_ key: TerminalHardwareKeyEvent.Key) -> String? {
    switch key {
    case .up: "A"
    case .down: "B"
    case .right: "C"
    case .left: "D"
    default: nil
    }
  }

  private static func codePoint(_ key: TerminalHardwareKeyEvent.Key) -> Int? {
    switch key {
    case .escape: return 27
    case .tab: return 9
    case .enter: return 13
    case .backspace: return 127
    case .home: return 1
    case .end: return 4
    case .pageUp: return 5
    case .pageDown: return 6
    case .up, .down, .left, .right: return nil
    case .character(let character):
      guard let scalar = character.uppercased().unicodeScalars.first,
        scalar.value >= 0x20, scalar.value <= 0x10FFFF,
        character.unicodeScalars.count == 1
      else {
        return nil
      }
      return Int(scalar.value)
    }
  }
}

/// The read-only terminal transcript with hardware-keyboard passthrough.
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
