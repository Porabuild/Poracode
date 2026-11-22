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

private enum RichChatImageCacheTarget: Hashable, Sendable {
  case local(String)
  case remote(threadID: String, itemID: String, path: [String])

  static func remote(_ reference: RichRemoteImageReference) -> Self {
    let pathKey = reference.path.map { part -> String in
      switch part {
      case .key(let value): return "k:\(value)"
      case .index(let value): return "i:\(value)"
      }
    }
    return .remote(threadID: reference.threadID, itemID: reference.itemID, path: pathKey)
  }
}

private struct RichChatImageCacheKey: Hashable, Sendable {
  let lease: RichChatHostLease
  let threadID: String
  let target: RichChatImageCacheTarget
  let variant: RichImageVariant?
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
  private var inFlightImages: [RichChatImageCacheKey: Task<RichChatBinaryPayload?, Never>] = [:]
  private var imageCache: [RichChatImageCacheKey: RichChatBinaryPayload] = [:]
  private var imageCacheOrder: [RichChatImageCacheKey] = []
  private var imageCacheBytes = 0
  private static let maxCachedImages = 64
  private static let maxCachedImageBytes = 24 * 1_024 * 1_024
  private var fileFetchTasks: [UUID: Task<RichChatFileDownload?, Never>] = [:]
  private var revision: UInt64 = 0
  private var isBackgrounded = false
  private var memoryWarningSubscription: MemoryWarningSubscription?

  init(
    historyGateway: any RichChatHistoryGateway,
    conversationGateway: any RichChatConversationGateway,
    refreshRequester: any RichChatAuthoritativeRefreshRequesting =
      RichChatNoopRefreshRequester()
  ) {
    self.historyGateway = historyGateway
    self.conversationGateway = conversationGateway
    self.refreshRequester = refreshRequester
    self.memoryWarningSubscription = MemoryWarningSubscription { [weak self] in
      Task { @MainActor [weak self] in
        self?.clearImageCache()
      }
    }
  }

  func activate(access: RichChatSessionAccess, threadID: String) {
    let previousLease = state.target?.lease
    cancelOwnedWork()
    if previousLease != access.lease {
      clearImageCache()
    }
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
    clearImageCache()
    revision &+= 1
    isBackgrounded = false
    state = RichChatMediaControllerState()
  }

