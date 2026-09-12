import Foundation

/// The three authoritative `git-state-interests` client variants.
///
/// Port of `gitStateInterestSchema` (`src/shared/gitState.ts`) and the generated
/// `websocket.client.git-state-interests` root. Optional fields are omitted from
/// the wire object when absent — never emitted as `null`.
enum GitStateInterest: Sendable, Equatable {
  case target(
    projectId: String,
    worktreePath: String? = nil,
    branch: String? = nil,
    includePrDetails: Bool? = nil
  )
  case pullRequest(
    projectId: String,
    prNumber: Int,
    branch: String? = nil,
    includeReviewBundle: Bool? = nil
  )
  case projectPullRequests(projectId: String)

  var kind: String {
    switch self {
    case .target: return "target"
    case .pullRequest: return "pull-request"
    case .projectPullRequests: return "project-pull-requests"
    }
  }

  var projectId: String {
    switch self {
    case .target(let projectId, _, _, _): return projectId
    case .pullRequest(let projectId, _, _, _): return projectId
    case .projectPullRequests(let projectId): return projectId
    }
  }

  var worktreePath: String? {
    if case .target(_, let worktreePath, _, _) = self { return worktreePath }
    return nil
  }

  /// True for the heavy review bundle (files + diff + review threads). It is only
  /// ever requested by an explicit UI surface, never by a passive target sweep.
  var requestsReviewBundle: Bool {
    if case .pullRequest(_, _, _, let includeReviewBundle) = self {
      return includeReviewBundle == true
    }
    return false
  }

  var wireObject: [String: Any] {
    switch self {
    case .target(let projectId, let worktreePath, let branch, let includePrDetails):
      var object: [String: Any] = ["kind": "target", "projectId": projectId]
      if let worktreePath { object["worktreePath"] = worktreePath }
      if let branch { object["branch"] = branch }
      if let includePrDetails { object["includePrDetails"] = includePrDetails }
      return object
    case .pullRequest(let projectId, let prNumber, let branch, let includeReviewBundle):
      var object: [String: Any] = [
        "kind": "pull-request", "projectId": projectId, "prNumber": prNumber,
      ]
      if let branch { object["branch"] = branch }
      if let includeReviewBundle { object["includeReviewBundle"] = includeReviewBundle }
      return object
    case .projectPullRequests(let projectId):
      return ["kind": "project-pull-requests", "projectId": projectId]
    }
  }

  /// Strict decode used by the fixture-parity tests and by any host echo.
  static func decode(_ value: JSONValue) throws -> GitStateInterest {
    guard let object = value.objectValue,
      let kind = object["kind"]?.stringValue,
      let projectId = object["projectId"]?.stringValue,
      !projectId.isEmpty
    else { throw GitStateDecoding.invalid("GitStateInterest") }
    switch kind {
    case "target":
      return .target(
        projectId: projectId,
        worktreePath: try nonEmpty(object["worktreePath"], field: "target.worktreePath"),
        branch: try nonEmpty(object["branch"], field: "target.branch"),
        includePrDetails: try flag(object["includePrDetails"], field: "target.includePrDetails")
      )
    case "pull-request":
      guard let number = object["prNumber"]?.numberInt, number > 0 else {
        throw GitStateDecoding.invalid("GitStateInterest.prNumber")
      }
      return .pullRequest(
        projectId: projectId,
        prNumber: number,
        branch: try nonEmpty(object["branch"], field: "pull-request.branch"),
        includeReviewBundle: try flag(
          object["includeReviewBundle"], field: "pull-request.includeReviewBundle"
        )
      )
    case "project-pull-requests":
      return .projectPullRequests(projectId: projectId)
    default:
      throw GitStateDecoding.invalid("GitStateInterest.kind")
    }
  }

  private static func nonEmpty(_ value: JSONValue?, field: String) throws -> String? {
    guard let value else { return nil }
    guard let text = value.stringValue, !text.isEmpty else {
      throw GitStateDecoding.invalid("GitStateInterest.\(field)")
    }
    return text
  }

  private static func flag(_ value: JSONValue?, field: String) throws -> Bool? {
    guard let value else { return nil }
    guard let flag = value.boolValue else {
      throw GitStateDecoding.invalid("GitStateInterest.\(field)")
    }
    return flag
  }
}

/// Pure wire helpers for the `git-state-interests` client message.
///
/// An empty interest list is a meaningful message — it clears the host's
/// per-connection interest set — so it is never suppressed.
enum GitStateInterestsWire {
  static func payload(_ interests: [GitStateInterest]) -> [String: Any] {
    [
      "type": "git-state-interests",
      "interests": interests.map(\.wireObject),
    ]
  }

  /// Canonicalized JSON text validated through the generated client union.
  static func jsonText(_ interests: [GitStateInterest]) -> String? {
    guard let raw = try? JSONSerialization.data(withJSONObject: payload(interests)),
      let data = try? GeneratedRemoteV3Contract.clientWebSocketMessage(raw),
      let text = String(data: data, encoding: .utf8)
    else { return nil }
    return text
  }
}
