// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteprofileU2DTokenU2DStatsResponseU2DCosts_9f69a3eb58: Codable, Sendable, RemoteModelMetadata {
  public var accounts: [RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItem_c96dee8710]
  public var dayModels: RemoteField<[RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DDayModelsU2DItem_9939fd9aa1]> = .missing
  public var dayProviders: RemoteField<[RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DDayProvidersU2DItem_3cba112875]> = .missing
  public var days: [RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DDaysU2DItem_01b65e34c5]
  public var models: [RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItem_c96dee8710]
  public var pricing: [RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DPricingU2DItem_8ca5860ab0]
  public var providers: [RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItem_c96dee8710]
  public var totals: RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotals_e0fa095c6a
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "accounts", typeName: "[RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItem_c96dee8710]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "dayModels", typeName: "[RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DDayModelsU2DItem_9939fd9aa1]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "dayProviders", typeName: "[RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DDayProvidersU2DItem_3cba112875]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "days", typeName: "[RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DDaysU2DItem_01b65e34c5]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "models", typeName: "[RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItem_c96dee8710]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pricing", typeName: "[RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DPricingU2DItem_8ca5860ab0]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providers", typeName: "[RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItem_c96dee8710]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "totals", typeName: "RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotals_e0fa095c6a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case accounts = "accounts"
    case dayModels = "dayModels"
    case dayProviders = "dayProviders"
    case days = "days"
    case models = "models"
    case pricing = "pricing"
    case providers = "providers"
    case totals = "totals"
  }
}

public struct RouteprofileU2DTokenU2DStatsResponseU2DRecentU2DLast30d_745f2435a6: Codable, Sendable, RemoteModelMetadata {
  public var cacheReadTokens: Int64
  public var cacheWriteTokens: Int64
  public var estimatedUsd: Double
  public var inputTokens: Int64
  public var models: [RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc]
  public var observed: [ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsageU2DCost_ad6bb2de51]
  public var outputTokens: Int64
  public var providers: [RouteprofileU2DTokenU2DStatsResponseU2DAccountsU2DItem_c30da54b85]
  public var tokens: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cacheReadTokens", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cacheWriteTokens", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "estimatedUsd", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "inputTokens", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "models", typeName: "[RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "observed", typeName: "[ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsageU2DCost_ad6bb2de51]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "outputTokens", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providers", typeName: "[RouteprofileU2DTokenU2DStatsResponseU2DAccountsU2DItem_c30da54b85]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tokens", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case cacheReadTokens = "cacheReadTokens"
    case cacheWriteTokens = "cacheWriteTokens"
    case estimatedUsd = "estimatedUsd"
    case inputTokens = "inputTokens"
    case models = "models"
    case observed = "observed"
    case outputTokens = "outputTokens"
    case providers = "providers"
    case tokens = "tokens"
  }
}
