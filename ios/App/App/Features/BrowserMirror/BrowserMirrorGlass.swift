#if canImport(SwiftUI) && canImport(UIKit)
  import SwiftUI

  struct BrowserMirrorControlSurface<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
      if #available(iOS 26, *) {
        GlassEffectContainer(spacing: 12) {
          content()
            .padding(8)
            .glassEffect(.regular, in: .rect(cornerRadius: 14))
        }
      } else {
        content()
          .padding(8)
          .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14))
      }
    }
  }

  struct BrowserMirrorToolbarButton<Label: View>: View {
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
#endif
