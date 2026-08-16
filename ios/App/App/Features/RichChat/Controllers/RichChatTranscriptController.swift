import Foundation
import Observation

enum RichChatTranscriptLoadState: Equatable, Sendable {
  case idle
  case loading
  case loaded
  case empty
  case failed(RichChatControllerFailure)
}

struct RichChatTranscriptControllerState: Equatable, Sendable {
  var access: RichChatSessionAccess?
  var target: RichChatThreadTarget?
  var transcript: RichTranscriptState?
  var completedTurns: [RichCompletedTurn] = []
  var contextUsage: RichContextUsage?
  var pendingSteer: RichPendingSteer?
  var terminalScrollback: String?
  var olderCursor: Int?
  var snapshotSequence: Int?
  var liveSequence: Int = -1
  var loadState: RichChatTranscriptLoadState = .idle
  var isLoadingOlder = false
  var pageFailure: RichChatControllerFailure?

  var timeline: RichTimelineProjection? {
    transcript.map { RichTimeline.project($0.itemsInOrder) }
  }
}

private struct RichChatBufferedRuntimeBatch: Sendable {
  let sequence: Int
  let events: [RichRuntimeEvent]
  let receivedAtMilliseconds: Int64
}

/// Owns one selected host/thread transcript. History is installed authoritatively and
/// only newer, uniquely-sequenced live batches are replayed over it.
@MainActor
@Observable
final class RichChatTranscriptController {
  private(set) var state = RichChatTranscriptControllerState()

  private let gateway: any RichChatHistoryGateway
  private let historyTask = RichChatControllerTaskSlot()
  private let pageTask = RichChatControllerTaskSlot()
  private var revision: UInt64 = 0
  private var isBackgrounded = false
  private var bufferedBatches: [RichChatBufferedRuntimeBatch] = []
  private var bufferedSequences: Set<Int> = []

  init(gateway: any RichChatHistoryGateway) {
    self.gateway = gateway
  }

  func activate(access: RichChatSessionAccess, threadID: String) {
    revision &+= 1
    historyTask.cancel()
    pageTask.cancel()
    bufferedBatches.removeAll(keepingCapacity: true)
    bufferedSequences.removeAll(keepingCapacity: true)
    isBackgrounded = false
    let target = RichChatThreadTarget(lease: access.lease, threadID: threadID)
    state = RichChatTranscriptControllerState(
      access: access,
      target: target,
      transcript: RichTranscriptState(threadID: threadID)
    )
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
    historyTask.cancel()
    pageTask.cancel()
    bufferedBatches.removeAll(keepingCapacity: false)
    bufferedSequences.removeAll(keepingCapacity: false)
    isBackgrounded = false
    state = RichChatTranscriptControllerState()
  }

  func enterBackground() {
    revision &+= 1
    isBackgrounded = true
    historyTask.cancel()
    pageTask.cancel()
    bufferedBatches.removeAll(keepingCapacity: false)
    bufferedSequences.removeAll(keepingCapacity: false)
    state.isLoadingOlder = false
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
    pageTask.cancel()
    state.isLoadingOlder = false
    bufferedBatches.removeAll(keepingCapacity: true)
    bufferedSequences.removeAll(keepingCapacity: true)
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

  func loadOlder(limit: Int = 100, targetEntryCount: Int? = 40) async {
    guard let target = state.target, let access = state.access,
      let before = state.olderCursor, !state.isLoadingOlder
    else { return }
    if let failure = access.controllerGate(.sessionRead) {
      state.pageFailure = failure
      return
    }
    guard (1...500).contains(limit) else {
      state.pageFailure = .invalidRequest
      return
    }
    let owner = revision
    state.isLoadingOlder = true
    state.pageFailure = nil
    pageTask.launch { [weak self] in
      await self?.performPageLoad(
        target: target,
        before: before,
        limit: limit,
        targetEntryCount: targetEntryCount,
        owner: owner
      )
    }
    await pageTask.wait()
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
      bufferedBatches.append(
        RichChatBufferedRuntimeBatch(
          sequence: sequence,
          events: events,
          receivedAtMilliseconds: receivedAtMilliseconds
        ))
      return
    }
    guard sequence > state.liveSequence else { return }
    apply(events, receivedAtMilliseconds: receivedAtMilliseconds)
    state.liveSequence = sequence
  }

