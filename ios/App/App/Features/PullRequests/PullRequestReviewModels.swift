import Foundation

struct PullRequestReviewAuthor: Equatable, Sendable {
  let login: String
  let avatarURL: String?
}

struct PullRequestReviewFile: Identifiable, Equatable, Sendable {
  let path: String
  let additions: Int64
  let deletions: Int64
  var id: String { path }
}

struct PullRequestReviewCheck: Identifiable, Equatable, Sendable {
  let name: String
  let state: String
  let conclusion: String
  let url: String?
  let workflowName: String?
  var id: String { "\(workflowName ?? ""):\(name)" }
}

struct PullRequestReviewCommit: Identifiable, Equatable, Sendable {
  let oid: String
  let abbreviatedOID: String
  let headline: String
  let body: String?
  let authoredAt: String
  let author: PullRequestReviewAuthor?
  let url: String?
  var id: String { oid }
}

struct PullRequestReviewComment: Identifiable, Equatable, Sendable {
  let id: String
  let author: PullRequestReviewAuthor
  let body: String
  let createdAt: String
  let url: String?
}

struct PullRequestReviewSummary: Identifiable, Equatable, Sendable {
  let id: String
  let author: PullRequestReviewAuthor
  let state: String
  let body: String
  let submittedAt: String?
  let url: String?
}

struct PullRequestReviewThread: Identifiable, Equatable, Sendable {
  let id: String
  let isResolved: Bool
  let isOutdated: Bool
  let path: String?
  let line: Int64?
  let comments: [PullRequestReviewComment]
}

struct PullRequestReviewDetails: Equatable, Sendable {
  let number: Int64
  let title: String
  let body: String
  let author: PullRequestReviewAuthor?
  let baseBranch: String
  let headBranch: String
  let additions: Int64
  let deletions: Int64
  let changedFiles: Int64
  let createdAt: String?
  let commits: [PullRequestReviewCommit]
  let comments: [PullRequestReviewComment]
  let reviews: [PullRequestReviewSummary]
  let checks: [PullRequestReviewCheck]
}

struct PullRequestReviewConversation: Equatable, Sendable {
  let comments: [PullRequestReviewComment]
  let threads: [PullRequestReviewThread]
}

enum PullRequestReviewProjection {
  static func details(_ document: GitHubDocument?) -> PullRequestReviewDetails? {
    guard let object = document?["details"]?.objectValue,
      let number = object.int("number"),
      let title = object.string("title"),
      let body = object.string("body"),
      let base = object.string("baseBranch"),
      let head = object.string("headBranch"),
      let additions = object.int("additions"),
      let deletions = object.int("deletions"),
      let changedFiles = object.int("changedFiles")
    else { return nil }

    return PullRequestReviewDetails(
      number: number,
      title: title,
      body: body,
      author: author(object["author"]),
      baseBranch: base,
      headBranch: head,
      additions: additions,
      deletions: deletions,
      changedFiles: changedFiles,
      createdAt: object.string("createdAt"),
      commits: object.array("commits").compactMap(commit),
      comments: object.array("comments").compactMap(comment),
      reviews: object.array("reviews").compactMap(review),
      checks: object.array("checks").compactMap(check)
    )
  }

  static func files(_ document: GitHubDocument?) -> [PullRequestReviewFile] {
    document?["files"]?.arrayValue?.compactMap(file) ?? []
  }

  static func diff(_ document: GitHubDocument?) -> String {
    document?["diff"]?.stringValue ?? ""
  }

  static func conversation(_ document: GitHubDocument?) -> PullRequestReviewConversation {
    PullRequestReviewConversation(
      comments: document?["comments"]?.arrayValue?.compactMap(comment) ?? [],
      threads: document?["threads"]?.arrayValue?.compactMap(thread) ?? []
    )
  }

  private static func file(_ value: GitHubJSONValue) -> PullRequestReviewFile? {
    guard let object = value.objectValue,
      let path = object.string("path"),
      let additions = object.int("additions"),
      let deletions = object.int("deletions")
    else { return nil }
    return PullRequestReviewFile(path: path, additions: additions, deletions: deletions)
  }

