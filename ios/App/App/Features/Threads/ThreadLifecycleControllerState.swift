import Foundation

enum ThreadLifecycleAction: Equatable, Sendable {
  case start
  case relaunch
  case prepareWorktree
  case setGroup
  case rename
  case acknowledge
  case setDone
  case setPinned
  case setWorktree
  case deleteWorktreeGroup
  case archive
  case unarchive
  case delete
}

enum ThreadLifecycleFailure: Equatable, Sendable {
  case unavailable(ThreadSessionAvailability)
  case invalidRequest
  case authenticationExpired
  case authorizationMissingScope(String?)
  case authorizationDenied
  case rejected(statusCode: Int, code: String?)
  case invalidResponse
  case ambiguousOutcome
  case transport

  static func map(_ error: any Error) -> ThreadLifecycleFailure {
    guard let gatewayError = error as? ThreadLifecycleGatewayError else {
      return .transport
    }
    switch gatewayError {
    case .unavailable(let reason):
      return .unavailable(reason)
    case .invalidRequest:
      return .invalidRequest
    case .http(let statusCode, let code, let missingScope):
      if statusCode == 401 { return .authenticationExpired }
      if statusCode == 403, code == "missing_scope" {
        return .authorizationMissingScope(missingScope)
      }
      if statusCode == 403 { return .authorizationDenied }
      return .rejected(statusCode: statusCode, code: code)
    case .invalidResponse:
      return .invalidResponse
    case .ambiguousOutcome:
      return .ambiguousOutcome
    case .transport:
      return .transport
    }
  }
}

enum ThreadLifecycleOutcome: Equatable, Sendable {
  case succeeded(ThreadLifecycleAction)
  case failed(ThreadLifecycleAction, ThreadLifecycleFailure)
}

enum ThreadLifecycleDestructiveIntent: Equatable, Sendable {
  case archive(target: ThreadLifecycleTarget)
  case delete(target: ThreadLifecycleTarget)
  case deleteWorktreeGroup(
    target: ThreadLifecycleTarget,
    projectID: String,
    worktreePath: String,
    threadIDs: [String]
  )

  var target: ThreadLifecycleTarget {
    switch self {
    case .archive(let target), .delete(let target), .deleteWorktreeGroup(let target, _, _, _):
      return target
    }
  }
}

actor ThreadLifecycleOperationSerializer {
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
    tail = Task {
      _ = try? await task.value
    }
    return try await withTaskCancellationHandler {
      try await task.value
    } onCancel: {
      task.cancel()
    }
  }
}
