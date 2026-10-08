// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DLastError_a03f50bc64: Codable, Sendable, RemoteModelMetadata {
  public var code: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DLastErrorU2DCode_2fbfd962f5
  public var fingerprint: RemoteField<String> = .missing
  public var keyType: RemoteField<String> = .missing
  public var message: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "code", typeName: "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DLastErrorU2DCode_2fbfd962f5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fingerprint", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^SHA256:[A-Za-z0-9+/]{43}$", format: nil, semanticValidatorIds: []),
    .init(wireName: "keyType", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 64, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "message", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 240, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case code = "code"
    case fingerprint = "fingerprint"
    case keyType = "keyType"
    case message = "message"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.code = try container.decode(RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DLastErrorU2DCode_2fbfd962f5.self, forKey: .code)
    self.fingerprint = try container.decode(RemoteField<String>.self, forKey: .fingerprint)
    self.keyType = try container.decode(RemoteField<String>.self, forKey: .keyType)
    self.message = try container.decode(String.self, forKey: .message)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(code, forKey: .code)
    try container.encode(fingerprint, forKey: .fingerprint)
    try container.encode(keyType, forKey: .keyType)
    try container.encode(message, forKey: .message)
  }
}

public struct RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DRuntime_83671e6428: Codable, Sendable, RemoteModelMetadata {
  public var appVersion: RemoteField<String> = .missing
  public var hash: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "appVersion", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 64, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "hash", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^[a-f0-9]{64}$", format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case appVersion = "appVersion"
    case hash = "hash"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.appVersion = try container.decode(RemoteField<String>.self, forKey: .appVersion)
    self.hash = try container.decode(String.self, forKey: .hash)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(appVersion, forKey: .appVersion)
    try container.encode(hash, forKey: .hash)
  }
}

public enum RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DState_2c13d2fc1c: String, Codable, Sendable {
  case disconnected = "disconnected"
  case connecting = "connecting"
  case connected = "connected"
  case error = "error"
  case credentialU2DMissing = "credential-missing"
  case ownerU2DUnverified = "owner-unverified"
  case identityU2DChanged = "identity-changed"
  case hostkeyU2DMismatch = "hostkey-mismatch"
  case needsU2DRepair = "needs-repair"
  case trustU2DRequired = "trust-required"
}

public enum RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D1U2DState_7ee0d4255f: String, Codable, Sendable {
  case unknown = "unknown"
}

public struct RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D1_1fb6f9ae5f: Codable, Sendable, RemoteModelMetadata {
  public var state: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D1U2DState_7ee0d4255f
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "state", typeName: "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D1U2DState_7ee0d4255f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case state = "state"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.state = try container.decode(RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D1U2DState_7ee0d4255f.self, forKey: .state)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(state, forKey: .state)
  }
}

public enum RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D2U2DState_f6c555fb5f: String, Codable, Sendable {
  case observed = "observed"
}

public struct RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D2_6f5cce5ce1: Codable, Sendable, RemoteModelMetadata {
  public var observedFingerprint: String
  public var state: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D2U2DState_f6c555fb5f
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "observedFingerprint", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^SHA256:[A-Za-z0-9+/]{43}$", format: nil, semanticValidatorIds: []),
    .init(wireName: "state", typeName: "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D2U2DState_f6c555fb5f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case observedFingerprint = "observedFingerprint"
    case state = "state"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.observedFingerprint = try container.decode(String.self, forKey: .observedFingerprint)
    self.state = try container.decode(RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D2U2DState_f6c555fb5f.self, forKey: .state)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(observedFingerprint, forKey: .observedFingerprint)
    try container.encode(state, forKey: .state)
  }
}

public enum RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D3U2DState_eaed5114fa: String, Codable, Sendable {
  case pinned = "pinned"
}

public struct RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D3_e213e5cbde: Codable, Sendable, RemoteModelMetadata {
  public var hostKeyFingerprint: String
  public var observedFingerprint: RemoteField<String> = .missing
  public var state: RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D3U2DState_eaed5114fa
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "hostKeyFingerprint", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^SHA256:[A-Za-z0-9+/]{43}$", format: nil, semanticValidatorIds: []),
    .init(wireName: "observedFingerprint", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^SHA256:[A-Za-z0-9+/]{43}$", format: nil, semanticValidatorIds: []),
    .init(wireName: "state", typeName: "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D3U2DState_eaed5114fa", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case hostKeyFingerprint = "hostKeyFingerprint"
    case observedFingerprint = "observedFingerprint"
    case state = "state"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.hostKeyFingerprint = try container.decode(String.self, forKey: .hostKeyFingerprint)
    self.observedFingerprint = try container.decode(RemoteField<String>.self, forKey: .observedFingerprint)
    self.state = try container.decode(RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D3U2DState_eaed5114fa.self, forKey: .state)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(hostKeyFingerprint, forKey: .hostKeyFingerprint)
    try container.encode(observedFingerprint, forKey: .observedFingerprint)
    try container.encode(state, forKey: .state)
  }
}

public enum RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrust_ecde1f3c1f: Codable, Sendable {
  case option1(RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D1_1fb6f9ae5f)
  case option2(RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D2_6f5cce5ce1)
  case option3(RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D3_e213e5cbde)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrust_ecde1f3c1f)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "state", literals: [.string("unknown")]), let value = try? container.decode(RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D1_1fb6f9ae5f.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "state", literals: [.string("observed")]), let value = try? container.decode(RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D2_6f5cce5ce1.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "state", literals: [.string("pinned")]), let value = try? container.decode(RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrustU2DOptionU2D3_e213e5cbde.self) {
      matches.append((3, .option3(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrust_ecde1f3c1f" : "Ambiguous union RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrust_ecde1f3c1f matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DTrust_ecde1f3c1f.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
