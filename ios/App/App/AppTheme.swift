import SwiftUI

enum PoracodeAppearanceMode: String, CaseIterable, Identifiable, Sendable {
  case system
  case light
  case dark

  static let storageKey = "ios.appearance.mode"
  static let defaultMode = PoracodeAppearanceMode.system

  var id: Self { self }

  var preferredColorScheme: ColorScheme? {
    switch self {
    case .system: nil
    case .light: .light
    case .dark: .dark
    }
  }

  var localizedName: String {
    switch self {
    case .system: SettingsUIStrings.appearanceSystem
    case .light: SettingsUIStrings.appearanceLight
    case .dark: SettingsUIStrings.appearanceDark
    }
  }

  static func resolve(_ storedValue: String) -> Self {
    Self(rawValue: storedValue) ?? defaultMode
  }
}

struct PoracodeThemeVariant: Sendable {
  let backgroundHex: String
  let surfaceHex: String
  let foregroundHex: String
  let accentHex: String
  let borderHex: String
  let sidebarHex: String
  let contentHex: String

  var background: Color { Color(poracodeHex: backgroundHex) }
  var surface: Color { Color(poracodeHex: surfaceHex) }
  var foreground: Color { Color(poracodeHex: foregroundHex) }
  var accent: Color { Color(poracodeHex: accentHex) }
  var border: Color { Color(poracodeHex: borderHex) }
  var sidebar: Color { Color(poracodeHex: sidebarHex) }
  var content: Color { Color(poracodeHex: contentHex) }
}

struct PoracodeThemePreset: Identifiable, Sendable {
  static let storageKey = "ios.theme.preset"
  static let defaultID = "default"

  let id: String
  let name: String
  let light: PoracodeThemeVariant
  let dark: PoracodeThemeVariant

  func variant(for colorScheme: ColorScheme) -> PoracodeThemeVariant {
    colorScheme == .dark ? dark : light
  }

  static func resolve(_ storedValue: String) -> Self {
    let currentID = storedValue == "lightcode-legacy" ? "poracode-legacy" : storedValue
    return all.first(where: { $0.id == currentID }) ?? all[0]
  }

