import SwiftUI
import UIKit

struct CustomThemePaletteForm: View {
  @Binding var palette: CustomThemePalette
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @ScaledMetric(relativeTo: .body) private var hexWidth = 88
  let mode: String

  var body: some View {
    Section {
      ForEach(CustomThemePalette.Field.allCases, id: \.rawValue) { field in
        if dynamicTypeSize.isAccessibilitySize {
          VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
              fieldLabel(field)
              picker(field)
            }
            hexInput(field).multilineTextAlignment(.leading)
          }
        } else {
          HStack(spacing: 10) {
            fieldLabel(field)
            picker(field)
            hexInput(field).multilineTextAlignment(.trailing).frame(width: hexWidth)
          }
        }
      }
      Toggle(isOn: Binding(get: { palette.sidebarFill ?? false }, set: { palette.sidebarFill = $0 })) {
        CustomThemeStrings.text("Use sidebar background for the docked sidebar")
      }
      .poracodeSwitchStyle()
      .accessibilityIdentifier("native-e2e.theme.sidebar-fill.\(mode)")
    } footer: {
      CustomThemeStrings.text("Use #rgb or #rrggbb colors. Leave optional colors blank to derive them automatically.")
    }
  }

  private func fieldLabel(_ field: CustomThemePalette.Field) -> some View {
    CustomThemeStrings.text(CustomThemeStrings.label(field))
      .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func picker(_ field: CustomThemePalette.Field) -> some View {
    ColorPicker(selection: color(field), supportsOpacity: false) { EmptyView() }
      .labelsHidden()
      .frame(width: 44, height: 44)
      .accessibilityLabel(CustomThemeStrings.text(CustomThemeStrings.label(field)))
      .accessibilityIdentifier("native-e2e.theme.color.\(mode).\(field.rawValue)")
  }

  private func hexInput(_ field: CustomThemePalette.Field) -> some View {
    CustomThemeHexField(value: Binding(get: { palette[field] }, set: { palette[field] = $0 }),
      required: field.required, label: CustomThemeStrings.label(field),
      identifier: "native-e2e.theme.hex.\(mode).\(field.rawValue)")
  }

  private func color(_ field: CustomThemePalette.Field) -> Binding<Color> {
    Binding(get: {
      Color(poracodeHex: CustomThemePalette.normalizedHex(palette[field] ?? "") ?? fallback(field))
    }, set: { value in
      guard let space = CGColorSpace(name: CGColorSpace.sRGB),
        let converted = UIColor(value).cgColor.converted(to: space, intent: .relativeColorimetric, options: nil),
        let components = converted.components, components.count >= 3 else { return }
      let bytes = components.prefix(3).map { Int((min(1, max(0, $0)) * 255).rounded()) }
      palette[field] = String(format: "#%02x%02x%02x", bytes[0], bytes[1], bytes[2])
    })
  }

  private func fallback(_ field: CustomThemePalette.Field) -> String {
    let value: String
    switch field {
    case .sidebar: value = palette.surface
    case .content: value = palette.bg
    case .composer:
      value = PoracodeThemeColorMix.mix(CustomThemePalette.normalizedHex(palette.surface) ?? "#000000",
        CustomThemePalette.normalizedHex(palette.fg) ?? "#ffffff", amount: 0.1)
    case .sidebarRowActive:
      value = CustomThemeColorMath.mix(palette.fg, palette.content ?? palette.bg, fraction: mode == "dark" ? 0.2 : 0.11) ?? "#808080"
    default: value = "#000000"
    }
    return CustomThemePalette.normalizedHex(value) ?? "#000000"
  }
}
