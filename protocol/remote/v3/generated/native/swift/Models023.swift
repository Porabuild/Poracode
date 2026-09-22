// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4: Codable, Sendable, RemoteModelMetadata {
  public var active: Int64
  public var pending: Int64
  public var retiring: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "active", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pending", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "retiring", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case active = "active"
    case pending = "pending"
    case retiring = "retiring"
  }
}

public struct RoutemetricsResponseU2DHostResourceAdmissionU2DUsage_1618be77eb: Codable, Sendable, RemoteModelMetadata {
  public var agentSessions: RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4
  public var generationHelpers: RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4
  public var refusals: Int64
  public var terminalShells: RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4
  public var total: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentSessions", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "generationHelpers", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refusals", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "terminalShells", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DUsageU2DAgentSessions_402930e3e4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "total", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentSessions = "agentSessions"
    case generationHelpers = "generationHelpers"
    case refusals = "refusals"
    case terminalShells = "terminalShells"
    case total = "total"
  }
}

public struct RoutemetricsResponseU2DHostResourceAdmission_dd86988c80: Codable, Sendable, RemoteModelMetadata {
  public var gitProcesses: RemoteField<RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcesses_1146a35688> = .missing
  public var policy: RoutemetricsResponseU2DHostResourceAdmissionU2DPolicy_280719966e
  public var resolution: RoutemetricsResponseU2DHostResourceAdmissionU2DResolution_c0edab91e2
  public var usage: RoutemetricsResponseU2DHostResourceAdmissionU2DUsage_1618be77eb
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "gitProcesses", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcesses_1146a35688", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "policy", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DPolicy_280719966e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "resolution", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DResolution_c0edab91e2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "usage", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DUsage_1618be77eb", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case gitProcesses = "gitProcesses"
    case policy = "policy"
    case resolution = "resolution"
    case usage = "usage"
  }
}

public struct RoutemetricsResponseU2DProcess_9f6e05a566: Codable, Sendable, RemoteModelMetadata {
  public var heapUsedBytes: Int64
  public var rssBytes: Int64
  public var uptimeSeconds: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "heapUsedBytes", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "rssBytes", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "uptimeSeconds", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case heapUsedBytes = "heapUsedBytes"
    case rssBytes = "rssBytes"
    case uptimeSeconds = "uptimeSeconds"
  }
}

public struct RoutemetricsResponseU2DRemote_99cf08bb5d: Codable, Sendable, RemoteModelMetadata {
  public var activeWebSocketClients: Int64
  public var eventBufferEntries: Int64
  public var lastEventSeq: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "activeWebSocketClients", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "eventBufferEntries", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastEventSeq", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case activeWebSocketClients = "activeWebSocketClients"
    case eventBufferEntries = "eventBufferEntries"
    case lastEventSeq = "lastEventSeq"
  }
}

public struct RoutemetricsResponse_48bd6fd8c0: Codable, Sendable, RemoteModelMetadata {
  public var hostResourceAdmission: RemoteField<RoutemetricsResponseU2DHostResourceAdmission_dd86988c80> = .missing
  public var process: RoutemetricsResponseU2DProcess_9f6e05a566
  public var remote: RoutemetricsResponseU2DRemote_99cf08bb5d
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "hostResourceAdmission", typeName: "RoutemetricsResponseU2DHostResourceAdmission_dd86988c80", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "process", typeName: "RoutemetricsResponseU2DProcess_9f6e05a566", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "remote", typeName: "RoutemetricsResponseU2DRemote_99cf08bb5d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case hostResourceAdmission = "hostResourceAdmission"
    case process = "process"
    case remote = "remote"
  }
}

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
  case http = "http"
  case unknown = "unknown"
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

public struct RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd: Codable, Sendable, RemoteModelMetadata {
  public var effort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var fast: RemoteField<Bool> = .missing
  public var model: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "effort", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public struct RouteprU2DWatchU2DAgentU2DSyncRequest_43aa74a688: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: String
  public var config: RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd
  public var projectId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public enum RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReasonU2DOptionU2D1_f434bf2c3d: String, Codable, Sendable {
  case agentU2DUnavailable = "agent-unavailable"
  case worktreeU2DUnavailable = "worktree-unavailable"
}

public typealias RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReason_6a323d2278 = RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReasonU2DOptionU2D1_f434bf2c3d?

public struct RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_4e69a9e250: Codable, Sendable, RemoteModelMetadata {
  public var activeThreadId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public var agentKind: RemoteField<String> = .missing
  public var autoMerge: Bool
  public var blockedReason: RemoteField<RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReasonU2DOptionU2D1_f434bf2c3d>
  public var config: RemoteField<RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd> = .missing
  public var headBranch: String
  public var lastCheckKey: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public var lastCommentCursor: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public var lastError: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public var lastReviewCommentCursor: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public var lastReviewCursor: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b>
  public var prNumber: Int64
  public var projectId: String
  public var watchEnabled: Bool
  public var worktreePath: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "activeThreadId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "agentKind", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "autoMerge", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "blockedReason", typeName: "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1U2DBlockedReasonU2DOptionU2D1_f434bf2c3d", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "headBranch", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastCheckKey", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastCommentCursor", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastError", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastReviewCommentCursor", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastReviewCursor", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
    case watchEnabled = "watchEnabled"
    case worktreePath = "worktreePath"
  }
}

public typealias RouteprU2DWatchU2DReadResponseU2DWatch_1cd9a2d7dc = RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_4e69a9e250?

public struct RouteprU2DWatchU2DReadResponse_d5dfa02f74: Codable, Sendable, RemoteModelMetadata {
  public var watch: RemoteField<RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_4e69a9e250>
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "watch", typeName: "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_4e69a9e250", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["pr-watch.agent-required-when-enabled"]),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case watch = "watch"
  }
}

public struct RouteprU2DWatchU2DUpsertRequest_8be1194a62: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: RemoteField<String> = .missing
  public var autoMerge: Bool
  public var config: RemoteField<RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd> = .missing
  public var headBranch: String
  public var prNumber: Int64
  public var projectId: String
  public var watchEnabled: Bool
  public var worktreePath: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "autoMerge", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "RouteprU2DWatchU2DAgentU2DSyncRequestU2DConfig_048d1517dd", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public struct RouteprU2DWatchU2DUpsertResponse_7e3e58fba7: Codable, Sendable, RemoteModelMetadata {
  public var watch: RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_4e69a9e250
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "watch", typeName: "RouteprU2DWatchU2DReadResponseU2DWatchU2DOptionU2D1_4e69a9e250", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["pr-watch.agent-required-when-enabled"]),
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
