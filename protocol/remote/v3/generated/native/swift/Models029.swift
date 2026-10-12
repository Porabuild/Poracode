// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteprojectU2DListQuery_5e1b33a494: Codable, Sendable, RemoteModelMetadata {
  public var cursor: RemoteField<String> = .missing
  public var maxBytes: RemoteField<Int64> = .missing
  public var maxDecodeBytes: RemoteField<Int64> = .missing
  public var mode: RemoteField<RouteprojectU2DListQueryU2DMode_902ee7904a> = .missing
  public var order: RemoteField<RouteprojectU2DListQueryU2DOrder_42146530bc> = .missing
  public var projectLimit: RemoteField<Int64> = .missing
  public var reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cursor", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxBytes", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxDecodeBytes", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mode", typeName: "RouteprojectU2DListQueryU2DMode_902ee7904a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "order", typeName: "RouteprojectU2DListQueryU2DOrder_42146530bc", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLimit", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 200, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reads", typeName: "RouteprojectU2DListQueryU2DReads_4659e6d395", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case cursor = "cursor"
    case maxBytes = "maxBytes"
    case maxDecodeBytes = "maxDecodeBytes"
    case mode = "mode"
    case order = "order"
    case projectLimit = "projectLimit"
    case reads = "reads"
  }
}

public struct RouteprojectU2DListResponse_8c0ef7d6db: Codable, Sendable, RemoteModelMetadata {
  public var inventoryFrontier: RemoteField<String> = .missing
  public var projects: [RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_3bac601a40]
  public var projectsNextCursor: RemoteField<String>
  public var reads: RouteprojectU2DListQueryU2DReads_4659e6d395
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "inventoryFrontier", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projects", typeName: "[RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_3bac601a40]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectsNextCursor", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reads", typeName: "RouteprojectU2DListQueryU2DReads_4659e6d395", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case inventoryFrontier = "inventoryFrontier"
    case projects = "projects"
    case projectsNextCursor = "projectsNextCursor"
    case reads = "reads"
  }
}

public struct RouteprojectU2DNotesU2DReadPath_05812a27bb: Codable, Sendable, RemoteModelMetadata {
  public var projectId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case projectId = "projectId"
  }
}

public typealias RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DDoc_6e4ad57825 = RemoteJSONValue?

public struct RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810: Codable, Sendable, RemoteModelMetadata {
  public var createdAt: String
  public var done: Bool
  public var id: String
  public var text: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "createdAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "done", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "text", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case createdAt = "createdAt"
    case done = "done"
    case id = "id"
    case text = "text"
  }
}

public struct RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1_bc92ea89e2: Codable, Sendable, RemoteModelMetadata {
  public var doc: RemoteField<RemoteJSONValue>
  public var projectId: String
  public var todos: [RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810]
  public var updatedAt: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "doc", typeName: "RemoteJSONValue", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "todos", typeName: "[RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "updatedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case doc = "doc"
    case projectId = "projectId"
    case todos = "todos"
    case updatedAt = "updatedAt"
  }
}

public typealias RouteprojectU2DNotesU2DReadResponseU2DNotes_6df40201d8 = RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1_bc92ea89e2?

public struct RouteprojectU2DNotesU2DReadResponse_d1eba06c8a: Codable, Sendable, RemoteModelMetadata {
  public var notes: RemoteField<RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1_bc92ea89e2>
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "notes", typeName: "RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1_bc92ea89e2", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case notes = "notes"
  }
}

public struct RouteprojectU2DNotesU2DWriteRequest_7b212bbb53: Codable, Sendable, RemoteModelMetadata {
  public var doc: RemoteField<RemoteJSONValue>
  public var todos: [RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810]
  public var updatedAt: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "doc", typeName: "RemoteJSONValue", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "todos", typeName: "[RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "updatedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case doc = "doc"
    case todos = "todos"
    case updatedAt = "updatedAt"
  }
}

public struct RouteprojectU2DSettingsResponse_c1417bffe5: Codable, Sendable, RemoteModelMetadata {
  public var mcpServers: RemoteField<[RoutemcpU2DSettingsU2DCommandResponseU2DServersU2DItem_d66267c393]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "mcpServers", typeName: "[RoutemcpU2DSettingsU2DCommandResponseU2DServersU2DItem_d66267c393]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case mcpServers = "mcpServers"
  }
}

public struct RoutepushU2DConfigResponse_f0c513c014: Codable, Sendable, RemoteModelMetadata {
  public var publicKey: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "publicKey", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case publicKey = "publicKey"
  }
}

public struct RoutepushU2DRegisterRequestU2DAlertPreferencesU2DStatuses_72130deafa: Codable, Sendable, RemoteModelMetadata {
  public var done: Bool
  public var error: Bool
  public var needsAttention: Bool
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "done", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "error", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "needsAttention", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case done = "done"
    case error = "error"
    case needsAttention = "needsAttention"
  }
}

