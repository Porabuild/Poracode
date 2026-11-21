import Foundation
import Observation

struct PullRequestsScope: Equatable {
  let host: ProjectControllerSession?
  let projects: [RemoteProject]
}

/// Loads pull requests for the selected connection's active workspace.
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
  private(set) var scope: PullRequestsScope?
  private(set) var isLoading = false
  private(set) var didLoad = false
  private(set) var isCached = false
  private let cache = ForgeReviewDiskCache()

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

  func load(_ scope: PullRequestsScope) async {
    guard !Task.isCancelled, scope.host == session.currentProjectControllerSession else { return }
    loadGeneration += 1
    let generation = loadGeneration
    self.scope = scope
    entries = []
    isCached = false
    failures = []
    isLoading = true
    defer {
      if generation == loadGeneration {
        isLoading = false
        didLoad = true
      }
    }

    func isCurrentLoad() -> Bool {
      !Task.isCancelled && generation == loadGeneration && scope.host == session.currentProjectControllerSession
    }

    for project in scope.projects {
      guard isCurrentLoad() else { return }
      guard let context = context(for: project, host: scope.host) else {
        failures.append(
          ProjectFailure(
            projectName: project.name,
            message: GitHubOperationsStrings.failure(.notReady)
          )
        )
        continue
      }
      activeContext = context
      defer {
        if generation == loadGeneration { activeContext = nil }
      }
      do {
        let result: GitHubOperationResult
        let fromCache: Bool
        if !context.isUsable {
          guard let cached = await cache.readPullRequests(context) else { throw GitHubOperationsFailure.notReady }
          result = cached
          fromCache = true
        } else {
          do {
            result = try await gateway.call(
              .ghListPullRequests(GitHubLocationRequest(projectLocation: context.lease.location)),
              lease: context.lease
            )
            await cache.writePullRequests(context, result: result)
            fromCache = false
          } catch GitHubOperationsFailure.transport {
            guard let cached = await cache.readPullRequests(context) else { throw GitHubOperationsFailure.transport }
            result = cached
            fromCache = true
          }
        }
        guard isCurrentLoad() else { return }
        guard let summaries = GitHubResultProjection.pullRequests(result) else {
          throw GitHubOperationsFailure.invalidResponse
        }
        isCached = isCached || fromCache
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
        guard isCurrentLoad() else { return }
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
  private func context(for project: RemoteProject, host: ProjectControllerSession?) -> GitHubControllerContext? {
    guard let host,
      let connectionId = session.selectedConnectionId, connectionId == host.lease.connectionId,
      let record = session.state.hosts.first(where: { $0.connectionId == connectionId }),
      let profile = session.state.profile,
      profile.desktopId == record.desktopId,
      profile.httpBaseURL == record.httpBaseURL,
      profile.protocolVersion == record.protocolVersion
    else { return nil }
    return GitHubControllerContext(
      lease: GitHubProjectLease(
        clientConnectionId: connectionId.uuid,
        desktopId: profile.desktopId,
        hostGeneration: host.lease.generation,
        project: GitHubProjectIdentity(
          projectId: project.id,
          location: GitHubProjectLocation(project.location)
        ),
        projectGeneration: 1
      ),
      grantedScopes: Set(profile.scopes).intersection(record.scopes),
      isOnline: host.isOnline,
      isReady: host.isReady,
      isForeground: !session.state.liveLifecycle.isInBackground,
      cacheEndpoint: profile.httpBaseURL
    )
  }
}
