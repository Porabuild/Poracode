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
  let contentSurfaceHex: String
  let inputSurfaceHex: String
  let fieldPlaceholderHex: String

  var background: Color { Color(poracodeHex: backgroundHex) }
  var surface: Color { Color(poracodeHex: surfaceHex) }
  var contentSurface: Color { Color(poracodeHex: contentSurfaceHex) }
  var fieldPlaceholder: Color { Color(poracodeHex: fieldPlaceholderHex) }
  var inputSurface: Color { Color(poracodeHex: inputSurfaceHex) }
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

  // BEGIN GENERATED THEME PRESETS (scripts/generate-ios-theme-presets.ts)
  static let all: [Self] = [
    preset(
      "default", "Poracode",
      light: ("#f1f1f4", "#fafafb", "#18181b", "#5f6cd9", "#cacace", "#ececef", "#f6f6f9", "#ececee", "#e1e1e2", "#5c5c5f"),
      dark: ("#070709", "#0e0e14", "#fafafa", "#8892ef", "#24242e", "#0e0e14", "#0b0b11", "#1b1b20", "#232329", "#939396")
    ),
    preset(
      "poracode-legacy", "Poracode Legacy",
      light: ("#f1f1f4", "#fafafb", "#18181b", "#478cc4", "#cacace", "#ececef", "#f6f6f9", "#ececee", "#e1e1e2", "#5c5c5f"),
      dark: ("#141416", "#1a1a1c", "#fcfcfc", "#88bae4", "#303033", "#1a1a1c", "#161618", "#262627", "#2e2e30", "#9d9d9e")
    ),
    preset(
      "catppuccin", "Catppuccin",
      light: ("#eff1f5", "#ffffff", "#3d3f54", "#8839ef", "#bcc0cc", "#e6e9ef", "#eff1f5", "#f3f3f5", "#eaeaec", "#606172"),
      dark: ("#1e1e2e", "#27273a", "#d2daf5", "#cba6f7", "#313244", "#181825", "#1e1e2e", "#2f3042", "#36374b", "#a5abc4")
    ),
    preset(
      "github", "GitHub",
      light: ("#ffffff", "#f6f8fa", "#1f2328", "#0969da", "#d0d7de", "#f6f8fa", "#ffffff", "#e9ebed", "#dee1e3", "#585c60"),
      dark: ("#0d1117", "#161b22", "#e6edf3", "#2f81f7", "#30363d", "#0d1117", "#0d1117", "#20262d", "#292e35", "#999fa5")
    ),
    preset(
      "one", "One",
      light: ("#fafafa", "#ffffff", "#383a42", "#4078f2", "#e5e5e6", "#eaeaeb", "#fafafa", "#f3f3f4", "#e9e9ea", "#616269"),
      dark: ("#282c34", "#2c313a", "#dee0e6", "#61afef", "#3b4048", "#21252b", "#282c34", "#2a2f37", "#3c4149", "#b2b5bc")
    ),
    preset(
      "dracula", "Dracula",
      light: ("#fffbeb", "#ffffff", "#1f1f1f", "#644ac9", "#d4cfc0", "#f3eedd", "#fffbeb", "#f2f2f2", "#e6e6e6", "#5f5f5f"),
      dark: ("#282a36", "#343746", "#f8f8f2", "#bd93f9", "#44475a", "#21222c", "#282a36", "#3d404c", "#464855", "#c1c1c1")
    ),
    preset(
      "nord", "Nord",
      light: ("#eceff4", "#ffffff", "#2e3440", "#5e81ac", "#d8dee9", "#e5e9f0", "#eceff4", "#f2f3f4", "#e8e9ea", "#5c616a"),
      dark: ("#2e3440", "#3b4252", "#eff2f6", "#88c0d0", "#434c5e", "#2b303b", "#2e3440", "#383f4e", "#4b5261", "#cbcfd5")
    ),
    preset(
      "tokyo-night", "Tokyo Night",
      light: ("#e1e2e7", "#ffffff", "#303651", "#2e7de9", "#c4c8da", "#d6d8df", "#e1e2e7", "#f3f3f5", "#e8e9ec", "#5c6176"),
      dark: ("#1a1b26", "#1f2335", "#cdd5f7", "#7aa2f7", "#292e42", "#16161e", "#1a1b26", "#272c3e", "#2f3346", "#9ea4c2")
    ),
    preset(
      "gruvbox", "Gruvbox",
      light: ("#fbf1c7", "#f9f5d7", "#3c3836", "#d65d0e", "#d5c4a1", "#ebdbb2", "#fbf1c7", "#eeeacd", "#e4e0c5", "#5f5b54"),
      dark: ("#282828", "#32302f", "#f0e5c7", "#fe8019", "#504945", "#1d2021", "#282828", "#302e2d", "#43403d", "#beb59f")
    ),
    preset(
      "solarized", "Solarized",
      light: ("#fdf6e3", "#eee8d5", "#2e3c41", "#268bd2", "#ddd6c1", "#eee8d5", "#fdf6e3", "#eee8d5", "#d9d5c5", "#4b5657"),
      dark: ("#002b36", "#073642", "#e3e8e8", "#268bd2", "#0a4a5a", "#002028", "#002b36", "#07333f", "#1b4651", "#a9b9bc")
    ),
    preset(
      "rose-pine", "Rosé Pine",
      light: ("#faf4ed", "#fffaf3", "#423e5c", "#907aa9", "#dfdad9", "#f2e9e1", "#faf4ed", "#fffaf3", "#eae5e2", "#605c74"),
      dark: ("#232136", "#2a273f", "#e0def4", "#c4a7e7", "#44415a", "#1f1d2e", "#232136", "#323046", "#3a374f", "#adaac1")
    ),
    preset(
      "everforest", "Everforest",
      light: ("#fdf6e3", "#f4f0d9", "#374147", "#677700", "#e0dcc7", "#efebd4", "#fdf6e3", "#f4f0d9", "#dfddc9", "#525a5c"),
      dark: ("#2d353b", "#343f44", "#eee8dd", "#a7c080", "#475258", "#272e33", "#2d353b", "#313c41", "#454e52", "#cbc8c0")
    ),
    preset(
      "monokai", "Monokai",
      light: ("#fbfbf8", "#ffffff", "#2c2b29", "#e0156d", "#e4e3da", "#f1f1ea", "#fbfbf8", "#f2f2f2", "#e8e8e7", "#61605e"),
      dark: ("#272822", "#2f302a", "#f8f8f2", "#f92672", "#3e3d32", "#1d1e19", "#272822", "#383933", "#41423c", "#b8b8b2")
    ),
  ]
  // END GENERATED THEME PRESETS

  private typealias Anchors = (
    background: String, surface: String, foreground: String, accent: String, border: String,
    sidebar: String, content: String, panel: String, field: String, hint: String
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
      contentHex: anchors.content,
      contentSurfaceHex: anchors.panel,
      inputSurfaceHex: anchors.field,
      fieldPlaceholderHex: anchors.hint
    )
  }
}

private struct PoracodeThemeEnvironmentKey: EnvironmentKey {
  static let defaultValue = PoracodeThemePreset.resolve(PoracodeThemePreset.defaultID)
}

extension EnvironmentValues {
  var poracodePalette: PoracodeThemeVariant { poracodeTheme.variant(for: colorScheme) }

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
      .environment(\.poracodeAccent, theme.variant(for: resolvedColorScheme).accent)
      .tint(Color.primary)
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
