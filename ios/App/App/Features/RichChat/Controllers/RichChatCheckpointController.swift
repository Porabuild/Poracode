import Foundation
import Observation

enum RichChatCheckpointLoadState: Equatable, Sendable {
  case idle
  case loading
  case loaded
  case empty
  case failed(RichChatControllerFailure)
}

enum RichChatCheckpointOperation: Equatable, Sendable {
  case create
  case finalize
  case restore
}

struct RichChatCheckpointControllerState: Equatable, Sendable {
  var access: RichChatSessionAccess?
  var target: RichChatThreadTarget?
  var collection = RichChatCheckpointCollection(checkpoints: [], turns: [])
  var loadState: RichChatCheckpointLoadState = .idle
  var activeMutation: RichChatCheckpointOperation?
  var failure: RichChatControllerFailure?
  var requiresAuthoritativeRefresh = false
}

@MainActor
@Observable
final class RichChatCheckpointController {
  private(set) var state = RichChatCheckpointControllerState()

  private let historyGateway: any RichChatHistoryGateway
  private let conversationGateway: any RichChatConversationGateway
  private let refreshRequester: any RichChatAuthoritativeRefreshRequesting
  private let loadTask = RichChatControllerTaskSlot()
  private let mutationTask = RichChatControllerTaskSlot()
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
    state = RichChatCheckpointControllerState(
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
    state = RichChatCheckpointControllerState()
  }

  func enterBackground() {
    cancelOwnedWork()
    revision &+= 1
    isBackgrounded = true
    state.activeMutation = nil
    if state.loadState == .loading { state.loadState = .idle }
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

  func load(projectLocation: ProjectLocation) async {
    guard let context = context(capability: .sessionRead) else { return }
    state.loadState = .loading
    loadTask.launch { [weak self] in
      guard let self else { return }
      do {
        let collection = try await self.historyGateway.listRichCheckpoints(
          target: context.target,
          projectLocation: projectLocation
        )
        try Task.checkCancellation()
        guard self.owns(context),
          (collection.checkpoints + collection.turns).allSatisfy({
            $0.threadID == context.target.threadID
          })
        else {
          if self.owns(context) { self.state.loadState = .failed(.invalidResponse) }
          return
        }
        self.state.collection = collection
        self.state.loadState =
          collection.checkpoints.isEmpty && collection.turns.isEmpty ? .empty : .loaded
      } catch is CancellationError {
        guard self.owns(context) else { return }
        self.state.loadState = .idle
        return
      } catch {
        guard self.owns(context) else { return }
        self.state.loadState = .failed(.map(error))
      }
    }
    await loadTask.wait()
  }

  func create(itemID: String, projectLocation: ProjectLocation) async {
    guard !itemID.isEmpty else {
      state.failure = .invalidRequest
      return
    }
    await runMutation(.create) { gateway, target in
      let checkpoint = try await gateway.createRichCheckpoint(
        target: target,
        itemID: itemID,
        projectLocation: projectLocation
      )
      guard checkpoint.threadID == target.threadID,
        checkpoint.checkpointItemID == itemID,
        !checkpoint.isTurn
      else { throw RichChatGatewayError.invalidResponse }
      return checkpoint
    }
  }

  func finalize(
    itemID: String,
    baseItemID: String,
    projectLocation: ProjectLocation
  ) async {
    guard !itemID.isEmpty, !baseItemID.isEmpty else {
      state.failure = .invalidRequest
      return
    }
    await runMutation(.finalize) { gateway, target in
      let checkpoint = try await gateway.finalizeRichCheckpoint(
        target: target,
        itemID: itemID,
        baseItemID: baseItemID,
        projectLocation: projectLocation
      )
      guard checkpoint.threadID == target.threadID,
        checkpoint.checkpointItemID == itemID,
        checkpoint.baseCheckpointItemID == baseItemID,
        checkpoint.isTurn
      else { throw RichChatGatewayError.invalidResponse }
      return checkpoint
    }
  }

  func restore(itemID: String, projectLocation: ProjectLocation) async {
    guard !itemID.isEmpty else {
      state.failure = .invalidRequest
      return
    }
    guard state.activeMutation == nil else {
      state.failure = .busy
      return
    }
    guard let context = context(capability: .sessionOperate) else { return }
    state.activeMutation = .restore
    state.failure = nil
    mutationTask.launch { [weak self] in
      guard let self else { return }
      do {
        try await self.conversationGateway.restoreRichCheckpoint(
          target: context.target,
          itemID: itemID,
          projectLocation: projectLocation
        )
        try Task.checkCancellation()
        guard self.owns(context) else { return }
        self.state.activeMutation = nil
        await self.refreshRequester.requestRichChatRefresh(
          target: context.target,
          reason: .conversationChanged
        )
      } catch is CancellationError {
        guard self.owns(context) else { return }
        self.state.activeMutation = nil
        return
      } catch {
        await self.finishFailure(error, context: context)
      }
    }
    await mutationTask.wait()
  }

  private struct Context: Sendable {
    let target: RichChatThreadTarget
    let revision: UInt64
  }

  private func runMutation(
    _ operation: RichChatCheckpointOperation,
    call:
      @escaping @Sendable (
        any RichChatConversationGateway, RichChatThreadTarget
      ) async throws -> RichCheckpoint
  ) async {
    guard state.activeMutation == nil else {
      state.failure = .busy
      return
    }
    guard let context = context(capability: .sessionOperate) else { return }
    state.activeMutation = operation
    state.failure = nil
    mutationTask.launch { [weak self] in
      guard let self else { return }
      do {
        let checkpoint = try await call(self.conversationGateway, context.target)
        try Task.checkCancellation()
        guard self.owns(context) else { return }
        if checkpoint.isTurn {
          self.state.collection = RichChatCheckpointCollection(
            checkpoints: self.state.collection.checkpoints,
            turns: self.state.collection.turns.filter { $0.id != checkpoint.id } + [checkpoint]
          )
        } else {
          self.state.collection = RichChatCheckpointCollection(
            checkpoints: self.state.collection.checkpoints.filter { $0.id != checkpoint.id }
              + [checkpoint],
            turns: self.state.collection.turns
          )
        }
        self.state.activeMutation = nil
        self.state.failure = nil
      } catch is CancellationError {
        guard self.owns(context) else { return }
        self.state.activeMutation = nil
        return
      } catch {
        await self.finishFailure(error, context: context)
      }
    }
    await mutationTask.wait()
  }

  private func finishFailure(_ error: any Error, context: Context) async {
    guard owns(context) else { return }
    let failure = RichChatControllerFailure.map(error)
    state.activeMutation = nil
    state.failure = failure
    if failure == .ambiguousOutcome {
      state.requiresAuthoritativeRefresh = true
      await refreshRequester.requestRichChatRefresh(
        target: context.target,
        reason: .ambiguousMutation
      )
    }
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
    loadTask.cancel()
    mutationTask.cancel()
  }
}
