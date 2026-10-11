import Foundation

struct RemoteIntegrationsAgentConfig: Codable, Equatable, Sendable {
  let model: String
  let effort: String?
  let fast: Bool?

  init(model: String, effort: String? = nil, fast: Bool? = nil) {
    self.model = model
    self.effort = effort
    self.fast = fast
  }
}

enum RemoteIntegrationsHostUpdateStatus: Equatable, Sendable {
  struct Download: Equatable, Sendable {
    let percent: Double
    let bytesPerSecond: Double
    let transferred: Double
    let total: Double
  }

  case checking
  case available(version: String)
  case unavailable
  case downloading(Download)
  case downloaded(version: String)
  case failed
}

extension RemoteIntegrationsHostUpdateStatus: Codable {
  private enum CodingKeys: String, CodingKey {
    case type
    case version
    case percent
    case bytesPerSecond
    case transferred
    case total
  }

  private enum Kind: String, Codable {
    case checking
    case available = "update-available"
    case unavailable = "update-not-available"
    case downloading
    case downloaded
    case failed = "error"
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    switch try container.decode(Kind.self, forKey: .type) {
    case .checking: self = .checking
    case .available:
      self = .available(version: try container.decode(String.self, forKey: .version))
    case .unavailable: self = .unavailable
    case .downloading:
      self = .downloading(
        Download(
          percent: try container.decode(Double.self, forKey: .percent),
          bytesPerSecond: try container.decode(Double.self, forKey: .bytesPerSecond),
          transferred: try container.decode(Double.self, forKey: .transferred),
          total: try container.decode(Double.self, forKey: .total)
        )
      )
    case .downloaded:
      self = .downloaded(version: try container.decode(String.self, forKey: .version))
    case .failed:
      // Host-supplied updater messages and keys are deliberately discarded.
      self = .failed
    }
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .checking: try container.encode(Kind.checking, forKey: .type)
    case .available(let version):
      try container.encode(Kind.available, forKey: .type)
      try container.encode(version, forKey: .version)
    case .unavailable: try container.encode(Kind.unavailable, forKey: .type)
    case .downloading(let download):
      try container.encode(Kind.downloading, forKey: .type)
      try container.encode(download.percent, forKey: .percent)
      try container.encode(download.bytesPerSecond, forKey: .bytesPerSecond)
      try container.encode(download.transferred, forKey: .transferred)
      try container.encode(download.total, forKey: .total)
    case .downloaded(let version):
      try container.encode(Kind.downloaded, forKey: .type)
      try container.encode(version, forKey: .version)
    case .failed: try container.encode(Kind.failed, forKey: .type)
    }
  }
}

struct RemoteIntegrationsHostUpdateState: Codable, Equatable, Sendable {
  let currentVersion: String
  let status: RemoteIntegrationsHostUpdateStatus?
}

enum RemoteIntegrationsScheduleRecurrence: Codable, Equatable, Sendable {
  case hourly(minute: Int)
  case weekly(days: [Int], time: String)
  case once(runAt: String)

  private enum CodingKeys: String, CodingKey { case kind, minute, days, time, runAt }
  private enum Kind: String, Codable { case hourly, weekly, once }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    switch try container.decode(Kind.self, forKey: .kind) {
    case .hourly: self = .hourly(minute: try container.decode(Int.self, forKey: .minute))
    case .weekly:
      self = .weekly(
        days: try container.decode([Int].self, forKey: .days),
        time: try container.decode(String.self, forKey: .time)
      )
    case .once: self = .once(runAt: try container.decode(String.self, forKey: .runAt))
    }
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .hourly(let minute):
      try container.encode(Kind.hourly, forKey: .kind)
      try container.encode(minute, forKey: .minute)
    case .weekly(let days, let time):
      try container.encode(Kind.weekly, forKey: .kind)
      try container.encode(days, forKey: .days)
      try container.encode(time, forKey: .time)
    case .once(let runAt):
      try container.encode(Kind.once, forKey: .kind)
      try container.encode(runAt, forKey: .runAt)
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
}

