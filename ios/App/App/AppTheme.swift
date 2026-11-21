import SwiftUI
import UIKit

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
  var contentSurfaceHex: String = "#ececee"
  var inputSurfaceHex: String = "#e1e1e2"
  var fieldPlaceholderHex: String = "#5c5c5f"
  var tertiarySurfaceHex: String? = nil
  var accentForegroundHex: String? = nil
  var composerHex: String? = nil
  var sidebarPanelHex: String? = nil
  var sidebarRowActiveHex: String? = nil
  var mutedHex: String? = nil

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
  /// User-authored content uses the PWA tertiary surface, above the panel
  /// surface. The base theme supplies its CSS values; other presets derive it.
  var tertiarySurface: Color {
    Color(poracodeHex: tertiarySurfaceHex ?? PoracodeThemeColorMix.mix(surfaceHex, foregroundHex, amount: 0.15))
  }
}

/// CSS `color-mix(in oklab, ...)`, used by the PWA's derived theme surfaces.
/// Keep the calculation at palette creation so every supported iOS version
/// uses the same color space, including iOS 17 where Color.mix is unavailable.
enum PoracodeThemeColorMix {
  static func mix(_ first: String, _ second: String, amount: Double) -> String {
    guard let a = lab(first), let b = lab(second) else { return first }
    let t = min(1, max(0, amount))
    let L = a.0 + (b.0 - a.0) * t
    let A = a.1 + (b.1 - a.1) * t
    let B = a.2 + (b.2 - a.2) * t
    let l = pow(L + 0.3963377774 * A + 0.2158037573 * B, 3)
    let m = pow(L - 0.1055613458 * A - 0.0638541728 * B, 3)
    let s = pow(L - 0.0894841775 * A - 1.291485548 * B, 3)
    func channel(_ value: Double) -> Int {
      let encoded = value <= 0.0031308 ? 12.92 * value : 1.055 * pow(value, 1 / 2.4) - 0.055
      return Int((min(1, max(0, encoded)) * 255).rounded())
    }
    return String(format: "#%02x%02x%02x",
      channel(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      channel(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      channel(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s))
  }

  private static func lab(_ hex: String) -> (Double, Double, Double)? {
    guard let value = UInt32(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) else { return nil }
    func linear(_ byte: UInt32) -> Double {
      let value = Double(byte) / 255
      return value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
    }
    let r = linear((value >> 16) & 255), g = linear((value >> 8) & 255), b = linear(value & 255)
    let l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    let m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    let s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    return (0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s)
  }
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
      light: ("#f1f1f4", "#fafafb", "#18181b", "#5f6cd9", "#cacace", "#ececef", "#f6f6f9", "#e7e7e8", "#e7e7e8", "#555558"),
      dark: ("#070709", "#0e0e14", "#fafafa", "#8892ef", "#24242e", "#0e0e14", "#0b0b11", "#1b1b20", "#1b1b20", "#98989a")
    ),
    preset(
      "poracode-legacy", "Poracode Legacy",
      light: ("#f1f1f4", "#fafafb", "#18181b", "#478cc4", "#cacace", "#ececef", "#f6f6f9", "#e7e7e8", "#e7e7e8", "#555558"),
      dark: ("#141416", "#1a1a1c", "#fcfcfc", "#88bae4", "#303033", "#1a1a1c", "#161618", "#262627", "#262627", "#a6a6a7")
    ),
    preset(
      "catppuccin", "Catppuccin",
      light: ("#eff1f5", "#ffffff", "#3d3f54", "#8839ef", "#bcc0cc", "#e6e9ef", "#eff1f5", "#ffffff", "#ffffff", "#5c5e70"),
      dark: ("#1e1e2e", "#27273a", "#d2daf5", "#cba6f7", "#313244", "#181825", "#1e1e2e", "#2f3042", "#2f3042", "#aab0c8")
    ),
    preset(
      "github", "GitHub",
      light: ("#ffffff", "#f6f8fa", "#1f2328", "#0969da", "#d0d7de", "#f6f8fa", "#ffffff", "#e4e6e8", "#e4e6e8", "#53565a"),
      dark: ("#0d1117", "#161b22", "#e6edf3", "#2f81f7", "#30363d", "#0d1117", "#0d1117", "#20262d", "#20262d", "#9da3a9")
    ),
    preset(
      "one", "One",
      light: ("#fafafa", "#ffffff", "#383a42", "#4078f2", "#e5e5e6", "#eaeaeb", "#fafafa", "#eeeeef", "#eeeeef", "#5a5c62"),
      dark: ("#282c34", "#2c313a", "#dee0e6", "#61afef", "#3b4048", "#21252b", "#282c34", "#2a2f37", "#2a2f37", "#b2b4bb")
    ),
    preset(
      "dracula", "Dracula",
      light: ("#fffbeb", "#ffffff", "#1f1f1f", "#644ac9", "#d4cfc0", "#f3eedd", "#fffbeb", "#ececec", "#ececec", "#5b5a56"),
      dark: ("#282a36", "#343746", "#f8f8f2", "#bd93f9", "#44475a", "#21222c", "#282a36", "#3d404c", "#3d404c", "#c6c6c4")
    ),
    preset(
      "nord", "Nord",
      light: ("#eceff4", "#ffffff", "#2e3440", "#5e81ac", "#d8dee9", "#e5e9f0", "#eceff4", "#edeeef", "#edeeef", "#565c66"),
      dark: ("#2e3440", "#3b4252", "#eff2f6", "#88c0d0", "#434c5e", "#2b303b", "#2e3440", "#383f4e", "#383f4e", "#cbced4")
    ),
    preset(
      "tokyo-night", "Tokyo Night",
      light: ("#e1e2e7", "#ffffff", "#303651", "#2e7de9", "#c4c8da", "#d6d8df", "#e1e2e7", "#edeef0", "#edeef0", "#4f546b"),
      dark: ("#1a1b26", "#1f2335", "#cdd5f7", "#7aa2f7", "#292e42", "#16161e", "#1a1b26", "#272c3e", "#272c3e", "#a2a8c4")
    ),
    preset(
      "gruvbox", "Gruvbox",
      light: ("#fbf1c7", "#f9f5d7", "#3c3836", "#d65d0e", "#d5c4a1", "#ebdbb2", "#fbf1c7", "#e9e5c9", "#e9e5c9", "#5a554d"),
      dark: ("#282828", "#32302f", "#f0e5c7", "#fe8019", "#504945", "#1d2021", "#282828", "#302e2d", "#302e2d", "#beb59f")
    ),
    preset(
      "solarized", "Solarized",
      light: ("#fdf6e3", "#eee8d5", "#2e3c41", "#268bd2", "#ddd6c1", "#eee8d5", "#fdf6e3", "#eee8d5", "#eee8d5", "#495456"),
      dark: ("#002b36", "#073642", "#e3e8e8", "#268bd2", "#0a4a5a", "#002028", "#002b36", "#07333f", "#07333f", "#a8b6ba")
    ),
    preset(
      "rose-pine", "Rosé Pine",
      light: ("#faf4ed", "#fffaf3", "#423e5c", "#907aa9", "#dfdad9", "#f2e9e1", "#faf4ed", "#fffaf3", "#fffaf3", "#5d5971"),
      dark: ("#232136", "#2a273f", "#e0def4", "#c4a7e7", "#44415a", "#1f1d2e", "#232136", "#323046", "#323046", "#b2b0c6")
    ),
    preset(
      "everforest", "Everforest",
      light: ("#fdf6e3", "#f4f0d9", "#374147", "#677700", "#e0dcc7", "#efebd4", "#fdf6e3", "#f4f0d9", "#f4f0d9", "#51585b"),
      dark: ("#2d353b", "#343f44", "#eee8dd", "#a7c080", "#475258", "#272e33", "#2d353b", "#313c41", "#313c41", "#c8c5bd")
    ),
    preset(
      "monokai", "Monokai",
      light: ("#fbfbf8", "#ffffff", "#2c2b29", "#e0156d", "#e4e3da", "#f1f1ea", "#fbfbf8", "#ededed", "#ededed", "#5c5b59"),
      dark: ("#272822", "#2f302a", "#f8f8f2", "#f92672", "#3e3d32", "#1d1e19", "#272822", "#383933", "#383933", "#bcbcb6")
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
    dark: Anchors,
    lightTertiary: String? = nil,
    darkTertiary: String? = nil
  ) -> Self {
    Self(id: id, name: name, light: variant(light, tertiary: lightTertiary), dark: variant(dark, tertiary: darkTertiary))
  }

  private static func variant(_ anchors: Anchors, tertiary: String? = nil) -> PoracodeThemeVariant {
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
      fieldPlaceholderHex: anchors.hint,
      tertiarySurfaceHex: tertiary ?? PoracodeThemeColorMix.mix(anchors.surface, anchors.foreground, amount: 0.15)
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

extension Color {
  /// Opaque label colors keep small metadata readable on grouped and layered
  /// surfaces. UIKit resolves both the appearance and Increase Contrast setting.
  static let poracodeSecondaryLabel = adaptiveLabel(
    light: 0x626268, dark: 0xB2B2BB, increasedLight: 0x414147, increasedDark: 0xD2D2DA
  )
  static let poracodeTertiaryLabel = adaptiveLabel(
    light: 0x6A6A72, dark: 0x9A9AA5, increasedLight: 0x53535A, increasedDark: 0xB6B6C0
  )

  private static func adaptiveLabel(
    light: UInt32, dark: UInt32, increasedLight: UInt32, increasedDark: UInt32
  ) -> Color {
    Color(uiColor: UIColor { traits in
      let increased = traits.accessibilityContrast == .high
      let rgb = traits.userInterfaceStyle == .dark
        ? (increased ? increasedDark : dark)
        : (increased ? increasedLight : light)
      return UIColor(
        red: CGFloat((rgb >> 16) & 255) / 255,
        green: CGFloat((rgb >> 8) & 255) / 255,
        blue: CGFloat(rgb & 255) / 255,
        alpha: 1
      )
    })
  }
}

struct PoracodeThemeRoot<Content: View>: View {
  @State private var customThemes = CustomThemeStore.shared
  @AppStorage(PoracodeThemePreset.storageKey) private var selectedThemeID =
    PoracodeThemePreset.defaultID
  @AppStorage(PoracodeAppearanceMode.storageKey) private var appearanceModeID =
    PoracodeAppearanceMode.defaultMode.rawValue
  @Environment(\.colorScheme) private var systemColorScheme

  @ViewBuilder let content: () -> Content

  var body: some View {
    let mode = PoracodeAppearanceMode.resolve(appearanceModeID)
    let authored = customThemes.themes.first { $0.id == selectedThemeID }
    let theme = authored?.nativePreset ?? PoracodeThemePreset.resolve(selectedThemeID)
    let resolvedColorScheme = mode.preferredColorScheme ?? systemColorScheme
    let palette = theme.variant(for: resolvedColorScheme)
    let authoredMuted = authored.flatMap { _ in palette.mutedHex }.map { Color(poracodeHex: $0) }

    ZStack {
      theme.variant(for: resolvedColorScheme).background
        .ignoresSafeArea()
      content()
    }
    .scrollContentBackground(.hidden)
    .environment(\.poracodeTheme, theme)
    .environment(\.poracodeAccent, theme.variant(for: resolvedColorScheme).accent)
    .environment(\.poracodeAccentForeground, authored.flatMap { _ in
      theme.variant(for: resolvedColorScheme).accentForegroundHex.map { Color(poracodeHex: $0) }
    })
    .foregroundStyle(
      authored == nil ? Color.primary : palette.foreground,
      authoredMuted ?? .poracodeSecondaryLabel,
      authoredMuted ?? .poracodeTertiaryLabel
    )
    .tint(Color.primary)
    .preferredColorScheme(mode.preferredColorScheme)
  }
}

extension View {
  /// Paints the active Poracode theme background inside navigation destinations
  /// so Light (`#f1f1f4`) and Dark (`#070709`) canvases match the split
  /// sidebar without UIKit's default `.systemBackground` seam.
  @ViewBuilder
  func poracodeThemeBackground(_ color: Color) -> some View {
    if #available(iOS 18.0, *) {
      self
        .background(color.ignoresSafeArea())
        .containerBackground(color, for: .navigation)
    } else {
      self.background(color.ignoresSafeArea())
    }
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
  init(poracodeHex value: String) {
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
