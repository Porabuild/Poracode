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
  public var currentDeviceId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var devices: [RouteprofileU2DCoreU2DStatsResponseU2DDevice_26f96950d2]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "currentDeviceId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
  public var label: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var percent: Double
  public var provider: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var tokens: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "estimatedCostUsd", typeName: "Double", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "percent", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "provider", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public struct RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotals_05af39c3e9: Codable, Sendable, RemoteModelMetadata {
  public var categories: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsageU2DTokens_e70be7a06d
  public var categorizedTokens: Int64
  public var estimatedSamples: Int64
  public var estimatedTokens: Int64
  public var estimatedUsd: Double
  public var observed: [ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsageU2DCost_ad6bb2de51]
  public var observedSamples: Int64
  public var observedTokens: Int64
  public var tokens: Int64
  public var unpricedTokens: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "categories", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsageU2DTokens_e70be7a06d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "categorizedTokens", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "estimatedSamples", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "estimatedTokens", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "estimatedUsd", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "observed", typeName: "[ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsageU2DCost_ad6bb2de51]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "observedSamples", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "observedTokens", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tokens", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "unpricedTokens", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case categories = "categories"
    case categorizedTokens = "categorizedTokens"
    case estimatedSamples = "estimatedSamples"
    case estimatedTokens = "estimatedTokens"
    case estimatedUsd = "estimatedUsd"
    case observed = "observed"
    case observedSamples = "observedSamples"
    case observedTokens = "observedTokens"
    case tokens = "tokens"
    case unpricedTokens = "unpricedTokens"
  }
}

public struct RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItem_9751de90fd: Codable, Sendable, RemoteModelMetadata {
  public var key: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var label: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var totals: RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotals_05af39c3e9
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "key", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "totals", typeName: "RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotals_05af39c3e9", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case key = "key"
    case label = "label"
    case totals = "totals"
  }
}

public struct RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DDaysU2DItem_d0762ef770: Codable, Sendable, RemoteModelMetadata {
  public var day: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var totals: RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotals_05af39c3e9
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "day", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "totals", typeName: "RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotals_05af39c3e9", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case day = "day"
    case totals = "totals"
  }
}

public struct RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DPricingU2DItem_8ca5860ab0: Codable, Sendable, RemoteModelMetadata {
  public var cacheRead: Double
  public var cacheWrite: Double
  public var cacheWrite1h: Double
  public var effectiveFrom: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var id: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var input: Double
  public var model: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var output: Double
  public var reviewedAt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var source: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cacheRead", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cacheWrite", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cacheWrite1h", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "effectiveFrom", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "input", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "model", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "output", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reviewedAt", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "source", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: "uri", semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case cacheRead = "cacheRead"
    case cacheWrite = "cacheWrite"
    case cacheWrite1h = "cacheWrite1h"
    case effectiveFrom = "effectiveFrom"
    case id = "id"
    case input = "input"
    case model = "model"
    case output = "output"
    case reviewedAt = "reviewedAt"
    case source = "source"
  }
}
