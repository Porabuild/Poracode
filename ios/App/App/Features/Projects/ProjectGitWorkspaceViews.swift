import SwiftUI

struct ProjectGitSidebarView: View {
  @Bindable var controller: ProjectGitReadController
  let context: ProjectWorkspaceContext?
  @Bindable var operationsController: GitOperationsController
  let gitHubContext: GitHubControllerContext?
  let gitHubControllers: GitHubOperationsControllerSuite
  /// Absent until the host/project lease is consistent enough to review.
  let reviewDestination: ProjectReviewDetailsView?

  let selectedChange: ProjectGitFileChange?
  let onSelect: (ProjectGitFileChange) -> Void
  let onOpenInEditor: (ProjectGitFileChange) -> Void
  let onRefresh: () async -> Void
  let generatePullRequestSummary:
    @MainActor (_ branch: String, _ baseBranch: String) async throws
      -> AdvancedGeneratedPrSummary

  @State private var createPullRequestPresented = false
  @State private var isGeneratingPullRequest = false
  @State private var creationFailure: GitHubOperationsFailure?
  @AppStorage(GitHubPullRequestCreationMode.storageKey) private var creationMode =
    GitHubPullRequestCreationMode.dialog.rawValue

  var body: some View {
    List {
      statusContent
    }
    .listStyle(.sidebar)
    .contentMargins(.top, 0, for: .scrollContent)
    .defaultScrollAnchor(.top)
    .navigationTitle(ProjectWorkspaceStrings.git)
    .navigationBarTitleDisplayMode(.inline)
    .refreshable { await onRefresh() }
    .task(id: GitHubOperationsActivationID(gitHubContext)) {
      await loadPullRequestContext()
    }
    .safeAreaInset(edge: .bottom) {
      createPullRequestBar
    }
    .sheet(isPresented: $createPullRequestPresented) {
      GitHubOperationFormView(
        procedure: .ghCreatePr,
        location: gitHubContext?.lease.location ?? .posix(path: "", remoteServerId: nil),
        accounts: gitHubControllers.availability.accounts,
        pullRequests: gitHubControllers.pullRequests.pullRequests,
        workflows: [],
        initialBranch: controller.status.value?.branch ?? "",
        initialBaseBranch:
          operationsController.state.authoritative.sourceBranch?.sourceBranch ?? "main",
        submit: submitPullRequest
      )
    }
    .toolbar {
      ToolbarItemGroup(placement: .topBarTrailing) {
        Menu {
          NavigationLink {
            GitOperationsPanel(context: context, controller: operationsController)
          } label: {
            Label(GitOperationsStrings.title, systemImage: "arrow.triangle.branch")
          }
          NavigationLink {
            GitHubOperationsPanel(
              context: gitHubContext,
              controllers: gitHubControllers
            )
          } label: {
            Label(
              GitHubOperationsStrings.title, systemImage: "point.3.connected.trianglepath.dotted")
          }
          if let reviewDestination {
            NavigationLink {
              reviewDestination
            } label: {
              Label(ProjectReviewStrings.open, systemImage: "checklist")
            }
          }
        } label: {
          Label(ProjectWorkspaceStrings.git, systemImage: "ellipsis.circle")
        }
        .accessibilityLabel(ProjectWorkspaceStrings.git)
      }
    }
  }

