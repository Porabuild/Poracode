// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouterequestU2DResolveRequest_3df8195e90: Codable, Sendable, RemoteModelMetadata {
  public var method: String
  public var requestId: RouterequestU2DResolveRequestU2DRequestId_a44865d83b
  public var response: RemoteJSONValue
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "method", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "requestId", typeName: "RouterequestU2DResolveRequestU2DRequestId_a44865d83b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "response", typeName: "RemoteJSONValue", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case method = "method"
    case requestId = "requestId"
    case response = "response"
  }
}

public struct RouteruntimeU2DImagePath_815909fa96: Codable, Sendable, RemoteModelMetadata {
  public var itemId: String
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "itemId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case itemId = "itemId"
    case threadId = "threadId"
  }
}

public enum RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce: Codable, Sendable {
  case option1(ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b)
  case option2(Int64)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce)] = []
    if RemoteUnionProbe.matchesString(decoder), let value = try? container.decode(ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b.self) {
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

public struct RouteruntimeU2DImageQuery_1de2de5621: Codable, Sendable, RemoteModelMetadata {
  public var path: [RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce]
  public var ticket: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "path", typeName: "[RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 1, maxItems: 8, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ticket", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case path = "path"
    case ticket = "ticket"
  }
}

public enum RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1U2DKind_ffc64b31e0: String, Codable, Sendable {
  case `updateU2DState` = "update-state"
}

public struct RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1U2DPayload_626f8596f7: Codable, Sendable, RemoteModelMetadata {
  public var archived: RemoteField<Bool> = .missing
  public var id: String
  public var unread: RemoteField<Bool> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "archived", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "unread", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = ["schedule.run-state"]
  private enum CodingKeys: String, CodingKey {
    case archived = "archived"
    case id = "id"
    case unread = "unread"
  }
}

public struct RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1_e510e581c4: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1U2DKind_ffc64b31e0
  public var payload: RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1U2DPayload_626f8596f7
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1U2DKind_ffc64b31e0", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "payload", typeName: "RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1U2DPayload_626f8596f7", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["schedule.run-state"]),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case payload = "payload"
  }
}

public enum RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D2U2DKind_482c928271: String, Codable, Sendable {
  case `cancel` = "cancel"
}

public struct RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D2_77c71c7315: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public var kind: RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D2U2DKind_482c928271
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D2U2DKind_482c928271", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case kind = "kind"
  }
}

public enum RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3: Codable, Sendable {
  case option1(RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1_e510e581c4)
  case option2(RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D2_77c71c7315)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("update-state")]), let value = try? container.decode(RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D1_e510e581c4.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("cancel")]), let value = try? container.decode(RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D2_77c71c7315.self) {
      matches.append((2, .option2(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3" : "Ambiguous union RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutescheduleU2DRunU2DCommandRequest_c4921dbeb3.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
    }
    self = matches[0].1
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    }
  }
}

public typealias RoutescheduleU2DRunU2DCommandResponseU2DRun_b6411354a3 = RouteautomationsU2DSnapshotResponseU2DRunsU2DItem_38754692c8?

public struct RoutescheduleU2DRunU2DCommandResponse_6f4c2b2449: Codable, Sendable, RemoteModelMetadata {
  public var cancelled: RemoteField<Bool> = .missing
  public var run: RemoteField<RouteautomationsU2DSnapshotResponseU2DRunsU2DItem_38754692c8> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cancelled", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "run", typeName: "RouteautomationsU2DSnapshotResponseU2DRunsU2DItem_38754692c8", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case cancelled = "cancelled"
    case run = "run"
  }
}

public struct RoutescheduleU2DRunU2DInboxResponse_d9b927ff80: Codable, Sendable, RemoteModelMetadata {
  public var runs: [RouteautomationsU2DSnapshotResponseU2DRunsU2DItem_38754692c8]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "runs", typeName: "[RouteautomationsU2DSnapshotResponseU2DRunsU2DItem_38754692c8]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case runs = "runs"
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

public struct RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_7ab420c1b7: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: String
  public var automation: RemoteField<RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshot_fdddba9ec6> = .missing
  public var config: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DConfig_f69100925f
  public var enabled: Bool
  public var name: String
  public var projectId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var prompt: String
  public var recurrence: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "automation", typeName: "RouteautomationsU2DSnapshotResponseU2DRunsU2DItemU2DAutomationSnapshot_fdddba9ec6", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["schedule.automation"]),
    .init(wireName: "config", typeName: "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DConfig_f69100925f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "enabled", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "projectId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 50000, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "recurrence", typeName: "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DRecurrence_12f751ee47", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentKind = "agentKind"
    case automation = "automation"
    case config = "config"
    case enabled = "enabled"
    case name = "name"
    case projectId = "projectId"
    case prompt = "prompt"
    case recurrence = "recurrence"
  }
}

