import Foundation

enum NativeShortcutStrings {
  static func value(_ key: String, _ fallback: String) -> String {
    NSLocalizedString(key, tableName: "KeyboardShortcuts", bundle: .main, value: fallback, comment: "")
  }

  static let title = value("keyboard.title", "Keyboard Shortcuts")
  static let summary = value("keyboard.summary", "Customize shortcuts for this device")
  static let search = value("keyboard.search", "Search shortcuts")
  static let noShortcut = value("keyboard.unbound", "No shortcut")
  static let add = value("keyboard.add", "Add Shortcut")
  static let keys = value("keyboard.keys", "Key Combination")
  static let keyHint = value("keyboard.keyHint", "For example, Command+Shift+P")
  static let record = value("keyboard.record", "Record Shortcut")
  static let recording = value("keyboard.recording", "Press a key combination. Press Escape to cancel.")
  static let cancel = value("keyboard.cancel", "Cancel")
  static let save = value("keyboard.save", "Save")
  static let remove = value("keyboard.remove", "Remove Shortcut")
  static let reset = value("keyboard.reset", "Reset to Defaults")
  static let resetAllMessage = value("keyboard.resetAllMessage", "Replace this device’s custom shortcuts with the defaults?")
  static let unavailableStorage = value("keyboard.storageError", "Shortcuts could not be loaded. Reset to use the defaults; your saved configuration stays unchanged until then.")
  static let invalidKey = value("keyboard.invalidKey", "Enter one key with optional Command, Shift, Option, or Control modifiers.")
  static let systemReserved = value("keyboard.systemReserved", "This key combination is reserved for a system action.")
  static let changed = value("keyboard.changed", "This shortcut changed in another window. Close this editor and try again.")
  static let desktopOnly = value("keyboard.desktopOnly", "This system-wide shortcut is available in the desktop app.")
  static let localOnly = value("keyboard.localOnly", "Shortcuts are saved only on this device.")
  static let details = value("keyboard.details", "Context")
  static let conflict = value("keyboard.conflict", "Also assigned to")
  static let other = value("keyboard.other", "Other Commands")
  static let threads = value("keyboard.threads", "Threads")
  static let composer = value("keyboard.composer", "Composer")
  static let space = value("keyboard.space", "Space")

  static func commandTitle(_ command: String) -> String {
    value("keyboard.command.\(command)", titles[command] ?? command)
  }

  static let titles: [String: String] = [
    "quick-composer.toggle": "Quick Composer", "palette.open": "Search",
    "settings.open": "Open Settings", "find.open": "Find", "sidebar.toggle": "Toggle Sidebar",
    "files.open": "Open File", "files.toggle": "Toggle Files", "git.open": "Open Changes",
    "project.add": "Open Folder", "terminal.toggle": "Toggle Terminal", "pane.close": "Close Pane",
    "editor.save": "Save File", "editor.toggle-markdown-preview": "Toggle Markdown Preview",
    "thread.archive": "Archive Thread", "thread.new": "New Thread", "thread.new.panel": "New Quick Thread",
    "browser.focus-address-bar": "Focus Address Bar", "browser.toggle": "Toggle Browser",
    "browser.tab.new": "New Browser Tab", "thread.star": "Star Thread", "thread.rename": "Rename Thread",
    "thread.next": "Next Thread", "thread.previous": "Previous Thread",
    "thread.nextInWorkspace": "Next Thread in Workspace", "thread.previousInWorkspace": "Previous Thread in Workspace",
    "thread.recent.next": "Next Recent Thread", "thread.recent.previous": "Previous Recent Thread",
    "tab.next": "Next Tab", "tab.previous": "Previous Tab", "composer.toggle-work-plan": "Toggle Plan",
    "composer.cycle-effort": "Cycle Effort", "composer.toggle-fast": "Toggle Fast",
    "composer.cycle-permission": "Cycle Permissions", "composer.open-model-picker": "Choose Model",
    "composer.start-dictation": "Start Voice Input",
  ]
}
