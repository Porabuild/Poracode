#if canImport(SwiftUI) && canImport(UIKit)
  import SwiftUI

  struct BrowserMirrorTabStrip: View {
    let controller: BrowserMirrorController
    let projection: BrowserMirrorViewProjection

    var body: some View {
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 8) {
          ForEach(projection.tabs) { tab in
            BrowserMirrorTabChip(controller: controller, tab: tab)
          }
          BrowserMirrorToolbarButton {
            Task { await controller.perform(.createTab) }
          } label: {
            Image(systemName: "plus")
              .frame(width: 24, height: 24)
          }
          .disabled(!projection.canCreateTab)
          .accessibilityLabel(BrowserMirrorStrings.newTab)
        }
        .padding(.horizontal)
      }
      .accessibilityLabel(BrowserMirrorStrings.tabs)
    }
  }

  struct BrowserMirrorTabSidebar: View {
    let controller: BrowserMirrorController
    let projection: BrowserMirrorViewProjection

    var body: some View {
      VStack(alignment: .leading, spacing: 8) {
        HStack {
          Text(BrowserMirrorStrings.tabs)
            .font(.subheadline.weight(.semibold))
          Spacer()
          BrowserMirrorToolbarButton {
            Task { await controller.perform(.createTab) }
          } label: {
            Image(systemName: "plus")
          }
          .disabled(!projection.canCreateTab)
          .accessibilityLabel(BrowserMirrorStrings.newTab)
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
          ? Color.accentColor.opacity(0.18) : Color.secondary.opacity(0.08),
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

  struct BrowserMirrorAddressBar: View {
    let controller: BrowserMirrorController
    let projection: BrowserMirrorViewProjection
    @Binding var address: String

    var body: some View {
      BrowserMirrorControlSurface {
        HStack(spacing: 8) {
          TextField(BrowserMirrorStrings.address, text: $address)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .keyboardType(.URL)
            .submitLabel(.go)
            .onSubmit { navigate() }
            .accessibilityLabel(BrowserMirrorStrings.address)
          BrowserMirrorToolbarButton(action: navigate) {
            Image(systemName: "arrow.right")
          }
          .disabled(!projection.canSubmitAddress || address.isEmpty)
          .accessibilityLabel(BrowserMirrorStrings.go)
        }
      }
      .padding(.horizontal)
    }

    private func navigate() {
      guard projection.canSubmitAddress, !address.isEmpty else { return }
      Task { await controller.perform(.navigate(address)) }
    }
  }

  struct BrowserMirrorNavigationControls: View {
    let controller: BrowserMirrorController
    let projection: BrowserMirrorViewProjection

    var body: some View {
      BrowserMirrorControlSurface {
        ViewThatFits(in: .horizontal) {
          HStack(spacing: 10) { controls }
          HStack(spacing: 4) { controls }
        }
      }
      .padding(.horizontal)
    }

    @ViewBuilder
    private var controls: some View {
      control(
        symbol: "chevron.backward",
        label: BrowserMirrorStrings.back,
        enabled: projection.canGoBack,
        action: .back
      )
      control(
        symbol: "chevron.forward",
        label: BrowserMirrorStrings.forward,
        enabled: projection.canGoForward,
        action: .forward
      )
      control(
        symbol: "arrow.clockwise",
        label: BrowserMirrorStrings.reload,
        enabled: projection.canReload,
        action: .reload
      )
      BrowserMirrorKeyboardProxy(
        accessibilityLabel: BrowserMirrorStrings.focusInput,
        insertText: { text in Task { await controller.sendText(text) } },
        sendKey: { key in Task { await controller.sendKey(key) } }
      )
      .frame(width: 44, height: 34)
      .disabled(!projection.acceptsInput)
      .accessibilityHint(BrowserMirrorStrings.keyboardHint)
    }

    private func control(
      symbol: String,
      label: String,
      enabled: Bool,
      action: BrowserMirrorUIAction
    ) -> some View {
      BrowserMirrorToolbarButton {
        Task { await controller.perform(action) }
      } label: {
        Image(systemName: symbol)
          .frame(width: 24, height: 20)
      }
      .disabled(!enabled)
      .accessibilityLabel(label)
    }
  }
#endif
