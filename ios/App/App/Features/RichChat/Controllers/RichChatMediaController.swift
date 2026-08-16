import Foundation
import Observation

enum RichChatImageLoadPlan: Equatable, Sendable {
  case inline(source: String, classification: RichInlineImageClassification)
  case local(path: String)
  case remote(RichRemoteImageReference)
  case rejected
}

struct RichChatAttachmentPlan: Equatable, Sendable {
  let decision: RichAttachmentDecision
  let attachment: RichChatAttachment?
}

enum RichChatMediaOperation: Equatable, Sendable {
  case uploadAttachment
  case loadLocalImage
  case loadRemoteImage
}

struct RichChatMediaControllerState: Equatable, Sendable {
  var access: RichChatSessionAccess?
  var target: RichChatThreadTarget?
  var operation: RichChatMediaOperation?
  var uploadedAttachmentPath: String?
  var loadedImage: RichChatBinaryPayload?
  var failure: RichChatControllerFailure?
  var requiresAuthoritativeRefresh = false
}

@MainActor
@Observable
final class RichChatMediaController {
  private(set) var state = RichChatMediaControllerState()

  private let historyGateway: any RichChatHistoryGateway
  private let conversationGateway: any RichChatConversationGateway
  private let refreshRequester: any RichChatAuthoritativeRefreshRequesting
  private let uploadTask = RichChatControllerTaskSlot()
  private let imageTask = RichChatControllerTaskSlot()
  private var imageFetchTasks: [UUID: Task<RichChatBinaryPayload?, Never>] = [:]
  private var revision: UInt64 = 0
  private var isBackgrounded = false

  init(
    historyGateway: any RichChatHistoryGateway,
    conversationGateway: any RichChatConversationGateway,
    refreshRequester: any RichChatAuthoritativeRefreshRequesting =
      RichChatNoopRefreshRequester()
  ) {
    self.historyGateway = historyGateway
    self.conversationGateway = conversationGateway
    self.refreshRequester = refreshRequester
  }

