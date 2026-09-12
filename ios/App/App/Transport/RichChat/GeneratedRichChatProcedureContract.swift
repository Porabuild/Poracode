import Foundation

enum RichChatProcedure: String, Sendable {
  case rollbackThreadConversation
  case createFileCheckpoint
  case finalizeFileCheckpoint
  case listFileCheckpoints
  case restoreFileCheckpoint
  case stageThreadInput

  var returnsJSON: Bool {
    switch self {
    case .createFileCheckpoint, .finalizeFileCheckpoint, .listFileCheckpoints: true
    case .rollbackThreadConversation, .restoreFileCheckpoint, .stageThreadInput: false
    }
  }
}

extension GeneratedRemoteV3Contract {
  static func richRollbackRequest(
    threadID: String,
    turnCount: Int,
    config: [String: RichJSON]?
  ) throws -> Data {
    var payload: [String: RichJSON] = [
      "threadId": .string(threadID),
      "numTurns": .number(Decimal(turnCount)),
    ]
    if let config { payload["config"] = .object(config) }
    return try richProcedureRequest(.rollbackThreadConversation, payload: payload)
  }

  static func richCreateCheckpointRequest(
    threadID: String,
    checkpointItemID: String,
    projectLocation: ProjectLocation
  ) throws -> Data {
    try richProcedureRequest(
      .createFileCheckpoint,
      payload: [
        "threadId": .string(threadID),
        "checkpointItemId": .string(checkpointItemID),
        "projectLocation": try richJSON(projectLocation),
      ]
    )
  }

  static func richFinalizeCheckpointRequest(
    threadID: String,
    checkpointItemID: String,
    baseCheckpointItemID: String,
    projectLocation: ProjectLocation
  ) throws -> Data {
    try richProcedureRequest(
      .finalizeFileCheckpoint,
      payload: [
        "threadId": .string(threadID),
        "checkpointItemId": .string(checkpointItemID),
        "baseCheckpointItemId": .string(baseCheckpointItemID),
        "projectLocation": try richJSON(projectLocation),
      ]
    )
  }

  static func richListCheckpointsRequest(
    threadID: String,
    projectLocation: ProjectLocation
  ) throws -> Data {
    try richProcedureRequest(
      .listFileCheckpoints,
      payload: [
        "threadId": .string(threadID),
        "projectLocation": try richJSON(projectLocation),
      ]
    )
  }

  static func richRestoreCheckpointRequest(
    threadID: String,
    checkpointItemID: String,
    projectLocation: ProjectLocation
  ) throws -> Data {
    try richProcedureRequest(
      .restoreFileCheckpoint,
      payload: [
        "threadId": .string(threadID),
        "checkpointItemId": .string(checkpointItemID),
        "projectLocation": try richJSON(projectLocation),
      ]
    )
  }

  static func richStageThreadInputRequest(
    threadID: String,
    prompt: String,
    segments: [RichPromptSegment]?
  ) throws -> Data {
    var payload: [String: RichJSON] = [
      "threadId": .string(threadID),
      "prompt": .string(prompt),
    ]
    if let segments { payload["segments"] = .array(segments.map(\.richChatWireValue)) }
    return try richProcedureRequest(.stageThreadInput, payload: payload)
  }

  static func richProcedureResult(_ procedure: RichChatProcedure, envelope: Data) throws
    -> RichJSON?
  {
    guard case .object(let object) = try RichJSON.decode(envelope) else {
      throw RemoteClientError.invalidResponse("Invalid rich-chat procedure result envelope.")
    }
    guard procedure.returnsJSON else {
      guard object.isEmpty else {
        throw RemoteClientError.invalidResponse("Invalid omitted procedure result.")
      }
      return nil
    }
    guard object.keys.count == 1, let result = object["result"] else {
      throw RemoteClientError.invalidResponse("Invalid rich-chat procedure result envelope.")
    }
    let raw = try richData(result)
    let canonical: Data
    switch procedure {
    case .createFileCheckpoint:
      canonical = try canonicalData(
        raw,
        codec: RemoteRootCodecs.procedureU2ECreateFileCheckpointU2EResult,
        boundary: "create file checkpoint result"
      )
    case .finalizeFileCheckpoint:
      canonical = try canonicalData(
        raw,
        codec: RemoteRootCodecs.procedureU2EFinalizeFileCheckpointU2EResult,
        boundary: "finalize file checkpoint result"
      )
    case .listFileCheckpoints:
      canonical = try canonicalData(
        raw,
        codec: RemoteRootCodecs.procedureU2EListFileCheckpointsU2EResult,
        boundary: "list file checkpoints result"
      )
    case .rollbackThreadConversation, .restoreFileCheckpoint, .stageThreadInput:
      preconditionFailure("Omitted procedure result reached JSON decoding.")
    }
    return try RichJSON.decode(canonical)
  }

  private static func richProcedureRequest(
    _ procedure: RichChatProcedure,
    payload: [String: RichJSON]
  ) throws -> Data {
    let raw = try richData(.object(payload))
    let canonicalPayload: Data
    switch procedure {
    case .rollbackThreadConversation:
      canonicalPayload = try canonicalData(
        raw,
        codec: RemoteRootCodecs.procedureU2ERollbackThreadConversationU2ERequest,
        boundary: "rollback thread conversation request"
      )
    case .createFileCheckpoint:
      canonicalPayload = try canonicalData(
        raw,
        codec: RemoteRootCodecs.procedureU2ECreateFileCheckpointU2ERequest,
        boundary: "create file checkpoint request"
      )
    case .finalizeFileCheckpoint:
      canonicalPayload = try canonicalData(
        raw,
        codec: RemoteRootCodecs.procedureU2EFinalizeFileCheckpointU2ERequest,
        boundary: "finalize file checkpoint request"
      )
    case .listFileCheckpoints:
      canonicalPayload = try canonicalData(
        raw,
        codec: RemoteRootCodecs.procedureU2EListFileCheckpointsU2ERequest,
        boundary: "list file checkpoints request"
      )
    case .restoreFileCheckpoint:
      canonicalPayload = try canonicalData(
        raw,
        codec: RemoteRootCodecs.procedureU2ERestoreFileCheckpointU2ERequest,
        boundary: "restore file checkpoint request"
      )
    case .stageThreadInput:
      canonicalPayload = try canonicalData(
        raw,
        codec: RemoteRootCodecs.procedureU2EStageThreadInputU2ERequest,
        boundary: "stage thread input request"
      )
    }
    let payloadValue = try RichJSON.decode(canonicalPayload)
    return try canonicalData(
      try richData(
        .object([
          "procedure": .string(procedure.rawValue),
          "payload": payloadValue,
        ])),
      codec: RemoteRootCodecs.routeU2EProcedureU2DCallU2ERequest,
      boundary: "rich-chat procedure call request"
    )
  }
}
