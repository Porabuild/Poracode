import Foundation

struct AdvancedCreateFileCheckpointRequest: Codable, Equatable, Sendable {
  let threadId: String
  let checkpointItemId: String
  let projectLocation: ProjectLocation
}

struct AdvancedFinalizeFileCheckpointRequest: Codable, Equatable, Sendable {
  let threadId: String
  let checkpointItemId: String
  let baseCheckpointItemId: String
  let projectLocation: ProjectLocation
}

struct AdvancedSubagentSubscriptionRequest: Codable, Equatable, Sendable {
  let threadId: String
  let parentItemId: String
}

enum AdvancedDiffSide: String, Codable, Sendable {
  case old
  case new
}

enum AdvancedSkillScope: String, Codable, Sendable {
  case global
  case project
}

enum AdvancedThreadInputSegment: Codable, Equatable, Sendable {
  case text(content: String)
  case file(path: String)
  case attachment(path: String, mimeType: String?)
  case diffComment(
    path: String,
    lineNumber: Int64,
    side: AdvancedDiffSide,
    staged: Bool,
    body: String
  )
  case skill(
    name: String,
    path: String,
    invocation: String,
    provider: String,
    scope: AdvancedSkillScope,
    pluginId: String?,
    pluginName: String?
  )
  case mcp(id: String, name: String)

  private enum Kind: String, Codable {
    case text
    case file
    case attachment
    case diffComment = "diff_comment"
    case skill
    case mcp
  }

  private enum CodingKeys: String, CodingKey {
    case kind
    case content
    case path
    case mimeType
    case lineNumber
    case side
    case staged
    case body
    case name
    case invocation
    case provider
    case scope
    case pluginId
    case pluginName
    case id
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    switch try values.decode(Kind.self, forKey: .kind) {
    case .text:
      self = .text(content: try values.decode(String.self, forKey: .content))
    case .file:
      self = .file(path: try values.decode(String.self, forKey: .path))
    case .attachment:
      self = .attachment(
        path: try values.decode(String.self, forKey: .path),
        mimeType: try values.decodeIfPresent(String.self, forKey: .mimeType)
      )
    case .diffComment:
      self = .diffComment(
        path: try values.decode(String.self, forKey: .path),
        lineNumber: try values.decode(Int64.self, forKey: .lineNumber),
        side: try values.decode(AdvancedDiffSide.self, forKey: .side),
        staged: try values.decode(Bool.self, forKey: .staged),
        body: try values.decode(String.self, forKey: .body)
      )
    case .skill:
      self = .skill(
        name: try values.decode(String.self, forKey: .name),
        path: try values.decode(String.self, forKey: .path),
        invocation: try values.decode(String.self, forKey: .invocation),
        provider: try values.decode(String.self, forKey: .provider),
        scope: try values.decode(AdvancedSkillScope.self, forKey: .scope),
        pluginId: try values.decodeIfPresent(String.self, forKey: .pluginId),
        pluginName: try values.decodeIfPresent(String.self, forKey: .pluginName)
      )
    case .mcp:
      self = .mcp(
        id: try values.decode(String.self, forKey: .id),
        name: try values.decode(String.self, forKey: .name)
      )
    }
  }

  func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .text(let content):
      try values.encode(Kind.text, forKey: .kind)
      try values.encode(content, forKey: .content)
    case .file(let path):
      try values.encode(Kind.file, forKey: .kind)
      try values.encode(path, forKey: .path)
    case .attachment(let path, let mimeType):
      try values.encode(Kind.attachment, forKey: .kind)
      try values.encode(path, forKey: .path)
      try values.encodeIfPresent(mimeType, forKey: .mimeType)
    case .diffComment(let path, let lineNumber, let side, let staged, let body):
      try values.encode(Kind.diffComment, forKey: .kind)
      try values.encode(path, forKey: .path)
      try values.encode(lineNumber, forKey: .lineNumber)
      try values.encode(side, forKey: .side)
      try values.encode(staged, forKey: .staged)
      try values.encode(body, forKey: .body)
    case .skill(
      let name,
      let path,
      let invocation,
      let provider,
      let scope,
      let pluginId,
      let pluginName
    ):
      try values.encode(Kind.skill, forKey: .kind)
      try values.encode(name, forKey: .name)
      try values.encode(path, forKey: .path)
      try values.encode(invocation, forKey: .invocation)
      try values.encode(provider, forKey: .provider)
      try values.encode(scope, forKey: .scope)
      try values.encodeIfPresent(pluginId, forKey: .pluginId)
      try values.encodeIfPresent(pluginName, forKey: .pluginName)
    case .mcp(let id, let name):
      try values.encode(Kind.mcp, forKey: .kind)
      try values.encode(id, forKey: .id)
      try values.encode(name, forKey: .name)
    }
  }
}

struct AdvancedStageThreadInputRequest: Codable, Equatable, Sendable {
  let threadId: String
  let prompt: String
  let segments: [AdvancedThreadInputSegment]?
}

struct AdvancedWorkflowGetRunRequest: Codable, Equatable, Sendable {
  let manifestPath: String
  let location: ProjectLocation
  let includeAgentChats: Bool?
  let transcriptDir: String?
}

struct AdvancedWorkflowAgentChatRequest: Codable, Equatable, Sendable {
  let threadId: String
  let transcriptDir: String
  let agentId: String
  let agentFinished: Bool
  let location: ProjectLocation
}

struct AdvancedReadExternalFileRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  let absolutePath: String
}

struct AdvancedWriteExternalFileRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  let absolutePath: String
  let content: String
  let baseModifiedAtMs: Double
}

enum AdvancedProjectEntryType: String, Codable, Sendable {
  case file
  case directory
}

struct AdvancedCreateProjectEntryRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  let path: String
  let entryType: AdvancedProjectEntryType

  private enum CodingKeys: String, CodingKey {
    case projectLocation
    case path
    case entryType = "type"
  }
}

struct AdvancedRenameProjectEntryRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  let path: String
  let nextName: String
}

struct AdvancedMoveProjectEntryRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  let path: String
  let nextParentPath: String?
}

struct AdvancedDeleteProjectEntryRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  let path: String
}

struct AdvancedGenerateCommitMessageRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  let agentKind: String
  let effort: String?
  let fast: Bool?
  let language: String?
  let model: String?
}

struct AdvancedGenerateTitleRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  let agentKind: String
  let prompt: String
  let effort: String?
  let fast: Bool?
  let language: String?
  let model: String?
}

struct AdvancedGeneratePrSummaryRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation
  let agentKind: String
  let branch: String
  let baseBranch: String
  let effort: String?
  let language: String?
  let model: String?
}
