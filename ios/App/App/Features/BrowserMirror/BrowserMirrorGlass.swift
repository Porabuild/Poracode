#if canImport(SwiftUI) && canImport(UIKit)
  import SwiftUI

  struct BrowserMirrorControlSurface<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
      content()
        .padding(8)
        .poracodeGlassBackground(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
  }

  struct BrowserMirrorToolbarButton<Label: View>: View {
    let action: () -> Void
    var onSurface = false
    @ViewBuilder let label: () -> Label

    var body: some View {
      if onSurface {
        Button(action: action, label: label)
          .poracodeSurfaceButtonStyle()
      } else {
        Button(action: action, label: label)
          .poracodeGlassButtonStyle()
      }
    }
  }
#endif
