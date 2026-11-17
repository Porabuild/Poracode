import SwiftUI

struct CustomThemeContrastView: View {
  let document: CustomThemeDocument
  @Environment(\.locale) private var locale
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  private let rows = [("content", "Content background"), ("muted", "Secondary text"), ("surface", "Surface"),
    ("sidebar", "Sidebar background"), ("composer", "Composer background"), ("sidebarRowActive", "Selected sidebar row"),
    ("accent", "Text on accent")]

  var body: some View {
    let light = CustomThemeColorMath.ratios(document.light), dark = CustomThemeColorMath.ratios(document.dark)
    let low = (Array(light.values) + Array(dark.values)).contains { $0 < 4.5 }
    DisclosureGroup {
      if !dynamicTypeSize.isAccessibilitySize { HStack {
        CustomThemeStrings.text("Surface").frame(maxWidth: .infinity, alignment: .leading)
        CustomThemeStrings.text("Light").frame(width: 72, alignment: .trailing)
        CustomThemeStrings.text("Dark").frame(width: 72, alignment: .trailing)
      }.font(.caption.weight(.medium)) }
      ForEach(rows, id: \.0) { key, title in
        if dynamicTypeSize.isAccessibilitySize {
          VStack(alignment: .leading, spacing: 6) {
            CustomThemeStrings.text(title).font(.caption)
            LabeledContent { ratio(light[key]) } label: { CustomThemeStrings.text("Light") }
            LabeledContent { ratio(dark[key]) } label: { CustomThemeStrings.text("Dark") }
          }
        } else { HStack {
          CustomThemeStrings.text(title).font(.caption).frame(maxWidth: .infinity, alignment: .leading)
          ratio(light[key]).frame(width: 72, alignment: .trailing)
          ratio(dark[key]).frame(width: 72, alignment: .trailing)
        } }
      }
      CustomThemeStrings.text("— means an automatic fill or an invalid color.").font(.caption).foregroundStyle(.secondary)
      CustomThemeStrings.text("Ratios for opaque theme surfaces. Aim for at least 4.5:1 for text.")
        .font(.caption).foregroundStyle(.secondary)
    } label: {
      HStack {
        CustomThemeStrings.text("Text contrast")
        Spacer(minLength: 4)
        if low {
          Image(systemName: "exclamationmark.triangle").foregroundStyle(.orange)
          CustomThemeStrings.text("Low contrast").font(.caption).foregroundStyle(.secondary)
        }
      }
    }
    .accessibilityIdentifier("native-e2e.theme.contrast")
  }

  @ViewBuilder private func ratio(_ value: Double?) -> some View {
    if let value {
      HStack(spacing: 3) {
        Image(systemName: value >= 4.5 ? "checkmark" : "exclamationmark.triangle")
          .foregroundStyle(value >= 4.5 ? Color.green : Color.orange)
          .accessibilityLabel(CustomThemeStrings.text(value >= 4.5 ? "Good contrast" : "Low contrast"))
        Text(verbatim: value.formatted(.number.precision(.fractionLength(2)).locale(locale)) + ":1")
          .monospacedDigit()
      }.font(.caption2)
    } else { Text(verbatim: "—").foregroundStyle(.secondary) }
  }
}
