// GENERATED FILE. Do not edit by hand. Run `pnpm protocol:remote:v3:generate`.
// Terminal hardware-key encoding rendered from the declarative spec in
// src/shared/remote/contract/terminalKeyEncodingSpec.ts (spec version 1).
import Foundation

/// One hardware-keyboard press, normalized away from UIKit/AppKit types so
/// the PTY byte encoding is unit-testable without constructing press events.
public struct TerminalHardwareKeyEvent: Equatable, Sendable {
  public enum Key: Equatable, Sendable {
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

  /// Modifier flags whose raw values double as the xterm CSI-u modifier
  /// contributions (spec `modifierFlags`).
  public struct Modifiers: OptionSet, Equatable, Sendable {
    public let rawValue: UInt
    public init(rawValue: UInt) { self.rawValue = rawValue }
    public static let shift = Modifiers(rawValue: 1)
    public static let alternate = Modifiers(rawValue: 2)
    public static let control = Modifiers(rawValue: 4)
    public static let command = Modifiers(rawValue: 8)
  }

  public var key: Key
  public var modifiers: Modifiers

  public init(key: Key, modifiers: Modifiers) {
    self.key = key
    self.modifiers = modifiers
  }
}

enum TerminalKeyGuardKind {
  case characterOnlyShift
  case characterBare
  case characterPreFolded
  case characterC0Fold
  case namedBare
  case tabShiftOnly
  case arrowKey
  case csiUMappable
  case always
}

enum TerminalKeyEffectKind {
  case uppercase
  case verbatim
  case c0Control
  case bareSequence
  case backTab
  case arrowCsi
  case csiU
  case passthrough
}

struct TerminalKeyRule {
  let id: String
  let guardKind: TerminalKeyGuardKind
  let effect: TerminalKeyEffectKind
}

/// THE terminal hardware-key encoder, generated from one spec shared with
/// Kotlin and the TS contract tests. The pure key -> PTY-string mapping only:
/// event normalization (UIKit press mapping) and UI stay in the app-owned
/// coordinators that consume this API.
public enum TerminalRawKeyEncoder {
  /// Ordered first-match encoding rules (spec `rules`); the first matching
  /// row wins, and the passthrough catch-all is last so a keystroke is never
  /// dropped.
  static let rules: [TerminalKeyRule] = [
    TerminalKeyRule(id: "character-only-shift", guardKind: .characterOnlyShift, effect: .uppercase),
    TerminalKeyRule(id: "character-bare", guardKind: .characterBare, effect: .verbatim),
    TerminalKeyRule(id: "character-prefolded", guardKind: .characterPreFolded, effect: .verbatim),
    TerminalKeyRule(id: "character-c0-fold", guardKind: .characterC0Fold, effect: .c0Control),
    TerminalKeyRule(id: "named-bare", guardKind: .namedBare, effect: .bareSequence),
    TerminalKeyRule(id: "tab-backtab", guardKind: .tabShiftOnly, effect: .backTab),
    TerminalKeyRule(id: "arrow-modified", guardKind: .arrowKey, effect: .arrowCsi),
    TerminalKeyRule(id: "csi-u", guardKind: .csiUMappable, effect: .csiU),
    TerminalKeyRule(id: "passthrough-fallback", guardKind: .always, effect: .passthrough),
  ]

  /// The dedicated Back-Tab sequence (spec `backtabSequence`).
  static let backtabSequence = "\u{1b}[Z"

  /// Modifier flags in spec order; values double as the xterm CSI-u
  /// modifier contributions.
  static let modifierFlags: [(TerminalHardwareKeyEvent.Modifiers, Int)] = [
      (.shift, 1),
      (.alternate, 2),
      (.control, 4),
      (.command, 8),
  ]

  static let c0FoldRange = UInt32(64)...UInt32(95)
  /// Surrogates never encode (defensive: Strings cannot store lone
  /// surrogates, but the check keeps every platform byte-identical).
  static let surrogateRange = UInt32(55296)...UInt32(57343)

  public static func encode(_ event: TerminalHardwareKeyEvent) -> String {
    for rule in rules where matches(rule.guardKind, event) {
      return apply(rule.effect, event)
    }
    // The spec table ends with the passthrough catch-all.
    return apply(.passthrough, event)
  }

  static func characterText(_ key: TerminalHardwareKeyEvent.Key) -> String? {
    if case .character(let text) = key { return text }
    return nil
  }

