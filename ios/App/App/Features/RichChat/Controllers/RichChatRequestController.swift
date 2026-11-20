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

struct RichChatRequestCardID: Hashable {
  enum Surface: Hashable { case dock, inspector }

  let requestID: RichRequestID
  let surface: Surface
}

@MainActor
@Observable
final class RichChatRequestController {
  private(set) var state = RichChatRequestControllerState()
  var expandedDetails: Set<RichChatRequestCardID> = []
  // Scroll updates only feed the initial anchor when a card is recreated.
  @ObservationIgnored var readingProgress: [RichChatRequestCardID: CGFloat] = [:]
  var editingForm: RichChatRequestFormDraft?
  private var formDrafts: [RichRequestID: RichChatRequestFormDraft] = [:]

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
    retainRequestPresentation(for: [])
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
    retainRequestPresentation(for: [])
    state = RichChatRequestControllerState()
  }

  func retainRequestPresentation(for openRequests: Set<RichRequestID>) {
    expandedDetails = expandedDetails.filter { openRequests.contains($0.requestID) }
    readingProgress = readingProgress.filter { openRequests.contains($0.key.requestID) }
    formDrafts = formDrafts.filter { openRequests.contains($0.key) }
    if let editingForm, !openRequests.contains(editingForm.id) { self.editingForm = nil }
  }

  func reconcileRequestForms(with requests: [RichOpenRequest]) {
    retainRequestPresentation(for: Set(requests.map(\.id)))
    for request in requests {
      guard let draft = formDrafts[request.id], draft.form.requiresExternalVisit,
        RichChatRequestForm(request: request) != draft.form else { continue }
      formDrafts[request.id] = nil
      if editingForm === draft { editingForm = nil }
    }
  }

  func resolveForm(_ draft: RichChatRequestFormDraft, response: RichJSON) async -> Bool {
    guard editingForm === draft, !draft.submitted else { return false }
    let resolution = RichChatRequestResolution(requestID: draft.id, method: "requestPermission", response: response)
    guard await resolve(resolution, request: draft.request) else { return false }
    draft.submitted = true
    return true
  }

  func canEditForm(_ request: RichOpenRequest) -> Bool {
    state.target?.threadID == request.threadID && formDrafts[request.id]?.submitted != true
  }

  func editForm(_ form: RichChatRequestForm, request: RichOpenRequest) {
    guard !isBackgrounded, canEditForm(request) else { return }
    if let draft = formDrafts[request.id], draft.form == form {
      editingForm = draft
    } else {
      let draft = RichChatRequestFormDraft(request: request, form: form)
      formDrafts[request.id] = draft
      editingForm = draft
    }
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
    // The acknowledgement runs only after a successful authoritative history
    // read whose lease passed the read gate, so an `.offline` recorded by a
    // gate-refused attempt (no operation was in flight) is provably stale by
    // then. Domain, permission and ambiguous failures keep their existing
    // semantics.
    if state.failure == .ambiguousOutcome || state.failure == .offline {
      state.failure = nil
    }
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
    state.lastResolvedRequestID = nil
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
    return owns(target: target, revision: owner)
      && state.lastResolvedRequestID == resolution.requestID && state.failure == nil
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
