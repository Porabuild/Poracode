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
  let enqueueReviewComment: ((RichPromptSegment) -> Void)?
  let generatePullRequestSummary:
    @MainActor (_ branch: String, _ baseBranch: String) async throws
      -> AdvancedGeneratedPrSummary

  @State private var mode: ProjectWorkspaceMode
  @State private var selectedFile: ProjectWorkspaceEntry?
  @State private var selectedChange: ProjectGitFileChange?
  @State private var preferredCompactColumn = NavigationSplitViewColumn.sidebar
  @State private var currentDirectory = ""
  @State private var editor = ProjectWorkspaceEditorState()
  @State private var pendingAction: ProjectWorkspacePendingAction?
  @State private var presentedAlert: ProjectWorkspaceAlert?
  @State private var activeLease: ProjectWorkspaceLease?
  @State private var isFileSearchPresented = false
  @State private var fileQuery = ""
  @State private var requestedCreationType: AdvancedProjectEntryType?

  init(
    context: ProjectWorkspaceContext?,
    fileController: ProjectFileWorkspaceController,
    gitController: ProjectGitReadController,
    gitOperationsContext: ProjectWorkspaceContext?,
    gitOperationsController: GitOperationsController,
    gitHubOperationsContext: GitHubControllerContext?,
    gitHubOperationsControllers: GitHubOperationsControllerSuite,
    reviewDestination: ProjectReviewDetailsView?,
    enqueueReviewComment: ((RichPromptSegment) -> Void)? = nil,
    generatePullRequestSummary:
      @escaping @MainActor (
        _ branch: String, _ baseBranch: String
      ) async throws -> AdvancedGeneratedPrSummary,
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
    self.enqueueReviewComment = enqueueReviewComment
    self.generatePullRequestSummary = generatePullRequestSummary
    _mode = State(initialValue: initialMode)
  }

  var body: some View {
    ProjectWorkspacePage(
      mode: $mode,
      preferredCompactColumn: $preferredCompactColumn
    ) {
      sidebar(mode: .files)
    } filesDetail: {
      detail(mode: .files)
    } gitSidebar: {
      sidebar(mode: .git)
    } gitDetail: {
      detail(mode: .git)
    } bottomControls: {
      bottomControls
    }
    .task(id: ProjectWorkspaceActivationID(context)) {
      await activateAndLoad()
    }
    .onChange(of: gitOperationsController.state.completedMutationCount) { _, completed in
      guard completed > 0 else { return }
      Task { await refreshGitAfterMutation() }
    }
    .alert(item: $presentedAlert) { alert in
      workspaceAlert(alert)
    }
    .confirmationDialog(
      GitOperationsStrings.destructiveTitle,
      isPresented: gitConfirmationPresented,
      titleVisibility: .visible
    ) {
      Button(GitOperationsStrings.confirm, role: .destructive) {
        Task { await gitOperationsController.confirmPendingMutation() }
      }
      Button(GitOperationsStrings.cancel, role: .cancel) {
        gitOperationsController.cancelPendingMutation()
      }
    } message: {
      Text(GitOperationsStrings.destructiveMessage)
    }
  }

  @ViewBuilder
  private var bottomControls: some View {
    if access.permitsRead {
      ProjectWorkspaceBottomControls(
        canCreate: access.permitsWrite,
        mode: Binding(
          get: { mode },
          set: { requestMode($0) }
        ),
        isSearchPresented: $isFileSearchPresented,
        query: $fileQuery,
        requestedCreationType: $requestedCreationType
      )
    }
  }

  private func workspaceAlert(_ alert: ProjectWorkspaceAlert) -> Alert {
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

  private var access: ProjectWorkspaceAccessState {
    .resolve(
      context: context,
      fileContext: fileController.context,
      gitContext: gitController.context
    )
  }

  @ViewBuilder
  private func sidebar(mode: ProjectWorkspaceMode) -> some View {
    if access.permitsRead {
      switch mode {
      case .files:
        ProjectFileBrowserView(
          controller: fileController,
          currentDirectory: currentDirectory,
          selectedEntry: selectedFile,
          canMutate: access.permitsWrite,
          query: $fileQuery,
          requestedCreationType: $requestedCreationType,
          onOpen: requestEntry,
          onOpenDirectory: requestDirectory,
          onRefresh: { await fileController.listTree(directoryPath: currentDirectory) },
          onEntryMutated: entryMutated
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
          onOpenInEditor: openChangeInEditor,
          onRefresh: { await gitController.loadStatus(detail: .full) },
          generatePullRequestSummary: generatePullRequestSummary
        )
      }
    } else {
      ProjectWorkspaceAccessView(state: access)
    }
  }

  @ViewBuilder
  private func detail(mode: ProjectWorkspaceMode) -> some View {
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
          enqueueReviewComment: enqueueReviewComment,
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
      preferredCompactColumn = .sidebar
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
      preferredCompactColumn = .detail
    case .openEditor(let path):
      let entry = ProjectWorkspaceEntry(
        path: path,
        name: path.split(separator: "/").last.map(String.init) ?? path,
        type: .file
      )
      mode = .files
      selectedFile = entry
      editor.beginLoading(path: path)
      await fileController.readFile(path: path)
      installSelectedRead(path: path)
      preferredCompactColumn = .detail
    case .discardOnly:
      break
    }
  }

  private func selectChange(_ change: ProjectGitFileChange) {
    selectedChange = change
    preferredCompactColumn = .detail
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

  private var gitConfirmationPresented: Binding<Bool> {
    Binding(
      get: { gitOperationsController.state.pendingConfirmation != nil },
      set: { if !$0 { gitOperationsController.cancelPendingMutation() } }
    )
  }

  private func openChangeInEditor(_ change: ProjectGitFileChange) {
    request(.openEditor(change.path))
  }

  private func refreshGitAfterMutation() async {
    await gitController.loadStatus(detail: .full)
    guard let selectedChange else { return }
    guard let status = gitController.status.value,
      let refreshed = (status.staged + status.unstaged).first(where: {
        $0.path == selectedChange.path
      })
    else {
      self.selectedChange = nil
      return
    }
    self.selectedChange = refreshed
    await gitController.loadDiff(filePath: refreshed.path, staged: refreshed.staged)
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

  private func entryMutated(_ mutation: ProjectWorkspaceEntryMutation) async {
    if let selectedPath = selectedFile?.path,
      selectedPath == mutation.affectedPath
        || selectedPath.hasPrefix(mutation.affectedPath + "/")
    {
      selectedFile = nil
      editor.clear()
    }
    if currentDirectory == mutation.affectedPath
      || currentDirectory.hasPrefix(mutation.affectedPath + "/")
    {
      currentDirectory = ProjectWorkspacePath.parent(of: mutation.affectedPath) ?? ""
    }
    await fileController.listTree(directoryPath: currentDirectory)
    await gitController.loadStatus(detail: .full)
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
    preferredCompactColumn = .sidebar
  }
}

private enum ProjectWorkspacePendingAction: Hashable {
  case mode(ProjectWorkspaceMode)
  case directory(String)
  case file(ProjectWorkspaceEntry)
  case openEditor(String)
  case discardOnly
}

private enum ProjectWorkspaceAlert: String, Identifiable {
  case discardChanges
  case reloadAfterSave

  var id: String { rawValue }
}
