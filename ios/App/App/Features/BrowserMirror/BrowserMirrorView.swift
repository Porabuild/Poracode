#if canImport(SwiftUI) && canImport(UIKit)
  import SwiftUI

  /// Adaptive Browser Mirror surface with one address editor across layouts.
  struct BrowserMirrorScreen: View {
    let controller: BrowserMirrorController
    let onRetry: () -> Void
    var isMirroring: Bool = false
    var onToggleMirroring: (() -> Void)? = nil

    @Environment(\.poracodeEmbeddedInInspector) private var embeddedInInspector
    @State private var address = ""
    @State private var addressTarget: BrowserMirrorAddressTarget?
    @State private var isEditingAddress = false
    @State private var viewportMode = BrowserMirrorViewportMode.fit

    var body: some View {
      let projection = BrowserMirrorViewProjection(controller: controller)
      let target = BrowserMirrorAddressTarget(controller)
      let navigation = BrowserMirrorNavigationControls(controller: controller, projection: projection)
      GeometryReader { proxy in
        let showsTabSidebar = proxy.size.width >= 660
        let layout = showsTabSidebar ? AnyLayout(HStackLayout(alignment: .top, spacing: 12))
          : AnyLayout(VStackLayout(spacing: 8))
        layout {
          Group {
            if showsTabSidebar {
              BrowserMirrorTabSidebar(controller: controller, projection: projection,
                showsNewTab: embeddedInInspector, createTab: createTab)
                .frame(width: min(260, floor(proxy.size.width * 0.34)))
            } else {
              BrowserMirrorTabStrip(controller: controller, projection: projection,
                showsNewTab: embeddedInInspector, createTab: createTab)
            }
          }
          VStack(spacing: 8) {
            BrowserMirrorAddressBar(controller: controller, projection: projection,
              target: addressTarget, address: $address, isFocused: $isEditingAddress)
            if embeddedInInspector { navigation }
            viewportContent(projection)
          }
        }
        .padding(.top, embeddedInInspector ? 8 : 0)
      }
      .toolbar {
        if !embeddedInInspector {
          ToolbarItemGroup(placement: .bottomBar) {
            navigation.back
            navigation.forward
            navigation.reload
            Spacer()
            Button(BrowserMirrorStrings.newTab, systemImage: "plus", action: createTab)
              .disabled(!projection.canCreateTab)
              .accessibilityIdentifier("native-e2e.browser.new-tab")
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
      .onChange(of: target, initial: true) { _, target in
        if addressTarget?.lease != target?.lease { isEditingAddress = false }
        addressTarget = target
        address = projection.addressValue
      }
      .nativeCommands(identity: "browser", revision: ObjectIdentifier(controller), actions: [
        "browser.focus-address-bar": .init(enabled: projection.canSubmitAddress) { _ in isEditingAddress = true },
        "browser.tab.new": .init(enabled: projection.canCreateTab) { _ in createTab() },
      ])
    }

    private func createTab() {
      Task { await controller.perform(.createTab) }
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
