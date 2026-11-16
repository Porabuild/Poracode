import SwiftUI
import UIKit

struct TerminalSettingsView: View {
  @AppStorage(PoracodeTerminalTextSize.storageKey) private var agentTerminalTextSize =
    PoracodeTerminalTextSize.defaultValue
  @AppStorage(PoracodeTerminalTextSize.projectStorageKey) private var projectTerminalTextSize =
    PoracodeTerminalTextSizeRole.project.initialValue()

  var body: some View {
    List {
      Section {
        textSizeControl(
          value: $agentTerminalTextSize,
          accessibilityLabel: SettingsUIStrings.agentTerminalTextSize
        )
      } header: {
        Text(SettingsUIStrings.agentTerminalTextSize)
      }

      Section {
        textSizeControl(
          value: $projectTerminalTextSize,
          accessibilityLabel: SettingsUIStrings.projectTerminalTextSize
        )
      } header: {
        Text(SettingsUIStrings.projectTerminalTextSize)
      } footer: {
        Text(SettingsUIStrings.terminalSystemBehavior)
      }
    }
    .listStyle(.insetGrouped)
    .poracodeReadableListMargins(740)
    .navigationTitle(SettingsUIStrings.terminalTitle)
    .navigationBarTitleDisplayMode(.inline)
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
