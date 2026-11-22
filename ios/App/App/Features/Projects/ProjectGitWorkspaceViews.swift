import SwiftUI

struct ProjectGitSidebarView: View {
  @Bindable var controller: ProjectGitReadController
  let context: ProjectWorkspaceContext?
  @Bindable var operationsController: GitOperationsController
  let gitHubContext: GitHubControllerContext?
  let gitHubControllers: GitHubOperationsControllerSuite
  /// Absent until the host/project lease is consistent enough to review.
  let canOpenReview: Bool
  let onOpenDestination: (ProjectGitDestination) -> Void
  let creation: ProjectGitPullRequestCreation
  let usesCompactLayout: Bool

  let selectedChange: ProjectGitFileChange?
  let onSelect: (ProjectGitFileChange) -> Void
  let onOpenInEditor: (ProjectGitFileChange) -> Void
  let onRefresh: () async -> Void
  let generatePullRequestSummary:
    @MainActor (_ branch: String, _ baseBranch: String, _ lease: GitHubProjectLease) async throws
      -> AdvancedGeneratedPrSummary

  @Environment(\.poracodeEmbeddedInInspector) private var embeddedInInspector
  @AppStorage(GitHubPullRequestCreationMode.storageKey) private var creationMode =
    GitHubPullRequestCreationMode.dialog.rawValue

  var body: some View {
    navigationWrappedList
      .refreshable { await refreshPullRequestContext() }
      .task(id: GitHubOperationsActivationID(gitHubContext)) { await loadPullRequestContext() }
  }

  private var usesSystemCreateToolbar: Bool {
    !embeddedInInspector && usesCompactLayout
  }

