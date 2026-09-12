import Foundation
import Observation

/// The watch id, selected-host lease, thread id, and terminal cursor generation jointly own
/// terminal output. Any mismatch is ignored, including late frames after backgrounding.
@MainActor
@Observable
final class RichChatTerminalController {
  private(set) var state = RichChatTerminalControllerState()

  private let gateway: any RichChatTerminalGateway
  private let watchIDGenerator: any RichChatWatchIDGenerating
  private let refreshRequester: any RichChatAuthoritativeRefreshRequesting
  private let watchTask = RichChatControllerTaskSlot()
  private let streamTask = RichChatControllerTaskSlot()
  private let resyncTask = RichChatControllerTaskSlot()
  private let operationTask = RichChatControllerTaskSlot()
  private var revision: UInt64 = 0
  private var isBackgrounded = false

  init(
    gateway: any RichChatTerminalGateway,
    watchIDGenerator: any RichChatWatchIDGenerating = RichChatUUIDWatchIDGenerator(),
    refreshRequester: any RichChatAuthoritativeRefreshRequesting =
      RichChatNoopRefreshRequester()
  ) {
    self.gateway = gateway
    self.watchIDGenerator = watchIDGenerator
    self.refreshRequester = refreshRequester
  }

  func activate(access: RichChatSessionAccess, threadID: String) {
    let previousTarget = state.target
    cancelOwnedWork()
    revision &+= 1
    isBackgrounded = false
    let nextTarget = RichChatThreadTarget(lease: access.lease, threadID: threadID)
    state = RichChatTerminalControllerState(
      access: access,
      target: nextTarget
    )
    if let previousTarget, previousTarget != nextTarget {
      Task { [gateway] in await gateway.stopRichTerminalTransport(target: previousTarget) }
    }
  }

  func updateAccess(_ access: RichChatSessionAccess) {
    guard state.target?.lease == access.lease else {
      deactivate()
      return
    }
    state.access = access
  }

  func deactivate() {
    let target = state.target
    cancelOwnedWork()
    revision &+= 1
    isBackgrounded = false
    state = RichChatTerminalControllerState()
    if let target {
      Task { [gateway] in await gateway.stopRichTerminalTransport(target: target) }
    }
  }

