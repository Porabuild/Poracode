import Foundation

/// Bounded-read transport surface the session owns.
///
/// `RemoteAPIClientBox` conforms; a session API that does not implement this
/// protocol is a host without the capability surface (the legacy path). Every
/// bounded request flows through the same `requestData` funnel as every other
/// route, so C1 dual authority (environment parent header), redirect refusal,
/// timeouts, cancellation and the response byte cap are inherited unchanged.
/// No bounded call is a mutation and none sends a command id.
protocol SessionBoundedReadAPI: AnyObject, Sendable {
  /// One shell page. `.legacy` is produced only when the response omitted the
  /// `reads` echo (a genuine older host) — never assembled, never retried.
  func boundedShellSnapshot(
    order: RemoteBoundedPaintOrder,
    projectLimit: Int,
    summaries: Bool,
    maxBytes: Int,
    maxDecodeBytes: Int
  ) async throws -> RemoteBoundedReadOutcome<RemoteBoundedShellPage, RemoteShellSnapshot>

  /// One `thread-list` page. Declared-only in practice: the capability is
  /// always negotiated by the shell page 1 before any continuation runs.
  func boundedThreadPage(
    mode: RemoteBoundedReadMode,
    order: RemoteBoundedPaintOrder,
    limit: Int,
    summaries: Bool,
    cursor: String?,
    maxBytes: Int,
    maxDecodeBytes: Int
  ) async throws -> RemoteBoundedThreadPage

  /// One `project-list` page (declared-only route).
  func boundedProjectListPage(
    mode: RemoteBoundedReadMode,
    limit: Int,
    cursor: String?,
    maxBytes: Int,
    maxDecodeBytes: Int
  ) async throws -> RemoteBoundedProjectPage

  /// Authoritative membership answer for one <=200 id batch (declared-only).
  func boundedCatalogMembership(
    threadIds: [String],
    projectIds: [String]
  ) async throws -> RemoteBoundedCatalogMembership

  /// Bounded history tail: newest completed turns + `ct1.` continuation.
  func boundedThreadHistory(
    threadId: String,
    completedTurnsLimit: Int,
    targetTimelineEntryCount: Int?,
    maxBytes: Int,
    maxDecodeBytes: Int
  ) async throws -> RemoteBoundedReadOutcome<RemoteBoundedHistoryPage, RemoteThreadSnapshot>

  func boundedHistoryItems(
    threadId: String,
    beforePosition: Int?,
    limit: Int,
    targetTimelineEntryCount: Int?,
    maxBytes: Int,
    maxDecodeBytes: Int
  ) async throws -> RemoteBoundedReadOutcome<RemoteBoundedHistoryItemsPage, RemoteRuntimeItemsPage>

  /// Older completed turns (`ct1.` continuation; declared-only route).
  func boundedThreadTurns(
    threadId: String,
    cursor: String?,
    limit: Int,
    maxBytes: Int,
    maxDecodeBytes: Int
  ) async throws -> RemoteBoundedTurnsPage
}
