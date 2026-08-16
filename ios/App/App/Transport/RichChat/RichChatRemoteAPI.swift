import Foundation

protocol RichChatRemoteAPI: Sendable {
  func richHistory(threadID: String, targetEntryCount: Int?) async throws -> RemoteThreadSnapshot
  func richHistoryPage(
    threadID: String,
    beforePosition: Int?,
    limit: Int,
    targetEntryCount: Int?
  ) async throws -> RemoteRuntimeItemsPage
  func richLocalImage(path: String) async throws -> RichChatBinaryPayload
  func richRuntimeImage(_ reference: RichRemoteImageReference) async throws -> RichChatBinaryPayload
  func richListCheckpoints(
    threadID: String, projectLocation: ProjectLocation
  ) async throws -> RichChatCheckpointCollection

  func richSend(threadID: String, input: RichChatSendInput) async throws
  func richInterrupt(threadID: String) async throws
  func richCloseThread(threadID: String) async throws
  func richTruncate(threadID: String, after itemID: String) async throws
  func richCommand(threadID: String, command: RichChatThreadCommand) async throws
  func richGoal(threadID: String, update: RichChatGoalUpdate) async throws
  func richSetSteer(threadID: String, input: RichSetPendingSteerInput) async throws
  func richClearSteer(threadID: String) async throws
  func richResolveRequest(threadID: String, resolution: RichChatRequestResolution) async throws
  func richUploadAttachment(threadID: String, attachment: RichChatAttachment) async throws -> String

  func richRollback(
    threadID: String, turnCount: Int, config: [String: RichJSON]?
  ) async throws
  func richCreateCheckpoint(
    threadID: String, itemID: String, projectLocation: ProjectLocation
  ) async throws -> RichCheckpoint
  func richFinalizeCheckpoint(
    threadID: String,
    itemID: String,
    baseItemID: String,
    projectLocation: ProjectLocation
  ) async throws -> RichCheckpoint
  func richRestoreCheckpoint(
    threadID: String, itemID: String, projectLocation: ProjectLocation
  ) async throws
  func richStageInput(
    threadID: String, prompt: String, segments: [RichPromptSegment]?
  ) async throws

  func richStartTerminal(_ input: RichChatTerminalStartInput) async throws
  func richWriteTerminal(threadID: String, data: String) async throws
  func richResizeTerminal(threadID: String, size: RichChatTerminalSize) async throws
  func richCloseTerminal(threadID: String) async throws
}

/// Composes the existing bounded JSON client with the native bounded raw-body seam.
struct GeneratedRichChatRemoteAPI: RichChatRemoteAPI, Sendable {
  private let json: RemoteAPIClient
  private let raw: (any RichChatRawHTTPExecuting)?

  init(json: RemoteAPIClient, raw: (any RichChatRawHTTPExecuting)? = nil) {
    self.json = json
    self.raw = raw
  }

  func richHistory(
    threadID: String,
    targetEntryCount: Int?
  ) async throws -> RemoteThreadSnapshot {
    try await json.threadHistory(
      threadId: threadID,
      targetTimelineEntryCount: targetEntryCount
    )
  }

  func richHistoryPage(
    threadID: String,
    beforePosition: Int?,
    limit: Int,
    targetEntryCount: Int?
  ) async throws -> RemoteRuntimeItemsPage {
    try await json.threadRuntimeItemsPage(
      threadId: threadID,
      beforePosition: beforePosition,
      limit: limit,
      targetTimelineEntryCount: targetEntryCount
    )
  }

  func richLocalImage(path: String) async throws -> RichChatBinaryPayload {
    let route = try prepare { try GeneratedRemoteV3Contract.richLocalImage(path: path) }
    guard let raw else { throw RichChatTransportFailure.rawTransportUnavailable }
    return try await raw.fetchImage(path: "/api/files/image", queryItems: route.queryItems)
  }

