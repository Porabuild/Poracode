import SwiftUI

struct SettingsIntegrationsActionButton<Label: View>: View {
  let action: () -> Void
  @ViewBuilder let label: () -> Label

  var body: some View {
    Button(action: action, label: label)
      .poracodeGlassButtonStyle()
  }
}
