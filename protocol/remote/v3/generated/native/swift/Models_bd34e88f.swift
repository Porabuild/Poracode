// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCredits_a39dd04104: Codable, Sendable, RemoteModelMetadata {
  public var balance: Double
  public var currency: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var label: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var unlimited: RemoteField<Bool> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "balance", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "currency", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public enum ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DIdU2DOptionU2D1_7e8114c3dd: String, Codable, Sendable {
  case `sessionU2D5h` = "session-5h"
  case `daily` = "daily"
  case `weekly` = "weekly"
  case `weeklyU2DOpus` = "weekly-opus"
  case `weeklyU2DSonnet` = "weekly-sonnet"
  case `weeklyU2DFable` = "weekly-fable"
  case `monthly` = "monthly"
  case `extraU2DUsage` = "extra-usage"
  case `cursorU2DAuto` = "cursor-auto"
  case `cursorU2DApi` = "cursor-api"
}

public enum ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4: Codable, Sendable {
  case option1(ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DIdU2DOptionU2D1_7e8114c3dd)
  case option2(String)
  case option3(String)
  case option4(String)
  case option5(String)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4)] = []
    if RemoteUnionProbe.matchesString(decoder, literals: [.string("session-5h"), .string("daily"), .string("weekly"), .string("weekly-opus"), .string("weekly-sonnet"), .string("weekly-fable"), .string("monthly"), .string("extra-usage"), .string("cursor-auto"), .string("cursor-api")]), let value = try? container.decode(ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DIdU2DOptionU2D1_7e8114c3dd.self) {
      self = .option1(value); return
    }
    if RemoteUnionProbe.matchesString(decoder, pattern: "^gemini:.+"), let value = try? container.decode(String.self) {
      self = .option2(value); return
    }
    if RemoteUnionProbe.matchesString(decoder, pattern: "^codex:.+"), let value = try? container.decode(String.self) {
      self = .option3(value); return
    }
    if RemoteUnionProbe.matchesString(decoder, pattern: "^antigravity:.+"), let value = try? container.decode(String.self) {
      self = .option4(value); return
    }
    if RemoteUnionProbe.matchesString(decoder, pattern: "^factory:.+"), let value = try? container.decode(String.self) {
      self = .option5(value); return
    }
    throw DecodingError.typeMismatch(ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4.self, .init(codingPath: decoder.codingPath, debugDescription: "No union option matched ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4"))
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
