// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteportU2DEnterRequest_4067ad04bf: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
  }
}

public struct RouteportU2DEnterResponse_72ce7899de: Codable, Sendable, RemoteModelMetadata {
  public var enterPath: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "enterPath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case enterPath = "enterPath"
  }
}

public struct RouteportU2DForwardRequest_a26f77dd4a: Codable, Sendable, RemoteModelMetadata {
  public var targetPort: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "targetPort", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 65535, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case targetPort = "targetPort"
  }
}

public struct RouteportU2DForwardResponseU2DForward_247ec4acb4: Codable, Sendable, RemoteModelMetadata {
  public var createdAt: Int64
  public var id: String
  public var listenPort: Int64
  public var targetPort: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "createdAt", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "listenPort", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 65535, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "targetPort", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 65535, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case createdAt = "createdAt"
    case id = "id"
    case listenPort = "listenPort"
    case targetPort = "targetPort"
  }
}

public struct RouteportU2DForwardResponse_04de8f3da1: Codable, Sendable, RemoteModelMetadata {
  public var connectTicket: String
  public var enterPath: RemoteField<String> = .missing
  public var forward: RouteportU2DForwardResponseU2DForward_247ec4acb4
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "connectTicket", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "enterPath", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "forward", typeName: "RouteportU2DForwardResponseU2DForward_247ec4acb4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case connectTicket = "connectTicket"
    case enterPath = "enterPath"
    case forward = "forward"
  }
}

public enum RouteportsU2DReadResponseU2DDetectedU2DItemU2DProtocol_cb34d50832: String, Codable, Sendable {
  case `http` = "http"
  case `unknown` = "unknown"
}

public struct RouteportsU2DReadResponseU2DDetectedU2DItem_40aab29508: Codable, Sendable, RemoteModelMetadata {
  public var label: RemoteField<String> = .missing
  public var port: Int64
  public var protocolValue: RouteportsU2DReadResponseU2DDetectedU2DItemU2DProtocol_cb34d50832
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "label", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "port", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 65535, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "protocol", typeName: "RouteportsU2DReadResponseU2DDetectedU2DItemU2DProtocol_cb34d50832", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case label = "label"
    case port = "port"
    case protocolValue = "protocol"
  }
}

public struct RouteportsU2DReadResponse_ea993e5b2d: Codable, Sendable, RemoteModelMetadata {
  public var detected: [RouteportsU2DReadResponseU2DDetectedU2DItem_40aab29508]
  public var forwards: [RouteportU2DForwardResponseU2DForward_247ec4acb4]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "detected", typeName: "[RouteportsU2DReadResponseU2DDetectedU2DItem_40aab29508]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "forwards", typeName: "[RouteportU2DForwardResponseU2DForward_247ec4acb4]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case detected = "detected"
    case forwards = "forwards"
  }
}

public struct RouteprU2DWatchU2DAgentU2DSyncRequest_b2c8fd1712: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: String
  public var config: RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DConfig_f69100925f
  public var projectId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DConfig_f69100925f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentKind = "agentKind"
    case config = "config"
    case projectId = "projectId"
  }
}

public struct RouteprU2DWatchU2DCheckRequest_22fb635ee9: Codable, Sendable, RemoteModelMetadata {
  public var prNumber: Int64
  public var projectId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "prNumber", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case prNumber = "prNumber"
    case projectId = "projectId"
  }
}

public enum RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReasonU2DOptionU2D1_95e237e577: String, Codable, Sendable {
  case `agentU2DUnavailable` = "agent-unavailable"
  case `worktreeU2DUnavailable` = "worktree-unavailable"
  case `duplicateU2DProjectU2DWatches` = "duplicate-project-watches"
}

public typealias RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReason_7dccd2754f = RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReasonU2DOptionU2D1_95e237e577?

public struct RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DReviewScope_464dbc5abe: Codable, Sendable, RemoteModelMetadata {
  public var account: ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b
  public var forge: ProcedureforgeClosePrRequestU2DForgeAccountU2DForge_eaed3cfbf4
  public var host: String
  public var repository: String
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "account", typeName: "ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "forge", typeName: "ProcedureforgeClosePrRequestU2DForgeAccountU2DForge_eaed3cfbf4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "host", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: "uri", semanticValidatorIds: ["forge.host.https"]),
    .init(wireName: "repository", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = ["forge.watch.scope-identity"]
  private enum CodingKeys: String, CodingKey {
    case account = "account"
    case forge = "forge"
    case host = "host"
    case repository = "repository"
    case version = "version"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.account = try container.decode(ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b.self, forKey: .account)
    self.forge = try container.decode(ProcedureforgeClosePrRequestU2DForgeAccountU2DForge_eaed3cfbf4.self, forKey: .forge)
    self.host = try container.decode(String.self, forKey: .host)
    self.repository = try container.decode(String.self, forKey: .repository)
    self.version = try container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72.self, forKey: .version)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(account, forKey: .account)
    try container.encode(forge, forKey: .forge)
    try container.encode(host, forKey: .host)
    try container.encode(repository, forKey: .repository)
    try container.encode(version, forKey: .version)
  }
}

