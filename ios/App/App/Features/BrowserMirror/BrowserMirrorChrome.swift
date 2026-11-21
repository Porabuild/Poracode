#if canImport(SwiftUI) && canImport(UIKit)
  import SwiftUI

  struct BrowserMirrorTabStrip: View {
    let controller: BrowserMirrorController
    let projection: BrowserMirrorViewProjection
    let showsNewTab: Bool
    let createTab: () -> Void

    var body: some View {
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 8) {
          ForEach(projection.tabs) { tab in
            BrowserMirrorTabChip(controller: controller, tab: tab)
          }
          if showsNewTab {
            BrowserMirrorToolbarButton(action: createTab) {
              Image(systemName: "plus").frame(width: 24, height: 24)
            }
            .disabled(!projection.canCreateTab)
            .accessibilityLabel(BrowserMirrorStrings.newTab)
            .accessibilityIdentifier("native-e2e.browser.inspector-new-tab")
          }
        }
        .padding(.horizontal)
      }
      .fixedSize(horizontal: false, vertical: true)
      .accessibilityLabel(BrowserMirrorStrings.tabs)
    }
  }

  struct BrowserMirrorTabSidebar: View {
    let controller: BrowserMirrorController
    let projection: BrowserMirrorViewProjection
    let showsNewTab: Bool
    let createTab: () -> Void

    var body: some View {
      VStack(alignment: .leading, spacing: 8) {
        HStack {
          Text(BrowserMirrorStrings.tabs)
            .font(.subheadline.weight(.semibold))
          Spacer()
          if showsNewTab {
            BrowserMirrorToolbarButton(action: createTab) {
              Image(systemName: "plus")
            }
            .disabled(!projection.canCreateTab)
            .accessibilityLabel(BrowserMirrorStrings.newTab)
            .accessibilityIdentifier("native-e2e.browser.inspector-new-tab")
          }
        }
        ScrollView {
          VStack(alignment: .leading, spacing: 6) {
            ForEach(projection.tabs) { tab in
              BrowserMirrorTabChip(controller: controller, tab: tab)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
          }
        }
      }
      .padding(.horizontal)
    }
  }

  struct BrowserMirrorTabChip: View {
    let controller: BrowserMirrorController
    let tab: BrowserMirrorTabRow

    var body: some View {
      HStack(spacing: 6) {
        Button {
          Task { await controller.perform(.activateTab(tab.id)) }
        } label: {
          HStack(spacing: 5) {
            if tab.isLoading { ProgressView().controlSize(.mini) }
            Text(tab.title).lineLimit(1)
          }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(tab.isActive ? [.isSelected] : [])

        Button {
          Task { await controller.perform(.closeTab(tab.id)) }
        } label: {
          Image(systemName: "xmark")
            .font(.caption)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(BrowserMirrorStrings.closeTabLabel(tab.title))
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 7)
      .background(
        tab.isActive
          ? Color.primary.opacity(0.18) : Color.secondary.opacity(0.08),
        in: Capsule()
      )
      .contextMenu {
        if tab.canMoveBefore {
          Button(BrowserMirrorStrings.moveBefore) {
            move(offset: -1, position: .before)
          }
        }
        if tab.canMoveAfter {
          Button(BrowserMirrorStrings.moveAfter) {
            move(offset: 1, position: .after)
          }
        }
      }
    }

    private func move(offset: Int, position: BrowserMirrorMovePosition) {
      let tabs = controller.browserState.tabs
      guard let index = tabs.firstIndex(where: { $0.tabId == tab.id }) else { return }
      let target = index + offset
      guard tabs.indices.contains(target) else { return }
      let targetID = tabs[target].tabId
      Task {
        await controller.perform(
          .moveTab(tab.id, target: targetID, position: position))
      }
    }
  }

  struct BrowserMirrorAddressTarget: Equatable {
    let lease: BrowserMirrorHostLease
    let tabID: String

    @MainActor init?(_ controller: BrowserMirrorController) {
      guard let lease = controller.currentLease, let tabID = controller.browserState.activeTabId else { return nil }
      self.lease = lease
      self.tabID = tabID
    }
  }

  struct BrowserMirrorAddressBar: View {
    let controller: BrowserMirrorController
    let projection: BrowserMirrorViewProjection
    let target: BrowserMirrorAddressTarget?
    @Binding var address: String
    @Binding var isFocused: Bool

    var body: some View {
      HStack(spacing: 8) {
        BrowserMirrorAddressField(text: $address, isFocused: $isFocused, onSubmit: navigate)
          .padding(.horizontal, 12)
          .poracodeInputSurface()
        BrowserMirrorToolbarButton(action: navigate) {
          Image(systemName: "arrow.right")
        }
        .disabled(target == nil || !projection.canSubmitAddress || address.isEmpty)
        .accessibilityLabel(BrowserMirrorStrings.go)
        .accessibilityIdentifier("native-e2e.browser.go")
        BrowserMirrorKeyboardProxy(
          accessibilityLabel: BrowserMirrorStrings.focusInput,
          insertText: { text in Task { await controller.sendText(text) } },
          sendKey: { key in Task { await controller.sendKey(key) } }
        )
        .frame(width: 44, height: 44)
        .disabled(!projection.acceptsInput)
        .accessibilityHint(BrowserMirrorStrings.keyboardHint)
      }
      .padding(.horizontal)
    }

    private func navigate() {
      guard let target, projection.canSubmitAddress, !address.isEmpty else { return }
      let destination = address
      isFocused = false
      Task {
        guard BrowserMirrorAddressTarget(controller) == target else { return }
        await controller.perform(.navigate(destination))
      }
    }
  }

  struct BrowserMirrorNavigationControls: View {
    let controller: BrowserMirrorController
    let projection: BrowserMirrorViewProjection

    var body: some View {
      BrowserMirrorControlSurface {
        HStack(spacing: 8) {
          back
          forward
          reload
        }
        .labelStyle(.iconOnly)
        .poracodeSurfaceButtonStyle()
      }
      .padding(.horizontal)
    }

    var back: some View {
      control(
        symbol: "chevron.backward",
        label: BrowserMirrorStrings.back,
        enabled: projection.canGoBack,
        action: .back
      )
      .accessibilityIdentifier("native-e2e.browser.back")
    }

    var forward: some View {
      control(
        symbol: "chevron.forward",
        label: BrowserMirrorStrings.forward,
        enabled: projection.canGoForward,
        action: .forward
      )
    }

    var reload: some View {
      control(
        symbol: "arrow.clockwise",
        label: BrowserMirrorStrings.reload,
        enabled: projection.canReload,
        action: .reload
      )
    }

    private func control(
      symbol: String,
      label: String,
      enabled: Bool,
      action: BrowserMirrorUIAction
    ) -> some View {
      Button(label, systemImage: symbol) {
        Task { await controller.perform(action) }
      }
      .disabled(!enabled)
    }
  }
#endif
