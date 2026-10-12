import SwiftUI

private struct RichChatCompactOverlayHeightPreferenceKey: PreferenceKey {
  static let defaultValue: CGFloat = 0

  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
    value = max(value, nextValue())
  }
}

private struct RichChatCompactOverlayClearanceKey: EnvironmentKey {
  static let defaultValue: CGFloat = 0
}

extension EnvironmentValues {
  var richChatCompactOverlayClearance: CGFloat {
    get { self[RichChatCompactOverlayClearanceKey.self] }
    set { self[RichChatCompactOverlayClearanceKey.self] = newValue }
  }
}

/// Reusable adaptive conversation geometry. Pages provide feature-specific
/// surfaces; this component owns the wide/compact split, sidebar sizing, and
/// bottom safe-area composition.
struct RichChatResponsiveLayout<
  CompactHeader: View,
  Transcript: View,
  Sidebar: View,
  CompactDock: View,
  Composer: View
>: View {
  let breakpoint: CGFloat
  let maximumSidebarWidth: CGFloat
  let sidebarWidthRatio: CGFloat
  private let compactHeader: CompactHeader
  private let transcript: Transcript
  private let sidebar: Sidebar
  private let compactDock: CompactDock
  private let composer: Composer

  @State private var compactOverlayHeight: CGFloat = 0

  init(
    breakpoint: CGFloat = 760,
    maximumSidebarWidth: CGFloat = 350,
    sidebarWidthRatio: CGFloat = 0.36,
    @ViewBuilder compactHeader: () -> CompactHeader,
    @ViewBuilder transcript: () -> Transcript,
    @ViewBuilder sidebar: () -> Sidebar,
    @ViewBuilder compactDock: () -> CompactDock,
    @ViewBuilder composer: () -> Composer
  ) {
    self.breakpoint = breakpoint
    self.maximumSidebarWidth = maximumSidebarWidth
    self.sidebarWidthRatio = sidebarWidthRatio
    self.compactHeader = compactHeader()
    self.transcript = transcript()
    self.sidebar = sidebar()
    self.compactDock = compactDock()
    self.composer = composer()
  }

  var body: some View {
    GeometryReader { proxy in
      responsiveContent(width: proxy.size.width)
    }
  }

  @ViewBuilder
  private func responsiveContent(width: CGFloat) -> some View {
    if width >= breakpoint {
      HStack(spacing: 0) {
        transcript
          .frame(maxWidth: .infinity, maxHeight: .infinity)
        Divider()
        ScrollView {
          sidebar.padding(12)
        }
        .frame(width: min(maximumSidebarWidth, width * sidebarWidthRatio))
      }
      .safeAreaInset(edge: .bottom, spacing: 0) {
        composer
      }
    } else {
      VStack(spacing: 0) {
        compactHeader
        transcript
          .environment(\.richChatCompactOverlayClearance, compactOverlayHeight)
      }
      .overlay(alignment: .bottom) {
        VStack(spacing: 4) {
          compactDock
          composer
        }
        .background {
          GeometryReader { proxy in
            Color.clear.preference(
              key: RichChatCompactOverlayHeightPreferenceKey.self,
              value: proxy.size.height
            )
          }
        }
      }
      .onPreferenceChange(RichChatCompactOverlayHeightPreferenceKey.self) {
        compactOverlayHeight = max(0, $0)
      }
    }
  }
}
