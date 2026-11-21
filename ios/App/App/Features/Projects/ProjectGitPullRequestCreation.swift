import SwiftUI

struct ProjectGitPullRequestDraft: Identifiable {
  let id = UUID()
  let lease: GitHubProjectLease
  let fields: GitHubOperationDraft

  init(lease: GitHubProjectLease, branch: String, baseBranch: String) {
    self.lease = lease
    fields = GitHubOperationDraft(
      account: nil, pullRequest: nil, workflow: nil,
      initialBranch: branch, initialBaseBranch: baseBranch
    )
  }
}

/// The workspace retains the form and the automatic attempt while its Git
/// sidebar is replaced during a compact or regular layout transition.
@MainActor
@Observable
final class ProjectGitPullRequestCreation {
  var generationLease: GitHubProjectLease?
  var failure: (lease: GitHubProjectLease, value: GitHubOperationsFailure)?

  func hasUncertainOutcome(for lease: GitHubProjectLease) -> Bool {
    failure?.lease == lease && failure?.value == .ambiguousOutcome
  }

  func acknowledgeRefresh(for lease: GitHubProjectLease) {
    if hasUncertainOutcome(for: lease) { failure = nil }
  }

  func submit(
    _ request: GitHubOperationRequest,
    lease: GitHubProjectLease,
    controllers: GitHubOperationsControllerSuite,
    refreshGit: () async -> Void
  ) async -> GitHubOperationsFailure? {
    guard request.procedure == .ghCreatePr else { return .notReady }
    guard !hasUncertainOutcome(for: lease) else { return .ambiguousOutcome }
    let failure = await controllers.pullRequestMutations.submit(request, expectedLease: lease)
    if failure == .ambiguousOutcome { self.failure = (lease, .ambiguousOutcome) }
    if failure == nil || failure == .ambiguousOutcome {
      await controllers.pullRequests.load(
        .ghListPullRequests(.init(projectLocation: lease.location)),
        expectedLease: lease
      )
    }
    if failure == nil { await refreshGit() }
    return failure
  }
}

struct ProjectGitPullRequestSheet: View {
  let draft: ProjectGitPullRequestDraft
  let creation: ProjectGitPullRequestCreation
  let context: GitHubControllerContext?
  let controllers: GitHubOperationsControllerSuite
  let refreshGit: () async -> Void

  @Environment(\.dismiss) private var dismiss

  var body: some View {
    GitHubOperationFormView(
      creation: draft,
      canSubmit: context?.lease == draft.lease && context?.isUsable == true,
      submit: submit
    )
    .poracodeFormSheetSizing()
    .modifier(PoracodeRetainNavigationWhilePresented())
    .nativeCommands(identity: "workspace.create-pull-request", blocksParentActions: true)
    .onChange(of: context?.lease) { _, lease in
      if lease != draft.lease { dismiss() }
    }
  }

  private func submit(_ request: GitHubOperationRequest) async -> GitHubOperationsFailure? {
    guard context?.lease == draft.lease else { return .notReady }
    return await creation.submit(
      request, lease: draft.lease, controllers: controllers, refreshGit: refreshGit
    )
  }
}
