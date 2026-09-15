import SwiftUI

struct AppearanceSettingsView: View {
  @AppStorage(PoracodeThemePreset.storageKey) private var selectedThemeID =
    PoracodeThemePreset.defaultID
  @AppStorage(PoracodeAppearanceMode.storageKey) private var appearanceModeID =
    PoracodeAppearanceMode.defaultMode.rawValue
  @AppStorage(PoracodeChatTextSize.storageKey) private var chatTextSize =
    PoracodeChatTextSize.defaultValue
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.poracodeTheme) private var activeTheme

  var body: some View {
    List {
      Section(SettingsUIStrings.appearanceMode) {
        Picker(SettingsUIStrings.appearanceMode, selection: $appearanceModeID) {
          ForEach(PoracodeAppearanceMode.allCases) { mode in
            Text(mode.localizedName).tag(mode.rawValue)
          }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
      }
      .listRowBackground(activeTheme.variant(for: colorScheme).surface)

      Section {
        ForEach(PoracodeThemePreset.all) { theme in
          Button {
            selectedThemeID = theme.id
          } label: {
            themeRow(theme)
          }
          .buttonStyle(.plain)
          .accessibilityAddTraits(theme.id == selectedThemeID ? .isSelected : [])
        }
      } header: {
        Text(SettingsUIStrings.theme)
      } footer: {
        Text(SettingsUIStrings.themeDescription)
      }
      .listRowBackground(activeTheme.variant(for: colorScheme).surface)

      Section {
        HStack(spacing: 12) {
          Image(systemName: "textformat.size.smaller")
            .foregroundStyle(.secondary)
            .accessibilityHidden(true)
          Slider(
            value: chatTextSizeBinding,
            in: chatTextSizeRange,
            step: 1
          )
          .accessibilityLabel(SettingsUIStrings.chatTextSize)
          Image(systemName: "textformat.size.larger")
            .foregroundStyle(.secondary)
            .accessibilityHidden(true)
          Text(verbatim: String(PoracodeChatTextSize.resolve(chatTextSize)))
            .monospacedDigit()
            .foregroundStyle(.secondary)
            .frame(minWidth: 24, alignment: .trailing)
        }
      } header: {
        Text(SettingsUIStrings.chatTextSize)
      } footer: {
        Text(SettingsUIStrings.chatTextSizeDescription)
      }
      .listRowBackground(activeTheme.variant(for: colorScheme).surface)
    }
    .scrollContentBackground(.hidden)
    .background(activeTheme.variant(for: colorScheme).background)
    .navigationTitle(SettingsUIStrings.appearanceTitle)
    .navigationBarTitleDisplayMode(.inline)
  }

  private func themeRow(_ theme: PoracodeThemePreset) -> some View {
    let variant = theme.variant(for: resolvedColorScheme)
    return HStack(spacing: 12) {
      ThemeSwatch(variant: variant)
      Text(verbatim: theme.name)
        .foregroundStyle(.primary)
      Spacer(minLength: 8)
      if theme.id == selectedThemeID {
        Image(systemName: "checkmark")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(variant.accent)
      }
    }
    .contentShape(Rectangle())
  }

  private var resolvedColorScheme: ColorScheme {
    PoracodeAppearanceMode.resolve(appearanceModeID).preferredColorScheme ?? colorScheme
  }

  private var chatTextSizeBinding: Binding<Double> {
    Binding(
      get: { Double(PoracodeChatTextSize.resolve(chatTextSize)) },
      set: { chatTextSize = PoracodeChatTextSize.resolve(Int($0.rounded())) }
    )
  }

  private var chatTextSizeRange: ClosedRange<Double> {
    Double(PoracodeChatTextSize.range.lowerBound)...Double(PoracodeChatTextSize.range.upperBound)
  }
}

private struct ThemeSwatch: View {
  let variant: PoracodeThemeVariant

  var body: some View {
    HStack(spacing: 0) {
      variant.background
      variant.surface
      variant.accent
    }
    .frame(width: 40, height: 24)
    .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 7, style: .continuous)
        .stroke(variant.border, lineWidth: 1)
    }
    .accessibilityHidden(true)
  }
}
