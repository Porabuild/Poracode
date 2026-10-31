// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RoutetokenU2DExchangeRequest_39bc2baf33: Codable, Sendable, RemoteModelMetadata {
  public var client: RemoteField<RoutetokenU2DExchangeRequestU2DClient_6969170275> = .missing
  public var credential: RemoteField<String> = .missing
  public var grantType: RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22
  public var refreshToken: RemoteField<String> = .missing
  public var scopes: RemoteField<[RoutetokenU2DExchangeRequestU2DScopesU2DItem_8f483f0889]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "client", typeName: "RoutetokenU2DExchangeRequestU2DClient_6969170275", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "credential", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "grantType", typeName: "RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refreshToken", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scopes", typeName: "[RoutetokenU2DExchangeRequestU2DScopesU2DItem_8f483f0889]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case client = "client"
    case credential = "credential"
    case grantType = "grantType"
    case refreshToken = "refreshToken"
    case scopes = "scopes"
  }
}

public enum RoutetokenU2DExchangeResponseU2DTokenType_7c8fd050dd: String, Codable, Sendable {
  case `bearer` = "Bearer"
}

public struct RoutetokenU2DExchangeResponse_22f14841c0: Codable, Sendable, RemoteModelMetadata {
  public var accessToken: String
  public var expiresAt: String
  public var refreshToken: RemoteField<String> = .missing
  public var refreshTokenExpiresAt: RemoteField<String> = .missing
  public var scopes: [String]
  public var sessionId: RemoteField<String> = .missing
  public var tokenType: RoutetokenU2DExchangeResponseU2DTokenType_7c8fd050dd
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "accessToken", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "expiresAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refreshToken", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refreshTokenExpiresAt", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scopes", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sessionId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tokenType", typeName: "RoutetokenU2DExchangeResponseU2DTokenType_7c8fd050dd", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case accessToken = "accessToken"
    case expiresAt = "expiresAt"
    case refreshToken = "refreshToken"
    case refreshTokenExpiresAt = "refreshTokenExpiresAt"
    case scopes = "scopes"
    case sessionId = "sessionId"
    case tokenType = "tokenType"
  }
}

public enum WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d: String, Codable, Sendable {
  case `target` = "target"
}

public struct WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e: Codable, Sendable, RemoteModelMetadata {
  public var branch: RemoteField<String> = .missing
  public var includePrDetails: RemoteField<Bool> = .missing
  public var kind: WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d
  public var projectId: String
  public var worktreePath: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "branch", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "includePrDetails", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D1U2DKind_fc779c522d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreePath", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case branch = "branch"
    case includePrDetails = "includePrDetails"
    case kind = "kind"
    case projectId = "projectId"
    case worktreePath = "worktreePath"
  }
}

public enum WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D2U2DKind_c975fc7daa: String, Codable, Sendable {
  case `pullU2DRequest` = "pull-request"
}

public struct WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D2_d95fd60152: Codable, Sendable, RemoteModelMetadata {
  public var branch: RemoteField<String> = .missing
  public var includeReviewBundle: RemoteField<Bool> = .missing
  public var kind: WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D2U2DKind_c975fc7daa
  public var prNumber: Int64
  public var projectId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "branch", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "includeReviewBundle", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D2U2DKind_c975fc7daa", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prNumber", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case branch = "branch"
    case includeReviewBundle = "includeReviewBundle"
    case kind = "kind"
    case prNumber = "prNumber"
    case projectId = "projectId"
  }
}

public enum WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D3U2DKind_6b98eaede5: String, Codable, Sendable {
  case `projectU2DPullU2DRequests` = "project-pull-requests"
}

public struct WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D3_591e7e71be: Codable, Sendable, RemoteModelMetadata {
  public var kind: WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D3U2DKind_6b98eaede5
  public var projectId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D3U2DKind_6b98eaede5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case projectId = "projectId"
  }
}