  private static func check(_ value: GitHubJSONValue) -> PullRequestReviewCheck? {
    guard let object = value.objectValue,
      let name = object.string("name"),
      let state = object.string("state"),
      let conclusion = object.string("conclusion")
    else { return nil }
    return PullRequestReviewCheck(
      name: name,
      state: state,
      conclusion: conclusion,
      url: object.string("url"),
      workflowName: object.string("workflowName")
    )
  }

  private static func commit(_ value: GitHubJSONValue) -> PullRequestReviewCommit? {
    guard let object = value.objectValue,
      let oid = object.string("oid"),
      let abbreviated = object.string("abbreviatedOid"),
      let headline = object.string("messageHeadline"),
      let authoredAt = object.string("authoredDate")
    else { return nil }
    return PullRequestReviewCommit(
      oid: oid,
      abbreviatedOID: abbreviated,
      headline: headline,
      body: object.string("messageBody"),
      authoredAt: authoredAt,
      author: author(object["author"]),
      url: object.string("url")
    )
  }

  private static func comment(_ value: GitHubJSONValue) -> PullRequestReviewComment? {
    guard let object = value.objectValue,
      let id = object.string("id"),
      let author = author(object["author"]),
      let body = object.string("body"),
      let createdAt = object.string("createdAt")
    else { return nil }
    return PullRequestReviewComment(
      id: id,
      author: author,
      body: body,
      createdAt: createdAt,
      url: object.string("url")
    )
  }

  private static func review(_ value: GitHubJSONValue) -> PullRequestReviewSummary? {
    guard let object = value.objectValue,
      let id = object.string("id"),
      let author = author(object["author"]),
      let state = object.string("state"),
      let body = object.string("body")
    else { return nil }
    return PullRequestReviewSummary(
      id: id,
      author: author,
      state: state,
      body: body,
      submittedAt: object.string("submittedAt"),
      url: object.string("url")
    )
  }

  private static func thread(_ value: GitHubJSONValue) -> PullRequestReviewThread? {
    guard let object = value.objectValue,
      let id = object.string("id"),
      let resolved = object.bool("isResolved"),
      let outdated = object.bool("isOutdated")
    else { return nil }
    return PullRequestReviewThread(
      id: id,
      isResolved: resolved,
      isOutdated: outdated,
      path: object.string("path"),
      line: object.int("line"),
      comments: object.array("comments").compactMap(comment)
    )
  }

  private static func author(_ value: GitHubJSONValue?) -> PullRequestReviewAuthor? {
    guard let object = value?.objectValue, let login = object.string("login") else { return nil }
    return PullRequestReviewAuthor(login: login, avatarURL: object.string("avatarUrl"))
  }
}

extension Dictionary where Key == String, Value == GitHubJSONValue {
  fileprivate func string(_ key: String) -> String? { self[key]?.stringValue }
  fileprivate func int(_ key: String) -> Int64? { self[key]?.integerValue }
  fileprivate func bool(_ key: String) -> Bool? { self[key]?.boolValue }
  fileprivate func array(_ key: String) -> [GitHubJSONValue] { self[key]?.arrayValue ?? [] }
}

enum PullRequestUnifiedDiff {
  static func chunk(for path: String, in diff: String) -> String {
    var chunks: [(path: String?, lines: [Substring])] = []
    var currentPath: String?
    var currentLines: [Substring] = []

    for line in diff.split(separator: "\n", omittingEmptySubsequences: false) {
      if line.hasPrefix("diff --git ") {
        if !currentLines.isEmpty { chunks.append((currentPath, currentLines)) }
        currentPath = pathFromHeader(line)
        currentLines = [line]
      } else {
        currentLines.append(line)
      }
    }
    if !currentLines.isEmpty { chunks.append((currentPath, currentLines)) }

    guard let match = chunks.first(where: { $0.path == path }) else { return diff }
    return match.lines.joined(separator: "\n")
  }

  private static func pathFromHeader(_ line: Substring) -> String? {
    guard let marker = line.range(of: " b/") else { return nil }
    return String(line[marker.upperBound...])
      .trimmingCharacters(in: CharacterSet(charactersIn: "\""))
  }
}
