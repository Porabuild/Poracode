// GENERATED FILE. Do not edit by hand.
import Foundation
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

public enum ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DUnit_c263982707: String, Codable, Sendable {
  case `percent` = "percent"
  case `tokens` = "tokens"
  case `requests` = "requests"
  case `credits` = "credits"
  case `usd` = "usd"
}

public struct ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItem_714864208e: Codable, Sendable, RemoteModelMetadata {
  public var breakdown: RemoteField<[ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DBreakdownU2DItem_c86c0c9bb0]> = .missing
  public var currency: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = .missing
  public var id: ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4
  public var label: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var limit: RemoteField<Double> = .missing
  public var resetsAt: RemoteField<Int64> = .missing
  public var unit: RemoteField<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DUnit_c263982707> = .missing
  public var used: RemoteField<Double> = .missing
  public var usedPercent: Double
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "breakdown", typeName: "[ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DBreakdownU2DItem_c86c0c9bb0]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "currency", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_29b52750e4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "limit", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "resetsAt", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "unit", typeName: "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItemU2DUnit_c263982707", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "used", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "usedPercent", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: 100, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case breakdown = "breakdown"
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

public struct ProceduregetProviderUsageResultU2DSnapshotsU2DItem_29885eab7b: Codable, Sendable, RemoteModelMetadata {
  public var authenticatedAs: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = .missing
  public var cost: RemoteField<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCost_4147389dac> = .missing
  public var credits: RemoteField<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCredits_a39dd04104> = .missing
  public var error: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = .missing
  public var fetchedAt: Int64
  public var plan: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = .missing
  public var providerId: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var rateLimitedUntil: RemoteField<Int64> = .missing
  public var status: ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DStatus_3466b9b69c
  public var tokens: RemoteField<ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DTokens_36a14ea6cf> = .missing
  public var windows: [ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItem_714864208e]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "authenticatedAs", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cost", typeName: "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCost_4147389dac", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "credits", typeName: "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DCredits_a39dd04104", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "error", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fetchedAt", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "plan", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerId", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "rateLimitedUntil", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DStatus_3466b9b69c", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tokens", typeName: "ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DTokens_36a14ea6cf", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "windows", typeName: "[ProceduregetProviderUsageResultU2DSnapshotsU2DItemU2DWindowsU2DItem_714864208e]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public struct ProceduregetProviderUsageResult_bf64eabed7: Codable, Sendable, RemoteModelMetadata {
  public var fromCache: Bool
  public var ringLayouts: RemoteField<ProceduregetProviderUsageResultU2DRingLayouts_80c5703401> = .missing
  public var snapshots: [ProceduregetProviderUsageResultU2DSnapshotsU2DItem_29885eab7b]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "fromCache", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ringLayouts", typeName: "ProceduregetProviderUsageResultU2DRingLayouts_80c5703401", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "snapshots", typeName: "[ProceduregetProviderUsageResultU2DSnapshotsU2DItem_29885eab7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case fromCache = "fromCache"
    case ringLayouts = "ringLayouts"
    case snapshots = "snapshots"
  }
}

public struct ProceduregetThreadFollowUpQueueResultU2DOptionU2D1U2DItemsU2DItem_ee4a36083d: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public var prompt: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var segments: RemoteField<[ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754]> = .missing
  public var stagedAt: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "segments", typeName: "[ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "stagedAt", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case prompt = "prompt"
    case segments = "segments"
    case stagedAt = "stagedAt"
  }
}

public struct ProceduregetThreadFollowUpQueueResultU2DOptionU2D1_0174a8d738: Codable, Sendable, RemoteModelMetadata {
  public var items: [ProceduregetThreadFollowUpQueueResultU2DOptionU2D1U2DItemsU2DItem_ee4a36083d]
  public var paused: Bool
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "items", typeName: "[ProceduregetThreadFollowUpQueueResultU2DOptionU2D1U2DItemsU2DItem_ee4a36083d]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "paused", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case items = "items"
    case paused = "paused"
  }
}

public typealias ProceduregetThreadFollowUpQueueResult_91dcfb42aa = ProceduregetThreadFollowUpQueueResultU2DOptionU2D1_0174a8d738?

public struct ProcedureghCancelWorkflowRunRequest_eb12aad287: Codable, Sendable, RemoteModelMetadata {
  public var ghAccount: RemoteField<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff> = .missing
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public var runId: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "ghAccount", typeName: "ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runId", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case ghAccount = "ghAccount"
    case projectLocation = "projectLocation"
    case runId = "runId"
  }
}

public struct ProcedureghCheckAvailableResult_e3b2f05936: Codable, Sendable, RemoteModelMetadata {
  public var available: Bool
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "available", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case available = "available"
  }
}

