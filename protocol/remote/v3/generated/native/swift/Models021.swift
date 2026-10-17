// GENERATED FILE. Do not edit by hand.
import Foundation
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

public struct RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItem_14f6b52f84: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: String
  public var automation: RemoteField<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshot_fdddba9ec6> = .missing
  public var config: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DConfig_f69100925f
  public var createdAt: String
  public var enabled: Bool
  public var id: String
  public var iterationCount: RemoteField<Int64> = .missing
  public var lastCompletedAt: RemoteField<String>
  public var lastError: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public var lastResult: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public var lastRunAt: RemoteField<String>
  public var lastStatus: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DLastStatus_aa5449703b
  public var name: String
  public var nextRunAt: RemoteField<String>
  public var projectId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var prompt: String
  public var recurrence: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47
  public var updatedAt: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "automation", typeName: "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshot_fdddba9ec6", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["schedule.automation"]),
    .init(wireName: "config", typeName: "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DConfig_f69100925f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "createdAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
    .init(wireName: "enabled", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "iterationCount", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastCompletedAt", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
    .init(wireName: "lastError", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastResult", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastRunAt", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
    .init(wireName: "lastStatus", typeName: "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DLastStatus_aa5449703b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "nextRunAt", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 50000, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "recurrence", typeName: "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "updatedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentKind = "agentKind"
    case automation = "automation"
    case config = "config"
    case createdAt = "createdAt"
    case enabled = "enabled"
    case id = "id"
    case iterationCount = "iterationCount"
    case lastCompletedAt = "lastCompletedAt"
    case lastError = "lastError"
    case lastResult = "lastResult"
    case lastRunAt = "lastRunAt"
    case lastStatus = "lastStatus"
    case name = "name"
    case nextRunAt = "nextRunAt"
    case projectId = "projectId"
    case prompt = "prompt"
    case recurrence = "recurrence"
    case updatedAt = "updatedAt"
  }
}

public struct RouteautomationsU2DSnapshotResponse_6d3a7935ec: Codable, Sendable, RemoteModelMetadata {
  public var runs: [RouteautomationsU2DSnapshotResponseU2DRunsU2DItem_38754692c8]
  public var schedules: [RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItem_14f6b52f84]
  public var unreadCount: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "runs", typeName: "[RouteautomationsU2DSnapshotResponseU2DRunsU2DItem_38754692c8]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "schedules", typeName: "[RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItem_14f6b52f84]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "unreadCount", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case runs = "runs"
    case schedules = "schedules"
    case unreadCount = "unreadCount"
  }
}

public enum RoutebrowserU2DCommandRequestU2DOptionU2D1U2DKind_0138c350a1: String, Codable, Sendable {
  case createU2DTab = "create-tab"
}

public struct RoutebrowserU2DCommandRequestU2DOptionU2D1_3328521e00: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutebrowserU2DCommandRequestU2DOptionU2D1U2DKind_0138c350a1
  public var url: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutebrowserU2DCommandRequestU2DOptionU2D1U2DKind_0138c350a1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "url", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case url = "url"
  }
}

public enum RoutebrowserU2DCommandRequestU2DOptionU2D2U2DKind_3df0ab0b4e: String, Codable, Sendable {
  case closeU2DTab = "close-tab"
}

public struct RoutebrowserU2DCommandRequestU2DOptionU2D2_51f2acb99e: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutebrowserU2DCommandRequestU2DOptionU2D2U2DKind_3df0ab0b4e
  public var tabId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutebrowserU2DCommandRequestU2DOptionU2D2U2DKind_3df0ab0b4e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tabId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case tabId = "tabId"
  }
}

public enum RoutebrowserU2DCommandRequestU2DOptionU2D3U2DKind_c39ba2db20: String, Codable, Sendable {
  case activateU2DTab = "activate-tab"
}

public struct RoutebrowserU2DCommandRequestU2DOptionU2D3_483d5aa44f: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutebrowserU2DCommandRequestU2DOptionU2D3U2DKind_c39ba2db20
  public var tabId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutebrowserU2DCommandRequestU2DOptionU2D3U2DKind_c39ba2db20", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tabId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case tabId = "tabId"
  }
}

public enum RoutebrowserU2DCommandRequestU2DOptionU2D4U2DKind_ed1865d937: String, Codable, Sendable {
  case moveU2DTab = "move-tab"
}

public enum RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e: String, Codable, Sendable {
  case before = "before"
  case after = "after"
}

public struct RoutebrowserU2DCommandRequestU2DOptionU2D4_875b3bd940: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutebrowserU2DCommandRequestU2DOptionU2D4U2DKind_ed1865d937
  public var position: RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e
  public var tabId: String
  public var targetTabId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutebrowserU2DCommandRequestU2DOptionU2D4U2DKind_ed1865d937", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "position", typeName: "RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tabId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "targetTabId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case position = "position"
    case tabId = "tabId"
    case targetTabId = "targetTabId"
  }
}

public enum RoutebrowserU2DCommandRequestU2DOptionU2D5U2DKind_9063020a6c: String, Codable, Sendable {
  case navigate = "navigate"
}