  // Keep this catalog in the same order as src/renderer/theme/themePresets.ts.
  static let all: [Self] = [
    preset(
      "default", "Poracode",
      light: ("#f1f1f4", "#fafafb", "#18181b", "#5f6cd9", "#cacace", "#ececef", "#f6f6f9"),
      dark: ("#070709", "#0e0e14", "#fafafa", "#8892ef", "#24242e", "#0e0e14", "#0b0b11")
    ),
    preset(
      "poracode-legacy", "Poracode Legacy",
      light: ("#f1f1f4", "#fafafb", "#18181b", "#478cc4", "#cacace", "#ececef", "#f6f6f9"),
      dark: ("#141416", "#1a1a1c", "#fcfcfc", "#88bae4", "#303033", "#1a1a1c", "#161618")
    ),
    preset(
      "catppuccin", "Catppuccin",
      light: ("#eff1f5", "#ffffff", "#3d3f54", "#8839ef", "#bcc0cc", "#e6e9ef", "#eff1f5"),
      dark: ("#1e1e2e", "#27273a", "#d2daf5", "#cba6f7", "#313244", "#181825", "#1e1e2e")
    ),
    preset(
      "github", "GitHub",
      light: ("#ffffff", "#f6f8fa", "#1f2328", "#0969da", "#d0d7de", "#f6f8fa", "#ffffff"),
      dark: ("#0d1117", "#161b22", "#e6edf3", "#2f81f7", "#30363d", "#0d1117", "#0d1117")
    ),
    preset(
      "one", "One",
      light: ("#fafafa", "#ffffff", "#383a42", "#4078f2", "#e5e5e6", "#eaeaeb", "#fafafa"),
      dark: ("#282c34", "#2c313a", "#dee0e6", "#61afef", "#3b4048", "#21252b", "#282c34")
    ),
    preset(
      "dracula", "Dracula",
      light: ("#fffbeb", "#ffffff", "#1f1f1f", "#644ac9", "#d4cfc0", "#f3eedd", "#fffbeb"),
      dark: ("#282a36", "#343746", "#f8f8f2", "#bd93f9", "#44475a", "#21222c", "#282a36")
    ),
    preset(
      "nord", "Nord",
      light: ("#eceff4", "#ffffff", "#2e3440", "#5e81ac", "#d8dee9", "#e5e9f0", "#eceff4"),
      dark: ("#2e3440", "#3b4252", "#eff2f6", "#88c0d0", "#434c5e", "#2b303b", "#2e3440")
    ),
    preset(
      "tokyo-night", "Tokyo Night",
      light: ("#e1e2e7", "#ffffff", "#303651", "#2e7de9", "#c4c8da", "#d6d8df", "#e1e2e7"),
      dark: ("#1a1b26", "#1f2335", "#cdd5f7", "#7aa2f7", "#292e42", "#16161e", "#1a1b26")
    ),
    preset(
      "gruvbox", "Gruvbox",
      light: ("#fbf1c7", "#f9f5d7", "#3c3836", "#d65d0e", "#d5c4a1", "#ebdbb2", "#fbf1c7"),
      dark: ("#282828", "#32302f", "#f0e5c7", "#fe8019", "#504945", "#1d2021", "#282828")
    ),
    preset(
      "solarized", "Solarized",
      light: ("#fdf6e3", "#eee8d5", "#2e3c41", "#268bd2", "#ddd6c1", "#eee8d5", "#fdf6e3"),
      dark: ("#002b36", "#073642", "#e3e8e8", "#268bd2", "#0a4a5a", "#002028", "#002b36")
    ),
    preset(
      "rose-pine", "Rosé Pine",
      light: ("#faf4ed", "#fffaf3", "#423e5c", "#907aa9", "#dfdad9", "#f2e9e1", "#faf4ed"),
      dark: ("#232136", "#2a273f", "#e0def4", "#c4a7e7", "#44415a", "#1f1d2e", "#232136")
    ),
    preset(
      "everforest", "Everforest",
      light: ("#fdf6e3", "#f4f0d9", "#374147", "#677700", "#e0dcc7", "#efebd4", "#fdf6e3"),
      dark: ("#2d353b", "#343f44", "#eee8dd", "#a7c080", "#475258", "#272e33", "#2d353b")
    ),
    preset(
      "monokai", "Monokai",
      light: ("#fbfbf8", "#ffffff", "#2c2b29", "#e0156d", "#e4e3da", "#f1f1ea", "#fbfbf8"),
      dark: ("#272822", "#2f302a", "#f8f8f2", "#f92672", "#3e3d32", "#1d1e19", "#272822")
    ),
  ]

  private typealias Anchors = (
    background: String, surface: String, foreground: String, accent: String, border: String,
    sidebar: String, content: String
  )

  private static func preset(
    _ id: String,
    _ name: String,
    light: Anchors,
    dark: Anchors
  ) -> Self {
    Self(id: id, name: name, light: variant(light), dark: variant(dark))
  }

  private static func variant(_ anchors: Anchors) -> PoracodeThemeVariant {
    PoracodeThemeVariant(
      backgroundHex: anchors.background,
      surfaceHex: anchors.surface,
      foregroundHex: anchors.foreground,
      accentHex: anchors.accent,
      borderHex: anchors.border,
      sidebarHex: anchors.sidebar,
      contentHex: anchors.content
    )
  }
}

private struct PoracodeThemeEnvironmentKey: EnvironmentKey {
  static let defaultValue = PoracodeThemePreset.resolve(PoracodeThemePreset.defaultID)
}

extension EnvironmentValues {
  var poracodeTheme: PoracodeThemePreset {
    get { self[PoracodeThemeEnvironmentKey.self] }
    set { self[PoracodeThemeEnvironmentKey.self] = newValue }
  }
}

