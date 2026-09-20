import Foundation

enum RemoteIntegrationsDraftError: Error, Equatable, Sendable {
  case name
  case prompt
  case agent
  case model
  case recurrence
  case project
  case pullRequest
  case branch
}

enum RemoteIntegrationsRecurrenceKind: String, CaseIterable, Identifiable, Sendable {
  case hourly
  case weekly
  case once

  var id: Self { self }
}

struct RemoteIntegrationsScheduleDraft: Equatable, Sendable {
  var name = ""
  var prompt = ""
  var agentKind = "codex"
  var model = ""
  var effort = ""
  var fast = false
  var enabled = true
  var projectId: String?
  var recurrenceKind = RemoteIntegrationsRecurrenceKind.hourly
  var minute = 0
  var weeklyDays: Set<Int> = [1]
  var weeklyTime = Date()
  var onceDate = Date().addingTimeInterval(3600)

  init() {}

  init(_ task: RemoteIntegrationsScheduledTask) {
    name = task.name
    prompt = task.prompt
    agentKind = task.agentKind
    model = task.config.model
    effort = task.config.effort ?? ""
    fast = task.config.fast ?? false
    enabled = task.enabled
    projectId = task.projectId
    switch task.recurrence {
    case .hourly(let minute):
      recurrenceKind = .hourly
      self.minute = minute
    case .weekly(let days, let time):
      recurrenceKind = .weekly
      weeklyDays = Set(days)
      weeklyTime = Self.localTimeDate(time) ?? weeklyTime
    case .once(let runAt):
      recurrenceKind = .once
      onceDate = Self.isoDate(runAt) ?? onceDate
    }
  }

  func value() throws -> RemoteIntegrationsScheduledTaskInput {
    let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
    let cleanPrompt = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
    let cleanAgent = agentKind.trimmingCharacters(in: .whitespacesAndNewlines)
    let cleanModel = model.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !cleanName.isEmpty, cleanName.count <= 120 else {
      throw RemoteIntegrationsDraftError.name
    }
    guard !cleanPrompt.isEmpty, cleanPrompt.count <= 50_000 else {
      throw RemoteIntegrationsDraftError.prompt
    }
    guard !cleanAgent.isEmpty else { throw RemoteIntegrationsDraftError.agent }
    guard !cleanModel.isEmpty else { throw RemoteIntegrationsDraftError.model }

    let recurrence: RemoteIntegrationsScheduleRecurrence
    switch recurrenceKind {
    case .hourly:
      guard (0...59).contains(minute) else { throw RemoteIntegrationsDraftError.recurrence }
      recurrence = .hourly(minute: minute)
    case .weekly:
      let days = weeklyDays.sorted()
      guard !days.isEmpty, days.allSatisfy({ (0...6).contains($0) }) else {
        throw RemoteIntegrationsDraftError.recurrence
      }
      recurrence = .weekly(days: days, time: Self.localTimeString(weeklyTime))
    case .once:
      recurrence = .once(runAt: Self.isoString(onceDate))
    }

    return RemoteIntegrationsScheduledTaskInput(
      name: cleanName,
      prompt: cleanPrompt,
      agentKind: cleanAgent,
      config: RemoteIntegrationsAgentConfig(
        model: cleanModel,
        effort: Self.nonempty(effort),
        fast: fast ? true : nil
      ),
      recurrence: recurrence,
      enabled: enabled,
      projectId: Self.nonempty(projectId)
    )
  }

  var isValid: Bool { (try? value()) != nil }

  private static func localTimeFormatter() -> DateFormatter {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "HH:mm"
    return formatter
  }

  private static func isoFormatter(fractionalSeconds: Bool) -> ISO8601DateFormatter {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions =
      fractionalSeconds
      ? [.withInternetDateTime, .withFractionalSeconds]
      : [.withInternetDateTime]
    return formatter
  }

  private static func localTimeDate(_ value: String) -> Date? {
    localTimeFormatter().date(from: value)
  }

  private static func localTimeString(_ value: Date) -> String {
    localTimeFormatter().string(from: value)
  }

  private static func isoDate(_ value: String) -> Date? {
    isoFormatter(fractionalSeconds: true).date(from: value)
      ?? isoFormatter(fractionalSeconds: false).date(from: value)
  }

  private static func isoString(_ value: Date) -> String {
    isoFormatter(fractionalSeconds: true).string(from: value)
  }

  private static func nonempty(_ value: String?) -> String? {
    guard let clean = value?.trimmingCharacters(in: .whitespacesAndNewlines), !clean.isEmpty else {
      return nil
    }
    return clean
  }
}

struct RemoteIntegrationsPRWatchDraft: Equatable, Sendable {
  static let maximumPRNumber = 9_007_199_254_740_991

  var projectId = ""
  var prNumber = 1
  var headBranch = ""
  var worktreePath = ""
  var watchEnabled = true
  var autoMerge = false
  var agentKind = "codex"
  var model = ""
  var effort = ""
  var fast = false

  init(projectId: String = "") { self.projectId = projectId }

  init(_ watch: RemoteIntegrationsPRWatch) {
    projectId = watch.projectId
    prNumber = watch.prNumber
    headBranch = watch.headBranch
    worktreePath = watch.worktreePath ?? ""
    watchEnabled = watch.watchEnabled
    autoMerge = watch.autoMerge
    agentKind = watch.agentKind ?? "codex"
    model = watch.config?.model ?? ""
    effort = watch.config?.effort ?? ""
    fast = watch.config?.fast ?? false
  }

  func key() throws -> RemoteIntegrationsPRWatchKey {
    let project = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !project.isEmpty else { throw RemoteIntegrationsDraftError.project }
    guard (1...Self.maximumPRNumber).contains(prNumber) else {
      throw RemoteIntegrationsDraftError.pullRequest
    }
    return RemoteIntegrationsPRWatchKey(projectId: project, prNumber: prNumber)
  }

  func value() throws -> RemoteIntegrationsPRWatchInput {
    let key = try key()
    let branch = headBranch.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !branch.isEmpty else { throw RemoteIntegrationsDraftError.branch }
    let agent = agentKind.trimmingCharacters(in: .whitespacesAndNewlines)
    let cleanModel = model.trimmingCharacters(in: .whitespacesAndNewlines)
    if watchEnabled {
      guard !agent.isEmpty else { throw RemoteIntegrationsDraftError.agent }
      guard !cleanModel.isEmpty else { throw RemoteIntegrationsDraftError.model }
    }
    let config =
      cleanModel.isEmpty
      ? nil
      : RemoteIntegrationsAgentConfig(
        model: cleanModel,
        effort: Self.nonempty(effort),
        fast: fast ? true : nil
      )
    return RemoteIntegrationsPRWatchInput(
      projectId: key.projectId,
      prNumber: key.prNumber,
      headBranch: branch,
      worktreePath: Self.nonempty(worktreePath),
      watchEnabled: watchEnabled,
      autoMerge: autoMerge,
      agentKind: agent.isEmpty ? nil : agent,
      config: config
    )
  }

  var isValid: Bool { (try? value()) != nil }

  private static func nonempty(_ value: String) -> String? {
    let clean = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return clean.isEmpty ? nil : clean
  }
}
