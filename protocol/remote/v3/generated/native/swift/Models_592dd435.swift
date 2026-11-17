// GENERATED FILE. Do not edit by hand.
import Foundation
public enum RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D4U2DType_4311a74add: String, Codable, Sendable {
  case `orientation` = "orientation"
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D4U2DValue_d61b01c8cb: String, Codable, Sendable {
  case `portrait` = "portrait"
  case `landscapeLeft` = "landscapeLeft"
  case `upsideDown` = "upsideDown"
  case `landscapeRight` = "landscapeRight"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D4_feff20c88b: Codable, Sendable, RemoteModelMetadata {
  public var typeValue: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D4U2DType_4311a74add
  public var value: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D4U2DValue_d61b01c8cb
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "type", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D4U2DType_4311a74add", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "value", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D4U2DValue_d61b01c8cb", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case typeValue = "type"
    case value = "value"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.typeValue = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D4U2DType_4311a74add.self, forKey: .typeValue)
    self.value = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D4U2DValue_d61b01c8cb.self, forKey: .value)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(typeValue, forKey: .typeValue)
    try container.encode(value, forKey: .value)
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D5U2DType_3ac0e8087f: String, Codable, Sendable {
  case `reduceMotion` = "reduceMotion"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D5_ca98effeea: Codable, Sendable, RemoteModelMetadata {
  public var enabled: Bool
  public var typeValue: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D5U2DType_3ac0e8087f
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "enabled", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D5U2DType_3ac0e8087f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case enabled = "enabled"
    case typeValue = "type"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.enabled = try container.decode(Bool.self, forKey: .enabled)
    self.typeValue = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D5U2DType_3ac0e8087f.self, forKey: .typeValue)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(enabled, forKey: .enabled)
    try container.encode(typeValue, forKey: .typeValue)
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D6U2DType_d4757acfcd: String, Codable, Sendable {
  case `network` = "network"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D6_596b826e91: Codable, Sendable, RemoteModelMetadata {
  public var enabled: Bool
  public var typeValue: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D6U2DType_d4757acfcd
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "enabled", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D6U2DType_d4757acfcd", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case enabled = "enabled"
    case typeValue = "type"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.enabled = try container.decode(Bool.self, forKey: .enabled)
    self.typeValue = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D6U2DType_d4757acfcd.self, forKey: .typeValue)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(enabled, forKey: .enabled)
    try container.encode(typeValue, forKey: .typeValue)
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D7U2DType_1a0723da99: String, Codable, Sendable {
  case `location` = "location"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D7_dfbf83bd74: Codable, Sendable, RemoteModelMetadata {
  public var latitude: Double
  public var longitude: Double
  public var typeValue: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D7U2DType_1a0723da99
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "latitude", typeName: "Double", required: true, nullable: false, minimum: -90, maximum: 90, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "longitude", typeName: "Double", required: true, nullable: false, minimum: -180, maximum: 180, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D7U2DType_1a0723da99", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case latitude = "latitude"
    case longitude = "longitude"
    case typeValue = "type"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.latitude = try container.decode(Double.self, forKey: .latitude)
    self.longitude = try container.decode(Double.self, forKey: .longitude)
    self.typeValue = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D7U2DType_1a0723da99.self, forKey: .typeValue)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(latitude, forKey: .latitude)
    try container.encode(longitude, forKey: .longitude)
    try container.encode(typeValue, forKey: .typeValue)
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D8U2DDecision_ff4e0a6efa: String, Codable, Sendable {
  case `grant` = "grant"
  case `revoke` = "revoke"
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D8U2DPermission_f6dd22a2a9: String, Codable, Sendable {
  case `camera` = "camera"
  case `microphone` = "microphone"
  case `photos` = "photos"
  case `contacts` = "contacts"
  case `calendar` = "calendar"
  case `location` = "location"
  case `notifications` = "notifications"
  case `motion` = "motion"
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D8U2DType_592634b895: String, Codable, Sendable {
  case `permission` = "permission"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D8_861b7e521a: Codable, Sendable, RemoteModelMetadata {
  public var applicationId: String
  public var decision: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D8U2DDecision_ff4e0a6efa
  public var permission: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D8U2DPermission_f6dd22a2a9
  public var typeValue: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D8U2DType_592634b895
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "applicationId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 3, maxLength: 255, minItems: nil, maxItems: nil, pattern: "^[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+$", format: nil, semanticValidatorIds: []),
    .init(wireName: "decision", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D8U2DDecision_ff4e0a6efa", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "permission", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D8U2DPermission_f6dd22a2a9", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D8U2DType_592634b895", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case applicationId = "applicationId"
    case decision = "decision"
    case permission = "permission"
    case typeValue = "type"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.applicationId = try container.decode(String.self, forKey: .applicationId)
    self.decision = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D8U2DDecision_ff4e0a6efa.self, forKey: .decision)
    self.permission = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D8U2DPermission_f6dd22a2a9.self, forKey: .permission)
    self.typeValue = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D8U2DType_592634b895.self, forKey: .typeValue)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(applicationId, forKey: .applicationId)
    try container.encode(decision, forKey: .decision)
    try container.encode(permission, forKey: .permission)
    try container.encode(typeValue, forKey: .typeValue)
  }
}
