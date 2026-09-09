// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteproviderU2DUsageResponseU2DSnapshotsU2DItem_33b08544c9: Codable, Sendable, RemoteModelMetadata {
  public var authenticatedAs: RemoteField<String> = .missing
  public var cost: RemoteField<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCost_4147389dac> = .missing
  public var credits: RemoteField<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCredits_a39dd04104> = .missing
  public var error: RemoteField<String> = .missing
  public var fetchedAt: Int64
  public var plan: RemoteField<String> = .missing
  public var providerId: String
  public var rateLimitedUntil: RemoteField<Int64> = .missing
  public var status: RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DStatus_3466b9b69c
  public var tokens: RemoteField<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DTokens_36a14ea6cf> = .missing
  public var windows: [RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItem_ab58da84ea]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "authenticatedAs", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cost", typeName: "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCost_4147389dac", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "credits", typeName: "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCredits_a39dd04104", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "error", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fetchedAt", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "plan", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "rateLimitedUntil", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DStatus_3466b9b69c", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tokens", typeName: "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DTokens_36a14ea6cf", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "windows", typeName: "[RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItem_ab58da84ea]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case authenticatedAs = "authenticatedAs"
    case cost = "cost"
    case credits = "credits"
    case error = "error"
    case fetchedAt = "fetchedAt"
    case plan = "plan"
    case providerId = "providerId"
    case rateLimitedUntil = "rateLimitedUntil"
    case status = "status"
    case tokens = "tokens"
    case windows = "windows"
  }
}

public struct RouteproviderU2DUsageResponse_e3d7559a78: Codable, Sendable, RemoteModelMetadata {
  public var fromCache: Bool
  public var snapshots: [RouteproviderU2DUsageResponseU2DSnapshotsU2DItem_33b08544c9]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "fromCache", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "snapshots", typeName: "[RouteproviderU2DUsageResponseU2DSnapshotsU2DItem_33b08544c9]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case fromCache = "fromCache"
    case snapshots = "snapshots"
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
  public var version: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D2_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "clientConnectionId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "desktopId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 512, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["push.routing.identifier-no-controls"]),
    .init(wireName: "version", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D2_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
  public var version: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D2_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "version", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D2_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case version = "version"
  }
}

public struct RoutepushU2DRegisterResponse_9633843f8b: Codable, Sendable, RemoteModelMetadata {
  public var ok: RouteportU2DUnforwardResponseU2DOk_d2dd3595e1
  public var routing: RemoteField<RoutepushU2DRegisterResponseU2DRouting_fe73ac6ba6> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "ok", typeName: "RouteportU2DUnforwardResponseU2DOk_d2dd3595e1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public struct RouterequestU2DResolvePath_09b78d9c1d: Codable, Sendable, RemoteModelMetadata {
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case threadId = "threadId"
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
  case option1(String)
  case option2(Int64)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce)] = []
    if RemoteUnionProbe.matchesString(decoder), let value = try? container.decode(String.self) {
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

public struct RouteruntimeU2DImageQuery_1dbbfc3a2e: Codable, Sendable, RemoteModelMetadata {
  public var accessU5FToken: RemoteField<String> = .missing
  public var path: [RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "access_token", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "[RouteruntimeU2DImageQueryU2DPathU2DItem_941a12a3ce]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 1, maxItems: 8, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case accessU5FToken = "access_token"
    case path = "path"
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

public enum RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItemU2DStatus_d21b71d44d: String, Codable, Sendable {
  case running = "running"
  case succeeded = "succeeded"
  case failed = "failed"
  case interrupted = "interrupted"
}

public struct RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItem_e5ba6e7ba5: Codable, Sendable, RemoteModelMetadata {
  public var completedAt: RemoteField<String>
  public var error: RemoteField<String>
  public var id: String
  public var scheduleId: String
  public var startedAt: String
  public var status: RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItemU2DStatus_d21b71d44d
  public var summary: RemoteField<String>
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "completedAt", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
    .init(wireName: "error", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "scheduleId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "startedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$", format: "date-time", semanticValidatorIds: []),
    .init(wireName: "status", typeName: "RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItemU2DStatus_d21b71d44d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "summary", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case completedAt = "completedAt"
    case error = "error"
    case id = "id"
    case scheduleId = "scheduleId"
    case startedAt = "startedAt"
    case status = "status"
    case summary = "summary"
    case threadId = "threadId"
  }
}

public struct RoutescheduleU2DRunsU2DReadResponse_dc9dbbe080: Codable, Sendable, RemoteModelMetadata {
  public var runs: [RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItem_e5ba6e7ba5]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "runs", typeName: "[RoutescheduleU2DRunsU2DReadResponseU2DRunsU2DItem_e5ba6e7ba5]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case runs = "runs"
  }
}

public enum RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D1U2DKind_6f5933af03: String, Codable, Sendable {
  case hourly = "hourly"
}

public struct RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D1_a467b0ed1c: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D1U2DKind_6f5933af03
  public var minute: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D1U2DKind_6f5933af03", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "minute", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 59, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case minute = "minute"
  }
}

public enum RouteschedulesU2DCommandRequestU2DOptionU2D1U2DTaskU2DRecurrenceU2DOptionU2D2U2DKind_475f91db7d: String, Codable, Sendable {
  case weekly = "weekly"
}
