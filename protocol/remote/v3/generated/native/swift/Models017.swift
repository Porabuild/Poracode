// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DConfig_048d1517dd: Codable, Sendable, RemoteModelMetadata {
  public var effort: RemoteField<String> = .missing
  public var fast: RemoteField<Bool> = .missing
  public var model: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "effort", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fast", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "model", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case effort = "effort"
    case fast = "fast"
    case model = "model"
  }
}

public struct RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_f0266e8ace: Codable, Sendable, RemoteModelMetadata {
  public var activeThreadId: RemoteField<String>
  public var agentKind: RemoteField<String> = .missing
  public var autoMerge: Bool
  public var config: RemoteField<RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DConfig_048d1517dd> = .missing
  public var headBranch: String
  public var lastCheckKey: RemoteField<String>
  public var lastCommentCursor: RemoteField<String>
  public var lastError: RemoteField<String>
  public var lastReviewCommentCursor: RemoteField<String>
  public var lastReviewCursor: RemoteField<String>
  public var prNumber: Int64
  public var projectId: String
  public var watchEnabled: Bool
  public var worktreePath: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "activeThreadId", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "agentKind", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "autoMerge", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DConfig_048d1517dd", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "headBranch", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastCheckKey", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastCommentCursor", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastError", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastReviewCommentCursor", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastReviewCursor", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prNumber", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "watchEnabled", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreePath", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = ["pr-watch.agent-required-when-enabled"]
  private enum CodingKeys: String, CodingKey {
    case activeThreadId = "activeThreadId"
    case agentKind = "agentKind"
    case autoMerge = "autoMerge"
    case config = "config"
    case headBranch = "headBranch"
    case lastCheckKey = "lastCheckKey"
    case lastCommentCursor = "lastCommentCursor"
    case lastError = "lastError"
    case lastReviewCommentCursor = "lastReviewCommentCursor"
    case lastReviewCursor = "lastReviewCursor"
    case prNumber = "prNumber"
    case projectId = "projectId"
    case watchEnabled = "watchEnabled"
    case worktreePath = "worktreePath"
  }
}

public typealias RouteprU2DWatchU2DReadResponseU2DWatch_f2d9607a69 = RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_f0266e8ace?

public struct RouteprU2DWatchU2DReadResponse_6a3696f049: Codable, Sendable, RemoteModelMetadata {
  public var watch: RemoteField<RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_f0266e8ace>
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "watch", typeName: "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_f0266e8ace", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["pr-watch.agent-required-when-enabled"]),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case watch = "watch"
  }
}

public struct RouteprU2DWatchU2DUpsertRequest_8be1194a62: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: RemoteField<String> = .missing
  public var autoMerge: Bool
  public var config: RemoteField<RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DConfig_048d1517dd> = .missing
  public var headBranch: String
  public var prNumber: Int64
  public var projectId: String
  public var watchEnabled: Bool
  public var worktreePath: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "autoMerge", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DConfig_048d1517dd", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "headBranch", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prNumber", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "watchEnabled", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreePath", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = ["pr-watch.agent-required-when-enabled"]
  private enum CodingKeys: String, CodingKey {
    case agentKind = "agentKind"
    case autoMerge = "autoMerge"
    case config = "config"
    case headBranch = "headBranch"
    case prNumber = "prNumber"
    case projectId = "projectId"
    case watchEnabled = "watchEnabled"
    case worktreePath = "worktreePath"
  }
}

public struct RouteprU2DWatchU2DUpsertResponse_52bd1574b5: Codable, Sendable, RemoteModelMetadata {
  public var watch: RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_f0266e8ace
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "watch", typeName: "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_f0266e8ace", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["pr-watch.agent-required-when-enabled"]),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case watch = "watch"
  }
}

public struct RouteprocedureU2DCallRequest_d566f2fb6a: Codable, Sendable, RemoteModelMetadata {
  public var payload: RemoteJSONValue
  public var procedure: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "payload", typeName: "RemoteJSONValue", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "procedure", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case payload = "payload"
    case procedure = "procedure"
  }
}

public enum RouteprofileU2DCoreU2DStatsRequestU2DScope_b99ee3af30: String, Codable, Sendable {
  case device = "device"
  case all = "all"
}