  @ViewBuilder
  private var navigationWrappedList: some View {
    let list = List { statusContent }
      .listStyle(.sidebar)
      .contentMargins(.top, 0, for: .scrollContent)
      .defaultScrollAnchor(.top)
    if embeddedInInspector {
      list
    } else {
      list
        .navigationTitle(ProjectWorkspaceStrings.git)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          if usesSystemCreateToolbar && shouldOfferCreatePullRequest {
            ToolbarItem(placement: .bottomBar) { createPullRequestAction }
          }
          ToolbarItemGroup(placement: .topBarTrailing) {
            gitMenu {
              Label(ProjectWorkspaceStrings.git, systemImage: "ellipsis")
                .symbolRenderingMode(.monochrome)
            }
          }
        }
    }
  }

  private func gitMenu<MenuLabel: View>(
    @ViewBuilder label: @escaping () -> MenuLabel
  ) -> some View {
    Menu {
      Button(GitOperationsStrings.title, systemImage: "arrow.triangle.branch") {
        onOpenDestination(.gitOperations)
      }
      .accessibilityIdentifier("native-e2e.git.open-operations")
      Button(GitHubOperationsStrings.title, systemImage: "point.3.connected.trianglepath.dotted") {
        onOpenDestination(.gitHubOperations)
      }
      if canOpenReview {
        Button(ProjectReviewStrings.open, systemImage: "checklist") {
          onOpenDestination(.review)
        }
      }
    } label: {
      label()
    }
    .accessibilityLabel(ProjectWorkspaceStrings.git)
    .accessibilityIdentifier("native-e2e.git.panel-menu")
    .tint(.primary)
  }

  private var createPullRequestAction: some View {
    Menu {
      Button(alternateModeTitle, systemImage: alternateModeSymbol) {
        let alternate: GitHubPullRequestCreationMode =
          currentCreationMode == .auto ? .dialog : .auto
        if runCreationMode(alternate) { creationMode = alternate.rawValue }
      }
      .accessibilityIdentifier("native-e2e.git.create-pr-alternate")
    } label: {
      Label(GitHubOperationsStrings.action(.ghCreatePr), systemImage: "arrow.triangle.pull")
        .symbolRenderingMode(.monochrome)
    } primaryAction: {
      runCreationMode(currentCreationMode)
    }
    .tint(.primary)
    .disabled(!canCreatePullRequest)
    .accessibilityIdentifier("project.git.createPullRequest")
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

  @discardableResult
  private func runCreationMode(_ mode: GitHubPullRequestCreationMode) -> Bool {
    guard canCreatePullRequest, let lease = gitHubContext?.lease,
      let branch = controller.status.value?.branch
    else { return false }
    let baseBranch = contextForGitOperations.flatMap { _ in
      operationsController.state.authoritative.sourceBranch?.sourceBranch
    } ?? "main"
    creation.failure = nil
    if mode == .dialog {
      onOpenDestination(.createPullRequest(ProjectGitPullRequestDraft(lease: lease, branch: branch, baseBranch: baseBranch)))
    } else {
      creation.generationLease = lease
      Task { await createPullRequestAutomatically(branch: branch, baseBranch: baseBranch, lease: lease) }
    }
    return true
  }

  private func createPullRequestAutomatically(
    branch: String, baseBranch: String, lease: GitHubProjectLease
  ) async {
    defer {
      if creation.generationLease == lease { creation.generationLease = nil }
    }
    do {
      let summary = try await generatePullRequestSummary(branch, baseBranch, lease)
      guard controller.status.value?.branch == branch, eligibleForCreation,
        creation.generationLease == lease
      else { return }
      let request = GitHubOperationRequest.ghCreatePr(
        .init(
          projectLocation: lease.location,
          branch: branch,
          baseBranch: baseBranch,
          title: summary.title,
          body: summary.description,
          isDraft: false
        )
      )
      if let failure = await creation.submit(
        request, lease: lease, controllers: gitHubControllers, refreshGit: onRefresh
      ), creation.generationLease == lease {
        creation.failure = (lease, failure)
      }
    } catch is CancellationError {
      return
    } catch {
      if creation.generationLease == lease { creation.failure = (lease, .transport) }
    }
  }

  private var shouldOfferCreatePullRequest: Bool {
    guard let status = controller.status.value else { return false }
    return status.isRepo && status.hasRemote && !status.branch.isEmpty && !hasActivePullRequest
  }

  private var eligibleForCreation: Bool {
    guard shouldOfferCreatePullRequest,
      let status = controller.status.value,
      let context = gitHubContext,
      context.isUsable,
      context.permits(.operate),
      gitHubControllers.availability.availability == true,
      gitHubControllers.pullRequests.hasCatalog(for: context.lease),
      !status.tracking.isEmpty,
      status.ahead == 0,
      !gitHubControllers.pullRequestMutations.state.isBusy
    else { return false }
    return true
  }

  private var canCreatePullRequest: Bool {
    guard let lease = gitHubContext?.lease else { return false }
    return eligibleForCreation && creation.generationLease != lease
      && !creation.hasUncertainOutcome(for: lease)
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
      .ghCheckAvailable(.init(projectLocation: location, detail: .summary)),
      expectedLease: context.lease
    )
    guard gitHubControllers.availability.availability == true else { return }
    await gitHubControllers.pullRequests.load(
      .ghListPullRequests(.init(projectLocation: location)), expectedLease: context.lease
    )
    if let workspace = contextForGitOperations,
      let branch = controller.status.value?.branch,
      !branch.isEmpty
    {
      let batchBranches = Array(
        Set(
          [branch] + (operationsController.state.authoritative.worktrees ?? []).compactMap(\.branch)
        )
      )
      await operationsController.read(
        .gitWorktreeSourceBranchBatch(
          .init(projectLocation: workspace.lease.location, branches: batchBranches)
        ), expectedLease: workspace.lease
      )
      if operationsController.state.authoritative.worktreeSourceBranches[branch] == nil {
        await operationsController.read(
          .gitGetWorktreeSourceBranch(
            .init(projectLocation: workspace.lease.location, branch: branch)
          ), expectedLease: workspace.lease
        )
      }
    }
  }

  private func refreshPullRequestContext() async {
    await onRefresh()
    await loadPullRequestContext()
    if let lease = gitHubContext?.lease, gitHubControllers.pullRequests.loadState == .loaded,
      gitHubControllers.pullRequests.hasCatalog(for: lease)
    {
      creation.acknowledgeRefresh(for: lease)
    }
  }

  private var contextForGitOperations: ProjectWorkspaceContext? {
    guard context?.lease == operationsController.state.context?.lease else { return nil }
    return context
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
        ProjectGitEmptyStatusSection()
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
        HStack(spacing: 8) {
          Text(ProjectWorkspaceStrings.branchName(status.branch))
          Spacer(minLength: 8)
          if embeddedInInspector {
            gitMenu {
              Image(systemName: "ellipsis.circle")
                .foregroundStyle(.secondary)
            }
          }
        }
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
        if !usesSystemCreateToolbar && shouldOfferCreatePullRequest { createPullRequestAction }
        if let failure = creation.failure, failure.lease == gitHubContext?.lease {
          Label(GitHubOperationsStrings.failure(failure.value), systemImage: "exclamationmark.triangle")
            .foregroundStyle(.secondary)
          if failure.value == .ambiguousOutcome {
            Button(ProjectWorkspaceStrings.refresh, systemImage: "arrow.clockwise") {
              Task { await refreshPullRequestContext() }
            }
          }
        }
        if creation.generationLease != nil && creation.generationLease == gitHubContext?.lease {
          ProgressView(GitHubOperationsStrings.autoGenerate)
        }
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
        ProjectGitEmptyStatusSection()
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
              .tint(change.staged ? .orange : .gray)
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
            Image(systemName: "ellipsis")
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
      guard !isMutationUnavailable else { return }
      ProjectGitOperationDispatcher.submitFileAction(
        procedure,
        change: change,
        context: context,
        operationsController: operationsController
      )
    }
    .accessibilityIdentifier("native-e2e.git.\(procedure.rawValue)")
    .disabled(isMutationUnavailable)
  }

  private func groupAction(_ procedure: GitOperationProcedure) -> some View {
    let descriptor = GitOperationsPresentation.descriptor(for: procedure)
    return Button(
      descriptor.accessibilityLabel,
      systemImage: descriptor.symbol,
      role: descriptor.role == .destructive ? .destructive : nil
    ) {
      guard !isMutationUnavailable else { return }
      ProjectGitOperationDispatcher.submitGroupAction(
        procedure,
        context: context,
        operationsController: operationsController
      )
    }
    .accessibilityIdentifier("native-e2e.git.\(procedure.rawValue)")
  }

  private var isMutationUnavailable: Bool {
    guard let context else { return true }
    return operationsController.state.isBusy
      || !context.isConsistent
      || context.session.gate(.sessionOperate) != nil
  }
}
