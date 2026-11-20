import SwiftUI

struct ProjectWorkspaceView: View {
  @Environment(\.dismiss) private var dismiss
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  @Environment(\.poracodeEmbeddedInInspector) private var embeddedInInspector
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
    @MainActor (_ branch: String, _ baseBranch: String, _ lease: GitHubProjectLease) async throws
      -> AdvancedGeneratedPrSummary
  let showsModePicker: Bool
  let externalMode: Binding<ProjectWorkspaceMode>?
  let closeFromKeyboard: (() -> Void)?
  let linkedFile: ProjectWorkspaceFileTarget?
  let linkedSocketOnline: Bool?

  @State private var mode: ProjectWorkspaceMode
  @State var selectedFile: ProjectWorkspaceEntry?
  @State var selectedLine: Int?
  @State private var selectedChange: ProjectGitFileChange?
  @State private var preferredCompactColumn = NavigationSplitViewColumn.sidebar
  @State var currentDirectory = ""
  @State var editor = ProjectWorkspaceEditorState()
  @State private var pendingAction: ProjectWorkspacePendingAction?
  @State var presentedAlert: ProjectWorkspaceAlert?
  @State var activeLease: ProjectWorkspaceLease?
  @State var linkedEditorLease: ProjectWorkspaceLease?
  @State var linkedNeedsRefresh = false
  @State var linkedSaveInFlight: ProjectWorkspaceEditorState.Save?
  @State private var isFileSearchPresented = false
  @State private var hasVerticalBar = false
  @State private var fileQuery = ""
  @State private var requestedCreationType: AdvancedProjectEntryType?
  @State private var gitDestination: ProjectGitDestination?
  @State private var pullRequestCreation = ProjectGitPullRequestCreation()

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
        _ branch: String, _ baseBranch: String, _ lease: GitHubProjectLease
      ) async throws -> AdvancedGeneratedPrSummary,
    initialMode: ProjectWorkspaceMode = .files,
    initialFile: ProjectWorkspaceFileTarget? = nil,
    linkedSocketOnline: Bool? = nil,
    showsModePicker: Bool = true,
    externalMode: Binding<ProjectWorkspaceMode>? = nil,
    closeFromKeyboard: (() -> Void)? = nil
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
    self.showsModePicker = showsModePicker
    self.externalMode = externalMode
    self.closeFromKeyboard = closeFromKeyboard
    linkedFile = initialFile
    self.linkedSocketOnline = linkedSocketOnline
    _mode = State(initialValue: externalMode?.wrappedValue ?? initialMode)
  }

  var showsLinkedFile: Bool { linkedFile != nil }

  var body: some View {
    workspacePage
      .toolbar(!showsLinkedFile && usesSidebarControls ? .hidden : .automatic, for: .navigationBar)
      .toolbar {
        if showsLinkedFile {
          ToolbarItem(placement: .cancellationAction) {
            PoracodeToolbarIconButton(title: AdvancedOperationsStrings.close,
              systemImage: "xmark", color: .primary) { request(.closeWorkspace) }
              .accessibilityIdentifier("native-e2e.source-file.close")
          }
        }
      }
      .background {
        if #available(iOS 27.1, *), !embeddedInInspector {
          PoracodeVerticalBarReader(hasVerticalBar: $hasVerticalBar)
            .allowsHitTesting(false)
        }
      }
      .task(id: ProjectWorkspaceActivationID(context, linkedSocketOnline: linkedSocketOnline)) {
        await activateAndLoad()
      }
      .onChange(of: externalMode?.wrappedValue) { _, updated in
        if let updated, updated != mode {
          request(.mode(updated))
        }
      }
      .onChange(of: gitOperationsController.state.completedMutationCount) { _, completed in
        guard completed > 0 else { return }
        Task { await refreshGitAfterMutation() }
      }
      .alert(item: $presentedAlert) { alert in
        alert.presentation(
          path: editor.path ?? selectedFile?.path ?? "",
          discard: confirmPendingAction,
          cancelDiscard: {
            pendingAction = nil
            externalMode?.wrappedValue = mode
          },
          reload: { Task { await reloadSelectedFile() } }
        )
      }
      .sheet(item: $gitDestination) { destination in
        ProjectGitDestinationSheet(
          destination: destination,
          context: gitOperationsContext,
          operationsController: gitOperationsController,
          gitHubContext: gitHubOperationsContext,
          gitHubControllers: gitHubOperationsControllers,
          reviewDestination: reviewDestination,
          creation: pullRequestCreation, refreshGit: refreshGitAfterMutation
        )
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
      .nativeCommands(identity: "workspace:\(mode)", actions: keyboardCloseActions)
  }

  @ViewBuilder
  private var workspacePage: some View {
    if showsLinkedFile {
      if selectedFile == nil, activeLease != nil {
        ProjectWorkspaceLoadingView()
      } else {
        detail(mode: .files)
      }
    } else {
      projectWorkspacePage
    }
  }

  private var projectWorkspacePage: some View {
    let controls = workspaceControls
    return ProjectWorkspacePage(
      mode: $mode,
      preferredCompactColumn: $preferredCompactColumn,
      hasBottomControls: !usesSidebarControls && (showsModePicker || (mode == .files && !usesSystemFileActions))
    ) {
      workspaceSidebar(mode: .files, controls: controls)
    } filesDetail: {
      detail(mode: .files)
    } gitSidebar: {
      workspaceSidebar(mode: .git, controls: controls)
    } gitDetail: {
      detail(mode: .git)
    } bottomControls: {
      if access.permitsRead { controls }
    } fileToolbar: {
      if usesSystemFileActions && access.permitsRead && mode == .files {
        controls.fileToolbar
      }
    }
  }

  private var keyboardCloseActions: [String: NativeCommandRegistry.Action] {
    guard closeFromKeyboard != nil else { return [:] }
    let close = NativeCommandRegistry.Action(enabled: fileController.fileWrite.loadState != .loading) { _ in
      request(.closeWorkspace)
    }
    return mode == .files ? ["files.open": close, "files.toggle": close] : ["git.open": close]
  }

  // The software keyboard can cover the rail's lower group while the search field is active.
  private var usesSystemFileActions: Bool {
    !embeddedInInspector && hasVerticalBar && !isFileSearchPresented
  }

  private var usesSidebarControls: Bool {
    !embeddedInInspector && !hasVerticalBar && horizontalSizeClass == .regular
  }

  private var workspaceControls: ProjectWorkspaceBottomControls {
    ProjectWorkspaceBottomControls(
      canCreate: access.permitsWrite,
      mode: Binding(
        get: { mode },
        set: { requestMode($0) }
      ),
      isSearchPresented: $isFileSearchPresented,
      query: $fileQuery,
      requestedCreationType: $requestedCreationType,
      showsModePicker: showsModePicker,
      usesSystemFileActions: usesSystemFileActions
    )
  }

  private func workspaceSidebar(mode: ProjectWorkspaceMode, controls: ProjectWorkspaceBottomControls) -> some View {
    ProjectWorkspaceSidebarPane(
      usesSidebarControls: usesSidebarControls, permitsRead: access.permitsRead,
      mode: mode, controls: controls, closeWorkspace: { request(.closeWorkspace) }
    ) {
      sidebar(mode: mode)
    }
  }

  var access: ProjectWorkspaceAccessState {
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
          canOpenReview: reviewDestination != nil,
          onOpenDestination: { gitDestination = $0 },
          creation: pullRequestCreation,
          usesCompactLayout: horizontalSizeClass == .compact,
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
          selectedLine: selectedLine,
          showsEmptyTitle: !usesSidebarControls,
          access: access,
          onDiscard: { request(.discardOnly) },
          onSave: { Task { await saveSelectedFile() } },
          onReload: { Task { await retrySelectedRead() } }
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
    if let linkedFile {
      await activateLinkedFile(linkedFile)
      return
    }
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
    if entry.path == selectedFile?.path && editor.isDirty {
      // Reopen the existing draft after dismissing the embedded editor sheet.
      preferredCompactColumn = .detail
    } else if entry.type == .directory {
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

  func perform(_ action: ProjectWorkspacePendingAction) async {
    switch action {
    case .mode(let nextMode):
      mode = nextMode
      externalMode?.wrappedValue = nextMode
      preferredCompactColumn = .sidebar
      if nextMode == .git {
        await gitController.loadStatus(detail: .full)
      } else {
        await fileController.listTree(directoryPath: currentDirectory)
      }
    case .directory(let path):
      selectedFile = nil
      selectedLine = nil
      editor.clear()
      currentDirectory = path
      await fileController.listTree(directoryPath: path)
    case .file(let entry):
      selectedFile = entry
      selectedLine = nil
      editor.beginLoading(path: entry.path)
      await fileController.readFile(path: entry.path)
      installSelectedRead(path: entry.path)
      preferredCompactColumn = .detail
    case .openEditor(let target):
      let path = target.path
      let entry = ProjectWorkspaceEntry(
        path: path,
        name: path.split(separator: "/").last.map(String.init) ?? path,
        type: .file
      )
      mode = .files
      externalMode?.wrappedValue = .files
      selectedFile = entry
      selectedLine = target.line
      preferredCompactColumn = .detail
      editor.beginLoading(path: path)
      await fileController.readFile(path: path)
      guard selectedFile?.path == path else { return }
      installSelectedRead(path: path)
    case .discardOnly:
      if editor.requiresReload { await reloadSelectedFile() }
    case .closeWorkspace:
      if let closeFromKeyboard { closeFromKeyboard() }
      else { dismiss() }
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
      get: { gitDestination?.ownsGitConfirmation != true && gitOperationsController.state.pendingConfirmation != nil },
      set: { if !$0 && gitDestination?.ownsGitConfirmation != true { gitOperationsController.cancelPendingMutation() } }
    )
  }

  private func openChangeInEditor(_ change: ProjectGitFileChange) {
    request(.openEditor(ProjectWorkspaceFileTarget(path: change.path)))
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

  func clearSelection() {
    gitDestination = nil
    selectedFile = nil
    selectedLine = nil
    selectedChange = nil
    pendingAction = nil
    presentedAlert = nil
    editor.clear()
    preferredCompactColumn = .sidebar
  }
}

enum ProjectWorkspacePendingAction: Hashable {
  case mode(ProjectWorkspaceMode)
  case directory(String)
  case file(ProjectWorkspaceEntry)
  case openEditor(ProjectWorkspaceFileTarget)
  case discardOnly
  case closeWorkspace
}