  func richRuntimeImage(_ reference: RichRemoteImageReference) async throws
    -> RichChatBinaryPayload
  {
    let route = try prepare { try GeneratedRemoteV3Contract.richRuntimeImage(reference) }
    guard let raw else { throw RichChatTransportFailure.rawTransportUnavailable }
    let threadID = try Self.pathValue("threadId", in: route.pathValues)
    let itemID = try Self.pathValue("itemId", in: route.pathValues)
    let path =
      "/api/threads/\(RemoteAPIClient.encodePathSegment(threadID))/items/"
      + "\(RemoteAPIClient.encodePathSegment(itemID))/image"
    return try await raw.fetchImage(path: path, queryItems: route.queryItems)
  }

  func richListCheckpoints(
    threadID: String,
    projectLocation: ProjectLocation
  ) async throws -> RichChatCheckpointCollection {
    let body = try prepare {
      try GeneratedRemoteV3Contract.richListCheckpointsRequest(
        threadID: threadID, projectLocation: projectLocation)
    }
    let result = try await procedureRead(.listFileCheckpoints, body: body)
    guard case .object(let object) = result,
      let checkpointValues = object["checkpoints"]?.arrayValue,
      let turnValues = object["turns"]?.arrayValue
    else { throw RichChatTransportFailure.invalidResponse }
    do {
      return RichChatCheckpointCollection(
        checkpoints: try checkpointValues.map(RichCheckpointDecoder.decode),
        turns: try turnValues.map(RichCheckpointDecoder.decode)
      )
    } catch {
      throw RichChatTransportFailure.invalidResponse
    }
  }

  func richSend(threadID: String, input: RichChatSendInput) async throws {
    let route = try prepare {
      try GeneratedRemoteV3Contract.richSend(threadID: threadID, input: input)
    }
    let commandID = input.userMessageItemID ?? UUID().uuidString
    try await mutate(
      .send,
      route: route,
      suffix: "send",
      headers: [ProtocolConstants.commandIdHeader: commandID]
    )
  }

  func richInterrupt(threadID: String) async throws {
    let route = try prepare { try GeneratedRemoteV3Contract.richInterrupt(threadID: threadID) }
    try await mutate(.interrupt, route: route, suffix: "interrupt")
  }

  func richCloseThread(threadID: String) async throws {
    let route = try prepare { try GeneratedRemoteV3Contract.richCloseThread(threadID: threadID) }
    try await mutate(.closeThread, route: route, suffix: "close")
  }

  func richTruncate(threadID: String, after itemID: String) async throws {
    let route = try prepare {
      try GeneratedRemoteV3Contract.richTruncate(threadID: threadID, after: itemID)
    }
    try await mutate(.truncate, route: route, suffix: "runtime/truncate")
  }

  func richCommand(threadID: String, command: RichChatThreadCommand) async throws {
    let route = try prepare {
      try GeneratedRemoteV3Contract.richThreadCommand(threadID: threadID, command: command)
    }
    let body = try RichJSON.decode(route.body).objectValue
    let isStart = body?["kind"]?.stringValue == "start"
    let headers =
      isStart
      ? [ProtocolConstants.commandIdHeader: command.commandID ?? "thread-start:\(threadID)"]
      : [:]
    try await mutate(.threadCommand, route: route, suffix: "command", headers: headers)
  }

  func richGoal(threadID: String, update: RichChatGoalUpdate) async throws {
    let route = try prepare {
      try GeneratedRemoteV3Contract.richGoal(threadID: threadID, update: update)
    }
    try await mutate(.goal, route: route, suffix: "goal")
  }

  func richSetSteer(threadID: String, input: RichSetPendingSteerInput) async throws {
    let route = try prepare {
      try GeneratedRemoteV3Contract.richSetSteer(threadID: threadID, input: input)
    }
    try await mutate(.steerSet, route: route, suffix: "steer/set")
  }

  func richClearSteer(threadID: String) async throws {
    let route = try prepare { try GeneratedRemoteV3Contract.richClearSteer(threadID: threadID) }
    try await mutate(.steerClear, route: route, suffix: "steer/clear")
  }

