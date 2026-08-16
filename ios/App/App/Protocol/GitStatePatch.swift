import Foundation

/// Incremental Git-state patch (`remote-git-state` event payload).
///
/// Faithful port of `GitStatePatch` / `applyGitStatePatch` in
/// `src/shared/gitState.ts`. Three wire states are distinguished per map:
/// - omitted (`nil`) — preserve the current map untouched,
/// - present — upsert every entry over the current map,
/// - `remove*` — delete listed keys *before* the upserts are merged in.
///
/// `pullRequestKeyByBranch` has no remove list: an explicit `null` value deletes
/// the branch binding, any other value replaces it.
struct GitStatePatch: Sendable, Equatable {
  var revision: Int
  var projects: [String: GitProjectState]?
  var targets: [String: GitTargetState]?
  var pullRequests: [String: PullRequestState]?
  /// `nil` value means the wire carried an explicit `null` (delete the branch key).
  var pullRequestKeyByBranch: [String: String?]?
  var projectPullRequestLists: [String: ProjectPullRequestListState]?
  var removeProjects: [String]?
  var removeTargets: [String]?
  var removePullRequests: [String]?
  var removeProjectPullRequestLists: [String]?

  /// Strict decode. `revision` must be a positive safe integer (the authority
  /// uses `> 0`); a malformed map or remove list rejects the whole patch so a
  /// known-but-corrupt event never advances the replay cursor.
  init(wire value: JSONValue) throws {
    guard let object = value.objectValue else {
      throw GitStateDecoding.invalid("GitStatePatch")
    }
    guard let revision = object["revision"]?.numberInt, revision > 0 else {
      throw GitStateDecoding.invalid("GitStatePatch.revision")
    }
    self.revision = revision
    self.projects = try GitStateDecoding.optionalEntries(
      object["projects"], field: "GitStatePatch.projects"
    )
    self.targets = try GitStateDecoding.optionalEntries(
      object["targets"], field: "GitStatePatch.targets"
    )
    self.pullRequests = try GitStateDecoding.optionalEntries(
      object["pullRequests"], field: "GitStatePatch.pullRequests"
    )
    self.projectPullRequestLists = try GitStateDecoding.optionalEntries(
      object["projectPullRequestLists"], field: "GitStatePatch.projectPullRequestLists"
    )
    self.pullRequestKeyByBranch = try Self.branchPatch(object["pullRequestKeyByBranch"])
    self.removeProjects = try Self.keyList(
      object["removeProjects"], field: "GitStatePatch.removeProjects"
    )
    self.removeTargets = try Self.keyList(
      object["removeTargets"], field: "GitStatePatch.removeTargets"
    )
    self.removePullRequests = try Self.keyList(
      object["removePullRequests"], field: "GitStatePatch.removePullRequests"
    )
    self.removeProjectPullRequestLists = try Self.keyList(
      object["removeProjectPullRequestLists"],
      field: "GitStatePatch.removeProjectPullRequestLists"
    )
  }

  private static func branchPatch(_ value: JSONValue?) throws -> [String: String?]? {
    guard let value else { return nil }
    guard let object = value.objectValue else {
      throw GitStateDecoding.invalid("GitStatePatch.pullRequestKeyByBranch")
    }
    var result: [String: String?] = [:]
    for (key, entry) in object {
      if entry.isNull {
        result[key] = String?.none
        continue
      }
      guard let text = entry.stringValue else {
        throw GitStateDecoding.invalid("GitStatePatch.pullRequestKeyByBranch")
      }
      result[key] = text
    }
    return result
  }

  private static func keyList(_ value: JSONValue?, field: String) throws -> [String]? {
    guard let value else { return nil }
    guard let items = value.arrayValue else { throw GitStateDecoding.invalid(field) }
    return try items.map {
      guard let text = $0.stringValue else { throw GitStateDecoding.invalid(field) }
      return text
    }
  }
}

extension GitStateSnapshot {
  /// Applies one patch. A revision at or below the current one is ignored
  /// entirely — including its remove lists — and the receiver is returned
  /// unchanged (`applyGitStatePatch` reference-identity semantics).
  func applying(_ patch: GitStatePatch) -> GitStateSnapshot {
    guard patch.revision > revision else { return self }
    return GitStateSnapshot(
      revision: patch.revision,
      projects: Self.merge(Self.omitting(projects, patch.removeProjects), patch.projects),
      targets: Self.merge(Self.omitting(targets, patch.removeTargets), patch.targets),
      pullRequests: Self.merge(
        Self.omitting(pullRequests, patch.removePullRequests), patch.pullRequests
      ),
      pullRequestKeyByBranch: Self.mergeBranches(
        pullRequestKeyByBranch, patch.pullRequestKeyByBranch
      ),
      projectPullRequestLists: Self.merge(
        Self.omitting(projectPullRequestLists, patch.removeProjectPullRequestLists),
        patch.projectPullRequestLists
      )
    )
  }

  private static func omitting<Entry>(
    _ current: [String: Entry],
    _ removed: [String]?
  ) -> [String: Entry] {
    guard let removed, !removed.isEmpty else { return current }
    var next = current
    for key in removed { next.removeValue(forKey: key) }
    return next
  }

  private static func merge<Entry>(
    _ current: [String: Entry],
    _ patch: [String: Entry]?
  ) -> [String: Entry] {
    guard let patch, !patch.isEmpty else { return current }
    var next = current
    for (key, value) in patch { next[key] = value }
    return next
  }

  private static func mergeBranches(
    _ current: [String: String],
    _ patch: [String: String?]?
  ) -> [String: String] {
    guard let patch, !patch.isEmpty else { return current }
    var next = current
    for (key, value) in patch {
      if let value {
        next[key] = value
      } else {
        next.removeValue(forKey: key)
      }
    }
    return next
  }
}
