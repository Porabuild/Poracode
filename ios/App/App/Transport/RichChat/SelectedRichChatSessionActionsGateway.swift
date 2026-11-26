import Foundation

extension SelectedRichChatSessionGateway: RichChatSessionActionsGateway {
  func listRichSessionActions(target: RichChatThreadTarget) async throws -> [String] {
    try await executeRead(target: target, capability: .sessionRead) { api in
      try await api.richListSessionActions(threadID: target.threadID)
    }
  }

  func invokeRichSessionAction(
    target: RichChatThreadTarget,
    actionID: String,
    payload: [String: RichJSON]
  ) async throws -> [String: RichJSON] {
    try await executeMutation(target: target, capability: .sessionOperate) { api in
      try await api.richInvokeSessionAction(
        threadID: target.threadID,
        actionID: actionID,
        payload: payload
      )
    }
  }
}

extension SelectedRichChatSessionGateway: RichChatDelegatedWatchGateway {
  func subscribeRichDelegatedAgent(
    target: RichChatThreadTarget,
    parentItemID: String,
    viewerID: String
  ) async throws -> RichChatDelegatedWatchResult {
    try await executeRead(target: target, capability: .sessionRead) { api in
      try await api.richSubagentSubscribe(
        threadID: target.threadID, parentItemID: parentItemID, viewerID: viewerID)
    }
  }

  func unsubscribeRichDelegatedAgent(
    target: RichChatThreadTarget,
    parentItemID: String,
    viewerID: String
  ) async throws {
    try await executeMutation(target: target, capability: .sessionRead) { api in
      try await api.richSubagentUnsubscribe(
        threadID: target.threadID, parentItemID: parentItemID, viewerID: viewerID)
    }
  }
}
