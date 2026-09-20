import Foundation

extension JSONValue {
  var boolValue: Bool? {
    if case .bool(let value) = self { return value }
    return nil
  }

  var arrayValue: [JSONValue]? {
    if case .array(let value) = self { return value }
    return nil
  }

  var isNull: Bool {
    if case .null = self { return true }
    return false
  }
}

/// Strictly validated entry of a Git-state map.
///
/// The identifying fields the app reasons about are decoded and typed; the
/// remainder of the host-authored payload is retained verbatim in `raw` so a
/// snapshot survives a round trip without lossy re-modelling of `GitStatusResult`,
/// `PrDetails`, review threads, or diffs. Equality is raw-exact.
protocol GitStateEntry: Sendable, Equatable {
  var raw: [String: JSONValue] { get }
  init(raw: [String: JSONValue]) throws
}

struct GitProjectState: GitStateEntry {
  let raw: [String: JSONValue]
  let ref: GitProjectRef
  let refreshedAt: String

  init(raw: [String: JSONValue]) throws {
    self.ref = try GitStateDecoding.projectRef(raw["ref"], field: "GitProjectState.ref")
    self.refreshedAt = try GitStateDecoding.nonEmptyString(
      raw["refreshedAt"], field: "GitProjectState.refreshedAt"
    )
    self.raw = raw
  }

  var ghAvailable: Bool? { raw["ghAvailable"]?.boolValue }
  var status: JSONValue? { raw["status"] }
  var branches: JSONValue? { raw["branches"] }
  var worktrees: [JSONValue]? { raw["worktrees"]?.arrayValue }
}

struct GitTargetState: GitStateEntry {
  let raw: [String: JSONValue]
  let ref: GitTargetRef
  let refreshedAt: String

  init(raw: [String: JSONValue]) throws {
    self.ref = try GitStateDecoding.targetRef(raw["ref"], field: "GitTargetState.ref")
    self.refreshedAt = try GitStateDecoding.nonEmptyString(
      raw["refreshedAt"], field: "GitTargetState.refreshedAt"
    )
    self.raw = raw
  }

  /// Missing, explicit `null`, and a value are three distinct states on the wire.
  var pullRequestKeyField: JSONValue? { raw["pullRequestKey"] }
  var pullRequestKey: String? { raw["pullRequestKey"]?.stringValue }
  var status: JSONValue? { raw["status"] }
  var sourceBranch: String? { raw["sourceInfo"]?["sourceBranch"]?.stringValue }
  var commitsAhead: Int? { raw["sourceInfo"]?["commitsAhead"]?.numberInt }
  var sourceAhead: Int? { raw["sourceInfo"]?["sourceAhead"]?.numberInt }
}

struct PullRequestState: GitStateEntry {
  let raw: [String: JSONValue]
  let ref: PullRequestRef

  init(raw: [String: JSONValue]) throws {
    self.ref = try GitStateDecoding.pullRequestRef(raw["ref"], field: "PullRequestState.ref")
    guard raw["data"]?.objectValue != nil else {
      throw GitStateDecoding.invalid("PullRequestState.data")
    }
    guard raw["freshness"]?.objectValue != nil else {
      throw GitStateDecoding.invalid("PullRequestState.freshness")
    }
    self.raw = raw
  }

  var number: Int? { raw["data"]?["number"]?.numberInt }
  var state: String? { raw["data"]?["state"]?.stringValue }
  var title: String? { raw["data"]?["title"]?.stringValue }
  var url: String? { raw["data"]?["url"]?.stringValue }
  var isDraft: Bool? { raw["data"]?["isDraft"]?.boolValue }
  var baseBranch: String? { raw["data"]?["baseBranch"]?.stringValue }
  var hasReviewBundle: Bool { raw["reviewThreads"] != nil || raw["files"] != nil }
}

struct ProjectPullRequestListState: GitStateEntry {
  let raw: [String: JSONValue]
  let project: GitProjectRef
  let pullRequestKeys: [String]
  let refreshedAt: String

  init(raw: [String: JSONValue]) throws {
    self.project = try GitStateDecoding.projectRef(
      raw["project"], field: "ProjectPullRequestListState.project"
    )
    guard let keys = raw["pullRequestKeys"]?.arrayValue else {
      throw GitStateDecoding.invalid("ProjectPullRequestListState.pullRequestKeys")
    }
    self.pullRequestKeys = try keys.map {
      guard let text = $0.stringValue else {
        throw GitStateDecoding.invalid("ProjectPullRequestListState.pullRequestKeys")
      }
      return text
    }
    self.refreshedAt = try GitStateDecoding.nonEmptyString(
      raw["refreshedAt"], field: "ProjectPullRequestListState.refreshedAt"
    )
    self.raw = raw
  }

  var viewerLogin: String? { raw["viewerLogin"]?.stringValue }
}

/// Normalized host-owned Git/PR state. Mirrors `GitStateSnapshot` in
/// `src/shared/gitState.ts`; all five maps are required on the wire.
struct GitStateSnapshot: Sendable, Equatable {
  var revision: Int
  var projects: [String: GitProjectState]
  var targets: [String: GitTargetState]
  var pullRequests: [String: PullRequestState]
  var pullRequestKeyByBranch: [String: String]
  var projectPullRequestLists: [String: ProjectPullRequestListState]