  func activate(access: RichChatSessionAccess, threadID: String) {
    cancelOwnedWork()
    revision &+= 1
    isBackgrounded = false
    state = RichChatMediaControllerState(
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
    cancelOwnedWork()
    revision &+= 1
    isBackgrounded = false
    state = RichChatMediaControllerState()
  }

  func enterBackground() {
    cancelOwnedWork()
    revision &+= 1
    isBackgrounded = true
    state.operation = nil
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

  static func attachmentPlan(
    name: String,
    contentType: String,
    data: Data
  ) -> RichChatAttachmentPlan {
    let decision = RichAttachmentPolicy.evaluate(name: name, byteCount: Int64(data.count))
    let validContentType = !contentType.isEmpty && contentType.utf8.count <= 255
    guard decision.accepted, validContentType else {
      let rejected =
        validContentType
        ? decision
        : RichAttachmentDecision(
          queryValid: false,
          bodyWithinLimit: decision.bodyWithinLimit,
          accepted: false,
          error: .invalid
        )
      return RichChatAttachmentPlan(decision: rejected, attachment: nil)
    }
    return RichChatAttachmentPlan(
      decision: decision,
      attachment: RichChatAttachment(name: name, contentType: contentType, data: data)
    )
  }

  static func imagePlan(source: String?, localPath: String?, marker: RichJSON?)
    -> RichChatImageLoadPlan
  {
    if let source, let classification = RichImagePolicy.classify(source) {
      return .inline(source: source, classification: classification)
    }
    if let reference = RichImagePolicy.decodeRemoteReference(marker) {
      return .remote(reference)
    }
    if let localPath, !localPath.isEmpty { return .local(path: localPath) }
    return .rejected
  }

  func upload(_ plan: RichChatAttachmentPlan) async {
    guard let attachment = plan.attachment, plan.decision.accepted else {
      state.failure = .invalidRequest
      return
    }
    guard let context = context(capability: .sessionOperate) else { return }
    guard state.operation == nil else {
      state.failure = .busy
      return
    }
    state.operation = .uploadAttachment
    state.failure = nil
    uploadTask.launch { [weak self] in
      guard let self else { return }
      do {
        let path = try await self.conversationGateway.uploadRichAttachment(
          target: context.target,
          attachment: attachment
        )
        try Task.checkCancellation()
        guard self.owns(context), !path.isEmpty else {
          if self.owns(context) { self.fail(.invalidResponse) }
          return
        }
        self.state.uploadedAttachmentPath = path
        self.state.operation = nil
      } catch is CancellationError {
        guard self.owns(context) else { return }
        self.state.operation = nil
        return
      } catch {
        await self.finishFailure(error, context: context)
      }
    }
    await uploadTask.wait()
  }

  func loadImage(_ plan: RichChatImageLoadPlan) async {
    switch plan {
    case .inline:
      state.loadedImage = nil
      state.failure = nil
      return
    case .rejected:
      state.failure = .invalidRequest
      return
    case .local(let path):
      await loadImage(operation: .loadLocalImage) { gateway, target in
        try await gateway.loadLocalRichImage(target: target, path: path)
      }
    case .remote(let reference):
      await loadImage(operation: .loadRemoteImage) { gateway, target in
        guard reference.threadID == target.threadID else {
          throw RichChatGatewayError.invalidRequest
        }
        return try await gateway.loadRuntimeRichImage(target: target, reference: reference)
      }
    }
  }

  /// Timeline images load independently so several visible attachments cannot cancel each
  /// other. The view owns each request, while this controller still cancels every request on
  /// host replacement or backgrounding and suppresses stale results with the scoped revision.
  func fetchImagePayload(_ plan: RichChatImageLoadPlan) async -> RichChatBinaryPayload? {
    switch plan {
    case .local, .remote:
      break
    case .inline, .rejected:
      return nil
    }
    guard let context = context(capability: .sessionRead) else { return nil }
    let requestID = UUID()
    let task = Task { @MainActor [weak self] () -> RichChatBinaryPayload? in
      guard let self else { return nil }
      do {
        let payload: RichChatBinaryPayload
        switch plan {
        case .local(let path):
          payload = try await self.historyGateway.loadLocalRichImage(
            target: context.target,
            path: path
          )
        case .remote(let reference):
          guard reference.threadID == context.target.threadID else { return nil }
          payload = try await self.historyGateway.loadRuntimeRichImage(
            target: context.target,
            reference: reference
          )
        case .inline, .rejected:
          return nil
        }
        try Task.checkCancellation()
        guard self.owns(context), !payload.data.isEmpty,
          payload.mimeType.lowercased().hasPrefix("image/")
        else { return nil }
        return payload
      } catch {
        return nil
      }
    }
    imageFetchTasks[requestID] = task
    let payload = await withTaskCancellationHandler {
      await task.value
    } onCancel: {
      task.cancel()
    }
    imageFetchTasks[requestID] = nil
    return payload
  }

  private struct Context: Sendable {
    let target: RichChatThreadTarget
    let revision: UInt64
  }

  private func loadImage(
    operation: RichChatMediaOperation,
    call:
      @escaping @Sendable (
        any RichChatHistoryGateway, RichChatThreadTarget
      ) async throws -> RichChatBinaryPayload
  ) async {
    guard let context = context(capability: .sessionRead) else { return }
    guard state.operation == nil else {
      state.failure = .busy
      return
    }
    state.operation = operation
    state.failure = nil
    imageTask.launch { [weak self] in
      guard let self else { return }
      do {
        let payload = try await call(self.historyGateway, context.target)
        try Task.checkCancellation()
        guard self.owns(context) else { return }
        guard !payload.data.isEmpty,
          payload.mimeType.lowercased().hasPrefix("image/")
        else {
          self.fail(.invalidResponse)
          return
        }
        self.state.loadedImage = payload
        self.state.operation = nil
      } catch is CancellationError {
        guard self.owns(context) else { return }
        self.state.operation = nil
        return
      } catch {
        guard self.owns(context) else { return }
        self.fail(.map(error))
      }
    }
    await imageTask.wait()
  }

  private func finishFailure(_ error: any Error, context: Context) async {
    guard owns(context) else { return }
    let failure = RichChatControllerFailure.map(error)
    fail(failure)
    if failure == .ambiguousOutcome {
      state.requiresAuthoritativeRefresh = true
      await refreshRequester.requestRichChatRefresh(
        target: context.target,
        reason: .ambiguousMutation
      )
    }
  }

  private func fail(_ failure: RichChatControllerFailure) {
    state.operation = nil
    state.failure = failure
  }

  private func context(capability: RichChatCapability) -> Context? {
    guard !isBackgrounded, let target = state.target, let access = state.access else {
      state.failure = .unavailable
      return nil
    }
    if let failure = access.controllerGate(capability) {
      state.failure = failure
      return nil
    }
    return Context(target: target, revision: revision)
  }

  private func owns(_ context: Context) -> Bool {
    richChatOwns(
      target: context.target,
      revision: context.revision,
      currentTarget: state.target,
      currentRevision: revision,
      isBackgrounded: isBackgrounded
    )
  }

  private func cancelOwnedWork() {
    uploadTask.cancel()
    imageTask.cancel()
    imageFetchTasks.values.forEach { $0.cancel() }
    imageFetchTasks.removeAll(keepingCapacity: false)
  }

}
