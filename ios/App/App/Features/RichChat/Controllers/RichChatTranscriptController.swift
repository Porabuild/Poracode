import Foundation
import Observation

enum RichChatTranscriptLoadState: Equatable, Sendable {
  case idle
  case loading
  case loaded
  case empty
  case failed(RichChatControllerFailure)
}

/// WS7 P1-19: one projection per transcript value. The timeline is read
/// several times per view update; `RichTimeline.project` is O(items) and
/// JSON-decodes payloads, so recompute only when the transcript changed.
struct RichTimelineProjectionCache {
  private(set) var transcript: RichTranscriptState?
  private(set) var projection: RichTimelineProjection?

  init() {}

  mutating func projection(for transcript: RichTranscriptState?) -> RichTimelineProjection? {
    if transcript != self.transcript {
      self.transcript = transcript
      projection = transcript.map { RichTimeline.project($0.itemsInOrder) }
    }
    return projection
  }
}

struct RichChatTranscriptControllerState: Equatable, Sendable {
  var access: RichChatSessionAccess?
  var target: RichChatThreadTarget?
  var transcript: RichTranscriptState?
  var completedTurns: [RichCompletedTurn] = []
  var contextUsage: RichContextUsage?
  var pendingSteer: RichPendingSteer?
  var followUpQueue: RichFollowUpQueue?
  var terminalScrollback: String?
  /// Mirrored from `RichChatOlderPaging` (the single writer): both opaque
  /// continuations, the spinner and the last page failure.
  var olderCursor: Int?
  var olderTurnsCursor: String?
  var snapshotSequence: Int?
  var liveSequence: Int = -1
  var loadState: RichChatTranscriptLoadState = .idle
  var requiresAuthoritativeRefresh = false
  var isLoadingOlder = false
  var pageFailure: RichChatControllerFailure?

  var timeline: RichTimelineProjection? {
    transcript.map { RichTimeline.project($0.itemsInOrder) }
  }

  func displayedCompletedTurns(in projection: RichTimelineProjection?) -> [RichCompletedTurn] {
    guard !completedTurns.isEmpty, let projection else { return completedTurns }
    return RichTimeline.resolveCompletedTurnAnchors(completedTurns, in: projection)
  }
}

private struct RichChatBufferedRuntimeBatch: Sendable {
  let sequence: Int
  let events: [RichRuntimeEvent]
  /// Wire timestamp used when applying the batch to the transcript.
  let receivedAtMilliseconds: Int64
  /// Monotonic arrival used only for the retained-age budget; shares its base
  /// with `clock` and `RecoveryClock`.
  let arrivalMonotonicMilliseconds: Int64
  let byteCount: Int
}

/// Owns one selected host/thread transcript. History is installed authoritatively and
/// only newer, uniquely-sequenced live batches are replayed over it.
@MainActor
@Observable
final class RichChatTranscriptController {
  private(set) var state = RichChatTranscriptControllerState()
  private var projectionCache = RichTimelineProjectionCache()

  /// Memoized over `state.transcript`; read this instead of `state.timeline`
  /// so repeated reads within one update never re-project.
  var timeline: RichTimelineProjection? {
    projectionCache.projection(for: state.transcript)
  }

  /// Retained history-read batches (accounting; exposed for tests). B6/F-D1:
  /// every terminal path of a history read releases the window, so this is
  /// nonzero only while an authoritative read is actually in flight.
  var retainedHistoryBatchCount: Int { bufferedBatches.count }

