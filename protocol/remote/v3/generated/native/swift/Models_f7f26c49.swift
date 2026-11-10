// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcesses_f80bf20556: Codable, Sendable, RemoteModelMetadata {
  public var admitted: Int64
  public var cancellations: Int64
  public var environments: RemoteField<RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironments_2f4c1755c2> = .missing
  public var long: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DLong_164937b9a5
  public var queueFullRefusals: Int64
  public var short: RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DLong_164937b9a5
  public var slowFetches: RemoteField<Int64> = .missing
  public var waitTimeoutRefusals: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "admitted", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cancellations", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "environments", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DEnvironments_2f4c1755c2", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "long", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DLong_164937b9a5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "queueFullRefusals", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "short", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcessesU2DLong_164937b9a5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "slowFetches", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "waitTimeoutRefusals", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case admitted = "admitted"
    case cancellations = "cancellations"
    case environments = "environments"
    case long = "long"
    case queueFullRefusals = "queueFullRefusals"
    case short = "short"
    case slowFetches = "slowFetches"
    case waitTimeoutRefusals = "waitTimeoutRefusals"
  }
}

public struct RoutemetricsResponseU2DHostResourceAdmissionU2DPolicy_280719966e: Codable, Sendable, RemoteModelMetadata {
  public var maxActiveAgentSessions: Int64
  public var maxActiveGenerationHelpers: Int64
  public var maxActiveTerminalShells: Int64
  public var overloadRetryAfterMs: Int64
  public var refuseNewStarts: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "maxActiveAgentSessions", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxActiveGenerationHelpers", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "maxActiveTerminalShells", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "overloadRetryAfterMs", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refuseNewStarts", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case maxActiveAgentSessions = "maxActiveAgentSessions"
    case maxActiveGenerationHelpers = "maxActiveGenerationHelpers"
    case maxActiveTerminalShells = "maxActiveTerminalShells"
    case overloadRetryAfterMs = "overloadRetryAfterMs"
    case refuseNewStarts = "refuseNewStarts"
  }
}

public enum RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DKind_cd6770504a: String, Codable, Sendable {
  case `configured` = "configured"
  case `absent` = "absent"
  case `missing` = "missing"
  case `retained` = "retained"
  case `unavailable` = "unavailable"
}

public enum RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DProblem_6ef72b13e3: String, Codable, Sendable {
  case `settingsU2DDocumentU2DUnreadable` = "settings-document-unreadable"
  case `settingsU2DDocumentU2DUnparseable` = "settings-document-unparseable"
  case `settingsU2DDocumentU2DNotU2DObject` = "settings-document-not-object"
  case `hostU2DResourceU2DAdmissionU2DInvalid` = "host-resource-admission-invalid"
}

public struct RoutemetricsResponseU2DHostResourceAdmissionU2DResolution_c0edab91e2: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DKind_cd6770504a
  public var problem: RemoteField<RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DProblem_6ef72b13e3> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DKind_cd6770504a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "problem", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DResolutionU2DProblem_6ef72b13e3", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case problem = "problem"
  }
}

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

public struct RoutemetricsResponseU2DHostResourceAdmission_710b6ecb78: Codable, Sendable, RemoteModelMetadata {
  public var gitProcesses: RemoteField<RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcesses_f80bf20556> = .missing
  public var policy: RoutemetricsResponseU2DHostResourceAdmissionU2DPolicy_280719966e
  public var resolution: RoutemetricsResponseU2DHostResourceAdmissionU2DResolution_c0edab91e2
  public var usage: RoutemetricsResponseU2DHostResourceAdmissionU2DUsage_1618be77eb
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "gitProcesses", typeName: "RoutemetricsResponseU2DHostResourceAdmissionU2DGitProcesses_f80bf20556", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
