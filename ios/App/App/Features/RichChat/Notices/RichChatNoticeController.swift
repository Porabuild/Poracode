import Foundation
import Observation

/// Thread-scoped notice state retained for one selected conversation. The
/// durable notice is server truth from an authoritative read and is never
/// cleared by an omitted field; the episode descriptor is the current
/// unacknowledged gap, read only through the capability-gated route.
struct RichChatNoticeState: Equatable, Sendable {
  var access: RichChatSessionAccess?
  var target: RichChatThreadTarget?
  /// Durable notice from the latest authoritative snapshot/item page, or from
  /// a completed acknowledgement. Cleared only by selection/authority
  /// replacement.
  var notice: RemoteHistoryNotice?
  /// Current unacknowledged episode, if the descriptor read returned one.
  var episode: RemoteHistoryGapDescriptor?
  var isLoadingDescriptor = false
  var isAcknowledging = false
  var descriptorFailure: RichChatControllerFailure?
  var ackFailure: RichChatControllerFailure?
  /// The last acknowledgement outcome was unknown: the same exact command id
  /// and episode token must be reused on retry.
  var ackUncertain = false

  /// Whether the acknowledgement action may be offered right now.
  var canAcknowledge: Bool {
    guard let access, access.runtimeHistoryNotices else { return false }
    return episode != nil && !isAcknowledging && !ackUncertain
  }
}

/// A stable acknowledgement identity: one operation per selected host/thread
/// and exact episode token. An uncertain retry reuses the same command id; a
/// different episode (or a `stale` replacement token) mints a new one.
struct RichChatNoticeAckKey: Equatable, Sendable {
  var lease: RichChatHostLease
  var threadID: String
  var episodeToken: String
}

/// Receives authoritative notices observed by the transcript controller. The
/// transcript projects; this controller owns retention/recovery state.
@MainActor
protocol RichChatNoticeProjecting: AnyObject {
  func noticeProjectionSnapshotNotice(_ notice: RemoteHistoryNotice?)
  func noticeProjectionItemPageNotice(_ notice: RemoteHistoryNotice?)
  func noticeProjectionReadFailed(_ failure: RichChatControllerFailure)
}

/// Owns the B1 durable history-incomplete notice for one selected thread:
/// projection, the capability-gated descriptor read, the explicit
/// acknowledgement with retained command identity, and the stale/uncertain
/// rules. It never fabricates a timeline item and never auto-acknowledges.
@MainActor
@Observable
final class RichChatNoticeController {
  private(set) var state = RichChatNoticeState()

  private let gateway: any RichChatNoticeGateway
  private let refreshRequester: any RichChatAuthoritativeRefreshRequesting
  private var revision: UInt64 = 0
  private var isBackgrounded = false
  private let task = RichChatControllerTaskSlot()
  private var ackAttempt: (key: RichChatNoticeAckKey, commandID: String)?

  init(
    gateway: any RichChatNoticeGateway,
    refreshRequester: any RichChatAuthoritativeRefreshRequesting = RichChatNoopRefreshRequester()
  ) {
    self.gateway = gateway
    self.refreshRequester = refreshRequester
  }

  // MARK: - Lifecycle

