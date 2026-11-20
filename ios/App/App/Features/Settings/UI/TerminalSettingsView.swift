import SwiftUI
import UIKit

struct TerminalSettingsView: View {
  @AppStorage(PoracodeTerminalTextSize.storageKey) private var agentTerminalTextSize =
    PoracodeTerminalTextSize.defaultValue
  @AppStorage(PoracodeTerminalTextSize.projectStorageKey) private var projectTerminalTextSize =
    PoracodeTerminalTextSizeRole.project.initialValue()
  @AppStorage(TerminalFontPreference.storageKey) private var fontName = TerminalFontPreference.storedName()
  @State private var showsFontPicker = false
  @ScaledMetric(relativeTo: .body) private var fontPreviewSize: CGFloat = 17

  var body: some View {
    List {
      fontSection
      Section {
        textSizeControl(
          value: $agentTerminalTextSize,
          accessibilityLabel: SettingsUIStrings.agentTerminalTextSize
        )
        .settingsSearchAnchor(.agentTerminalTextSize)
      } header: {
        Text(SettingsUIStrings.agentTerminalTextSize)
      }

      Section {
        textSizeControl(
          value: $projectTerminalTextSize,
          accessibilityLabel: SettingsUIStrings.projectTerminalTextSize
        )
        .settingsSearchAnchor(.projectTerminalTextSize)
      } header: {
        Text(SettingsUIStrings.projectTerminalTextSize)
      } footer: {
        Text(SettingsUIStrings.terminalSystemBehavior)
      }
    }
    .listStyle(.insetGrouped)
    .poracodeReadableListMargins(740)
    .settingsSearchScroll()
    .navigationTitle(SettingsUIStrings.terminalTitle)
    .navigationBarTitleDisplayMode(.inline)
    .sheet(isPresented: $showsFontPicker) {
      TerminalFontPicker { selected in
        if let selected { fontName = selected }
        showsFontPicker = false
      }
      .poracodeFormSheetSizing()
      .nativeCommands(identity: "terminal-font-picker", blocksParentActions: true)
    }
  }

  private var fontSection: some View {
    Section {
      Button { fontName = TerminalFontPreference.defaultValue } label: {
        HStack {
          Text(TerminalStrings.defaultFont)
          Spacer()
          if fontName.isEmpty { Image(systemName: "checkmark").foregroundStyle(.secondary) }
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityAddTraits(fontName.isEmpty ? .isSelected : [])
      .accessibilityIdentifier("native-e2e.terminal.font.default")
      Button { showsFontPicker = true } label: {
        HStack {
          Text(TerminalStrings.chooseFont)
          Spacer(minLength: 8)
          if !fontName.isEmpty {
            Text(verbatim: TerminalFontPreference.displayName(fontName)).foregroundStyle(.secondary).lineLimit(1)
            Image(systemName: "checkmark").foregroundStyle(.secondary)
          }
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityAddTraits(fontName.isEmpty ? [] : .isSelected)
      .accessibilityIdentifier("native-e2e.terminal.font.choose")
      .settingsSearchAnchor(.terminalFont)
      Text(verbatim: "Aa Bb 0123456789")
        .font(Font(TerminalFontPreference.font(named: fontName,
          pointSize: fontPreviewSize)))
        .accessibilityLabel(TerminalStrings.fontPreview)
        .accessibilityIdentifier("native-e2e.terminal.font.preview")
    } header: {
      Text(TerminalStrings.fontTitle)
    } footer: {
      VStack(alignment: .leading, spacing: 6) {
        Text(TerminalStrings.fontDescription)
        if !fontName.isEmpty, TerminalFontPreference.availableFont(named: fontName, pointSize: 13) == nil {
          Text(TerminalStrings.fontUnavailable).accessibilityIdentifier("native-e2e.terminal.font.unavailable")
        }
      }
    }
  }

  private func textSizeControl(
    value: Binding<Int>,
    accessibilityLabel: String
  ) -> some View {
    HStack(spacing: 12) {
      Image(systemName: "textformat.size.smaller")
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)
      Slider(value: textSizeBinding(value), in: textSizeRange, step: 1)
        .accessibilityLabel(accessibilityLabel)
      Image(systemName: "textformat.size.larger")
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)
      Text(verbatim: String(PoracodeTerminalTextSize.resolve(value.wrappedValue)))
        .monospacedDigit()
        .foregroundStyle(.secondary)
        .frame(minWidth: 24, alignment: .trailing)
    }
  }

  private func textSizeBinding(_ value: Binding<Int>) -> Binding<Double> {
    Binding(
      get: { Double(PoracodeTerminalTextSize.resolve(value.wrappedValue)) },
      set: { value.wrappedValue = PoracodeTerminalTextSize.resolve(Int($0.rounded())) }
    )
  }

  private var textSizeRange: ClosedRange<Double> {
    let lower = Double(PoracodeTerminalTextSize.range.lowerBound)
    let upper = Double(PoracodeTerminalTextSize.range.upperBound)
    return lower...upper
  }
}
