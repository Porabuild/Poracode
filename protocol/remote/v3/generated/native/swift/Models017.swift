// GENERATED FILE. Do not edit by hand.
import Foundation
public enum RoutemcpU2DSettingsU2DCommandRequest_f92ad486ec: Codable, Sendable {
  case option1(RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1_8345d2f810)
  case option2(RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D2_89bc4017c2)
  case option3(RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D3_a087b069da)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutemcpU2DSettingsU2DCommandRequest_f92ad486ec)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("upsert")]), let value = try? container.decode(RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1_8345d2f810.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("remove")]), let value = try? container.decode(RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D2_89bc4017c2.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("move")]), let value = try? container.decode(RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D3_a087b069da.self) {
      matches.append((3, .option3(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutemcpU2DSettingsU2DCommandRequest_f92ad486ec" : "Ambiguous union RoutemcpU2DSettingsU2DCommandRequest_f92ad486ec matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutemcpU2DSettingsU2DCommandRequest_f92ad486ec.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct RoutemcpU2DSettingsU2DCommandResponseU2DServersU2DItem_d66267c393: Codable, Sendable, RemoteModelMetadata {
  public var description: String
  public var disabledTools: RemoteField<[String]> = .missing
  public var enabled: Bool
  public var id: String
  public var name: String
  public var timeoutMs: Int64
  public var transport: ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransport_5296d6b04d
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "description", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabledTools", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "enabled", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^[A-Za-z0-9][A-Za-z0-9_.-]*$", format: nil, semanticValidatorIds: []),
    .init(wireName: "timeoutMs", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "transport", typeName: "ProcedurediscoverExternalMcpServersResultU2DGroupsU2DItemU2DServersU2DItemU2DTransport_5296d6b04d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = ["mcp.reserved-name"]
  private enum CodingKeys: String, CodingKey {
    case description = "description"
    case disabledTools = "disabledTools"
    case enabled = "enabled"
    case id = "id"
    case name = "name"
    case timeoutMs = "timeoutMs"
    case transport = "transport"
  }
}

public struct RoutemcpU2DSettingsU2DCommandResponse_e761211b82: Codable, Sendable, RemoteModelMetadata {
  public var servers: [RoutemcpU2DSettingsU2DCommandResponseU2DServersU2DItem_d66267c393]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "servers", typeName: "[RoutemcpU2DSettingsU2DCommandResponseU2DServersU2DItem_d66267c393]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case servers = "servers"
  }
}

public enum RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D1U2DKind_4d34acc64d: String, Codable, Sendable {
  case probe = "probe"
}

public struct RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D1_20d706a189: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D1U2DKind_4d34acc64d
  public var scope: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951
  public var serverId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D1U2DKind_4d34acc64d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scope", typeName: "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "serverId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case scope = "scope"
    case serverId = "serverId"
  }
}

public enum RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D2U2DKind_274e069cdc: String, Codable, Sendable {
  case oauthU2DStatus = "oauth-status"
}

public struct RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D2_37eeca9f53: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D2U2DKind_274e069cdc
  public var scope: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D2U2DKind_274e069cdc", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scope", typeName: "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case scope = "scope"
  }
}

public enum RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D3U2DKind_3d1908a6bc: String, Codable, Sendable {
  case oauthU2DBegin = "oauth-begin"
}

public struct RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D3_6602194087: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D3U2DKind_3d1908a6bc
  public var scope: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951
  public var serverId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D3U2DKind_3d1908a6bc", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scope", typeName: "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "serverId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case scope = "scope"
    case serverId = "serverId"
  }
}

public enum RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4U2DKind_04569d9eea: String, Codable, Sendable {
  case oauthU2DWait = "oauth-wait"
}

public struct RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4_7a00457b3e: Codable, Sendable, RemoteModelMetadata {
  public var flowId: String
  public var kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4U2DKind_04569d9eea
  public var scope: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "flowId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4U2DKind_04569d9eea", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scope", typeName: "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case flowId = "flowId"
    case kind = "kind"
    case scope = "scope"
  }
}

public enum RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5U2DKind_61fc4b3eae: String, Codable, Sendable {
  case oauthU2DClear = "oauth-clear"
}

public struct RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5_81440643a0: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5U2DKind_61fc4b3eae
  public var scope: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951
  public var serverId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5U2DKind_61fc4b3eae", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scope", typeName: "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "serverId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case scope = "scope"
    case serverId = "serverId"
  }
}