  private let gateway: any RichChatHistoryGateway
  private let refreshRequester: any RichChatAuthoritativeRefreshRequesting
  /// B1: authoritative notices observed by this controller are projected to
  /// their own owner (retention, descriptor read, acknowledgement). Nil in
  /// tests that construct the transcript alone.
  private weak var noticeProjection: (any RichChatNoticeProjecting)?
  /// Monotonic clock for retained-age accounting (never wall-clock).
  private let clock: () -> Int64
  private let refreshTask = RichChatControllerTaskSlot()
  private let historyTask = RichChatControllerTaskSlot()
  /// Owns older-paging state, task and epoch fences; the controller mirrors it
  /// into `state` after every paging mutation (`syncOlderPagingState`).
  private let olderPaging = RichChatOlderPaging()
  private var revision: UInt64 = 0
  /// Monotonic count of raised authoritative-refresh demands. The refresh loop
  /// compares it around its request so a demand raised while the request was
  /// awaiting (e.g. a delivered replacement fencing the request's own read)
  /// gets its own bounded attempt instead of being lost.
  private var refreshDemandRevision: UInt64 = 0
  private var isBackgrounded = false
  private var bufferedBatches: [RichChatBufferedRuntimeBatch] = []
  private var bufferedSequences: Set<Int> = []
  /// Count/byte/age accounting for `bufferedBatches`; any eviction loses
  /// replay coverage and forces the same authoritative refresh as a merge-time
  /// catchup (WS7 P1-14).
  private var bufferedBatchLedger: RecoveryBufferLedger
  /// Queue broadcasts are replace-on-event and sequence-tagged by the host
  /// session; ones arriving mid-history-read record in a single replacement
  /// slot and replay over the installed snapshot (only a sequence newer than
  /// it), mirroring the batch buffer's baseline rule. B6: one retained state,
  /// not an append-all list, so queue churn cannot grow recovery memory.
  private var followUpQueueReplay = RichChatFollowUpQueueReplaySlot()
  /// A cap drop while buffering lost replay coverage; must survive until the
  /// history install folds it into `requiresAuthoritativeRefresh` (WS7 P1-14).
  private var bufferOverflowed = false

  init(
    gateway: any RichChatHistoryGateway,
    refreshRequester: any RichChatAuthoritativeRefreshRequesting = RichChatNoopRefreshRequester(),
    transcriptBatchBudget: RecoveryBufferBudget = .transcriptBatches,
    noticeProjection: (any RichChatNoticeProjecting)? = nil,
    clock: @escaping () -> Int64 = { RecoveryClock.nowMilliseconds() }
  ) {
    self.gateway = gateway
    self.refreshRequester = refreshRequester
    self.noticeProjection = noticeProjection
    self.clock = clock
    bufferedBatchLedger = RecoveryBufferLedger(budget: transcriptBatchBudget)
  }

  func activate(access: RichChatSessionAccess, threadID: String) {
    revision &+= 1
    refreshTask.cancel()
    historyTask.cancel()
    olderPaging.reset()
    bufferedBatches.removeAll(keepingCapacity: true)
    bufferedSequences.removeAll(keepingCapacity: true)
    bufferedBatchLedger.reset()
    followUpQueueReplay.reset()
    bufferOverflowed = false
    isBackgrounded = false
    let target = RichChatThreadTarget(lease: access.lease, threadID: threadID)
    state = RichChatTranscriptControllerState(
      access: access,
      target: target,
      transcript: RichTranscriptState(threadID: threadID)
    )
    syncOlderPagingState()
  }

  func updateAccess(_ access: RichChatSessionAccess) {
    guard state.target?.lease == access.lease else {
      deactivate()
      return
    }
    state.access = access
  }

  func deactivate() {
    revision &+= 1
    refreshTask.cancel()
    historyTask.cancel()
    olderPaging.reset()
    bufferedBatches.removeAll(keepingCapacity: false)
    bufferedSequences.removeAll(keepingCapacity: false)
    bufferedBatchLedger.reset()
    followUpQueueReplay.reset()
    bufferOverflowed = false
    isBackgrounded = false
    state = RichChatTranscriptControllerState()
  }

  func enterBackground() {
    revision &+= 1
    refreshTask.cancel()
    isBackgrounded = true
    historyTask.cancel()
    olderPaging.beginEpoch()
    bufferedBatches.removeAll(keepingCapacity: false)
    bufferedSequences.removeAll(keepingCapacity: false)
    bufferedBatchLedger.reset()
    followUpQueueReplay.reset()
    bufferOverflowed = false
    syncOlderPagingState()
    if state.loadState == .loading { state.loadState = .idle }
  }

  func leaveBackground(access: RichChatSessionAccess) {
    guard state.target?.lease == access.lease else { return }
    state.access = access
    isBackgrounded = false
  }