  static func matches(
    _ guardKind: TerminalKeyGuardKind, _ event: TerminalHardwareKeyEvent
  ) -> Bool {
    let modifiers = event.modifiers
    let text = characterText(event.key)
    switch guardKind {
    case .characterOnlyShift:
      return text != nil && modifiers == .shift
    case .characterBare:
      return text != nil && modifiers.isEmpty
    case .characterPreFolded:
      // Some input pipelines already fold the chord to its C0 byte; never
      // double-fold those.
      guard let text, modifiers.contains(.control), !modifiers.contains(.alternate),
        !modifiers.contains(.command)
      else { return false }
      guard let scalar = singleScalarCodePoint(text) else { return false }
      return scalar < UInt32(32)
    case .characterC0Fold:
      // The fold measures Unicode scalars: the uppercase form must be
      // exactly one scalar inside the band ('ß' -> "SS" does not fold).
      guard let text, modifiers.contains(.control), !modifiers.contains(.alternate),
        !modifiers.contains(.command)
      else { return false }
      guard let folded = singleScalarCodePoint(text.uppercased()) else { return false }
      return c0FoldRange.contains(folded)
    case .namedBare:
      return text == nil && modifiers.isEmpty
    case .tabShiftOnly:
      return event.key == .tab && modifiers == .shift
    case .arrowKey:
      return arrowSuffix(event.key) != nil
    case .csiUMappable:
      return codePoint(for: event) != nil
    case .always:
      return true
    }
  }

  static func apply(
    _ effect: TerminalKeyEffectKind, _ event: TerminalHardwareKeyEvent
  ) -> String {
    let modifiers = event.modifiers
    let key = event.key
    let text = characterText(key) ?? ""
    switch effect {
    case .uppercase:
      return text.uppercased()
    case .verbatim:
      return text
    case .c0Control:
      return String(UnicodeScalar(singleScalarCodePoint(text.uppercased())! - UInt32(64))!)
    case .bareSequence:
      return bareSequence(key)
    case .backTab:
      return backtabSequence
    case .arrowCsi:
      return "\u{1B}[1;\(csiModifier(modifiers))\(arrowSuffix(key)!)"
    case .csiU:
      return "\u{1B}[\(codePoint(for: event)!);\(csiModifier(modifiers))u"
    case .passthrough:
      // Unmappable keys fall back to the bare sequence rather than
      // dropping the keystroke or emitting a malformed escape.
      if case .character = key { return text }
      return bareSequence(key)
    }
  }

  /// xterm modifier parameter: 1 + shift(1) + alt(2) + ctrl(4) + cmd(8).
  static func csiModifier(_ modifiers: TerminalHardwareKeyEvent.Modifiers) -> Int {
    1 + modifierFlags.reduce(0) { sum, flag in sum + (modifiers.contains(flag.0) ? flag.1 : 0) }
  }

  /// Bare-key sequences (spec `bareSequences`). The character entry is
  /// table-completeness only — character keys pass their own text through
  /// and never reach it.
  static func bareSequence(_ key: TerminalHardwareKeyEvent.Key) -> String {
    switch key {
    case .character: return ""
    case .up: return "\u{1b}[A"
    case .down: return "\u{1b}[B"
    case .left: return "\u{1b}[D"
    case .right: return "\u{1b}[C"
    case .escape: return "\u{1b}"
    case .tab: return "\u{9}"
    case .enter: return "\u{d}"
    case .backspace: return "\u{7f}"
    case .home: return "\u{1b}[H"
    case .end: return "\u{1b}[F"
    case .pageUp: return "\u{1b}[5~"
    case .pageDown: return "\u{1b}[6~"
    }
  }

  static func arrowSuffix(_ key: TerminalHardwareKeyEvent.Key) -> String? {
    switch key {
    case .up: return "A"
    case .down: return "B"
    case .left: return "D"
    case .right: return "C"
    default: return nil
    }
  }

  /// CSI-u primary parameters for the named keys that are not arrows.
  static func namedCodePoint(_ key: TerminalHardwareKeyEvent.Key) -> Int? {
    switch key {
    case .backspace: return 127
    case .end: return 4
    case .enter: return 13
    case .escape: return 27
    case .home: return 1
    case .pageDown: return 6
    case .pageUp: return 5
    case .tab: return 9
    default: return nil
    }
  }

  /// A character maps into CSI-u only when its uppercase form is exactly
  /// one valid Unicode scalar inside 0x20...0x10ffff.
  static func codePoint(for event: TerminalHardwareKeyEvent) -> Int? {
    switch event.key {
    case .character(let text):
      guard let scalar = singleScalarCodePoint(text.uppercased()),
        scalar >= UInt32(32), scalar <= UInt32(0x10ffff),
        !surrogateRange.contains(scalar)
      else { return nil }
      return Int(scalar)
    default:
      return namedCodePoint(event.key)
    }
  }

  /// Exactly one valid Unicode scalar, surrogates excluded.
  static func singleScalarCodePoint(_ value: String) -> UInt32? {
    var iterator = value.unicodeScalars.makeIterator()
    guard let first = iterator.next(), iterator.next() == nil else { return nil }
    guard !surrogateRange.contains(first.value) else { return nil }
    return first.value
  }
}
