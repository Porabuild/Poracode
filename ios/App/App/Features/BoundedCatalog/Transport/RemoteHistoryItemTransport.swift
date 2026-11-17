import Foundation

extension RemoteAPIClient {
  func threadHistoryItem(threadID: String, itemID: String) async throws -> PersistedRuntimeItem {
    let request = try GeneratedRemoteV3Contract.historyItemRequest(threadID: threadID, itemID: itemID)
    // A body read needs the live authority fence, not another disk-cache read.
    let context = try await beginRecentHistoryRead(threadID: threadID, includeCandidate: false)
    let data = try await requestData(path: request.path, queryItems: request.query)
    let item = try GeneratedRemoteV3Contract.historyItemResponse(data)
    guard item.id == itemID else { throw RemoteClientError.invalidResponse("History detail response names another item.") }
    try await validateRecentHistoryRead(context)
    return item
  }
}
