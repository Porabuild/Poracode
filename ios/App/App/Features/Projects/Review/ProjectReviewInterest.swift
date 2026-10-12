import Foundation

/// Exact identity a heavy-review interest owner is bound to.
///
/// Both host identities and both generations are part of the lease, so a host
/// switch, a work-generation bump, or a project relocation invalidates ownership
/// instead of silently re-pointing it.
struct ProjectReviewInterestLease: Sendable, Equatable {
  var connectionId: ClientConnectionID
  var hostGeneration: UInt64
  var projectId: String
  var projectGeneration: UInt64
}

/// Visibility inputs the owner resolves from the live session before claiming.
struct ProjectReviewContext: Sendable, Equatable {
  var lease: ProjectReviewInterestLease
  var isOnline: Bool
  var isReady: Bool
  var canRead: Bool

  var isUsable: Bool { isOnline && isReady && canRead && !lease.projectId.isEmpty }
}

/// Explicit heavy-review interests for one visible review surface.
///
/// The bounded passive sweep never requests a review bundle
/// (`GitStateInterestPolicy.compose` strips one), so the exact `pull-request` +
/// `includeReviewBundle` variant is only ever emitted by a surface that is
/// showing review state. The `project-pull-requests` variant rides along so the
/// surface can resolve the project's open pull requests even before a pull
/// request is bound to a Git target.
enum ProjectReviewInterestPolicy {
  static func interests(projectId: String, prNumber: Int?) -> [GitStateInterest] {
    guard !projectId.isEmpty else { return [] }
    var result: [GitStateInterest] = []
    if let prNumber, prNumber > 0 {
      result.append(
        .pullRequest(projectId: projectId, prNumber: prNumber, includeReviewBundle: true)
      )
    }
    result.append(.projectPullRequests(projectId: projectId))
    return result
  }
}
