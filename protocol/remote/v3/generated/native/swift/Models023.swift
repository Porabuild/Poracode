// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D2_056ce41be8: Codable, Sendable, RemoteModelMetadata {
  public var days: [Int64]
  public var kind: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D2U2DKind_475f91db7d
  public var time: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "days", typeName: "[Int64]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 1, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D2U2DKind_475f91db7d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "time", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([01]\\d|2[0-3]):[0-5]\\d$", format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case days = "days"
    case kind = "kind"
    case time = "time"
  }
}

public enum RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D3U2DKind_e5ee0a0722: String, Codable, Sendable {
  case once = "once"
}

public struct RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D3_d1c4cb16ae: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D3U2DKind_e5ee0a0722
  public var runAt: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D3U2DKind_e5ee0a0722", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case runAt = "runAt"
  }
}

public enum RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9: Codable, Sendable {
  case option1(RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D1_a467b0ed1c)
  case option2(RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D2_056ce41be8)
  case option3(RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D3_d1c4cb16ae)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("hourly")]), let value = try? container.decode(RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D1_a467b0ed1c.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("weekly")]), let value = try? container.decode(RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D2_056ce41be8.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("once")]), let value = try? container.decode(RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D3_d1c4cb16ae.self) {
      matches.append((3, .option3(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9" : "Ambiguous union RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
    }
    self = matches[0].1
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

public struct RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_4529714695: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: String
  public var config: RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd
  public var enabled: Bool
  public var name: String
  public var projectId: RemoteField<String> = .missing
  public var prompt: String
  public var recurrence: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "enabled", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "projectId", typeName: "String", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 50000, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "recurrence", typeName: "RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentKind = "agentKind"
    case config = "config"
    case enabled = "enabled"
    case name = "name"
    case projectId = "projectId"
    case prompt = "prompt"
    case recurrence = "recurrence"
  }
}

public struct RouteschedulesU2DCommandRequestU2DOptionU2D1_0b430722c6: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteprojectU2DCommandRequestU2DOptionU2D2U2DKind_1f45188862
  public var task: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_4529714695
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D2U2DKind_1f45188862", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "task", typeName: "RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_4529714695", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case task = "task"
  }
}

public struct RouteschedulesU2DCommandRequestU2DOptionU2D2_9278450827: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public var kind: RouteprojectU2DCommandRequestU2DOptionU2D4U2DKind_cbc64d1458
  public var task: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_4529714695
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DKind_cbc64d1458", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "task", typeName: "RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_4529714695", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case kind = "kind"
    case task = "task"
  }
}

public enum RouteschedulesU2DCommandRequestU2DOptionU2D3U2DKind_4d5989d27d: String, Codable, Sendable {
  case delete = "delete"
}

public struct RouteschedulesU2DCommandRequestU2DOptionU2D3_e7cab2d2c0: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public var kind: RouteschedulesU2DCommandRequestU2DOptionU2D3U2DKind_4d5989d27d
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RouteschedulesU2DCommandRequestU2DOptionU2D3U2DKind_4d5989d27d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case kind = "kind"
  }
}

public enum RouteschedulesU2DCommandRequestU2DOptionU2D4U2DKind_d12ea65516: String, Codable, Sendable {
  case run = "run"
}

public struct RouteschedulesU2DCommandRequestU2DOptionU2D4_09f700fdeb: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public var kind: RouteschedulesU2DCommandRequestU2DOptionU2D4U2DKind_d12ea65516
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RouteschedulesU2DCommandRequestU2DOptionU2D4U2DKind_d12ea65516", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case kind = "kind"
  }
}