  func loadHistory(targetEntryCount: Int? = 40) async {
    guard let target = state.target, let access = state.access else { return }
    if let failure = access.controllerGate(.sessionRead) {
      state.loadState = .failed(failure)
      return
    }
    revision &+= 1
    let owner = revision
    olderPaging.beginEpoch()
    syncOlderPagingState()
    bufferedBatches.removeAll(keepingCapacity: true)
    bufferedSequences.removeAll(keepingCapacity: true)
    bufferedBatchLedger.reset()
    followUpQueueReplay.reset()
    bufferOverflowed = false
    state.loadState = .loading
    historyTask.launch { [weak self] in
      await self?.performHistoryLoad(
        target: target,
        targetEntryCount: targetEntryCount,
        owner: owner
      )
    }
    await historyTask.wait()
  }

  /// One user action advances both older continuations; owned by
  /// `RichChatOlderPaging` (epoch/task/cursor fences) with page loading and
  /// transcript merging supplied by this controller.
  func loadOlder(limit: Int = 100, targetEntryCount: Int? = 40) async {
    guard let target = state.target, state.access != nil else { return }
    await olderPaging.loadOlder(
      target: target,
      limit: limit,
      targetEntryCount: targetEntryCount,
      host: self,
      onStateChange: { [weak self] in self?.syncOlderPagingState() }
    )
    syncOlderPagingState()
  }

  /// Drops the completed-turn continuation and fences any in-flight older page.
  /// Called by an applied live `runtime.truncated` frame: the host renumbered
  /// the turn indices, so a held cursor is no longer meaningful. A subsequent
  /// authoritative tail read restores a fresh cursor through the tail field.
  func invalidateOlderTurns() {
    olderPaging.invalidateTurns()
    syncOlderPagingState()
  }

  /// F2: a delivered reset/gap/recovery replaced the host's runtime, so the
  /// retained older-turn level and both continuations are no longer provable.
  /// Fences held pages through the paging owner, clears the untrustworthy
  /// level, and fences any in-flight authoritative history read: a payload
  /// served before the delivered replacement must never install after it
  /// (F2-L). `requiresRefresh` then demands one authoritative read through the
  /// existing requester regardless of `loadState` — the fenced read cannot
  /// install, so the fresh read is the only baseline.
  func invalidateForDeliveredReplacement(requiresRefresh: Bool) {
    olderPaging.invalidateAll()
    syncOlderPagingState()
    state.completedTurns.removeAll(keepingCapacity: true)
    // A delivered replacement fences the in-flight read even when the caller
    // (the resync engine) supplies its own follow-up refresh: the held payload
    // was served before the replacement and its commit must not win.
    revision &+= 1
    historyTask.cancel()
    releaseRetainedHistoryRead()
    if state.loadState == .loading { state.loadState = .idle }
    guard requiresRefresh, !isBackgrounded else { return }
    demandAuthoritativeRefresh()
    scheduleAuthoritativeRefresh()
  }

  func receiveLiveEvents(
    _ events: [RichRuntimeEvent],
    sequence: Int,
    receivedAtMilliseconds: Int64 = 0,
    target: RichChatThreadTarget
  ) {
    guard !isBackgrounded, target == state.target, sequence >= 0,
      events.allSatisfy({ $0.threadID == target.threadID })
    else { return }
    if state.loadState == .loading {
      guard bufferedSequences.insert(sequence).inserted else { return }
      let monotonicNow = clock()
      let arrivalMilliseconds =
        receivedAtMilliseconds > 0 ? receivedAtMilliseconds : monotonicNow
      let batch = RichChatBufferedRuntimeBatch(
        sequence: sequence,
        events: events,
        receivedAtMilliseconds: arrivalMilliseconds,
        arrivalMonotonicMilliseconds: monotonicNow,
        byteCount: events.reduce(0) { $0 + $1.recoveryByteCount }
      )
      bufferedBatches.append(batch)
      bufferedBatchLedger.recordRetained(bytes: batch.byteCount)
      // WS7 P1-14: count/byte/retained-age bounds over the history-load
      // buffer. Dropping the oldest batch loses replay coverage, so the flag
      // drives the same authoritative refresh that a merge-time catchup would;
      // a single oversized batch is never retained.
      var evicted = false
      while let head = bufferedBatches.first,
        bufferedBatchLedger.mustEvictHead(
          retainedCount: bufferedBatches.count,
          oldestArrivalMilliseconds: head.arrivalMonotonicMilliseconds,
          nowMilliseconds: monotonicNow
        )
      {
        let dropped = bufferedBatches.removeFirst()
        bufferedSequences.remove(dropped.sequence)
        bufferedBatchLedger.recordDropped(bytes: dropped.byteCount)
        evicted = true
      }
      if evicted {
        bufferOverflowed = true
        demandAuthoritativeRefresh()
      }
      return
    }
    guard sequence > state.liveSequence else { return }
    let alreadyRequiresRefresh = state.requiresAuthoritativeRefresh
    apply(events, receivedAtMilliseconds: receivedAtMilliseconds)
    state.liveSequence = sequence
    if state.requiresAuthoritativeRefresh && !alreadyRequiresRefresh {
      scheduleAuthoritativeRefresh()
    }
  }

