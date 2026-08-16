import Foundation

/// Read-only per-thread Git/PR summary published by the host.
///
/// Port of `remoteThreadGitSummarySchema` (`src/shared/remote/protocol.ts`).
/// Every field is required on the wire; `pr` is nullable but never omitted.
struct GitThreadSummary: Sendable, Equatable {
  struct PullRequest: Sendable, Equatable {
    enum State: String, Sendable, Equatable, CaseIterable {
      case open
      case draft
      case merged
      case closed
    }

    var number: Int
    var state: State
    var title: String
    var url: String
    var isDraft: Bool
    var checksStatus: String?
  }

  var isRepo: Bool
  var branch: String
  var totalInsertions: Int
  var totalDeletions: Int
  var ahead: Int
  var behind: Int
  var pullRequest: PullRequest?

  var hasLocalChanges: Bool { totalInsertions > 0 || totalDeletions > 0 }
  var isDiverged: Bool { ahead > 0 || behind > 0 }

  init(wire value: JSONValue) throws {
    guard let object = value.objectValue else {
      throw GitStateDecoding.invalid("RemoteThreadGitSummary")
    }
    guard let isRepo = object["isRepo"]?.boolValue,
      let branch = object["branch"]?.stringValue
    else { throw GitStateDecoding.invalid("RemoteThreadGitSummary") }
    self.isRepo = isRepo
    self.branch = branch
    self.totalInsertions = try Self.count(object["totalInsertions"], field: "totalInsertions")
    self.totalDeletions = try Self.count(object["totalDeletions"], field: "totalDeletions")
    self.ahead = try Self.count(object["ahead"], field: "ahead")
    self.behind = try Self.count(object["behind"], field: "behind")
    guard let pr = object["pr"] else {
      throw GitStateDecoding.invalid("RemoteThreadGitSummary.pr")
    }
    self.pullRequest = pr.isNull ? nil : try Self.pullRequest(pr)
  }

  /// Decodes a full `Record<threadId, summary>` replacement.
  static func map(wire value: JSONValue) throws -> [String: GitThreadSummary] {
    guard let object = value.objectValue else {
      throw GitStateDecoding.invalid("RemoteGitSummaries")
    }
    var result: [String: GitThreadSummary] = [:]
    for (threadId, entry) in object {
      guard !threadId.isEmpty else {
        throw GitStateDecoding.invalid("RemoteGitSummaries")
      }
      result[threadId] = try GitThreadSummary(wire: entry)
    }
    return result
  }

  private static func count(_ value: JSONValue?, field: String) throws -> Int {
    guard let number = value?.numberInt, number >= 0 else {
      throw GitStateDecoding.invalid("RemoteThreadGitSummary.\(field)")
    }
    return number
  }

  private static func pullRequest(_ value: JSONValue) throws -> PullRequest {
    guard let object = value.objectValue,
      let number = object["number"]?.numberInt,
      let rawState = object["state"]?.stringValue,
      let state = PullRequest.State(rawValue: rawState),
      let title = object["title"]?.stringValue,
      let url = object["url"]?.stringValue,
      let isDraft = object["isDraft"]?.boolValue
    else { throw GitStateDecoding.invalid("RemoteThreadGitSummary.pr") }
    var checksStatus: String?
    if let checks = object["checksStatus"] {
      guard let text = checks.stringValue else {
        throw GitStateDecoding.invalid("RemoteThreadGitSummary.pr.checksStatus")
      }
      checksStatus = text
    }
    return PullRequest(
      number: number,
      state: state,
      title: title,
      url: url,
      isDraft: isDraft,
      checksStatus: checksStatus
    )
  }
}