  static let empty = GitStateSnapshot(
    revision: 0,
    projects: [:],
    targets: [:],
    pullRequests: [:],
    pullRequestKeyByBranch: [:],
    projectPullRequestLists: [:]
  )

  var isEmpty: Bool { self == .empty }

  /// Strict decode of the wire snapshot. Every map is required; a malformed
  /// entry rejects the whole snapshot rather than silently dropping state.
  init(wire value: JSONValue) throws {
    guard let object = value.objectValue else {
      throw GitStateDecoding.invalid("GitStateSnapshot")
    }
    guard let revision = object["revision"]?.numberInt, revision >= 0 else {
      throw GitStateDecoding.invalid("GitStateSnapshot.revision")
    }
    self.revision = revision
    self.projects = try GitStateDecoding.entries(
      object["projects"], required: true, field: "GitStateSnapshot.projects"
    )
    self.targets = try GitStateDecoding.entries(
      object["targets"], required: true, field: "GitStateSnapshot.targets"
    )
    self.pullRequests = try GitStateDecoding.entries(
      object["pullRequests"], required: true, field: "GitStateSnapshot.pullRequests"
    )
    self.projectPullRequestLists = try GitStateDecoding.entries(
      object["projectPullRequestLists"],
      required: true,
      field: "GitStateSnapshot.projectPullRequestLists"
    )
    guard let branchMap = object["pullRequestKeyByBranch"]?.objectValue else {
      throw GitStateDecoding.invalid("GitStateSnapshot.pullRequestKeyByBranch")
    }
    var branches: [String: String] = [:]
    for (key, entry) in branchMap {
      guard let text = entry.stringValue else {
        throw GitStateDecoding.invalid("GitStateSnapshot.pullRequestKeyByBranch")
      }
      branches[key] = text
    }
    self.pullRequestKeyByBranch = branches
  }

  init(
    revision: Int,
    projects: [String: GitProjectState],
    targets: [String: GitTargetState],
    pullRequests: [String: PullRequestState],
    pullRequestKeyByBranch: [String: String],
    projectPullRequestLists: [String: ProjectPullRequestListState]
  ) {
    self.revision = revision
    self.projects = projects
    self.targets = targets
    self.pullRequests = pullRequests
    self.pullRequestKeyByBranch = pullRequestKeyByBranch
    self.projectPullRequestLists = projectPullRequestLists
  }
}

enum GitStateDecoding {
  static func invalid(_ field: String) -> RemoteClientError {
    RemoteClientError.invalidResponse("Invalid \(field).")
  }

  static func nonEmptyString(_ value: JSONValue?, field: String) throws -> String {
    guard let text = value?.stringValue, !text.isEmpty else { throw invalid(field) }
    return text
  }

  static func projectRef(_ value: JSONValue?, field: String) throws -> GitProjectRef {
    guard let object = value?.objectValue,
      let hostId = object["hostId"]?.stringValue,
      let projectId = object["projectId"]?.stringValue
    else { throw invalid(field) }
    return GitProjectRef(hostId: hostId, projectId: projectId)
  }

  static func targetRef(_ value: JSONValue?, field: String) throws -> GitTargetRef {
    guard let object = value?.objectValue,
      let hostId = object["hostId"]?.stringValue,
      let projectId = object["projectId"]?.stringValue
    else { throw invalid(field) }
    if let worktree = object["worktreePath"] {
      guard let path = worktree.stringValue else { throw invalid(field) }
      return GitTargetRef(hostId: hostId, projectId: projectId, worktreePath: path)
    }
    return GitTargetRef(hostId: hostId, projectId: projectId, worktreePath: nil)
  }

  static func pullRequestRef(_ value: JSONValue?, field: String) throws -> PullRequestRef {
    guard let object = value?.objectValue,
      let hostId = object["hostId"]?.stringValue,
      let projectId = object["projectId"]?.stringValue,
      let number = object["prNumber"]?.numberInt,
      number > 0
    else { throw invalid(field) }
    return PullRequestRef(hostId: hostId, projectId: projectId, prNumber: number)
  }

  /// Decodes a `Record<string, Entry>` map. `required: false` distinguishes an
  /// omitted patch map (`nil`) from an explicit empty object.
  static func entries<Entry: GitStateEntry>(
    _ value: JSONValue?,
    required: Bool,
    field: String
  ) throws -> [String: Entry] {
    guard let value else {
      if required { throw invalid(field) }
      return [:]
    }
    guard let object = value.objectValue else { throw invalid(field) }
    var result: [String: Entry] = [:]
    for (key, entry) in object {
      guard let payload = entry.objectValue else { throw invalid(field) }
      result[key] = try Entry(raw: payload)
    }
    return result
  }

  static func optionalEntries<Entry: GitStateEntry>(
    _ value: JSONValue?,
    field: String
  ) throws -> [String: Entry]? {
    guard let value else { return nil }
    return try entries(value, required: true, field: field) as [String: Entry]
  }
}
