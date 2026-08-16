import Foundation

enum AdvancedOperationsContractError: Error, Equatable, Sendable {
  case incompatibleMetadata
  case invalidRequest
  case invalidResponse
}

/// Sole adapter between stable AdvancedOperations models and generated remote-v3 roots.
enum AdvancedOperationsRemoteV3Contract {
  static let procedurePath = "/api/git/call"

  static func metadata(
    for procedure: AdvancedOperationProcedure
  ) throws -> AdvancedOperationMetadata {
    let expected = procedure.metadata
    guard RemoteContractMetadata.protocolVersion == 3,
      RemoteContractMetadata.bindingFormatVersion == 2,
      RemoteContractMetadata.generatorVersion == 3,
      let generated = RemoteContractMetadata.procedures.first(where: {
        $0.name == procedure.rawValue
      }),
      generated.scope == expected.scope.rawValue,
      generated.owner == expected.owner.rawValue,
      generated.resultKind == expected.resultKind.rawValue
    else {
      throw AdvancedOperationsContractError.incompatibleMetadata
    }
    return expected
  }

  static func requestEnvelope(_ request: AdvancedOperationRequest) throws -> Data {
    do {
      _ = try metadata(for: request.procedure)
      let requestData = try JSONEncoder().encode(requestPayload(request))
      let canonicalPayload = try canonicalRequest(request.procedure, data: requestData)
      let payload = try JSONDecoder().decode(AdvancedJSONValue.self, from: canonicalPayload)
      let envelope = ProcedureEnvelope(
        procedure: request.procedure.rawValue,
        payload: payload
      )
      return try canonical(
        JSONEncoder().encode(envelope),
        codec: RemoteRootCodecs.routeU2EProcedureU2DCallU2ERequest
      )
    } catch is AdvancedOperationsContractError {
      throw AdvancedOperationsContractError.invalidRequest
    } catch {
      throw AdvancedOperationsContractError.invalidRequest
    }
  }

  static func result(
    for procedure: AdvancedOperationProcedure,
    envelope: Data
  ) throws -> AdvancedOperationResult {
    do {
      let metadata = try metadata(for: procedure)
      let root = try JSONDecoder().decode(AdvancedJSONValue.self, from: envelope)
      guard case .object(let object) = root else {
        throw AdvancedOperationsContractError.invalidResponse
      }
      if metadata.resultKind == .omitted {
        guard object.isEmpty else { throw AdvancedOperationsContractError.invalidResponse }
        return .omitted
      }
      guard object.count == 1, let result = object["result"] else {
        throw AdvancedOperationsContractError.invalidResponse
      }
      return try decodeResult(
        procedure,
        data: JSONEncoder().encode(result)
      )
    } catch is AdvancedOperationsContractError {
      throw AdvancedOperationsContractError.invalidResponse
    } catch {
      throw AdvancedOperationsContractError.invalidResponse
    }
  }

  private static func canonicalRequest(
    _ procedure: AdvancedOperationProcedure,
    data: Data
  ) throws -> Data {
    switch procedure {
    case .createFileCheckpoint:
      try canonical(data, codec: RemoteRootCodecs.procedureU2ECreateFileCheckpointU2ERequest)
    case .finalizeFileCheckpoint:
      try canonical(data, codec: RemoteRootCodecs.procedureU2EFinalizeFileCheckpointU2ERequest)
    case .subagentSubscribe:
      try canonical(data, codec: RemoteRootCodecs.procedureU2ESubagentSubscribeU2ERequest)
    case .subagentUnsubscribe:
      try canonical(data, codec: RemoteRootCodecs.procedureU2ESubagentUnsubscribeU2ERequest)
    case .stageThreadInput:
      try canonical(data, codec: RemoteRootCodecs.procedureU2EStageThreadInputU2ERequest)
    case .workflowGetRun:
      try canonical(data, codec: RemoteRootCodecs.procedureU2EWorkflowGetRunU2ERequest)
    case .workflowAgentChat:
      try canonical(data, codec: RemoteRootCodecs.procedureU2EWorkflowAgentChatU2ERequest)
    case .readAbsoluteFile:
      try canonical(data, codec: RemoteRootCodecs.procedureU2EReadAbsoluteFileU2ERequest)
    case .readExternalFile:
      try canonical(data, codec: RemoteRootCodecs.procedureU2EReadExternalFileU2ERequest)
    case .writeExternalFile:
      try canonical(data, codec: RemoteRootCodecs.procedureU2EWriteExternalFileU2ERequest)
    case .createProjectEntry:
      try canonical(data, codec: RemoteRootCodecs.procedureU2ECreateProjectEntryU2ERequest)
    case .renameProjectEntry:
      try canonical(data, codec: RemoteRootCodecs.procedureU2ERenameProjectEntryU2ERequest)
    case .moveProjectEntry:
      try canonical(data, codec: RemoteRootCodecs.procedureU2EMoveProjectEntryU2ERequest)
    case .deleteProjectEntry:
      try canonical(data, codec: RemoteRootCodecs.procedureU2EDeleteProjectEntryU2ERequest)
    case .generateCommitMessage:
      try canonical(data, codec: RemoteRootCodecs.procedureU2EGenerateCommitMessageU2ERequest)
    case .generateTitle:
      try canonical(data, codec: RemoteRootCodecs.procedureU2EGenerateTitleU2ERequest)
    case .generatePrSummary:
      try canonical(data, codec: RemoteRootCodecs.procedureU2EGeneratePrSummaryU2ERequest)
    }
  }

