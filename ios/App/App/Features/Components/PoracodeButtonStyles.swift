import SwiftUI

private struct PoracodeAccentKey: EnvironmentKey {
  static let defaultValue = Color.accentColor
}

private struct PoracodeAccentForegroundKey: EnvironmentKey {
  static let defaultValue: Color? = nil
}

extension EnvironmentValues {
  /// The active theme accent. The app root sets it and keeps its own tint
  /// neutral, so only controls that read this value show the accent.
  var poracodeAccent: Color {
    get { self[PoracodeAccentKey.self] }
    set { self[PoracodeAccentKey.self] = newValue }
  }

  /// Authored text on an accent fill. Nil keeps the native automatic label.
  var poracodeAccentForeground: Color? {
    get { self[PoracodeAccentForegroundKey.self] }
    set { self[PoracodeAccentForegroundKey.self] = newValue }
  }

}

private struct PoracodeGlassButtonModifier: ViewModifier {
  let tint: Color

  @ViewBuilder
  func body(content: Content) -> some View {
    if #available(iOS 26.0, macOS 26.0, *) {
      content.buttonStyle(.glass).tint(tint)
    } else {
      content.buttonStyle(.bordered).tint(tint)
    }
  }
}

private struct PoracodeProminentButtonModifier: ViewModifier {
  @Environment(\.poracodeAccent) private var accent
  @Environment(\.poracodeAccentForeground) private var accentForeground
  let tint: Color?

  @ViewBuilder
  func body(content: Content) -> some View {
    if let accentForeground, tint == nil {
      prominent(content.foregroundStyle(accentForeground))
    } else {
      prominent(content)
    }
  }

  @ViewBuilder private func prominent<C: View>(_ content: C) -> some View {
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
  func poracodeGlassButtonStyle(tint: Color = .primary) -> some View {
    modifier(PoracodeGlassButtonModifier(tint: tint))
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
