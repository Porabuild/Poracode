// GENERATED FILE. Do not edit by hand. Run `pnpm protocol:remote:v3:generate`.
// Background-task reduce machine rendered from the declarative spec in
// src/shared/remote/contract/backgroundTaskReduceSpec.ts (spec version 2).
import Foundation

public struct RemoteBackgroundTaskIdentity: Equatable, Sendable {
  public var taskId: String
  public var kind: String
  public var description: String
  public init(taskId: String, kind: String, description: String) {
    self.taskId = taskId
    self.kind = kind
    self.description = description
  }
}

public enum RemoteBackgroundTaskReduceAction: String, Sendable {
  case replace
  case drain
  case noop
}

public enum RemoteBackgroundTaskReduce {
  public static func action(
    eventType: String,
    incoming: [RemoteBackgroundTaskIdentity]?,
    previous: [RemoteBackgroundTaskIdentity]?
  ) -> RemoteBackgroundTaskReduceAction {
    if eventType == "session.exited" { return .drain }
    if eventType == "background_tasks.changed" && incoming == nil { return .noop }
    if eventType == "background_tasks.changed" && incoming?.isEmpty == true { return .drain }
    if eventType == "background_tasks.changed" && incoming == previous { return .noop }
    if eventType == "background_tasks.changed" { return .replace }
    return .noop
  }

  public static func apply(
    eventType: String,
    incoming: [RemoteBackgroundTaskIdentity]?,
    previous: [RemoteBackgroundTaskIdentity]?
  ) -> [RemoteBackgroundTaskIdentity]? {
    switch action(eventType: eventType, incoming: incoming, previous: previous) {
    case .drain: return nil
    case .noop: return previous
    case .replace: return incoming
    }
  }
}
