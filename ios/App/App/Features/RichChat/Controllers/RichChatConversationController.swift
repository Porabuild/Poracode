import Foundation
import Observation

enum RichChatConversationOperation: Equatable, Sendable {
  case send
  case interrupt
  case close
  case truncate
  case command
  case goal
  case setSteer
  case clearSteer
  case queueFollowUp
  case removeQueuedFollowUp
  case reorderQueuedFollowUp
  case editQueuedFollowUp
  case steerQueuedFollowUp
  case pauseFollowUps
  case resumeFollowUps
  case stage
  case rollback
  case revertCheckpoint
}

struct RichChatConversationControllerState: Equatable, Sendable {
  var access: RichChatSessionAccess?
  var target: RichChatThreadTarget?
  var isSending = false
  var activeMutation: RichChatConversationOperation?
  var lastCompletedOperation: RichChatConversationOperation?
  var failure: RichChatControllerFailure?
  var requiresAuthoritativeRefresh = false
}

/// Serializes sends and owns all selected-thread conversation mutations. Interrupt has a
/// separate owner so it can stop a turn while a send acknowledgement is still in flight.
@MainActor
@Observable
final class RichChatConversationController {
  private(set) var state = RichChatConversationControllerState()

  private let gateway: any RichChatConversationGateway
  private let refreshRequester: any RichChatAuthoritativeRefreshRequesting
  private let sendTask = RichChatControllerTaskSlot()
  private let mutationTask = RichChatControllerTaskSlot()
  private let interruptTask = RichChatControllerTaskSlot()
  private var revision: UInt64 = 0
  private var isBackgrounded = false

  init(
    gateway: any RichChatConversationGateway,
    refreshRequester: any RichChatAuthoritativeRefreshRequesting =
      RichChatNoopRefreshRequester()
  ) {
    self.gateway = gateway
    self.refreshRequester = refreshRequester
  }

  func activate(access: RichChatSessionAccess, threadID: String) {
    cancelOwnedWork()
    revision &+= 1
    isBackgrounded = false
    state = RichChatConversationControllerState(
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
    state = RichChatConversationControllerState()
  }

  func enterBackground() {
    cancelOwnedWork()
    revision &+= 1
    isBackgrounded = true
    state.isSending = false
    state.activeMutation = nil
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
  func send(_ input: RichChatSendInput) async -> Bool {
    guard !input.prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      state.failure = .invalidRequest
      return false
    }
    guard !state.isSending else {
      state.failure = .busy
      return false
    }
    guard let context = operationContext(capability: .sessionOperate) else { return false }
    state.isSending = true
    state.failure = nil
    sendTask.launch { [weak self] in
      guard let self else { return }
      await self.finish(
        operation: .send,
        target: context.target,
        revision: context.revision,
        refreshOnSuccess: false,
        call: { try await self.gateway.sendRichInput(target: context.target, input: input) }
      )
      if self.owns(context) { self.state.isSending = false }
    }
    await sendTask.wait()
    return owns(context)
      && state.failure == nil
      && state.lastCompletedOperation == .send
  }

  func interrupt() async {
    guard let context = operationContext(capability: .sessionOperate) else { return }
    interruptTask.launch { [weak self] in
      guard let self else { return }
      await self.finish(
        operation: .interrupt,
        target: context.target,
        revision: context.revision,
        refreshOnSuccess: false,
        call: { try await self.gateway.interruptRichThread(target: context.target) }
      )
    }
    await interruptTask.wait()
  }

  func close() async {
    await runMutation(.close, refreshOnSuccess: true) { gateway, target in
      try await gateway.closeRichThread(target: target)
    }
  }

  func truncate(after itemID: String) async {
    guard !itemID.isEmpty else {
      state.failure = .invalidRequest
      return
    }
    await runMutation(.truncate, refreshOnSuccess: true) { gateway, target in
      try await gateway.truncateRichRuntime(target: target, after: itemID)
    }
  }

  func runCommand(_ command: RichChatThreadCommand) async {
    await runMutation(.command, refreshOnSuccess: true) { gateway, target in
      try await gateway.runRichThreadCommand(target: target, command: command)
    }
  }

  func updateGoal(_ update: RichChatGoalUpdate) async {
    if case .edit(let objective) = update,
      objective.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      state.failure = .invalidRequest
      return
    }
    await runMutation(.goal, refreshOnSuccess: false) { gateway, target in
      try await gateway.updateRichGoal(target: target, update: update)
    }
  }

