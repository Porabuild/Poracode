import SwiftUI

private struct PoracodeAccentKey: EnvironmentKey {
  static let defaultValue = Color.accentColor
}

extension EnvironmentValues {
  /// The active theme accent. The app root sets it and keeps its own tint
  /// neutral, so only controls that read this value show the accent.
  var poracodeAccent: Color {
    get { self[PoracodeAccentKey.self] }
    set { self[PoracodeAccentKey.self] = newValue }
  }
}

private struct PoracodeProminentButtonModifier: ViewModifier {
  @Environment(\.poracodeAccent) private var accent
  let tint: Color?

  @ViewBuilder
  func body(content: Content) -> some View {
    if #available(iOS 26.0, macOS 26.0, *) {
      content
        .buttonStyle(.glassProminent)
        .tint(tint ?? accent)
    } else {
      content
        .buttonStyle(.borderedProminent)
        .tint(tint ?? accent)
    }
  }
}

extension View {
  /// Neutral Liquid Glass button on iOS 26, bordered elsewhere. Labels stay
  /// neutral; accent is reserved for `poracodeProminentButtonStyle()`.
  @ViewBuilder
  func poracodeGlassButtonStyle(tint: Color = .primary) -> some View {
    if #available(iOS 26.0, macOS 26.0, *) {
      buttonStyle(.glass).tint(tint)
    } else {
      buttonStyle(.bordered).tint(tint)
    }
  }

  /// Neutral fill-only button for controls that already sit on a glass or
  /// composer surface, so a second glass layer is never stacked.
  func poracodeSurfaceButtonStyle(tint: Color = .primary) -> some View {
    buttonStyle(.bordered).tint(tint)
  }

  /// The single accent-filled action of a screen. Reads the theme accent from
  /// the environment unless `tint` overrides it (for example destructive red
  /// or the cleartext-pairing warning orange).
  func poracodeProminentButtonStyle(tint: Color? = nil) -> some View {
    modifier(PoracodeProminentButtonModifier(tint: tint))
  }

  /// Native switch whose on state uses the theme accent, as in the PWA. Apply
  /// it on every switch: root-level style modifiers do not reach sheet
  /// content, but the `\.poracodeAccent` environment value does. Kept in this
  /// portable file so the macOS contract packages that symlink it compile the
  /// same modifier instead of a copy.
  func poracodeSwitchStyle() -> some View { modifier(PoracodeSwitchStyleModifier()) }
}

private struct PoracodeSwitchStyleModifier: ViewModifier {
  @Environment(\.poracodeAccent) private var accent

  func body(content: Content) -> some View {
    content.toggleStyle(.switch).tint(accent)
  }
}
