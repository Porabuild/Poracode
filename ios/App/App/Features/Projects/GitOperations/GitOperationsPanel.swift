import SwiftUI

struct GitOperationsPanel: View {
  let context: ProjectWorkspaceContext?
  @Bindable var controller: GitOperationsController

  @State private var commitMessage = ""
  @State private var presentedForm: GitOperationsFormDraft?

  var body: some View {
    List {
      repositorySection
      branchesSection
      worktreesSection
    }
    .navigationTitle(GitOperationsStrings.title)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar { toolbarContent }
    .task(id: ProjectWorkspaceActivationID(context)) { await activateAndRefresh() }
    .onChange(of: context?.lease) { _, lease in
      if presentedForm?.lease != lease { presentedForm = nil }
      commitMessage = ""
    }
    .onChange(of: controller.state.completedMutationCount) { _, completed in
      guard completed > 0 else { return }
      Task { await refreshAuthoritativeState() }
    }
    .sheet(item: $presentedForm) { draft in
      GitOperationsFormView(draft: draft, canSubmit: canWrite && context?.lease == draft.lease) { request in
        perform(request, expectedLease: draft.lease)
      }
      .poracodeFormSheetSizing()
    }
    .confirmationDialog(
      GitOperationsStrings.destructiveTitle,
      isPresented: confirmationPresented,
      titleVisibility: .visible
    ) {
      Button(GitOperationsStrings.confirm, role: .destructive) {
        Task { await controller.confirmPendingMutation() }
      }
      Button(GitOperationsStrings.cancel, role: .cancel) {
        controller.cancelPendingMutation()
      }
    } message: {
      Text(GitOperationsStrings.destructiveMessage)
    }
  }

  private var location: ProjectLocation {
    context?.lease.location ?? .posix(path: "")
  }

  private var confirmationPresented: Binding<Bool> {
    Binding(
      get: { controller.state.pendingConfirmation != nil },
      set: { if !$0 { controller.cancelPendingMutation() } }
    )
  }