  @ViewBuilder
  private var createPullRequestBar: some View {
    if shouldOfferCreatePullRequest {
      VStack(spacing: 6) {
        if let creationFailure {
          Label(
            GitHubOperationsStrings.failure(creationFailure),
            systemImage: "exclamationmark.triangle"
          )
          .font(.caption)
          .foregroundStyle(.secondary)
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        Menu {
          Button(alternateModeTitle, systemImage: alternateModeSymbol) {
            let alternate =
              currentCreationMode == .auto
              ? GitHubPullRequestCreationMode.dialog
              : .auto
            creationMode = alternate.rawValue
            runCreationMode(alternate)
          }
        } label: {
          if isCreatingPullRequest {
            ProgressView()
              .frame(maxWidth: .infinity)
          } else {
            Label(
              GitHubOperationsStrings.action(.ghCreatePr),
              systemImage: "arrow.triangle.pull"
            )
            .frame(maxWidth: .infinity)
          }
        } primaryAction: {
          runCreationMode(currentCreationMode)
        }
        .poracodeProminentButtonStyle()
        .disabled(!canCreatePullRequest)
        .accessibilityIdentifier("project.git.createPullRequest")
      }
      .padding(.horizontal)
      .padding(.vertical, 8)
      .background(.bar)
    }
  }

  private var currentCreationMode: GitHubPullRequestCreationMode {
    .resolved(creationMode)
  }

  private var alternateModeTitle: String {
    currentCreationMode == .auto
      ? GitHubOperationsStrings.openDialog
      : GitHubOperationsStrings.autoGenerate
  }

  private var alternateModeSymbol: String {
    currentCreationMode == .auto ? "square.and.pencil" : "sparkles"
  }

  private var isCreatingPullRequest: Bool {
    isGeneratingPullRequest
      || gitHubControllers.pullRequestMutations.state.activeMutation == .ghCreatePr
  }

  private func runCreationMode(_ mode: GitHubPullRequestCreationMode) {
    creationFailure = nil
    if mode == .dialog {
      createPullRequestPresented = true
    } else {
      Task { await createPullRequestAutomatically() }
    }
  }

  private func createPullRequestAutomatically() async {
    guard let status = controller.status.value, let creationContext = gitHubContext else { return }
    let baseBranch = operationsController.state.authoritative.sourceBranch?.sourceBranch ?? "main"
    isGeneratingPullRequest = true
    defer { isGeneratingPullRequest = false }
    do {
      let summary = try await generatePullRequestSummary(status.branch, baseBranch)
      guard gitHubContext?.lease == creationContext.lease,
        controller.status.value?.branch == status.branch,
        canCreatePullRequest
      else { throw CancellationError() }
      let request = GitHubOperationRequest.ghCreatePr(
        .init(
          projectLocation: creationContext.lease.location,
          branch: status.branch,
          baseBranch: baseBranch,
          title: summary.title,
          body: summary.description,
          isDraft: false
        )
      )
      await submitPullRequest(request)
    } catch is CancellationError {
      return
    } catch {
      creationFailure = .transport
    }
  }

  private var shouldOfferCreatePullRequest: Bool {
    guard let status = controller.status.value else { return false }
    return status.isRepo && status.hasRemote && !status.branch.isEmpty && !hasActivePullRequest
  }

  private var canCreatePullRequest: Bool {
    guard shouldOfferCreatePullRequest,
      let status = controller.status.value,
      let context = gitHubContext,
      context.isUsable,
      context.grantedScopes.contains(GitHubProcedureScope.operate.rawValue),
      gitHubControllers.availability.availability == true,
      !status.tracking.isEmpty,
      status.ahead == 0,
      !isCreatingPullRequest
    else { return false }
    return true
  }

  private var hasActivePullRequest: Bool {
    guard let branch = controller.status.value?.branch else { return false }
    return gitHubControllers.pullRequests.pullRequests.contains { request in
      request.headBranch == branch
        && !["closed", "merged"].contains(request.state.lowercased())
    }
  }

  private func loadPullRequestContext() async {
    guard let context = gitHubContext, context.isUsable else { return }
    let location = context.lease.location
    await gitHubControllers.availability.load(
      .ghCheckAvailable(.init(projectLocation: location, detail: .summary))
    )
    guard gitHubControllers.availability.availability == true else { return }
    await gitHubControllers.pullRequests.load(
      .ghListPullRequests(.init(projectLocation: location))
    )
    if let workspace = contextForGitOperations,
      let branch = controller.status.value?.branch,
      !branch.isEmpty
    {
      await operationsController.read(
        .gitGetWorktreeSourceBranch(
          .init(projectLocation: workspace.lease.location, branch: branch)
        )
      )
    }
  }

  private var contextForGitOperations: ProjectWorkspaceContext? {
    guard context?.lease == operationsController.state.context?.lease else { return nil }
    return context
  }

  private func submitPullRequest(_ request: GitHubOperationRequest) async {
    guard request.procedure == .ghCreatePr,
      request.ownerLocation == gitHubContext?.lease.location
    else { return }
    await gitHubControllers.pullRequestMutations.submit(request)
    if let failure = gitHubControllers.pullRequestMutations.state.failure {
      creationFailure = failure
      return
    }
    await loadPullRequestContext()
    await onRefresh()
  }

  @ViewBuilder
  private var statusContent: some View {
    switch controller.status.loadState {
    case .idle, .loading:
      Section {
        ForEach(0..<4, id: \.self) { _ in
          Label(ProjectWorkspaceStrings.loading, systemImage: "doc")
        }
        .redacted(reason: .placeholder)
      }
    case .failed(let failure):
      Section {
        Text(ProjectWorkspaceStrings.failureMessage(failure))
          .foregroundStyle(.secondary)
        Button(ProjectWorkspaceStrings.retry) {
          Task { await onRefresh() }
        }
      }
    case .loaded, .empty:
      if let status = controller.status.value {
        loadedStatus(status)
      } else {
        emptyStatus
      }
    }
  }

  @ViewBuilder
  private func loadedStatus(_ status: ProjectGitStatus) -> some View {
    if !status.isRepo {
      Section {
        Label(
          ProjectWorkspaceStrings.notRepository, systemImage: "externaldrive.badge.questionmark"
        )
        .foregroundStyle(.secondary)
      }
    } else {
      Section {
        Text(ProjectWorkspaceStrings.branchName(status.branch))
        Text(ProjectWorkspaceStrings.branchSummary(ahead: status.ahead, behind: status.behind))
          .font(.caption)
          .foregroundStyle(.secondary)
        Text(
          ProjectWorkspaceStrings.changeSummary(
            insertions: status.totalInsertions,
            deletions: status.totalDeletions
          )
        )
        .font(.caption.monospacedDigit())
        .foregroundStyle(.secondary)
        if status.mergeInProgress == true {
          Label(ProjectWorkspaceStrings.mergeInProgress, systemImage: "arrow.triangle.merge")
            .foregroundStyle(.orange)
        }
      }
      changesSection(status.staged, title: ProjectWorkspaceStrings.staged, staged: true)
      changesSection(status.unstaged, title: ProjectWorkspaceStrings.unstaged, staged: false)
      if let failure = operationsController.state.failure {
        Section {
          Label(
            GitOperationsStrings.failure(failure),
            systemImage: "exclamationmark.triangle"
          )
          .foregroundStyle(.secondary)
        }
      }
      if status.staged.isEmpty && status.unstaged.isEmpty {
        emptyStatus
      }
    }
  }

  @ViewBuilder
  private func changesSection(
    _ changes: [ProjectGitFileChange],
    title: String,
    staged: Bool
  ) -> some View {
    if !changes.isEmpty {
      Section {
        ForEach(ProjectWorkspaceBounds.changes(changes)) { change in
          Button {
            onSelect(change)
          } label: {
            ProjectGitChangeRow(
              change: change,
              isSelected: change.id == selectedChange?.id
            )
          }
          .buttonStyle(.plain)
          .accessibilityLabel(ProjectWorkspaceStrings.openEntry(change.path))
          .contextMenu {
            fileActions(change)
          }
          .swipeActions(edge: .trailing, allowsFullSwipe: !change.staged) {
            if !change.staged {
              fileAction(.gitRevert, change: change)
            }
            fileAction(change.staged ? .gitUnstage : .gitStage, change: change)
              .tint(change.staged ? .orange : .accentColor)
          }
        }
      } header: {
        HStack {
          Text(title)
          Spacer()
          Menu {
            groupAction(staged ? .gitUnstageAll : .gitStageAll)
            if !staged {
              groupAction(.gitRevertAll)
            }
          } label: {
            Image(systemName: "ellipsis.circle")
          }
          .disabled(isMutationUnavailable)
          .accessibilityLabel(GitOperationsStrings.quickActions)
        }
      }
    }
  }

  @ViewBuilder
  private func fileActions(_ change: ProjectGitFileChange) -> some View {
    Button(ProjectWorkspaceStrings.openEntry(change.path), systemImage: "doc.text") {
      onOpenInEditor(change)
    }
    fileAction(change.staged ? .gitUnstage : .gitStage, change: change)
    if !change.staged {
      fileAction(.gitRevert, change: change)
    }
  }

  private func fileAction(
    _ procedure: GitOperationProcedure,
    change: ProjectGitFileChange
  ) -> some View {
    let descriptor = GitOperationsPresentation.descriptor(for: procedure)
    return Button(
      descriptor.accessibilityLabel,
      systemImage: descriptor.symbol,
      role: descriptor.role == .destructive ? .destructive : nil
    ) {
      submitFileAction(procedure, change: change)
    }
    .disabled(isMutationUnavailable)
  }

  private func groupAction(_ procedure: GitOperationProcedure) -> some View {
    let descriptor = GitOperationsPresentation.descriptor(for: procedure)
    return Button(
      descriptor.accessibilityLabel,
      systemImage: descriptor.symbol,
      role: descriptor.role == .destructive ? .destructive : nil
    ) {
      submitGroupAction(procedure)
    }
  }

  private var isMutationUnavailable: Bool {
    guard let context else { return true }
    return operationsController.state.isBusy
      || !context.isConsistent
      || context.session.gate(.sessionOperate) != nil
  }

  private func submitFileAction(
    _ procedure: GitOperationProcedure,
    change: ProjectGitFileChange
  ) {
    guard let context, !isMutationUnavailable else { return }
    let request: GitOperationRequest
    switch procedure {
    case .gitStage:
      request = .gitStage(.init(projectLocation: context.lease.location, filePath: change.path))
    case .gitUnstage:
      request = .gitUnstage(.init(projectLocation: context.lease.location, filePath: change.path))
    case .gitRevert:
      request = .gitRevert(.init(projectLocation: context.lease.location, filePath: change.path))
    default:
      return
    }
    Task { await operationsController.submit(request) }
  }

  private func submitGroupAction(_ procedure: GitOperationProcedure) {
    guard let context, !isMutationUnavailable else { return }
    let request: GitOperationRequest
    switch procedure {
    case .gitStageAll:
      request = .gitStageAll(.init(projectLocation: context.lease.location))
    case .gitUnstageAll:
      request = .gitUnstageAll(.init(projectLocation: context.lease.location))
    case .gitRevertAll:
      request = .gitRevertAll(.init(projectLocation: context.lease.location))
    default:
      return
    }
    Task { await operationsController.submit(request) }
  }

  private var emptyStatus: some View {
    Section {
      Label(ProjectWorkspaceStrings.noChanges, systemImage: "checkmark.circle")
        .foregroundStyle(.secondary)
      Text(ProjectWorkspaceStrings.noChangesDescription)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }
}
