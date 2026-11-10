// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RoutepushU2DUnregisterRequest_8f934fd77b: Codable, Sendable, RemoteModelMetadata {
  public var deviceId: String
  public var routing: RemoteField<RoutepushU2DRegisterRequestU2DRouting_a90fffdae1> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "deviceId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "routing", typeName: "RoutepushU2DRegisterRequestU2DRouting_a90fffdae1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case deviceId = "deviceId"
    case routing = "routing"
  }
}

public enum RouterequestU2DResolveRequestU2DRequestId_a44865d83b: Codable, Sendable {
  case option1(String)
  case option2(Double)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouterequestU2DResolveRequestU2DRequestId_a44865d83b)] = []
    if RemoteUnionProbe.matchesString(decoder, minLength: 1), let value = try? container.decode(String.self) {
      self = .option1(value); return
    }
    if RemoteUnionProbe.matchesNumber(decoder, integer: false), let value = try? container.decode(Double.self) {
      self = .option2(value); return
    }
    throw DecodingError.typeMismatch(RouterequestU2DResolveRequestU2DRequestId_a44865d83b.self, .init(codingPath: decoder.codingPath, debugDescription: "No union option matched RouterequestU2DResolveRequestU2DRequestId_a44865d83b"))
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    }
  }
}

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

public struct RouteruntimeU2DImageQuery_864ab6444b: Codable, Sendable, RemoteModelMetadata {
  public var path: [RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce]
  public var ticket: RemoteField<String> = .missing
  public var variant: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "path", typeName: "[RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 1, maxItems: 8, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ticket", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "variant", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case path = "path"
    case ticket = "ticket"
    case variant = "variant"
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

public struct RoutescheduleU2DRunU2DCommandRequestU2DOptionU2D2_77c71c7315: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public var kind: ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D5U2DType_482c928271
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D5U2DType_482c928271", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
