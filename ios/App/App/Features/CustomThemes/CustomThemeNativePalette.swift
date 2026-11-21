import SwiftUI

extension NativeCustomTheme {
  var nativePreset: PoracodeThemePreset {
    PoracodeThemePreset(id: id, name: document.label, light: document.light.nativeVariant(mode: "light"), dark: document.dark.nativeVariant(mode: "dark"))
  }
}

extension CustomThemePalette {
  var nativeVariant: PoracodeThemeVariant { nativeVariant(mode: "light") }

  func nativeVariant(mode: String) -> PoracodeThemeVariant {
    func hex(_ color: String) -> String { Self.normalizedHex(color) ?? "#000000" }
    let background = hex(bg), panel = hex(surface), foreground = hex(fg)
    let navigation = hex(sidebar ?? surface), main = hex(content ?? bg)
    return PoracodeThemeVariant(backgroundHex: background, surfaceHex: panel, foregroundHex: foreground,
      accentHex: hex(accent), borderHex: hex(border), sidebarHex: navigation, contentHex: main,
      tertiarySurfaceHex: PoracodeThemeColorMix.mix(panel, foreground, amount: 0.15),
      accentForegroundHex: hex(accentFg),
      composerHex: composer.map(hex) ?? PoracodeThemeColorMix.mix(panel, foreground, amount: 0.1),
      sidebarPanelHex: sidebarFill == true ? navigation : main,
      sidebarRowActiveHex: sidebarRowActive.map(hex), mutedHex: CustomThemeColorMath.muted(self, mode: mode))
  }
}