public struct ProcedureghClosePrRequest_868bf1042a: Codable, Sendable, RemoteModelMetadata {
  public var prNumber: Int64
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "prNumber", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case prNumber = "prNumber"
    case projectLocation = "projectLocation"
  }
}

public struct ProcedureghCreatePrRequest_39c209cff9: Codable, Sendable, RemoteModelMetadata {
  public var baseBranch: String
  public var body: RemoteField<String> = .missing
  public var branch: String
  public var isDraft: RemoteField<Bool> = .missing
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public var title: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "baseBranch", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "body", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "branch", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "isDraft", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case baseBranch = "baseBranch"
    case body = "body"
    case branch = "branch"
    case isDraft = "isDraft"
    case projectLocation = "projectLocation"
    case title = "title"
  }
}

public typealias ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894 = [String: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]

public struct ProcedureghDispatchWorkflowRequest_e56382aee3: Codable, Sendable, RemoteModelMetadata {
  public var ghAccount: RemoteField<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff> = .missing
  public var inputs: RemoteField<ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894> = .missing
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public var ref: RemoteField<String> = .missing
  public var workflowId: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "ghAccount", typeName: "ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "inputs", typeName: "ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ref", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "workflowId", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case ghAccount = "ghAccount"
    case inputs = "inputs"
    case projectLocation = "projectLocation"
    case ref = "ref"
    case workflowId = "workflowId"
  }
}

public struct ProcedureghGetPrChecksRequest_50e8e4265c: Codable, Sendable, RemoteModelMetadata {
  public var branch: String
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "branch", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case branch = "branch"
    case projectLocation = "projectLocation"
  }
}

public struct ProcedureghGetWorkflowDefinitionRequest_30b422e470: Codable, Sendable, RemoteModelMetadata {
  public var ghAccount: RemoteField<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff> = .missing
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public var ref: RemoteField<String> = .missing
  public var workflowId: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "ghAccount", typeName: "ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ref", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "workflowId", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case ghAccount = "ghAccount"
    case projectLocation = "projectLocation"
    case ref = "ref"
    case workflowId = "workflowId"
  }
}

public enum ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4: Codable, Sendable {
  case option1(ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b)
  case option2(Double)
  case option3(Bool)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4)] = []
    if RemoteUnionProbe.matchesString(decoder), let value = try? container.decode(ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b.self) {
      self = .option1(value); return
    }
    if RemoteUnionProbe.matchesNumber(decoder, integer: false), let value = try? container.decode(Double.self) {
      self = .option2(value); return
    }
    if RemoteUnionProbe.matchesBool(decoder), let value = try? container.decode(Bool.self) {
      self = .option3(value); return
    }
    throw DecodingError.typeMismatch(ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4.self, .init(codingPath: decoder.codingPath, debugDescription: "No union option matched ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4"))
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    case .option3(let value): try container.encode(value)
    }
  }
}

public enum ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DType_f450768848: String, Codable, Sendable {
  case `boolean` = "boolean"
  case `choice` = "choice"
  case `environment` = "environment"
  case `number` = "number"
  case `string` = "string"
}

public struct ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItem_efedb06a4d: Codable, Sendable, RemoteModelMetadata {
  public var defaultValue: RemoteField<ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4> = .missing
  public var description: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var name: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var options: [ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]
  public var required: Bool
  public var typeValue: ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DType_f450768848
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "defaultValue", typeName: "ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "description", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "options", typeName: "[ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "required", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DType_f450768848", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case defaultValue = "defaultValue"
    case description = "description"
    case name = "name"
    case options = "options"
    case required = "required"
    case typeValue = "type"
  }
}

public struct ProcedureghGetWorkflowDefinitionResultU2DDefinition_02179e6a4b: Codable, Sendable, RemoteModelMetadata {
  public var defaultBranch: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var dispatchable: Bool
  public var inputs: [ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItem_efedb06a4d]
  public var ref: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var triggers: [ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]
  public var workflowId: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "defaultBranch", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "dispatchable", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "inputs", typeName: "[ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItem_efedb06a4d]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ref", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "triggers", typeName: "[ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "workflowId", typeName: "Int64", required: true, nullable: false, minimum: -9007199254740991, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case defaultBranch = "defaultBranch"
    case dispatchable = "dispatchable"
    case inputs = "inputs"
    case ref = "ref"
    case triggers = "triggers"
    case workflowId = "workflowId"
  }
}

public struct ProcedureghGetWorkflowDefinitionResult_8a0ca790b0: Codable, Sendable, RemoteModelMetadata {
  public var definition: ProcedureghGetWorkflowDefinitionResultU2DDefinition_02179e6a4b
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "definition", typeName: "ProcedureghGetWorkflowDefinitionResultU2DDefinition_02179e6a4b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case definition = "definition"
  }
}