  func richResolveRequest(
    threadID: String,
    resolution: RichChatRequestResolution
  ) async throws {
    let route = try prepare {
      try GeneratedRemoteV3Contract.richResolveRequest(
        threadID: threadID, resolution: resolution)
    }
    try await mutate(.requestResolve, route: route, suffix: "requests/resolve")
  }

  func richUploadAttachment(
    threadID: String,
    attachment: RichChatAttachment
  ) async throws -> String {
    let decision = RichAttachmentPolicy.evaluate(
      name: attachment.name,
      byteCount: Int64(attachment.data.count)
    )
    guard decision.accepted else { throw RichChatTransportFailure.invalidRequest }
    let route = try prepare {
      try GeneratedRemoteV3Contract.richAttachmentUpload(
        threadID: threadID, name: attachment.name)
    }
    guard let raw else { throw RichChatTransportFailure.rawTransportUnavailable }
    let response: Data
    do {
      response = try await raw.uploadAttachment(
        path: "/api/files/attachment",
        queryItems: route.queryItems,
        contentType: attachment.contentType,
        body: attachment.data
      )
    } catch is CancellationError {
      throw CancellationError()
    } catch let failure as RichChatTransportFailure where failure == .invalidRequest {
      throw failure
    } catch let error as RemoteClientError
      where RemoteMutationClassification.classify(statusCode: error.status, code: error.code) == .definiteFailure
    {
      throw error
    } catch {
      throw RichChatTransportFailure.ambiguousOutcome
    }
    do {
      return try GeneratedRemoteV3Contract.richAttachmentUploadResponse(response)
    } catch {
      throw RichChatTransportFailure.ambiguousOutcome
    }
  }

  func richRollback(
    threadID: String,
    turnCount: Int,
    config: [String: RichJSON]?
  ) async throws {
    let body = try prepare {
      try GeneratedRemoteV3Contract.richRollbackRequest(
        threadID: threadID, turnCount: turnCount, config: config)
    }
    try await procedureMutation(.rollbackThreadConversation, body: body)
  }

  func richCreateCheckpoint(
    threadID: String,
    itemID: String,
    projectLocation: ProjectLocation
  ) async throws -> RichCheckpoint {
    let body = try prepare {
      try GeneratedRemoteV3Contract.richCreateCheckpointRequest(
        threadID: threadID, checkpointItemID: itemID, projectLocation: projectLocation)
    }
    return try await checkpointMutation(.createFileCheckpoint, body: body)
  }

  func richFinalizeCheckpoint(
    threadID: String,
    itemID: String,
    baseItemID: String,
    projectLocation: ProjectLocation
  ) async throws -> RichCheckpoint {
    let body = try prepare {
      try GeneratedRemoteV3Contract.richFinalizeCheckpointRequest(
        threadID: threadID,
        checkpointItemID: itemID,
        baseCheckpointItemID: baseItemID,
        projectLocation: projectLocation
      )
    }
    return try await checkpointMutation(.finalizeFileCheckpoint, body: body)
  }

  func richRestoreCheckpoint(
    threadID: String,
    itemID: String,
    projectLocation: ProjectLocation
  ) async throws {
    let body = try prepare {
      try GeneratedRemoteV3Contract.richRestoreCheckpointRequest(
        threadID: threadID, checkpointItemID: itemID, projectLocation: projectLocation)
    }
    try await procedureMutation(.restoreFileCheckpoint, body: body)
  }

  func richStageInput(
    threadID: String,
    prompt: String,
    segments: [RichPromptSegment]?
  ) async throws {
    let body = try prepare {
      try GeneratedRemoteV3Contract.richStageThreadInputRequest(
        threadID: threadID, prompt: prompt, segments: segments)
    }
    try await procedureMutation(.stageThreadInput, body: body)
  }

  func richStartTerminal(_ input: RichChatTerminalStartInput) async throws {
    let route = try prepare { try GeneratedRemoteV3Contract.richTerminalStart(input) }
    try await mutate(.terminalStart, route: route, absolutePath: "/api/terminal/start")
  }

  func richWriteTerminal(threadID: String, data: String) async throws {
    let route = try prepare {
      try GeneratedRemoteV3Contract.richTerminalWrite(threadID: threadID, data: data)
    }
    try await mutate(.terminalWrite, route: route, suffix: "terminal/write")
  }

