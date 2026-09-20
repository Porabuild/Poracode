// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteprofileU2DCoreU2DStatsResponseU2DAvailableAccountsU2DItem_9ec272a824: Codable, Sendable, RemoteModelMetadata {
  public var key: String
  public var label: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "key", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case key = "key"
    case label = "label"
  }
}

public struct RouteprofileU2DCoreU2DStatsResponseU2DDevice_26f96950d2: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public var isCurrent: RemoteField<Bool> = .missing
  public var label: String
  public var lastActiveAt: RemoteField<Int64> = .missing
  public var platform: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "isCurrent", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastActiveAt", typeName: "Int64", required: false, nullable: false, minimum: -9007199254740991, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "platform", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case isCurrent = "isCurrent"
    case label = "label"
    case lastActiveAt = "lastActiveAt"
    case platform = "platform"
  }
}

public struct RouteprofileU2DCoreU2DStatsResponseU2DIdentity_da76232259: Codable, Sendable, RemoteModelMetadata {
  public var avatarColor: String
  public var handle: String
  public var name: String
  public var plan: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "avatarColor", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 64, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "handle", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 40, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 80, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "plan", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 40, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case avatarColor = "avatarColor"
    case handle = "handle"
    case name = "name"
    case plan = "plan"
  }
}

public struct RouteprofileU2DCoreU2DStatsResponseU2DInsightsU2DMostActiveHour_58f9a3fda2: Codable, Sendable, RemoteModelMetadata {
  public var count: Int64
  public var hour: Int64
  public var label: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "count", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "hour", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 23, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case count = "count"
    case hour = "hour"
    case label = "label"
  }
}

public struct RouteprofileU2DCoreU2DStatsResponseU2DInsights_d1beee40ea: Codable, Sendable, RemoteModelMetadata {
  public var fastModePercent: Double
  public var mcpToolCalls: Int64
  public var mostActiveHour: RemoteField<RouteprofileU2DCoreU2DStatsResponseU2DInsightsU2DMostActiveHour_58f9a3fda2> = .missing
  public var skillsExplored: Int64
  public var subagentRuns: Int64
  public var topModel: RemoteField<RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc> = .missing
  public var topProvider: RemoteField<RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc> = .missing
  public var topReasoning: RemoteField<RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc> = .missing
  public var totalSkillsUsed: Int64
  public var workflowRuns: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "fastModePercent", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mcpToolCalls", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mostActiveHour", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DInsightsU2DMostActiveHour_58f9a3fda2", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "skillsExplored", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "subagentRuns", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "topModel", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "topProvider", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "topReasoning", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "totalSkillsUsed", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "workflowRuns", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case fastModePercent = "fastModePercent"
    case mcpToolCalls = "mcpToolCalls"
    case mostActiveHour = "mostActiveHour"
    case skillsExplored = "skillsExplored"
    case subagentRuns = "subagentRuns"
    case topModel = "topModel"
    case topProvider = "topProvider"
    case topReasoning = "topReasoning"
    case totalSkillsUsed = "totalSkillsUsed"
    case workflowRuns = "workflowRuns"
  }
}

public enum RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItemU2DKind_b096158c79: String, Codable, Sendable {
  case skill = "skill"
  case subagent = "subagent"
  case tool = "tool"
  case mcp = "mcp"
}

public struct RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItem_9137d87075: Codable, Sendable, RemoteModelMetadata {
  public var displayName: String
  public var kind: RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItemU2DKind_b096158c79
  public var name: String
  public var runCount: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "displayName", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItemU2DKind_b096158c79", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runCount", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case displayName = "displayName"
    case kind = "kind"
    case name = "name"
    case runCount = "runCount"
  }
}

public typealias RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D2_7f9f5a0d72 = Double

public typealias RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f = Double

public typealias RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D4_135f7ef79d = Double

public typealias RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D5_e6cfd13a74 = Double

