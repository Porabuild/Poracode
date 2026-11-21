// GENERATED FILE. Do not edit by hand.
import Foundation
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

public struct RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotalsU2DCategoryCostUsd_5e0b4ff187: Codable, Sendable, RemoteModelMetadata {
  public var cacheRead: Double
  public var cacheWrite: Double
  public var input: Double
  public var output: Double
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cacheRead", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cacheWrite", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "input", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "output", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case cacheRead = "cacheRead"
    case cacheWrite = "cacheWrite"
    case input = "input"
    case output = "output"
  }
}

public struct RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotals_e0fa095c6a: Codable, Sendable, RemoteModelMetadata {
  public var cacheSavingsUsd: RemoteField<Double> = .missing
  public var categories: ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsageU2DTokens_e70be7a06d
  public var categorizedTokens: Int64
  public var categoryCostUsd: RemoteField<RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotalsU2DCategoryCostUsd_5e0b4ff187> = .missing
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
    .init(wireName: "cacheSavingsUsd", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "categories", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D10U2DUsageU2DTokens_e70be7a06d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "categorizedTokens", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "categoryCostUsd", typeName: "RouteprofileU2DTokenU2DStatsResponseU2DCostsU2DAccountsU2DItemU2DTotalsU2DCategoryCostUsd_5e0b4ff187", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
    case cacheSavingsUsd = "cacheSavingsUsd"
    case categories = "categories"
    case categorizedTokens = "categorizedTokens"
    case categoryCostUsd = "categoryCostUsd"
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
