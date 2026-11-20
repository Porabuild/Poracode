// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItem_07cc5ea327: Codable, Sendable, RemoteModelMetadata {
  public var count: Int64
  public var day: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var intensity: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "count", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "day", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "intensity", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case count = "count"
    case day = "day"
    case intensity = "intensity"
  }
}

public enum RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DMetric_b7f9b9a51e: String, Codable, Sendable {
  case `prompts` = "prompts"
  case `tokens` = "tokens"
}

public struct RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmap_c1094a243b: Codable, Sendable, RemoteModelMetadata {
  public var cells: [RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItem_07cc5ea327]
  public var max: Int64
  public var metric: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DMetric_b7f9b9a51e
  public var windowDays: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cells", typeName: "[RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItem_07cc5ea327]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "max", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "metric", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DMetric_b7f9b9a51e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "windowDays", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case cells = "cells"
    case max = "max"
    case metric = "metric"
    case windowDays = "windowDays"
  }
}

public struct RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30dU2DHoursU2DItem_0b5160b377: Codable, Sendable, RemoteModelMetadata {
  public var count: Int64
  public var hour: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "count", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "hour", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 23, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case count = "count"
    case hour = "hour"
  }
}

public struct RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46: Codable, Sendable, RemoteModelMetadata {
  public var activeDays: Int64
  public var aiActions: [RouteprofileU2DCoreU2DStatsResponseU2DAiActionsU2DItem_bb42560f34]
  public var days: Int64
  public var effortTurns: Int64
  public var efforts: [RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc]
  public var fastTurns: Int64
  public var goals: Int64
  public var hours: [RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30dU2DHoursU2DItem_0b5160b377]
  public var longestTaskMs: Int64
  public var mcpToolCalls: Int64
  public var mcps: [RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItem_9137d87075]
  public var messages: Int64
  public var models: [RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc]
  public var modes: [RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc]
  public var prompts: Int64
  public var providers: [RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc]
  public var skills: [RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItem_9137d87075]
  public var skillsUsed: Int64
  public var subagentRuns: Int64
  public var threads: Int64
  public var totalTurnMs: Int64
  public var weekdayPrompts: Int64
  public var weekendPrompts: Int64
  public var workflowRuns: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "activeDays", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "aiActions", typeName: "[RouteprofileU2DCoreU2DStatsResponseU2DAiActionsU2DItem_bb42560f34]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "days", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "effortTurns", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "efforts", typeName: "[RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fastTurns", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "goals", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "hours", typeName: "[RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30dU2DHoursU2DItem_0b5160b377]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "longestTaskMs", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mcpToolCalls", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mcps", typeName: "[RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItem_9137d87075]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "messages", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "models", typeName: "[RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "modes", typeName: "[RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompts", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providers", typeName: "[RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "skills", typeName: "[RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItem_9137d87075]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "skillsUsed", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "subagentRuns", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threads", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "totalTurnMs", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "weekdayPrompts", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "weekendPrompts", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "workflowRuns", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case activeDays = "activeDays"
    case aiActions = "aiActions"
    case days = "days"
    case effortTurns = "effortTurns"
    case efforts = "efforts"
    case fastTurns = "fastTurns"
    case goals = "goals"
    case hours = "hours"
    case longestTaskMs = "longestTaskMs"
    case mcpToolCalls = "mcpToolCalls"
    case mcps = "mcps"
    case messages = "messages"
    case models = "models"
    case modes = "modes"
    case prompts = "prompts"
    case providers = "providers"
    case skills = "skills"
    case skillsUsed = "skillsUsed"
    case subagentRuns = "subagentRuns"
    case threads = "threads"
    case totalTurnMs = "totalTurnMs"
    case weekdayPrompts = "weekdayPrompts"
    case weekendPrompts = "weekendPrompts"
    case workflowRuns = "workflowRuns"
  }
}

public struct RouteprofileU2DCoreU2DStatsResponseU2DRecent_d2af525e07: Codable, Sendable, RemoteModelMetadata {
  public var last30d: RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46
  public var last7d: RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46
  public var prev30d: RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46
  public var prev7d: RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46
  public var today: RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46
  public var windowHours: RemoteField<[RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30dU2DHoursU2DItem_0b5160b377]> = .missing
  public var yesterday: RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "last30d", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "last7d", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prev30d", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prev7d", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "today", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "windowHours", typeName: "[RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30dU2DHoursU2DItem_0b5160b377]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "yesterday", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DRecentU2DLast30d_f27f5fbb46", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case last30d = "last30d"
    case last7d = "last7d"
    case prev30d = "prev30d"
    case prev7d = "prev7d"
    case today = "today"
    case windowHours = "windowHours"
    case yesterday = "yesterday"
  }
}
