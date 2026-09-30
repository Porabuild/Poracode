// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironment_d832acd230: Codable, Sendable, RemoteModelMetadata {
  public var childIdentity: RemoteField<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DChildIdentity_1b0d78a343> = .missing
  public var createdAt: Int64
  public var credential: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DCredential_d06f3ce55d
  public var desired: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DDesired_abff99d05c
  public var environmentId: String
  public var label: String
  public var lastError: RemoteField<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DLastError_a03f50bc64> = .missing
  public var legacyConnectionIds: [String]
  public var port: RemoteField<Int64> = .missing
  public var revision: Int64
  public var runtime: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DRuntime_83671e6428
  public var state: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DState_2c13d2fc1c
  public var target: String
  public var trust: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrust_ecde1f3c1f
  public var updatedAt: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "childIdentity", typeName: "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DChildIdentity_1b0d78a343", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "createdAt", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "credential", typeName: "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DCredential_d06f3ce55d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "desired", typeName: "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DDesired_abff99d05c", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "environmentId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 100, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "lastError", typeName: "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DLastError_a03f50bc64", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "legacyConnectionIds", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "port", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 65535, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "revision", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtime", typeName: "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DRuntime_83671e6428", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "state", typeName: "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DState_2c13d2fc1c", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "target", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 255, minItems: nil, maxItems: nil, pattern: "^(?!-)(?:[^\\s@/:]+@)?[^\\s@/:]+$", format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "trust", typeName: "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrust_ecde1f3c1f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "updatedAt", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case childIdentity = "childIdentity"
    case createdAt = "createdAt"
    case credential = "credential"
    case desired = "desired"
    case environmentId = "environmentId"
    case label = "label"
    case lastError = "lastError"
    case legacyConnectionIds = "legacyConnectionIds"
    case port = "port"
    case revision = "revision"
    case runtime = "runtime"
    case state = "state"
    case target = "target"
    case trust = "trust"
    case updatedAt = "updatedAt"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.childIdentity = try container.decode(RemoteField<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DChildIdentity_1b0d78a343>.self, forKey: .childIdentity)
    self.createdAt = try container.decode(Int64.self, forKey: .createdAt)
    self.credential = try container.decode(RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DCredential_d06f3ce55d.self, forKey: .credential)
    self.desired = try container.decode(RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DDesired_abff99d05c.self, forKey: .desired)
    self.environmentId = try container.decode(String.self, forKey: .environmentId)
    self.label = try container.decode(String.self, forKey: .label)
    self.lastError = try container.decode(RemoteField<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DLastError_a03f50bc64>.self, forKey: .lastError)
    self.legacyConnectionIds = try container.decode([String].self, forKey: .legacyConnectionIds)
    self.port = try container.decode(RemoteField<Int64>.self, forKey: .port)
    self.revision = try container.decode(Int64.self, forKey: .revision)
    self.runtime = try container.decode(RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DRuntime_83671e6428.self, forKey: .runtime)
    self.state = try container.decode(RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DState_2c13d2fc1c.self, forKey: .state)
    self.target = try container.decode(String.self, forKey: .target)
    self.trust = try container.decode(RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrust_ecde1f3c1f.self, forKey: .trust)
    self.updatedAt = try container.decode(Int64.self, forKey: .updatedAt)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(childIdentity, forKey: .childIdentity)
    try container.encode(createdAt, forKey: .createdAt)
    try container.encode(credential, forKey: .credential)
    try container.encode(desired, forKey: .desired)
    try container.encode(environmentId, forKey: .environmentId)
    try container.encode(label, forKey: .label)
    try container.encode(lastError, forKey: .lastError)
    try container.encode(legacyConnectionIds, forKey: .legacyConnectionIds)
    try container.encode(port, forKey: .port)
    try container.encode(revision, forKey: .revision)
    try container.encode(runtime, forKey: .runtime)
    try container.encode(state, forKey: .state)
    try container.encode(target, forKey: .target)
    try container.encode(trust, forKey: .trust)
    try container.encode(updatedAt, forKey: .updatedAt)
  }
}

