import Foundation

enum SettingsProfileScope: String, Codable, Sendable {
  case device, all
}

enum SettingsProfileWindow: String, Codable, Sendable {
  case sevenDays = "7d"
  case thirtyDays = "30d"
  case all
}

struct SettingsProfileStatsRequest: Codable, Equatable, Sendable {
  var utcOffsetMinutes: Double
  var scope: SettingsProfileScope?
  var deviceId: String?
  var provider: String?
  var window: SettingsProfileWindow?

  init(
    utcOffsetMinutes: Double,
    scope: SettingsProfileScope? = nil,
    deviceId: String? = nil,
    provider: String? = nil,
    window: SettingsProfileWindow? = nil
  ) {
    self.utcOffsetMinutes = utcOffsetMinutes
    self.scope = scope
    self.deviceId = deviceId
    self.provider = provider
    self.window = window
  }
}

struct SettingsProfileDevice: Codable, Equatable, Sendable {
  let id: String
  let label: String
  let platform: String
  let isCurrent: Bool?
  let lastActiveAt: Int64?
}

struct SettingsProfileDevices: Codable, Equatable, Sendable {
  let devices: [SettingsProfileDevice]
  let currentDeviceId: String
}

struct SettingsProfileIdentity: Codable, Equatable, Sendable {
  var name: String
  var handle: String
  var avatarColor: String
  var plan: String?

  init(name: String, handle: String, avatarColor: String, plan: String? = nil) {
    self.name = name
    self.handle = handle
    self.avatarColor = avatarColor
    self.plan = plan
  }
}

struct SettingsProfileIdentityResponse: Codable, Equatable, Sendable {
  let identity: SettingsProfileIdentity
  let device: SettingsProfileDevice
}

struct SettingsProfileTotals: Codable, Equatable, Sendable {
  let totalThreads: Int64
  let totalPrompts: Int64
  let messagesSent: Int64
  let goalsSet: Int64
  let longestTaskMs: Int64
  let currentStreakDays: Int64
  let longestStreakDays: Int64
  let activeDays: Int64
}

struct SettingsProfileHeatmapCell: Codable, Equatable, Sendable {
  let day: String
  let count: Int64
  let intensity: Int64
}

enum SettingsProfileHeatmapMetric: String, Codable, Sendable {
  case prompts, tokens
}

struct SettingsProfileHeatmap: Codable, Equatable, Sendable {
  let metric: SettingsProfileHeatmapMetric
  let windowDays: Int64
  let cells: [SettingsProfileHeatmapCell]
  let max: Int64
}

struct SettingsProfileBreakdown: Codable, Equatable, Sendable {
  let key: String
  let label: String
  let count: Double
  let percent: Double
}

struct SettingsProfileActiveHour: Codable, Equatable, Sendable {
  let hour: Int64
  let label: String
  let count: Int64
}

struct SettingsProfileInsights: Codable, Equatable, Sendable {
  let topProvider: SettingsProfileBreakdown?
  let topModel: SettingsProfileBreakdown?
  let topReasoning: SettingsProfileBreakdown?
  let fastModePercent: Double
  let mostActiveHour: SettingsProfileActiveHour?
  let skillsExplored: Int64
  let totalSkillsUsed: Int64
  let workflowRuns: Int64
  let subagentRuns: Int64
  let mcpToolCalls: Int64
}

enum SettingsProfileSkillKind: String, Codable, Sendable {
  case skill, subagent, tool, mcp
}

struct SettingsProfileSkillUsage: Codable, Equatable, Sendable {
  let name: String
  let displayName: String
  let kind: SettingsProfileSkillKind
  let runCount: Int64
}

enum SettingsProfileAIActionKind: String, Codable, Sendable {
  case commit, pr, conflict
}

struct SettingsProfileAIAction: Codable, Equatable, Sendable {
  let type: SettingsProfileAIActionKind
  let label: String
  let count: Int64
  let topProvider: String?
  let topModel: String?
}

struct SettingsProfileAccount: Codable, Equatable, Sendable {
  let key: String
  let label: String
}

struct SettingsProfileCoreStats: Codable, Equatable, Sendable {
  let scope: SettingsProfileScope
  let device: SettingsProfileDevice
  let generatedAt: Int64
  let timezoneOffsetMinutes: Int64
  let identity: SettingsProfileIdentity
  let totals: SettingsProfileTotals
  let promptHeatmap: SettingsProfileHeatmap
  let insights: SettingsProfileInsights
  let providers: [SettingsProfileBreakdown]
  let accounts: [SettingsProfileBreakdown]
  let models: [SettingsProfileBreakdown]
  let modes: [SettingsProfileBreakdown]
  let skills: [SettingsProfileSkillUsage]
  let mcps: [SettingsProfileSkillUsage]
  let aiActions: [SettingsProfileAIAction]
  let availableAccounts: [SettingsProfileAccount]
}

struct SettingsProfileTokenProvider: Codable, Equatable, Sendable {
  let provider: String
  let label: String
  let tokens: Int64
  let percent: Double
  let estimatedCostUsd: Double?
}

struct SettingsProfileTokenStats: Codable, Equatable, Sendable {
  let available: Bool
  let scope: SettingsProfileScope
  let device: SettingsProfileDevice
  let generatedAt: Int64
  let timezoneOffsetMinutes: Int64
  let windowDays: Int64
  let lifetimeTokens: Int64
  let peakDayTokens: Int64
  let peakDay: String?
  let providers: [SettingsProfileTokenProvider]
  let accounts: [SettingsProfileTokenProvider]
  let models: [SettingsProfileBreakdown]
  let tokenHeatmap: SettingsProfileHeatmap
  let unavailableProviders: [String]
}