public struct RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_5093c62d05: Codable, Sendable, RemoteModelMetadata {
  public var activeThreadId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public var agentKind: RemoteField<String> = .missing
  public var autoMerge: Bool
  public var blockedReason: RemoteField<RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReasonU2DOptionU2D1_95e237e577>
  public var config: RemoteField<RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DConfig_f69100925f> = .missing
  public var headBranch: String
  public var lastCheckKey: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public var lastCommentCursor: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public var lastError: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public var lastReviewCommentCursor: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public var lastReviewCursor: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public var prNumber: Int64
  public var projectId: String
  public var reviewScope: RemoteField<RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DReviewScope_464dbc5abe> = .missing
  public var reviewScopeUnsupported: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1> = .missing
  public var watchEnabled: Bool
  public var worktreePath: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "activeThreadId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "agentKind", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "autoMerge", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "blockedReason", typeName: "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReasonU2DOptionU2D1_95e237e577", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DConfig_f69100925f", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "headBranch", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastCheckKey", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastCommentCursor", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastError", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastReviewCommentCursor", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastReviewCursor", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prNumber", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reviewScope", typeName: "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DReviewScope_464dbc5abe", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["forge.watch.scope-identity"]),
    .init(wireName: "reviewScopeUnsupported", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "watchEnabled", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreePath", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = ["pr-watch.agent-required-when-enabled"]
  private enum CodingKeys: String, CodingKey {
    case activeThreadId = "activeThreadId"
    case agentKind = "agentKind"
    case autoMerge = "autoMerge"
    case blockedReason = "blockedReason"
    case config = "config"
    case headBranch = "headBranch"
    case lastCheckKey = "lastCheckKey"
    case lastCommentCursor = "lastCommentCursor"
    case lastError = "lastError"
    case lastReviewCommentCursor = "lastReviewCommentCursor"
    case lastReviewCursor = "lastReviewCursor"
    case prNumber = "prNumber"
    case projectId = "projectId"
    case reviewScope = "reviewScope"
    case reviewScopeUnsupported = "reviewScopeUnsupported"
    case watchEnabled = "watchEnabled"
    case worktreePath = "worktreePath"
  }
}

public typealias RouteprU2DWatchU2DReadResponseU2DWatch_55bad6da24 = RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_5093c62d05?

public struct RouteprU2DWatchU2DReadResponse_92ee84dada: Codable, Sendable, RemoteModelMetadata {
  public var watch: RemoteField<RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_5093c62d05>
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "watch", typeName: "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_5093c62d05", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["pr-watch.agent-required-when-enabled"]),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case watch = "watch"
  }
}

public struct RouteprU2DWatchU2DScopedU2DUpsertRequest_dcb895209e: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: RemoteField<String> = .missing
  public var autoMerge: Bool
  public var config: RemoteField<RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DConfig_f69100925f> = .missing
  public var headBranch: String
  public var prNumber: Int64
  public var projectId: String
  public var reviewScope: RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DReviewScope_464dbc5abe
  public var watchEnabled: Bool
  public var worktreePath: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "autoMerge", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DConfig_f69100925f", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "headBranch", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prNumber", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reviewScope", typeName: "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DReviewScope_464dbc5abe", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["forge.watch.scope-identity"]),
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
    case reviewScope = "reviewScope"
    case watchEnabled = "watchEnabled"
    case worktreePath = "worktreePath"
  }
}

public struct RouteprU2DWatchU2DScopedU2DUpsertResponse_03b0a880c7: Codable, Sendable, RemoteModelMetadata {
  public var watch: RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_5093c62d05
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "watch", typeName: "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_5093c62d05", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["pr-watch.agent-required-when-enabled"]),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case watch = "watch"
  }
}

public struct RouteprU2DWatchU2DUpsertRequest_39a57fc9a7: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: RemoteField<String> = .missing
  public var autoMerge: Bool
  public var config: RemoteField<RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DConfig_f69100925f> = .missing
  public var headBranch: String
  public var prNumber: Int64
  public var projectId: String
  public var watchEnabled: Bool
  public var worktreePath: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "autoMerge", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "RouteautomationsU2DSnapshotResponseU2DSchedulesU2DItemU2DConfig_f69100925f", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
  case `device` = "device"
  case `all` = "all"
}

public enum RouteprofileU2DCoreU2DStatsRequestU2DWindow_ae26bc52b7: String, Codable, Sendable {
  case `n7d` = "7d"
  case `n30d` = "30d"
  case `all` = "all"
}

public struct RouteprofileU2DCoreU2DStatsRequest_f76e77baae: Codable, Sendable, RemoteModelMetadata {
  public var deviceId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var provider: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var scope: RemoteField<RouteprofileU2DCoreU2DStatsRequestU2DScope_b99ee3af30> = .missing
  public var utcOffsetMinutes: Double
  public var window: RemoteField<RouteprofileU2DCoreU2DStatsRequestU2DWindow_ae26bc52b7> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "deviceId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "provider", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
  public var key: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var label: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var percent: Double
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "count", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "key", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
  case `commit` = "commit"
  case `pr` = "pr"
  case `conflict` = "conflict"
}
