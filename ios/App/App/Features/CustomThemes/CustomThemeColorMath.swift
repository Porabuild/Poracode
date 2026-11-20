import Foundation

/// Pure PWA colorMath/themeContrast semantics, pinned by shared fixtures.
enum CustomThemeColorMath {
  static func rgb(_ hex: String) -> [Double]? {
    guard let normalized = CustomThemePalette.normalizedHex(hex), let value = UInt32(normalized.dropFirst(), radix: 16) else { return nil }
    return [Double((value >> 16) & 255), Double((value >> 8) & 255), Double(value & 255)]
  }

  static func contrast(_ text: String, _ background: String) -> Double? {
    guard let a = rgb(text), let b = rgb(background) else { return nil }
    let first = luminance(a), second = luminance(b)
    return (max(first, second) + 0.05) / (min(first, second) + 0.05)
  }

  static func mix(_ first: String, _ second: String, fraction: Double) -> String? {
    guard let a = rgb(first), let b = rgb(second) else { return nil }
    let components = zip(a, b).map { pair in
      Int(min(255, max(0, pair.0 * fraction + pair.1 * (1 - fraction))).rounded())
    }
    return String(format: "#%02x%02x%02x", components[0], components[1], components[2])
  }

  static func muted(_ palette: CustomThemePalette) -> String? {
    let tintedPanel = mix(palette.fg, palette.surface, fraction: 0.06) ?? palette.surface
    let panel = (contrast(palette.fg, tintedPanel) ?? 0) >= 9 ? tintedPanel : palette.surface
    let targets: [(String, Double)] = [
      (palette.bg, 4.5),
      (palette.content ?? palette.bg, 4.5),
      (palette.surface, 4),
      (panel, 4.5),
      (palette.sidebar ?? palette.surface, 4),
    ]
    var fraction = 0.3
    while fraction <= 0.85 + 1e-9 {
      guard let color = mix(palette.fg, palette.bg, fraction: fraction) else { return nil }
      if targets.allSatisfy({ (contrast(color, $0.0) ?? 0) >= $0.1 }) { return color }
      fraction += 0.01
    }
    return mix(palette.fg, palette.bg, fraction: 0.85)
  }

  static func ratios(_ palette: CustomThemePalette) -> [String: Double] {
    var result: [String: Double] = [:]
    result["content"] = contrast(palette.fg, palette.content ?? palette.bg)
    result["surface"] = contrast(palette.fg, palette.surface)
    result["sidebar"] = contrast(palette.fg, palette.sidebar ?? palette.surface)
    if (try? palette.validate()) != nil, let secondary = muted(palette) {
      result["muted"] = contrast(secondary, palette.content ?? palette.bg)
    }
    if let composer = palette.composer { result["composer"] = contrast(palette.fg, composer) }
    if let row = palette.sidebarRowActive { result["sidebarRowActive"] = contrast(palette.fg, row) }
    result["accent"] = contrast(palette.accentFg, palette.accent)
    return result
  }

  private static func luminance(_ components: [Double]) -> Double {
    let values = components.map { value -> Double in
      let channel = value / 255
      return channel <= 0.04045 ? channel / 12.92 : pow((channel + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2]
  }
}
