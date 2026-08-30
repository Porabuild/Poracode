import Foundation
import Observation

@MainActor
@Observable
final class ThreadLifecycleController {
  typealias AuthoritativeRefresh = @MainActor @Sendable (ThreadHostLease) async -> Void
  typealias CommandIDProvider = @Sendable () -> String

  private(set) var target: ThreadLifecycleTarget?
  private(set) var isBusy = false
  private(set) var queuedOperationCount = 0
  private(set) var lastOutcome: ThreadLifecycleOutcome?
  private(set) var lastStartedThreadID: String?
  private(set) var pendingDestructiveIntent: ThreadLifecycleDestructiveIntent?

  private let gateway: any ThreadLifecycleGateway
  private let serializer: ThreadLifecycleOperationSerializer
  private let authoritativeRefresh: AuthoritativeRefresh
  private let commandIDProvider: CommandIDProvider
  private var activationRevision: UInt64 = 0
  private var submissionRevision: UInt64 = 0

  init(
    gateway: any ThreadLifecycleGateway,
    serializer: ThreadLifecycleOperationSerializer = ThreadLifecycleOperationSerializer(),
    commandIDProvider: @escaping CommandIDProvider = { UUID().uuidString },
    authoritativeRefresh: @escaping AuthoritativeRefresh = { _ in }
  ) {
    self.gateway = gateway
    self.serializer = serializer
    self.commandIDProvider = commandIDProvider
    self.authoritativeRefresh = authoritativeRefresh
  }

  func activate(_ target: ThreadLifecycleTarget) {
    activationRevision &+= 1
    self.target = target
    lastOutcome = nil
    lastStartedThreadID = nil
    pendingDestructiveIntent = nil
  }

  func deactivate() {
    activationRevision &+= 1
    target = nil
    lastOutcome = nil
    lastStartedThreadID = nil
    pendingDestructiveIntent = nil
  }

  func start(
    _ request: ThreadStartExistingRequest,
    target capturedTarget: ThreadLifecycleTarget? = nil
  ) async {
    guard let operationTarget = capturedTarget ?? target else { return }
    let commandID = commandIDProvider()
    await execute(action: .start, target: operationTarget) { [gateway] in
      try await gateway.startExistingThread(
        target: operationTarget,
        request: request,
        commandID: commandID
      )
    } apply: { [weak self] threadID in
      self?.lastStartedThreadID = threadID
    }
  }

  func relaunch(
    _ request: ThreadRelaunchRequest,
    target: ThreadLifecycleTarget? = nil
  ) async {
    await run(
      .start(request),
      action: .relaunch,
      commandID: commandIDProvider(),
      capturedTarget: target
    )
  }

  func prepareWorktree(projectID: String, worktreePath: String) async {
    await run(
      .prepareWorktree(projectID: projectID, worktreePath: worktreePath),
      action: .prepareWorktree
    )
  }

  func setGroup(id: String, name: String) async {
    await run(.setGroup(groupID: id, groupName: name), action: .setGroup)
  }

  func clearGroup(target: ThreadLifecycleTarget? = nil) async {
    await run(.clearGroup, action: .setGroup, capturedTarget: target)
  }

  func rename(to title: String, target: ThreadLifecycleTarget? = nil) async {
    await run(.rename(title: title), action: .rename, capturedTarget: target)
  }

  func acknowledge(target: ThreadLifecycleTarget? = nil) async {
    await run(.acknowledge, action: .acknowledge, capturedTarget: target)
  }

  func setDone(_ done: Bool, target: ThreadLifecycleTarget? = nil) async {
    await run(.setDone(done), action: .setDone, capturedTarget: target)
  }

  func setPinned(_ pinned: Bool, target: ThreadLifecycleTarget? = nil) async {
    await run(.setStarred(pinned), action: .setPinned, capturedTarget: target)
  }

  func setWorktree(path: String, branch: String? = nil, isNew: Bool? = nil) async {
    await run(
      .setWorktree(path: path, branch: branch, isNew: isNew),
      action: .setWorktree
    )
  }

