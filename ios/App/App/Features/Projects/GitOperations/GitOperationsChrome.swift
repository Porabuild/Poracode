import SwiftUI

struct GitOperationsCompactChrome: View {
  let isBusy: Bool
  let onFetch: () -> Void
  let onPull: () -> Void
  let onPush: () -> Void
  let onSync: () -> Void

  var body: some View {
    PoracodeGlassGroup(spacing: 8) {
      actions
    }
    .padding(.horizontal)
    .padding(.vertical, 8)
    .poracodeBarBackground()
  }

  private var actions: some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: 8) {
        action(.gitFetch, onFetch)
        action(.gitPull, onPull)
        action(.gitPush, onPush)
        action(.gitSync, onSync)
      }
      Menu(GitOperationsStrings.quickActions, systemImage: "arrow.triangle.2.circlepath") {
        menuAction(.gitFetch, onFetch)
        menuAction(.gitPull, onPull)
        menuAction(.gitPush, onPush)
        menuAction(.gitSync, onSync)
      }
      .poracodeGlassButtonStyle()
      .disabled(isBusy)
      .accessibilityLabel(GitOperationsStrings.quickActions)
    }
  }

  @ViewBuilder
  private func action(
    _ procedure: GitOperationProcedure,
    _ handler: @escaping () -> Void
  ) -> some View {
    let descriptor = GitOperationsPresentation.descriptor(for: procedure)
    Button(action: handler) {
      Label(descriptor.accessibilityLabel, systemImage: descriptor.symbol)
        .labelStyle(.iconOnly)
        .frame(minWidth: 44, minHeight: 44)
    }
    .poracodeGlassButtonStyle()
    .disabled(isBusy)
    .accessibilityLabel(descriptor.accessibilityLabel)
    .accessibilityIdentifier("native-e2e.git.\(procedure.rawValue)")
  }

  private func menuAction(
    _ procedure: GitOperationProcedure,
    _ handler: @escaping () -> Void
  ) -> some View {
    let descriptor = GitOperationsPresentation.descriptor(for: procedure)
    return Button(descriptor.accessibilityLabel, systemImage: descriptor.symbol, action: handler)
      .accessibilityIdentifier("native-e2e.git.\(procedure.rawValue)")
  }
}
