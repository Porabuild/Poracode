import UIKit

enum TerminalFontPreference {
  /// New device-local v1 string slot. Existing terminal text-size slots remain
  /// valid; absent or unusable names use the original system monospaced font.
  /// Missing fonts are never removed from storage merely because they cannot
  /// be resolved on this launch.
  static let storageKey = "poracode.terminal-font.v1"
  static let defaultValue = ""

  static func storedName(in defaults: UserDefaults = .standard) -> String {
    guard let name = defaults.object(forKey: storageKey) as? String,
      isValidName(name) else { return defaultValue }
    return name
  }

  static func availableFont(named name: String, pointSize: CGFloat) -> UIFont? {
    guard !name.isEmpty, isValidName(name), let font = UIFont(name: name, size: pointSize),
      font.fontDescriptor.symbolicTraits.contains(.traitMonoSpace) else { return nil }
    return font
  }

  static func font(named name: String, pointSize: CGFloat) -> UIFont {
    availableFont(named: name, pointSize: pointSize)
      ?? .monospacedSystemFont(ofSize: pointSize, weight: .regular)
  }

  static func displayName(_ name: String) -> String {
    availableFont(named: name, pointSize: 13)?.familyName ?? String(name.prefix(128))
  }

  private static func isValidName(_ name: String) -> Bool {
    name.utf8.count <= 512 && name.unicodeScalars.count <= 128
      && name.rangeOfCharacter(from: .controlCharacters) == nil
  }
}