public enum WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3: Codable, Sendable {
  case option1(WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e)
  case option2(WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D2_d95fd60152)
  case option3(WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D3_591e7e71be)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("target")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D1_e2d96ee09e.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("pull-request")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D2_d95fd60152.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("project-pull-requests")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItemU2DOptionU2D3_591e7e71be.self) {
      matches.append((3, .option3(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3" : "Ambiguous union WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public enum WebSocketClientMessageU2DOptionU2D10U2DType_9f1edfda19: String, Codable, Sendable {
  case `gitU2DStateU2DInterests` = "git-state-interests"
}

public struct WebSocketClientMessageU2DOptionU2D10_d2299af726: Codable, Sendable, RemoteModelMetadata {
  public var interests: [WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3]
  public var typeValue: WebSocketClientMessageU2DOptionU2D10U2DType_9f1edfda19
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "interests", typeName: "[WebSocketClientMessageU2DOptionU2D10U2DInterestsU2DItem_ad1d9fe8b3]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 500, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D10U2DType_9f1edfda19", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case interests = "interests"
    case typeValue = "type"
  }
}

public enum WebSocketClientMessageU2DOptionU2D11U2DType_25e47114d3: String, Codable, Sendable {
  case `threadU2DItemU2DInterests` = "thread-item-interests"
}

public struct WebSocketClientMessageU2DOptionU2D11_93bef3a552: Codable, Sendable, RemoteModelMetadata {
  public var threadIds: [String]
  public var typeValue: WebSocketClientMessageU2DOptionU2D11U2DType_25e47114d3
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "threadIds", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 200, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D11U2DType_25e47114d3", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case threadIds = "threadIds"
    case typeValue = "type"
  }
}

public enum WebSocketClientMessageU2DOptionU2D1U2DType_9f6b436502: String, Codable, Sendable {
  case `agentU2DVisionU2DWatch` = "agent-vision-watch"
}

public struct WebSocketClientMessageU2DOptionU2D1_9eaa25e68d: Codable, Sendable, RemoteModelMetadata {
  public var threadId: String
  public var typeValue: WebSocketClientMessageU2DOptionU2D1U2DType_9f6b436502
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72
  public var watchId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 256, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D1U2DType_9f6b436502", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "watchId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case threadId = "threadId"
    case typeValue = "type"
    case version = "version"
    case watchId = "watchId"
  }
}

public enum WebSocketClientMessageU2DOptionU2D2U2DType_f802abb4a3: String, Codable, Sendable {
  case `agentU2DVisionU2DUnwatch` = "agent-vision-unwatch"
}

public struct WebSocketClientMessageU2DOptionU2D2_107db71e16: Codable, Sendable, RemoteModelMetadata {
  public var typeValue: WebSocketClientMessageU2DOptionU2D2U2DType_f802abb4a3
  public var watchId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D2U2DType_f802abb4a3", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "watchId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case typeValue = "type"
    case watchId = "watchId"
  }
}

public enum WebSocketClientMessageU2DOptionU2D3U2DType_fe79d48b8a: String, Codable, Sendable {
  case `ping` = "ping"
}

public struct WebSocketClientMessageU2DOptionU2D3_1709690cf0: Codable, Sendable, RemoteModelMetadata {
  public var id: RemoteField<String> = .missing
  public var sentAt: RemoteField<Double> = .missing
  public var typeValue: WebSocketClientMessageU2DOptionU2D3U2DType_fe79d48b8a
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sentAt", typeName: "Double", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D3U2DType_fe79d48b8a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case sentAt = "sentAt"
    case typeValue = "type"
  }
}

public enum WebSocketClientMessageU2DOptionU2D4U2DType_3f5bcd72f9: String, Codable, Sendable {
  case `browserU2DWatch` = "browser-watch"
}

public struct WebSocketClientMessageU2DOptionU2D4_2b7b34c95b: Codable, Sendable, RemoteModelMetadata {
  public var typeValue: WebSocketClientMessageU2DOptionU2D4U2DType_3f5bcd72f9
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D4U2DType_3f5bcd72f9", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case typeValue = "type"
  }
}

