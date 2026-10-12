import Foundation
import Observation

/// Loads pull requests for every synced project of the selected connection.
///
/// Loads run sequentially so the exact-host transport source sees exactly one
/// active project lease at a time, mirroring the single-project workspace
/// composition on a per-project basis.
@MainActor
@Observable
final class PullRequestsController {
  struct ProjectFailure: Identifiable, Equatable, Sendable {
    let projectName: String
    let message: String
    var id: String { projectName }
  }

  private(set) var entries: [PullRequestsEntry] = []
  private(set) var failures: [ProjectFailure] = []
  private(set) var projects: [RemoteProject] = []
  private(set) var isLoading = false
  private(set) var didLoad = false
  private(set) var hasProjects = false

  private let session: AppSession
  private var gateway: (any GitHubOperationsGateway)!
  private var activeContext: GitHubControllerContext?
  private var loadGeneration = 0

  init(session: AppSession) {
    self.session = session
    let transport = GitHubOperationsExactHostTransportSource(
      credentials: session.deps.hostCatalog,
      contextProvider: { @MainActor [weak self] in self?.activeContext }
    )
    gateway = SelectedGitHubOperationsGateway(selectionResolver: { lease in
      try await transport.selection(for: lease)
    })
  }

  func load() async {
    loadGeneration += 1
    let generation = loadGeneration
    let projects = session.activeWorkspaceProjects.sorted {
      $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
    }
    self.projects = projects
    hasProjects = !projects.isEmpty
    entries = []
    failures = []
    isLoading = true
    defer {
      if generation == loadGeneration {
        isLoading = false
        didLoad = true
      }
    }

    for project in projects {
      if Task.isCancelled || generation != loadGeneration { return }
      guard let context = context(for: project) else {
        failures.append(
          ProjectFailure(
            projectName: project.name,
            message: GitHubOperationsStrings.failure(.notReady)
          )
        )
        continue
      }
      activeContext = context
      defer { activeContext = nil }
      do {
        let result = try await gateway.call(
          .ghListPullRequests(GitHubLocationRequest(projectLocation: context.lease.location)),
          lease: context.lease
        )
        try Task.checkCancellation()
        guard generation == loadGeneration else { return }
        guard let summaries = GitHubResultProjection.pullRequests(result) else {
          throw GitHubOperationsFailure.invalidResponse
        }
        entries.append(
          contentsOf: summaries.map {
            PullRequestsEntry(
              project: project,
              summary: $0,
              viewerLogin: GitHubResultProjection.viewerLogin(result)
            )
          }
        )
      } catch is CancellationError {
        return
      } catch {
        guard generation == loadGeneration else { return }
        failures.append(
          ProjectFailure(
            projectName: project.name,
            message: GitHubOperationsStrings.failure(GitHubFailureMapper.map(error))
          )
        )
      }
    }
  }

  /// Same exact-host contract as the project workspace's GitHub composition,
  /// parameterized by project. The project generation is local: this page
  /// reloads wholesale when the connection lease changes.
  private func context(for project: RemoteProject) -> GitHubControllerContext? {
    guard let connectionId = session.selectedConnectionId,
      let record = session.state.hosts.first(where: { $0.connectionId == connectionId }),
      let profile = session.state.profile,
      profile.desktopId == record.desktopId,
      profile.httpBaseURL == record.httpBaseURL,
      profile.protocolVersion == record.protocolVersion
    else { return nil }
    let controllerSession = session.currentProjectControllerSession
    return GitHubControllerContext(
      lease: GitHubProjectLease(
        clientConnectionId: connectionId.uuid,
        desktopId: profile.desktopId,
        hostGeneration: controllerSession?.lease.generation
          ?? UInt64(max(0, session.state.workGeneration)),
        project: GitHubProjectIdentity(
          projectId: project.id,
          location: GitHubProjectLocation(project.location)
        ),
        projectGeneration: 1
      ),
      grantedScopes: Set(profile.scopes).intersection(record.scopes),
      isOnline: controllerSession?.isOnline ?? false,
      isReady: controllerSession?.isReady ?? false,
      isForeground: !session.state.liveLifecycle.isInBackground
    )
  }
}