  func receivePendingSteer(
    _ envelope: RichPendingSteerEnvelope,
    target: RichChatThreadTarget
  ) {
    guard !isBackgrounded, target == state.target else { return }
    var pending = RichPendingSteerState(threadID: target.threadID, pending: state.pendingSteer)
    pending.apply(envelope)
    state.pendingSteer = pending.pending
  }

  /// Replace-on-event for the selected thread's queue. While a history read is
  /// in flight the broadcast records into a single newest-state slot, then
  /// replays over the installed snapshot only when its sequence is newer (same
  /// baseline rule as batches).
  func receiveFollowUpQueue(
    _ envelope: RichFollowUpQueueEnvelope,
    sequence: Int,
    target: RichChatThreadTarget
  ) {
    guard !isBackgrounded, target == state.target else { return }
    switch RemoteFollowUpQueueReduce.action(
      sameThread: envelope.threadID == target.threadID,
      queueKeyPresent: true,
      queueIsNull: envelope.queue == nil
    ) {
    case .ignore:
      return
    case .clear, .replace:
      if state.loadState == .loading {
        followUpQueueReplay.record(envelope, sequence: sequence, target: target)
        return
      }
      state.followUpQueue = envelope.queue
    }
  }

  private func performHistoryLoad(
    target: RichChatThreadTarget,
    targetEntryCount: Int?,
    owner: UInt64
  ) async {
    do {
      let history = try await gateway.loadRichHistory(
        target: target,
        targetEntryCount: targetEntryCount
      )
      try Task.checkCancellation()
      let items = try RichChatRemoteModelBridge.items(history.runtimeItems)
      var turns = try RichChatRemoteModelBridge.completedTurns(history.completedTurns)
      let context = try RichChatRemoteModelBridge.contextUsage(history.contextUsage)
      // F-D1: a completed read whose snapshot names another thread is a host
      // contract violation. Failing silently would strand `.loading` (and the
      // retained buffer) with no read in flight and no recovery path, so it
      // takes the same terminal path as any other read failure.
      guard owns(target: target, revision: owner) else { return }
      guard history.thread.id == target.threadID else {
        state.loadState = .failed(.invalidResponse)
        noticeProjection?.noticeProjectionReadFailed(.invalidResponse)
        releaseRetainedHistoryRead()
        return
      }
      var transcript = RichTranscriptState(threadID: target.threadID, items: items)
      // A snapshot carries no open-turn fact (only completed turns persist), so
      // `history.thread.status` is the authoritative baseline for a mid-turn
      // install. Seed it BEFORE replaying newer buffered batches so a buffered
      // `turn.completed`/`turn.started` newer than the snapshot wins. Mirrors
      // the web snapshot arbitration (`isThreadTurnActive` +
      // `syncRuntimeTurnBoundaryFromSnapshot`).
      transcript.apply(
        Self.baselineTurnEvent(status: history.thread.status, threadID: target.threadID)
      )
      var needsCatchup = false
      var mergedContext = context
      var liveSequence = history.snapshotSeq
      // Queue install is tri-state: absent field = the supervisor read failed,
      // so preserve the projected queue (never silently clear the strip);
      // explicit null clears; an object installs. A buffered replacement state
      // newer than the snapshot then wins, so a replace during the read always
      // beats the failed/older snapshot value.
      var installedQueue = state.followUpQueue
      if history.followUpQueuePresent {
        installedQueue = try history.followUpQueue.map { rawQueue in
          try RichFollowUpQueueDecoder.decodeQueue(try RichChatRemoteModelBridge.json(rawQueue))
        }
      }
      installedQueue = followUpQueueReplay.replay(
        over: installedQueue,
        snapshotSequence: history.snapshotSeq,
        target: target
      )
      // Retained age is evaluated again at commit: a history read that
      // outlived the budget releases its payload and demands the same
      // authoritative refresh as any other coverage loss instead of replaying
      // an arbitrarily stale batch (WS7 P1-14).
      let commitNow = clock()
      var expired = false
      while let head = bufferedBatches.first,
        bufferedBatchLedger.isExpired(
          arrivalMilliseconds: head.arrivalMonotonicMilliseconds,
          nowMilliseconds: commitNow
        )
      {
        let dropped = bufferedBatches.removeFirst()
        bufferedSequences.remove(dropped.sequence)
        bufferedBatchLedger.recordDropped(bytes: dropped.byteCount)
        expired = true
      }
      if expired { bufferOverflowed = true }
      var bufferedTruncation = false
      for batch in bufferedBatches.sorted(by: { $0.sequence < $1.sequence })
      where batch.sequence > history.snapshotSeq {
        bufferedTruncation =
          Self.containsRuntimeTruncation(batch.events, threadID: target.threadID)
          || bufferedTruncation
        needsCatchup =
          Self.applyEvents(
            batch.events, to: &transcript, turns: &turns,
            receivedAtMilliseconds: batch.receivedAtMilliseconds
          ) || needsCatchup
        mergedContext = Self.mergeContextUsage(
          batch.events,
          threadID: target.threadID,
          into: mergedContext
        )
        liveSequence = max(liveSequence, batch.sequence)
      }
      state.transcript = transcript
      // B1: an authoritative snapshot's notice (absent never clears the
      // retained one) is projected to its own owner before any transcript
      // write is observable.
      noticeProjection?.noticeProjectionSnapshotNotice(history.runtimeNotice)
      // F2: an authoritative COMPLETE tail (no continuation) is the host's
      // full remaining turn set and replaces the retained level, so a turn the
      // host removed cannot survive a reload. A partial tail cannot prove
      // which loaded older turns remain, so it merges by `(startedAt, endedAt)`
      // identity and keeps the proven older pages.
      if history.completedTurnsNextCursor == nil {
        state.completedTurns = CompletedTurnsMerge.replaceTail(tail: turns)
      } else {
        state.completedTurns = CompletedTurnsMerge.mergeTail(
          existing: state.completedTurns, tail: turns
        )
      }
      state.contextUsage = mergedContext
      state.followUpQueue = installedQueue
      state.terminalScrollback = history.terminalScrollback
      // A truncation replayed from the buffer invalidates the cursor the
      // snapshot carried: no continuation until a fresh authoritative tail.
      olderPaging.noteAuthoritativeTail(
        runtimeCursor: history.runtimeNextCursor,
        turnsCursor: history.completedTurnsNextCursor,
        bufferedTruncation: bufferedTruncation
      )
      syncOlderPagingState()
      state.snapshotSequence = history.snapshotSeq
      state.liveSequence = liveSequence
      // An item-less transcript of completed turns is a loaded transcript: the
      // timeline (and its older-turn action) must render, not the empty state.
      state.loadState =
        transcript.itemsInOrder.isEmpty && state.completedTurns.isEmpty ? .empty : .loaded
      if needsCatchup || bufferOverflowed {
        demandAuthoritativeRefresh()
      } else {
        state.requiresAuthoritativeRefresh = false
      }
      releaseRetainedHistoryRead()
      if state.requiresAuthoritativeRefresh { scheduleAuthoritativeRefresh() }
    } catch is CancellationError {
      // F-D2: an owner-valid cancellation (caller teardown or a gateway
      // `requireCurrent` after the socket dropped) ends the read, so it must
      // release the retained window exactly like the generic error path
      // instead of leaving batches and ledger open with no read in flight.
      guard owns(target: target, revision: owner) else { return }
      state.loadState = .idle
      releaseRetainedHistoryRead()
    } catch {
      guard owns(target: target, revision: owner) else { return }
      let failure = RichChatControllerFailure.map(error)
      state.loadState = .failed(failure)
      // B1: only a retryable host refusal can be a durable gap; the notice
      // owner decides whether the capability-gated descriptor read is allowed.
      noticeProjection?.noticeProjectionReadFailed(failure)
      releaseRetainedHistoryRead()
    }
  }