enum RemoteIntegrationsScheduleStatus: String, Codable, Equatable, Sendable {
  case never
  case running
  case succeeded
  case failed
}

enum RemoteIntegrationsScheduleRunStatus: String, Codable, Equatable, Sendable {
  case running
  case succeeded
  case failed
  case interrupted
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

  private enum CodingKeys: String, CodingKey {
    case id, scheduleId, threadId, startedAt, completedAt, status, summary, error
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

  /// The same task with a different enabled flag, for Pause/Resume.
  func input(enabled: Bool) -> RemoteIntegrationsScheduledTaskInput {
    RemoteIntegrationsScheduledTaskInput(
      name: name,
      prompt: prompt,
      agentKind: agentKind,
      config: config,
      recurrence: recurrence,
      enabled: enabled,
      projectId: projectId
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

struct RemoteIntegrationsPRWatchKey: Codable, Equatable, Hashable, Sendable {
  let projectId: String
  let prNumber: Int
}

struct RemoteIntegrationsPRWatchInput: Codable, Equatable, Sendable {
  let projectId: String
  let prNumber: Int
  let headBranch: String
  let worktreePath: String?
  let watchEnabled: Bool
  let autoMerge: Bool
  let agentKind: String?
  let config: RemoteIntegrationsAgentConfig?
}

struct RemoteIntegrationsPRWatchAgentSync: Codable, Equatable, Sendable {
  let projectId: String
  let agentKind: String
  let config: RemoteIntegrationsAgentConfig
}

struct RemoteIntegrationsPRWatch: Codable, Equatable, Sendable {
  let projectId: String
  let prNumber: Int
  let headBranch: String
  let worktreePath: String?
  let watchEnabled: Bool
  let autoMerge: Bool
  let agentKind: String?
  let config: RemoteIntegrationsAgentConfig?

  // Preserve only whether a host diagnostic exists; never retain or display its contents.
  let hasLastError: Bool

  private enum CodingKeys: String, CodingKey {
    case projectId, prNumber, headBranch, worktreePath, watchEnabled, autoMerge, agentKind, config
    case lastError
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    projectId = try container.decode(String.self, forKey: .projectId)
    prNumber = try container.decode(Int.self, forKey: .prNumber)
    headBranch = try container.decode(String.self, forKey: .headBranch)
    worktreePath = try container.decodeIfPresent(String.self, forKey: .worktreePath)
    watchEnabled = try container.decode(Bool.self, forKey: .watchEnabled)
    autoMerge = try container.decode(Bool.self, forKey: .autoMerge)
    agentKind = try container.decodeIfPresent(String.self, forKey: .agentKind)
    config = try container.decodeIfPresent(RemoteIntegrationsAgentConfig.self, forKey: .config)
    hasLastError = try container.decodeIfPresent(String.self, forKey: .lastError) != nil
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(projectId, forKey: .projectId)
    try container.encode(prNumber, forKey: .prNumber)
    try container.encode(headBranch, forKey: .headBranch)
    try container.encodeIfPresent(worktreePath, forKey: .worktreePath)
    try container.encode(watchEnabled, forKey: .watchEnabled)
    try container.encode(autoMerge, forKey: .autoMerge)
    try container.encodeIfPresent(agentKind, forKey: .agentKind)
    try container.encodeIfPresent(config, forKey: .config)
    if hasLastError {
      try container.encode("redacted", forKey: .lastError)
    } else {
      try container.encodeNil(forKey: .lastError)
    }
  }
}

struct RemoteIntegrationsPRWatchResponse: Codable, Equatable, Sendable {
  let watch: RemoteIntegrationsPRWatch?
}

struct RemoteIntegrationsOKResponse: Codable, Equatable, Sendable {
  let ok: Bool
}
