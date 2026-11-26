import Foundation
import Observation

/// One scoped delegated-agent watch per selected thread detail. The host keeps
/// child output on the normal live stream; this controller owns only the viewer
/// lease, its renewal, and the legacy one-shot history guard.
@MainActor
@Observable
final class RichChatDelegatedWatchController {
  enum Phase: Equatable, Sendable {
    case idle
    case subscribing
    case watching
    case retrying
  }

  struct State: Equatable, Sendable {
    var access: RichChatSessionAccess?
    var target: RichChatThreadTarget?
    var parentItemID: String?
    var viewerID: String?
    var phase: Phase = .idle
  }

  private(set) var state = State()

  private let gateway: any RichChatDelegatedWatchGateway
  private let watchIDGenerator: any RichChatWatchIDGenerating
  private let refreshRequester: any RichChatAuthoritativeRefreshRequesting
  private weak var transcript: RichChatTranscriptController?
  private let watchTask = RichChatControllerTaskSlot()
  private var revision: UInt64 = 0
  private var isBackgrounded = false

  init(
    gateway: any RichChatDelegatedWatchGateway,
    transcript: RichChatTranscriptController,
    watchIDGenerator: any RichChatWatchIDGenerating = RichChatUUIDWatchIDGenerator(),
    refreshRequester: any RichChatAuthoritativeRefreshRequesting =
      RichChatNoopRefreshRequester()
  ) {
    self.gateway = gateway
    self.transcript = transcript
    self.watchIDGenerator = watchIDGenerator
    self.refreshRequester = refreshRequester
  }

  var watchingParentItemID: String? { state.parentItemID }

  /// Start is unavailable when the selected session cannot read the host;
  /// Stop remains available for a pending/retrying watch.
  var canStart: Bool {
    guard !isBackgrounded, let access = state.access, state.target != nil else { return false }
    return access.controllerGate(.sessionRead) == nil
  }

  func isWatching(_ parentItemID: String) -> Bool {
    state.parentItemID == parentItemID
  }

  func isBusy(_ parentItemID: String) -> Bool {
    state.parentItemID == parentItemID
      && (state.phase == .subscribing || state.phase == .retrying)
  }

  func activate(access: RichChatSessionAccess, threadID: String) {
    stopHostWork()
    revision &+= 1
    isBackgrounded = false
    state = State(
      access: access,
      target: RichChatThreadTarget(lease: access.lease, threadID: threadID)
    )
  }

  func updateAccess(_ access: RichChatSessionAccess) {
    guard state.target?.lease == access.lease else {
      deactivate()
      return
    }
    state.access = access
    if access.controllerGate(.sessionRead) != nil {
      stop()
    }
  }

  func deactivate() {
    stopHostWork()
    revision &+= 1
    isBackgrounded = false
    state = State()
  }

  func enterBackground() {
    stopHostWork()
    revision &+= 1
    isBackgrounded = true
    state.parentItemID = nil
    state.viewerID = nil
    state.phase = .idle
  }

  func leaveBackground(access: RichChatSessionAccess) {
    guard state.target?.lease == access.lease else {
      deactivate()
      return
    }
    state.access = access
    isBackgrounded = false
  }

  func toggle(parentItemID: String) {
    if isWatching(parentItemID) {
      stop()
    } else {
      start(parentItemID: parentItemID)
    }
  }

  func start(parentItemID: String) {
    guard !isBackgrounded, let target = state.target, let access = state.access,
      access.controllerGate(.sessionRead) == nil,
      let item = parentItem(in: transcript?.state.transcript, id: parentItemID),
      item.state != .completed
    else { return }
    stopHostWork()
    revision &+= 1
    let viewerID = watchIDGenerator.makeRichChatWatchID()
    state.access = access
    state.parentItemID = parentItemID
    state.viewerID = viewerID
    state.phase = .subscribing
    let owner = revision
    watchTask.launch { [weak self] in
      await self?.run(
        parentItemID: parentItemID,
        viewerID: viewerID,
        target: target,
        owner: owner
      )
    }
  }

  func stop() {
    stopHostWork()
  }

  /// Stops a watch whose parent has completed (or disappeared from the current
  /// transcript). The roster itself only lists active parents, so this runs
  /// after live frames and authoritative history installs.
  func syncParentState() {
    guard let parentItemID = state.parentItemID else { return }
    guard let item = parentItem(in: transcript?.state.transcript, id: parentItemID),
      item.state != .completed
    else {
      stop()
      return
    }
  }

