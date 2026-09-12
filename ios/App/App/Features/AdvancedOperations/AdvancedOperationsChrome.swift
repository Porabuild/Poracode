import SwiftUI

/// Content cards use standard material. Liquid Glass remains reserved for the
/// functional action layer on iOS 26.
enum AdvancedOperationsChrome {
  static let cornerRadius: CGFloat = 18

  @MainActor
  @ViewBuilder
  static func card<Content: View>(@ViewBuilder content: () -> Content) -> some View {
    content()
      .padding(16)
      .background(.regularMaterial, in: RoundedRectangle(cornerRadius: cornerRadius))
  }

  @MainActor
  @ViewBuilder
  static func actionButton<Label: View>(
    role: AdvancedOperationRole,
    action: @escaping () -> Void,
    @ViewBuilder label: () -> Label
  ) -> some View {
    if #available(iOS 26, macOS 26, *) {
      if role == .destructive {
        Button(role: .destructive, action: action, label: label).buttonStyle(.glassProminent)
      } else {
        Button(action: action, label: label).buttonStyle(.glass)
      }
    } else {
      if role == .destructive {
        Button(role: .destructive, action: action, label: label)
          .buttonStyle(.borderedProminent)
      } else {
        Button(action: action, label: label).buttonStyle(.bordered)
      }
    }
  }

  @MainActor
  @ViewBuilder
  static func primaryButton<Label: View>(
    action: @escaping () -> Void,
    @ViewBuilder label: () -> Label
  ) -> some View {
    if #available(iOS 26, macOS 26, *) {
      Button(action: action, label: label).buttonStyle(.glassProminent)
    } else {
      Button(action: action, label: label).buttonStyle(.borderedProminent)
    }
  }
}

extension View {
  /// Keeps identifiers and paths byte-exact by disabling autocapitalization
  /// and autocorrection wherever the platform offers them.
  @ViewBuilder
  func advancedVerbatimInput() -> some View {
    #if os(iOS)
      autocorrectionDisabled().textInputAutocapitalization(.never)
    #else
      autocorrectionDisabled()
    #endif
  }
}
