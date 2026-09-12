import Foundation

/// Retains the five independently cancellable GitHub controllers for one
/// project-workspace destination and advances them through one ownership lifecycle.
@MainActor
final class GitHubOperationsControllerSuite {
  let availability: GitHubAvailabilityController
  let pullRequests: GitHubPullRequestController
  let pullRequestMutations: GitHubPullRequestMutationController
  let workflows: GitHubWorkflowController
  let workflowMutations: GitHubWorkflowMutationController

  init(gateway: any GitHubOperationsGateway) {
    availability = GitHubAvailabilityController(gateway: gateway)
    pullRequests = GitHubPullRequestController(gateway: gateway)
    pullRequestMutations = GitHubPullRequestMutationController(gateway: gateway)
    workflows = GitHubWorkflowController(gateway: gateway)
    workflowMutations = GitHubWorkflowMutationController(gateway: gateway)
  }

  func activate(_ context: GitHubControllerContext) {
    availability.activate(context)
    pullRequests.activate(context)
    pullRequestMutations.activate(context)
    workflows.activate(context)
    workflowMutations.activate(context)
  }

  func deactivate() {
    availability.deactivate()
    pullRequests.deactivate()
    pullRequestMutations.deactivate()
    workflows.deactivate()
    workflowMutations.deactivate()
  }

  func enterBackground() {
    availability.enterBackground()
    pullRequests.enterBackground()
    pullRequestMutations.enterBackground()
    workflows.enterBackground()
    workflowMutations.enterBackground()
  }

  func leaveBackground(_ context: GitHubControllerContext) {
    availability.leaveBackground(context)
    pullRequests.leaveBackground(context)
    pullRequestMutations.leaveBackground(context)
    workflows.leaveBackground(context)
    workflowMutations.leaveBackground(context)
  }
}

extension GitHubProjectLocation {
  init(_ location: ProjectLocation) {
    switch location {
    case .posix(let path, let remoteServerId):
      self = .posix(path: path, remoteServerId: remoteServerId)
    case .windows(let path, let remoteServerId):
      self = .windows(path: path, remoteServerId: remoteServerId)
    case .wsl(let distro, let linuxPath, let uncPath, let remoteServerId):
      self = .wsl(
        distro: distro,
        linuxPath: linuxPath,
        uncPath: uncPath,
        remoteServerId: remoteServerId
      )
    }
  }
}
