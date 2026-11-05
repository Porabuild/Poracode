// GENERATED FILE. Do not edit by hand. Run `pnpm protocol:remote:v3:generate`.
// Background-task reduce machine rendered from the declarative spec in
// src/shared/remote/contract/backgroundTaskReduceSpec.ts (spec version 3).
import Foundation

public struct RemoteBackgroundTaskStopAction: Equatable, Sendable {
  public var id: String
  public var payload: [String: String]
  public init(id: String, payload: [String: String]) {
    self.id = id
    self.payload = payload
  }
}

public struct RemoteBackgroundTaskOutput: Codable, Equatable, Sendable {
  public static let maxOutputUtf16Length = 16384
  public static let maxTotalBytes = 9007199254740991.0
  public var output: String
  public var totalBytes: Double
  public var truncated: Bool
  public init(output: String, totalBytes: Double, truncated: Bool) {
    self.output = output
    self.totalBytes = totalBytes
    self.truncated = truncated
  }
  public var isValid: Bool {
    output.utf16.count <= Self.maxOutputUtf16Length
      && totalBytes.isFinite
      && totalBytes >= 0
      && totalBytes.rounded(.towardZero) == totalBytes
      && totalBytes <= Self.maxTotalBytes
  }
}

public struct RemoteBackgroundTaskIdentity: Equatable, Sendable {
  public var taskId: String
  public var kind: String
  public var description: String
  public var startedAt: Double?
  public var lastProgressAt: Double?
  public var progress: String?
  public var stopAction: RemoteBackgroundTaskStopAction?
  public var category: String?
  public var command: String?
  public var outputAction: RemoteBackgroundTaskStopAction?
  public init(taskId: String, kind: String, description: String, startedAt: Double? = nil, lastProgressAt: Double? = nil, progress: String? = nil, stopAction: RemoteBackgroundTaskStopAction? = nil, category: String? = nil, command: String? = nil, outputAction: RemoteBackgroundTaskStopAction? = nil) {
    self.taskId = taskId
    self.kind = kind
    self.description = description
    self.startedAt = startedAt
    self.lastProgressAt = lastProgressAt
    self.progress = progress
    self.stopAction = stopAction
    self.category = category
    self.command = command
    self.outputAction = outputAction
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