  func enterBackground() {
    cancelOwnedWork()
    clearImageCache()
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
    // The acknowledgement runs only after a successful authoritative history
    // read whose lease passed the read gate, so an `.offline` recorded by a
    // gate-refused attempt (no operation was in flight) is provably stale by
    // then. Domain, permission and ambiguous failures keep their existing
    // semantics.
    if state.failure == .ambiguousOutcome || state.failure == .offline {
      state.failure = nil
    }
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
    state.uploadedAttachmentPath = nil
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
  /// other. Identical requests coalesce and reuse a lease-scoped bounded memory cache.
  func fetchImagePayload(
    _ plan: RichChatImageLoadPlan,
    variant: RichImageVariant? = nil
  ) async -> RichChatBinaryPayload? {
    let cacheTarget: RichChatImageCacheTarget
    switch plan {
    case .local(let path):
      cacheTarget = .local(path)
    case .remote(let reference):
      cacheTarget = .remote(reference)
    case .inline, .rejected:
      return nil
    }
    guard let context = context(capability: .sessionRead) else { return nil }
    let key = RichChatImageCacheKey(
      lease: context.target.lease,
      threadID: context.target.threadID,
      target: cacheTarget,
      variant: variant
    )
    if let cached = readCachedImage(for: key) {
      return cached
    }
    if variant != nil {
      let fullKey = RichChatImageCacheKey(
        lease: context.target.lease,
        threadID: context.target.threadID,
        target: cacheTarget,
        variant: nil
      )
      if let fullCached = readCachedImage(for: fullKey) {
        return fullCached
      }
    }
    if let existing = inFlightImages[key] {
      return await awaitUnlinked(existing)
    }
    let task = Task { @MainActor [weak self] () -> RichChatBinaryPayload? in
      guard let self else { return nil }
      defer { self.inFlightImages[key] = nil }
      do {
        let payload: RichChatBinaryPayload
        switch plan {
        case .local(let path):
          payload = try await self.historyGateway.loadLocalRichImage(
            target: context.target,
            path: path,
            variant: variant
          )
        case .remote(let reference):
          guard reference.threadID == context.target.threadID else { return nil }
          payload = try await self.historyGateway.loadRuntimeRichImage(
            target: context.target,
            reference: reference,
            variant: variant
          )
        case .inline, .rejected:
          return nil
        }
        try Task.checkCancellation()
        guard self.owns(context), !payload.data.isEmpty,
          payload.mimeType.lowercased().hasPrefix("image/")
        else { return nil }
        self.storeCachedImage(payload, for: key)
        return payload
      } catch {
        return nil
      }
    }
    inFlightImages[key] = task
    return await awaitUnlinked(task)
  }

  /// Warms up to `limit` (default 4, matching PWA `#1361`) newest uncached card
  /// images for the active thread in the background without blocking UI.
  func prefetchNewestImages(
    _ plans: [RichChatImageLoadPlan],
    limit: Int = 4
  ) {
    guard !isBackgrounded, limit > 0, context(capability: .sessionRead) != nil else { return }
    let candidates = plans.reversed().prefix(limit)
    for plan in candidates {
      switch plan {
      case .local, .remote:
        let requestID = UUID()
        let task = Task { @MainActor [weak self] () -> RichChatBinaryPayload? in
          guard let self else { return nil }
          defer { self.imageFetchTasks[requestID] = nil }
          return await self.fetchImagePayload(plan, variant: .card)
        }
        imageFetchTasks[requestID] = task
      case .inline, .rejected:
        continue
      }
    }
  }

  /// Awaits a shared in-flight image task without propagating a single caller's
  /// cancellation onto the shared download (so scrolling one tile off screen
  /// never aborts another visible waiter). Shared tasks still cancel on
  /// `deactivate()`, `enterBackground()`, or host/thread switch via `cancelOwnedWork()`.
  private func awaitUnlinked(
    _ sharedTask: Task<RichChatBinaryPayload?, Never>
  ) async -> RichChatBinaryPayload? {
    await withTaskGroup(of: RichChatBinaryPayload?.self) { group in
      group.addTask { await sharedTask.value }
      let result = await group.next() ?? nil
      return Task.isCancelled ? nil : result
    }
  }

  /// Chat file cards download independently so several visible cards cannot
  /// cancel each other. The view owns each request; this controller still
  /// cancels every request on host/thread replacement or backgrounding and
  /// drops stale results with the scoped revision.
  func fetchFileDownload(
    request: RichChatFileAccess,
    projectLocation: ProjectLocation,
    suggestedName: String,
    resolveWorkspaceBasename: RichChatWorkspaceBasenameResolver? = nil
  ) async -> RichChatFileDownload? {
    guard let context = context(capability: .sessionRead) else { return nil }
    let requestID = UUID()
    let task = Task { @MainActor [weak self] () -> RichChatFileDownload? in
      guard let self else { return nil }
      var owned: RichChatFileDownload?
      do {
        let resolvedRequest: RichChatFileAccess
        if let resolveWorkspaceBasename, case .project(let filename) = request {
          let path = try await resolveWorkspaceBasename(filename, context.target)
          try Task.checkCancellation()
          guard self.owns(context) else { throw CancellationError() }
          resolvedRequest = .project(relativePath: path)
        } else {
          resolvedRequest = request
        }
        let download = try await self.historyGateway.downloadRichFile(
          target: context.target,
          request: resolvedRequest,
          projectLocation: projectLocation,
          suggestedName: suggestedName
        )
        owned = download
        try Task.checkCancellation()
        guard self.owns(context) else { throw CancellationError() }
        owned = nil
        return download
      } catch {
        // A cancelled or stale card never surfaces a failure; any owned
        // result that never transferred to the view is removed here.
        if let download = owned {
          try? FileManager.default.removeItem(at: download.directory)
        }
        return nil
      }
    }
    fileFetchTasks[requestID] = task
    let download = await withTaskCancellationHandler {
      await task.value
    } onCancel: {
      task.cancel()
    }
    fileFetchTasks[requestID] = nil
    return download
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
    inFlightImages.values.forEach { $0.cancel() }
    inFlightImages.removeAll(keepingCapacity: false)
    fileFetchTasks.values.forEach { $0.cancel() }
    fileFetchTasks.removeAll(keepingCapacity: false)
  }

  private func readCachedImage(for key: RichChatImageCacheKey) -> RichChatBinaryPayload? {
    guard let payload = imageCache[key] else { return nil }
    if let idx = imageCacheOrder.firstIndex(of: key) {
      imageCacheOrder.remove(at: idx)
      imageCacheOrder.append(key)
    }
    return payload
  }

  private func storeCachedImage(_ payload: RichChatBinaryPayload, for key: RichChatImageCacheKey) {
    let byteCount = payload.data.count
    guard byteCount <= Self.maxCachedImageBytes else { return }
    if let existing = imageCache.removeValue(forKey: key) {
      imageCacheBytes -= existing.data.count
      if let idx = imageCacheOrder.firstIndex(of: key) { imageCacheOrder.remove(at: idx) }
    }
    while !imageCacheOrder.isEmpty
      && (imageCacheBytes + byteCount > Self.maxCachedImageBytes
        || imageCache.count >= Self.maxCachedImages)
    {
      let oldest = imageCacheOrder.removeFirst()
      if let removed = imageCache.removeValue(forKey: oldest) {
        imageCacheBytes -= removed.data.count
      }
    }
    imageCache[key] = payload
    imageCacheOrder.append(key)
    imageCacheBytes += byteCount
  }

  private func clearImageCache() {
    imageCache.removeAll(keepingCapacity: false)
    imageCacheOrder.removeAll(keepingCapacity: false)
    imageCacheBytes = 0
    RichChatDecodedImageCache.shared.clear()
  }

}
