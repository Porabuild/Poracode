import SwiftUI

/// Keep the editing buffer separate so trimming also updates UIKit when the
/// canonical palette value has not changed (for example typing a space).
struct CustomThemeHexField: View {
  @Binding private var value: String?
  @State private var text: String
  let required: Bool
  let label: String
  let identifier: String

  init(value: Binding<String?>, required: Bool, label: String, identifier: String) {
    _value = value; _text = State(initialValue: value.wrappedValue ?? "")
    self.required = required; self.label = label; self.identifier = identifier
  }

  private var valid: Bool { (!required && text.isEmpty) || CustomThemePalette.normalizedHex(text) != nil }

  var body: some View {
    TextField(text: $text, prompt: required ? Text("#rrggbb") : CustomThemeStrings.text("Automatic")) {
      CustomThemeStrings.text(label)
    }
    .font(.system(.body, design: .monospaced))
    .textInputAutocapitalization(.never).autocorrectionDisabled()
    .keyboardType(.asciiCapable)
    .frame(minHeight: 44)
    .foregroundStyle(valid ? Color.primary : Color.red)
    .accessibilityIdentifier(identifier)
    .onChange(of: text) { _, edited in
      let canonical = CustomThemeDocument.trim(edited)
      if canonical != edited { text = canonical }
      value = !required && canonical.isEmpty ? nil : canonical
    }
    .onChange(of: value) { _, color in
      if text != color ?? "" { text = color ?? "" }
    }
  }
}