public enum WebSocketClientMessageU2DOptionU2D5U2DType_225e53f995: String, Codable, Sendable {
  case `browserU2DUnwatch` = "browser-unwatch"
}

public struct WebSocketClientMessageU2DOptionU2D5_0e8f58f429: Codable, Sendable, RemoteModelMetadata {
  public var typeValue: WebSocketClientMessageU2DOptionU2D5U2DType_225e53f995
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D5U2DType_225e53f995", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case typeValue = "type"
  }
}

public struct WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D1_75aa7b0623: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutedeviceU2DActionRequestU2DOptionU2D1U2DKind_ef917452dc
  public var x: Double
  public var y: Double
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D1U2DKind_ef917452dc", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "x", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "y", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case x = "x"
    case y = "y"
  }
}

public enum WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D2U2DKind_00ebeb8fef: String, Codable, Sendable {
  case `scroll` = "scroll"
}

public struct WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D2_41ffeb2050: Codable, Sendable, RemoteModelMetadata {
  public var deltaX: Double
  public var deltaY: Double
  public var kind: WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D2U2DKind_00ebeb8fef
  public var x: Double
  public var y: Double
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "deltaX", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "deltaY", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D2U2DKind_00ebeb8fef", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "x", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "y", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case deltaX = "deltaX"
    case deltaY = "deltaY"
    case kind = "kind"
    case x = "x"
    case y = "y"
  }
}

public enum WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D3U2DKind_19030914d1: String, Codable, Sendable {
  case `insertU2DText` = "insert-text"
}

public struct WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D3_8906d017ba: Codable, Sendable, RemoteModelMetadata {
  public var kind: WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D3U2DKind_19030914d1
  public var text: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D3U2DKind_19030914d1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "text", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 1024, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case text = "text"
  }
}

public enum WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D4U2DKey_7df0b39f18: String, Codable, Sendable {
  case `enter` = "enter"
  case `backspace` = "backspace"
  case `tab` = "tab"
  case `escape` = "escape"
  case `arrowU2DUp` = "arrow-up"
  case `arrowU2DDown` = "arrow-down"
  case `arrowU2DLeft` = "arrow-left"
  case `arrowU2DRight` = "arrow-right"
}

public struct WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D4_9e169df36e: Codable, Sendable, RemoteModelMetadata {
  public var key: WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D4U2DKey_7df0b39f18
  public var kind: RoutedeviceU2DActionRequestU2DOptionU2D4U2DKind_14221269d8
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "key", typeName: "WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D4U2DKey_7df0b39f18", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D4U2DKind_14221269d8", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case key = "key"
    case kind = "kind"
  }
}

public enum WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c: Codable, Sendable {
  case option1(WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D1_75aa7b0623)
  case option2(WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D2_41ffeb2050)
  case option3(WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D3_8906d017ba)
  case option4(WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D4_9e169df36e)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("tap")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D1_75aa7b0623.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("scroll")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D2_41ffeb2050.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("insert-text")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D3_8906d017ba.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("key")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D6U2DInputU2DOptionU2D4_9e169df36e.self) {
      matches.append((4, .option4(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c" : "Ambiguous union WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public enum WebSocketClientMessageU2DOptionU2D6U2DType_64570e2249: String, Codable, Sendable {
  case `browserU2DInput` = "browser-input"
}

public struct WebSocketClientMessageU2DOptionU2D6_d550ef9994: Codable, Sendable, RemoteModelMetadata {
  public var input: WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c
  public var typeValue: WebSocketClientMessageU2DOptionU2D6U2DType_64570e2249
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "input", typeName: "WebSocketClientMessageU2DOptionU2D6U2DInput_2c0b30d69c", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D6U2DType_64570e2249", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case input = "input"
    case typeValue = "type"
  }
}