struct PoracodeThemeRoot<Content: View>: View {
  @AppStorage(PoracodeThemePreset.storageKey) private var selectedThemeID =
    PoracodeThemePreset.defaultID
  @AppStorage(PoracodeAppearanceMode.storageKey) private var appearanceModeID =
    PoracodeAppearanceMode.defaultMode.rawValue
  @Environment(\.colorScheme) private var systemColorScheme

  @ViewBuilder let content: () -> Content

  var body: some View {
    let mode = PoracodeAppearanceMode.resolve(appearanceModeID)
    let theme = PoracodeThemePreset.resolve(selectedThemeID)
    let resolvedColorScheme = mode.preferredColorScheme ?? systemColorScheme

    ZStack {
      theme.variant(for: resolvedColorScheme).background
        .ignoresSafeArea()
      content()
    }
      .scrollContentBackground(.hidden)
      .environment(\.poracodeTheme, theme)
      .tint(theme.variant(for: resolvedColorScheme).accent)
      .preferredColorScheme(mode.preferredColorScheme)
  }
}

/// Device-local conversation typography. The persisted value intentionally
/// matches the compact PWA's 8...20 preference range, while rendering maps it
/// onto native iOS text baselines and continues to respect Dynamic Type.
enum PoracodeChatTextSize {
  static let storageKey = "poracode.rich-chat-text-size.v1"
  static let defaultValue = 13
  static let range = 8...20

  static func resolve(_ value: Int) -> Int {
    min(range.upperBound, max(range.lowerBound, value))
  }
}

enum PoracodeChatTextRole: Equatable {
  case heading1
  case heading2
  case heading3
  case body
  case command
  case metadata

  fileprivate var nativeBaseSize: CGFloat {
    switch self {
    case .heading1: 17.5
    case .heading2: 16
    case .heading3: 14
    case .body: 13
    case .command: 12
    case .metadata: 11
    }
  }

  fileprivate var relativeTextStyle: Font.TextStyle {
    switch self {
    case .heading1, .heading2: .headline
    case .heading3: .subheadline
    case .body: .body
    case .command: .callout
    case .metadata: .caption
    }
  }

  fileprivate var design: Font.Design {
    self == .command ? .monospaced : .default
  }

  func pointSize(for storedValue: Int) -> CGFloat {
    let scale =
      CGFloat(PoracodeChatTextSize.resolve(storedValue))
      / CGFloat(PoracodeChatTextSize.defaultValue)
    return nativeBaseSize * scale
  }
}

private struct PoracodeChatTextModifier: ViewModifier {
  @AppStorage(PoracodeChatTextSize.storageKey) private var storedSize =
    PoracodeChatTextSize.defaultValue
  @ScaledMetric private var dynamicTypeScale: CGFloat

  let role: PoracodeChatTextRole
  let weight: Font.Weight

  init(role: PoracodeChatTextRole, weight: Font.Weight) {
    self.role = role
    self.weight = weight
    _dynamicTypeScale = ScaledMetric(wrappedValue: 1, relativeTo: role.relativeTextStyle)
  }

  func body(content: Content) -> some View {
    content.font(
      .system(
        size: role.pointSize(for: storedSize) * dynamicTypeScale,
        weight: weight,
        design: role.design
      )
    )
  }
}

extension View {
  func poracodeChatText(
    _ role: PoracodeChatTextRole,
    weight: Font.Weight = .regular
  ) -> some View {
    modifier(PoracodeChatTextModifier(role: role, weight: weight))
  }
}

extension Color {
  fileprivate init(poracodeHex value: String) {
    let hex = value.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    guard hex.count == 6, let rgb = UInt64(hex, radix: 16) else {
      self = .accentColor
      return
    }
    self.init(
      .sRGB,
      red: Double((rgb >> 16) & 0xff) / 255,
      green: Double((rgb >> 8) & 0xff) / 255,
      blue: Double(rgb & 0xff) / 255,
      opacity: 1
    )
  }
}
