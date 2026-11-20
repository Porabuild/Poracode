import SwiftUI

struct ProjectWorkspacePage<
  FilesSidebar: View,
  FilesDetail: View,
  GitSidebar: View,
  GitDetail: View,
  BottomControls: View,
  FileToolbar: ToolbarContent
>: View {
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  @Binding private var mode: ProjectWorkspaceMode
  @Binding private var preferredCompactColumn: NavigationSplitViewColumn
  private let hasBottomControls: Bool
  private let filesSidebar: FilesSidebar
  private let filesDetail: FilesDetail
  private let gitSidebar: GitSidebar
  private let gitDetail: GitDetail
  private let bottomControls: BottomControls
  private let fileToolbar: FileToolbar

  init(
    mode: Binding<ProjectWorkspaceMode>,
    preferredCompactColumn: Binding<NavigationSplitViewColumn>,
    hasBottomControls: Bool = true,
    @ViewBuilder filesSidebar: () -> FilesSidebar,
    @ViewBuilder filesDetail: () -> FilesDetail,
    @ViewBuilder gitSidebar: () -> GitSidebar,
    @ViewBuilder gitDetail: () -> GitDetail,
    @ViewBuilder bottomControls: () -> BottomControls,
    @ToolbarContentBuilder fileToolbar: () -> FileToolbar
  ) {
    _mode = mode
    _preferredCompactColumn = preferredCompactColumn
    self.hasBottomControls = hasBottomControls
    self.filesSidebar = filesSidebar()
    self.filesDetail = filesDetail()
    self.gitSidebar = gitSidebar()
    self.gitDetail = gitDetail()
    self.bottomControls = bottomControls()
    self.fileToolbar = fileToolbar()
  }

  var body: some View {
    workspaceContent
      .tint(.secondary)
      .poracodeBottomBar {
        if hasBottomControls && showsWorkspaceControls {
          bottomControls
        }
      }
      .toolbar {
        if showsWorkspaceControls {
          fileToolbar
        }
      }
  }

  @ViewBuilder
  private var workspaceContent: some View {
    switch mode {
    case .files:
      filesSplit
    case .git:
      gitSplit
    }
  }

  private var showsWorkspaceControls: Bool {
    horizontalSizeClass != .compact || preferredCompactColumn != .detail
  }

  private var filesSplit: some View {
    ProjectWorkspaceSplitView(preferredCompactColumn: $preferredCompactColumn) {
      filesSidebar
    } detail: {
      filesDetail
    }
  }

  private var gitSplit: some View {
    ProjectWorkspaceSplitView(preferredCompactColumn: $preferredCompactColumn) {
      gitSidebar
    } detail: {
      gitDetail
    }
  }
}

/// Sidebar chrome is scoped to this pane, including the footer mode picker.
struct ProjectWorkspaceSidebarPane<Content: View>: View {
  let usesSidebarControls: Bool
  let permitsRead: Bool
  let mode: ProjectWorkspaceMode
  let controls: ProjectWorkspaceBottomControls
  let closeWorkspace: () -> Void
  @ViewBuilder let content: () -> Content

  var body: some View {
    VStack(spacing: 0) {
      if usesSidebarControls && permitsRead { controls.sidebarSearch }
      content()
    }
    .poracodeBottomBar {
      if usesSidebarControls && permitsRead { controls.sidebarFooter }
    }
    .toolbar(usesSidebarControls ? .visible : .automatic, for: .navigationBar)
    .toolbar {
      if usesSidebarControls {
        ToolbarItem(placement: .topBarLeading) {
          PoracodeToolbarIconButton(title: AdvancedOperationsStrings.close,
            systemImage: "chevron.backward", color: .primary, action: closeWorkspace)
            .accessibilityIdentifier("native-e2e.project-workspace.back")
        }
        if mode == .files && permitsRead { controls.sidebarFileToolbar }
      }
    }
  }
}

enum ProjectWorkspaceAlert: String, Identifiable {
  case discardChanges
  case reloadAfterSave

  var id: String { rawValue }

  func presentation(
    path: String,
    discard: @escaping () -> Void,
    cancelDiscard: @escaping () -> Void,
    reload: @escaping () -> Void
  ) -> Alert {
    switch self {
    case .discardChanges:
      Alert(
        title: Text(ProjectWorkspaceStrings.unsavedChanges),
        message: Text(ProjectWorkspaceStrings.discardMessage(path: path)),
        primaryButton: .destructive(Text(ProjectWorkspaceStrings.discard), action: discard),
        secondaryButton: .cancel { cancelDiscard() }
      )
    case .reloadAfterSave:
      Alert(
        title: Text(ProjectWorkspaceStrings.saveNeedsReload),
        message: Text(ProjectWorkspaceStrings.saveNeedsReloadDescription),
        primaryButton: .default(Text(ProjectWorkspaceStrings.reload), action: reload),
        secondaryButton: .cancel(Text(ProjectWorkspaceStrings.keepEditing))
      )
    }
  }
}
