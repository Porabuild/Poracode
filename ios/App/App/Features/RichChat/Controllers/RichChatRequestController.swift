import Foundation
import Observation

struct RichChatRequestControllerState: Equatable, Sendable {
  var access: RichChatSessionAccess?
  var target: RichChatThreadTarget?
  var resolvingRequestID: RichRequestID?
  var lastResolvedRequestID: RichRequestID?
  var failure: RichChatControllerFailure?
  var requiresAuthoritativeRefresh = false
}

@MainActor
@Observable
final class RichChatRequestController {
  private(set) var state = RichChatRequestControllerState()

  private let gateway: any RichChatRequestGateway
  private let refreshRequester: any RichChatAuthoritativeRefreshRequesting
  private let task = RichChatControllerTaskSlot()
  private var revision: UInt64 = 0
  private var isBackgrounded = false

  init(
    gateway: any RichChatRequestGateway,
    refreshRequester: any RichChatAuthoritativeRefreshRequesting =
      RichChatNoopRefreshRequester()
  ) {
    self.gateway = gateway
    self.refreshRequester = refreshRequester
  }

  func activate(access: RichChatSessionAccess, threadID: String) {
    task.cancel()
    revision &+= 1
    isBackgrounded = false
    state = RichChatRequestControllerState(
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
  }

  func deactivate() {
    task.cancel()
    revision &+= 1
    isBackgrounded = false
    state = RichChatRequestControllerState()
  }

  func enterBackground() {
    task.cancel()
    revision &+= 1
    isBackgrounded = true
    state.resolvingRequestID = nil
  }

  func leaveBackground(access: RichChatSessionAccess) {
    guard state.target?.lease == access.lease else { return }
    state.access = access
    isBackgrounded = false
  }

  func acknowledgeAuthoritativeRefresh() {
    state.requiresAuthoritativeRefresh = false
    if state.failure == .ambiguousOutcome { state.failure = nil }
  }

  @discardableResult
  func resolve(
    _ resolution: RichChatRequestResolution,
    request: RichOpenRequest
  ) async -> Bool {
    guard !isBackgrounded, let target = state.target, let access = state.access else {
      state.failure = .unavailable
      return false
    }
    guard request.threadID == target.threadID,
      request.requestID == resolution.requestID,
      !resolution.method.isEmpty
    else {
      state.failure = .invalidRequest
      return false
    }
    guard state.resolvingRequestID == nil else {
      state.failure = .busy
      return false
    }
    if let failure = access.controllerGate(.requestsResolve) {
      state.failure = failure
      return false
    }

    let owner = revision
    state.resolvingRequestID = resolution.requestID
    state.failure = nil
    task.launch { [weak self] in
      guard let self else { return }
      do {
        try await self.gateway.resolveRichRequest(target: target, resolution: resolution)
        try Task.checkCancellation()
        guard self.owns(target: target, revision: owner) else { return }
        self.state.resolvingRequestID = nil
        self.state.lastResolvedRequestID = resolution.requestID
      } catch is CancellationError {
        guard self.owns(target: target, revision: owner) else { return }
        self.state.resolvingRequestID = nil
        return
      } catch {
        guard self.owns(target: target, revision: owner) else { return }
        let failure = RichChatControllerFailure.map(error)
        self.state.resolvingRequestID = nil
        self.state.failure = failure
        if failure == .ambiguousOutcome {
          self.state.requiresAuthoritativeRefresh = true
          await self.refreshRequester.requestRichChatRefresh(
            target: target,
            reason: .ambiguousMutation
          )
        }
      }
    }
    await task.wait()
    return state.lastResolvedRequestID == resolution.requestID && state.failure == nil
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