public struct RouteenvironmentU2DAdoptU2DLegacyResponse_8428abfcec: Codable, Sendable, RemoteModelMetadata {
  public var environment: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironment_d832acd230
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "environment", typeName: "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironment_d832acd230", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case environment = "environment"
  }
}

public struct RouteenvironmentU2DCreateRequest_ccc27289c7: Codable, Sendable, RemoteModelMetadata {
  public var credentialRef: RemoteField<String> = .missing
  public var desired: RemoteField<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DDesired_abff99d05c> = .missing
  public var label: String
  public var legacyConnectionId: RemoteField<String> = .missing
  public var port: RemoteField<Int64> = .missing
  public var target: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "credentialRef", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: "^(?!.*\\.\\.)[A-Za-z0-9][A-Za-z0-9._:-]*$", format: nil, semanticValidatorIds: []),
    .init(wireName: "desired", typeName: "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DDesired_abff99d05c", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 100, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "legacyConnectionId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "port", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 65535, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "target", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 255, minItems: nil, maxItems: nil, pattern: "^(?!-)(?:[^\\s@/:]+@)?[^\\s@/:]+$", format: nil, semanticValidatorIds: ["string.trim"]),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case credentialRef = "credentialRef"
    case desired = "desired"
    case label = "label"
    case legacyConnectionId = "legacyConnectionId"
    case port = "port"
    case target = "target"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.credentialRef = try container.decode(RemoteField<String>.self, forKey: .credentialRef)
    self.desired = try container.decode(RemoteField<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DDesired_abff99d05c>.self, forKey: .desired)
    self.label = try container.decode(String.self, forKey: .label)
    self.legacyConnectionId = try container.decode(RemoteField<String>.self, forKey: .legacyConnectionId)
    self.port = try container.decode(RemoteField<Int64>.self, forKey: .port)
    self.target = try container.decode(String.self, forKey: .target)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(credentialRef, forKey: .credentialRef)
    try container.encode(desired, forKey: .desired)
    try container.encode(label, forKey: .label)
    try container.encode(legacyConnectionId, forKey: .legacyConnectionId)
    try container.encode(port, forKey: .port)
    try container.encode(target, forKey: .target)
  }
}

public struct RouteenvironmentU2DDeleteRequest_939b432562: Codable, Sendable, RemoteModelMetadata {
  public var expectedRevision: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "expectedRevision", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case expectedRevision = "expectedRevision"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.expectedRevision = try container.decode(Int64.self, forKey: .expectedRevision)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(expectedRevision, forKey: .expectedRevision)
  }
}

public struct RouteenvironmentU2DDeleteResponse_badd682f35: Codable, Sendable, RemoteModelMetadata {
  public var ok: ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "ok", typeName: "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case ok = "ok"
  }
}

public enum RouteenvironmentU2DLegacyResponseU2DAuthU2DBootstrapMethodsU2DItem_0dd86a486b: String, Codable, Sendable {
  case oneU2DTimeU2DToken = "one-time-token"
}

public enum RouteenvironmentU2DLegacyResponseU2DAuthU2DPolicy_995ee3e349: String, Codable, Sendable {
  case remoteU2DReachable = "remote-reachable"
}

public enum RouteenvironmentU2DLegacyResponseU2DAuthU2DSessionMethodsU2DItem_b5e66c2e96: String, Codable, Sendable {
  case bearerU2DAccessU2DToken = "bearer-access-token"
}