public enum RouteprofileU2DCoreU2DStatsRequestU2DWindow_ae26bc52b7: String, Codable, Sendable {
  case n7d = "7d"
  case n30d = "30d"
  case all = "all"
}

public struct RouteprofileU2DCoreU2DStatsRequest_f76e77baae: Codable, Sendable, RemoteModelMetadata {
  public var deviceId: RemoteField<String> = .missing
  public var provider: RemoteField<String> = .missing
  public var scope: RemoteField<RouteprofileU2DCoreU2DStatsRequestU2DScope_b99ee3af30> = .missing
  public var utcOffsetMinutes: Double
  public var window: RemoteField<RouteprofileU2DCoreU2DStatsRequestU2DWindow_ae26bc52b7> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "deviceId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "provider", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scope", typeName: "RouteprofileU2DCoreU2DStatsRequestU2DScope_b99ee3af30", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "utcOffsetMinutes", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "window", typeName: "RouteprofileU2DCoreU2DStatsRequestU2DWindow_ae26bc52b7", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case deviceId = "deviceId"
    case provider = "provider"
    case scope = "scope"
    case utcOffsetMinutes = "utcOffsetMinutes"
    case window = "window"
  }
}

public struct RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc: Codable, Sendable, RemoteModelMetadata {
  public var count: Double
  public var key: String
  public var label: String
  public var percent: Double
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "count", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "key", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "percent", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case count = "count"
    case key = "key"
    case label = "label"
    case percent = "percent"
  }
}

public enum RouteprofileU2DCoreU2DStatsResponseU2DAiActionsU2DItemU2DType_645d18fd9a: String, Codable, Sendable {
  case commit = "commit"
  case pr = "pr"
  case conflict = "conflict"
}

public struct RouteprofileU2DCoreU2DStatsResponseU2DAiActionsU2DItem_bb42560f34: Codable, Sendable, RemoteModelMetadata {
  public var count: Int64
  public var label: String
  public var topModel: RemoteField<String> = .missing
  public var topProvider: RemoteField<String> = .missing
  public var typeValue: RouteprofileU2DCoreU2DStatsResponseU2DAiActionsU2DItemU2DType_645d18fd9a
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "count", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "topModel", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "topProvider", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DAiActionsU2DItemU2DType_645d18fd9a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case count = "count"
    case label = "label"
    case topModel = "topModel"
    case topProvider = "topProvider"
    case typeValue = "type"
  }
}

public struct RouteprofileU2DCoreU2DStatsResponseU2DAvailableAccountsU2DItem_9ec272a824: Codable, Sendable, RemoteModelMetadata {
  public var key: String
  public var label: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "key", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case key = "key"
    case label = "label"
  }
}

public struct RouteprofileU2DCoreU2DStatsResponseU2DDevice_26f96950d2: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public var isCurrent: RemoteField<Bool> = .missing
  public var label: String
  public var lastActiveAt: RemoteField<Int64> = .missing
  public var platform: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "isCurrent", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastActiveAt", typeName: "Int64", required: false, nullable: false, minimum: -9007199254740991, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "platform", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case isCurrent = "isCurrent"
    case label = "label"
    case lastActiveAt = "lastActiveAt"
    case platform = "platform"
  }
}

public struct RouteprofileU2DCoreU2DStatsResponseU2DIdentity_da76232259: Codable, Sendable, RemoteModelMetadata {
  public var avatarColor: String
  public var handle: String
  public var name: String
  public var plan: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "avatarColor", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 64, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "handle", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 40, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 80, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "plan", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 40, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case avatarColor = "avatarColor"
    case handle = "handle"
    case name = "name"
    case plan = "plan"
  }
}

public struct RouteprofileU2DCoreU2DStatsResponseU2DInsightsU2DMostActiveHour_58f9a3fda2: Codable, Sendable, RemoteModelMetadata {
  public var count: Int64
  public var hour: Int64
  public var label: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "count", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "hour", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 23, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case count = "count"
    case hour = "hour"
    case label = "label"
  }
}

