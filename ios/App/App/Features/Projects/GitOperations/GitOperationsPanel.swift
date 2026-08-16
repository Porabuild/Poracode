import SwiftUI

struct GitOperationsPanel: View {
  let context: ProjectWorkspaceContext?
  @Bindable var controller: GitOperationsController

  @State private var commitMessage = ""
  @State private var presentedForm: GitOperationsForm?

  var body: some View {
    List {
      repositorySection
      branchesSection
      worktreesSection
    }
    .navigationTitle(GitOperationsStrings.title)
    .safeAreaInset(edge: .bottom) {
      GitOperationsCompactChrome(
        isBusy: controller.state.isBusy || !canWrite,
        onFetch: { perform(.gitFetch(.init(projectLocation: location))) },
        onPull: { perform(.gitPull(.init(projectLocation: location))) },
        onPush: { perform(.gitPush(.init(projectLocation: location))) },
        onSync: { perform(.gitSync(.init(projectLocation: location))) }
      )
    }
    .toolbar { toolbarContent }
    .task(id: ProjectWorkspaceActivationID(context)) { await activateAndRefresh() }
    .onChange(of: controller.state.completedMutationCount) { _, completed in
      guard completed > 0 else { return }
      Task { await refreshAuthoritativeState() }
    }
    .sheet(item: $presentedForm) { form in
      GitOperationsFormView(form: form, location: location, submit: perform)
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
      if let failure = controller.state.failure {
        Label(GitOperationsStrings.failure(failure), systemImage: "exclamationmark.triangle")
          .foregroundStyle(.secondary)
      }
      TextField(GitOperationsStrings.commitMessage, text: $commitMessage, axis: .vertical)
        .accessibilityLabel(GitOperationsStrings.commitMessage)
      let commit = GitOperationsPresentation.descriptor(for: .gitCommit)
      Button(commit.accessibilityLabel, systemImage: commit.symbol) {
        let message = commitMessage
        commitMessage = ""
        perform(.gitCommit(.init(projectLocation: location, message: message)))
      }
      .disabled(!canWrite || commitMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }
  }

  @ViewBuilder
  private var branchesSection: some View {
    Section(GitOperationsStrings.branches) {
      if controller.state.authoritative.owner != nil {
        Label(
          GitOperationsStrings.action(.gitGetWorktreeOwner),
          systemImage: "checkmark.circle"
        )
        .foregroundStyle(.secondary)
      }
      if let source = controller.state.authoritative.sourceBranch?.sourceBranch {
        Label(GitOperationsStrings.branch(source), systemImage: "arrow.triangle.branch")
          .foregroundStyle(.secondary)
      }
      if let branches = controller.state.authoritative.branches {
        ForEach(branches.branches) { branch in
          HStack {
            Label(
              GitOperationsStrings.branch(branch.name),
              systemImage: branch.current ? "checkmark.circle.fill" : "arrow.triangle.branch"
            )
            Spacer()
            Menu {
              ForEach(GitOperationsPresentation.actions(on: .branch)) { descriptor in
                actionButton(descriptor, enabled: branchActionEnabled(descriptor, branch: branch)) {
                  performBranchAction(descriptor.procedure, branch: branch)
                }
              }
            } label: {
              Image(systemName: "ellipsis.circle")
            }
            .disabled(!canRead)
            .accessibilityLabel(GitOperationsStrings.quickActions)
          }
          .accessibilityElement(children: .contain)
        }
      }
    }
  }

  @ViewBuilder
  private var worktreesSection: some View {
    Section(GitOperationsStrings.worktrees) {
      if let worktrees = controller.state.authoritative.worktrees {
        ForEach(worktrees) { worktree in
          HStack {
            Label(
              GitOperationsStrings.worktree(worktree.path),
              systemImage: worktree.isMain ? "folder.fill" : "folder"
            )
            Spacer()
            Menu {
              ForEach(GitOperationsPresentation.actions(on: .worktree)) { descriptor in
                actionButton(
                  descriptor,
                  enabled: worktreeActionEnabled(descriptor, worktree: worktree)
                ) {
                  performWorktreeAction(descriptor.procedure, worktree: worktree)
                }
              }
            } label: {
              Image(systemName: "ellipsis.circle")
            }
            .disabled(!canRead)
            .accessibilityLabel(GitOperationsStrings.quickActions)
          }
          .accessibilityElement(children: .contain)
        }
      }
    }
  }

  @ToolbarContentBuilder
  private var toolbarContent: some ToolbarContent {
    ToolbarItemGroup(placement: .topBarTrailing) {
      Button(GitOperationsStrings.refresh, systemImage: "arrow.clockwise") {
        Task { await refreshAuthoritativeState() }
      }
      .disabled(!canRead)
      Menu(GitOperationsStrings.quickActions, systemImage: "ellipsis.circle") {
        ForEach(
          GitOperationsPresentation.actions(on: .repository).filter {
            $0.procedure != .gitCommit
          }
        ) { descriptor in
          actionButton(descriptor, enabled: canWrite) {
            performRepositoryAction(descriptor.procedure)
          }
        }
      }
      .disabled(!canWrite)
      .accessibilityLabel(GitOperationsStrings.quickActions)
    }
  }

  private var canRead: Bool {
    guard let context else { return false }
    return context.isConsistent && context.session.gate(.sessionRead) == nil
  }

  private var canWrite: Bool {
    guard let context, !controller.state.isBusy else { return false }
    return context.isConsistent && context.session.gate(.sessionOperate) == nil
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
    branch: ProjectGitBranchInfo
  ) {
    switch procedure {
    case .gitSwitchBranch:
      perform(.gitSwitchBranch(.init(projectLocation: location, branch: branch.name)))
    case .gitDeleteBranch:
      perform(.gitDeleteBranch(.init(projectLocation: location, branch: branch.name)))
    case .gitGetWorktreeOwner:
      perform(.gitGetWorktreeOwner(.init(projectLocation: location, branch: branch.name)))
    case .gitGetWorktreeSourceBranch:
      perform(
        .gitGetWorktreeSourceBranch(.init(projectLocation: location, branch: branch.name))
      )
    default:
      break
    }
  }

  private func performWorktreeAction(
    _ procedure: GitOperationProcedure,
    worktree: ProjectGitWorktreeInfo
  ) {
    let worktreeLocation = GitOperationLocation.worktreeLocation(
      path: worktree.path,
      relativeTo: location
    )
    switch procedure {
    case .gitAbortMerge:
      perform(.gitAbortMerge(.init(worktreeLocation: worktreeLocation)))
    case .gitFinishMerge:
      perform(.gitFinishMerge(.init(worktreeLocation: worktreeLocation)))
    case .gitPullFromSource:
      guard let sourceBranch else { return }
      perform(
        .gitPullFromSource(
          .init(worktreeLocation: worktreeLocation, sourceBranch: sourceBranch)
        )
      )
    case .gitMergeToSource:
      guard !worktree.branch.isEmpty, let sourceBranch else { return }
      perform(
        .gitMergeToSource(
          .init(
            projectLocation: location,
            worktreeLocation: worktreeLocation,
            worktreeBranch: worktree.branch,
            sourceBranch: sourceBranch
          )
        )
      )
    case .gitRemoveWorktree:
      perform(
        .gitRemoveWorktree(
          .init(
            projectLocation: location,
            path: worktree.path,
            expectedBranch: worktree.branch.isEmpty ? nil : worktree.branch
          )
        )
      )
    default:
      break
    }
  }

  private func performRepositoryAction(_ procedure: GitOperationProcedure) {
    switch procedure {
    case .gitAddRemote:
      presentedForm = .remote
    case .gitAddWorktree:
      presentedForm = .worktree
    case .gitInit:
      perform(.gitInit(.init(projectLocation: location)))
    case .gitPruneWorktrees:
      let paths = controller.state.authoritative.worktrees?.map(\.path) ?? []
      perform(.gitPruneWorktrees(.init(projectLocation: location, activeWorktreePaths: paths)))
    case .gitPullRebase:
      perform(.gitPullRebase(.init(projectLocation: location)))
    case .gitSyncRebase:
      perform(.gitSyncRebase(.init(projectLocation: location)))
    case .gitStageAll:
      perform(.gitStageAll(.init(projectLocation: location)))
    case .gitUnstageAll:
      perform(.gitUnstageAll(.init(projectLocation: location)))
    case .gitRevertAll:
      perform(.gitRevertAll(.init(projectLocation: location)))
    default:
      break
    }
  }

  private func perform(_ request: GitOperationRequest) {
    guard context?.lease.location == request.ownerLocation else { return }
    Task {
      if request.procedure.metadata.scope == .read {
        await controller.read(request)
      } else {
        await controller.submit(request)
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
    guard canRead else { return }
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
      await controller.read(request)
    }
  }
}