  func richResizeTerminal(threadID: String, size: RichChatTerminalSize) async throws {
    let route = try prepare {
      try GeneratedRemoteV3Contract.richTerminalResize(threadID: threadID, size: size)
    }
    try await mutate(.terminalResize, route: route, suffix: "terminal/resize")
  }

  func richCloseTerminal(threadID: String) async throws {
    let route = try prepare {
      try GeneratedRemoteV3Contract.richTerminalClose(threadID: threadID)
    }
    try await mutate(.terminalClose, route: route, suffix: "terminal/close")
  }

  private func mutate(
    _ operation: RichChatMutationOperation,
    route: RichChatPreparedJSONRoute,
    suffix: String? = nil,
    absolutePath: String? = nil,
    headers: [String: String] = [:]
  ) async throws {
    let path: String
    if let absolutePath {
      path = absolutePath
    } else {
      guard let suffix else { preconditionFailure("A rich-chat mutation path is required.") }
      let threadID = try Self.pathValue("threadId", in: route.pathValues)
      path = "/api/threads/\(RemoteAPIClient.encodePathSegment(threadID))/\(suffix)"
    }
    let response = try await mutationRequest(
      path: path, body: route.body, headers: headers
    )
    do {
      try GeneratedRemoteV3Contract.validateRichMutationResponse(operation, data: response)
    } catch {
      throw RichChatTransportFailure.ambiguousOutcome
    }
  }

  private func mutationRequest(
    path: String,
    body: Data,
    headers: [String: String] = [:]
  ) async throws -> Data {
    do {
      return try await json.requestData(
        path: path, method: "POST", jsonBody: body, extraHeaders: headers)
    } catch is CancellationError {
      throw CancellationError()
    } catch let error as RemoteClientError
      where RemoteMutationClassification.classify(statusCode: error.status, code: error.code) == .requestMayHaveCommitted
    {
      throw RichChatTransportFailure.ambiguousOutcome
    } catch {
      throw error
    }
  }

  private func procedureMutation(_ procedure: RichChatProcedure, body: Data) async throws {
    let data = try await mutationRequest(path: "/api/git/call", body: body)
    do {
      let result = try GeneratedRemoteV3Contract.richProcedureResult(procedure, envelope: data)
      guard result == nil else { throw RichChatTransportFailure.invalidResponse }
    } catch {
      throw RichChatTransportFailure.ambiguousOutcome
    }
  }

  private func checkpointMutation(_ procedure: RichChatProcedure, body: Data) async throws
    -> RichCheckpoint
  {
    let data = try await mutationRequest(path: "/api/git/call", body: body)
    do {
      guard
        let result = try GeneratedRemoteV3Contract.richProcedureResult(
          procedure, envelope: data),
        let checkpoint = result.objectValue?["checkpoint"]
      else { throw RichChatTransportFailure.invalidResponse }
      return try RichCheckpointDecoder.decode(checkpoint)
    } catch {
      throw RichChatTransportFailure.ambiguousOutcome
    }
  }

  private func procedureRead(_ procedure: RichChatProcedure, body: Data) async throws -> RichJSON {
    let data = try await json.requestData(
      path: "/api/git/call", method: "POST", jsonBody: body)
    do {
      guard
        let result = try GeneratedRemoteV3Contract.richProcedureResult(
          procedure, envelope: data)
      else { throw RichChatTransportFailure.invalidResponse }
      return result
    } catch is CancellationError {
      throw CancellationError()
    } catch let error as RemoteClientError {
      throw error
    } catch {
      throw RichChatTransportFailure.invalidResponse
    }
  }

  private func prepare<Value>(_ operation: () throws -> Value) throws -> Value {
    do {
      return try operation()
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw RichChatTransportFailure.invalidRequest
    }
  }

  private static func pathValue(_ key: String, in values: [String: String]) throws -> String {
    guard let value = values[key] else { throw RichChatTransportFailure.invalidRequest }
    return value
  }
}
