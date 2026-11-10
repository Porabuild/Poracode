// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RoutethreadU2DSteerU2DSetRequest_04879beede: Codable, Sendable, RemoteModelMetadata {
  public var clientContext: RemoteField<ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f> = .missing
  public var config: ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba
  public var prompt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var segments: RemoteField<[ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "clientContext", typeName: "ProcedureensureThreadRunningRequestU2DClientContext_b23ca9582f", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "ProcedureconnectThreadVoiceRequestU2DConfig_281d24bbba", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "segments", typeName: "[ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case clientContext = "clientContext"
    case config = "config"
    case prompt = "prompt"
    case segments = "segments"
  }
}

public struct RoutethreadU2DTurnsQuery_cab926bfae: Codable, Sendable, RemoteModelMetadata {
  public var completedTurnsLimit: RemoteField<Int64> = .missing
  public var cursor: RemoteField<String> = .missing
  public var limit: RemoteField<Int64> = .missing
  public var maxBytes: RemoteField<Int64> = .missing
  public var maxDecodeBytes: RemoteField<Int64> = .missing
  public var notices: RemoteField<RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63> = .missing
  public var reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "completedTurnsLimit", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 500, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cursor", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "limit", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 500, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxBytes", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxDecodeBytes", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "notices", typeName: "RoutethreadU2DHistoryU2DChangesQueryU2DNotices_f67f6cbe63", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reads", typeName: "RouteprojectU2DListQueryU2DReads_4659e6d395", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case completedTurnsLimit = "completedTurnsLimit"
    case cursor = "cursor"
    case limit = "limit"
    case maxBytes = "maxBytes"
    case maxDecodeBytes = "maxDecodeBytes"
    case notices = "notices"
    case reads = "reads"
  }
}

public struct RoutethreadU2DTurnsResponse_1f8c0bbd10: Codable, Sendable, RemoteModelMetadata {
  public var completedTurnsNextCursor: RemoteField<String>
  public var reads: RouteprojectU2DListQueryU2DReads_4659e6d395
  public var turns: [RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "completedTurnsNextCursor", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reads", typeName: "RouteprojectU2DListQueryU2DReads_4659e6d395", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "turns", typeName: "[RoutethreadU2DHistoryU2DChangesResponseU2DOptionU2D1U2DSnapshotU2DCompletedTurnsU2DItem_df96bd315b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case completedTurnsNextCursor = "completedTurnsNextCursor"
    case reads = "reads"
    case turns = "turns"
  }
}

public enum RoutetokenU2DExchangeRequestU2DClientU2DDeviceType_28ab534145: String, Codable, Sendable {
  case `desktop` = "desktop"
  case `mobile` = "mobile"
  case `tablet` = "tablet"
  case `browser` = "browser"
  case `unknown` = "unknown"
}

public struct RoutetokenU2DExchangeRequestU2DClient_6969170275: Codable, Sendable, RemoteModelMetadata {
  public var deviceType: RemoteField<RoutetokenU2DExchangeRequestU2DClientU2DDeviceType_28ab534145> = .missing
  public var label: RemoteField<String> = .missing
  public var os: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "deviceType", typeName: "RoutetokenU2DExchangeRequestU2DClientU2DDeviceType_28ab534145", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "os", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case deviceType = "deviceType"
    case label = "label"
    case os = "os"
  }
}

public enum RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D1_962b214fbc: String, Codable, Sendable {
  case `pairingU2DToken` = "pairing-token"
}

public enum RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D2_0463d43632: String, Codable, Sendable {
  case `refreshU5FToken` = "refresh_token"
}

public enum RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22: Codable, Sendable {
  case option1(RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D1_962b214fbc)
  case option2(RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D2_0463d43632)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22)] = []
    if RemoteUnionProbe.matchesString(decoder, literals: [.string("pairing-token")]), let value = try? container.decode(RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D1_962b214fbc.self) {
      self = .option1(value); return
    }
    if RemoteUnionProbe.matchesString(decoder, literals: [.string("refresh_token")]), let value = try? container.decode(RoutetokenU2DExchangeRequestU2DGrantTypeU2DOptionU2D2_0463d43632.self) {
      self = .option2(value); return
    }
    throw DecodingError.typeMismatch(RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22.self, .init(codingPath: decoder.codingPath, debugDescription: "No union option matched RoutetokenU2DExchangeRequestU2DGrantType_20b56c9f22"))
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    }
  }
}

public enum RoutetokenU2DExchangeRequestU2DScopesU2DItem_8f483f0889: String, Codable, Sendable {
  case `sessionU3ARead` = "session:read"
  case `sessionU3AOperate` = "session:operate"
  case `terminalU3ARead` = "terminal:read"
  case `terminalU3AOperate` = "terminal:operate"
  case `requestsU3AResolve` = "requests:resolve"
  case `projectsU3AManage` = "projects:manage"
  case `portsU3AForward` = "ports:forward"
}

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
