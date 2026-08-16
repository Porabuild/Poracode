import SwiftUI

enum GitHubOperationsChrome {
  @MainActor
  @ViewBuilder
  static func card<Content: View>(
    @ViewBuilder content: () -> Content
  ) -> some View {
    if #available(iOS 26, macOS 26, *) {
      GlassEffectContainer(spacing: 16) {
        content()
          .padding(16)
          .glassEffect(.regular, in: .rect(cornerRadius: 18))
      }
    } else {
      content()
        .padding(16)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18))
    }
  }

  @MainActor
  @ViewBuilder
  static func actionButton<Label: View>(
    role: GitHubActionRole,
    action: @escaping () -> Void,
    @ViewBuilder label: () -> Label
  ) -> some View {
    if #available(iOS 26, macOS 26, *) {
      if role == .destructive {
        Button(role: .destructive, action: action, label: label)
          .buttonStyle(.glassProminent)
      } else {
        Button(action: action, label: label)
          .buttonStyle(.glass)
      }
    } else {
      if role == .destructive {
        Button(role: .destructive, action: action, label: label)
          .buttonStyle(.borderedProminent)
      } else {
        Button(action: action, label: label)
          .buttonStyle(.bordered)
      }
    }
  }
}
