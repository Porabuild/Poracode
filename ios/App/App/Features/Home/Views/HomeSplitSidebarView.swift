import SwiftUI

enum HomeSidebarHeaderControls {
  static func iconContentSize(compact: Bool) -> CGFloat { compact ? 24 : 30 }
}

/// Left-hand navigation sidebar shown docked in landscape / wide layouts and
/// as a leading overlay drawer in wide portrait layouts.
struct HomeSplitSidebarView<ThreadContent: View, FilterControl: View, MoreControl: View, WorkspaceControl: View, UsageRail: View>: View {
  let glassNamespace: Namespace.ID
  let isCompactHeight: Bool
  let isSearchDisabled: Bool
  let canStartThread: Bool
  let isProjectsAvailable: Bool
  let openSearch: () -> Void
  let startNewThread: () -> Void
  let openMore: () -> Void
  let openShortcut: (HomeShortcutID) -> Void
  let openProjects: () -> Void
  let refresh: () async -> Void
  @ViewBuilder let workspaceControl: () -> WorkspaceControl
  @ViewBuilder let filterControl: () -> FilterControl
  @ViewBuilder let moreControl: () -> MoreControl
  @ViewBuilder let usageRail: () -> UsageRail
  @ViewBuilder let threadContent: () -> ThreadContent

  @AppStorage(HomeShortcutPreferences.storageKey) private var shortcutStorage = HomeShortcutPreferences.defaultStorageValue

  private let headerControlHeight: CGFloat = 44

  var body: some View {
    VStack(spacing: 0) {
      header
      searchButton
      if isCompactHeight {
        workspaceControl().padding(.horizontal, 12).padding(.bottom, 4)
      }
      threadContent()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .refreshable {
          await refresh()
        }
      if !isCompactHeight {
        usageRail()
        footer
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .ignoresSafeArea(.keyboard, edges: .bottom)
  }

  private var header: some View {
    HStack(spacing: isCompactHeight ? 4 : 8) {
      BrandWordmark(textStyle: isCompactHeight ? .subheadline : .headline)
        .fixedSize(horizontal: true, vertical: false)
        .layoutPriority(1)
      Spacer(minLength: isCompactHeight ? 4 : 8)
      PoracodeGlassGroup(spacing: isCompactHeight ? 4 : 6) {
        HStack(spacing: isCompactHeight ? 4 : 6) {
          filterControl()
            .frame(width: headerControlHeight, height: headerControlHeight)
          if isCompactHeight { moreControl().frame(width: headerControlHeight, height: headerControlHeight) }
        }
      }
    }
    .frame(minHeight: headerControlHeight)
    .padding(.horizontal, 12)
    .padding(.bottom, 4)
  }

  private var searchButton: some View {
    HStack(spacing: 8) {
      Button(action: openSearch) {
        HStack(spacing: 8) {
          Image(systemName: "magnifyingglass")
            .font(.subheadline)
            .foregroundStyle(.secondary)
          Text(HomeStrings.searchThreads)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .lineLimit(1)
          Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .frame(minHeight: isCompactHeight ? 36 : headerControlHeight)
        .poracodeGlassBackground(in: Capsule(), interactive: true)
        .contentShape(Capsule())
      }
      .buttonStyle(.plain)
      .disabled(isSearchDisabled)
      .accessibilityLabel(HomeStrings.searchThreads)
      .accessibilityIdentifier("native-e2e.split-search")
      .poracodeGlassID("home.search", in: glassNamespace)
      .poracodeZoomSource(id: "home.search", in: glassNamespace)

      PoracodeCircleButton(size: HomeSidebarHeaderControls.iconContentSize(compact: isCompactHeight), action: startNewThread) {
        Image(systemName: "square.and.pencil")
          .font(.subheadline)
      }
      .frame(width: headerControlHeight, height: headerControlHeight)
      .disabled(!canStartThread)
      .accessibilityLabel(HomeStrings.newThread)
      .accessibilityIdentifier("native-e2e.sidebar.new-thread")
    }
    .padding(.horizontal, 12)
    .padding(.bottom, 8)
  }

  private var footer: some View {
    let shortcuts = HomeShortcutPreferences(storageValue: shortcutStorage).visible
    return PoracodeGlassGroup(spacing: 4) {
      VStack(spacing: 8) {
        workspaceControl()
        ViewThatFits(in: .horizontal) {
          footerStrip(shortcuts: Array(shortcuts.prefix(6)))
          footerStrip(shortcuts: Array(shortcuts.prefix(5)))
          footerStrip(shortcuts: Array(shortcuts.prefix(4)))
          footerStrip(shortcuts: Array(shortcuts.prefix(3)))
          footerStrip(shortcuts: Array(shortcuts.prefix(2)))
          footerStrip(shortcuts: Array(shortcuts.prefix(1)))
          footerStrip(shortcuts: [])
        }
      }
      .padding(.horizontal, 12)
      .padding(.top, 4)
      .padding(.bottom, 8)
    }
  }

  private func footerStrip(shortcuts: [HomeShortcutID]) -> some View {
    PoracodePanelControlStrip {
      footerIconButton(
        title: ProjectManagementStrings.title, systemImage: "folder",
        identifier: "native-e2e.sidebar.projects", disabled: !isProjectsAvailable,
        action: openProjects
      )
      ForEach(shortcuts) { shortcut in
        footerIconButton(
          title: shortcut.title, systemImage: shortcut.systemImage,
          identifier: "native-e2e.sidebar.\(shortcut.rawValue)",
          action: { openShortcut(shortcut) }
        )
      }
      footerIconButton(
        title: HomeStrings.more, systemImage: "ellipsis",
        identifier: "native-e2e.sidebar.more-tools", action: openMore
      )
    }
    .frame(minWidth: CGFloat(shortcuts.count + 2) * 44 + CGFloat(shortcuts.count + 1) * 2 + 12)
  }

  private func footerIconButton(
    title: String,
    systemImage: String,
    identifier: String,
    disabled: Bool = false,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Image(systemName: systemImage)
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .frame(minWidth: 44, maxWidth: .infinity, minHeight: 44)
        .contentShape(Capsule())
    }
    .buttonStyle(.plain)
    .disabled(disabled)
    .opacity(disabled ? 0.45 : 1)
    .accessibilityLabel(title)
    .accessibilityIdentifier(identifier)
  }

}
