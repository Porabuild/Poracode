// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1_4093b2937e: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862
  public var payload: RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1U2DPayload_7d60d2630c
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "payload", typeName: "RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1U2DPayload_7d60d2630c", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case payload = "payload"
  }
}

public enum RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D2U2DKind_cbc64d1458: String, Codable, Sendable {
  case `update` = "update"
}

public struct RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D2_bc854d61f3: Codable, Sendable, RemoteModelMetadata {
  public var config: RemoteField<RemoteJSONValue> = .missing
  public var displayName: RemoteField<String> = .missing
  public var enabled: RemoteField<Bool> = .missing
  public var instanceId: String
  public var kind: RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D2U2DKind_cbc64d1458
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "config", typeName: "RemoteJSONValue", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "displayName", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "enabled", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "instanceId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: "^[a-z0-9][a-z0-9_\\-:.]*$", format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D2U2DKind_cbc64d1458", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case config = "config"
    case displayName = "displayName"
    case enabled = "enabled"
    case instanceId = "instanceId"
    case kind = "kind"
  }
}

public enum RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D3U2DKind_0082f8bcef: String, Codable, Sendable {
  case `setU2DEnvironment` = "set-environment"
}

public struct RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D3_145d8a7cba: Codable, Sendable, RemoteModelMetadata {
  public var environment: RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1U2DPayloadU2DEnvironment_75c2889f6a
  public var instanceId: String
  public var kind: RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D3U2DKind_0082f8bcef
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "environment", typeName: "RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1U2DPayloadU2DEnvironment_75c2889f6a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "instanceId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: "^[a-z0-9][a-z0-9_\\-:.]*$", format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D3U2DKind_0082f8bcef", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case environment = "environment"
    case instanceId = "instanceId"
    case kind = "kind"
  }
}

public struct RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D4_7bae770a0e: Codable, Sendable, RemoteModelMetadata {
  public var instanceId: String
  public var kind: ProceduremanageModelProvidersRequestU2DOptionU2D3U2DAction_034741cb26
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "instanceId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: "^[a-z0-9][a-z0-9_\\-:.]*$", format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "ProceduremanageModelProvidersRequestU2DOptionU2D3U2DAction_034741cb26", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case instanceId = "instanceId"
    case kind = "kind"
  }
}

public enum RouteagentU2DProfilesU2DCommandRequest_35421c706b: Codable, Sendable {
  case option1(RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1_4093b2937e)
  case option2(RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D2_bc854d61f3)
  case option3(RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D3_145d8a7cba)
  case option4(RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D4_7bae770a0e)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteagentU2DProfilesU2DCommandRequest_35421c706b)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("create")]), let value = try? container.decode(RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D1_4093b2937e.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("update")]), let value = try? container.decode(RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D2_bc854d61f3.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("set-environment")]), let value = try? container.decode(RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D3_145d8a7cba.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("remove")]), let value = try? container.decode(RouteagentU2DProfilesU2DCommandRequestU2DOptionU2D4_7bae770a0e.self) {
      matches.append((4, .option4(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RouteagentU2DProfilesU2DCommandRequest_35421c706b" : "Ambiguous union RouteagentU2DProfilesU2DCommandRequest_35421c706b matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RouteagentU2DProfilesU2DCommandRequest_35421c706b.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
