import Foundation
import Observation

struct RichChatControllerScope: Equatable, Sendable {
  var access: RichChatSessionAccess?
  var threadID: String?
  var isBackgrounded = false

  var target: RichChatThreadTarget? {
    guard let access, let threadID else { return nil }
    return RichChatThreadTarget(lease: access.lease, threadID: threadID)
  }
}

/// Composition root for a single visible conversation. It deliberately accepts only the
/// provider-agnostic gateway contracts and can therefore be wired to any selected host.
@MainActor
@Observable
final class RichChatControllerSuite {
  private(set) var scope = RichChatControllerScope()

  var requiresAuthoritativeRefresh: Bool {
    conversation.state.requiresAuthoritativeRefresh
      || requests.state.requiresAuthoritativeRefresh
      || checkpoints.state.requiresAuthoritativeRefresh
      || media.state.requiresAuthoritativeRefresh
      || terminal.state.requiresAuthoritativeRefresh
  }

  let transcript: RichChatTranscriptController
  let conversation: RichChatConversationController
  let requests: RichChatRequestController
  let checkpoints: RichChatCheckpointController
  let media: RichChatMediaController
  let terminal: RichChatTerminalController

  init(
    gateway: any RichChatSessionGateway,
    refreshRequester: any RichChatAuthoritativeRefreshRequesting =
      RichChatNoopRefreshRequester(),
    watchIDGenerator: any RichChatWatchIDGenerating = RichChatUUIDWatchIDGenerator()
  ) {
    transcript = RichChatTranscriptController(gateway: gateway)
    conversation = RichChatConversationController(
      gateway: gateway,
      refreshRequester: refreshRequester
    )
    requests = RichChatRequestController(
      gateway: gateway,
      refreshRequester: refreshRequester
    )
    checkpoints = RichChatCheckpointController(
      historyGateway: gateway,
      conversationGateway: gateway,
      refreshRequester: refreshRequester
    )
    media = RichChatMediaController(
      historyGateway: gateway,
      conversationGateway: gateway,
      refreshRequester: refreshRequester
    )
    terminal = RichChatTerminalController(
      gateway: gateway,
      watchIDGenerator: watchIDGenerator,
      refreshRequester: refreshRequester
    )
  }

  func select(access: RichChatSessionAccess, threadID: String) {
    guard !threadID.isEmpty else {
      deselect()
      return
    }
    let target = RichChatThreadTarget(lease: access.lease, threadID: threadID)
    if scope.target == target {
      updateAccess(access)
      return
    }
    scope = RichChatControllerScope(access: access, threadID: threadID)
    transcript.activate(access: access, threadID: threadID)
    conversation.activate(access: access, threadID: threadID)
    requests.activate(access: access, threadID: threadID)
    checkpoints.activate(access: access, threadID: threadID)
    media.activate(access: access, threadID: threadID)
    terminal.activate(access: access, threadID: threadID)
  }

  func updateAccess(_ access: RichChatSessionAccess) {
    guard scope.access?.lease == access.lease else {
      deselect()
      return
    }
    scope.access = access
    transcript.updateAccess(access)
    conversation.updateAccess(access)
    requests.updateAccess(access)
    checkpoints.updateAccess(access)
    media.updateAccess(access)
    terminal.updateAccess(access)
  }

  func deselect() {
    scope = RichChatControllerScope()
    transcript.deactivate()
    conversation.deactivate()
    requests.deactivate()
    checkpoints.deactivate()
    media.deactivate()
    terminal.deactivate()
  }

  func enterBackground() {
    guard !scope.isBackgrounded else { return }
    scope.isBackgrounded = true
    transcript.enterBackground()
    conversation.enterBackground()
    requests.enterBackground()
    checkpoints.enterBackground()
    media.enterBackground()
    terminal.enterBackground()
  }

  /// Foregrounding only re-enables work. It intentionally does not replay a cancelled request;
  /// the composition owner explicitly reloads authoritative history when appropriate.
  func leaveBackground(access: RichChatSessionAccess) {
    guard scope.access?.lease == access.lease else {
      deselect()
      return
    }
    scope.access = access
    scope.isBackgrounded = false
    transcript.leaveBackground(access: access)
    conversation.leaveBackground(access: access)
    requests.leaveBackground(access: access)
    checkpoints.leaveBackground(access: access)
    media.leaveBackground(access: access)
    terminal.leaveBackground(access: access)
  }

  func receiveRuntimePayloads(
    _ payloads: [RichJSON],
    sequence: Int,
    receivedAtMilliseconds: Int64 = 0,
    target: RichChatThreadTarget
  ) throws {
    let events = try payloads.map(RichRuntimeEventDecoder.decode)
    transcript.receiveLiveEvents(
      events,
      sequence: sequence,
      receivedAtMilliseconds: receivedAtMilliseconds,
      target: target
    )
  }

  func receivePendingSteerPayload(
    _ payload: RichJSON,
    target: RichChatThreadTarget
  ) throws {
    transcript.receivePendingSteer(
      try RichPendingSteerDecoder.decodeEnvelope(payload),
      target: target
    )
  }

  func refreshAuthoritativeHistory(targetEntryCount: Int? = 40) async {
    await transcript.loadHistory(targetEntryCount: targetEntryCount)
    switch transcript.state.loadState {
    case .loaded, .empty:
      conversation.acknowledgeAuthoritativeRefresh()
      requests.acknowledgeAuthoritativeRefresh()
      checkpoints.acknowledgeAuthoritativeRefresh()
      media.acknowledgeAuthoritativeRefresh()
      terminal.acknowledgeAuthoritativeRefresh()
    case .idle, .loading, .failed:
      break
    }
  }
}
