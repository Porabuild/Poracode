import SwiftUI

struct GitOperationsCompactChrome: View {
  let isBusy: Bool
  let onFetch: () -> Void
  let onPull: () -> Void
  let onPush: () -> Void
  let onSync: () -> Void

  var body: some View {
    if #available(iOS 26.0, *) {
      GlassEffectContainer(spacing: 8) {
        actions(glass: true)
      }
      .padding(.horizontal)
      .padding(.vertical, 8)
    } else {
      actions(glass: false)
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(.bar)
    }
  }

  @ViewBuilder
  private func actions(glass: Bool) -> some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: 8) {
        action(.gitFetch, onFetch, glass: glass)
        action(.gitPull, onPull, glass: glass)
        action(.gitPush, onPush, glass: glass)
        action(.gitSync, onSync, glass: glass)
      }
      Menu(GitOperationsStrings.quickActions, systemImage: "arrow.triangle.2.circlepath") {
        menuAction(.gitFetch, onFetch)
        menuAction(.gitPull, onPull)
        menuAction(.gitPush, onPush)
        menuAction(.gitSync, onSync)
      }
      .disabled(isBusy)
      .accessibilityLabel(GitOperationsStrings.quickActions)
    }
  }

  @ViewBuilder
  private func action(
    _ procedure: GitOperationProcedure,
    _ handler: @escaping () -> Void,
    glass: Bool
  ) -> some View {
    let descriptor = GitOperationsPresentation.descriptor(for: procedure)
    let button = Button(action: handler) {
      Label(descriptor.accessibilityLabel, systemImage: descriptor.symbol)
        .labelStyle(.iconOnly)
        .frame(minWidth: 44, minHeight: 44)
    }
    .disabled(isBusy)
    .accessibilityLabel(descriptor.accessibilityLabel)
    if #available(iOS 26.0, *), glass {
      button.buttonStyle(.glass)
    } else {
      button.buttonStyle(.bordered)
    }
  }

  private func menuAction(
    _ procedure: GitOperationProcedure,
    _ handler: @escaping () -> Void
  ) -> some View {
    let descriptor = GitOperationsPresentation.descriptor(for: procedure)
    return Button(descriptor.accessibilityLabel, systemImage: descriptor.symbol, action: handler)
  }
}
