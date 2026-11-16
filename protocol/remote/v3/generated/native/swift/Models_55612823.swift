// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1_8345d2f810: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DKind_375b3978f6
  public var scope: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951
  public var server: ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DKind_375b3978f6", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scope", typeName: "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "server", typeName: "ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["mcp.reserved-name"]),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case scope = "scope"
    case server = "server"
  }
}

public struct RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D2_89bc4017c2: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteexperimentU2DCommandRequestU2DOptionU2D3U2DKind_034741cb26
  public var scope: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951
  public var serverId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteexperimentU2DCommandRequestU2DOptionU2D3U2DKind_034741cb26", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public enum RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D3U2DKind_a77c854589: String, Codable, Sendable {
  case `move` = "move"
}

public struct RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D3_a087b069da: Codable, Sendable, RemoteModelMetadata {
  public var destination: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951
  public var kind: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D3U2DKind_a77c854589
  public var serverId: String
  public var source: RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "destination", typeName: "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D3U2DKind_a77c854589", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "serverId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "source", typeName: "RoutemcpU2DSettingsU2DCommandRequestU2DOptionU2D1U2DScope_dc99757951", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case destination = "destination"
    case kind = "kind"
    case serverId = "serverId"
    case source = "source"
  }
}

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