public struct RouteenvironmentU2DLegacyResponseU2DAuth_2a8bc62fab: Codable, Sendable, RemoteModelMetadata {
  public var bootstrapMethods: [RouteenvironmentU2DLegacyResponseU2DAuthU2DBootstrapMethodsU2DItem_0dd86a486b]
  public var policy: RouteenvironmentU2DLegacyResponseU2DAuthU2DPolicy_995ee3e349
  public var scopes: [String]
  public var sessionMethods: [RouteenvironmentU2DLegacyResponseU2DAuthU2DSessionMethodsU2DItem_b5e66c2e96]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "bootstrapMethods", typeName: "[RouteenvironmentU2DLegacyResponseU2DAuthU2DBootstrapMethodsU2DItem_0dd86a486b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "policy", typeName: "RouteenvironmentU2DLegacyResponseU2DAuthU2DPolicy_995ee3e349", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scopes", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sessionMethods", typeName: "[RouteenvironmentU2DLegacyResponseU2DAuthU2DSessionMethodsU2DItem_b5e66c2e96]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case bootstrapMethods = "bootstrapMethods"
    case policy = "policy"
    case scopes = "scopes"
    case sessionMethods = "sessionMethods"
  }
}

public struct RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574: Codable, Sendable, RemoteModelMetadata {
  public var versions: [Int64]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "versions", typeName: "[Int64]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 1, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case versions = "versions"
  }
}

public struct RouteenvironmentU2DLegacyResponseU2DCapabilities_be2c1cee8c: Codable, Sendable, RemoteModelMetadata {
  public var boundedCatalogChanges: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = .missing
  public var browserForward: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = .missing
  public var catalogMutations: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = .missing
  public var experiments: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = .missing
  public var projectCommandResults: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = .missing
  public var pushRouting: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = .missing
  public var runtimeHistoryNotices: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = .missing
  public var sshEnvironments: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = .missing
  public var terminalCursorSync: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = .missing
  public var threadLaunchMetadata: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "boundedCatalogChanges", typeName: "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "browserForward", typeName: "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "catalogMutations", typeName: "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "experiments", typeName: "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectCommandResults", typeName: "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pushRouting", typeName: "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeHistoryNotices", typeName: "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sshEnvironments", typeName: "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "terminalCursorSync", typeName: "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadLaunchMetadata", typeName: "RouteenvironmentU2DLegacyResponseU2DCapabilitiesU2DBoundedCatalogChanges_a9266ff574", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case boundedCatalogChanges = "boundedCatalogChanges"
    case browserForward = "browserForward"
    case catalogMutations = "catalogMutations"
    case experiments = "experiments"
    case projectCommandResults = "projectCommandResults"
    case pushRouting = "pushRouting"
    case runtimeHistoryNotices = "runtimeHistoryNotices"
    case sshEnvironments = "sshEnvironments"
    case terminalCursorSync = "terminalCursorSync"
    case threadLaunchMetadata = "threadLaunchMetadata"
  }
}

public struct RouteenvironmentU2DLegacyResponseU2DEndpoints_17c2b8a253: Codable, Sendable, RemoteModelMetadata {
  public var httpBaseUrl: String
  public var wsBaseUrl: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "httpBaseUrl", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: "uri", semanticValidatorIds: []),
    .init(wireName: "wsBaseUrl", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: "uri", semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case httpBaseUrl = "httpBaseUrl"
    case wsBaseUrl = "wsBaseUrl"
  }
}

public enum RouteenvironmentU2DLegacyResponseU2DHostMode_d1d1696e7d: String, Codable, Sendable {
  case desktop = "desktop"
  case helper = "helper"
}

public enum RouteenvironmentU2DLegacyResponseU2DPlatform_7583b8d37f: String, Codable, Sendable {
  case win32 = "win32"
  case darwin = "darwin"
  case linux = "linux"
}

public typealias RouteenvironmentU2DLegacyResponseU2DProtocolVersion_1f7ce34362 = Double

