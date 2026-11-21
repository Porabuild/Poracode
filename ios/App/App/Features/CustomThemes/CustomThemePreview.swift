import SwiftUI

struct CustomThemePreview: View {
  let document: CustomThemeDocument

  var body: some View {
    HStack(spacing: 12) {
      preview(document.light, title: "Light", mode: "light")
      preview(document.dark, title: "Dark", mode: "dark")
    }
  }

  private func preview(_ palette: CustomThemePalette, title: String, mode: String) -> some View {
    let variant = palette.nativeVariant(mode: mode)
    return VStack(alignment: .leading, spacing: 7) {
      CustomThemeStrings.text(title).font(.caption).foregroundStyle(.secondary)
      HStack(spacing: 0) {
        Color(poracodeHex: variant.sidebarPanelHex ?? variant.sidebarHex)
          .frame(width: 22)
        VStack(alignment: .leading, spacing: 9) {
          Text(verbatim: "Aa").font(.headline).foregroundStyle(variant.foreground)
          HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 3).fill(variant.surface)
            RoundedRectangle(cornerRadius: 3).fill(variant.accent)
              .overlay(Text(verbatim: "Aa").font(.caption2).foregroundStyle(Color(poracodeHex: variant.accentForegroundHex ?? variant.foregroundHex)))
          }.frame(height: 16)
          RoundedRectangle(cornerRadius: 4)
            .fill(Color(poracodeHex: variant.composerHex ?? variant.surfaceHex)).frame(height: 20)
        }
        .padding(10).frame(maxWidth: .infinity, alignment: .leading)
        .background(variant.content)
      }
      .frame(height: 100)
      .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 10).stroke(variant.border, lineWidth: 1))
      .accessibilityHidden(true)
    }
    .frame(maxWidth: .infinity)
  }
}
