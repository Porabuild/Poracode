import Foundation

enum ModelVisibilityStrings {
  static var hint: String { String(localized: "settings.models.hint", defaultValue: "Hide models you don't use from the model picker across every provider.", table: "Settings") }
  static var search: String { String(localized: "settings.models.search", defaultValue: "Search models", table: "Settings") }
  static var actions: String { String(localized: "settings.models.actions", defaultValue: "Model visibility actions", table: "Settings") }
  static var showAll: String { String(localized: "settings.models.showAll", defaultValue: "Show all", table: "Settings") }
  static var hideAll: String { String(localized: "settings.models.hideAll", defaultValue: "Hide all", table: "Settings") }
  static var surface: String { String(localized: "settings.models.surface", defaultValue: "Runtime", table: "Settings") }
  static var allSurfaces: String { String(localized: "settings.models.allSurfaces", defaultValue: "All runtimes", table: "Settings") }
  static var chat: String { String(localized: "settings.models.chat", defaultValue: "Chat", table: "Settings") }
  static var terminal: String { String(localized: "settings.models.terminal", defaultValue: "Terminal", table: "Settings") }
  static func count(_ visible: Int, total: Int) -> String { "\(visible) / \(total)" }
  static func state(_ value: ModelVisibilityCheckState, isGroup: Bool = false) -> String {
    switch value {
    case .all: String(localized: "settings.models.visible", defaultValue: "Visible", table: "Settings")
    case .some: isGroup
      ? String(localized: "settings.models.partlyVisibleModels", defaultValue: "Some models visible", table: "Settings")
      : String(localized: "settings.models.partlyVisible", defaultValue: "Visible in some runtimes", table: "Settings")
    case .none: String(localized: "settings.models.hidden", defaultValue: "Hidden", table: "Settings")
    }
  }
}
