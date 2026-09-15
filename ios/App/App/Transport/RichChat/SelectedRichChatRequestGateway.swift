import Foundation

extension SelectedRichChatSessionGateway: RichChatRequestGateway {
  func resolveRichRequest(
    target: RichChatThreadTarget,
    resolution: RichChatRequestResolution
  ) async throws {
    try await executeMutation(target: target, capability: .requestsResolve) { api in
      try await api.richResolveRequest(
        threadID: target.threadID,
        resolution: resolution
      )
    }
  }
}
