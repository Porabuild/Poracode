import SwiftUI

struct ProjectWorkspaceView: View {
  let context: ProjectWorkspaceContext?
  @Bindable var fileController: ProjectFileWorkspaceController
  @Bindable var gitController: ProjectGitReadController
  let gitOperationsContext: ProjectWorkspaceContext?
  @Bindable var gitOperationsController: GitOperationsController
  let gitHubOperationsContext: GitHubControllerContext?
  let gitHubOperationsControllers: GitHubOperationsControllerSuite
  let reviewDestination: ProjectReviewDetailsView?

  @State private var mode: ProjectWorkspaceMode
  @State private var selectedFile: ProjectWorkspaceEntry?
  @State private var selectedChange: ProjectGitFileChange?
  @State private var currentDirectory = ""
  @State private var editor = ProjectWorkspaceEditorState()
  @State private var pendingAction: ProjectWorkspacePendingAction?
  @State private var presentedAlert: ProjectWorkspaceAlert?
  @State private var activeLease: ProjectWorkspaceLease?

  init(
    context: ProjectWorkspaceContext?,
    fileController: ProjectFileWorkspaceController,
    gitController: ProjectGitReadController,
    gitOperationsContext: ProjectWorkspaceContext?,
    gitOperationsController: GitOperationsController,
    gitHubOperationsContext: GitHubControllerContext?,
    gitHubOperationsControllers: GitHubOperationsControllerSuite,
    reviewDestination: ProjectReviewDetailsView?,
    initialMode: ProjectWorkspaceMode = .files
  ) {
    self.context = context
    self.fileController = fileController
    self.gitController = gitController
    self.gitOperationsContext = gitOperationsContext
    self.gitOperationsController = gitOperationsController
    self.gitHubOperationsContext = gitHubOperationsContext
    self.gitHubOperationsControllers = gitHubOperationsControllers
    self.reviewDestination = reviewDestination
    _mode = State(initialValue: initialMode)
  }

  var body: some View {
    NavigationSplitView {
      VStack(spacing: 0) {
        ProjectWorkspaceModeSwitcher(
          selection: mode,
          access: access,
          onSelect: requestMode
        )
        .padding(.horizontal)
        .padding(.vertical, 8)
        Divider()
        sidebar
      }
      .navigationTitle(ProjectWorkspaceStrings.title)
    } detail: {
      detail
    }
    .navigationSplitViewStyle(.balanced)
    .task(id: ProjectWorkspaceActivationID(context)) {
      await activateAndLoad()
    }
    .onChange(of: gitOperationsController.state.completedMutationCount) { _, completed in
      guard completed > 0 else { return }
      Task { await gitController.loadStatus(detail: .full) }
    }
    .alert(item: $presentedAlert) { alert in
      switch alert {
      case .discardChanges:
        Alert(
          title: Text(ProjectWorkspaceStrings.unsavedChanges),
          message: Text(
            ProjectWorkspaceStrings.discardMessage(
              path: editor.path ?? selectedFile?.path ?? ""
            )
          ),
          primaryButton: .destructive(Text(ProjectWorkspaceStrings.discard)) {
            confirmPendingAction()
          },
          secondaryButton: .cancel {
            pendingAction = nil
          }
        )
      case .reloadAfterSave:
        Alert(
          title: Text(ProjectWorkspaceStrings.saveNeedsReload),
          message: Text(ProjectWorkspaceStrings.saveNeedsReloadDescription),
          primaryButton: .default(Text(ProjectWorkspaceStrings.reload)) {
            Task { await reloadSelectedFile() }
          },
          secondaryButton: .cancel(Text(ProjectWorkspaceStrings.keepEditing))
        )
      }
    }
  }

  private var access: ProjectWorkspaceAccessState {
    .resolve(
      context: context,
      fileContext: fileController.context,
      gitContext: gitController.context
    )
  }

