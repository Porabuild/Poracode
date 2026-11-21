import Foundation

/// Pinned to the PWA's keybindingMatcher.ts. Canonicalization preserves even
/// unregistrable authored strings; the native shortcut adapter validates the
/// resulting main key separately instead of silently rewriting saved data.
struct NativeKeyChord: Equatable, Hashable, Sendable {
  static let modifierOrder = ["ctrl", "meta", "alt", "shift"]
  let canonical: String

  init?(_ raw: String) {
    let parts = raw.components(separatedBy: "+").map { Self.normalize(JavaScriptString.trim($0)) }.filter { !$0.isEmpty }
    guard !parts.isEmpty else { return nil }
    let modifiers = Set(parts.filter { Self.modifierOrder.contains($0) })
    let main = parts.filter { !Self.modifierOrder.contains($0) }
    canonical = (Self.modifierOrder.filter { modifiers.contains($0) } + main).joined(separator: "+")
  }

  var parts: [String] { canonical.components(separatedBy: "+") }
  var modifiers: Set<String> { Set(parts.filter { Self.modifierOrder.contains($0) }) }
  var mainKeys: [String] { parts.filter { !Self.modifierOrder.contains($0) } }

  var display: String {
    parts.map { part in
      switch part {
      case "meta": "⌘"; case "shift": "⇧"; case "alt": "⌥"; case "ctrl": "⌃"
      default: part.count == 1 ? part.uppercased() : String(part.prefix(1)).uppercased() + part.dropFirst()
      }
    }.joined()
  }

  static func event(key: String, control: Bool = false, command: Bool = false,
    option: Bool = false, shift: Bool = false) -> NativeKeyChord? {
    let normalized = normalize(key)
    guard !normalized.isEmpty, !modifierOrder.contains(normalized) else { return nil }
    var parts: [String] = []
    if control { parts.append("ctrl") }; if command { parts.append("meta") }
    if option { parts.append("alt") }; if shift { parts.append("shift") }
    parts.append(normalized)
    return Self(parts.joined(separator: "+"))
  }

  private static func normalize(_ part: String) -> String {
    let lower = part.lowercased()
    switch lower {
    case "cmd", "command", "super", "win", "mod": return "meta"
    case "control": return "ctrl"
    case "option": return "alt"
    case " ": return "space"
    case "escape": return "esc"
    case "arrowup": return "up"; case "arrowdown": return "down"
    case "arrowleft": return "left"; case "arrowright": return "right"
    default: return shifted[lower] ?? lower
    }
  }

  private static let shifted = [
    "~": "`", "!": "1", "@": "2", "#": "3", "$": "4", "%": "5", "^": "6", "&": "7", "*": "8",
    "(": "9", ")": "0", "_": "-", "+": "=", "{": "[", "}": "]", "|": "\\", ":": ";", "\"": "'",
    "<": ",", ">": ".", "?": "/",
  ]
}
