import SwiftUI

struct PortForwardingActionSurface<Content: View>: View {
  @ViewBuilder let content: Content

  var body: some View {
    content
      .padding(12)
      .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
  }
}

struct PortForwardingPrimaryButtonStyle: ViewModifier {
  func body(content: Content) -> some View {
    if #available(iOS 26, macOS 26, *) {
      content.buttonStyle(.glassProminent)
    } else {
      content.buttonStyle(.borderedProminent)
    }
  }
}
