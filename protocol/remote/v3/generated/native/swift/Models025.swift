// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RoutethreadU2DHistoryU2DItemsResponseU2DItemsU2DItem_4c1171296b: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public var parentItemId: RemoteField<String> = .missing
  public var payload: RemoteField<RemoteJSONValue> = .missing
  public var state: RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValueU2DLatestItemState_2472eab79a
  public var streams: ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67
  public var typeValue: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "parentItemId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "payload", typeName: "RemoteJSONValue", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "state", typeName: "RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValueU2DLatestItemState_2472eab79a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "streams", typeName: "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case parentItemId = "parentItemId"
    case payload = "payload"
    case state = "state"
    case streams = "streams"
    case typeValue = "type"
  }
}

public struct RoutethreadU2DHistoryU2DItemsResponse_57033b19c3: Codable, Sendable, RemoteModelMetadata {
  public var items: [RoutethreadU2DHistoryU2DItemsResponseU2DItemsU2DItem_4c1171296b]
  public var nextCursor: RemoteField<Int64>
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "items", typeName: "[RoutethreadU2DHistoryU2DItemsResponseU2DItemsU2DItem_4c1171296b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "nextCursor", typeName: "Int64", required: true, nullable: true, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case items = "items"
    case nextCursor = "nextCursor"
  }
}

public struct RoutethreadU2DRuntimeU2DTruncateRequest_228757711c: Codable, Sendable, RemoteModelMetadata {
  public var itemId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "itemId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case itemId = "itemId"
  }
}

public struct RoutethreadU2DSendRequest_986c4c7218: Codable, Sendable, RemoteModelMetadata {
  public var config: ProcedurerollbackThreadConversationRequestU2DConfig_03b0262a8a
  public var prompt: String
  public var segments: RemoteField<[ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81]> = .missing
  public var userMessageItemId: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "config", typeName: "ProcedurerollbackThreadConversationRequestU2DConfig_03b0262a8a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "segments", typeName: "[ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "userMessageItemId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case config = "config"
    case prompt = "prompt"
    case segments = "segments"
    case userMessageItemId = "userMessageItemId"
  }
}

public typealias RoutethreadU2DStartU2DExistingRequestU2DDisabledBuiltInMcpTools_fdad254a8b = [String: [String]]

public struct RoutethreadU2DStartU2DExistingRequest_3e2157eda4: Codable, Sendable, RemoteModelMetadata {
  public var agentInstanceId: RemoteField<String> = .missing
  public var agentKind: String
  public var config: ProcedurerollbackThreadConversationRequestU2DConfig_03b0262a8a
  public var disabledBuiltInMcpServerIds: RemoteField<[RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServersU2DPropertyU2DName_13f43aaaf5]> = .missing
  public var disabledBuiltInMcpTools: RemoteField<RoutethreadU2DStartU2DExistingRequestU2DDisabledBuiltInMcpTools_fdad254a8b> = .missing
  public var initialSize: RouteterminalU2DResizeRequest_55ee222c09
  public var invariantDisabledBuiltInMcpServerIds: RemoteField<[RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServersU2DPropertyU2DName_13f43aaaf5]> = .missing
  public var mcpServers: RemoteField<[ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1]> = .missing
  public var presentationMode: RemoteField<ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6> = .missing
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public var prompt: RemoteField<String> = .missing
  public var segments: RemoteField<[ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81]> = .missing
  public var sessionRef: RemoteField<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionRef_3b70e9f118> = .missing
  public var threadId: String
  public var userMessageItemId: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentInstanceId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: "^[a-z0-9][a-z0-9_\\-:.]*$", format: nil, semanticValidatorIds: []),
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "ProcedurerollbackThreadConversationRequestU2DConfig_03b0262a8a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabledBuiltInMcpServerIds", typeName: "[RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServersU2DPropertyU2DName_13f43aaaf5]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabledBuiltInMcpTools", typeName: "RoutethreadU2DStartU2DExistingRequestU2DDisabledBuiltInMcpTools_fdad254a8b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "initialSize", typeName: "RouteterminalU2DResizeRequest_55ee222c09", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "invariantDisabledBuiltInMcpServerIds", typeName: "[RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServersU2DPropertyU2DName_13f43aaaf5]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mcpServers", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentationMode", typeName: "ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "segments", typeName: "[ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sessionRef", typeName: "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionRef_3b70e9f118", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "userMessageItemId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentInstanceId = "agentInstanceId"
    case agentKind = "agentKind"
    case config = "config"
    case disabledBuiltInMcpServerIds = "disabledBuiltInMcpServerIds"
    case disabledBuiltInMcpTools = "disabledBuiltInMcpTools"
    case initialSize = "initialSize"
    case invariantDisabledBuiltInMcpServerIds = "invariantDisabledBuiltInMcpServerIds"
    case mcpServers = "mcpServers"
    case presentationMode = "presentationMode"
    case projectLocation = "projectLocation"
    case prompt = "prompt"
    case segments = "segments"
    case sessionRef = "sessionRef"
    case threadId = "threadId"
    case userMessageItemId = "userMessageItemId"
  }
}

