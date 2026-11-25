// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProceduregetProviderUsageRequest_f2b9759b60: Codable, Sendable, RemoteModelMetadata {
  public var force: RemoteField<Bool> = .missing
  public var providerIds: RemoteField<[ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "force", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerIds", typeName: "[ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case force = "force"
    case providerIds = "providerIds"
  }
}

public struct ProceduregetProviderUsageResultU2DRingLayoutsU2DValue_4b47ae3fc7: Codable, Sendable, RemoteModelMetadata {
  public var innerWindowId: RemoteField<String> = .missing
  public var outerWindowId: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "innerWindowId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "outerWindowId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case innerWindowId = "innerWindowId"
    case outerWindowId = "outerWindowId"
  }
}

public typealias ProceduregetProviderUsageResultU2DRingLayouts_80c5703401 = [String: ProceduregetProviderUsageResultU2DRingLayoutsU2DValue_4b47ae3fc7]

public enum ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203: String, Codable, Sendable {
  case `today` = "today"
  case `n7d` = "7d"
  case `n30d` = "30d"
  case `cycle` = "cycle"
}

public struct ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCost_4147389dac: Codable, Sendable, RemoteModelMetadata {
  public var amount: Double
  public var currency: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var estimated: Bool
  public var period: ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "amount", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "currency", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "estimated", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "period", typeName: "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case amount = "amount"
    case currency = "currency"
    case estimated = "estimated"
    case period = "period"
  }
}

public struct ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCredits_a39dd04104: Codable, Sendable, RemoteModelMetadata {
  public var balance: Double
  public var currency: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = .missing
  public var label: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = .missing
  public var unlimited: RemoteField<Bool> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "balance", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "currency", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "unlimited", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case balance = "balance"
    case currency = "currency"
    case label = "label"
    case unlimited = "unlimited"
  }
}

public enum ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DStatus_3466b9b69c: String, Codable, Sendable {
  case `ok` = "ok"
  case `authU2DMissing` = "auth-missing"
  case `appU2DNotU2DRunning` = "app-not-running"
  case `rateU2DLimited` = "rate-limited"
  case `quotaU2DHit` = "quota-hit"
  case `unsupported` = "unsupported"
  case `error` = "error"
}

public struct ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DTokens_36a14ea6cf: Codable, Sendable, RemoteModelMetadata {
  public var cacheRead: RemoteField<Double> = .missing
  public var cacheWrite: RemoteField<Double> = .missing
  public var input: RemoteField<Double> = .missing
  public var output: RemoteField<Double> = .missing
  public var period: RemoteField<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203> = .missing
  public var total: RemoteField<Double> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cacheRead", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cacheWrite", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "input", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "output", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "period", typeName: "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "total", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case cacheRead = "cacheRead"
    case cacheWrite = "cacheWrite"
    case input = "input"
    case output = "output"
    case period = "period"
    case total = "total"
  }
}

public struct ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DBreakdownU2DItem_c86c0c9bb0: Codable, Sendable, RemoteModelMetadata {
  public var currency: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = .missing
  public var label: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var limit: RemoteField<Double> = .missing
  public var tokens: RemoteField<Double> = .missing
  public var used: RemoteField<Double> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "currency", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "limit", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tokens", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "used", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case currency = "currency"
    case label = "label"
    case limit = "limit"
    case tokens = "tokens"
    case used = "used"
  }
}