  /// Releases every payload retained for the in-flight history read. Called on
  /// commit and on every terminal path (failure, cancellation, wrong-thread
  /// response) so the rewrite window never outlives its read; a later
  /// `loadHistory` clears again before opening a fresh window.
  private func releaseRetainedHistoryRead() {
    bufferedBatches.removeAll(keepingCapacity: false)
    bufferedSequences.removeAll(keepingCapacity: false)
    bufferedBatchLedger.reset()
    followUpQueueReplay.reset()
    bufferOverflowed = false
  }

  /// Mirrors the paging helper's single-writer state into the observable
  /// projection. Called after every mutation of `olderPaging` (including from
  /// the helper's own completion paths).
  private func syncOlderPagingState() {
    state.olderCursor = olderPaging.state.olderCursor
    state.olderTurnsCursor = olderPaging.state.olderTurnsCursor
    state.isLoadingOlder = olderPaging.state.isLoadingOlder
    state.pageFailure = olderPaging.state.pageFailure
  }

  private func apply(_ events: [RichRuntimeEvent], receivedAtMilliseconds: Int64) {
    guard var transcript = state.transcript else { return }
    if Self.containsRuntimeTruncation(events, threadID: transcript.threadID) {
      // A live truncation renumbers the host's turn indices: the held cursor is
      // no longer meaningful and any older page in flight is fenced.
      invalidateOlderTurns()
    }
    var turns = state.completedTurns
    let needsCatchup = Self.applyEvents(
      events, to: &transcript, turns: &turns,
      receivedAtMilliseconds: receivedAtMilliseconds
    )
    state.completedTurns = turns
    if needsCatchup { demandAuthoritativeRefresh() }
    state.transcript = transcript
    state.contextUsage = Self.mergeContextUsage(
      events,
      threadID: transcript.threadID,
      into: state.contextUsage
    )
  }

