import SwiftUI

struct GitHubOperationsPanel: View {
  let context: GitHubControllerContext?
  let controllers: GitHubOperationsControllerSuite

  @State private var presentedProcedure: GitHubProcedure?

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 20) {
        statusCard
        ForEach(GitHubActionCategory.allCases, id: \.self) { category in
          GitHubOperationsChrome.card {
            VStack(alignment: .leading, spacing: 12) {
              Text(title(for: category))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
              actionGrid(category)
            }
          }
        }
      }
      .padding()
    }
    .navigationTitle(GitHubOperationsStrings.title)
    .task(id: GitHubOperationsActivationID(context)) { await loadInitialState() }
    .refreshable { await loadInitialState() }
    .sheet(item: $presentedProcedure) { procedure in
      GitHubOperationFormView(
        procedure: procedure,
        location: location,
        accounts: controllers.availability.accounts,
        pullRequests: controllers.pullRequests.pullRequests,
        workflows: controllers.workflows.workflows,
        submit: submit
      )
    }
    .confirmationDialog(
      confirmationTitle,
      isPresented: confirmationPresented,
      titleVisibility: .visible
    ) {
      Button(confirmationTitle, role: .destructive) {
        Task { await confirmPendingMutation() }
      }
      Button(GitHubOperationsStrings.cancel, role: .cancel) { cancelPendingMutation() }
    } message: {
      Text(confirmationMessage)
    }
  }

  private var location: GitHubProjectLocation {
    context?.lease.location ?? .posix(path: "", remoteServerId: nil)
  }

  private var gating: GitHubActionGating {
    GitHubActionGating(
      grantedScopes: context?.grantedScopes ?? [],
      isReady: context?.isUsable == true,
      isAvailable: controllers.availability.availability != false,
      hasBranch: true,
      hasAccount: !controllers.availability.accounts.isEmpty,
      hasPullRequest: !controllers.pullRequests.pullRequests.isEmpty,
      hasWorkflow: !controllers.workflows.workflows.isEmpty,
      hasWorkflowRun: true
    )
  }

  @ViewBuilder
  private var statusCard: some View {
    if context?.isUsable != true {
      ContentUnavailableView(
        GitHubOperationsStrings.notReady,
        systemImage: "network.slash"
      )
    } else if controllers.availability.availability == false {
      ContentUnavailableView(
        GitHubOperationsStrings.unavailable,
        systemImage: "externaldrive.badge.xmark"
      )
    } else if let failure = currentFailure {
      Label(GitHubOperationsStrings.failure(failure), systemImage: "exclamationmark.triangle")
        .foregroundStyle(.secondary)
    }
  }

  private func actionGrid(_ category: GitHubActionCategory) -> some View {
    LazyVGrid(
      columns: [GridItem(.adaptive(minimum: 148), spacing: 12)],
      spacing: 12
    ) {
      ForEach(GitHubOperationsPresentation.actions(in: category)) { descriptor in
        GitHubOperationsChrome.actionButton(role: descriptor.role) {
          presentedProcedure = descriptor.procedure
        } label: {
          Label(descriptor.title, systemImage: symbol(for: descriptor))
            .frame(maxWidth: .infinity, minHeight: 44)
            .lineLimit(2)
        }
        .disabled(!gating.permitsEntry(descriptor))
        .accessibilityLabel(descriptor.accessibilityLabel)
        .accessibilityHint(GitHubOperationsStrings.actionHint)
        .accessibilityIdentifier("github.action.\(descriptor.procedure.rawValue)")
      }
    }
  }

  private var currentFailure: GitHubOperationsFailure? {
    controllers.pullRequestMutations.state.failure
      ?? controllers.workflowMutations.state.failure
      ?? controllers.availability.failure
      ?? controllers.pullRequests.failure
      ?? controllers.workflows.failure
  }

  private var pendingConfirmation: GitHubPendingConfirmation? {
    controllers.pullRequestMutations.state.pendingConfirmation
      ?? controllers.workflowMutations.state.pendingConfirmation
  }

  private var confirmationPresented: Binding<Bool> {
    Binding(
      get: { pendingConfirmation != nil },
      set: { if !$0 { cancelPendingMutation() } }
    )
  }

  private var confirmationTitle: String {
    pendingConfirmation.map { GitHubOperationsStrings.action($0.request.procedure) }
      ?? GitHubOperationsStrings.confirm
  }

  private var confirmationMessage: String {
    pendingConfirmation.map { GitHubOperationsStrings.confirmation(for: $0.request) }
      ?? GitHubOperationsStrings.confirm
  }

  private func loadInitialState() async {
    guard let context, context.isUsable else { return }
    let location = context.lease.location
    await controllers.availability.load(
      .ghCheckAvailable(.init(projectLocation: location, detail: .summary))
    )
    guard controllers.availability.availability != false else { return }
    await controllers.availability.load(.ghListAccounts(.init(runtime: location)))
    await controllers.pullRequests.load(.ghListPullRequests(.init(projectLocation: location)))
    await controllers.workflows.load(.ghListWorkflows(.init(projectLocation: location)))
  }

  private func submit(_ request: GitHubOperationRequest) async {
    guard request.ownerLocation == context?.lease.location else { return }
    if request.procedure.metadata.scope == .read {
      if [.ghCheckAvailable, .ghListAccounts, .ghListRepos].contains(request.procedure) {
        await controllers.availability.load(request)
      } else if request.procedure.metadata.owner == .projectLocation,
        GitHubOperationsPresentation.actions(in: .pullRequests).contains(where: {
          $0.procedure == request.procedure
        })
      {
        await controllers.pullRequests.load(request)
      } else {
        await controllers.workflows.load(request)
      }
    } else if GitHubOperationsPresentation.actions(in: .pullRequests).contains(where: {
      $0.procedure == request.procedure
    }) {
      await controllers.pullRequestMutations.submit(request)
    } else {
      await controllers.workflowMutations.submit(request)
    }
  }

  private func confirmPendingMutation() async {
    if controllers.pullRequestMutations.state.pendingConfirmation != nil {
      await controllers.pullRequestMutations.confirmPendingMutation()
    } else {
      await controllers.workflowMutations.confirmPendingMutation()
    }
  }

  private func cancelPendingMutation() {
    controllers.pullRequestMutations.cancelPendingMutation()
    controllers.workflowMutations.cancelPendingMutation()
  }

  private func title(for category: GitHubActionCategory) -> String {
    switch category {
    case .availability: GitHubOperationsStrings.availability
    case .pullRequests: GitHubOperationsStrings.pullRequests
    case .workflows: GitHubOperationsStrings.workflows
    }
  }

  private func symbol(for descriptor: GitHubActionDescriptor) -> String {
    switch descriptor.category {
    case .availability: "person.2"
    case .pullRequests: "arrow.triangle.pull"
    case .workflows: "play.square.stack"
    }
  }
}

extension GitHubProcedure: Identifiable {
  var id: Self { self }
}
