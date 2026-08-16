import Foundation

enum GitHubLoadState: Equatable, Sendable {
  case idle
  case loading(GitHubProcedure)
  case loaded
  case failed(GitHubOperationsFailure)
}

struct GitHubControllerCapture: Equatable, Sendable {
  let lease: GitHubProjectLease
  let revision: UInt64
}

@MainActor
final class GitHubTaskSlot {
  private var task: Task<Void, Never>?
  private var generation: UInt64 = 0

  func launch(_ operation: @escaping @MainActor @Sendable (UInt64) async -> Void) {
    cancel()
    generation &+= 1
    let owner = generation
    task = Task { @MainActor [weak self] in
      await operation(owner)
      guard self?.generation == owner else { return }
      self?.task = nil
    }
  }

  func owns(_ owner: UInt64) -> Bool {
    generation == owner
  }

  func wait() async {
    let current = task
    await withTaskCancellationHandler {
      await current?.value
    } onCancel: {
      current?.cancel()
    }
  }

  func cancel() {
    generation &+= 1
    task?.cancel()
    task = nil
  }
}

@MainActor
final class GitHubControllerRuntime {
  private(set) var context: GitHubControllerContext?
  private(set) var revision: UInt64 = 0
  private(set) var isBackgrounded = false
  let readTask = GitHubTaskSlot()
  let mutationTask = GitHubTaskSlot()

  func activate(_ value: GitHubControllerContext) -> Bool {
    guard value.isUsable else {
      deactivate()
      return false
    }
    guard context != value || isBackgrounded else { return false }
    cancel()
    revision &+= 1
    context = value
    isBackgrounded = false
    return true
  }

  func deactivate() {
    cancel()
    revision &+= 1
    context = nil
    isBackgrounded = false
  }

  func enterBackground() {
    cancel()
    revision &+= 1
    isBackgrounded = true
  }

  func leaveBackground(_ value: GitHubControllerContext) -> Bool {
    activate(value)
  }

  func capture(for request: GitHubOperationRequest) -> Result<
    GitHubControllerCapture, GitHubOperationsFailure
  > {
    guard !isBackgrounded, let context, context.isUsable else {
      return .failure(.notReady)
    }
    let metadata = request.procedure.metadata
    guard context.permits(metadata.scope) else { return .failure(.capabilityMissing) }
    guard request.ownerLocation == context.lease.location else {
      return .failure(.invalidResponse)
    }
    return .success(.init(lease: context.lease, revision: revision))
  }

  func owns(_ capture: GitHubControllerCapture) -> Bool {
    !isBackgrounded && capture.revision == revision
      && context?.isUsable == true && context?.lease == capture.lease
  }

  func cancel() {
    readTask.cancel()
    mutationTask.cancel()
  }
}

actor GitHubMutationDeliveryGate {
  private var delivered: Set<UUID> = []

  func deliver<Value: Sendable>(
    id: UUID,
    operation: @escaping @Sendable () async throws -> Value
  ) async throws -> Value {
    guard delivered.insert(id).inserted else { throw GitHubOperationsFailure.ambiguousOutcome }
    try Task.checkCancellation()
    return try await operation()
  }
}

enum GitHubFailureMapper {
  static func map(_ error: Error) -> GitHubOperationsFailure {
    if let failure = error as? GitHubOperationsFailure { return failure }
    return .transport
  }
}