  @ViewBuilder
  private var repositorySection: some View {
    Section(GitOperationsStrings.repository) {
      if activeLease != nil, let failure = controller.state.failure {
        Label(GitOperationsStrings.failure(failure), systemImage: "exclamationmark.triangle")
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("native-e2e.git.failure")
      }
      TextField(GitOperationsStrings.commitMessage, text: $commitMessage, axis: .vertical)
        .accessibilityLabel(GitOperationsStrings.commitMessage)
      let commit = GitOperationsPresentation.descriptor(for: .gitCommit)
      let lease = activeLease
      Button(commit.accessibilityLabel, systemImage: commit.symbol) {
        guard let lease, activeLease == lease, canWrite else { return }
        let message = commitMessage
        commitMessage = ""
        perform(.gitCommit(.init(projectLocation: lease.location, message: message)), expectedLease: lease)
      }
      .disabled(!canWrite || commitMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }
  }

  @ViewBuilder
  private var branchesSection: some View {
    Section(GitOperationsStrings.branches) {
      if activeLease != nil, controller.state.authoritative.owner != nil {
        Label(
          GitOperationsStrings.action(.gitGetWorktreeOwner),
          systemImage: "checkmark.circle"
        )
        .foregroundStyle(.secondary)
      }
      if activeLease != nil, let source = controller.state.authoritative.sourceBranch?.sourceBranch {
        Label(GitOperationsStrings.branch(source), systemImage: "arrow.triangle.branch")
          .foregroundStyle(.secondary)
      }
      if let lease = activeLease, let branches = controller.state.authoritative.branches {
        ForEach(branches.branches) { branch in
          Label(
            GitOperationsStrings.branch(branch.name),
            systemImage: branch.current ? "checkmark.circle.fill" : "arrow.triangle.branch"
          )
          .frame(maxWidth: .infinity, alignment: .leading)
          .contentShape(Rectangle())
          .contextMenu {
            ForEach(GitOperationsPresentation.actions(on: .branch)) { descriptor in
              actionButton(descriptor, enabled: branchActionEnabled(descriptor, branch: branch)) {
                performBranchAction(descriptor.procedure, branch: branch, lease: lease)
              }
            }
          }
          .accessibilityActions {
            ForEach(GitOperationsPresentation.actions(on: .branch)) { descriptor in
              actionButton(descriptor, enabled: branchActionEnabled(descriptor, branch: branch)) {
                performBranchAction(descriptor.procedure, branch: branch, lease: lease)
              }
            }
          }
        }
      }
    }
  }

  @ViewBuilder
  private var worktreesSection: some View {
    Section(GitOperationsStrings.worktrees) {
      if let lease = activeLease, let worktrees = controller.state.authoritative.worktrees {
        ForEach(worktrees) { worktree in
          Label(
            GitOperationsStrings.worktree(worktree.path),
            systemImage: worktree.isMain ? "folder.fill" : "folder"
          )
          .frame(maxWidth: .infinity, alignment: .leading)
          .contentShape(Rectangle())
          .contextMenu {
            ForEach(GitOperationsPresentation.actions(on: .worktree)) { descriptor in
              actionButton(
                descriptor,
                enabled: worktreeActionEnabled(descriptor, worktree: worktree)
              ) {
                performWorktreeAction(descriptor.procedure, worktree: worktree, lease: lease)
              }
            }
          }
          .accessibilityActions {
            ForEach(GitOperationsPresentation.actions(on: .worktree)) { descriptor in
              actionButton(
                descriptor,
                enabled: worktreeActionEnabled(descriptor, worktree: worktree)
              ) {
                performWorktreeAction(descriptor.procedure, worktree: worktree, lease: lease)
              }
            }
          }
        }
      }
    }
  }

  @ToolbarContentBuilder
  private var toolbarContent: some ToolbarContent {
    let lease = activeLease
    GitOperationsQuickToolbar(isEnabled: canWrite) { procedure in
      performRepositoryAction(procedure, lease: lease)
    }
    ToolbarItemGroup(placement: .topBarTrailing) {
      Button(GitOperationsStrings.refresh, systemImage: "arrow.clockwise") {
        Task { await refreshAuthoritativeState() }
      }
      .disabled(!canRead)
      Menu {
        ForEach(
          GitOperationsPresentation.actions(on: .repository).filter {
            $0.procedure != .gitCommit
          }
        ) { descriptor in
          actionButton(descriptor, enabled: canWrite) {
            performRepositoryAction(descriptor.procedure, lease: lease)
          }
        }
      } label: {
        Label(GitOperationsStrings.quickActions, systemImage: "ellipsis")
          .symbolRenderingMode(.monochrome)
      }
      .disabled(!canWrite)
      .tint(.primary)
      .accessibilityLabel(GitOperationsStrings.quickActions)
      .accessibilityIdentifier("native-e2e.git.panel-quick-actions")
    }
  }

  private var activeLease: ProjectWorkspaceLease? {
    guard let context, context.isConsistent, controller.state.context?.lease == context.lease else { return nil }
    return context.lease
  }

  private var canRead: Bool {
    activeLease != nil && context?.session.gate(.sessionRead) == nil
  }

  private var canWrite: Bool {
    activeLease != nil && !controller.state.isBusy && context?.session.gate(.sessionOperate) == nil
  }

  private func actionButton(
    _ descriptor: GitOperationsActionDescriptor,
    enabled: Bool,
    action: @escaping () -> Void
  ) -> some View {
    Button(
      descriptor.accessibilityLabel,
      systemImage: descriptor.symbol,
      role: descriptor.role == .destructive ? .destructive : nil,
      action: action
    )
    .disabled(!enabled)
    .accessibilityLabel(descriptor.accessibilityLabel)
    .accessibilityIdentifier("native-e2e.git.\(descriptor.procedure.rawValue)")
  }

  private func branchActionEnabled(
    _ descriptor: GitOperationsActionDescriptor,
    branch: ProjectGitBranchInfo
  ) -> Bool {
    switch descriptor.procedure {
    case .gitSwitchBranch: canWrite && !branch.current && !branch.isRemote
    case .gitDeleteBranch: canWrite && !branch.current && !branch.isRemote
    case .gitGetWorktreeOwner, .gitGetWorktreeSourceBranch: canRead && !branch.isRemote
    default: false
    }
  }

  private func worktreeActionEnabled(
    _ descriptor: GitOperationsActionDescriptor,
    worktree: ProjectGitWorktreeInfo
  ) -> Bool {
    let isCurrentLocation = worktree.path == location.displayPath
    switch descriptor.procedure {
    case .gitAbortMerge, .gitFinishMerge:
      return canWrite && isCurrentLocation
    case .gitPullFromSource:
      return canWrite && isCurrentLocation && sourceBranch != nil
    case .gitMergeToSource:
      return canWrite && !worktree.isMain && !worktree.branch.isEmpty && sourceBranch != nil
    case .gitRemoveWorktree:
      return canWrite && !worktree.isMain
    default:
      return false
    }
  }

  private var sourceBranch: String? {
    controller.state.authoritative.sourceBranch?.sourceBranch
  }

  private func performBranchAction(
    _ procedure: GitOperationProcedure,
    branch: ProjectGitBranchInfo,
    lease: ProjectWorkspaceLease
  ) {
    let request: GitOperationRequest
    switch procedure {
    case .gitSwitchBranch:
      request = .gitSwitchBranch(.init(projectLocation: lease.location, branch: branch.name))
    case .gitDeleteBranch:
      request = .gitDeleteBranch(.init(projectLocation: lease.location, branch: branch.name))
    case .gitGetWorktreeOwner:
      request = .gitGetWorktreeOwner(.init(projectLocation: lease.location, branch: branch.name))
    case .gitGetWorktreeSourceBranch:
      request = .gitGetWorktreeSourceBranch(.init(projectLocation: lease.location, branch: branch.name))
    default: return
    }
    perform(request, expectedLease: lease)
  }

  private func performWorktreeAction(
    _ procedure: GitOperationProcedure,
    worktree: ProjectGitWorktreeInfo,
    lease: ProjectWorkspaceLease
  ) {
    guard activeLease == lease else { return }
    let location = lease.location
    let worktreeLocation = GitOperationLocation.worktreeLocation(
      path: worktree.path,
      relativeTo: location
    )
    let request: GitOperationRequest
    switch procedure {
    case .gitAbortMerge:
      request = .gitAbortMerge(.init(worktreeLocation: worktreeLocation))
    case .gitFinishMerge:
      request = .gitFinishMerge(.init(worktreeLocation: worktreeLocation))
    case .gitPullFromSource:
      guard let sourceBranch else { return }
      request = .gitPullFromSource(.init(worktreeLocation: worktreeLocation, sourceBranch: sourceBranch))
    case .gitMergeToSource:
      guard !worktree.branch.isEmpty, let sourceBranch else { return }
      request = .gitMergeToSource(
        .init(
          projectLocation: location,
          worktreeLocation: worktreeLocation,
          worktreeBranch: worktree.branch,
          sourceBranch: sourceBranch
        )
      )
    case .gitRemoveWorktree:
      request = .gitRemoveWorktree(
        .init(
          projectLocation: location,
          path: worktree.path,
          expectedBranch: worktree.branch.isEmpty ? nil : worktree.branch
        )
      )
    default: return
    }
    perform(request, expectedLease: lease)
  }

  private func performRepositoryAction(_ procedure: GitOperationProcedure, lease: ProjectWorkspaceLease?) {
    guard let lease, lease == activeLease, canWrite else { return }
    let location = lease.location
    let request: GitOperationRequest
    switch procedure {
    case .gitAddRemote:
      presentedForm = GitOperationsFormDraft(form: .remote, lease: lease)
      return
    case .gitAddWorktree:
      presentedForm = GitOperationsFormDraft(form: .worktree, lease: lease)
      return
    case .gitFetch:
      request = .gitFetch(.init(projectLocation: location))
    case .gitPull:
      request = .gitPull(.init(projectLocation: location))
    case .gitPush:
      request = .gitPush(.init(projectLocation: location))
    case .gitSync:
      request = .gitSync(.init(projectLocation: location))
    case .gitInit:
      request = .gitInit(.init(projectLocation: location))
    case .gitPruneWorktrees:
      let paths = controller.state.authoritative.worktrees?.map(\.path) ?? []
      request = .gitPruneWorktrees(.init(projectLocation: location, activeWorktreePaths: paths))
    case .gitPullRebase:
      request = .gitPullRebase(.init(projectLocation: location))
    case .gitSyncRebase:
      request = .gitSyncRebase(.init(projectLocation: location))
    case .gitStageAll:
      request = .gitStageAll(.init(projectLocation: location))
    case .gitUnstageAll:
      request = .gitUnstageAll(.init(projectLocation: location))
    case .gitRevertAll:
      request = .gitRevertAll(.init(projectLocation: location))
    default: return
    }
    perform(request, expectedLease: lease)
  }

  private func perform(_ request: GitOperationRequest, expectedLease lease: ProjectWorkspaceLease) {
    guard activeLease == lease, lease.location == request.ownerLocation else { return }
    Task {
      if request.procedure.metadata.scope == .read {
        await controller.read(request, expectedLease: lease)
      } else {
        await controller.submit(request, expectedLease: lease)
      }
    }
  }

  private func activateAndRefresh() async {
    guard let context, context.isConsistent else {
      controller.deactivate()
      return
    }
    controller.activate(context)
    await refreshAuthoritativeState()
  }

  private func refreshAuthoritativeState() async {
    guard canRead, let lease = context?.lease else { return }
    let worktreePaths =
      controller.state.authoritative.worktrees?.map(\.path)
      ?? [location.displayPath]
    for descriptor in GitOperationsPresentation.actions(on: .authoritativeRefresh) {
      let request: GitOperationRequest
      switch descriptor.procedure {
      case .gitListBranches:
        request = .gitListBranches(.init(projectLocation: location, includeRemote: true))
      case .gitListWorktrees:
        request = .gitListWorktrees(.init(projectLocation: location))
      case .gitWorktreeStatusBatch:
        request = .gitWorktreeStatusBatch(
          .init(projectLocation: location, worktreePaths: worktreePaths, detail: .full)
        )
      default:
        continue
      }
      await controller.read(request, expectedLease: lease)
    }
  }
}
