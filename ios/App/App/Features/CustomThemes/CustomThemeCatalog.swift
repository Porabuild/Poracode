import Foundation
import SwiftUI

struct CustomThemeCatalog: Decodable, Sendable {
  struct Preset: Decodable, Sendable { let id: String; let document: CustomThemeDocument }
  let formatVersion: Int
  let presets: [Preset]

  static let bundled: Self = {
    guard let url = Bundle.main.url(forResource: "CustomThemeCatalog", withExtension: "json"),
      let data = try? Data(contentsOf: url), let catalog = try? JSONDecoder().decode(Self.self, from: data),
      catalog.formatVersion == 1 else { return Self(formatVersion: 1, presets: []) }
    return catalog
  }()

  func source(for selectedID: String, custom: [NativeCustomTheme]) -> CustomThemeDocument? {
    if let saved = custom.first(where: { $0.id == selectedID }) { return saved.document }
    let id = PoracodeThemePreset.resolve(selectedID).id
    return presets.first(where: { $0.id == id })?.document ?? presets.first?.document
  }
}

enum CustomThemeStrings {
  static func text(_ key: String) -> Text { Text(LocalizedStringKey(key), tableName: "CustomThemes") }

  static var initialName: String {
    String(localized: "My theme", table: "CustomThemes")
  }

  static func label(_ field: CustomThemePalette.Field) -> String {
    switch field {
    case .bg: "Background"; case .surface: "Surface"; case .fg: "Text color"
    case .accent: "Accent"; case .accentFg: "Text on accent"; case .border: "Border"
    case .sidebar: "Sidebar background"; case .content: "Content background"
    case .composer: "Composer background"; case .sidebarRowActive: "Selected sidebar row"
    }
  }
}