  private func parentItem(in transcript: RichTranscriptState?, id: String) -> RichRuntimeItem? {
    transcript?.itemsByID[id]
  }

  private func owns(
    _ target: RichChatThreadTarget,
    parentItemID: String,
    viewerID: String,
    owner: UInt64
  ) -> Bool {
    !isBackgrounded && revision == owner && state.target == target
      && state.parentItemID == parentItemID && state.viewerID == viewerID
  }

  /// A remounted watcher for the exact same target owns the legacy (parent-slot)
  /// release, so an older unconfirmed subscription must not release it.
  private func hasNewerWatch(
    target: RichChatThreadTarget,
    parentItemID: String,
    viewerID: String
  ) -> Bool {
    state.target == target && state.parentItemID == parentItemID
      && state.viewerID != nil && state.viewerID != viewerID
  }

  private func run(
    parentItemID: String,
    viewerID: String,
    target: RichChatThreadTarget,
    owner: UInt64
  ) async {
    var retryDelayMilliseconds: UInt64 = 1_000
    var scopedLease = false
    defer {
      // Release the exact viewer after the in-flight subscribe settles. A
      // legacy host releases by parent slot, so skip that release only when a
      // newer watch for the same target already owns it; a confirmed scoped
      // lease always releases its own viewer id.
      let release =
        scopedLease
        || !hasNewerWatch(
          target: target, parentItemID: parentItemID, viewerID: viewerID)
      if release {
        Task { [gateway, target, parentItemID, viewerID] in
          try? await gateway.unsubscribeRichDelegatedAgent(
            target: target, parentItemID: parentItemID, viewerID: viewerID)
        }
      }
    }

    while !Task.isCancelled {
      guard owns(target, parentItemID: parentItemID, viewerID: viewerID, owner: owner)
      else { return }
      do {
        let result = try await gateway.subscribeRichDelegatedAgent(
          target: target, parentItemID: parentItemID, viewerID: viewerID)
        // Record the receipt before the stale-response guard so a late valid
        // scoped acknowledgement still releases this exact viewer.
        if let leaseMs = result.leaseMs, leaseMs > 0 {
          scopedLease = true
        }
        guard owns(target, parentItemID: parentItemID, viewerID: viewerID, owner: owner)
        else { return }
        if !result.history.isEmpty {
          let applied = transcript?.applyLegacyDelegatedHistory(result.history, target: target)
          if applied != true {
            await refreshRequester.requestRichChatRefresh(
              target: target, reason: .transcriptInvalidated)
            guard
              owns(target, parentItemID: parentItemID, viewerID: viewerID, owner: owner)
            else { return }
          }
        }
        guard let leaseMs = result.leaseMs, leaseMs > 0 else {
          // Legacy host: one-shot delivery only, no negotiated renewal. Keep
          // the watch selected until Stop/teardown; the defer releases after
          // any in-flight subscribe settles.
          state.phase = .watching
          while !Task.isCancelled {
            guard
              owns(target, parentItemID: parentItemID, viewerID: viewerID, owner: owner)
            else { return }
            try await Task.sleep(for: .seconds(60))
          }
          return
        }
        retryDelayMilliseconds = 1_000
        state.phase = .watching
        // Clamp the renewal to the nominal 90s lease window so an absurd wire
        // value cannot overflow the nanoseconds conversion.
        let renewalMilliseconds = min(max(1, leaseMs / 3), 30_000)
        try await Task.sleep(nanoseconds: UInt64(renewalMilliseconds) * 1_000_000)
      } catch is CancellationError {
        return
      } catch {
        guard owns(target, parentItemID: parentItemID, viewerID: viewerID, owner: owner)
        else { return }
        state.phase = .retrying
        do {
          try await Task.sleep(nanoseconds: retryDelayMilliseconds * 1_000_000)
        } catch {
          return
        }
        retryDelayMilliseconds = min(15_000, retryDelayMilliseconds * 2)
      }
    }
  }

  /// Cancels the loop; its defer sends the same-id unsubscribe after any
  /// in-flight subscribe returns. Host expiry remains the backstop.
  private func stopHostWork() {
    watchTask.cancel()
    revision &+= 1
    state.parentItemID = nil
    state.viewerID = nil
    state.phase = .idle
  }
}