  func receivePendingSteer(
    _ envelope: RichPendingSteerEnvelope,
    target: RichChatThreadTarget
  ) {
    guard !isBackgrounded, target == state.target, envelope.threadID == target.threadID else {
      return
    }
    var pending = RichPendingSteerState(threadID: target.threadID, pending: state.pendingSteer)
    pending.apply(envelope)
    state.pendingSteer = pending.pending
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
      let turns = try RichChatRemoteModelBridge.completedTurns(history.completedTurns)
      let context = try RichChatRemoteModelBridge.contextUsage(history.contextUsage)
      guard history.thread.id == target.threadID,
        owns(target: target, revision: owner)
      else { return }
      var transcript = RichTranscriptState(threadID: target.threadID, items: items)
      var mergedContext = context
      var liveSequence = history.snapshotSeq
      for batch in bufferedBatches.sorted(by: { $0.sequence < $1.sequence })
      where batch.sequence > history.snapshotSeq {
        for event in batch.events {
          transcript.apply(event, receivedAtMilliseconds: batch.receivedAtMilliseconds)
        }
        mergedContext = Self.mergeContextUsage(
          batch.events,
          threadID: target.threadID,
          into: mergedContext
        )
        liveSequence = max(liveSequence, batch.sequence)
      }
      state.transcript = transcript
      state.completedTurns = RichTimeline.resolveCompletedTurnAnchors(
        turns,
        in: RichTimeline.project(transcript.itemsInOrder)
      )
      state.contextUsage = mergedContext
      state.terminalScrollback = history.terminalScrollback
      state.olderCursor = history.runtimeNextCursor
      state.snapshotSequence = history.snapshotSeq
      state.liveSequence = liveSequence
      state.loadState = transcript.itemsInOrder.isEmpty ? .empty : .loaded
      bufferedBatches.removeAll(keepingCapacity: false)
      bufferedSequences.removeAll(keepingCapacity: false)
    } catch is CancellationError {
      guard owns(target: target, revision: owner) else { return }
      state.loadState = .idle
    } catch {
      guard owns(target: target, revision: owner) else { return }
      state.loadState = .failed(.map(error))
      bufferedBatches.removeAll(keepingCapacity: false)
      bufferedSequences.removeAll(keepingCapacity: false)
    }
  }

  private func performPageLoad(
    target: RichChatThreadTarget,
    before: Int,
    limit: Int,
    targetEntryCount: Int?,
    owner: UInt64
  ) async {
    defer {
      if owns(target: target, revision: owner) { state.isLoadingOlder = false }
    }
    do {
      let page = try await gateway.loadRichHistoryPage(
        target: target,
        beforePosition: before,
        limit: limit,
        targetEntryCount: targetEntryCount
      )
      try Task.checkCancellation()
      let older = try RichChatRemoteModelBridge.items(page.items)
      guard owns(target: target, revision: owner), let current = state.transcript else { return }
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
      state.olderCursor = page.nextCursor
      state.pageFailure = nil
      if !merged.isEmpty { state.loadState = .loaded }
    } catch is CancellationError {
      return
    } catch {
      guard owns(target: target, revision: owner) else { return }
      state.pageFailure = .map(error)
    }
  }

  private func apply(_ events: [RichRuntimeEvent], receivedAtMilliseconds: Int64) {
    guard var transcript = state.transcript else { return }
    for event in events {
      transcript.apply(event, receivedAtMilliseconds: receivedAtMilliseconds)
    }
    state.transcript = transcript
    state.contextUsage = Self.mergeContextUsage(
      events,
      threadID: transcript.threadID,
      into: state.contextUsage
    )
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
