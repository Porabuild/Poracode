import SwiftUI

struct SettingsIntegrationsActionButton<Label: View>: View {
  let action: () -> Void
  @ViewBuilder let label: () -> Label

  var body: some View {
    if #available(iOS 26, *) {
      Button(action: action, label: label)
        .buttonStyle(.glass)
    } else {
      Button(action: action, label: label)
        .buttonStyle(.bordered)
    }
  }
}
