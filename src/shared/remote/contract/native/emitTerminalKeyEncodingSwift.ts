import { compareUnicodeCodePoints } from "../unicodeOrder";
import {
  TERMINAL_KEY_ENCODING_SPEC,
  validateTerminalKeyEncodingSpec,
  type TerminalKeyEncodingKey,
  type TerminalKeyEncodingModifier,
} from "../terminalKeyEncodingSpec";

const HEADER = [
  "// GENERATED FILE. Do not edit by hand. Run `pnpm protocol:remote:v3:generate`.",
  "// Terminal hardware-key encoding rendered from the declarative spec in",
  `// src/shared/remote/contract/terminalKeyEncodingSpec.ts (spec version ${TERMINAL_KEY_ENCODING_SPEC.specVersion}).`,
  "import Foundation",
  "",
];

const SWIFT_MODIFIER_MEMBERS: Record<TerminalKeyEncodingModifier, string> = {
  shift: "shift",
  alt: "alternate",
  ctrl: "control",
  meta: "command",
};

/** Swift string literal; control scalars use the only escape form Swift
 * accepts (`\u{hex}`), so no raw control bytes reach generated source. */
function swiftLiteral(value: string): string {
  let out = '"';
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (code >= 0x20 && code !== 0x7f) out += ch;
    else out += `\\u{${code.toString(16)}}`;
  }
  return `${out}"`;
}

function member(key: TerminalKeyEncodingKey): string {
  return key;
}

