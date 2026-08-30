// GENERATED FILE. Do not edit by hand.
import Foundation
public enum RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce: Codable, Sendable {
  case option1(String)
  case option2(Int64)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce)] = []
    if RemoteUnionProbe.matchesString(decoder), let value = try? container.decode(String.self) {
      self = .option1(value); return
    }
    if RemoteUnionProbe.matchesNumber(decoder, integer: true, minimum: -9007199254740991.0, maximum: 9007199254740991.0), let value = try? container.decode(Int64.self) {
      self = .option2(value); return
    }
    throw DecodingError.typeMismatch(RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce.self, .init(codingPath: decoder.codingPath, debugDescription: "No union option matched RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce"))
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    }
  }
}

public struct RouteruntimeU2DImageQuery_1dbbfc3a2e: Codable, Sendable, RemoteModelMetadata {
  public var accessU5FToken: RemoteField<String> = .missing
  public var path: [RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "access_token", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "[RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 1, maxItems: 8, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case accessU5FToken = "access_token"
    case path = "path"
  }
}

public struct RoutescheduleU2DRunsU2DReadQuery_08eb4244d2: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
  }
}

public typealias RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItemU2DCompletedAt_01f7df3e67 = String?

public enum RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItemU2DStatus_d21b71d44d: String, Codable, Sendable {
  case running = "running"
  case succeeded = "succeeded"
  case failed = "failed"
  case interrupted = "interrupted"
}

public struct RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItem_b0c6bfbd3c: Codable, Sendable, RemoteModelMetadata {
  public var completedAt: RemoteField<String>
  public var error: RemoteField<String>
  public var id: String
  public var scheduleId: String
  public var startedAt: String
  public var status: RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItemU2DStatus_d21b71d44d
  public var summary: RemoteField<String>
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "completedAt", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
    .init(wireName: "error", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "scheduleId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "startedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
    .init(wireName: "status", typeName: "RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItemU2DStatus_d21b71d44d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "summary", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case completedAt = "completedAt"
    case error = "error"
    case id = "id"
    case scheduleId = "scheduleId"
    case startedAt = "startedAt"
    case status = "status"
    case summary = "summary"
    case threadId = "threadId"
  }
}

public struct RoutescheduleU2DRunsU2DReadResponse_7b9ef525e5: Codable, Sendable, RemoteModelMetadata {
  public var runs: [RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItem_b0c6bfbd3c]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "runs", typeName: "[RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItem_b0c6bfbd3c]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case runs = "runs"
  }
}

public enum RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D1U2DKind_6f5933af03: String, Codable, Sendable {
  case hourly = "hourly"
}

public struct RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D1_a467b0ed1c: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D1U2DKind_6f5933af03
  public var minute: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D1U2DKind_6f5933af03", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "minute", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 59, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case minute = "minute"
  }
}

public enum RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D2U2DKind_475f91db7d: String, Codable, Sendable {
  case weekly = "weekly"
}

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

public struct RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D3_b12a7fe10e: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D3U2DKind_e5ee0a0722
  public var runAt: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D3U2DKind_e5ee0a0722", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case runAt = "runAt"
  }
}

public enum RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_d8fa37f0ae: Codable, Sendable {
  case option1(RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D1_a467b0ed1c)
  case option2(RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D2_056ce41be8)
  case option3(RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D3_b12a7fe10e)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_d8fa37f0ae)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("hourly")]), let value = try? container.decode(RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D1_a467b0ed1c.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("weekly")]), let value = try? container.decode(RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D2_056ce41be8.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("once")]), let value = try? container.decode(RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D3_b12a7fe10e.self) {
      matches.append((3, .option3(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_d8fa37f0ae" : "Ambiguous union RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_d8fa37f0ae matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_d8fa37f0ae.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_aa2e4a946a: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: String
  public var config: RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DConfig_048d1517dd
  public var enabled: Bool
  public var name: String
  public var projectId: RemoteField<String> = .missing
  public var prompt: String
  public var recurrence: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_d8fa37f0ae
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DConfig_048d1517dd", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "enabled", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "projectId", typeName: "String", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 50000, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "recurrence", typeName: "RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_d8fa37f0ae", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public struct RouteschedulesU2DCommandRequestU2DOptionU2D1_8ebc98d914: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteprojectU2DCommandRequestU2DOptionU2D2U2DKind_1f45188862
  public var task: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_aa2e4a946a
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D2U2DKind_1f45188862", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "task", typeName: "RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_aa2e4a946a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case task = "task"
  }
}

public struct RouteschedulesU2DCommandRequestU2DOptionU2D2_2c21c4a962: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public var kind: RouteprojectU2DCommandRequestU2DOptionU2D4U2DKind_cbc64d1458
  public var task: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_aa2e4a946a
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DKind_cbc64d1458", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "task", typeName: "RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_aa2e4a946a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public enum RouteschedulesU2DCommandRequest_c7d4ec01c1: Codable, Sendable {
  case option1(RouteschedulesU2DCommandRequestU2DOptionU2D1_8ebc98d914)
  case option2(RouteschedulesU2DCommandRequestU2DOptionU2D2_2c21c4a962)
  case option3(RouteschedulesU2DCommandRequestU2DOptionU2D3_e7cab2d2c0)
  case option4(RouteschedulesU2DCommandRequestU2DOptionU2D4_09f700fdeb)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteschedulesU2DCommandRequest_c7d4ec01c1)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("create")]), let value = try? container.decode(RouteschedulesU2DCommandRequestU2DOptionU2D1_8ebc98d914.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("update")]), let value = try? container.decode(RouteschedulesU2DCommandRequestU2DOptionU2D2_2c21c4a962.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("delete")]), let value = try? container.decode(RouteschedulesU2DCommandRequestU2DOptionU2D3_e7cab2d2c0.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("run")]), let value = try? container.decode(RouteschedulesU2DCommandRequestU2DOptionU2D4_09f700fdeb.self) {
      matches.append((4, .option4(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RouteschedulesU2DCommandRequest_c7d4ec01c1" : "Ambiguous union RouteschedulesU2DCommandRequest_c7d4ec01c1 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RouteschedulesU2DCommandRequest_c7d4ec01c1.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct RouteschedulesU2DCommandResponseU2DSchedule_936535b2f1: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: String
  public var config: RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DConfig_048d1517dd
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
  public var recurrence: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_d8fa37f0ae
  public var updatedAt: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DConfig_048d1517dd", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "createdAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
    .init(wireName: "enabled", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "lastCompletedAt", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
    .init(wireName: "lastError", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastResult", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastRunAt", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
    .init(wireName: "lastStatus", typeName: "RouteschedulesU2DCommandResponseU2DScheduleU2DLastStatus_aafa839556", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "nextRunAt", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 50000, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "recurrence", typeName: "RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrence_d8fa37f0ae", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "updatedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
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

public struct RouteschedulesU2DCommandResponse_cfff1874b0: Codable, Sendable, RemoteModelMetadata {
  public var schedule: RemoteField<RouteschedulesU2DCommandResponseU2DSchedule_936535b2f1> = .missing
  public var schedules: [RouteschedulesU2DCommandResponseU2DSchedule_936535b2f1]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "schedule", typeName: "RouteschedulesU2DCommandResponseU2DSchedule_936535b2f1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "schedules", typeName: "[RouteschedulesU2DCommandResponseU2DSchedule_936535b2f1]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
