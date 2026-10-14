import Foundation

/// Projection of the older-page surface, mirrored into the transcript's
/// observable state after every paging mutation.
struct RichChatOlderPagingState: Equatable, Sendable {
  var olderCursor: Int?
  /// B4 `ct1.` older-completed-turn continuation. The affordance and the
  /// load-older action exist while either continuation remains.
  var olderTurnsCursor: String?
  var isLoadingOlder = false
  var pageFailure: RichChatControllerFailure?
}

/// Everything the paging helper needs from its owning transcript controller.
/// The controller keeps page loading (it merges into the transcript); the
/// helper owns the task, the cursors and the epoch fences.
@MainActor
protocol RichChatOlderPagingHost: AnyObject {
  /// Transcript revision captured when a page starts; a revision change
  /// (selection, reload, teardown) fences the page.
  var olderPagingRevision: UInt64 { get }
  func olderPagingGate(_ capability: RichChatCapability) -> RichChatControllerFailure?
  func olderPagingLoadItems(
    target: RichChatThreadTarget, before: Int, limit: Int, targetEntryCount: Int?
  ) async throws -> RemoteRuntimeItemsPage
  func olderPagingLoadTurns(
    target: RichChatThreadTarget, cursor: String, limit: Int
  ) async throws -> RemoteBoundedTurnsPage
  func olderPagingApplyItems(
    _ page: RemoteRuntimeItemsPage, target: RichChatThreadTarget
  ) throws
  func olderPagingApplyTurns(
    _ page: RemoteBoundedTurnsPage, target: RichChatThreadTarget
  ) throws
}

/// Owns the transcript's older-paging concern: both opaque continuations, the
/// in-flight spinner/failure, the paging epoch that fences held pages across a
/// truncate/reset that does not bump the transcript revision, and F2's
/// delivered-reset invalidation. One writer, mirrored into the controller's
/// observable state by the controller.
@MainActor
final class RichChatOlderPaging {
  private(set) var state = RichChatOlderPagingState()
  private(set) var epoch: UInt64 = 0
  private let task = RichChatControllerTaskSlot()

  var hasContinuation: Bool {
    state.olderCursor != nil || state.olderTurnsCursor != nil
  }

  /// Selection/teardown: fresh epoch, no continuation, no spinner.
  func reset() {
    epoch &+= 1
    task.cancel()
    state = RichChatOlderPagingState()
  }

  /// A fresh authoritative read starts a new page epoch: held pages are
  /// fenced and their results dropped. The spinner is released synchronously
  /// because the request that owned it may never resume.
  func beginEpoch() {
    epoch &+= 1
    task.cancel()
    state.isLoadingOlder = false
  }

  /// A delivered truncate renumbers the host's turn indices: the `ct1.`
  /// continuation is meaningless and every held page is fenced. The
  /// runtime-item cursor keeps its (still valid) position.
  func invalidateTurns() {
    epoch &+= 1
    task.cancel()
    state.olderTurnsCursor = nil
    state.isLoadingOlder = false
  }

  /// F2: a delivered reset/gap breaks continuity for both continuations and
  /// for the retained older-turn level (the caller clears it).
  func invalidateAll() {
    epoch &+= 1
    task.cancel()
    state.olderCursor = nil
    state.olderTurnsCursor = nil
    state.isLoadingOlder = false
  }

  /// Installs the authoritative read's continuations. A truncation replayed
  /// from the buffer invalidates the `ct1.` continuation the snapshot carried.
  func noteAuthoritativeTail(
    runtimeCursor: Int?,
    turnsCursor: String?,
    bufferedTruncation: Bool
  ) {
    // Only a successful authoritative read proves that an earlier offline
    // paging refusal is stale. Keep permission and other paging failures.
    if state.pageFailure == .offline { state.pageFailure = nil }
    state.olderCursor = runtimeCursor
    if bufferedTruncation {
      epoch &+= 1
      state.olderTurnsCursor = nil
    } else {
      state.olderTurnsCursor = turnsCursor
    }
  }