public enum RouteschedulesU2DCommandRequest_72e4a424a2: Codable, Sendable {
  case option1(RouteschedulesU2DCommandRequestU2DOptionU2D1_0b430722c6)
  case option2(RouteschedulesU2DCommandRequestU2DOptionU2D2_9278450827)
  case option3(RouteschedulesU2DCommandRequestU2DOptionU2D3_e7cab2d2c0)
  case option4(RouteschedulesU2DCommandRequestU2DOptionU2D4_09f700fdeb)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteschedulesU2DCommandRequest_72e4a424a2)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("create")]), let value = try? container.decode(RouteschedulesU2DCommandRequestU2DOptionU2D1_0b430722c6.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("update")]), let value = try? container.decode(RouteschedulesU2DCommandRequestU2DOptionU2D2_9278450827.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("delete")]), let value = try? container.decode(RouteschedulesU2DCommandRequestU2DOptionU2D3_e7cab2d2c0.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("run")]), let value = try? container.decode(RouteschedulesU2DCommandRequestU2DOptionU2D4_09f700fdeb.self) {
      matches.append((4, .option4(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RouteschedulesU2DCommandRequest_72e4a424a2" : "Ambiguous union RouteschedulesU2DCommandRequest_72e4a424a2 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RouteschedulesU2DCommandRequest_72e4a424a2.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
    }
  }
}

public enum RouteschedulesU2DCommandResponseU2DScheduleU2DLastStatus_aafa839556: String, Codable, Sendable {
  case never = "never"
  case running = "running"
  case succeeded = "succeeded"
  case failed = "failed"
}

public struct RouteschedulesU2DCommandResponseU2DSchedule_73baee1e40: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: String
  public var config: RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd
  public var createdAt: String
  public var enabled: Bool
  public var id: String
  public var lastCompletedAt: RemoteField<String>
  public var lastError: RemoteField<String>
  public var lastResult: RemoteField<String>
  public var lastRunAt: RemoteField<String>
  public var lastStatus: RouteschedulesU2DCommandResponseU2DScheduleU2DLastStatus_aafa839556
  public var name: String
  public var nextRunAt: RemoteField<String>
  public var projectId: RemoteField<String> = .missing
  public var prompt: String
  public var recurrence: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9
  public var updatedAt: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "createdAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
    .init(wireName: "enabled", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "lastCompletedAt", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
    .init(wireName: "lastError", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastResult", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastRunAt", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
    .init(wireName: "lastStatus", typeName: "RouteschedulesU2DCommandResponseU2DScheduleU2DLastStatus_aafa839556", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "nextRunAt", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 50000, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "recurrence", typeName: "RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_370441a9f9", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "updatedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentKind = "agentKind"
    case config = "config"
    case createdAt = "createdAt"
    case enabled = "enabled"
    case id = "id"
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

public struct RouteschedulesU2DCommandResponse_320890c24c: Codable, Sendable, RemoteModelMetadata {
  public var schedule: RemoteField<RouteschedulesU2DCommandResponseU2DSchedule_73baee1e40> = .missing
  public var schedules: [RouteschedulesU2DCommandResponseU2DSchedule_73baee1e40]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "schedule", typeName: "RouteschedulesU2DCommandResponseU2DSchedule_73baee1e40", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "schedules", typeName: "[RouteschedulesU2DCommandResponseU2DSchedule_73baee1e40]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case schedule = "schedule"
    case schedules = "schedules"
  }
}

public typealias RoutesettingsU2DReadResponseU2DSettingsU2DAgentSettings_deb61378c1 = [String: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaults_cff1242509]

public enum RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServersU2DPropertyU2DName_13f43aaaf5: String, Codable, Sendable {
  case browser = "browser"
  case crossagents = "crossagents"
  case chrome = "chrome"
  case computerU2DUse = "computer-use"
  case appU2DControls = "app-controls"
}

public typealias RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServers_65899fb957 = [String: Bool]

public typealias RoutesettingsU2DReadResponseU2DSettingsU2DEnabledMcpServers_2d677fb041 = [String: Bool]

public typealias RoutesettingsU2DReadResponseU2DSettingsU2DHiddenModels_86d5d72e84 = [String: [String]]

public enum RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8: String, Codable, Sendable {
  case off = "off"
  case fix = "fix"
  case merge = "merge"
}

public enum RoutesettingsU2DReadResponseU2DSettingsU2DPrMergeMethod_9c01de6b08: String, Codable, Sendable {
  case merge = "merge"
  case squash = "squash"
  case rebase = "rebase"
}

public typealias RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22 = [String: Int64]

public struct RoutesettingsU2DReadResponseU2DSettingsU2DUsage_18dc352c9a: Codable, Sendable, RemoteModelMetadata {
  public var autoRefresh: Bool
  public var collapsedProviders: [String]
  public var disabledProviders: [String]
  public var providerOrder: [String]
  public var providerRefreshIntervals: RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22
  public var refreshIntervalMinutes: Int64
  public var selectedRingGroups: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986
  public var showEstimatedCost: Bool
  public var showInSidebar: Bool
  public var sidebarHiddenProviders: [String]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "autoRefresh", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "collapsedProviders", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabledProviders", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerOrder", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerRefreshIntervals", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refreshIntervalMinutes", typeName: "Int64", required: true, nullable: false, minimum: 2, maximum: 120, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "selectedRingGroups", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "showEstimatedCost", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "showInSidebar", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sidebarHiddenProviders", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case autoRefresh = "autoRefresh"
    case collapsedProviders = "collapsedProviders"
    case disabledProviders = "disabledProviders"
    case providerOrder = "providerOrder"
    case providerRefreshIntervals = "providerRefreshIntervals"
    case refreshIntervalMinutes = "refreshIntervalMinutes"
    case selectedRingGroups = "selectedRingGroups"
    case showEstimatedCost = "showEstimatedCost"
    case showInSidebar = "showInSidebar"
    case sidebarHiddenProviders = "sidebarHiddenProviders"
  }
}
