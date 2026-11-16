#if canImport(SwiftUI) && canImport(UIKit)
  import SwiftUI

  /// Adaptive Browser Mirror surface. Compact widths stack the tab strip above the
  /// viewport; wide widths (iPad, landscape iPhones, unfolded foldables) move
  /// tabs into a sidebar so the mirrored page keeps the largest possible area.
  struct BrowserMirrorScreen: View {
    let controller: BrowserMirrorController
    let onRetry: () -> Void
    var isMirroring: Bool = false
    var onToggleMirroring: (() -> Void)? = nil

    @Environment(\.poracodeEmbeddedInInspector) private var embeddedInInspector
    @State private var address = ""
    @State private var isEditingAddress = false
    @State private var viewportMode = BrowserMirrorViewportMode.fit

    var body: some View {
      let projection = BrowserMirrorViewProjection(controller: controller)
      GeometryReader { proxy in
        if proxy.size.width >= 660 {
          HStack(alignment: .top, spacing: 12) {
            BrowserMirrorTabSidebar(controller: controller, projection: projection)
              .frame(width: min(260, floor(proxy.size.width * 0.34)))
            content(projection)
          }
        } else {
          VStack(spacing: 10) {
            viewportContent(projection)
          }
          .padding(.top, embeddedInInspector ? 8 : 0)
          .poracodeBottomBar {
            compactChrome(projection)
          }
        }
      }
      .poracodeNavigationTitle(
        BrowserMirrorStrings.title,
        inline: false,
        suppressed: embeddedInInspector
      )
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
      .poracodeBarBackground(divider: .top)
    }

    @ViewBuilder
    private func viewportContent(_ projection: BrowserMirrorViewProjection) -> some View {
      BrowserMirrorViewportControls(
        projection: projection,
        mode: $viewportMode,
        onRefresh: onRetry,
        isMirroring: isMirroring,
        onToggleMirroring: embeddedInInspector ? onToggleMirroring : nil
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