  func enterBackground() {
    let target = state.target
    cancelOwnedWork()
    revision &+= 1
    isBackgrounded = true
    state.terminalID = nil
    state.watchID = nil
    state.cursor = nil
    state.exit = nil
    state.lifecycle = .inactive
    state.connectionState = .idle
    state.operation = nil
    if let target {
      Task { [gateway] in await gateway.stopRichTerminalTransport(target: target) }
    }
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

  /// Applies an accepted, contiguous `thread-reset` for the exact watched thread.
  ///
  /// Canonical semantics (`resetForNewPty` in `XTermSurface.tsx`): the PTY restarted,
  /// so this watch generation's transcript, cursor, and baseline are dropped, while
  /// the watch *intent* survives — the surface re-hydrates once against the new
  /// generation. When the session is no longer scope-authorized, online, or ready,
  /// the stale transcript is still dropped but no fresh watch is requested.
  @discardableResult
  func applyHostThreadReset(threadID: String) -> Bool {
    guard !isBackgrounded, let target = state.target, target.threadID == threadID,
      let terminalID = state.terminalID
    else { return false }
    // Any in-flight watch or pending rebaseline belongs to the dead generation.
    watchTask.cancel()
    resyncTask.cancel()
    state.watchID = nil
    state.cursor = nil
    state.exit = nil
    state.failure = nil
    state.requiresAuthoritativeRefresh = false
    guard let access = state.access, access.controllerGate(.terminalRead) == nil else {
      state.lifecycle = .inactive
      state.connectionState = .idle
      return false
    }
    state.lifecycle = .starting
    state.connectionState = .connecting
    let owner = revision
    // Exactly one fresh watch: the slot cancels any predecessor before launching,
    // and a cancelled rebaseline (exit, dismissal, host switch) never reaches the
    // gateway — cancellation is not an error and is never retried.
    resyncTask.launch { [weak self] in
      guard !Task.isCancelled, let self, self.owns(target: target, revision: owner),
        self.state.terminalID == terminalID
      else { return }
      await self.watch(terminalID: terminalID)
    }
    return true
  }

  /// Applies an accepted `thread-exited` for the exact watched thread.
  ///
  /// The authority marks the PTY exited and never re-opens it, so the transcript,
  /// the watch intent, and the lifecycle are all left alone and no fresh watch is
  /// requested.
  @discardableResult
  func applyHostThreadExit(threadID: String, exitCode: Int?) -> Bool {
    guard !isBackgrounded, let target = state.target, target.threadID == threadID,
      let terminalID = state.terminalID
    else { return false }
    // A pending rebaseline would re-open a terminal the host just reported gone.
    resyncTask.cancel()
    state.exit = RichChatTerminalExit(terminalID: terminalID, exitCode: exitCode)
    return true
  }

  func start(_ input: RichChatTerminalStartInput) async {
    guard !input.shellID.isEmpty,
      input.initialSize.map(RichChatTerminalWatchPolicy.isValidSize) ?? true
    else {
      state.failure = .invalidRequest
      return
    }
    await runOperation(.start) { gateway, target in
      try await gateway.startRichTerminal(target: target, input: input)
    }
  }

  func watch(terminalID: String) async {
    guard !terminalID.isEmpty else {
      state.failure = .invalidRequest
      return
    }
    guard let context = context(capability: .terminalRead) else { return }
    let watchID = watchIDGenerator.makeRichChatWatchID()
    guard !watchID.isEmpty else {
      state.failure = .invalidRequest
      return
    }
    watchTask.cancel()
    state.terminalID = terminalID
    state.watchID = watchID
    state.cursor = .watching(watchID)
    state.lifecycle = .starting
    state.connectionState = .connecting
    state.failure = nil
    state.requiresAuthoritativeRefresh = false
    do {
      try await ensureEventStream(context)
    } catch is CancellationError {
      return
    } catch {
      guard owns(context) else { return }
      let failure = RichChatControllerFailure.map(error)
      let retryable = RichChatTerminalWatchPolicy.isRetryableWatchFailure(failure)
      state.lifecycle = .watchFailed(retryable: retryable)
      state.connectionState = .failed(retryable: retryable)
      state.failure = failure
      return
    }
    watchTask.launch { [weak self] in
      guard let self else { return }
      do {
        try await self.gateway.watchRichTerminal(
          target: context.target,
          terminalID: terminalID,
          watchID: watchID
        )
        try Task.checkCancellation()
        guard self.owns(context), self.state.terminalID == terminalID,
          self.state.watchID == watchID
        else { return }
        self.state.lifecycle = .watching
        self.state.connectionState = .watching
      } catch is CancellationError {
        guard self.owns(context), self.state.watchID == watchID else { return }
        self.clearWatch()
        return
      } catch {
        guard self.owns(context), self.state.watchID == watchID else { return }
        let failure = RichChatControllerFailure.map(error)
        let retryable = RichChatTerminalWatchPolicy.isRetryableWatchFailure(failure)
        self.state.lifecycle = .watchFailed(retryable: retryable)
        self.state.connectionState = .failed(retryable: retryable)
        self.state.failure = failure
      }
    }
    await watchTask.wait()
  }

  func unwatch() async {
    guard let target = state.target, let access = state.access,
      let terminalID = state.terminalID
    else { return }
    if let failure = access.controllerGate(.terminalRead) {
      state.failure = failure
      return
    }
    watchTask.cancel()
    let owner = revision
    watchTask.launch { [weak self] in
      guard let self else { return }
      do {
        try await self.gateway.unwatchRichTerminal(target: target, terminalID: terminalID)
        try Task.checkCancellation()
        guard self.owns(target: target, revision: owner) else { return }
        self.clearWatch()
      } catch is CancellationError {
        return
      } catch {
        guard self.owns(target: target, revision: owner) else { return }
        self.state.failure = .map(error)
      }
    }
    await watchTask.wait()
  }

  func receive(
    _ frame: RichChatTerminalServerFrame,
    target: RichChatThreadTarget
  ) async {
    guard !isBackgrounded, target == state.target else { return }
    switch frame {
    case .cursor(let cursorFrame):
      guard cursorFrame.terminalID == state.terminalID,
        cursorFrame.watchID == state.watchID,
        let cursor = state.cursor
      else { return }
      let result = TerminalCursorReconciler.reconcile(state: cursor, frame: cursorFrame)
      state.cursor = result.state
      if result.action == .resync, !state.requiresAuthoritativeRefresh {
        state.requiresAuthoritativeRefresh = true
        await refreshRequester.requestRichChatRefresh(
          target: target,
          reason: .terminalCursorInvalidated
        )
        scheduleFreshBaseline(terminalID: cursorFrame.terminalID, target: target)
      }
    case .legacyOutput(let terminalID, _):
      guard terminalID == state.terminalID else { return }
      state.failure = .invalidResponse
    case .watchError(let error):
      guard error.terminalID == state.terminalID, error.watchID == state.watchID else { return }
      state.lifecycle = .watchFailed(retryable: error.retryable)
      state.connectionState = .failed(retryable: error.retryable)
      switch error.code {
      case .forbidden:
        state.failure = .authorizationDenied
      case .notFound:
        state.failure = .rejected(statusCode: 404, code: "terminal_not_found")
      case .unavailable:
        state.failure = .unavailable
      }
      if error.retryable {
        scheduleFreshBaseline(terminalID: error.terminalID, target: target)
      }
    }
  }

  func write(_ data: String) async {
    guard !data.isEmpty else { return }
    guard state.lifecycle == .watching else {
      state.failure = .unavailable
      return
    }
    await runOperation(.input) { gateway, target in
      try await gateway.writeRichTerminal(target: target, data: data)
    }
  }

  func resize(_ size: RichChatTerminalSize) async {
    guard RichChatTerminalWatchPolicy.isValidSize(size) else {
      state.failure = .invalidRequest
      return
    }
    guard state.lifecycle == .watching else { return }
    await runOperation(.resize) { gateway, target in
      try await gateway.resizeRichTerminal(target: target, size: size)
    }
  }

  func close() async {
    await runOperation(.close, clearWatchOnSuccess: true, stopTransportOnSuccess: true) {
      gateway, target in
      try await gateway.closeRichTerminal(target: target)
    }
  }

  func suspendTransport() async {
    guard let target = state.target else { return }
    await gateway.stopRichTerminalTransport(target: target)
  }

  private struct Context: Sendable {
    let target: RichChatThreadTarget
    let revision: UInt64
  }

  private func runOperation(
    _ operation: RichChatTerminalOperation,
    clearWatchOnSuccess: Bool = false,
    stopTransportOnSuccess: Bool = false,
    call:
      @escaping @Sendable (
        any RichChatTerminalGateway, RichChatThreadTarget
      ) async throws -> Void
  ) async {
    guard state.operation == nil else {
      state.failure = .busy
      return
    }
    guard let context = context(capability: .terminalOperate) else { return }
    state.operation = operation
    state.failure = nil
    operationTask.launch { [weak self] in
      guard let self else { return }
      do {
        try await call(self.gateway, context.target)
        try Task.checkCancellation()
        guard self.owns(context) else { return }
        self.state.operation = nil
        if clearWatchOnSuccess { self.clearWatch() }
        if stopTransportOnSuccess {
          await self.gateway.stopRichTerminalTransport(target: context.target)
        }
      } catch is CancellationError {
        guard self.owns(context) else { return }
        self.state.operation = nil
        return
      } catch {
        guard self.owns(context) else { return }
        let failure = RichChatControllerFailure.map(error)
        self.state.operation = nil
        self.state.failure = failure
        if failure == .ambiguousOutcome {
          self.state.requiresAuthoritativeRefresh = true
          await self.refreshRequester.requestRichChatRefresh(
            target: context.target,
            reason: .ambiguousMutation
          )
        }
      }
    }
    await operationTask.wait()
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
    owns(target: context.target, revision: context.revision)
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

  private func clearWatch() {
    state.terminalID = nil
    state.watchID = nil
    state.cursor = nil
    state.lifecycle = .inactive
    state.connectionState = .idle
  }

  private func cancelOwnedWork() {
    watchTask.cancel()
    streamTask.cancel()
    resyncTask.cancel()
    operationTask.cancel()
  }

  private func ensureEventStream(_ context: Context) async throws {
    guard !streamTask.isRunning else { return }
    let events = try await gateway.richTerminalEvents(target: context.target)
    guard owns(context) else { throw CancellationError() }
    streamTask.launch { [weak self] in
      guard let self else { return }
      for await event in events {
        guard !Task.isCancelled, self.owns(context) else { return }
        await self.receive(event, target: context.target)
      }
    }
  }

  private func receive(
    _ event: RichChatTerminalTransportEvent,
    target: RichChatThreadTarget
  ) async {
    guard target == state.target, !isBackgrounded else { return }
    switch event {
    case .frame(let frame):
      await receive(frame, target: target)
    case .connection(let connection):
      state.connectionState = connection
      switch connection {
      case .idle:
        if state.terminalID != nil { state.lifecycle = .inactive }
      case .connecting, .reconnecting:
        state.lifecycle = .starting
        state.failure = nil
      case .watching:
        state.lifecycle = .watching
        state.failure = nil
      case .failed(let retryable):
        state.lifecycle = .watchFailed(retryable: retryable)
        state.failure = .transport
      }
    }
  }

  private func scheduleFreshBaseline(
    terminalID: String,
    target: RichChatThreadTarget
  ) {
    let owner = revision
    resyncTask.launch { [weak self] in
      do {
        try await Task.sleep(for: .milliseconds(250))
        try Task.checkCancellation()
      } catch { return }
      guard let self, self.owns(target: target, revision: owner),
        self.state.terminalID == terminalID
      else { return }
      await self.watch(terminalID: terminalID)
    }
  }

}