public struct RoutethreadU2DSteerU2DSetRequest_923edf9fd3: Codable, Sendable, RemoteModelMetadata {
  public var config: ProcedurerollbackThreadConversationRequestU2DConfig_03b0262a8a
  public var prompt: String
  public var segments: RemoteField<[ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "config", typeName: "ProcedurerollbackThreadConversationRequestU2DConfig_03b0262a8a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "segments", typeName: "[ProcedurestageThreadInputRequestU2DSegmentsU2DItem_e957595c81]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case config = "config"
    case prompt = "prompt"
    case segments = "segments"
  }
}

public enum RoutetokenU2DExchangeRequestU2DClientU2DDeviceType_28ab534145: String, Codable, Sendable {
  case desktop = "desktop"
  case mobile = "mobile"
  case tablet = "tablet"
  case browser = "browser"
  case unknown = "unknown"
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

public enum RoutetokenU2DExchangeRequestU2DGrantType_962b214fbc: String, Codable, Sendable {
  case pairingU2DToken = "pairing-token"
}

public enum RoutetokenU2DExchangeRequestU2DScopesU2DItem_8f483f0889: String, Codable, Sendable {
  case sessionU3ARead = "session:read"
  case sessionU3AOperate = "session:operate"
  case terminalU3ARead = "terminal:read"
  case terminalU3AOperate = "terminal:operate"
  case requestsU3AResolve = "requests:resolve"
  case projectsU3AManage = "projects:manage"
  case portsU3AForward = "ports:forward"
}

public struct RoutetokenU2DExchangeRequest_8dfe4ead4e: Codable, Sendable, RemoteModelMetadata {
  public var client: RemoteField<RoutetokenU2DExchangeRequestU2DClient_6969170275> = .missing
  public var credential: String
  public var grantType: RoutetokenU2DExchangeRequestU2DGrantType_962b214fbc
  public var scopes: RemoteField<[RoutetokenU2DExchangeRequestU2DScopesU2DItem_8f483f0889]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "client", typeName: "RoutetokenU2DExchangeRequestU2DClient_6969170275", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "credential", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "grantType", typeName: "RoutetokenU2DExchangeRequestU2DGrantType_962b214fbc", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scopes", typeName: "[RoutetokenU2DExchangeRequestU2DScopesU2DItem_8f483f0889]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case client = "client"
    case credential = "credential"
    case grantType = "grantType"
    case scopes = "scopes"
  }
}

public enum RoutetokenU2DExchangeResponseU2DTokenType_7c8fd050dd: String, Codable, Sendable {
  case bearer = "Bearer"
}

public struct RoutetokenU2DExchangeResponse_d15a69227c: Codable, Sendable, RemoteModelMetadata {
  public var accessToken: String
  public var expiresAt: String
  public var scopes: [String]
  public var tokenType: RoutetokenU2DExchangeResponseU2DTokenType_7c8fd050dd
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "accessToken", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "expiresAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scopes", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tokenType", typeName: "RoutetokenU2DExchangeResponseU2DTokenType_7c8fd050dd", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case accessToken = "accessToken"
    case expiresAt = "expiresAt"
    case scopes = "scopes"
    case tokenType = "tokenType"
  }
}

public struct RoutewebsocketU2DTicketResponse_b9dfb5a053: Codable, Sendable, RemoteModelMetadata {
  public var expiresAt: String
  public var ticket: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "expiresAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ticket", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case expiresAt = "expiresAt"
    case ticket = "ticket"
  }
}

public enum WebSocketClientMessageU2DOptionU2D1U2DType_fe79d48b8a: String, Codable, Sendable {
  case ping = "ping"
}

