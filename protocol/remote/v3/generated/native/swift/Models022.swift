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

public struct RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132: Codable, Sendable, RemoteModelMetadata {
  public var active: Int64
  public var queued: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "active", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "queued", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case active = "active"
    case queued = "queued"
  }
}

public struct RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironments_2f4c1755c2: Codable, Sendable, RemoteModelMetadata {
  public var posix: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132
  public var windows: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132
  public var wsl: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "posix", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "windows", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wsl", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironmentsU2DPosix_4348fdb132", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case posix = "posix"
    case windows = "windows"
    case wsl = "wsl"
  }
}

public struct RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DLong_164937b9a5: Codable, Sendable, RemoteModelMetadata {
  public var active: Int64
  public var executionMs: RemoteField<Double> = .missing
  public var limit: Int64
  public var maxActive: Int64
  public var maxExecutionMs: RemoteField<Double> = .missing
  public var maxQueueWaitMs: RemoteField<Double> = .missing
  public var queueWaitMs: RemoteField<Double> = .missing
  public var queued: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "active", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "executionMs", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "limit", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxActive", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxExecutionMs", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxQueueWaitMs", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "queueWaitMs", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "queued", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case active = "active"
    case executionMs = "executionMs"
    case limit = "limit"
    case maxActive = "maxActive"
    case maxExecutionMs = "maxExecutionMs"
    case maxQueueWaitMs = "maxQueueWaitMs"
    case queueWaitMs = "queueWaitMs"
    case queued = "queued"
  }
}

public struct RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcesses_f80bf20556: Codable, Sendable, RemoteModelMetadata {
  public var admitted: Int64
  public var cancellations: Int64
  public var environments: RemoteField<RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironments_2f4c1755c2> = .missing
  public var long: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DLong_164937b9a5
  public var queueFullRefusals: Int64
  public var short: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DLong_164937b9a5
  public var slowFetches: RemoteField<Int64> = .missing
  public var waitTimeoutRefusals: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "admitted", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cancellations", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "environments", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironments_2f4c1755c2", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "long", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DLong_164937b9a5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "queueFullRefusals", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "short", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DLong_164937b9a5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "slowFetches", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "waitTimeoutRefusals", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case admitted = "admitted"
    case cancellations = "cancellations"
    case environments = "environments"
    case long = "long"
    case queueFullRefusals = "queueFullRefusals"
    case short = "short"
    case slowFetches = "slowFetches"
    case waitTimeoutRefusals = "waitTimeoutRefusals"
  }
}
