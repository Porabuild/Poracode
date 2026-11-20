import SwiftUI

struct GitOperationsQuickToolbar: ToolbarContent {
  let isEnabled: Bool
  let onAction: (GitOperationProcedure) -> Void

  var body: some ToolbarContent {
    ToolbarItemGroup(placement: .bottomBar) {
      action(.gitFetch)
      action(.gitPull)
      action(.gitPush)
      action(.gitSync)
    }
  }

  private func action(_ procedure: GitOperationProcedure) -> some View {
    let descriptor = GitOperationsPresentation.descriptor(for: procedure)
    return Button(descriptor.accessibilityLabel, systemImage: descriptor.symbol) {
      onAction(procedure)
    }
    .disabled(!isEnabled)
    .accessibilityIdentifier("native-e2e.git.\(procedure.rawValue)")
  }
}
