#if canImport(SwiftUI) && canImport(UIKit)
  import SwiftUI

  /// Adaptive Browser Mirror surface. Compact widths stack the tab strip above the
  /// viewport; regular widths (iPad, wide iPhone landscape) move tabs into a sidebar so
  /// the mirrored page keeps the largest possible area.
  struct BrowserMirrorScreen: View {
    let controller: BrowserMirrorController
    let onRetry: () -> Void

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var address = ""
    @State private var isEditingAddress = false
    @State private var viewportMode = BrowserMirrorViewportMode.fit

    var body: some View {
      let projection = BrowserMirrorViewProjection(controller: controller)
      Group {
        if horizontalSizeClass == .regular {
          HStack(alignment: .top, spacing: 12) {
            BrowserMirrorTabSidebar(controller: controller, projection: projection)
              .frame(width: 260)
            content(projection)
          }
        } else {
          VStack(spacing: 10) {
            viewportContent(projection)
          }
          .safeAreaInset(edge: .bottom, spacing: 0) {
            compactChrome(projection)
          }
        }
      }
      .navigationTitle(BrowserMirrorStrings.title)
      .onChange(of: projection.addressValue) { _, value in
        if !isEditingAddress { address = value }
      }
      .onAppear { address = projection.addressValue }
    }

    @ViewBuilder
    private func content(_ projection: BrowserMirrorViewProjection) -> some View {
      VStack(spacing: 10) {
        BrowserMirrorAddressBar(
          controller: controller,
          projection: projection,
          address: $address,
          isEditing: $isEditingAddress
        )
        BrowserMirrorNavigationControls(controller: controller, projection: projection)
        viewportContent(projection)
      }
    }

    @ViewBuilder
    private func compactChrome(_ projection: BrowserMirrorViewProjection) -> some View {
      VStack(spacing: 8) {
        BrowserMirrorTabStrip(controller: controller, projection: projection)
        BrowserMirrorAddressBar(
          controller: controller,
          projection: projection,
          address: $address,
          isEditing: $isEditingAddress
        )
        BrowserMirrorNavigationControls(controller: controller, projection: projection)
      }
      .padding(.vertical, 8)
      .background(.ultraThinMaterial)
      .overlay(alignment: .top) {
        Divider()
      }
    }

    @ViewBuilder
    private func viewportContent(_ projection: BrowserMirrorViewProjection) -> some View {
      BrowserMirrorViewportControls(
        projection: projection,
        mode: $viewportMode,
        onRefresh: onRetry
      )
      if let notice = projection.noticeMessage {
        BrowserMirrorNoticeBanner(message: notice) {
          controller.acknowledgeMutationOutcome()
        }
      }
      BrowserMirrorViewport(
        controller: controller,
        projection: projection,
        mode: viewportMode,
        onRetry: onRetry
      )
      Text(BrowserMirrorStrings.privacy)
        .font(.caption2)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.leading)
        .padding(.horizontal)
        .padding(.bottom, 4)
    }
  }
#endif
