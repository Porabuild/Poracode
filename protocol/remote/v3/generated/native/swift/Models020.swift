// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshot_fdddba9ec6: Codable, Sendable, RemoteModelMetadata {
  public var completionPolicy: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286
  public var maxIterations: RemoteField<Int64>
  public var maxRuntimeSeconds: Int64
  public var misfirePolicy: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMisfirePolicy_bb479bc584
  public var mode: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMode_b588ef57eb
  public var retryPolicy: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicy_de13949691
  public var stopOnError: Bool
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "completionPolicy", typeName: "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DCompletionPolicy_fc24a3f286", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxIterations", typeName: "Int64", required: true, nullable: true, minimum: 1, maximum: 100, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxRuntimeSeconds", typeName: "Int64", required: true, nullable: false, minimum: 60, maximum: 86400, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "misfirePolicy", typeName: "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMisfirePolicy_bb479bc584", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mode", typeName: "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DMode_b588ef57eb", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "retryPolicy", typeName: "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshotU2DRetryPolicy_de13949691", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "stopOnError", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = ["schedule.automation"]
  private enum CodingKeys: String, CodingKey {
    case completionPolicy = "completionPolicy"
    case maxIterations = "maxIterations"
    case maxRuntimeSeconds = "maxRuntimeSeconds"
    case misfirePolicy = "misfirePolicy"
    case mode = "mode"
    case retryPolicy = "retryPolicy"
    case stopOnError = "stopOnError"
    case version = "version"
  }
}

public typealias RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DCompletedAt_595da89b21 = String?

public struct RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DCompletionEvaluation_b2d5bb9fac: Codable, Sendable, RemoteModelMetadata {
  public var condition: String
  public var confidence: Double
  public var evaluatedAt: String
  public var reason: String
  public var stopMatched: Bool
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "condition", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 2000, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "confidence", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: 1, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "evaluatedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
    .init(wireName: "reason", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 1000, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "stopMatched", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case condition = "condition"
    case confidence = "confidence"
    case evaluatedAt = "evaluatedAt"
    case reason = "reason"
    case stopMatched = "stopMatched"
  }
}

public enum RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DOutcome_75fa28583d: String, Codable, Sendable {
  case findings = "findings"
  case noU2DFindings = "no-findings"
  case changedU2DFiles = "changed-files"
  case needsU2DAttention = "needs-attention"
  case unknown = "unknown"
}

public enum RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DSeverity_2d5efa5a79: String, Codable, Sendable {
  case info = "info"
  case warning = "warning"
  case error = "error"
}

public typealias RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DStopReason_7bbdba78cb = String?

public typealias RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DSummary_74b3a4e217 = String?

public struct RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1_ae4a760581: Codable, Sendable, RemoteModelMetadata {
  public var archivedAt: RemoteField<String>
  public var changedFiles: [ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]
  public var completionEvaluation: RemoteField<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DCompletionEvaluation_b2d5bb9fac> = .missing
  public var outcome: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DOutcome_75fa28583d
  public var severity: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DSeverity_2d5efa5a79
  public var stopReason: RemoteField<String>
  public var summary: RemoteField<String>
  public var unread: Bool
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "archivedAt", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
    .init(wireName: "changedFiles", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 100, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "completionEvaluation", typeName: "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DCompletionEvaluation_b2d5bb9fac", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "outcome", typeName: "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DOutcome_75fa28583d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "severity", typeName: "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1U2DSeverity_2d5efa5a79", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "stopReason", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: 1000, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "summary", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: 2000, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "unread", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case archivedAt = "archivedAt"
    case changedFiles = "changedFiles"
    case completionEvaluation = "completionEvaluation"
    case outcome = "outcome"
    case severity = "severity"
    case stopReason = "stopReason"
    case summary = "summary"
    case unread = "unread"
  }
}

public typealias RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResult_66ee2eb4ed = RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1_ae4a760581?

public enum RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DStatus_2151c8edcf: String, Codable, Sendable {
  case running = "running"
  case waitingU2DForU2DApproval = "waiting-for-approval"
  case succeeded = "succeeded"
  case failed = "failed"
  case cancelled = "cancelled"
  case interrupted = "interrupted"
  case skipped = "skipped"
}

public enum RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DTrigger_56296b74a9: String, Codable, Sendable {
  case manual = "manual"
  case scheduled = "scheduled"
  case retry = "retry"
}

