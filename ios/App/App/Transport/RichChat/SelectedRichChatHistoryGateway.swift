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