public struct RoutepushU2DRegisterRequestU2DAlertPreferences_0534fb6201: Codable, Sendable, RemoteModelMetadata {
  public var sound: Bool
  public var statuses: RoutepushU2DRegisterRequestU2DAlertPreferencesU2DStatuses_72130deafa
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "sound", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "statuses", typeName: "RoutepushU2DRegisterRequestU2DAlertPreferencesU2DStatuses_72130deafa", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case sound = "sound"
    case statuses = "statuses"
  }
}

public enum RoutepushU2DRegisterRequestU2DPlatform_41d0cf6897: String, Codable, Sendable {
  case ios = "ios"
  case android = "android"
  case web = "web"
}

public struct RoutepushU2DRegisterRequestU2DRouting_a90fffdae1: Codable, Sendable, RemoteModelMetadata {
  public var clientConnectionId: String
  public var desktopId: String
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "clientConnectionId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "desktopId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 512, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["push.routing.identifier-no-controls"]),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case clientConnectionId = "clientConnectionId"
    case desktopId = "desktopId"
    case version = "version"
  }
}

public typealias RoutepushU2DRegisterRequestU2DWebPushSubscriptionU2DExpirationTime_60e901bdbc = Int64?

public struct RoutepushU2DRegisterRequestU2DWebPushSubscriptionU2DKeys_29fba8fe9f: Codable, Sendable, RemoteModelMetadata {
  public var auth: String
  public var p256dh: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "auth", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "p256dh", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case auth = "auth"
    case p256dh = "p256dh"
  }
}

public struct RoutepushU2DRegisterRequestU2DWebPushSubscription_fd8574a70c: Codable, Sendable, RemoteModelMetadata {
  public var endpoint: String
  public var expirationTime: RemoteField<Int64>
  public var keys: RoutepushU2DRegisterRequestU2DWebPushSubscriptionU2DKeys_29fba8fe9f
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "endpoint", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: "uri", semanticValidatorIds: ["push.web.endpoint-https"]),
    .init(wireName: "expirationTime", typeName: "Int64", required: true, nullable: true, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "keys", typeName: "RoutepushU2DRegisterRequestU2DWebPushSubscriptionU2DKeys_29fba8fe9f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case endpoint = "endpoint"
    case expirationTime = "expirationTime"
    case keys = "keys"
  }
}

public struct RoutepushU2DRegisterRequest_98c9ef3e40: Codable, Sendable, RemoteModelMetadata {
  public var activityTokens: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DSessionRuntimeRoutingU2DPrefixes_b84e449d1a> = .missing
  public var alertPreferences: RemoteField<RoutepushU2DRegisterRequestU2DAlertPreferences_0534fb6201> = .missing
  public var appVersion: RemoteField<String> = .missing
  public var deviceId: String
  public var deviceToken: RemoteField<String> = .missing
  public var platform: RoutepushU2DRegisterRequestU2DPlatform_41d0cf6897
  public var pushToStartToken: RemoteField<String> = .missing
  public var routing: RemoteField<RoutepushU2DRegisterRequestU2DRouting_a90fffdae1> = .missing
  public var webAppBasePath: RemoteField<String> = .missing
  public var webPushSubscription: RemoteField<RoutepushU2DRegisterRequestU2DWebPushSubscription_fd8574a70c> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "activityTokens", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DSessionRuntimeRoutingU2DPrefixes_b84e449d1a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "alertPreferences", typeName: "RoutepushU2DRegisterRequestU2DAlertPreferences_0534fb6201", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "appVersion", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "deviceId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 8, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "deviceToken", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "platform", typeName: "RoutepushU2DRegisterRequestU2DPlatform_41d0cf6897", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pushToStartToken", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "routing", typeName: "RoutepushU2DRegisterRequestU2DRouting_a90fffdae1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "webAppBasePath", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^\\/(?!\\/)(?:[^?#]*)$", format: nil, semanticValidatorIds: []),
    .init(wireName: "webPushSubscription", typeName: "RoutepushU2DRegisterRequestU2DWebPushSubscription_fd8574a70c", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = ["push.registration.platform-fields"]
  private enum CodingKeys: String, CodingKey {
    case activityTokens = "activityTokens"
    case alertPreferences = "alertPreferences"
    case appVersion = "appVersion"
    case deviceId = "deviceId"
    case deviceToken = "deviceToken"
    case platform = "platform"
    case pushToStartToken = "pushToStartToken"
    case routing = "routing"
    case webAppBasePath = "webAppBasePath"
    case webPushSubscription = "webPushSubscription"
  }
}

public struct RoutepushU2DRegisterResponseU2DRouting_fe73ac6ba6: Codable, Sendable, RemoteModelMetadata {
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case version = "version"
  }
}

public struct RoutepushU2DRegisterResponse_9633843f8b: Codable, Sendable, RemoteModelMetadata {
  public var ok: ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1
  public var routing: RemoteField<RoutepushU2DRegisterResponseU2DRouting_fe73ac6ba6> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "ok", typeName: "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "routing", typeName: "RoutepushU2DRegisterResponseU2DRouting_fe73ac6ba6", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case ok = "ok"
    case routing = "routing"
  }
}

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

public typealias RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItemU2DCompletedAt_595da89b21 = String?