public enum RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6: Codable, Sendable {
  case option1(ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5)
  case option2(RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D2_7f9f5a0d72)
  case option3(RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f)
  case option4(RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D4_135f7ef79d)
  case option5(RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D5_e6cfd13a74)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6)] = []
    if RemoteUnionProbe.matchesNumber(decoder, integer: false, literals: [.int(0)]), let value = try? container.decode(ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5.self) {
      self = .option1(value); return
    }
    if RemoteUnionProbe.matchesNumber(decoder, integer: false, literals: [.int(1)]), let value = try? container.decode(RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D2_7f9f5a0d72.self) {
      self = .option2(value); return
    }
    if RemoteUnionProbe.matchesNumber(decoder, integer: false, literals: [.int(2)]), let value = try? container.decode(RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f.self) {
      self = .option3(value); return
    }
    if RemoteUnionProbe.matchesNumber(decoder, integer: false, literals: [.int(3)]), let value = try? container.decode(RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D4_135f7ef79d.self) {
      self = .option4(value); return
    }
    if RemoteUnionProbe.matchesNumber(decoder, integer: false, literals: [.int(4)]), let value = try? container.decode(RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D5_e6cfd13a74.self) {
      self = .option5(value); return
    }
    throw DecodingError.typeMismatch(RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6.self, .init(codingPath: decoder.codingPath, debugDescription: "No union option matched RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6"))
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    case .option3(let value): try container.encode(value)
    case .option4(let value): try container.encode(value)
    case .option5(let value): try container.encode(value)
    }
  }
}

public struct RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItem_07cc5ea327: Codable, Sendable, RemoteModelMetadata {
  public var count: Int64
  public var day: String
  public var intensity: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "count", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "day", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
  case prompts = "prompts"
  case tokens = "tokens"
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

public struct RouteprofileU2DCoreU2DStatsResponseU2DTotals_22f3597ef0: Codable, Sendable, RemoteModelMetadata {
  public var activeDays: Int64
  public var currentStreakDays: Int64
  public var goalsSet: Int64
  public var longestStreakDays: Int64
  public var longestTaskMs: Int64
  public var messagesSent: Int64
  public var totalPrompts: Int64
  public var totalThreads: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "activeDays", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "currentStreakDays", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "goalsSet", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "longestStreakDays", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "longestTaskMs", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "messagesSent", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "totalPrompts", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "totalThreads", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case activeDays = "activeDays"
    case currentStreakDays = "currentStreakDays"
    case goalsSet = "goalsSet"
    case longestStreakDays = "longestStreakDays"
    case longestTaskMs = "longestTaskMs"
    case messagesSent = "messagesSent"
    case totalPrompts = "totalPrompts"
    case totalThreads = "totalThreads"
  }
}

public struct RouteprofileU2DCoreU2DStatsResponse_14ac0689f2: Codable, Sendable, RemoteModelMetadata {
  public var accounts: [RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc]
  public var aiActions: [RouteprofileU2DCoreU2DStatsResponseU2DAiActionsU2DItem_bb42560f34]
  public var availableAccounts: [RouteprofileU2DCoreU2DStatsResponseU2DAvailableAccountsU2DItem_9ec272a824]
  public var device: RouteprofileU2DCoreU2DStatsResponseU2DDevice_26f96950d2
  public var generatedAt: Int64
  public var identity: RouteprofileU2DCoreU2DStatsResponseU2DIdentity_da76232259
  public var insights: RouteprofileU2DCoreU2DStatsResponseU2DInsights_d1beee40ea
  public var mcps: [RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItem_9137d87075]
  public var models: [RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc]
  public var modes: [RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc]
  public var promptHeatmap: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmap_c1094a243b
  public var providers: [RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc]
  public var scope: RouteprofileU2DCoreU2DStatsRequestU2DScope_b99ee3af30
  public var skills: [RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItem_9137d87075]
  public var timezoneOffsetMinutes: Int64
  public var totals: RouteprofileU2DCoreU2DStatsResponseU2DTotals_22f3597ef0
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "accounts", typeName: "[RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "aiActions", typeName: "[RouteprofileU2DCoreU2DStatsResponseU2DAiActionsU2DItem_bb42560f34]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "availableAccounts", typeName: "[RouteprofileU2DCoreU2DStatsResponseU2DAvailableAccountsU2DItem_9ec272a824]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "device", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DDevice_26f96950d2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "generatedAt", typeName: "Int64", required: true, nullable: false, minimum: -9007199254740991, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "identity", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DIdentity_da76232259", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "insights", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DInsights_d1beee40ea", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mcps", typeName: "[RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItem_9137d87075]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "models", typeName: "[RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "modes", typeName: "[RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "promptHeatmap", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmap_c1094a243b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providers", typeName: "[RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scope", typeName: "RouteprofileU2DCoreU2DStatsRequestU2DScope_b99ee3af30", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "skills", typeName: "[RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItem_9137d87075]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "timezoneOffsetMinutes", typeName: "Int64", required: true, nullable: false, minimum: -9007199254740991, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "totals", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DTotals_22f3597ef0", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case accounts = "accounts"
    case aiActions = "aiActions"
    case availableAccounts = "availableAccounts"
    case device = "device"
    case generatedAt = "generatedAt"
    case identity = "identity"
    case insights = "insights"
    case mcps = "mcps"
    case models = "models"
    case modes = "modes"
    case promptHeatmap = "promptHeatmap"
    case providers = "providers"
    case scope = "scope"
    case skills = "skills"
    case timezoneOffsetMinutes = "timezoneOffsetMinutes"
    case totals = "totals"
  }
}