public struct RouteautomationsU2DSnapshotResponseU2DRunsU2DItem_38754692c8: Codable, Sendable, RemoteModelMetadata {
  public var attempt: RemoteField<Int64> = .missing
  public var automationSnapshot: RemoteField<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshot_fdddba9ec6> = .missing
  public var completedAt: RemoteField<String>
  public var error: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public var id: String
  public var iteration: RemoteField<Int64> = .missing
  public var result: RemoteField<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1_ae4a760581> = .missing
  public var scheduleId: String
  public var scheduledFor: RemoteField<String> = .missing
  public var startedAt: String
  public var status: RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DStatus_2151c8edcf
  public var summary: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public var threadId: String
  public var trigger: RemoteField<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DTrigger_56296b74a9> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "attempt", typeName: "Int64", required: false, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "automationSnapshot", typeName: "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshot_fdddba9ec6", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["schedule.automation"]),
    .init(wireName: "completedAt", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
    .init(wireName: "error", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "iteration", typeName: "Int64", required: false, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "result", typeName: "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DResultU2DOptionU2D1_ae4a760581", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scheduleId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "scheduledFor", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
    .init(wireName: "startedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
    .init(wireName: "status", typeName: "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DStatus_2151c8edcf", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "summary", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "trigger", typeName: "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DTrigger_56296b74a9", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case attempt = "attempt"
    case automationSnapshot = "automationSnapshot"
    case completedAt = "completedAt"
    case error = "error"
    case id = "id"
    case iteration = "iteration"
    case result = "result"
    case scheduleId = "scheduleId"
    case scheduledFor = "scheduledFor"
    case startedAt = "startedAt"
    case status = "status"
    case summary = "summary"
    case threadId = "threadId"
    case trigger = "trigger"
  }
}

public struct RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DConfig_f69100925f: Codable, Sendable, RemoteModelMetadata {
  public var contextSize: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var effort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var fast: RemoteField<Bool> = .missing
  public var model: String
  public var selectionBinding: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBinding_a11ab76af3> = .missing
  public var thinking: RemoteField<Bool> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "contextSize", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "effort", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fast", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "model", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "selectionBinding", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBinding_a11ab76af3", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "thinking", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case contextSize = "contextSize"
    case effort = "effort"
    case fast = "fast"
    case model = "model"
    case selectionBinding = "selectionBinding"
    case thinking = "thinking"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.contextSize = try container.decode(RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>.self, forKey: .contextSize)
    self.effort = try container.decode(RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>.self, forKey: .effort)
    self.fast = try container.decode(RemoteField<Bool>.self, forKey: .fast)
    self.model = try container.decode(String.self, forKey: .model)
    self.selectionBinding = try container.decode(RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBinding_a11ab76af3>.self, forKey: .selectionBinding)
    self.thinking = try container.decode(RemoteField<Bool>.self, forKey: .thinking)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(contextSize, forKey: .contextSize)
    try container.encode(effort, forKey: .effort)
    try container.encode(fast, forKey: .fast)
    try container.encode(model, forKey: .model)
    try container.encode(selectionBinding, forKey: .selectionBinding)
    try container.encode(thinking, forKey: .thinking)
  }
}

public enum RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DLastStatus_aa5449703b: String, Codable, Sendable {
  case never = "never"
  case running = "running"
  case waitingU2DForU2DApproval = "waiting-for-approval"
  case succeeded = "succeeded"
  case failed = "failed"
  case cancelled = "cancelled"
  case interrupted = "interrupted"
  case skipped = "skipped"
}

public enum RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D1U2DKind_6f5933af03: String, Codable, Sendable {
  case hourly = "hourly"
}

public struct RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D1_a467b0ed1c: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D1U2DKind_6f5933af03
  public var minute: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D1U2DKind_6f5933af03", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "minute", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 59, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case minute = "minute"
  }
}

public enum RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D2U2DKind_475f91db7d: String, Codable, Sendable {
  case weekly = "weekly"
}

public struct RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D2_ac7865b2a5: Codable, Sendable, RemoteModelMetadata {
  public var days: [Int64]
  public var kind: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D2U2DKind_475f91db7d
  public var time: String
  public var timeZone: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "days", typeName: "[Int64]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 1, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D2U2DKind_475f91db7d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "time", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([01]\\d|2[0-3]):[0-5]\\d$", format: nil, semanticValidatorIds: []),
    .init(wireName: "timeZone", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["schedule.time-zone", "string.trim"]),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case days = "days"
    case kind = "kind"
    case time = "time"
    case timeZone = "timeZone"
  }
}

public enum RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D3U2DKind_e5ee0a0722: String, Codable, Sendable {
  case once = "once"
}

public struct RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D3_d1c4cb16ae: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D3U2DKind_e5ee0a0722
  public var runAt: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D3U2DKind_e5ee0a0722", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case runAt = "runAt"
  }
}

public enum RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D4U2DKind_6cf695d23a: String, Codable, Sendable {
  case interval = "interval"
}

public enum RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D4U2DUnit_e4a434d61c: String, Codable, Sendable {
  case minutes = "minutes"
  case hours = "hours"
  case days = "days"
}

public struct RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D4_84ccfb83d8: Codable, Sendable, RemoteModelMetadata {
  public var every: Int64
  public var kind: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D4U2DKind_6cf695d23a
  public var unit: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D4U2DUnit_e4a434d61c
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "every", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 999, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D4U2DKind_6cf695d23a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "unit", typeName: "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D4U2DUnit_e4a434d61c", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case every = "every"
    case kind = "kind"
    case unit = "unit"
  }
}

public enum RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D5U2DKind_a050e4e432: String, Codable, Sendable {
  case cron = "cron"
}

public struct RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D5_0a49efe270: Codable, Sendable, RemoteModelMetadata {
  public var expression: String
  public var kind: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D5U2DKind_a050e4e432
  public var timeZone: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "expression", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["schedule.cron", "string.trim"]),
    .init(wireName: "kind", typeName: "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D5U2DKind_a050e4e432", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "timeZone", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["schedule.time-zone", "string.trim"]),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case expression = "expression"
    case kind = "kind"
    case timeZone = "timeZone"
  }
}

public enum RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47: Codable, Sendable {
  case option1(RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D1_a467b0ed1c)
  case option2(RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D2_ac7865b2a5)
  case option3(RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D3_d1c4cb16ae)
  case option4(RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D4_84ccfb83d8)
  case option5(RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D5_0a49efe270)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("hourly")]), let value = try? container.decode(RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D1_a467b0ed1c.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("weekly")]), let value = try? container.decode(RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D2_ac7865b2a5.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("once")]), let value = try? container.decode(RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D3_d1c4cb16ae.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("interval")]), let value = try? container.decode(RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D4_84ccfb83d8.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("cron")]), let value = try? container.decode(RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrenceU2DOptionU2D5_0a49efe270.self) {
      matches.append((5, .option5(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47" : "Ambiguous union RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
    }
    self = matches[0].1
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