  func notePageFailure(_ failure: RichChatControllerFailure?) {
    state.pageFailure = failure
  }

  /// One user action advances both continuations: runtime items
  /// (`beforePosition`) when one remains, and completed turns (`ct1.`) when one
  /// remains. Either alone keeps the affordance and the action alive (an
  /// item-less transcript of completed turns still pages older turns).
  func loadOlder(
    target: RichChatThreadTarget,
    limit: Int,
    targetEntryCount: Int?,
    host: any RichChatOlderPagingHost,
    onStateChange: @escaping @MainActor () -> Void
  ) async {
    guard !state.isLoadingOlder, hasContinuation else { return }
    if let failure = host.olderPagingGate(.sessionRead) {
      state.pageFailure = failure
      onStateChange()
      return
    }
    guard (1...500).contains(limit) else {
      state.pageFailure = .invalidRequest
      onStateChange()
      return
    }
    let owner = host.olderPagingRevision
    let epoch = self.epoch
    state.isLoadingOlder = true
    state.pageFailure = nil
    onStateChange()
    task.launch { [weak self, weak host] in
      guard let self, let host else { return }
      await self.performOlderPageLoad(
        target: target,
        limit: limit,
        targetEntryCount: targetEntryCount,
        owner: owner,
        epoch: epoch,
        host: host,
        onStateChange: onStateChange
      )
    }
    await task.wait()
  }

  private func performOlderPageLoad(
    target: RichChatThreadTarget,
    limit: Int,
    targetEntryCount: Int?,
    owner: UInt64,
    epoch: UInt64,
    host: any RichChatOlderPagingHost,
    onStateChange: @escaping @MainActor () -> Void
  ) async {
    defer {
      // The spinner is released by the request that owns this surface even
      // when a truncate/reset invalidated its page: a fenced page is a dropped
      // result, not a stuck action.
      if host.olderPagingRevision == owner {
        state.isLoadingOlder = false
        onStateChange()
      }
    }
    var failure: RichChatControllerFailure?
    if let before = state.olderCursor {
      do {
        let page = try await host.olderPagingLoadItems(
          target: target, before: before, limit: limit,
          targetEntryCount: targetEntryCount
        )
        try Task.checkCancellation()
        guard owns(owner: owner, epoch: epoch, host: host) else { return }
        try host.olderPagingApplyItems(page, target: target)
        guard owns(owner: owner, epoch: epoch, host: host) else { return }
        state.olderCursor = page.nextCursor
        onStateChange()
      } catch is CancellationError {
        return
      } catch {
        failure = RichChatControllerFailure.map(error)
      }
    }
    if owns(owner: owner, epoch: epoch, host: host),
      let cursor = state.olderTurnsCursor
    {
      do {
        let page = try await host.olderPagingLoadTurns(
          target: target, cursor: cursor, limit: limit
        )
        try Task.checkCancellation()
        // Identity fence: the cursor must still be the exact continuation this
        // request was issued for, and the paging epoch must not have been
        // invalidated by a truncate/reset while the page was in flight.
        guard owns(owner: owner, epoch: epoch, host: host),
          state.olderTurnsCursor == cursor
        else { return }
        try host.olderPagingApplyTurns(page, target: target)
        guard owns(owner: owner, epoch: epoch, host: host),
          state.olderTurnsCursor == cursor
        else { return }
        state.olderTurnsCursor = page.completedTurnsNextCursor
        onStateChange()
      } catch is CancellationError {
        return
      } catch {
        failure = failure ?? RichChatControllerFailure.map(error)
      }
    }
    guard owns(owner: owner, epoch: epoch, host: host) else { return }
    state.pageFailure = failure
    onStateChange()
  }

  private func owns(
    owner: UInt64,
    epoch: UInt64,
    host: any RichChatOlderPagingHost
  ) -> Bool {
    host.olderPagingRevision == owner && self.epoch == epoch
  }
}