public struct RouteschedulesU2DCommandRequestU2DOptionU2D1_7ac92dcb74: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteexperimentU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862
  public var task: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_7ab420c1b7
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteexperimentU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "task", typeName: "RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_7ab420c1b7", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case task = "task"
  }
}

public struct RouteschedulesU2DCommandRequestU2DOptionU2D2_455b16a806: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public var kind: RouteprojectU2DCommandRequestU2DOptionU2D4U2DKind_cbc64d1458
  public var task: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_7ab420c1b7
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DKind_cbc64d1458", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "task", typeName: "RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTask_7ab420c1b7", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case kind = "kind"
    case task = "task"
  }
}

public enum RouteschedulesU2DCommandRequestU2DOptionU2D3U2DKind_4d5989d27d: String, Codable, Sendable {
  case `delete` = "delete"
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
  case `run` = "run"
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

public enum RouteschedulesU2DCommandRequest_8be22931a5: Codable, Sendable {
  case option1(RouteschedulesU2DCommandRequestU2DOptionU2D1_7ac92dcb74)
  case option2(RouteschedulesU2DCommandRequestU2DOptionU2D2_455b16a806)
  case option3(RouteschedulesU2DCommandRequestU2DOptionU2D3_e7cab2d2c0)
  case option4(RouteschedulesU2DCommandRequestU2DOptionU2D4_09f700fdeb)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteschedulesU2DCommandRequest_8be22931a5)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("create")]), let value = try? container.decode(RouteschedulesU2DCommandRequestU2DOptionU2D1_7ac92dcb74.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("update")]), let value = try? container.decode(RouteschedulesU2DCommandRequestU2DOptionU2D2_455b16a806.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("delete")]), let value = try? container.decode(RouteschedulesU2DCommandRequestU2DOptionU2D3_e7cab2d2c0.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("run")]), let value = try? container.decode(RouteschedulesU2DCommandRequestU2DOptionU2D4_09f700fdeb.self) {
      matches.append((4, .option4(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RouteschedulesU2DCommandRequest_8be22931a5" : "Ambiguous union RouteschedulesU2DCommandRequest_8be22931a5 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RouteschedulesU2DCommandRequest_8be22931a5.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct RouteschedulesU2DCommandResponse_bc1920595e: Codable, Sendable, RemoteModelMetadata {
  public var schedule: RemoteField<RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItem_14f6b52f84> = .missing
  public var schedules: [RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItem_14f6b52f84]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "schedule", typeName: "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItem_14f6b52f84", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "schedules", typeName: "[RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItem_14f6b52f84]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case schedule = "schedule"
    case schedules = "schedules"
  }
}

public typealias RoutesettingsU2DReadResponseU2DSettingsU2DAgentSettings_deb61378c1 = [String: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaults_cff1242509]

public typealias RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServers_65899fb957 = [String: Bool]

public typealias RoutesettingsU2DReadResponseU2DSettingsU2DEnabledMcpServers_2d677fb041 = [String: Bool]

public enum RoutesettingsU2DReadResponseU2DSettingsU2DFollowUpBehavior_6fcb1a55c0: String, Codable, Sendable {
  case `steer` = "steer"
  case `queue` = "queue"
}

public typealias RoutesettingsU2DReadResponseU2DSettingsU2DHiddenModels_86d5d72e84 = [String: [ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]]

public enum RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8: String, Codable, Sendable {
  case `off` = "off"
  case `fix` = "fix"
  case `merge` = "merge"
}

public enum RoutesettingsU2DReadResponseU2DSettingsU2DPrMergeMethod_9c01de6b08: String, Codable, Sendable {
  case `merge` = "merge"
  case `squash` = "squash"
  case `rebase` = "rebase"
}

public typealias RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22 = [String: Int64]

public struct RoutesettingsU2DReadResponseU2DSettingsU2DUsage_18dc352c9a: Codable, Sendable, RemoteModelMetadata {
  public var autoRefresh: Bool
  public var collapsedProviders: [ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]
  public var disabledProviders: [ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]
  public var providerOrder: [ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]
  public var providerRefreshIntervals: RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22
  public var refreshIntervalMinutes: Int64
  public var selectedRingGroups: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986
  public var showEstimatedCost: Bool
  public var showInSidebar: Bool
  public var sidebarHiddenProviders: [ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "autoRefresh", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "collapsedProviders", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabledProviders", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerOrder", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerRefreshIntervals", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refreshIntervalMinutes", typeName: "Int64", required: true, nullable: false, minimum: 2, maximum: 120, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "selectedRingGroups", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "showEstimatedCost", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "showInSidebar", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sidebarHiddenProviders", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