  /// True when the batch contains an applied `runtime.truncated` for this
  /// thread (the reducer event carries the thread id).
  private static func containsRuntimeTruncation(
    _ events: [RichRuntimeEvent],
    threadID: String
  ) -> Bool {
    events.contains { event in
      if case .runtimeTruncated(let eventThreadID, _, _) = event {
        return eventThreadID == threadID
      }
      return false
    }
  }

  private static func applyEvents(
    _ events: [RichRuntimeEvent],
    to transcript: inout RichTranscriptState,
    turns: inout [RichCompletedTurn],
    receivedAtMilliseconds: Int64
  ) -> Bool {
    var needsCatchup = false
    for event in events {
      if case .runtimeTruncated(_, let itemID, let anchors) = event {
        needsCatchup = needsCatchup || transcript.itemsByID[itemID] == nil
        let removed = Set(anchors)
        turns.removeAll { turn in
          turn.anchorItemID.map { removed.contains($0) } ?? false
        }
      }
      transcript.apply(event, receivedAtMilliseconds: receivedAtMilliseconds)
    }
    return needsCatchup
  }

  /// Raises the authoritative-refresh demand and advances its monotonic
  /// revision so a refresh already awaiting a request can observe it.
  private func demandAuthoritativeRefresh() {
    state.requiresAuthoritativeRefresh = true
    refreshDemandRevision &+= 1
  }

  private func scheduleAuthoritativeRefresh() {
    guard !refreshTask.isRunning, !isBackgrounded,
      let target = state.target, state.requiresAuthoritativeRefresh
    else { return }
    refreshTask.launch { [weak self] in
      guard let self else { return }
      for _ in 0..<3 {
        guard !Task.isCancelled, self.state.target == target,
          !self.isBackgrounded, self.state.requiresAuthoritativeRefresh
        else { return }
        let previousSnapshot = self.state.snapshotSequence
        let previousDemand = self.refreshDemandRevision
        await self.refreshRequester.requestRichChatRefresh(
          target: target, reason: .transcriptInvalidated)
        // A new installed baseline continues only while it still needs
        // catchup. A request that installed nothing may continue when a newer
        // delivered replacement raised a fresh demand while it awaited (its
        // own read was fenced); failed/no-op requesters must not retry.
        if self.state.snapshotSequence != previousSnapshot { continue }
        guard self.state.requiresAuthoritativeRefresh,
          self.refreshDemandRevision != previousDemand
        else { return }
      }
    }
  }

