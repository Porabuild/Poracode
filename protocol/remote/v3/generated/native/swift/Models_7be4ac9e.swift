// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DChildIdentity_1b0d78a343: Codable, Sendable, RemoteModelMetadata {
  public var desktopId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "desktopId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case desktopId = "desktopId"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.desktopId = try container.decode(String.self, forKey: .desktopId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(desktopId, forKey: .desktopId)
  }
}

public enum RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DCredential_d06f3ce55d: String, Codable, Sendable {
  case `configured` = "configured"
  case `none` = "none"
}

public enum RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DDesired_abff99d05c: String, Codable, Sendable {
  case `enabled` = "enabled"
  case `disabled` = "disabled"
}

public enum RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DLastErrorU2DCode_2fbfd962f5: String, Codable, Sendable {
  case `environmentU2FNotU2DFound` = "environment/not-found"
  case `environmentU2FRevisionU2DConflict` = "environment/revision-conflict"
  case `environmentU2FStoreU2DBusy` = "environment/store-busy"
  case `environmentU2FStoreU2DLimit` = "environment/store-limit"
  case `environmentU2FStoreU2DUnavailable` = "environment/store-unavailable"
  case `environmentU2FInvalidU2DInput` = "environment/invalid-input"
  case `environmentU2FNotU2DConnected` = "environment/not-connected"
  case `environmentU2FTrustU2DRequired` = "environment/trust-required"
  case `environmentU2FTrustU2DChanged` = "environment/trust-changed"
  case `environmentU2FTrustU2DMismatch` = "environment/trust-mismatch"
  case `environmentU2FHostkeyU2DMismatch` = "environment/hostkey-mismatch"
  case `environmentU2FIdentityU2DChanged` = "environment/identity-changed"
  case `environmentU2FCredentialU2DMissing` = "environment/credential-missing"
  case `environmentU2FOwnerU2DUnverified` = "environment/owner-unverified"
  case `environmentU2FOwnerU2DUnresponsive` = "environment/owner-unresponsive"
  case `environmentU2FOwnerU2DIncompatible` = "environment/owner-incompatible"
  case `environmentU2FOwnerU2DBusy` = "environment/owner-busy"
  case `environmentU2FOwnerU2DConflict` = "environment/owner-conflict"
  case `environmentU2FLaunchU2DFailed` = "environment/launch-failed"
  case `environmentU2FUpgradeU2DUnavailable` = "environment/upgrade-unavailable"
  case `environmentU2FUpgradeU2DRefused` = "environment/upgrade-refused"
  case `environmentU2FTransportU2DError` = "environment/transport-error"
  case `environmentU2FCancelled` = "environment/cancelled"
  case `environmentU2FInternalU2DError` = "environment/internal-error"
  case `environmentU2FNotU2DAuthorized` = "environment/not-authorized"
}

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
