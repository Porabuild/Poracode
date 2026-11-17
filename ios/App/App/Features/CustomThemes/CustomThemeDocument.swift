import Foundation

enum CustomThemeFailure: Error, Equatable {
  case invalidDocument, unsupportedVersion, unavailableStorage, limitReached
}

/// The unchanged version-one authoring format from shared/customThemes.ts.
/// Imported files carry no installation ID; unknown additive keys are ignored.
struct CustomThemeDocument: Codable, Equatable, Sendable {
  static let version = 1
  static let maximumBytes = 32_768
  var version: Int = Self.version
  var label: String
  var light: CustomThemePalette
  var dark: CustomThemePalette

  private enum CodingKeys: String, CodingKey { case version, label, light, dark }

  init(label: String, light: CustomThemePalette, dark: CustomThemePalette) {
    self.label = label; self.light = light; self.dark = dark
  }

  init(from decoder: any Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    version = try values.decode(Int.self, forKey: .version)
    guard version == Self.version else { throw CustomThemeFailure.unsupportedVersion }
    label = Self.trim(try values.decode(String.self, forKey: .label))
    light = try values.decode(CustomThemePalette.self, forKey: .light)
    dark = try values.decode(CustomThemePalette.self, forKey: .dark)
    try validate()
  }

  func validate() throws {
    guard version == Self.version else { throw CustomThemeFailure.unsupportedVersion }
    let name = Self.trim(label)
    // Zod's string length checks count Unicode code points, not UTF-16 units
    // or extended grapheme clusters (a composed emoji may contain several).
    guard !name.isEmpty, name.unicodeScalars.count <= 80 else { throw CustomThemeFailure.invalidDocument }
    try light.validate(); try dark.validate()
  }

  static func parse(_ data: Data) throws -> Self {
    guard data.count <= maximumBytes else { throw CustomThemeFailure.invalidDocument }
    return try JSONDecoder().decode(Self.self, from: data)
  }

  func export() throws -> Data {
    try validate()
    var document = self; document.label = Self.trim(label)
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    let data = try encoder.encode(document)
    guard data.count <= Self.maximumBytes else { throw CustomThemeFailure.invalidDocument }
    return data
  }

  /// ECMAScript trim semantics, including BOM but excluding NEL, match Zod.
  static func trim(_ text: String) -> String {
    JavaScriptString.trim(text)
  }
}

struct CustomThemePalette: Codable, Equatable, Sendable {
  var bg: String
  var surface: String
  var fg: String
  var accent: String
  var accentFg: String
  var border: String
  var sidebar: String?
  var content: String?
  var composer: String?
  var sidebarFill: Bool?
  var sidebarRowActive: String?

  enum Field: String, CaseIterable, Sendable {
    case bg, surface, fg, accent, accentFg, border, sidebar, content, composer, sidebarRowActive
    var required: Bool {
      switch self { case .bg, .surface, .fg, .accent, .accentFg, .border: true; default: false }
    }
  }
  private enum CodingKeys: String, CodingKey {
    case bg, surface, fg, accent, accentFg, border, sidebar, content, composer, sidebarFill, sidebarRowActive
  }

  init(bg: String, surface: String, fg: String, accent: String, accentFg: String, border: String,
    sidebar: String? = nil, content: String? = nil, composer: String? = nil,
    sidebarFill: Bool? = nil, sidebarRowActive: String? = nil) {
    self.bg = bg; self.surface = surface; self.fg = fg; self.accent = accent; self.accentFg = accentFg
    self.border = border; self.sidebar = sidebar; self.content = content; self.composer = composer
    self.sidebarFill = sidebarFill; self.sidebarRowActive = sidebarRowActive
  }

  init(from decoder: any Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    bg = try values.decode(String.self, forKey: .bg)
    surface = try values.decode(String.self, forKey: .surface)
    fg = try values.decode(String.self, forKey: .fg)
    accent = try values.decode(String.self, forKey: .accent)
    accentFg = try values.decode(String.self, forKey: .accentFg)
    border = try values.decode(String.self, forKey: .border)
    // Like the authoring schema, optional means absent, not JSON null.
    sidebar = values.contains(.sidebar) ? try values.decode(String.self, forKey: .sidebar) : nil
    content = values.contains(.content) ? try values.decode(String.self, forKey: .content) : nil
    composer = values.contains(.composer) ? try values.decode(String.self, forKey: .composer) : nil
    sidebarFill = values.contains(.sidebarFill) ? try values.decode(Bool.self, forKey: .sidebarFill) : nil
    sidebarRowActive = values.contains(.sidebarRowActive) ? try values.decode(String.self, forKey: .sidebarRowActive) : nil
    try validate()
  }

  subscript(field: Field) -> String? {
    get {
      switch field {
      case .bg: bg; case .surface: surface; case .fg: fg; case .accent: accent; case .accentFg: accentFg
      case .border: border; case .sidebar: sidebar; case .content: content; case .composer: composer
      case .sidebarRowActive: sidebarRowActive
      }
    }
    set {
      switch field {
      case .bg: bg = newValue ?? ""; case .surface: surface = newValue ?? ""; case .fg: fg = newValue ?? ""
      case .accent: accent = newValue ?? ""; case .accentFg: accentFg = newValue ?? ""; case .border: border = newValue ?? ""
      case .sidebar: sidebar = newValue; case .content: content = newValue; case .composer: composer = newValue
      case .sidebarRowActive: sidebarRowActive = newValue
      }
    }
  }

  func validate() throws {
    for field in Field.allCases {
      guard let color = self[field] else {
        if field.required { throw CustomThemeFailure.invalidDocument }
        continue
      }
      guard Self.normalizedHex(color) != nil else { throw CustomThemeFailure.invalidDocument }
    }
  }

  static func normalizedHex(_ color: String) -> String? {
    guard color.first == "#", color.utf8.count == 4 || color.utf8.count == 7,
      color.utf8.dropFirst().allSatisfy({ (48...57).contains($0) || (65...70).contains($0) || (97...102).contains($0) }) else { return nil }
    let digits = color.dropFirst().lowercased()
    return "#" + (digits.count == 3 ? digits.map { "\($0)\($0)" }.joined() : digits)
  }
}

struct NativeCustomTheme: Identifiable, Equatable, Sendable {
  var id: String
  var document: CustomThemeDocument

  init(id: String = "custom:\(UUID().uuidString.lowercased())", document: CustomThemeDocument) {
    self.id = id; self.document = document
  }

  static func validID(_ id: String) -> Bool {
    guard id.hasPrefix("custom:") else { return false }
    let suffix = id.utf8.dropFirst(7)
    return (1...80).contains(suffix.count) && suffix.allSatisfy {
      (97...122).contains($0) || (48...57).contains($0) || $0 == 45
    }
  }
}