  func archive() {
    guard let target else { return }
    pendingDestructiveIntent = .archive(target: target)
  }

  func unarchive(target: ThreadLifecycleTarget? = nil) async {
    await run(.unarchive, action: .unarchive, capturedTarget: target)
  }

  func delete() {
    guard let target else { return }
    pendingDestructiveIntent = .delete(target: target)
  }

  func deleteWorktreeGroup(
    projectID: String,
    worktreePath: String,
    threadIDs: [String]
  ) {
    guard let target else { return }
    pendingDestructiveIntent = .deleteWorktreeGroup(
      target: target,
      projectID: projectID,
      worktreePath: worktreePath,
      threadIDs: threadIDs
    )
  }

  func cancelDestructiveIntent() {
    pendingDestructiveIntent = nil
  }

  func clearLastOutcome() {
    lastOutcome = nil
  }

  func confirmDestructiveIntent() async {
    guard let intent = pendingDestructiveIntent else { return }
    pendingDestructiveIntent = nil
    guard target == intent.target else { return }
    switch intent {
    case .archive(let target):
      await run(.archive, action: .archive, capturedTarget: target)
    case .delete(let target):
      await run(.delete, action: .delete, capturedTarget: target)
    case .deleteWorktreeGroup(
      let target, let projectID, let worktreePath, let threadIDs):
      await run(
        .deleteWorktreeGroup(
          projectID: projectID,
          worktreePath: worktreePath,
          threadIDs: threadIDs
        ),
        action: .deleteWorktreeGroup,
        capturedTarget: target
      )
    }
  }

  private func run(
    _ command: ThreadRemoteCommand,
    action: ThreadLifecycleAction,
    commandID: String? = nil,
    capturedTarget: ThreadLifecycleTarget? = nil
  ) async {
    guard let operationTarget = capturedTarget ?? target else { return }
    await execute(action: action, target: operationTarget) { [gateway] in
      try await gateway.runThreadCommand(
        target: operationTarget,
        command: command,
        commandID: commandID
      )
    } apply: { _ in
    }
  }

  private func execute<Value: Sendable>(
    action: ThreadLifecycleAction,
    target operationTarget: ThreadLifecycleTarget,
    operation: @escaping @Sendable () async throws -> Value,
    apply: @escaping @MainActor (Value) -> Void
  ) async {
    let capturedActivation = activationRevision
    submissionRevision &+= 1
    let submission = submissionRevision
    queuedOperationCount += 1
    isBusy = true
    defer {
      queuedOperationCount -= 1
      isBusy = queuedOperationCount > 0
    }

    do {
      let value = try await serializer.perform { [weak self] in
        do {
          return try await operation()
        } catch let error as ThreadLifecycleGatewayError
          where error == .ambiguousOutcome
        {
          await self?.refreshAfterAmbiguity(
            target: operationTarget,
            activation: capturedActivation
          )
          throw error
        }
      }
      guard
        owns(
          operationTarget,
          activation: capturedActivation,
          submission: submission
        )
      else { return }
      apply(value)
      lastOutcome = .succeeded(action)
      if action == .delete {
        activationRevision &+= 1
        target = nil
        pendingDestructiveIntent = nil
      }
    } catch is CancellationError {
      return
    } catch {
      guard
        owns(
          operationTarget,
          activation: capturedActivation,
          submission: submission
        )
      else { return }
      lastOutcome = .failed(action, .map(error))
    }
  }

  private func refreshAfterAmbiguity(
    target operationTarget: ThreadLifecycleTarget,
    activation: UInt64
  ) async {
    guard activationRevision == activation, target == operationTarget else { return }
    await authoritativeRefresh(operationTarget.lease)
  }

  private func owns(
    _ operationTarget: ThreadLifecycleTarget,
    activation: UInt64,
    submission: UInt64
  ) -> Bool {
    activationRevision == activation
      && target == operationTarget
      && submissionRevision == submission
  }
}
