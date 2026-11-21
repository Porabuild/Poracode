import Foundation

/// Preserve native system Settings, window minimization and reverse focus
/// traversal. Related app actions receive distinct native defaults instead.
/// Authored/imported documents are never rewritten by this platform policy.
enum NativeShortcutPlatformPolicy {
  /// Only implemented native actions appear as editable shortcuts. The full
  /// portable document remains intact for round trips and future surfaces.
  static let supportedCommands: Set<String> = [
    "settings.open", "sidebar.toggle", "thread.new", "composer.open-model-picker",
    "composer.toggle-work-plan", "composer.cycle-effort", "composer.toggle-fast",
    "composer.cycle-permission", "composer.start-dictation",
    "palette.open", "find.open", "thread.next", "thread.previous", "thread.recent.next", "thread.recent.previous",
    "files.open", "files.toggle", "git.open", "terminal.toggle", "browser.toggle",
    "browser.focus-address-bar", "browser.tab.new",
    "editor.save", "editor.toggle-markdown-preview",
  ]

  static func accepts(_ chord: NativeKeyChord) -> Bool {
    !["meta+,", "meta+m", "shift+tab"].contains(chord.canonical)
  }

  static let defaults: NativeKeybindingDocument = {
    var document = NativeKeyboardDefaults.document
    let overrides: [String: (String, String)] = [
      "settings.open": ("meta+,", "Meta+Shift+,"),
      "composer.open-model-picker": ("meta+m", "Meta+Shift+M"),
      "composer.toggle-work-plan": ("shift+tab", "Meta+Shift+L"),
    ]
    for index in document.entries.indices {
      guard let (portable, native) = overrides[document.entries[index].command],
        document.entries[index].chord?.canonical == portable else { continue }
      document.entries[index].fields["mac"] = .string(native)
    }
    return document
  }()
}
