import Foundation

/// Authoritative review state for one pull request, projected out of the
/// host-owned Git/PR read model. Nothing is derived locally: every value is a
/// field the desktop published.
struct ProjectReviewSummary: Sendable, Equatable {
  var prNumber: Int
  var title: String?
  var state: String?
  var url: String?
  var baseBranch: String?
  var isDraft: Bool = false
  var changedFileCount: Int?
  var reviewThreadCount: Int?
  var unresolvedReviewThreadCount: Int?
  /// True once the heavy bundle (files / review threads) has landed for this PR.
  var hasReviewBundle: Bool = false
}

struct ProjectReviewProjection: Sendable, Equatable {
  var summary: ProjectReviewSummary?
  var sourceBranch: String?
  var openPullRequestCount: Int?
}

/// Resolves a project's review target from a replayed `GitStateSnapshot`.
///
/// The snapshot is already scoped to one exact host cache, so entries are matched
/// on their decoded `ref.projectId` — the opaque host id never has to be guessed.
enum ProjectReviewProjector {
  static func project(
    gitState: GitStateSnapshot,
    projectId: String
  ) -> ProjectReviewProjection {
    guard !projectId.isEmpty else { return ProjectReviewProjection() }
    var projection = ProjectReviewProjection()
    let target = self.target(in: gitState, projectId: projectId)
    projection.sourceBranch = target?.sourceBranch
    projection.openPullRequestCount = openPullRequestCount(in: gitState, projectId: projectId)
    if let state = pullRequest(in: gitState, projectId: projectId, target: target) {
      projection.summary = summary(state)
    }
    return projection
  }

  /// Deterministic pick: the project's targets sorted by worktree path, primary
  /// worktree (absent path) first, and the first one bound to a pull request wins.
  private static func target(
    in gitState: GitStateSnapshot,
    projectId: String
  ) -> GitTargetState? {
    let candidates = gitState.targets.values
      .filter { $0.ref.projectId == projectId }
      .sorted { ($0.ref.worktreePath ?? "") < ($1.ref.worktreePath ?? "") }
    return candidates.first { !($0.pullRequestKey ?? "").isEmpty } ?? candidates.first
  }

  private static func pullRequest(
    in gitState: GitStateSnapshot,
    projectId: String,
    target: GitTargetState?
  ) -> PullRequestState? {
    if let key = target?.pullRequestKey, let state = gitState.pullRequests[key] {
      return state
    }
    // No target binding yet: fall back to the project's published list order.
    let listed = gitState.projectPullRequestLists.values
      .first { $0.project.projectId == projectId }?
      .pullRequestKeys ?? []
    for key in listed {
      if let state = gitState.pullRequests[key], state.ref.projectId == projectId {
        return state
      }
    }
    return nil
  }

  private static func openPullRequestCount(
    in gitState: GitStateSnapshot,
    projectId: String
  ) -> Int? {
    gitState.projectPullRequestLists.values
      .first { $0.project.projectId == projectId }?
      .pullRequestKeys.count
  }

  private static func summary(_ state: PullRequestState) -> ProjectReviewSummary {
    var summary = ProjectReviewSummary(prNumber: state.ref.prNumber)
    summary.title = state.title
    summary.state = state.state
    summary.url = state.url
    summary.baseBranch = state.baseBranch
    summary.isDraft = state.isDraft == true
    summary.hasReviewBundle = state.hasReviewBundle
    if let files = state.raw["files"]?.arrayValue {
      summary.changedFileCount = files.count
    }
    if let threads = state.raw["reviewThreads"]?.arrayValue {
      summary.reviewThreadCount = threads.count
      summary.unresolvedReviewThreadCount = threads.filter {
        $0["isResolved"]?.boolValue == false
      }.count
    }
    return summary
  }
}
