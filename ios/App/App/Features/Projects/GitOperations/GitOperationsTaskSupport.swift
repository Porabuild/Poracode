import Foundation

actor GitOperationsMutationSerializer {
  private var tail: Task<Void, Never>?

  func perform<Value: Sendable>(
    _ operation: @escaping @Sendable () async throws -> Value
  ) async throws -> Value {
    let predecessor = tail
    let task = Task<Value, Error> {
      await predecessor?.value
      try Task.checkCancellation()
      return try await operation()
    }
    tail = Task { _ = try? await task.value }
    return try await withTaskCancellationHandler {
      try await task.value
    } onCancel: {
      task.cancel()
    }
  }
}

@MainActor
final class GitOperationsTaskSlot {
  private var task: Task<Void, Never>?
  private var generation: UInt64 = 0

  func launch(_ operation: @escaping @MainActor @Sendable () async -> Void) {
    cancel()
    generation &+= 1
    let owner = generation
    task = Task { @MainActor [weak self] in
      await operation()
      guard self?.generation == owner else { return }
      self?.task = nil
    }
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