  @ViewBuilder
  private var sidebar: some View {
    if access.permitsRead {
      switch mode {
      case .files:
        ProjectFileBrowserView(
          controller: fileController,
          currentDirectory: currentDirectory,
          selectedEntry: selectedFile,
          onOpen: requestEntry,
          onOpenDirectory: requestDirectory,
          onRefresh: { await fileController.listTree(directoryPath: currentDirectory) }
        )
      case .git:
        ProjectGitSidebarView(
          controller: gitController,
          context: gitOperationsContext,
          operationsController: gitOperationsController,
          gitHubContext: gitHubOperationsContext,
          gitHubControllers: gitHubOperationsControllers,
          reviewDestination: reviewDestination,
          selectedChange: selectedChange,
          onSelect: selectChange,
          onRefresh: { await gitController.loadStatus(detail: .full) }
        )
      }
    } else {
      ProjectWorkspaceAccessView(state: access)
    }
  }

  @ViewBuilder
  private var detail: some View {
    if access.permitsRead {
      switch mode {
      case .files:
        ProjectFileDetailView(
          controller: fileController,
          editor: $editor,
          selectedEntry: selectedFile,
          access: access,
          onDiscard: { request(.discardOnly) },
          onSave: { Task { await saveSelectedFile() } },
          onReload: { Task { await reloadSelectedFile() } }
        )
      case .git:
        ProjectGitDetailView(
          controller: gitController,
          context: gitOperationsContext,
          operationsController: gitOperationsController,
          selectedChange: selectedChange,
          onReload: { Task { await reloadSelectedDiff() } }
        )
      }
    } else {
      ProjectWorkspaceAccessView(state: access)
    }
  }

  private func activateAndLoad() async {
    guard let context, context.isConsistent else {
      fileController.deactivate()
      gitController.deactivate()
      clearSelection()
      activeLease = nil
      return
    }

    if activeLease != context.lease {
      clearSelection()
      currentDirectory = ""
      activeLease = context.lease
    }
    fileController.activate(context)
    gitController.activate(context)

    guard context.session.gate(.sessionRead) == nil else { return }
    switch mode {
    case .files:
      await fileController.listTree(directoryPath: currentDirectory)
    case .git:
      await gitController.loadStatus(detail: .full)
    }
  }

  private func requestMode(_ nextMode: ProjectWorkspaceMode) {
    guard nextMode != mode else { return }
    request(.mode(nextMode))
  }

  private func requestEntry(_ entry: ProjectWorkspaceEntry) {
    if entry.type == .directory {
      request(.directory(entry.path))
    } else {
      request(.file(entry))
    }
  }

  private func requestDirectory(_ path: String) {
    request(.directory(path))
  }

  private func request(_ action: ProjectWorkspacePendingAction) {
    if editor.isDirty {
      pendingAction = action
      presentedAlert = .discardChanges
    } else {
      Task { await perform(action) }
    }
  }

  private func confirmPendingAction() {
    editor.discardChanges()
    guard let pendingAction else { return }
    self.pendingAction = nil
    Task { await perform(pendingAction) }
  }

  private func perform(_ action: ProjectWorkspacePendingAction) async {
    switch action {
    case .mode(let nextMode):
      mode = nextMode
      if nextMode == .git {
        await gitController.loadStatus(detail: .full)
      } else {
        await fileController.listTree(directoryPath: currentDirectory)
      }
    case .directory(let path):
      selectedFile = nil
      editor.clear()
      currentDirectory = path
      await fileController.listTree(directoryPath: path)
    case .file(let entry):
      selectedFile = entry
      editor.beginLoading(path: entry.path)
      await fileController.readFile(path: entry.path)
      installSelectedRead(path: entry.path)
    case .discardOnly:
      break
    }
  }

  private func selectChange(_ change: ProjectGitFileChange) {
    selectedChange = change
    Task {
      await gitController.loadDiff(filePath: change.path, staged: change.staged)
    }
  }

  private func reloadSelectedDiff() async {
    guard let selectedChange else { return }
    await gitController.loadDiff(
      filePath: selectedChange.path,
      staged: selectedChange.staged
    )
  }

