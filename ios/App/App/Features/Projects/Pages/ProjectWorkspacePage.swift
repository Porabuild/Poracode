import SwiftUI

struct ProjectWorkspacePage<
  FilesSidebar: View,
  FilesDetail: View,
  GitSidebar: View,
  GitDetail: View,
  BottomControls: View
>: View {
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  @Binding private var mode: ProjectWorkspaceMode
  @Binding private var preferredCompactColumn: NavigationSplitViewColumn
  private let filesSidebar: FilesSidebar
  private let filesDetail: FilesDetail
  private let gitSidebar: GitSidebar
  private let gitDetail: GitDetail
  private let bottomControls: BottomControls

  init(
    mode: Binding<ProjectWorkspaceMode>,
    preferredCompactColumn: Binding<NavigationSplitViewColumn>,
    @ViewBuilder filesSidebar: () -> FilesSidebar,
    @ViewBuilder filesDetail: () -> FilesDetail,
    @ViewBuilder gitSidebar: () -> GitSidebar,
    @ViewBuilder gitDetail: () -> GitDetail,
    @ViewBuilder bottomControls: () -> BottomControls
  ) {
    _mode = mode
    _preferredCompactColumn = preferredCompactColumn
    self.filesSidebar = filesSidebar()
    self.filesDetail = filesDetail()
    self.gitSidebar = gitSidebar()
    self.gitDetail = gitDetail()
    self.bottomControls = bottomControls()
  }

  var body: some View {
    workspaceContent
      .tint(.secondary)
      .safeAreaInset(edge: .bottom, spacing: 0) {
        if showsWorkspaceControls {
          bottomControls
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
