import SwiftUI

struct HomeThreadListView: View {
  let entries: [HomeThreadListEntry]
  let openingThreadID: String?
  let gitSummary: (UnifiedThreadListItem) -> GitThreadSummary?
  let hostIsOnline: (ClientConnectionID) -> Bool
  let open: (UnifiedThreadListItem) -> Void
  let openProject: (UnifiedThreadListItem) -> Void
  let lifecycle: HomeThreadLifecycleCoordinator
  let drafts: RichChatComposerDraftStore

  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.poracodeTheme) private var theme
  @State private var expandedGroups = Set<String>()

  var body: some View {
    ScrollView {
      LazyVStack(spacing: 7) {
        ForEach(entries) { entry in
          switch entry {
          case .thread(let item):
            threadButton(item, grouped: false)
          case .worktree(let group):
            worktreeSection(group)
          case .conversation(let group):
            conversationSection(group)
          }
        }
      }
      .padding(.horizontal, 12)
      .padding(.top, 8)
      .padding(.bottom, 12)
    }
    .background(palette.background)
  }

  private func conversationSection(_ group: HomeConversationThreadGroup) -> some View {
    let collapsed = !expandedGroups.contains(group.id)
    return VStack(spacing: 0) {
      HomeThreadGroupHeader(
        title: group.groupName,
        count: group.threads.count,
        project: group.project.name,
        host: group.hostName,
        online: hostIsOnline(group.connectionID),
        updatedAt: group.updatedAt,
        surface: palette.surface,
        accessibilityLabel:
          "\(group.groupName), \(HomeStrings.threadCount(group.threads.count))",
        toggle: { toggleGroup(group.id, collapsed: collapsed) }
      ) {
        Image(systemName: "square.stack.3d.up.fill")
          .font(.system(size: HomeThreadRowMetrics.worktreeIconSize, weight: .semibold))
          .foregroundStyle(collapsed ? .secondary : .primary)
      }
      .contextMenu { projectAction(group.threads.first) }

      if !collapsed {
        groupedThreads(group.threads)
      }
    }
  }

  private func worktreeSection(_ group: HomeWorktreeThreadGroup) -> some View {
    let collapsed = !expandedGroups.contains(group.id)
    return VStack(spacing: 0) {
      HomeThreadGroupHeader(
        title: group.worktreeBranch,
        count: nil,
        project: group.project.name,
        host: group.hostName,
        online: hostIsOnline(group.connectionID),
        updatedAt: group.updatedAt,
        surface: palette.surface,
        accessibilityLabel: HomeStrings.worktreeAccessibility(
          group.worktreeBranch,
          group.threads.count
        ),
        toggle: { toggleGroup(group.id, collapsed: collapsed) }
      ) {
        Image("HomeWorktree")
          .resizable()
          .renderingMode(.template)
          .scaledToFit()
          .foregroundStyle(worktreeIconColor(group, collapsed: collapsed))
      }
      .contextMenu { projectAction(group.threads.first) }

      if !collapsed {
        groupedThreads(group.threads)
      }
    }
  }

  @ViewBuilder
  private func projectAction(_ item: UnifiedThreadListItem?) -> some View {
    if let item {
      Button(HomeStrings.project, systemImage: "folder") {
        openProject(item)
      }
    }
  }

  private func groupedThreads(_ threads: [UnifiedThreadListItem]) -> some View {
    VStack(spacing: 5) {
      ForEach(threads) { item in
        threadButton(item, grouped: true)
          .padding(.leading, HomeThreadRowMetrics.groupedRowInset)
      }
    }
    .padding(.top, 5)
    .overlay(alignment: .leading) {
      HomeWorktreeRail()
        .frame(width: 1)
        .padding(.leading, HomeThreadRowMetrics.groupRailInset)
    }
    .transition(.opacity.combined(with: .move(edge: .top)))
  }

  private func threadButton(_ item: UnifiedThreadListItem, grouped: Bool) -> some View {
    Button {
      open(item)
    } label: {
      PoracodeThreadRow(
        thread: item.thread,
        projectName: grouped ? nil : item.project.name,
        hostName: grouped ? nil : item.hostName,
        hostIsOnline: grouped ? nil : hostIsOnline(item.connectionID),
        gitSummary: grouped ? nil : gitSummary(item),
        hasDraft: hasDraft(item),
        showsRelativeTime: true,
        isOpening: openingThreadID == item.id,
        showsGitBranch: item.thread.worktreePath?.isEmpty == false
      )
      .padding(.horizontal, HomeThreadRowMetrics.horizontalInset)
    }
    .buttonStyle(HomeThreadButtonStyle(surface: palette.surface))
    .contextMenu {
      Button(RichChatStrings.closeThread, systemImage: "xmark.circle") {
        lifecycle.requestClose(item)
      }
      .disabled(!lifecycle.canClose(item))
      ThreadLifecycleActionsContent(
        thread: item.thread,
        enabled: lifecycle.canOperate(item),
        isBusy: lifecycle.controller.isBusy,
        perform: { lifecycle.perform($0, on: item) }
      )
      Divider()
      Button(HomeStrings.project, systemImage: "folder") {
        openProject(item)
      }
    }
    .accessibilityIdentifier("native-e2e.thread.\(item.thread.id)")
    .accessibilityLabel(threadAccessibility(item))
  }

  private func threadAccessibility(_ item: UnifiedThreadListItem) -> String {
    var values = [
      item.thread.title,
      item.project.name,
      HomeDeviceName.display(item.hostName),
      item.thread.status,
    ]
    if item.thread.isStarred { values.append(HomeStrings.starred) }
    if hasDraft(item) { values.append(HomeStrings.unsentDraft) }
    return values.joined(separator: ", ")
  }

  private func hasDraft(_ item: UnifiedThreadListItem) -> Bool {
    drafts.hasDraft(
      for: RichChatComposerDraftKey(
        connectionID: item.connectionID,
        threadID: item.thread.id
      )
    )
  }

  private func worktreeIconColor(_ group: HomeWorktreeThreadGroup, collapsed: Bool) -> Color {
    guard collapsed else { return .primary }
    switch group.collapsedStatusTone {
    case .finished: return .indigo
    case .working: return .green
    case nil: return .secondary
    }
  }

  private var palette: PoracodeThemeVariant {
    theme.variant(for: colorScheme)
  }

  private func toggleGroup(_ id: String, collapsed: Bool) {
    withAnimation(.snappy(duration: 0.22)) {
      if collapsed {
        expandedGroups.insert(id)
      } else {
        expandedGroups.remove(id)
      }
    }
  }
}
