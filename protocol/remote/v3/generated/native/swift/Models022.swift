// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DTokens_36a14ea6cf: Codable, Sendable, RemoteModelMetadata {
  public var cacheRead: RemoteField<Double> = .missing
  public var cacheWrite: RemoteField<Double> = .missing
  public var input: RemoteField<Double> = .missing
  public var output: RemoteField<Double> = .missing
  public var period: RemoteField<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203> = .missing
  public var total: RemoteField<Double> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cacheRead", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cacheWrite", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "input", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "output", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "period", typeName: "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "total", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case cacheRead = "cacheRead"
    case cacheWrite = "cacheWrite"
    case input = "input"
    case output = "output"
    case period = "period"
    case total = "total"
  }
}

public enum RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DIdU2DOptionU2D1_9fef93fbe5: String, Codable, Sendable {
  case sessionU2D5h = "session-5h"
  case weekly = "weekly"
  case weeklyU2DOpus = "weekly-opus"
  case weeklyU2DSonnet = "weekly-sonnet"
  case weeklyU2DFable = "weekly-fable"
  case monthly = "monthly"
  case extraU2DUsage = "extra-usage"
  case cursorU2DAuto = "cursor-auto"
  case cursorU2DApi = "cursor-api"
}

public enum RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0: Codable, Sendable {
  case option1(RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DIdU2DOptionU2D1_9fef93fbe5)
  case option2(String)
  case option3(String)
  case option4(String)
  case option5(String)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0)] = []
    if RemoteUnionProbe.matchesString(decoder, literals: [.string("session-5h"), .string("weekly"), .string("weekly-opus"), .string("weekly-sonnet"), .string("weekly-fable"), .string("monthly"), .string("extra-usage"), .string("cursor-auto"), .string("cursor-api")]), let value = try? container.decode(RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DIdU2DOptionU2D1_9fef93fbe5.self) {
      self = .option1(value); return
    }
    if RemoteUnionProbe.matchesString(decoder, pattern: "^gemini:.+"), let value = try? container.decode(String.self) {
      self = .option2(value); return
    }
    if RemoteUnionProbe.matchesString(decoder, pattern: "^codex:.+"), let value = try? container.decode(String.self) {
      self = .option3(value); return
    }
    if RemoteUnionProbe.matchesString(decoder, pattern: "^antigravity:.+"), let value = try? container.decode(String.self) {
      self = .option4(value); return
    }
    if RemoteUnionProbe.matchesString(decoder, pattern: "^factory:.+"), let value = try? container.decode(String.self) {
      self = .option5(value); return
    }
    throw DecodingError.typeMismatch(RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0.self, .init(codingPath: decoder.codingPath, debugDescription: "No union option matched RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0"))
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

public enum RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DUnit_c263982707: String, Codable, Sendable {
  case percent = "percent"
  case tokens = "tokens"
  case requests = "requests"
  case credits = "credits"
  case usd = "usd"
}

public struct RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItem_ab58da84ea: Codable, Sendable, RemoteModelMetadata {
  public var currency: RemoteField<String> = .missing
  public var id: RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0
  public var label: String
  public var limit: RemoteField<Double> = .missing
  public var resetsAt: RemoteField<Int64> = .missing
  public var unit: RemoteField<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DUnit_c263982707> = .missing
  public var used: RemoteField<Double> = .missing
  public var usedPercent: Double
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "currency", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "limit", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "resetsAt", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "unit", typeName: "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DUnit_c263982707", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "used", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "usedPercent", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: 100, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case currency = "currency"
    case id = "id"
    case label = "label"
    case limit = "limit"
    case resetsAt = "resetsAt"
    case unit = "unit"
    case used = "used"
    case usedPercent = "usedPercent"
  }
}

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
