import Foundation

enum RemoteIntegrationsScheduleRecurrence: Codable, Equatable, Sendable {
  case hourly(minute: Int)
  case weekly(days: [Int], time: String, timeZone: String? = nil)
  case once(runAt: String)
  case interval(every: Int, unit: String)
  case cron(expression: String, timeZone: String)

  private enum CodingKeys: String, CodingKey { case kind, minute, days, time, runAt, timeZone, every, unit, expression }
  private enum Kind: String, Codable { case hourly, weekly, once, interval, cron }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    switch try container.decode(Kind.self, forKey: .kind) {
    case .hourly: self = .hourly(minute: try container.decode(Int.self, forKey: .minute))
    case .weekly:
      self = .weekly(
        days: try container.decode([Int].self, forKey: .days),
        time: try container.decode(String.self, forKey: .time),
        timeZone: try container.decodeIfPresent(String.self, forKey: .timeZone)
      )
    case .once: self = .once(runAt: try container.decode(String.self, forKey: .runAt))
    case .interval: self = .interval(every: try container.decode(Int.self, forKey: .every), unit: try container.decode(String.self, forKey: .unit))
    case .cron: self = .cron(expression: try container.decode(String.self, forKey: .expression), timeZone: try container.decode(String.self, forKey: .timeZone))
    }
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .hourly(let minute):
      try container.encode(Kind.hourly, forKey: .kind)
      try container.encode(minute, forKey: .minute)
    case .weekly(let days, let time, let timeZone):
      try container.encode(Kind.weekly, forKey: .kind)
      try container.encode(days, forKey: .days)
      try container.encode(time, forKey: .time)
      try container.encodeIfPresent(timeZone, forKey: .timeZone)
    case .once(let runAt):
      try container.encode(Kind.once, forKey: .kind)
      try container.encode(runAt, forKey: .runAt)
    case .interval(let every, let unit):
      try container.encode(Kind.interval, forKey: .kind)
      try container.encode(every, forKey: .every)
      try container.encode(unit, forKey: .unit)
    case .cron(let expression, let timeZone):
      try container.encode(Kind.cron, forKey: .kind)
      try container.encode(expression, forKey: .expression)
      try container.encode(timeZone, forKey: .timeZone)
    }
  }
}

struct RemoteIntegrationsScheduledTaskInput: Codable, Equatable, Sendable {
  let name: String
  let prompt: String
  let agentKind: String
  let config: RemoteIntegrationsAgentConfig
  let recurrence: RemoteIntegrationsScheduleRecurrence
  let enabled: Bool
  let projectId: String?
  var automation: JSONValue? = nil
}

enum RemoteIntegrationsScheduleStatus: String, Codable, Equatable, Sendable {
  case never
  case running
  case succeeded
  case failed
  case waiting = "waiting-for-approval"
  case cancelled, interrupted, skipped
}

enum RemoteIntegrationsScheduleRunStatus: String, Codable, Equatable, Sendable {
  case running
  case succeeded
  case failed
  case interrupted
  case waiting = "waiting-for-approval"
  case cancelled, skipped
}

struct RemoteIntegrationsScheduleRun: Decodable, Equatable, Identifiable, Sendable {
  let id: String
  let scheduleId: String
  let threadId: String
  let startedAt: String
  let completedAt: String?
  let status: RemoteIntegrationsScheduleRunStatus
  let summary: String?
  let hasError: Bool
  var attempt = 1
  var iteration = 1
  var result: JSONValue? = nil

  var unread: Bool { result?["unread"] == .bool(true) }
  var archived: Bool { result?["archivedAt"]?.stringValue != nil }
  var stopReason: String? { result?["stopReason"]?.stringValue }
  var canCancel: Bool { status == .running || status == .waiting || stopReason == "retry-pending" }

  private enum CodingKeys: String, CodingKey {
    case id, scheduleId, threadId, startedAt, completedAt, status, summary, error, attempt, iteration, result
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    id = try values.decode(String.self, forKey: .id)
    scheduleId = try values.decode(String.self, forKey: .scheduleId)
    threadId = try values.decode(String.self, forKey: .threadId)
    startedAt = try values.decode(String.self, forKey: .startedAt)
    completedAt = try values.decodeIfPresent(String.self, forKey: .completedAt)
    status = try values.decode(RemoteIntegrationsScheduleRunStatus.self, forKey: .status)
    summary = try values.decodeIfPresent(String.self, forKey: .summary)
    hasError = try values.decodeIfPresent(String.self, forKey: .error) != nil
    attempt = try values.decodeIfPresent(Int.self, forKey: .attempt) ?? 1
    iteration = try values.decodeIfPresent(Int.self, forKey: .iteration) ?? 1
    result = try values.decodeIfPresent(JSONValue.self, forKey: .result)
  }
}

struct RemoteIntegrationsScheduleRunsResponse: Decodable, Equatable, Sendable {
  let runs: [RemoteIntegrationsScheduleRun]
}

struct RemoteIntegrationsScheduledTask: Codable, Equatable, Identifiable, Sendable {
  let id: String
  let name: String
  let prompt: String
  let agentKind: String
  let config: RemoteIntegrationsAgentConfig
  let recurrence: RemoteIntegrationsScheduleRecurrence
  let enabled: Bool
  let projectId: String?
  let createdAt: String
  let updatedAt: String
  let nextRunAt: String?
  let lastRunAt: String?
  let lastCompletedAt: String?
  let lastStatus: RemoteIntegrationsScheduleStatus
  var automation: JSONValue? = nil
  var iterationCount: Int? = nil

  /// The same task with a different enabled flag, for Pause/Resume.
  func input(enabled: Bool) -> RemoteIntegrationsScheduledTaskInput {
    RemoteIntegrationsScheduledTaskInput(
      name: name,
      prompt: prompt,
      agentKind: agentKind,
      config: config,
      recurrence: recurrence,
      enabled: enabled,
      projectId: projectId,
      automation: automation
    )
  }
}

enum RemoteIntegrationsScheduleCommand: Encodable, Equatable, Sendable {
  case create(RemoteIntegrationsScheduledTaskInput)
  case update(id: String, task: RemoteIntegrationsScheduledTaskInput)
  case delete(id: String)
  case run(id: String)

  private enum CodingKeys: String, CodingKey { case kind, id, task }
  private enum Kind: String, Encodable { case create, update, delete, run }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .create(let task):
      try container.encode(Kind.create, forKey: .kind)
      try container.encode(task, forKey: .task)
    case .update(let id, let task):
      try container.encode(Kind.update, forKey: .kind)
      try container.encode(id, forKey: .id)
      try container.encode(task, forKey: .task)
    case .delete(let id):
      try container.encode(Kind.delete, forKey: .kind)
      try container.encode(id, forKey: .id)
    case .run(let id):
      try container.encode(Kind.run, forKey: .kind)
      try container.encode(id, forKey: .id)
    }
  }
}

struct RemoteIntegrationsSchedulesResponse: Codable, Equatable, Sendable {
  let schedules: [RemoteIntegrationsScheduledTask]
  let schedule: RemoteIntegrationsScheduledTask?
}


struct RemoteIntegrationsAutomationsResponse: Decodable, Sendable {
  let schedules: [RemoteIntegrationsScheduledTask]
  let runs: [RemoteIntegrationsScheduleRun]
  let unreadCount: Int
}

struct RemoteIntegrationsRunCommandResponse: Decodable, Sendable {
  let run: RemoteIntegrationsScheduleRun?
  let cancelled: Bool?
}
