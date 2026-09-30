import Foundation
import Observation

/// Sole production owner of the explicit heavy-review Git-state interest.
///
/// It holds no socket, no timer, and no retry loop: it writes
/// `state.explicitGitInterests` and asks the session to flush once through the
/// landed policy → coordinator → socket path. A lease plus a monotonic generation
/// makes every write and every release identity-safe, so a dismissed surface can
/// never clear a replacement host's interests.
@MainActor
@Observable
final class ProjectReviewInterestController {
  typealias ContextProvider = @MainActor @Sendable () -> ProjectReviewContext?

  private(set) var lease: ProjectReviewInterestLease?
  private(set) var interests: [GitStateInterest] = []
  private(set) var projection = ProjectReviewProjection()
  /// Bumps on every ownership change (claim, refresh, release).
  private(set) var generation: UInt64 = 0

  @ObservationIgnored private weak var session: AppSession?
  @ObservationIgnored private let contextProvider: ContextProvider

  init(session: AppSession, contextProvider: @escaping ContextProvider) {
    self.session = session
    self.contextProvider = contextProvider
  }

  var isOwning: Bool { lease != nil }

  var context: ProjectReviewContext? { contextProvider() }

  /// Claims — or refreshes — ownership for the currently visible review surface.
  ///
  /// Called from the visible surface's own lifecycle only. An unusable context
  /// (offline, not ready, missing read scope, no host, no project) releases
  /// instead of claiming, which emits the passive fallback or an empty clear.
  func synchronize() {
    guard let session, let context = contextProvider(), context.isUsable else {
      release()
      return
    }
    if let owned = lease, owned != context.lease {
      // Host switch or project switch: hand the previous lease's interest back
      // before claiming the new one.
      release()
    }
    let resolved = ProjectReviewProjector.project(
      gitState: session.state.replay.gitState,
      projectId: context.lease.projectId
    )
    let desired = ProjectReviewInterestPolicy.interests(
      projectId: context.lease.projectId,
      prNumber: resolved.summary?.prNumber
    )
    let unchanged =
      lease == context.lease && interests == desired
      && session.state.explicitGitInterests == desired
    lease = context.lease
    projection = resolved
    interests = desired
    // A no-op refresh must not enqueue a redundant interest update; `ready`,
    // reconnect, resync, and socket replacement re-flush on their own.
    guard !unchanged else { return }
    generation &+= 1
    session.state.explicitGitInterests = desired
    session.scheduleGitStateInterestFlush()
  }

  /// Releases ownership on dismissal, background, offline, host switch, project
  /// switch, or unpair, and flushes the correct passive fallback / empty clear.
  func release() {
    guard let owned = lease else { return }
    lease = nil
    interests = []
    projection = ProjectReviewProjection()
    generation &+= 1
    guard let session else { return }
    // The replacement host owns its own interest set; a stale surface must not
    // clear it, and unpair has already cleared this one.
    guard let current = session.currentProjectControllerLease,
      current.connectionId == owned.connectionId,
      current.generation == owned.hostGeneration,
      !session.state.explicitGitInterests.isEmpty
    else { return }
    session.state.explicitGitInterests = []
    session.scheduleGitStateInterestFlush()
  }
}
