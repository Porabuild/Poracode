// GENERATED FILE. Do not edit by hand.
import Foundation
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

public struct RouteprofileU2DCoreU2DStatsResponse_42cbe66f12: Codable, Sendable, RemoteModelMetadata {
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
  public var recent: RemoteField<RouteprofileU2DCoreU2DStatsResponseU2DRecent_d2af525e07> = .missing
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
    .init(wireName: "recent", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DRecent_d2af525e07", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
    case recent = "recent"
    case scope = "scope"
    case skills = "skills"
    case timezoneOffsetMinutes = "timezoneOffsetMinutes"
    case totals = "totals"
  }
}
