import Foundation

extension SelectedRichChatSessionGateway: RichChatHistoryGateway {
  func loadRichHistory(
    target: RichChatThreadTarget,
    targetEntryCount: Int?
  ) async throws -> RemoteThreadSnapshot {
    try await executeRead(target: target, capability: .sessionRead) { api in
      try await api.richHistory(
        threadID: target.threadID,
        targetEntryCount: targetEntryCount
      )
    }
  }

  func loadRichHistoryPage(
    target: RichChatThreadTarget,
    beforePosition: Int?,
    limit: Int,
    targetEntryCount: Int?
  ) async throws -> RemoteRuntimeItemsPage {
    try await executeRead(target: target, capability: .sessionRead) { api in
      try await api.richHistoryPage(
        threadID: target.threadID,
        beforePosition: beforePosition,
        limit: limit,
        targetEntryCount: targetEntryCount
      )
    }
  }

  func loadRichTurns(
    target: RichChatThreadTarget,
    cursor: String,
    limit: Int
  ) async throws -> RemoteBoundedTurnsPage {
    try await executeRead(target: target, capability: .sessionRead) { api in
      try await api.richTurnsPage(threadID: target.threadID, cursor: cursor, limit: limit)
    }
  }

  func loadRichRuntimeGap(
    target: RichChatThreadTarget
  ) async throws -> RemoteHistoryGapRead {
    try await executeRead(target: target, capability: .sessionRead) { api in
      try await api.richRuntimeGap(threadID: target.threadID)
    }
  }

  func acknowledgeRichRuntimeGap(
    target: RichChatThreadTarget,
    episodeToken: String,
    commandID: String
  ) async throws -> RemoteHistoryGapAcknowledgeOutcome {
    try await executeMutation(target: target, capability: .sessionOperate) { api in
      try await api.richAcknowledgeRuntimeGap(
        threadID: target.threadID,
        episodeToken: episodeToken,
        commandID: commandID
      )
    }
  }

  func loadLocalRichImage(
    target: RichChatThreadTarget,
    path: String
  ) async throws -> RichChatBinaryPayload {
    try await executeRead(target: target, capability: .sessionRead) { api in
      try await api.richLocalImage(path: path)
    }
  }

  func loadRuntimeRichImage(
    target: RichChatThreadTarget,
    reference: RichRemoteImageReference
  ) async throws -> RichChatBinaryPayload {
    guard reference.threadID == target.threadID else {
      throw RichChatGatewayError.invalidRequest
    }
    return try await executeRead(target: target, capability: .sessionRead) { api in
      try await api.richRuntimeImage(reference)
    }
  }

  func listRichCheckpoints(
    target: RichChatThreadTarget,
    projectLocation: ProjectLocation
  ) async throws -> RichChatCheckpointCollection {
    try await executeRead(target: target, capability: .sessionRead) { api in
      try await api.richListCheckpoints(
        threadID: target.threadID,
        projectLocation: projectLocation
      )
    }
  }
}
