// GENERATED FILE. Do not edit by hand.
import Foundation
public enum ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DUnit_c263982707: String, Codable, Sendable {
  case `percent` = "percent"
  case `tokens` = "tokens"
  case `requests` = "requests"
  case `credits` = "credits"
  case `usd` = "usd"
}

public struct ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItem_3e6404f865: Codable, Sendable, RemoteModelMetadata {
  public var currency: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var id: ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4
  public var label: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var limit: RemoteField<Double> = .missing
  public var resetsAt: RemoteField<Int64> = .missing
  public var unit: RemoteField<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DUnit_c263982707> = .missing
  public var used: RemoteField<Double> = .missing
  public var usedPercent: Double
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "currency", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "limit", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "resetsAt", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "unit", typeName: "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DUnit_c263982707", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "used", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "usedPercent", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: 100, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case currency = "currency"
    case id = "id"
    case label = "label"
    case limit = "limit"
    case resetsAt = "resetsAt"
    case unit = "unit"
    case used = "used"
    case usedPercent = "usedPercent"
  }
}

public struct ProceduregetProviderUsageResultU2DSnapshotsU2DItem_20d7b1e748: Codable, Sendable, RemoteModelMetadata {
  public var authenticatedAs: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var cost: RemoteField<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCost_4147389dac> = .missing
  public var credits: RemoteField<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCredits_a39dd04104> = .missing
  public var error: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var fetchedAt: Int64
  public var plan: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var providerId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var rateLimitedUntil: RemoteField<Int64> = .missing
  public var status: ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DStatus_3466b9b69c
  public var tokens: RemoteField<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DTokens_36a14ea6cf> = .missing
  public var windows: [ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItem_3e6404f865]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "authenticatedAs", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cost", typeName: "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCost_4147389dac", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "credits", typeName: "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCredits_a39dd04104", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "error", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fetchedAt", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "plan", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "rateLimitedUntil", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DStatus_3466b9b69c", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tokens", typeName: "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DTokens_36a14ea6cf", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "windows", typeName: "[ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItem_3e6404f865]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case authenticatedAs = "authenticatedAs"
    case cost = "cost"
    case credits = "credits"
    case error = "error"
    case fetchedAt = "fetchedAt"
    case plan = "plan"
    case providerId = "providerId"
    case rateLimitedUntil = "rateLimitedUntil"
    case status = "status"
    case tokens = "tokens"
    case windows = "windows"
  }
}

public struct ProceduregetProviderUsageResult_b0304b9d9d: Codable, Sendable, RemoteModelMetadata {
  public var fromCache: Bool
  public var snapshots: [ProceduregetProviderUsageResultU2DSnapshotsU2DItem_20d7b1e748]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "fromCache", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "snapshots", typeName: "[ProceduregetProviderUsageResultU2DSnapshotsU2DItem_20d7b1e748]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case fromCache = "fromCache"
    case snapshots = "snapshots"
  }
}
