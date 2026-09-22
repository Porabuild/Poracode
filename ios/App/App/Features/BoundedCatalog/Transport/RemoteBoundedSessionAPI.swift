import Foundation

/// `RemoteAPIClientBox` conformance for the bounded-read transport surface.
/// Every method delegates to the actor; isolation, authority headers and
/// cancellation are inherited from `RemoteAPIClient`.
// MARK: - Session box

extension RemoteAPIClientBox: SessionBoundedReadAPI {
  func boundedShellSnapshot(
    order: RemoteBoundedPaintOrder,
    projectLimit: Int,
    summaries: Bool,
    maxBytes: Int,
    maxDecodeBytes: Int
  ) async throws -> RemoteBoundedReadOutcome<RemoteBoundedShellPage, RemoteShellSnapshot> {
    try await client.boundedShellSnapshot(
      order: order, projectLimit: projectLimit, summaries: summaries,
      maxBytes: maxBytes, maxDecodeBytes: maxDecodeBytes
    )
  }

  func boundedThreadPage(
    mode: RemoteBoundedReadMode,
    order: RemoteBoundedPaintOrder,
    limit: Int,
    summaries: Bool,
    cursor: String?,
    maxBytes: Int,
    maxDecodeBytes: Int
  ) async throws -> RemoteBoundedThreadPage {
    try await client.boundedThreadPage(
      mode: mode, order: order, limit: limit, summaries: summaries, cursor: cursor,
      maxBytes: maxBytes, maxDecodeBytes: maxDecodeBytes
    )
  }

  func boundedProjectListPage(
    mode: RemoteBoundedReadMode,
    limit: Int,
    cursor: String?,
    maxBytes: Int,
    maxDecodeBytes: Int
  ) async throws -> RemoteBoundedProjectPage {
    try await client.boundedProjectListPage(
      mode: mode, limit: limit, cursor: cursor,
      maxBytes: maxBytes, maxDecodeBytes: maxDecodeBytes
    )
  }

  func boundedCatalogMembership(
    threadIds: [String],
    projectIds: [String]
  ) async throws -> RemoteBoundedCatalogMembership {
    try await client.boundedCatalogMembership(threadIds: threadIds, projectIds: projectIds)
  }

  func boundedThreadHistory(
    threadId: String,
    completedTurnsLimit: Int,
    targetTimelineEntryCount: Int?,
    maxBytes: Int,
    maxDecodeBytes: Int
  ) async throws -> RemoteBoundedReadOutcome<RemoteBoundedHistoryPage, RemoteThreadSnapshot> {
    try await client.boundedThreadHistory(
      threadId: threadId, completedTurnsLimit: completedTurnsLimit,
      targetTimelineEntryCount: targetTimelineEntryCount,
      maxBytes: maxBytes, maxDecodeBytes: maxDecodeBytes
    )
  }

  func boundedHistoryItems(
    threadId: String,
    beforePosition: Int?,
    limit: Int,
    targetTimelineEntryCount: Int?,
    maxBytes: Int,
    maxDecodeBytes: Int
  ) async throws -> RemoteBoundedReadOutcome<RemoteBoundedHistoryItemsPage, RemoteRuntimeItemsPage> {
    try await client.boundedHistoryItems(
      threadId: threadId, beforePosition: beforePosition, limit: limit,
      targetTimelineEntryCount: targetTimelineEntryCount,
      maxBytes: maxBytes, maxDecodeBytes: maxDecodeBytes
    )
  }

  func boundedThreadTurns(
    threadId: String,
    cursor: String?,
    limit: Int,
    maxBytes: Int,
    maxDecodeBytes: Int
  ) async throws -> RemoteBoundedTurnsPage {
    try await client.boundedThreadTurns(
      threadId: threadId, cursor: cursor, limit: limit,
      maxBytes: maxBytes, maxDecodeBytes: maxDecodeBytes
    )
  }
}