  /// Whether a snapshot's `thread.status` implies a live turn: running
  /// (`launching`/`working`) or blocked on the user (`needs_approval`/
  /// `needs_reply`). Same domain as the host's `isThreadTurnActive`
  /// (`src/shared/contracts/common.ts`); every other status (`idle`,
  /// `finished`, `error`, `inactive`, …) authoritatively closes the marker.
  private static func isTurnActiveStatus(_ status: String) -> Bool {
    status == "launching" || status == "working"
      || status == "needs_approval" || status == "needs_reply"
  }

  /// Synthetic reducer input pinning `openTurn` to the status baseline without
  /// touching transcript items (`.completed` never prunes trailing reasoning).
  private static func baselineTurnEvent(status: String, threadID: String) -> RichRuntimeEvent {
    if isTurnActiveStatus(status) {
      return .turnStarted(threadID: threadID, turnID: "history-baseline")
    }
    return .turnCompleted(threadID: threadID, turnID: "history-baseline", state: .completed)
  }

  /// Shallow-merges every `context.updated` report for this exact thread in wire
  /// order. Events for other threads cannot touch the selected thread's context.
  private static func mergeContextUsage(
    _ events: [RichRuntimeEvent],
    threadID: String,
    into previous: RichContextUsage?
  ) -> RichContextUsage? {
    var context = previous
    for event in events {
      guard case .contextUpdated(let eventThreadID, let usage) = event,
        eventThreadID == threadID
      else { continue }
      context = usage.merged(onto: context)
    }
    return context
  }

  private func owns(target: RichChatThreadTarget, revision: UInt64) -> Bool {
    richChatOwns(
      target: target,
      revision: revision,
      currentTarget: state.target,
      currentRevision: self.revision,
      isBackgrounded: isBackgrounded
    )
  }
}

// MARK: - Older paging host

extension RichChatTranscriptController: RichChatOlderPagingHost {
  var olderPagingRevision: UInt64 { revision }

  func olderPagingGate(_ capability: RichChatCapability) -> RichChatControllerFailure? {
    state.access?.controllerGate(capability)
  }

  func olderPagingLoadItems(
    target: RichChatThreadTarget,
    before: Int,
    limit: Int,
    targetEntryCount: Int?
  ) async throws -> RemoteRuntimeItemsPage {
    try await gateway.loadRichHistoryPage(
      target: target,
      beforePosition: before,
      limit: limit,
      targetEntryCount: targetEntryCount
    )
  }

  func olderPagingLoadTurns(
    target: RichChatThreadTarget,
    cursor: String,
    limit: Int
  ) async throws -> RemoteBoundedTurnsPage {
    try await gateway.loadRichTurns(
      target: target,
      cursor: cursor,
      limit: RemoteBoundedReads.defaultCompletedTurnsLimit
    )
  }

  /// Prepends the older page over the loaded items, preserving open requests
  /// and the open-turn marker exactly as the pre-extraction path did.
  func olderPagingApplyItems(
    _ page: RemoteRuntimeItemsPage,
    target: RichChatThreadTarget
  ) throws {
    // B1: an item page may carry the notice; absence never clears it, and an
    // unacknowledged gap makes the page route refuse instead.
    noticeProjection?.noticeProjectionItemPageNotice(page.runtimeNotice)
    let older = try RichChatRemoteModelBridge.items(page.items)
    guard let current = state.transcript else { return }
    var seen: Set<String> = []
    let merged = (older + current.itemsInOrder).filter { seen.insert($0.id).inserted }
    var transcript = RichTranscriptState(threadID: target.threadID, items: merged)
    for request in current.openRequests {
      transcript.apply(
        .requestOpened(
          threadID: target.threadID,
          requestID: request.requestID,
          requestType: request.type,
          payload: request.payload
        ),
        receivedAtMilliseconds: request.receivedAtMilliseconds
      )
    }
    if current.openTurn == true {
      transcript.apply(.turnStarted(threadID: target.threadID, turnID: "page-preserved"))
    }
    state.transcript = transcript
    if !merged.isEmpty { state.loadState = .loaded }
  }

  func olderPagingApplyTurns(
    _ page: RemoteBoundedTurnsPage,
    target _: RichChatThreadTarget
  ) throws {
    let older = try CompletedTurnsMerge.decode(page.turns)
    state.completedTurns = CompletedTurnsMerge.mergeOlder(
      existing: state.completedTurns, older: older
    )
    if state.loadState == .empty && !state.completedTurns.isEmpty {
      state.loadState = .loaded
    }
  }
}
