// GENERATED FILE. Do not edit by hand.
import Foundation
public enum RoutethreadU2DTransferU2DCommandResponse_71a61af169: Codable, Sendable {
  case option1(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1_ced55d8893)
  case option2(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D2_ac3c47c48c)
  case option3(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3_37c5f21648)
  case option4(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D4_174bab0c7c)
  case option5(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D5_134ccbcdbc)
  case option6(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D6_f6f6c60cfa)
  case option7(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D7_c215a52302)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutethreadU2DTransferU2DCommandResponse_71a61af169)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("describe")]), let value = try? container.decode(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D1_ced55d8893.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("plan")]), let value = try? container.decode(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D2_ac3c47c48c.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("export")]), let value = try? container.decode(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D3_37c5f21648.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("read")]), let value = try? container.decode(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D4_174bab0c7c.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("release")]), let value = try? container.decode(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D5_134ccbcdbc.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("commit")]), let value = try? container.decode(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D6_f6f6c60cfa.self) {
      matches.append((6, .option6(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("abort")]), let value = try? container.decode(RoutethreadU2DTransferU2DCommandResponseU2DOptionU2D7_c215a52302.self) {
      matches.append((7, .option7(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutethreadU2DTransferU2DCommandResponse_71a61af169" : "Ambiguous union RoutethreadU2DTransferU2DCommandResponse_71a61af169 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutethreadU2DTransferU2DCommandResponse_71a61af169.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
    case .option6(let value): try container.encode(value)
    case .option7(let value): try container.encode(value)
    }
  }
}

public struct RoutethreadU2DTransferU2DUploadPath_faf4eaef48: Codable, Sendable, RemoteModelMetadata {
  public var transferId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "transferId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case transferId = "transferId"
  }
}

public struct RoutethreadU2DTransferU2DUploadQuery_1b36bab0d2: Codable, Sendable, RemoteModelMetadata {
  public var offset: Int64
  public var sha256: String
  public var total: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "offset", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sha256", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^[0-9a-f]{64}$", format: nil, semanticValidatorIds: []),
    .init(wireName: "total", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 536870912, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case offset = "offset"
    case sha256 = "sha256"
    case total = "total"
  }
}

public struct RoutethreadU2DTransferU2DUploadResponse_70c198324a: Codable, Sendable, RemoteModelMetadata {
  public var received: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "received", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case received = "received"
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
