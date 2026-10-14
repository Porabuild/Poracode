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