public struct RouteprofileU2DCoreU2DStatsResponseU2DInsights_d1beee40ea: Codable, Sendable, RemoteModelMetadata {
  public var fastModePercent: Double
  public var mcpToolCalls: Int64
  public var mostActiveHour: RemoteField<RouteprofileU2DCoreU2DStatsResponseU2DInsightsU2DMostActiveHour_58f9a3fda2> = .missing
  public var skillsExplored: Int64
  public var subagentRuns: Int64
  public var topModel: RemoteField<RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc> = .missing
  public var topProvider: RemoteField<RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc> = .missing
  public var topReasoning: RemoteField<RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc> = .missing
  public var totalSkillsUsed: Int64
  public var workflowRuns: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "fastModePercent", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mcpToolCalls", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mostActiveHour", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DInsightsU2DMostActiveHour_58f9a3fda2", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "skillsExplored", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "subagentRuns", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "topModel", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "topProvider", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "topReasoning", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DAccountsU2DItem_9fe1fe9bbc", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "totalSkillsUsed", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "workflowRuns", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case fastModePercent = "fastModePercent"
    case mcpToolCalls = "mcpToolCalls"
    case mostActiveHour = "mostActiveHour"
    case skillsExplored = "skillsExplored"
    case subagentRuns = "subagentRuns"
    case topModel = "topModel"
    case topProvider = "topProvider"
    case topReasoning = "topReasoning"
    case totalSkillsUsed = "totalSkillsUsed"
    case workflowRuns = "workflowRuns"
  }
}

public enum RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItemU2DKind_b096158c79: String, Codable, Sendable {
  case skill = "skill"
  case subagent = "subagent"
  case tool = "tool"
  case mcp = "mcp"
}

public struct RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItem_9137d87075: Codable, Sendable, RemoteModelMetadata {
  public var displayName: String
  public var kind: RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItemU2DKind_b096158c79
  public var name: String
  public var runCount: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "displayName", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DMcpsU2DItemU2DKind_b096158c79", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runCount", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case displayName = "displayName"
    case kind = "kind"
    case name = "name"
    case runCount = "runCount"
  }
}

public typealias RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D2_7f9f5a0d72 = Double

public typealias RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f = Double

public typealias RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D5_e6cfd13a74 = Double

public enum RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6: Codable, Sendable {
  case option1(ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5)
  case option2(RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D2_7f9f5a0d72)
  case option3(RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f)
  case option4(RouteenvironmentU2DLegacyResponseU2DProtocolVersion_135f7ef79d)
  case option5(RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D5_e6cfd13a74)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6)] = []
    if RemoteUnionProbe.matchesNumber(decoder, integer: false, literals: [.int(0)]), let value = try? container.decode(ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5.self) {
      self = .option1(value); return
    }
    if RemoteUnionProbe.matchesNumber(decoder, integer: false, literals: [.int(1)]), let value = try? container.decode(RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D2_7f9f5a0d72.self) {
      self = .option2(value); return
    }
    if RemoteUnionProbe.matchesNumber(decoder, integer: false, literals: [.int(2)]), let value = try? container.decode(RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D3_f8ba039a2f.self) {
      self = .option3(value); return
    }
    if RemoteUnionProbe.matchesNumber(decoder, integer: false, literals: [.int(3)]), let value = try? container.decode(RouteenvironmentU2DLegacyResponseU2DProtocolVersion_135f7ef79d.self) {
      self = .option4(value); return
    }
    if RemoteUnionProbe.matchesNumber(decoder, integer: false, literals: [.int(4)]), let value = try? container.decode(RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensityU2DOptionU2D5_e6cfd13a74.self) {
      self = .option5(value); return
    }
    throw DecodingError.typeMismatch(RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6.self, .init(codingPath: decoder.codingPath, debugDescription: "No union option matched RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6"))
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

public struct RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItem_07cc5ea327: Codable, Sendable, RemoteModelMetadata {
  public var count: Int64
  public var day: String
  public var intensity: RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "count", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "day", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "intensity", typeName: "RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DCellsU2DItemU2DIntensity_01baf573c6", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case count = "count"
    case day = "day"
    case intensity = "intensity"
  }
}

public enum RouteprofileU2DCoreU2DStatsResponseU2DPromptHeatmapU2DMetric_b7f9b9a51e: String, Codable, Sendable {
  case prompts = "prompts"
  case tokens = "tokens"
}