  private func saveSelectedFile() async {
    guard access.permitsWrite,
      let path = editor.path,
      let modifiedAtMs = editor.modifiedAtMs,
      editor.canSave
    else { return }
    await fileController.writeFile(
      path: path,
      content: editor.draft,
      baseModifiedAtMs: modifiedAtMs
    )
    guard selectedFile?.path == path, editor.path == path else { return }
    switch fileController.fileWrite.loadState {
    case .loaded:
      if let saved = fileController.fileWrite.value {
        editor.markSaved(modifiedAtMs: saved.modifiedAtMs)
      }
    case .failed(let failure):
      if ProjectWorkspaceSaveRecovery.classify(failure) == .reloadRequired {
        presentedAlert = .reloadAfterSave
      }
    case .idle, .loading, .empty:
      break
    }
  }

  private func reloadSelectedFile() async {
    guard let path = selectedFile?.path else { return }
    await fileController.readFile(path: path)
    installSelectedRead(path: path)
  }

  private func installSelectedRead(path: String) {
    guard selectedFile?.path == path,
      fileController.fileRead.loadState == .loaded,
      let value = fileController.fileRead.value,
      value.path == path
    else { return }
    _ = editor.install(value)
  }

  private func clearSelection() {
    selectedFile = nil
    selectedChange = nil
    pendingAction = nil
    presentedAlert = nil
    editor.clear()
  }
}

private enum ProjectWorkspacePendingAction: Hashable {
  case mode(ProjectWorkspaceMode)
  case directory(String)
  case file(ProjectWorkspaceEntry)
  case discardOnly
}

private enum ProjectWorkspaceAlert: String, Identifiable {
  case discardChanges
  case reloadAfterSave

  var id: String { rawValue }
}

private struct ProjectWorkspaceModeSwitcher: View {
  let selection: ProjectWorkspaceMode
  let access: ProjectWorkspaceAccessState
  let onSelect: (ProjectWorkspaceMode) -> Void

  var body: some View {
    VStack(spacing: 6) {
      modeButtons
      if case .ready(readOnly: true) = access {
        Label(ProjectWorkspaceStrings.readOnly, systemImage: "lock")
          .font(.caption)
          .foregroundStyle(.secondary)
          .accessibilityHint(ProjectWorkspaceStrings.readOnlyDescription)
      }
    }
  }

  @ViewBuilder
  private var modeButtons: some View {
    if #available(iOS 26.0, *) {
      GlassEffectContainer(spacing: 8) {
        HStack(spacing: 8) {
          glassButton(.files, title: ProjectWorkspaceStrings.files, symbol: "folder")
          glassButton(.git, title: ProjectWorkspaceStrings.git, symbol: "arrow.triangle.branch")
        }
      }
    } else {
      HStack(spacing: 8) {
        fallbackButton(.files, title: ProjectWorkspaceStrings.files, symbol: "folder")
        fallbackButton(.git, title: ProjectWorkspaceStrings.git, symbol: "arrow.triangle.branch")
      }
    }
  }

  @available(iOS 26.0, *)
  @ViewBuilder
  private func glassButton(
    _ mode: ProjectWorkspaceMode,
    title: String,
    symbol: String
  ) -> some View {
    if selection == mode {
      Button(title, systemImage: symbol) { onSelect(mode) }
        .buttonStyle(.glassProminent)
    } else {
      Button(title, systemImage: symbol) { onSelect(mode) }
        .buttonStyle(.glass)
    }
  }

  @ViewBuilder
  private func fallbackButton(
    _ mode: ProjectWorkspaceMode,
    title: String,
    symbol: String
  ) -> some View {
    if selection == mode {
      Button(title, systemImage: symbol) { onSelect(mode) }
        .buttonStyle(.borderedProminent)
    } else {
      Button(title, systemImage: symbol) { onSelect(mode) }
        .buttonStyle(.bordered)
    }
  }
}