  private static func decodeResult(
    _ procedure: AdvancedOperationProcedure,
    data: Data
  ) throws -> AdvancedOperationResult {
    switch procedure {
    case .createFileCheckpoint:
      .createFileCheckpoint(
        try decode(
          AdvancedCreateFileCheckpointResult.self,
          data: data,
          codec: RemoteRootCodecs.procedureU2ECreateFileCheckpointU2EResult
        )
      )
    case .finalizeFileCheckpoint:
      .finalizeFileCheckpoint(
        try decode(
          AdvancedFinalizeFileCheckpointResult.self,
          data: data,
          codec: RemoteRootCodecs.procedureU2EFinalizeFileCheckpointU2EResult
        )
      )
    case .subagentSubscribe:
      .subagentSubscribe(
        try decode(
          AdvancedSubagentSubscribeResult.self,
          data: data,
          codec: RemoteRootCodecs.procedureU2ESubagentSubscribeU2EResult
        )
      )
    case .workflowGetRun:
      .workflowGetRun(
        try decode(
          AdvancedWorkflowGetRunResult.self,
          data: data,
          codec: RemoteRootCodecs.procedureU2EWorkflowGetRunU2EResult
        )
      )
    case .workflowAgentChat:
      .workflowAgentChat(
        try decode(
          AdvancedWorkflowAgentChatResult.self,
          data: data,
          codec: RemoteRootCodecs.procedureU2EWorkflowAgentChatU2EResult
        )
      )
    case .readAbsoluteFile:
      .readAbsoluteFile(
        try decode(
          AdvancedAbsoluteFileResult.self,
          data: data,
          codec: RemoteRootCodecs.procedureU2EReadAbsoluteFileU2EResult
        )
      )
    case .readExternalFile:
      .readExternalFile(
        try decode(
          AdvancedExternalFileResult.self,
          data: data,
          codec: RemoteRootCodecs.procedureU2EReadExternalFileU2EResult
        )
      )
    case .writeExternalFile:
      .writeExternalFile(
        try decode(
          AdvancedWriteExternalFileResult.self,
          data: data,
          codec: RemoteRootCodecs.procedureU2EWriteExternalFileU2EResult
        )
      )
    case .generateCommitMessage:
      .generatedCommitMessage(
        try decode(
          AdvancedGeneratedCommitMessage.self,
          data: data,
          codec: RemoteRootCodecs.procedureU2EGenerateCommitMessageU2EResult
        )
      )
    case .generateTitle:
      .generatedTitle(
        try decode(
          AdvancedGeneratedTitle.self,
          data: data,
          codec: RemoteRootCodecs.procedureU2EGenerateTitleU2EResult
        )
      )
    case .generatePrSummary:
      .generatedPrSummary(
        try decode(
          AdvancedGeneratedPrSummary.self,
          data: data,
          codec: RemoteRootCodecs.procedureU2EGeneratePrSummaryU2EResult
        )
      )
    case .subagentUnsubscribe, .stageThreadInput, .createProjectEntry,
      .renameProjectEntry, .moveProjectEntry, .deleteProjectEntry:
      throw AdvancedOperationsContractError.invalidResponse
    }
  }

  private static func requestPayload(_ request: AdvancedOperationRequest) -> any Encodable {
    switch request {
    case .createFileCheckpoint(let value): value
    case .finalizeFileCheckpoint(let value): value
    case .subagentSubscribe(let value), .subagentUnsubscribe(let value): value
    case .stageThreadInput(let value): value
    case .workflowGetRun(let value): value
    case .workflowAgentChat(let value): value
    case .readAbsoluteFile(let value), .readExternalFile(let value): value
    case .writeExternalFile(let value): value
    case .createProjectEntry(let value): value
    case .renameProjectEntry(let value): value
    case .moveProjectEntry(let value): value
    case .deleteProjectEntry(let value): value
    case .generateCommitMessage(let value): value
    case .generateTitle(let value): value
    case .generatePrSummary(let value): value
    }
  }

  private static func canonical<Value: Codable & Sendable>(
    _ data: Data,
    codec: RemoteRootCodec<Value>
  ) throws -> Data {
    let root = try codec.decode(data)
    return try codec.encodeSnapshot(root)
  }

  private static func decode<Result: Decodable, Canonical: Codable & Sendable>(
    _ type: Result.Type,
    data: Data,
    codec: RemoteRootCodec<Canonical>
  ) throws -> Result {
    let canonicalData = try canonical(data, codec: codec)
    return try JSONDecoder().decode(type, from: canonicalData)
  }
}

private struct ProcedureEnvelope: Codable {
  let procedure: String
  let payload: AdvancedJSONValue
}
