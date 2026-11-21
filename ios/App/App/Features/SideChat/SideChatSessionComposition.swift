import Foundation

extension AppSession {
  func sideChatTurnContext(target: RichChatThreadTarget) async throws -> TurnClientContext? {
    try await sideChats.capture(for: target, session: self)
  }

  func prepareSideChatStart(target: ThreadLifecycleTarget, request: ThreadStartExistingRequest, commandID: String) async throws -> ThreadStartExistingRequest {
    var prepared = request
    guard let access = currentRichChatAccess, access.lease.connectionID == target.lease.identity.clientConnectionID,
      access.lease.generation == target.lease.generation else { throw SideChatContextFailure.staleHost }
    if let context = try await sideChatTurnContext(target: .init(lease: access.lease, threadID: target.threadID)) {
      prepared.clientContext = context
    }
    return prepared
  }

  func prepareSideChatRelaunch(target: ThreadLifecycleTarget, request: ThreadRelaunchRequest, commandID: String) async throws -> ThreadRelaunchRequest {
    try await sideChats.prepare(request, target: target, commandID: commandID, session: self)
  }

  func makeSideChatContextGateway() -> SelectedSideChatContextGateway {
    SelectedSideChatContextGateway { @MainActor [weak self] in
      guard let self, let access = self.currentRichChatAccess,
        let api = self.state.api, let bounded = api as? any SessionBoundedReadAPI else { return nil }
      return SideChatContextSelection(access: access,
        environment: { try await api.environment() },
        page: { threadID, before in
          try await bounded.boundedHistoryItems(threadId: threadID, beforePosition: before,
            limit: 500, targetTimelineEntryCount: nil,
            maxBytes: RemoteBoundedReads.defaultMaxWireBytes,
            maxDecodeBytes: RemoteBoundedReads.defaultMaxDecodeBytes)
        }, membership: { ids in
          try await bounded.boundedCatalogMembership(threadIds: ids, projectIds: []).existingThreadIds
        })
    }
  }
}
