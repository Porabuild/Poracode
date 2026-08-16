import Foundation

enum GitHubJSONValue: Codable, Equatable, Sendable {
  case null
  case bool(Bool)
  case integer(Int64)
  case number(Double)
  case string(String)
  case array([GitHubJSONValue])
  case object([String: GitHubJSONValue])

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() {
      self = .null
    } else if let value = try? container.decode(Bool.self) {
      self = .bool(value)
    } else if let value = try? container.decode(Int64.self) {
      self = .integer(value)
    } else if let value = try? container.decode(Double.self) {
      self = .number(value)
    } else if let value = try? container.decode(String.self) {
      self = .string(value)
    } else if let value = try? container.decode([GitHubJSONValue].self) {
      self = .array(value)
    } else {
      self = .object(try container.decode([String: GitHubJSONValue].self))
    }
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .null: try container.encodeNil()
    case .bool(let value): try container.encode(value)
    case .integer(let value): try container.encode(value)
    case .number(let value): try container.encode(value)
    case .string(let value): try container.encode(value)
    case .array(let value): try container.encode(value)
    case .object(let value): try container.encode(value)
    }
  }

  var objectValue: [String: GitHubJSONValue]? {
    guard case .object(let value) = self else { return nil }
    return value
  }

  var arrayValue: [GitHubJSONValue]? {
    guard case .array(let value) = self else { return nil }
    return value
  }

  var stringValue: String? {
    guard case .string(let value) = self else { return nil }
    return value
  }

  var integerValue: Int64? {
    guard case .integer(let value) = self else { return nil }
    return value
  }

  var boolValue: Bool? {
    guard case .bool(let value) = self else { return nil }
    return value
  }
}

struct GitHubDocument: Codable, Equatable, Sendable {
  let value: GitHubJSONValue

  var object: [String: GitHubJSONValue]? { value.objectValue }

  subscript(key: String) -> GitHubJSONValue? { object?[key] }
}

enum GitHubOperationResult: Equatable, Sendable {
  case json(procedure: GitHubProcedure, document: GitHubDocument)
  case omitted(procedure: GitHubProcedure)

  var procedure: GitHubProcedure {
    switch self {
    case .json(let procedure, _), .omitted(let procedure): procedure
    }
  }

  var document: GitHubDocument? {
    guard case .json(_, let document) = self else { return nil }
    return document
  }
}

struct GitHubAccountSummary: Identifiable, Equatable, Sendable {
  let host: String
  let login: String
  var id: String { "\(host)/\(login)" }
}

struct GitHubRepositorySummary: Identifiable, Equatable, Sendable {
  let nameWithOwner: String
  let isPrivate: Bool
  let pushedAt: String
  var id: String { nameWithOwner }
}

struct GitHubPullRequestSummary: Identifiable, Equatable, Sendable {
  let number: Int64
  let title: String
  let state: String
  let isDraft: Bool
  var url: String?
  var baseBranch: String?
  var updatedAt: String?
  var viewerDidAuthor: Bool?
  var headBranch: String?
  var authorLogin: String?
  var repository: String?
  var additions: Int64?
  var deletions: Int64?
  var reviewRequested: Bool?

  var id: Int64 { number }
}

struct GitHubWorkflowSummary: Identifiable, Equatable, Sendable {
  let id: Int64
  let name: String
  let state: String
}

enum GitHubResultProjection {
  static func availability(_ result: GitHubOperationResult) -> Bool? {
    result.document?["available"]?.boolValue
  }

  static func accounts(_ result: GitHubOperationResult) -> [GitHubAccountSummary]? {
    guard let values = result.document?["accounts"]?.arrayValue else { return nil }
    return values.compactMap { value in
      guard let object = value.objectValue,
        let host = object["host"]?.stringValue,
        let login = object["login"]?.stringValue
      else { return nil }
      return GitHubAccountSummary(host: host, login: login)
    }
  }

  static func repositories(_ result: GitHubOperationResult) -> [GitHubRepositorySummary]? {
    guard let values = result.document?["repos"]?.arrayValue else { return nil }
    return values.compactMap { value in
      guard let object = value.objectValue,
        let name = object["nameWithOwner"]?.stringValue,
        let isPrivate = object["isPrivate"]?.boolValue,
        let pushedAt = object["pushedAt"]?.stringValue
      else { return nil }
      return GitHubRepositorySummary(
        nameWithOwner: name,
        isPrivate: isPrivate,
        pushedAt: pushedAt
      )
    }
  }

  static func pullRequests(_ result: GitHubOperationResult) -> [GitHubPullRequestSummary]? {
    let value = result.document?["pullRequests"] ?? result.document?["prs"]
    let values: [GitHubJSONValue]
    if let array = value?.arrayValue {
      values = array
    } else if let object = value?.objectValue {
      values = Array(object.values)
    } else {
      return nil
    }
    return values.compactMap(pullRequest)
  }

  static func workflows(_ result: GitHubOperationResult) -> [GitHubWorkflowSummary]? {
    guard let values = result.document?["workflows"]?.arrayValue else { return nil }
    return values.compactMap { value in
      guard let object = value.objectValue,
        let id = object["id"]?.integerValue,
        let name = object["name"]?.stringValue,
        let state = object["state"]?.stringValue
      else { return nil }
      return GitHubWorkflowSummary(id: id, name: name, state: state)
    }
  }

  private static func pullRequest(_ value: GitHubJSONValue) -> GitHubPullRequestSummary? {
    guard let object = value.objectValue else { return nil }
    // ghListPullRequests rows nest the PR data under "pr"; ghListPrs rows are
    // the PR data itself.
    let source = object["pr"]?.objectValue ?? object
    guard let number = source["number"]?.integerValue,
      let title = source["title"]?.stringValue,
      let state = source["state"]?.stringValue,
      let isDraft = source["isDraft"]?.boolValue
    else { return nil }
    return GitHubPullRequestSummary(
      number: number,
      title: title,
      state: state,
      isDraft: isDraft,
      url: source["url"]?.stringValue,
      baseBranch: source["baseBranch"]?.stringValue,
      updatedAt: source["updatedAt"]?.stringValue,
      viewerDidAuthor: source["viewerDidAuthor"]?.boolValue,
      headBranch: object["headBranch"]?.stringValue,
      authorLogin: object["author"]?.objectValue?["login"]?.stringValue,
      repository: object["repository"]?.stringValue,
      additions: object["additions"]?.integerValue,
      deletions: object["deletions"]?.integerValue,
      reviewRequested: object["reviewRequested"]?.boolValue
    )
  }

  static func viewerLogin(_ result: GitHubOperationResult) -> String? {
    result.document?["viewerLogin"]?.stringValue
  }
}
