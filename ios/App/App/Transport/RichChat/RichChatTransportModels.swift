import Foundation

struct RichChatSendInput: Sendable, Equatable {
  let prompt: String
  let config: [String: RichJSON]
  let segments: [RichPromptSegment]?
  let userMessageItemID: String?

  init(
    prompt: String,
    config: [String: RichJSON],
    segments: [RichPromptSegment]? = nil,
    userMessageItemID: String? = nil
  ) {
    self.prompt = prompt
    self.config = config
    self.segments = segments
    self.userMessageItemID = userMessageItemID
  }
}

struct RichChatThreadCommand: Sendable, Equatable {
  let payload: [String: RichJSON]
  /// Used only for `start`; other command kinds never receive an idempotency header.
  let commandID: String?

  init(payload: [String: RichJSON], commandID: String? = nil) {
    self.payload = payload
    self.commandID = commandID
  }
}

enum RichChatGoalUpdate: Sendable, Equatable {
  case edit(objective: String)
  case pause
  case resume
  case clear
}

struct RichChatRequestResolution: Sendable, Equatable {
  let requestID: RichRequestID
  let method: String
  let response: RichJSON
}

struct RichChatTerminalSize: Sendable, Equatable {
  let columns: Int
  let rows: Int
}

struct RichChatTerminalStartInput: Sendable, Equatable {
  let shellID: String
  let projectLocation: ProjectLocation
  let worktreePath: String?
  let startInHome: Bool?
  let initialSize: RichChatTerminalSize?
}

struct RichChatCheckpointCollection: Sendable, Equatable {
  let checkpoints: [RichCheckpoint]
  let turns: [RichCheckpoint]
}

struct RichChatBinaryPayload: Sendable, Equatable {
  let data: Data
  let mimeType: String
}

struct RichChatAttachment: Sendable, Equatable {
  let name: String
  let contentType: String
  let data: Data
}

enum RichChatTransportFailure: Error, Sendable, Equatable {
  case invalidRequest
  case invalidResponse
  case rawTransportUnavailable
  case ambiguousOutcome
}

struct RichChatPreparedJSONRoute: Sendable, Equatable {
  let pathValues: [String: String]
  let body: Data
}

struct RichChatPreparedQueryRoute: Sendable, Equatable {
  let pathValues: [String: String]
  let queryItems: [URLQueryItem]
}

extension RichPromptSegment {
  var richChatWireValue: RichJSON {
    switch self {
    case .text(let content):
      return .object(["kind": .string("text"), "content": .string(content)])
    case .file(let path):
      return .object(["kind": .string("file"), "path": .string(path)])
    case .attachment(let path, let mimeType):
      var value: [String: RichJSON] = [
        "kind": .string("attachment"),
        "path": .string(path),
      ]
      if let mimeType { value["mimeType"] = .string(mimeType) }
      return .object(value)
    case .diffComment(let path, let lineNumber, let side, let staged, let body):
      return .object([
        "kind": .string("diff_comment"),
        "path": .string(path),
        "lineNumber": .number(Decimal(lineNumber)),
        "side": .string(side.rawValue),
        "staged": .bool(staged),
        "body": .string(body),
      ])
    case .skill(
      let name, let path, let invocation, let provider, let scope, let pluginID, let pluginName
    ):
      var value: [String: RichJSON] = [
        "kind": .string("skill"),
        "name": .string(name),
        "invocation": .string(invocation),
        "provider": .string(provider),
        "scope": .string(scope),
      ]
      if let path { value["path"] = .string(path) }
      if let pluginID { value["pluginId"] = .string(pluginID) }
      if let pluginName { value["pluginName"] = .string(pluginName) }
      return .object(value)
    case .mcp(let id, let name):
      return .object([
        "kind": .string("mcp"),
        "id": .string(id),
        "name": .string(name),
      ])
    case .thread(let threadID, let title):
      return .object([
        "kind": .string("thread"),
        "threadId": .string(threadID),
        "title": .string(title),
      ])
    }
  }
}
