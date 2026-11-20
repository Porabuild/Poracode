import SwiftUI
import UIKit

/// Platform spelling belongs here; the portable document preserves authored keys.
extension NativeKeyChord {
  var isAvailableAppShortcut: Bool { keyboardShortcut != nil && NativeShortcutPlatformPolicy.accepts(self) }

  var editableDisplay: String {
    let names = [("ctrl", "Control"), ("alt", "Option"), ("shift", "Shift"), ("meta", "Command")]
      .filter { modifiers.contains($0.0) }.map(\.1)
    return (names + mainKeys.map { $0.count == 1 ? $0.uppercased() : $0.capitalized }).joined(separator: "+")
  }
  var nativeDisplay: String {
    let flags = [("ctrl", "⌃"), ("alt", "⌥"), ("shift", "⇧"), ("meta", "⌘")]
      .filter { modifiers.contains($0.0) }.map(\.1).joined()
    let key = mainKeys.map { key in
      switch key {
      case "space": NativeShortcutStrings.space
      case "enter", "return": "↩"
      case "esc": "⎋"
      case "tab": "⇥"
      case "backspace": "⌫"
      case "delete": "⌦"
      case "up": "↑"; case "down": "↓"; case "left": "←"; case "right": "→"
      case "home": "↖"; case "end": "↘"; case "pageup": "⇞"; case "pagedown": "⇟"
      default: key.uppercased()
      }
    }.joined()
    return flags + key
  }

  var keyboardShortcut: KeyboardShortcut? {
    guard mainKeys.count == 1, let key = keyEquivalent(mainKeys[0]) else { return nil }
    var flags: EventModifiers = []
    if modifiers.contains("meta") { flags.insert(.command) }
    if modifiers.contains("ctrl") { flags.insert(.control) }
    if modifiers.contains("alt") { flags.insert(.option) }
    if modifiers.contains("shift") { flags.insert(.shift) }
    return KeyboardShortcut(key, modifiers: flags)
  }

  func uiKeyCommand(action: Selector) -> UIKeyCommand? {
    guard let shortcut = keyboardShortcut else { return nil }
    var flags: UIKeyModifierFlags = []
    if modifiers.contains("meta") { flags.insert(.command) }
    if modifiers.contains("ctrl") { flags.insert(.control) }
    if modifiers.contains("alt") { flags.insert(.alternate) }
    if modifiers.contains("shift") { flags.insert(.shift) }
    return UIKeyCommand(input: String(shortcut.key.character), modifierFlags: flags, action: action)
  }

  private func keyEquivalent(_ key: String) -> KeyEquivalent? {
    switch key {
    case "space": return .space
    case "enter", "return": return .return
    case "esc": return .escape
    case "tab": return .tab
    case "backspace": return .delete
    case "delete": return .deleteForward
    case "up": return .upArrow
    case "down": return .downArrow
    case "left": return .leftArrow
    case "right": return .rightArrow
    case "home": return .home
    case "end": return .end
    case "pageup": return .pageUp
    case "pagedown": return .pageDown
    default:
      if key.count == 1, let character = key.first { return KeyEquivalent(character) }
      if key.hasPrefix("f"), let number = Int(key.dropFirst()), (1...35).contains(number),
        let scalar = UnicodeScalar(0xF704 + number - 1) { return KeyEquivalent(Character(scalar)) }
      return nil
    }
  }
}