public struct WebSocketClientMessageU2DOptionU2D1_1709690cf0: Codable, Sendable, RemoteModelMetadata {
  public var id: RemoteField<String> = .missing
  public var sentAt: RemoteField<Double> = .missing
  public var typeValue: WebSocketClientMessageU2DOptionU2D1U2DType_fe79d48b8a
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sentAt", typeName: "Double", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D1U2DType_fe79d48b8a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case sentAt = "sentAt"
    case typeValue = "type"
  }
}

public enum WebSocketClientMessageU2DOptionU2D2U2DType_3f5bcd72f9: String, Codable, Sendable {
  case browserU2DWatch = "browser-watch"
}

public struct WebSocketClientMessageU2DOptionU2D2_2b7b34c95b: Codable, Sendable, RemoteModelMetadata {
  public var typeValue: WebSocketClientMessageU2DOptionU2D2U2DType_3f5bcd72f9
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D2U2DType_3f5bcd72f9", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case typeValue = "type"
  }
}

public enum WebSocketClientMessageU2DOptionU2D3U2DType_225e53f995: String, Codable, Sendable {
  case browserU2DUnwatch = "browser-unwatch"
}

public struct WebSocketClientMessageU2DOptionU2D3_0e8f58f429: Codable, Sendable, RemoteModelMetadata {
  public var typeValue: WebSocketClientMessageU2DOptionU2D3U2DType_225e53f995
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "type", typeName: "WebSocketClientMessageU2DOptionU2D3U2DType_225e53f995", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case typeValue = "type"
  }
}

public enum WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D1U2DKind_ef917452dc: String, Codable, Sendable {
  case tap = "tap"
}

public struct WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D1_75aa7b0623: Codable, Sendable, RemoteModelMetadata {
  public var kind: WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D1U2DKind_ef917452dc
  public var x: Double
  public var y: Double
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D1U2DKind_ef917452dc", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public enum WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D2U2DKind_00ebeb8fef: String, Codable, Sendable {
  case scroll = "scroll"
}

public struct WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D2_41ffeb2050: Codable, Sendable, RemoteModelMetadata {
  public var deltaX: Double
  public var deltaY: Double
  public var kind: WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D2U2DKind_00ebeb8fef
  public var x: Double
  public var y: Double
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "deltaX", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "deltaY", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D2U2DKind_00ebeb8fef", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public enum WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D3U2DKind_19030914d1: String, Codable, Sendable {
  case insertU2DText = "insert-text"
}

public struct WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D3_8906d017ba: Codable, Sendable, RemoteModelMetadata {
  public var kind: WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D3U2DKind_19030914d1
  public var text: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D3U2DKind_19030914d1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "text", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 1024, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case text = "text"
  }
}

public enum WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D4U2DKey_7df0b39f18: String, Codable, Sendable {
  case enter = "enter"
  case backspace = "backspace"
  case tab = "tab"
  case escape = "escape"
  case arrowU2DUp = "arrow-up"
  case arrowU2DDown = "arrow-down"
  case arrowU2DLeft = "arrow-left"
  case arrowU2DRight = "arrow-right"
}

public enum WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D4U2DKind_14221269d8: String, Codable, Sendable {
  case key = "key"
}

public struct WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D4_9e169df36e: Codable, Sendable, RemoteModelMetadata {
  public var key: WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D4U2DKey_7df0b39f18
  public var kind: WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D4U2DKind_14221269d8
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "key", typeName: "WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D4U2DKey_7df0b39f18", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D4U2DKind_14221269d8", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case key = "key"
    case kind = "kind"
  }
}

public enum WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c: Codable, Sendable {
  case option1(WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D1_75aa7b0623)
  case option2(WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D2_41ffeb2050)
  case option3(WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D3_8906d017ba)
  case option4(WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D4_9e169df36e)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("tap")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D1_75aa7b0623.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("scroll")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D2_41ffeb2050.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("insert-text")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D3_8906d017ba.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("key")]), let value = try? container.decode(WebSocketClientMessageU2DOptionU2D4U2DInputU2DOptionU2D4_9e169df36e.self) {
      matches.append((4, .option4(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c" : "Ambiguous union WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(WebSocketClientMessageU2DOptionU2D4U2DInput_2c0b30d69c.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public enum WebSocketClientMessageU2DOptionU2D4U2DType_64570e2249: String, Codable, Sendable {
  case browserU2DInput = "browser-input"
}