  func activate(access: RichChatSessionAccess, threadID: String) {
    revision &+= 1
    task.cancel()
    ackAttempt = nil
    isBackgrounded = false
    state = RichChatNoticeState(
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
    if !access.runtimeHistoryNotices {
      // The current authority does not declare notices: drop the recovery
      // surface (the durable notice, if any, can no longer be read here).
      state.episode = nil
      state.descriptorFailure = nil
      state.ackFailure = nil
      state.ackUncertain = false
      ackAttempt = nil
    }
  }

  func deactivate() {
    revision &+= 1
    task.cancel()
    ackAttempt = nil
    isBackgrounded = false
    state = RichChatNoticeState()
  }

  func enterBackground() {
    revision &+= 1
    task.cancel()
    isBackgrounded = true
    state.isLoadingDescriptor = false
    state.isAcknowledging = false
  }

  func leaveBackground(access: RichChatSessionAccess) {
    guard state.target?.lease == access.lease else { return }
    state.access = access
    isBackgrounded = false
  }

  // MARK: - Authoritative projection

  /// A snapshot's notice, when present. An omitted field leaves the retained
  /// notice untouched.
  func receiveAuthoritativeSnapshot(notice: RemoteHistoryNotice?) {
    guard !isBackgrounded, let notice else { return }
    state.notice = notice
    state.descriptorFailure = nil
  }

  /// An item page's notice, when present. The turns page carries no notice by
  /// design; absence never clears.
  func receiveItemPage(notice: RemoteHistoryNotice?) {
    guard !isBackgrounded, let notice else { return }
    state.notice = notice
  }

  /// A transcript read failed. Only a retryable host refusal can mean a gap
  /// fence or a notice gate; ordinary provider errors keep their existing
  /// treatment. The descriptor read itself is the only proof of a gap.
  func authoritativeReadFailed(_ failure: RichChatControllerFailure) {
    guard !isBackgrounded, state.access?.runtimeHistoryNotices == true else { return }
    guard Self.mayIndicateDurableGap(failure) else { return }
    guard !state.isLoadingDescriptor, state.episode == nil else { return }
    // The read/recovery decision is synchronous; only the network work hops.
    Task { @MainActor [weak self] in
      await self?.refreshDescriptor()
    }
  }

  /// Only the host's persistence refusals and the declared-reader gate can
  /// mean a durable gap. A plain provider error or an ordinary 5xx keeps its
  /// existing treatment.
  private static func mayIndicateDurableGap(_ failure: RichChatControllerFailure) -> Bool {
    guard case .rejected(let statusCode, let code) = failure else { return false }
    if statusCode == 503 { return true }
    if statusCode == 409 { return code == "runtime_history_notice_unsupported" }
    if statusCode == 500 {
      return code == "persistence_identity_invalid" || code?.hasPrefix("persistence_") == true
    }
    return false
  }

  // MARK: - Capability-gated descriptor read

  func refreshDescriptor() async {
    guard !isBackgrounded, let target = state.target, let access = state.access,
      access.runtimeHistoryNotices, !state.isLoadingDescriptor
    else { return }
    if let failure = access.controllerGate(.sessionRead) {
      state.descriptorFailure = failure
      return
    }
    let owner = revision
    state.isLoadingDescriptor = true
    state.descriptorFailure = nil
    let gateway = self.gateway
    task.launch { [weak self] in
      guard let self else { return }
      do {
        let read = try await gateway.loadRichRuntimeGap(target: target)
        guard self.owns(target: target, revision: owner) else { return }
        // The read is authoritative for both: an absent notice never clears a
        // retained one, and the episode is exactly what the host reports now.
        if let notice = read.notice { self.state.notice = notice }
        self.state.episode = read.gap
      } catch is CancellationError {
        return
      } catch {
        guard self.owns(target: target, revision: owner) else { return }
        self.state.descriptorFailure = RichChatControllerFailure.map(error)
      }
      guard self.owns(target: target, revision: owner) else { return }
      self.state.isLoadingDescriptor = false
    }
    await task.wait()
    if owns(target: target, revision: owner) {
      state.isLoadingDescriptor = false
    }
  }

  // MARK: - Explicit acknowledgement

  /// Acknowledges the current episode. Only an explicit user action reaches
  /// this; the command identity is retained across an uncertain outcome.
  func acknowledgeCurrentEpisode() async {
    guard !isBackgrounded, let target = state.target, let access = state.access,
      access.runtimeHistoryNotices, let episode = state.episode,
      !state.isAcknowledging, !state.ackUncertain
    else { return }
    if let failure = access.controllerGate(.sessionOperate) {
      state.ackFailure = failure
      return
    }
    let key = RichChatNoticeAckKey(
      lease: target.lease, threadID: target.threadID, episodeToken: episode.token
    )
    let commandID = commandID(for: key)
    let owner = revision
    state.isAcknowledging = true
    state.ackFailure = nil
    let gateway = self.gateway
    task.launch { [weak self] in
      guard let self else { return }
      do {
        let outcome = try await gateway.acknowledgeRichRuntimeGap(
          target: target, episodeToken: episode.token, commandID: commandID
        )
        guard self.owns(target: target, revision: owner) else { return }
        self.apply(outcome, key: key)
      } catch is CancellationError {
        return
      } catch {
        guard self.owns(target: target, revision: owner) else { return }
        self.applyAckFailure(error, key: key)
      }
      guard self.owns(target: target, revision: owner) else { return }
      self.state.isAcknowledging = false
    }
    await task.wait()
    if owns(target: target, revision: owner) {
      state.isAcknowledging = false
    }
  }

  /// The command id is stable for one key and reused as-is on an uncertain
  /// retry. A new key (new episode/thread/lease) mints a fresh id.
  private func commandID(for key: RichChatNoticeAckKey) -> String {
    if let ackAttempt, ackAttempt.key == key { return ackAttempt.commandID }
    let id = "notice-ack:\(UUID().uuidString)"
    ackAttempt = (key, id)
    return id
  }

  private func apply(_ outcome: RemoteHistoryGapAcknowledgeOutcome, key: RichChatNoticeAckKey) {
    switch outcome {
    case .applied(let notice, _):
      state.notice = notice
      state.episode = nil
      state.ackUncertain = false
      ackAttempt = nil
      state.descriptorFailure = nil
      requestAuthoritativeRefresh()
    case .already(let notice):
      state.notice = notice
      state.episode = nil
      state.ackUncertain = false
      ackAttempt = nil
      requestAuthoritativeRefresh()
    case .stale(let current):
      // Zero-effect: the token no longer matches. Display the truthful current
      // state; never auto-acknowledge the replacement. A later explicit action
      // mints a new command id from the replacement token.
      state.episode = current
      state.ackUncertain = false
      if current == nil { ackAttempt = nil } else if ackAttempt?.key == key { ackAttempt = nil }
    }
  }

  private func applyAckFailure(_ error: Error, key: RichChatNoticeAckKey) {
    let failure = RichChatControllerFailure.map(error)
    let uncertain: Bool
    if case .ambiguousOutcome = failure {
      uncertain = true
    } else if case .transport = failure {
      uncertain = true
    } else if case .rejected(let statusCode, _) = failure, statusCode >= 500 {
      uncertain = true
    } else {
      uncertain = false
    }
    guard uncertain else {
      state.ackFailure = failure
      if ackAttempt?.key == key { ackAttempt = nil }
      return
    }
    // The acknowledgement may have committed. Keep the exact key (and its
    // command id) so the retry is the same idempotent operation.
    state.ackUncertain = true
    state.ackFailure = nil
  }

  /// `applied`/`already` change the transcript's readable prefix; re-baseline
  /// through the existing authoritative refresh requester (the host also
  /// publishes a thread-reset for the acknowledgement).
  private func requestAuthoritativeRefresh() {
    guard let target = state.target else { return }
    let requester = refreshRequester
    Task { @MainActor in
      await requester.requestRichChatRefresh(target: target, reason: .transcriptInvalidated)
    }
  }

  /// Clears the uncertain flag so the user can retry the same idempotent
  /// operation with the retained command id.
  func retryAfterUncertainAcknowledgement() {
    guard state.ackUncertain else { return }
    state.ackUncertain = false
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

// MARK: - Presentation

extension RichChatNoticeController {
  /// The resolved banner state, or nil when there is nothing durable to show.
  /// Pure projection of `state`: the view never decides the branch.
  var presentation: RichChatNoticeStrings.Presentation? {
    // An actionable current episode wins over the informational durable
    // notice: both may be retained at once, and only the episode needs a
    // user decision. Once acknowledged, the durable notice renders again.
    if let episode = state.episode {
      var presentation = RichChatNoticeStrings.episodePresentation(episode)
      if state.isAcknowledging {
        presentation.isBusy = true
      } else if state.ackUncertain {
        presentation.action = .retryAcknowledgement
        presentation.failureText = RichChatNoticeStrings.uncertain
      } else if let failure = state.ackFailure {
        presentation.failureText = RichChatStrings.failure(failure)
      }
      return presentation
    }
    if let durable = state.notice {
      return RichChatNoticeStrings.durablePresentation(durable)
    }
    guard state.access?.runtimeHistoryNotices == true,
      let failure = state.descriptorFailure
    else { return nil }
    return RichChatNoticeStrings.Presentation(
      title: RichChatNoticeStrings.title,
      message: RichChatNoticeStrings.descriptorFailure,
      action: .retryDescriptor,
      isBusy: state.isLoadingDescriptor,
      failureText: state.isLoadingDescriptor ? nil : RichChatStrings.failure(failure)
    )
  }
}

extension RichChatNoticeController: RichChatNoticeProjecting {
  func noticeProjectionSnapshotNotice(_ notice: RemoteHistoryNotice?) {
    receiveAuthoritativeSnapshot(notice: notice)
  }

  func noticeProjectionItemPageNotice(_ notice: RemoteHistoryNotice?) {
    receiveItemPage(notice: notice)
  }

  func noticeProjectionReadFailed(_ failure: RichChatControllerFailure) {
    authoritativeReadFailed(failure)
  }
}
