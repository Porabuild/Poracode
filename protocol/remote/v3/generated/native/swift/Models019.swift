// GENERATED FILE. Do not edit by hand.
import Foundation
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

public struct RouteprojectU2DCommandRequestU2DOptionU2D1_9bb33af2f6: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteprojectU2DCommandRequestU2DOptionU2D1U2DKind_4cb4c97502
  public var name: RemoteField<String> = .missing
  public var path: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D1U2DKind_4cb4c97502", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case name = "name"
    case path = "path"
  }
}

public enum RouteprojectU2DCommandRequestU2DOptionU2D2U2DKind_1f45188862: String, Codable, Sendable {
  case create = "create"
}

public struct RouteprojectU2DCommandRequestU2DOptionU2D2_2b7595c3da: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteprojectU2DCommandRequestU2DOptionU2D2U2DKind_1f45188862
  public var name: String
  public var parentPath: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D2U2DKind_1f45188862", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "parentPath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case name = "name"
    case parentPath = "parentPath"
  }
}

public enum RouteprojectU2DCommandRequestU2DOptionU2D3U2DKind_8793e38088: String, Codable, Sendable {
  case clone = "clone"
}

public enum RouteprojectU2DCommandRequestU2DOptionU2D3U2DSourceU2DOptionU2D1U2DKind_3cd19b85f5: String, Codable, Sendable {
  case url = "url"
}

public struct RouteprojectU2DCommandRequestU2DOptionU2D3U2DSourceU2DOptionU2D1_06735b175e: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteprojectU2DCommandRequestU2DOptionU2D3U2DSourceU2DOptionU2D1U2DKind_3cd19b85f5
  public var url: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D3U2DSourceU2DOptionU2D1U2DKind_3cd19b85f5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "url", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case url = "url"
  }
}

public enum RouteprojectU2DCommandRequestU2DOptionU2D3U2DSourceU2DOptionU2D2U2DKind_cc1f68c41f: String, Codable, Sendable {
  case github = "github"
}

public struct RouteprojectU2DCommandRequestU2DOptionU2D3U2DSourceU2DOptionU2D2_f97770a7e3: Codable, Sendable, RemoteModelMetadata {
  public var account: ProcedureghListReposRequestU2DAccount_5646cf57ff
  public var kind: RouteprojectU2DCommandRequestU2DOptionU2D3U2DSourceU2DOptionU2D2U2DKind_cc1f68c41f
  public var nameWithOwner: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "account", typeName: "ProcedureghListReposRequestU2DAccount_5646cf57ff", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D3U2DSourceU2DOptionU2D2U2DKind_cc1f68c41f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "nameWithOwner", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case account = "account"
    case kind = "kind"
    case nameWithOwner = "nameWithOwner"
  }
}

public enum RouteprojectU2DCommandRequestU2DOptionU2D3U2DSource_76b2c94b29: Codable, Sendable {
  case option1(RouteprojectU2DCommandRequestU2DOptionU2D3U2DSourceU2DOptionU2D1_06735b175e)
  case option2(RouteprojectU2DCommandRequestU2DOptionU2D3U2DSourceU2DOptionU2D2_f97770a7e3)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteprojectU2DCommandRequestU2DOptionU2D3U2DSource_76b2c94b29)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("url")]), let value = try? container.decode(RouteprojectU2DCommandRequestU2DOptionU2D3U2DSourceU2DOptionU2D1_06735b175e.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("github")]), let value = try? container.decode(RouteprojectU2DCommandRequestU2DOptionU2D3U2DSourceU2DOptionU2D2_f97770a7e3.self) {
      matches.append((2, .option2(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RouteprojectU2DCommandRequestU2DOptionU2D3U2DSource_76b2c94b29" : "Ambiguous union RouteprojectU2DCommandRequestU2DOptionU2D3U2DSource_76b2c94b29 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RouteprojectU2DCommandRequestU2DOptionU2D3U2DSource_76b2c94b29.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
    }
    self = matches[0].1
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    }
  }
}

public struct RouteprojectU2DCommandRequestU2DOptionU2D3_da66851500: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteprojectU2DCommandRequestU2DOptionU2D3U2DKind_8793e38088
  public var name: String
  public var parentPath: String
  public var source: RouteprojectU2DCommandRequestU2DOptionU2D3U2DSource_76b2c94b29
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D3U2DKind_8793e38088", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "parentPath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "source", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D3U2DSource_76b2c94b29", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case name = "name"
    case parentPath = "parentPath"
    case source = "source"
  }
}

public enum RouteprojectU2DCommandRequestU2DOptionU2D4U2DKind_cbc64d1458: String, Codable, Sendable {
  case update = "update"
}

public typealias RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DMcpServers_637f685cb2 = [ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1]?

public struct RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1U2DActionsU2DItem_1544bc59ff: Codable, Sendable, RemoteModelMetadata {
  public var command: String
  public var icon: RemoteField<String> = .missing
  public var id: String
  public var name: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "command", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "icon", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case command = "command"
    case icon = "icon"
    case id = "id"
    case name = "name"
  }
}

public struct RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1_cd124b21d9: Codable, Sendable, RemoteModelMetadata {
  public var actions: RemoteField<[RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1U2DActionsU2DItem_1544bc59ff]> = .missing
  public var cleanupScript: RemoteField<String> = .missing
  public var setupScript: RemoteField<String> = .missing
  public var worktreeCopyPatterns: RemoteField<[String]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "actions", typeName: "[RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1U2DActionsU2DItem_1544bc59ff]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cleanupScript", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "setupScript", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeCopyPatterns", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case actions = "actions"
    case cleanupScript = "cleanupScript"
    case setupScript = "setupScript"
    case worktreeCopyPatterns = "worktreeCopyPatterns"
  }
}

public typealias RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScripts_3155b0e864 = RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1_cd124b21d9?

public typealias RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a = [String: Bool]

public struct RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab: Codable, Sendable, RemoteModelMetadata {
  public var exclude: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a> = .missing
  public var useIgnoreFiles: RemoteField<Bool> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "exclude", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "useIgnoreFiles", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case exclude = "exclude"
    case useIgnoreFiles = "useIgnoreFiles"
  }
}

public typealias RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettings_3e412d7b32 = RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab?