  @discardableResult
  func setPendingSteer(_ input: RichSetPendingSteerInput) async -> Bool {
    guard !input.prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      state.failure = .invalidRequest
      return false
    }
    await runMutation(.setSteer, refreshOnSuccess: false) { gateway, target in
      try await gateway.setRichSteer(target: target, input: input)
    }
    return state.lastCompletedOperation == .setSteer && state.failure == nil
  }

  func clearPendingSteer() async {
    await runMutation(.clearSteer, refreshOnSuccess: false) { gateway, target in
      try await gateway.clearRichSteer(target: target)
    }
  }

  /// Queue mutations never request an authoritative refresh on success: the
  /// host republishes the queue per thread via the replayable
  /// `thread-follow-up-queue` broadcast, which is the source of truth.
  @discardableResult
  func queueFollowUp(_ input: RichSetPendingSteerInput) async -> Bool {
    guard !input.prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      state.failure = .invalidRequest
      return false
    }
    await runMutation(.queueFollowUp, refreshOnSuccess: false) { gateway, target in
      try await gateway.queueRichFollowUp(target: target, input: input)
    }
    return state.lastCompletedOperation == .queueFollowUp && state.failure == nil
  }

  func removeQueuedFollowUp(id: String) async {
    await runMutation(.removeQueuedFollowUp, refreshOnSuccess: false) { gateway, target in
      try await gateway.removeRichQueuedFollowUp(target: target, id: id)
    }
  }

  func reorderQueuedFollowUp(id: String, beforeID: String?) async {
    await runMutation(.reorderQueuedFollowUp, refreshOnSuccess: false) { gateway, target in
      try await gateway.reorderRichQueuedFollowUp(target: target, id: id, beforeID: beforeID)
    }
  }

  @discardableResult
  func editQueuedFollowUp(_ edit: RichQueuedFollowUpEdit) async -> Bool {
    guard !edit.prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      state.failure = .invalidRequest
      return false
    }
    await runMutation(.editQueuedFollowUp, refreshOnSuccess: false) { gateway, target in
      try await gateway.editRichQueuedFollowUp(target: target, edit: edit)
    }
    return state.lastCompletedOperation == .editQueuedFollowUp && state.failure == nil
  }

  @discardableResult
  func steerQueuedFollowUp(id: String) async -> Bool {
    await runMutation(.steerQueuedFollowUp, refreshOnSuccess: false) { gateway, target in
      try await gateway.steerRichQueuedFollowUp(target: target, id: id)
    }
    return state.lastCompletedOperation == .steerQueuedFollowUp && state.failure == nil
  }

  /// Must complete before an edit with `expectedStagedAt` is accepted: the
  /// server rejects staged-at edits on unpaused records.
  @discardableResult
  func pauseFollowUps(id: String) async -> Bool {
    await runMutation(.pauseFollowUps, refreshOnSuccess: false) { gateway, target in
      try await gateway.pauseRichFollowUps(target: target, id: id)
    }
    return state.lastCompletedOperation == .pauseFollowUps && state.failure == nil
  }

  func resumeFollowUps() async {
    await runMutation(.resumeFollowUps, refreshOnSuccess: false) { gateway, target in
      try await gateway.resumeRichFollowUps(target: target)
    }
  }

  func stage(prompt: String, segments: [RichPromptSegment]? = nil) async {
    guard !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      state.failure = .invalidRequest
      return
    }
    await runMutation(.stage, refreshOnSuccess: true) { gateway, target in
      try await gateway.stageRichInput(target: target, prompt: prompt, segments: segments)
    }
  }

  func rollback(turnCount: Int, config: [String: RichJSON]? = nil) async {
    guard turnCount > 0 else {
      state.failure = .invalidRequest
      return
    }
    await runMutation(.rollback, refreshOnSuccess: true) { gateway, target in
      try await gateway.rollbackRichConversation(
        target: target,
        turnCount: turnCount,
        config: config
      )
    }
  }

  @discardableResult
  func revertToCheckpoint(_ input: RichChatCheckpointRevertInput) async -> Bool {
    guard !input.checkpointItemID.isEmpty else {
      state.failure = .invalidRequest
      return false
    }
    await runMutation(.revertCheckpoint, refreshOnSuccess: true) { gateway, target in
      // WS2 stage 4: the host owns the compound — provider rollback, file
      // restore and transcript truncation run as one journaled operation, so
      // the client is down to a single idempotent call.
      try await gateway.checkpointRevert(
        target: target,
        itemID: input.checkpointItemID,
        operationKey: "checkpoint-revert.\(target.threadID).\(input.checkpointItemID)"
      )
    }
    return state.lastCompletedOperation == .revertCheckpoint && state.failure == nil
  }

  private struct OperationContext: Sendable {
    let target: RichChatThreadTarget
    let revision: UInt64
  }

  private func runMutation(
    _ operation: RichChatConversationOperation,
    refreshOnSuccess: Bool,
    call:
      @escaping @Sendable (
        any RichChatConversationGateway, RichChatThreadTarget
      ) async throws -> Void
  ) async {
    guard state.activeMutation == nil else {
      state.failure = .busy
      return
    }
    guard let context = operationContext(capability: .sessionOperate) else { return }
    state.activeMutation = operation
    state.failure = nil
    mutationTask.launch { [weak self] in
      guard let self else { return }
      await self.finish(
        operation: operation,
        target: context.target,
        revision: context.revision,
        refreshOnSuccess: refreshOnSuccess,
        call: { try await call(self.gateway, context.target) }
      )
      if self.owns(context) { self.state.activeMutation = nil }
    }
    await mutationTask.wait()
  }

  private func finish(
    operation: RichChatConversationOperation,
    target: RichChatThreadTarget,
    revision: UInt64,
    refreshOnSuccess: Bool,
    call: @escaping @Sendable () async throws -> Void
  ) async {
    do {
      try await call()
      try Task.checkCancellation()
      guard owns(target: target, revision: revision) else { return }
      state.lastCompletedOperation = operation
      state.failure = nil
      if refreshOnSuccess {
        await refreshRequester.requestRichChatRefresh(
          target: target,
          reason: .conversationChanged
        )
      }
    } catch is CancellationError {
      return
    } catch {
      guard owns(target: target, revision: revision) else { return }
      let failure = RichChatControllerFailure.map(error)
      state.failure = failure
      if failure == .ambiguousOutcome {
        state.requiresAuthoritativeRefresh = true
        await refreshRequester.requestRichChatRefresh(
          target: target,
          reason: .ambiguousMutation
        )
      }
    }
  }

  private func operationContext(capability: RichChatCapability) -> OperationContext? {
    guard !isBackgrounded, let target = state.target, let access = state.access else {
      state.failure = .unavailable
      return nil
    }
    if let failure = access.controllerGate(capability) {
      state.failure = failure
      return nil
    }
    return OperationContext(target: target, revision: revision)
  }

  private func owns(_ context: OperationContext) -> Bool {
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

  private func cancelOwnedWork() {
    sendTask.cancel()
    mutationTask.cancel()
    interruptTask.cancel()
  }
}
