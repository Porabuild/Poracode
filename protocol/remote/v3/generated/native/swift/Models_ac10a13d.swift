// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteenvironmentU2DUpdateRequestU2DPatch_2a5c67603f: Codable, Sendable, RemoteModelMetadata {
  public var credentialRef: RemoteField<String> = .missing
  public var desired: RemoteField<RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DDesired_abff99d05c> = .missing
  public var label: RemoteField<String> = .missing
  public var port: RemoteField<Int64> = .missing
  public var target: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "credentialRef", typeName: "String", required: false, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: "^(?!.*\\.\\.)[A-Za-z0-9][A-Za-z0-9._:-]*$", format: nil, semanticValidatorIds: []),
    .init(wireName: "desired", typeName: "RouteenvironmentU2DAdoptU2DLegacyResponseU2DEnvironmentU2DDesired_abff99d05c", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 100, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "port", typeName: "Int64", required: false, nullable: true, minimum: 1, maximum: 65535, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "target", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 255, minItems: nil, maxItems: nil, pattern: "^(?!-)(?:[^\\s@/:]+@)?[^\\s@/:]+$", format: nil, semanticValidatorIds: ["string.trim"]),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case credentialRef = "credentialRef"
    case desired = "desired"
    case label = "label"
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
    self.label = try container.decode(RemoteField<String>.self, forKey: .label)
    self.port = try container.decode(RemoteField<Int64>.self, forKey: .port)
    self.target = try container.decode(RemoteField<String>.self, forKey: .target)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(credentialRef, forKey: .credentialRef)
    try container.encode(desired, forKey: .desired)
    try container.encode(label, forKey: .label)
    try container.encode(port, forKey: .port)
    try container.encode(target, forKey: .target)
  }
}

public struct RouteenvironmentU2DUpdateRequest_5760038b3a: Codable, Sendable, RemoteModelMetadata {
  public var expectedRevision: Int64
  public var patch: RouteenvironmentU2DUpdateRequestU2DPatch_2a5c67603f
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "expectedRevision", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "patch", typeName: "RouteenvironmentU2DUpdateRequestU2DPatch_2a5c67603f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case expectedRevision = "expectedRevision"
    case patch = "patch"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.expectedRevision = try container.decode(Int64.self, forKey: .expectedRevision)
    self.patch = try container.decode(RouteenvironmentU2DUpdateRequestU2DPatch_2a5c67603f.self, forKey: .patch)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(expectedRevision, forKey: .expectedRevision)
    try container.encode(patch, forKey: .patch)
  }
}

public struct RouteenvironmentU2DWebsocketU2DTicketResponse_b9dfb5a053: Codable, Sendable, RemoteModelMetadata {
  public var expiresAt: String
  public var ticket: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "expiresAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ticket", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case expiresAt = "expiresAt"
    case ticket = "ticket"
  }
}
