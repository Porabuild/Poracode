import Foundation

@MainActor
protocol ProjectControllerScheduledOperation: AnyObject {
  func cancel()
}

@MainActor
protocol ProjectControllerDebounceScheduling: AnyObject {
  func schedule(
    after delay: Duration,
    operation: @escaping @MainActor @Sendable () async -> Void
  ) -> any ProjectControllerScheduledOperation
}

@MainActor
private final class ProjectControllerTaskScheduledOperation:
  ProjectControllerScheduledOperation
{
  private var task: Task<Void, Never>?

  init(task: Task<Void, Never>) {
    self.task = task
  }

  func cancel() {
    task?.cancel()
    task = nil
  }
}

@MainActor
final class ProjectControllerTaskDebounceScheduler: ProjectControllerDebounceScheduling {
  func schedule(
    after delay: Duration,
    operation: @escaping @MainActor @Sendable () async -> Void
  ) -> any ProjectControllerScheduledOperation {
    let task = Task { @MainActor in
      do {
        try await Task.sleep(for: delay)
        await operation()
      } catch is CancellationError {
        // A replacement edit owns the only active timer.
      } catch {}
    }
    return ProjectControllerTaskScheduledOperation(task: task)
  }
}
