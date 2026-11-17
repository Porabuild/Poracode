// GENERATED FILE. Do not edit by hand.
import Foundation
public enum RoutedeviceU2DActionRequestU2DOptionU2D4U2DKind_14221269d8: String, Codable, Sendable {
  case `key` = "key"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D4_83384e1a09: Codable, Sendable, RemoteModelMetadata {
  public var key: RoutedeviceU2DActionRequestU2DOptionU2D4U2DKey_35c107fafb
  public var kind: RoutedeviceU2DActionRequestU2DOptionU2D4U2DKind_14221269d8
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "key", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D4U2DKey_35c107fafb", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D4U2DKind_14221269d8", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case key = "key"
    case kind = "kind"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.key = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D4U2DKey_35c107fafb.self, forKey: .key)
    self.kind = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D4U2DKind_14221269d8.self, forKey: .kind)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(key, forKey: .key)
    try container.encode(kind, forKey: .kind)
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D5U2DKind_60fc988aef: String, Codable, Sendable {
  case `start` = "start"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D5_a36830c34a: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutedeviceU2DActionRequestU2DOptionU2D5U2DKind_60fc988aef
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D5U2DKind_60fc988aef", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.kind = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D5U2DKind_60fc988aef.self, forKey: .kind)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(kind, forKey: .kind)
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D6U2DKind_6c7cb6fb41: String, Codable, Sendable {
  case `fold` = "fold"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D6_452106e10e: Codable, Sendable, RemoteModelMetadata {
  public var angle: Int64
  public var kind: RoutedeviceU2DActionRequestU2DOptionU2D6U2DKind_6c7cb6fb41
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "angle", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 180, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D6U2DKind_6c7cb6fb41", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case angle = "angle"
    case kind = "kind"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.angle = try container.decode(Int64.self, forKey: .angle)
    self.kind = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DKind_6c7cb6fb41.self, forKey: .kind)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(angle, forKey: .angle)
    try container.encode(kind, forKey: .kind)
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D10U2DType_bd9ee7d624: String, Codable, Sendable {
  case `launchApp` = "launchApp"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D10_14f3c332d5: Codable, Sendable, RemoteModelMetadata {
  public var applicationId: String
  public var typeValue: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D10U2DType_bd9ee7d624
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "applicationId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 3, maxLength: 255, minItems: nil, maxItems: nil, pattern: "^[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+$", format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D10U2DType_bd9ee7d624", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case applicationId = "applicationId"
    case typeValue = "type"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.applicationId = try container.decode(String.self, forKey: .applicationId)
    self.typeValue = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D10U2DType_bd9ee7d624.self, forKey: .typeValue)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(applicationId, forKey: .applicationId)
    try container.encode(typeValue, forKey: .typeValue)
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D11U2DType_d585eadabc: String, Codable, Sendable {
  case `powerOff` = "powerOff"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D11_fd4fd2eb41: Codable, Sendable, RemoteModelMetadata {
  public var typeValue: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D11U2DType_d585eadabc
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "type", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D11U2DType_d585eadabc", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case typeValue = "type"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.typeValue = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D11U2DType_d585eadabc.self, forKey: .typeValue)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(typeValue, forKey: .typeValue)
  }
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D12_4d5808c99a: Codable, Sendable, RemoteModelMetadata {
  public var angle: Int64
  public var typeValue: RoutedeviceU2DActionRequestU2DOptionU2D6U2DKind_6c7cb6fb41
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "angle", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 180, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D6U2DKind_6c7cb6fb41", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case angle = "angle"
    case typeValue = "type"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.angle = try container.decode(Int64.self, forKey: .angle)
    self.typeValue = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DKind_6c7cb6fb41.self, forKey: .typeValue)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(angle, forKey: .angle)
    try container.encode(typeValue, forKey: .typeValue)
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D1U2DType_6f5fd1f783: String, Codable, Sendable {
  case `read` = "read"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D1_9d4f8a22a3: Codable, Sendable, RemoteModelMetadata {
  public var typeValue: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D1U2DType_6f5fd1f783
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "type", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D1U2DType_6f5fd1f783", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case typeValue = "type"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.typeValue = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D1U2DType_6f5fd1f783.self, forKey: .typeValue)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(typeValue, forKey: .typeValue)
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D2U2DType_c5a25a4322: String, Codable, Sendable {
  case `appearance` = "appearance"
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D2U2DValue_8e9c16e558: String, Codable, Sendable {
  case `light` = "light"
  case `dark` = "dark"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D2_0b5555e2ca: Codable, Sendable, RemoteModelMetadata {
  public var typeValue: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D2U2DType_c5a25a4322
  public var value: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D2U2DValue_8e9c16e558
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "type", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D2U2DType_c5a25a4322", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "value", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D2U2DValue_8e9c16e558", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
    self.typeValue = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D2U2DType_c5a25a4322.self, forKey: .typeValue)
    self.value = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D2U2DValue_8e9c16e558.self, forKey: .value)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(typeValue, forKey: .typeValue)
    try container.encode(value, forKey: .value)
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D3U2DType_c8c48a1118: String, Codable, Sendable {
  case `textSize` = "textSize"
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D3U2DValue_f0f815c9ec: String, Codable, Sendable {
  case `small` = "small"
  case `standard` = "standard"
  case `large` = "large"
  case `extraLarge` = "extraLarge"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D3_72a4809a8d: Codable, Sendable, RemoteModelMetadata {
  public var typeValue: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D3U2DType_c8c48a1118
  public var value: RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D3U2DValue_f0f815c9ec
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "type", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D3U2DType_c8c48a1118", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "value", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D3U2DValue_f0f815c9ec", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
    self.typeValue = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D3U2DType_c8c48a1118.self, forKey: .typeValue)
    self.value = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D7U2DControlU2DOptionU2D3U2DValue_f0f815c9ec.self, forKey: .value)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(typeValue, forKey: .typeValue)
    try container.encode(value, forKey: .value)
  }
}
