import Foundation

extension SelectedRichChatSessionGateway: RichChatConversationGateway {
  func sendRichInput(target: RichChatThreadTarget, input: RichChatSendInput) async throws {
    try await executeMutation(target: target, capability: .sessionOperate) { api in
      try await api.richSend(threadID: target.threadID, input: input)
    }
  }

  func interruptRichThread(target: RichChatThreadTarget) async throws {
    try await executeMutation(target: target, capability: .sessionOperate) { api in
      try await api.richInterrupt(threadID: target.threadID)
    }
  }

  func closeRichThread(target: RichChatThreadTarget) async throws {
    try await executeMutation(target: target, capability: .sessionOperate) { api in
      try await api.richCloseThread(threadID: target.threadID)
    }
  }

  func truncateRichRuntime(target: RichChatThreadTarget, after itemID: String) async throws {
    try await executeMutation(target: target, capability: .sessionOperate) { api in
      try await api.richTruncate(threadID: target.threadID, after: itemID)
    }
  }

  func runRichThreadCommand(
    target: RichChatThreadTarget,
    command: RichChatThreadCommand
  ) async throws {
    try await executeMutation(target: target, capability: .sessionOperate) { api in
      try await api.richCommand(threadID: target.threadID, command: command)
    }
  }

  func updateRichGoal(
    target: RichChatThreadTarget,
    update: RichChatGoalUpdate
  ) async throws {
    try await executeMutation(target: target, capability: .sessionOperate) { api in
      try await api.richGoal(threadID: target.threadID, update: update)
    }
  }

  func setRichSteer(
    target: RichChatThreadTarget,
    input: RichSetPendingSteerInput
  ) async throws {
    try await executeMutation(target: target, capability: .sessionOperate) { api in
      try await api.richSetSteer(threadID: target.threadID, input: input)
    }
  }

  func clearRichSteer(target: RichChatThreadTarget) async throws {
    try await executeMutation(target: target, capability: .sessionOperate) { api in
      try await api.richClearSteer(threadID: target.threadID)
    }
  }

  func uploadRichAttachment(
    target: RichChatThreadTarget,
    attachment: RichChatAttachment
  ) async throws -> String {
    try await executeMutation(target: target, capability: .sessionOperate) { api in
      try await api.richUploadAttachment(
        threadID: target.threadID,
        attachment: attachment
      )
    }
  }

  func stageRichInput(
    target: RichChatThreadTarget,
    prompt: String,
    segments: [RichPromptSegment]?
  ) async throws {
    try await executeMutation(target: target, capability: .sessionOperate) { api in
      try await api.richStageInput(
        threadID: target.threadID,
        prompt: prompt,
        segments: segments
      )
    }
  }

  func rollbackRichConversation(
    target: RichChatThreadTarget,
    turnCount: Int,
    config: [String: RichJSON]?
  ) async throws {
    try await executeMutation(target: target, capability: .sessionOperate) { api in
      try await api.richRollback(
        threadID: target.threadID,
        turnCount: turnCount,
        config: config
      )
    }
  }

  func createRichCheckpoint(
    target: RichChatThreadTarget,
    itemID: String,
    projectLocation: ProjectLocation
  ) async throws -> RichCheckpoint {
    try await executeMutation(target: target, capability: .sessionOperate) { api in
      try await api.richCreateCheckpoint(
        threadID: target.threadID,
        itemID: itemID,
        projectLocation: projectLocation
      )
    }
  }

  func finalizeRichCheckpoint(
    target: RichChatThreadTarget,
    itemID: String,
    baseItemID: String,
    projectLocation: ProjectLocation
  ) async throws -> RichCheckpoint {
    try await executeMutation(target: target, capability: .sessionOperate) { api in
      try await api.richFinalizeCheckpoint(
        threadID: target.threadID,
        itemID: itemID,
        baseItemID: baseItemID,
        projectLocation: projectLocation
      )
    }
  }

  func restoreRichCheckpoint(
    target: RichChatThreadTarget,
    itemID: String,
    projectLocation: ProjectLocation
  ) async throws {
    try await executeMutation(target: target, capability: .sessionOperate) { api in
      try await api.richRestoreCheckpoint(
        threadID: target.threadID,
        itemID: itemID,
        projectLocation: projectLocation
      )
    }
  }
}