export function emitSwiftTerminalKeyEncoding(): string {
  const errors = validateTerminalKeyEncodingSpec(TERMINAL_KEY_ENCODING_SPEC);
  if (errors.length > 0) {
    throw new Error(`terminal key encoding spec is invalid: ${errors.join("; ")}`);
  }
  const spec = TERMINAL_KEY_ENCODING_SPEC;
  const flags = spec.modifierFlags;
  const band = spec.c0FoldBand;
  const bounds = spec.csiUBounds;
  const modifierMembers = spec.modifiers.map((name) => SWIFT_MODIFIER_MEMBERS[name]);
  const rules = spec.rules
    .map(
      (rule) =>
        `    TerminalKeyRule(id: ${swiftLiteral(rule.id)}, guardKind: .${rule.guard}, effect: .${rule.effect}),`,
    )
    .join("\n");
  const bareEntries = spec.keys
    .map((key) => {
      const pattern = key === "character" ? "case .character" : `case .${member(key)}`;
      return `    ${pattern}: return ${swiftLiteral(spec.bareSequences[key])}`;
    })
    .join("\n");
  const arrowEntries = spec.arrowKeys
    .map((key) => `    case .${member(key)}: return ${swiftLiteral(spec.arrowSuffixes[key])}`)
    .join("\n");
  const namedCodePointEntries = (Object.keys(spec.csiUCodePoints) as TerminalKeyEncodingKey[])
    .sort(compareUnicodeCodePoints)
    .map((key) => `    case .${member(key)}: return ${spec.csiUCodePoints[key]}`)
    .join("\n");
  const modifierFlagList = spec.modifiers
    .map((name) => `      (.${SWIFT_MODIFIER_MEMBERS[name]}, ${flags[name]}),`)
    .join("\n");

  return `${HEADER.join("\n")}
/// One hardware-keyboard press, normalized away from UIKit/AppKit types so
/// the PTY byte encoding is unit-testable without constructing press events.
public struct TerminalHardwareKeyEvent: Equatable, Sendable {
  public enum Key: Equatable, Sendable {
    case character(String)
${spec.keys
  .filter((key) => key !== "character")
  .map((key) => `    case ${member(key)}`)
  .join("\n")}
  }

  /// Modifier flags whose raw values double as the xterm CSI-u modifier
  /// contributions (spec \`modifierFlags\`).
  public struct Modifiers: OptionSet, Equatable, Sendable {
    public let rawValue: UInt
    public init(rawValue: UInt) { self.rawValue = rawValue }
${spec.modifiers
  .map(
    (name) =>
      `    public static let ${SWIFT_MODIFIER_MEMBERS[name]} = Modifiers(rawValue: ${flags[name]})`,
  )
  .join("\n")}
  }

  public var key: Key
  public var modifiers: Modifiers

  public init(key: Key, modifiers: Modifiers) {
    self.key = key
    self.modifiers = modifiers
  }
}

enum TerminalKeyGuardKind {
${spec.guards.map((guardName) => `  case ${guardName}`).join("\n")}
}

enum TerminalKeyEffectKind {
${spec.effects.map((effect) => `  case ${effect}`).join("\n")}
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
  /// Ordered first-match encoding rules (spec \`rules\`); the first matching
  /// row wins, and the passthrough catch-all is last so a keystroke is never
  /// dropped.
  static let rules: [TerminalKeyRule] = [
${rules}
  ]

  /// The dedicated Back-Tab sequence (spec \`backtabSequence\`).
  static let backtabSequence = ${swiftLiteral(spec.backtabSequence)}

  /// Modifier flags in spec order; values double as the xterm CSI-u
  /// modifier contributions.
  static let modifierFlags: [(TerminalHardwareKeyEvent.Modifiers, Int)] = [
${modifierFlagList}
  ]

  static let c0FoldRange = UInt32(${band.low})...UInt32(${band.high})
  /// Surrogates never encode (defensive: Strings cannot store lone
  /// surrogates, but the check keeps every platform byte-identical).
  static let surrogateRange = UInt32(${bounds.surrogateLow})...UInt32(${bounds.surrogateHigh})

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
      return text != nil && modifiers == .${modifierMembers[0]}
    case .characterBare:
      return text != nil && modifiers.isEmpty
    case .characterPreFolded:
      // Some input pipelines already fold the chord to its C0 byte; never
      // double-fold those.
      guard let text, modifiers.contains(.${modifierMembers[2]}), !modifiers.contains(.${modifierMembers[1]}),
        !modifiers.contains(.${modifierMembers[3]})
      else { return false }
      guard let scalar = singleScalarCodePoint(text) else { return false }
      return scalar < UInt32(${bounds.minimum})
    case .characterC0Fold:
      // The fold measures Unicode scalars: the uppercase form must be
      // exactly one scalar inside the band ('ß' -> "SS" does not fold).
      guard let text, modifiers.contains(.${modifierMembers[2]}), !modifiers.contains(.${modifierMembers[1]}),
        !modifiers.contains(.${modifierMembers[3]})
      else { return false }
      guard let folded = singleScalarCodePoint(text.uppercased()) else { return false }
      return c0FoldRange.contains(folded)
    case .namedBare:
      return text == nil && modifiers.isEmpty
    case .tabShiftOnly:
      return event.key == .tab && modifiers == .${modifierMembers[0]}
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
      return String(UnicodeScalar(singleScalarCodePoint(text.uppercased())! - UInt32(${band.low}))!)
    case .bareSequence:
      return bareSequence(key)
    case .backTab:
      return backtabSequence
    case .arrowCsi:
      return "\\u{1B}[1;\\(csiModifier(modifiers))\\(arrowSuffix(key)!)"
    case .csiU:
      return "\\u{1B}[\\(codePoint(for: event)!);\\(csiModifier(modifiers))u"
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

  /// Bare-key sequences (spec \`bareSequences\`). The character entry is
  /// table-completeness only — character keys pass their own text through
  /// and never reach it.
  static func bareSequence(_ key: TerminalHardwareKeyEvent.Key) -> String {
    switch key {
${bareEntries}
    }
  }

  static func arrowSuffix(_ key: TerminalHardwareKeyEvent.Key) -> String? {
    switch key {
${arrowEntries}
    default: return nil
    }
  }

  /// CSI-u primary parameters for the named keys that are not arrows.
  static func namedCodePoint(_ key: TerminalHardwareKeyEvent.Key) -> Int? {
    switch key {
${namedCodePointEntries}
    default: return nil
    }
  }

  /// A character maps into CSI-u only when its uppercase form is exactly
  /// one valid Unicode scalar inside 0x${bounds.minimum.toString(16)}...0x${bounds.maximum.toString(16)}.
  static func codePoint(for event: TerminalHardwareKeyEvent) -> Int? {
    switch event.key {
    case .character(let text):
      guard let scalar = singleScalarCodePoint(text.uppercased()),
        scalar >= UInt32(${bounds.minimum}), scalar <= UInt32(0x${bounds.maximum.toString(16)}),
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
`;
}
