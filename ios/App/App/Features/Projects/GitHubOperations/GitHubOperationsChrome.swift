import SwiftUI

enum GitHubOperationsChrome {
  @MainActor
  @ViewBuilder
  static func card<Content: View>(
    @ViewBuilder content: () -> Content
  ) -> some View {
    content()
      .padding(16)
      .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))
  }

  @MainActor
  @ViewBuilder
  static func actionButton<Label: View>(
    role: GitHubActionRole,
    action: @escaping () -> Void,
    @ViewBuilder label: () -> Label
  ) -> some View {
    if role == .destructive {
      Button(role: .destructive, action: action, label: label)
        .poracodeProminentButtonStyle(tint: .red)
    } else {
      Button(action: action, label: label)
        .poracodeGlassButtonStyle()
    }
  }
}