public struct RouteprofileU2DDevicesResponse_0943be33f9: Codable, Sendable, RemoteModelMetadata {
  public var currentDeviceId: String
  public var devices: [RouteprofileU2DCoreU2DStatsResponseU2DDevice_26f96950d2]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "currentDeviceId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "devices", typeName: "[RouteprofileU2DCoreU2DStatsResponseU2DDevice_26f96950d2]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case currentDeviceId = "currentDeviceId"
    case devices = "devices"
  }
}

public struct RouteprofileU2DIdentityResponse_e0bc631a25: Codable, Sendable, RemoteModelMetadata {
  public var device: RouteprofileU2DCoreU2DStatsResponseU2DDevice_26f96950d2
  public var identity: RouteprofileU2DCoreU2DStatsResponseU2DIdentity_da76232259
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "device", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DDevice_26f96950d2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "identity", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DIdentity_da76232259", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case device = "device"
    case identity = "identity"
  }
}

public struct RouteprofileU2DTokenU2DStatsResponseU2DAccountsU2DItem_c30da54b85: Codable, Sendable, RemoteModelMetadata {
  public var estimatedCostUsd: RemoteField<Double> = .missing
  public var label: String
  public var percent: Double
  public var provider: String
  public var tokens: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "estimatedCostUsd", typeName: "Double", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "percent", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "provider", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tokens", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case estimatedCostUsd = "estimatedCostUsd"
    case label = "label"
    case percent = "percent"
    case provider = "provider"
    case tokens = "tokens"
  }
}

public struct RouteprofileU2DTokenU2DStatsResponse_c05447d902: Codable, Sendable, RemoteModelMetadata {
  public var accounts: [RouteprofileU2DTokenU2DStatsResponseU2DAccountsU2DItem_c30da54b85]
  public var available: Bool
  public var device: RouteprofileU2DCoreU2DStatsResponseU2DDevice_26f96950d2
  public var generatedAt: Int64
  public var lifetimeTokens: Int64
  public var models: [RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc]
  public var peakDay: RemoteField<String> = .missing
  public var peakDayTokens: Int64
  public var providers: [RouteprofileU2DTokenU2DStatsResponseU2DAccountsU2DItem_c30da54b85]
  public var scope: RouteprofileU2DCoreU2DStatsRequestU2DScope_b99ee3af30
  public var timezoneOffsetMinutes: Int64
  public var tokenHeatmap: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmap_c1094a243b
  public var unavailableProviders: [String]
  public var windowDays: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "accounts", typeName: "[RouteprofileU2DTokenU2DStatsResponseU2DAccountsU2DItem_c30da54b85]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "available", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "device", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DDevice_26f96950d2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "generatedAt", typeName: "Int64", required: true, nullable: false, minimum: -9007199254740991, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lifetimeTokens", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "models", typeName: "[RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "peakDay", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "peakDayTokens", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providers", typeName: "[RouteprofileU2DTokenU2DStatsResponseU2DAccountsU2DItem_c30da54b85]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scope", typeName: "RouteprofileU2DCoreU2DStatsRequestU2DScope_b99ee3af30", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "timezoneOffsetMinutes", typeName: "Int64", required: true, nullable: false, minimum: -9007199254740991, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tokenHeatmap", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmap_c1094a243b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "unavailableProviders", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "windowDays", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case accounts = "accounts"
    case available = "available"
    case device = "device"
    case generatedAt = "generatedAt"
    case lifetimeTokens = "lifetimeTokens"
    case models = "models"
    case peakDay = "peakDay"
    case peakDayTokens = "peakDayTokens"
    case providers = "providers"
    case scope = "scope"
    case timezoneOffsetMinutes = "timezoneOffsetMinutes"
    case tokenHeatmap = "tokenHeatmap"
    case unavailableProviders = "unavailableProviders"
    case windowDays = "windowDays"
  }
}

public enum RouteprojectU2DCommandRequestU2DOptionU2D1U2DKind_4cb4c97502: String, Codable, Sendable {
  case addU2DExisting = "add-existing"
}
