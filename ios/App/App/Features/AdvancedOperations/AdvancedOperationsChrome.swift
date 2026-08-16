import SwiftUI

/// Liquid Glass on iOS 26 with a native material and bordered fallback on the
/// iOS 17 deployment target.
enum AdvancedOperationsChrome {
  static let cornerRadius: CGFloat = 18

  @MainActor
  @ViewBuilder
  static func card<Content: View>(@ViewBuilder content: () -> Content) -> some View {
    if #available(iOS 26, macOS 26, *) {
      GlassEffectContainer(spacing: 16) {
        content()
          .padding(16)
          .glassEffect(.regular, in: .rect(cornerRadius: cornerRadius))
      }
    } else {
      content()
        .padding(16)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius))
    }
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