public struct RouteenvironmentU2DLegacyResponse_19e9e349fb: Codable, Sendable, RemoteModelMetadata {
  public var appVersion: String
  public var auth: RouteenvironmentU2DLegacyResponseU2DAuth_2a8bc62fab
  public var capabilities: RemoteField<RouteenvironmentU2DLegacyResponseU2DCapabilities_be2c1cee8c> = .missing
  public var desktopId: String
  public var endpoints: RouteenvironmentU2DLegacyResponseU2DEndpoints_17c2b8a253
  public var hostMode: RemoteField<RouteenvironmentU2DLegacyResponseU2DHostMode_d1d1696e7d> = .missing
  public var label: String
  public var platform: RemoteField<RouteenvironmentU2DLegacyResponseU2DPlatform_7583b8d37f> = .missing
  public var protocolVersion: RouteenvironmentU2DLegacyResponseU2DProtocolVersion_1f7ce34362
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "appVersion", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "auth", typeName: "RouteenvironmentU2DLegacyResponseU2DAuth_2a8bc62fab", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "capabilities", typeName: "RouteenvironmentU2DLegacyResponseU2DCapabilities_be2c1cee8c", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "desktopId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "endpoints", typeName: "RouteenvironmentU2DLegacyResponseU2DEndpoints_17c2b8a253", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "hostMode", typeName: "RouteenvironmentU2DLegacyResponseU2DHostMode_d1d1696e7d", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "platform", typeName: "RouteenvironmentU2DLegacyResponseU2DPlatform_7583b8d37f", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "protocolVersion", typeName: "RouteenvironmentU2DLegacyResponseU2DProtocolVersion_1f7ce34362", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case appVersion = "appVersion"
    case auth = "auth"
    case capabilities = "capabilities"
    case desktopId = "desktopId"
    case endpoints = "endpoints"
    case hostMode = "hostMode"
    case label = "label"
    case platform = "platform"
    case protocolVersion = "protocolVersion"
  }
}

public struct RouteenvironmentU2DListResponse_700ee4302b: Codable, Sendable, RemoteModelMetadata {
  public var environments: [RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironment_d832acd230]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "environments", typeName: "[RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironment_d832acd230]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 1000, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case environments = "environments"
  }
}

public struct RouteenvironmentU2DPairingResponseU2DPairing_3f3680e577: Codable, Sendable, RemoteModelMetadata {
  public var childDesktopId: String
  public var endpoint: String
  public var environmentId: String
  public var pairingCredential: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "childDesktopId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 256, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "endpoint", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 512, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "environmentId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "pairingCredential", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 512, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case childDesktopId = "childDesktopId"
    case endpoint = "endpoint"
    case environmentId = "environmentId"
    case pairingCredential = "pairingCredential"
  }
}

public struct RouteenvironmentU2DPairingResponse_4a927b60e4: Codable, Sendable, RemoteModelMetadata {
  public var pairing: RouteenvironmentU2DPairingResponseU2DPairing_3f3680e577
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "pairing", typeName: "RouteenvironmentU2DPairingResponseU2DPairing_3f3680e577", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case pairing = "pairing"
  }
}

public struct RouteenvironmentU2DTrustU2DAcceptRequest_67373e1601: Codable, Sendable, RemoteModelMetadata {
  public var expectedRevision: Int64
  public var fingerprint: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "expectedRevision", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fingerprint", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^SHA256:[A-Za-z0-9+/]{43}$", format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case expectedRevision = "expectedRevision"
    case fingerprint = "fingerprint"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.expectedRevision = try container.decode(Int64.self, forKey: .expectedRevision)
    self.fingerprint = try container.decode(String.self, forKey: .fingerprint)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(expectedRevision, forKey: .expectedRevision)
    try container.encode(fingerprint, forKey: .fingerprint)
  }
}

public struct RouteenvironmentU2DTrustU2DProbeResponse_45d8e163d2: Codable, Sendable, RemoteModelMetadata {
  public var fingerprint: String
  public var keyType: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "fingerprint", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^SHA256:[A-Za-z0-9+/]{43}$", format: nil, semanticValidatorIds: []),
    .init(wireName: "keyType", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 64, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case fingerprint = "fingerprint"
    case keyType = "keyType"
  }
}

public typealias RouteenvironmentU2DUpdateRequestU2DPatchU2DCredentialRef_c223d7ef6a = String?

public typealias RouteenvironmentU2DUpdateRequestU2DPatchU2DPort_6db9f33ca9 = Int64?
