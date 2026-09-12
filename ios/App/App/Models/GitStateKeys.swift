import Foundation

/// Host-owned Git/PR state references.
///
/// Key encoding is a byte-for-byte port of `src/shared/gitState.ts`:
/// `kind` followed by NUL-separated `<utf16Length>:<value>` parts. Lengths are
/// UTF-16 code-unit counts because the TypeScript authority uses
/// `String.prototype.length`.
struct GitProjectRef: Sendable, Equatable, Hashable {
  var hostId: String
  var projectId: String
}

struct GitTargetRef: Sendable, Equatable, Hashable {
  var hostId: String
  var projectId: String
  /// Absent (not empty) when the target is the project's primary worktree.
  var worktreePath: String?
}

struct PullRequestRef: Sendable, Equatable, Hashable {
  var hostId: String
  var projectId: String
  var prNumber: Int
}

enum GitStateKeys {
  static let separator = "\u{0000}"

  static func project(_ ref: GitProjectRef) -> String {
    join("project", [ref.hostId, ref.projectId])
  }

  static func target(_ ref: GitTargetRef) -> String {
    join("target", [ref.hostId, ref.projectId, ref.worktreePath ?? ""])
  }

  static func pullRequest(_ ref: PullRequestRef) -> String {
    join("pr", [ref.hostId, ref.projectId, String(ref.prNumber)])
  }

  static func pullRequestBranch(_ ref: GitProjectRef, branch: String) -> String {
    join("pr-branch", [ref.hostId, ref.projectId, branch])
  }

  /// Deduplication key for passive target interests. Mirrors the
  /// `${projectId}\0${worktreePath ?? ""}` tuple used by the interest policy.
  static func interestTarget(projectId: String, worktreePath: String?) -> String {
    "\(projectId)\(separator)\(worktreePath ?? "")"
  }

  private static func join(_ kind: String, _ parts: [String]) -> String {
    ([kind] + parts.map(encodePart)).joined(separator: separator)
  }

  private static func encodePart(_ value: String) -> String {
    "\(value.utf16.count):\(value)"
  }
}