public enum RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb: Codable, Sendable {
  case option1(RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D1_20d706a189)
  case option2(RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D2_37eeca9f53)
  case option3(RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D3_6602194087)
  case option4(RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4_7a00457b3e)
  case option5(RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5_81440643a0)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("probe")]), let value = try? container.decode(RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D1_20d706a189.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("oauth-status")]), let value = try? container.decode(RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D2_37eeca9f53.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("oauth-begin")]), let value = try? container.decode(RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D3_6602194087.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("oauth-wait")]), let value = try? container.decode(RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4_7a00457b3e.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("oauth-clear")]), let value = try? container.decode(RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5_81440643a0.self) {
      matches.append((5, .option5(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb" : "Ambiguous union RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutemcpU2DSettingsU2DOperationRequest_e8fbf0f2cb.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D1_bb3cd72cf9: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D1U2DKind_4d34acc64d
  public var result: ProcedureprobeMcpServerResult_bea1bdef18
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D1U2DKind_4d34acc64d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "result", typeName: "ProcedureprobeMcpServerResult_bea1bdef18", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case result = "result"
  }
}

public struct RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D2_560a7abcaf: Codable, Sendable, RemoteModelMetadata {
  public var authenticatedServerIds: [String]
  public var kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D2U2DKind_274e069cdc
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "authenticatedServerIds", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D2U2DKind_274e069cdc", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case authenticatedServerIds = "authenticatedServerIds"
    case kind = "kind"
  }
}

public struct RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D3_2798cb9d2d: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D3U2DKind_3d1908a6bc
  public var result: ProcedurebeginMcpServerOauthResult_6a2d40d38c
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D3U2DKind_3d1908a6bc", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "result", typeName: "ProcedurebeginMcpServerOauthResult_6a2d40d38c", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case result = "result"
  }
}

public struct RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D4_f2e3da83f3: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4U2DKind_04569d9eea
  public var result: ProcedurewaitMcpServerOauthResult_51cc694dc5
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D4U2DKind_04569d9eea", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "result", typeName: "ProcedurewaitMcpServerOauthResult_51cc694dc5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case result = "result"
  }
}

public struct RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D5_3ac3526f6a: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5U2DKind_61fc4b3eae
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutemcpU2DSettingsU2DOperationRequestU2DOptionU2D5U2DKind_61fc4b3eae", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
  }
}

public enum RoutemcpU2DSettingsU2DOperationResponse_20b48750f1: Codable, Sendable {
  case option1(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D1_bb3cd72cf9)
  case option2(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D2_560a7abcaf)
  case option3(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D3_2798cb9d2d)
  case option4(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D4_f2e3da83f3)
  case option5(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D5_3ac3526f6a)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutemcpU2DSettingsU2DOperationResponse_20b48750f1)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("probe")]), let value = try? container.decode(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D1_bb3cd72cf9.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("oauth-status")]), let value = try? container.decode(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D2_560a7abcaf.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("oauth-begin")]), let value = try? container.decode(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D3_2798cb9d2d.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("oauth-wait")]), let value = try? container.decode(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D4_f2e3da83f3.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("oauth-clear")]), let value = try? container.decode(RoutemcpU2DSettingsU2DOperationResponseU2DOptionU2D5_3ac3526f6a.self) {
      matches.append((5, .option5(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutemcpU2DSettingsU2DOperationResponse_20b48750f1" : "Ambiguous union RoutemcpU2DSettingsU2DOperationResponse_20b48750f1 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutemcpU2DSettingsU2DOperationResponse_20b48750f1.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct RouteportU2DEnterRequest_4067ad04bf: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
  }
}

public struct RouteportU2DEnterResponse_72ce7899de: Codable, Sendable, RemoteModelMetadata {
  public var enterPath: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "enterPath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case enterPath = "enterPath"
  }
}

public struct RouteportU2DForwardRequest_a26f77dd4a: Codable, Sendable, RemoteModelMetadata {
  public var targetPort: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "targetPort", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 65535, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case targetPort = "targetPort"
  }
}

public struct RouteportU2DForwardResponseU2DForward_247ec4acb4: Codable, Sendable, RemoteModelMetadata {
  public var createdAt: Int64
  public var id: String
  public var listenPort: Int64
  public var targetPort: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "createdAt", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "listenPort", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 65535, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "targetPort", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 65535, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case createdAt = "createdAt"
    case id = "id"
    case listenPort = "listenPort"
    case targetPort = "targetPort"
  }
}

public struct RouteportU2DForwardResponse_3d1d59fe1c: Codable, Sendable, RemoteModelMetadata {
  public var enterPath: RemoteField<String> = .missing
  public var forward: RouteportU2DForwardResponseU2DForward_247ec4acb4
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "enterPath", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "forward", typeName: "RouteportU2DForwardResponseU2DForward_247ec4acb4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case enterPath = "enterPath"
    case forward = "forward"
  }
}

public typealias RouteportU2DUnforwardResponseU2DOk_d2dd3595e1 = Bool

public struct RouteportU2DUnforwardResponse_badd682f35: Codable, Sendable, RemoteModelMetadata {
  public var ok: RouteportU2DUnforwardResponseU2DOk_d2dd3595e1
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "ok", typeName: "RouteportU2DUnforwardResponseU2DOk_d2dd3595e1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case ok = "ok"
  }
}

public enum RouteportsU2DReadResponseU2DDetectedU2DItemU2DProtocol_cb34d50832: String, Codable, Sendable {
  case http = "http"
  case unknown = "unknown"
}

public struct RouteportsU2DReadResponseU2DDetectedU2DItem_40aab29508: Codable, Sendable, RemoteModelMetadata {
  public var label: RemoteField<String> = .missing
  public var port: Int64
  public var protocolValue: RouteportsU2DReadResponseU2DDetectedU2DItemU2DProtocol_cb34d50832
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "label", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "port", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 65535, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "protocol", typeName: "RouteportsU2DReadResponseU2DDetectedU2DItemU2DProtocol_cb34d50832", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case label = "label"
    case port = "port"
    case protocolValue = "protocol"
  }
}
