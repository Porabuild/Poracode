// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RoutedeviceU2DActionRequestU2DOptionU2D2_2c6061a21f: Codable, Sendable, RemoteModelMetadata {
  public var durationMs: Int64
  public var endX: Double
  public var endY: Double
  public var frameId: String
  public var kind: RoutedeviceU2DActionRequestU2DOptionU2D2U2DKind_0cdfc047b0
  public var x: Double
  public var y: Double
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "durationMs", typeName: "Int64", required: true, nullable: false, minimum: 100, maximum: 2000, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "endX", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: 1, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "endY", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: 1, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "frameId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D2U2DKind_0cdfc047b0", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "x", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: 1, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "y", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: 1, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case durationMs = "durationMs"
    case endX = "endX"
    case endY = "endY"
    case frameId = "frameId"
    case kind = "kind"
    case x = "x"
    case y = "y"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.durationMs = try container.decode(Int64.self, forKey: .durationMs)
    self.endX = try container.decode(Double.self, forKey: .endX)
    self.endY = try container.decode(Double.self, forKey: .endY)
    self.frameId = try container.decode(String.self, forKey: .frameId)
    self.kind = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D2U2DKind_0cdfc047b0.self, forKey: .kind)
    self.x = try container.decode(Double.self, forKey: .x)
    self.y = try container.decode(Double.self, forKey: .y)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(durationMs, forKey: .durationMs)
    try container.encode(endX, forKey: .endX)
    try container.encode(endY, forKey: .endY)
    try container.encode(frameId, forKey: .frameId)
    try container.encode(kind, forKey: .kind)
    try container.encode(x, forKey: .x)
    try container.encode(y, forKey: .y)
  }
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D3_8c04d0a06a: Codable, Sendable, RemoteModelMetadata {
  public var kind: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D1U2DKind_3ad514880d
  public var text: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D1U2DKind_3ad514880d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "text", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 2000, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case text = "text"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.kind = try container.decode(ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D1U2DKind_3ad514880d.self, forKey: .kind)
    self.text = try container.decode(String.self, forKey: .text)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(kind, forKey: .kind)
    try container.encode(text, forKey: .text)
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D4U2DKey_35c107fafb: String, Codable, Sendable {
  case `home` = "home"
  case `back` = "back"
  case `enter` = "enter"
  case `backspace` = "backspace"
}

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

public enum RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D10U2DType_bd9ee7d624: String, Codable, Sendable {
  case `launchApp` = "launchApp"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D10_14f3c332d5: Codable, Sendable, RemoteModelMetadata {
  public var applicationId: String
  public var typeValue: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D10U2DType_bd9ee7d624
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "applicationId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 3, maxLength: 255, minItems: nil, maxItems: nil, pattern: "^[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+$", format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D10U2DType_bd9ee7d624", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
    self.typeValue = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D10U2DType_bd9ee7d624.self, forKey: .typeValue)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(applicationId, forKey: .applicationId)
    try container.encode(typeValue, forKey: .typeValue)
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D11U2DType_d585eadabc: String, Codable, Sendable {
  case `powerOff` = "powerOff"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D11_fd4fd2eb41: Codable, Sendable, RemoteModelMetadata {
  public var typeValue: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D11U2DType_d585eadabc
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "type", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D11U2DType_d585eadabc", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
    self.typeValue = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D11U2DType_d585eadabc.self, forKey: .typeValue)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(typeValue, forKey: .typeValue)
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1U2DType_6f5fd1f783: String, Codable, Sendable {
  case `read` = "read"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1_9d4f8a22a3: Codable, Sendable, RemoteModelMetadata {
  public var typeValue: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1U2DType_6f5fd1f783
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "type", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1U2DType_6f5fd1f783", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
    self.typeValue = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1U2DType_6f5fd1f783.self, forKey: .typeValue)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(typeValue, forKey: .typeValue)
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2U2DType_c5a25a4322: String, Codable, Sendable {
  case `appearance` = "appearance"
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2U2DValue_8e9c16e558: String, Codable, Sendable {
  case `light` = "light"
  case `dark` = "dark"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2_0b5555e2ca: Codable, Sendable, RemoteModelMetadata {
  public var typeValue: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2U2DType_c5a25a4322
  public var value: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2U2DValue_8e9c16e558
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "type", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2U2DType_c5a25a4322", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "value", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2U2DValue_8e9c16e558", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
    self.typeValue = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2U2DType_c5a25a4322.self, forKey: .typeValue)
    self.value = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2U2DValue_8e9c16e558.self, forKey: .value)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(typeValue, forKey: .typeValue)
    try container.encode(value, forKey: .value)
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3U2DType_c8c48a1118: String, Codable, Sendable {
  case `textSize` = "textSize"
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3U2DValue_f0f815c9ec: String, Codable, Sendable {
  case `small` = "small"
  case `standard` = "standard"
  case `large` = "large"
  case `extraLarge` = "extraLarge"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3_72a4809a8d: Codable, Sendable, RemoteModelMetadata {
  public var typeValue: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3U2DType_c8c48a1118
  public var value: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3U2DValue_f0f815c9ec
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "type", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3U2DType_c8c48a1118", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "value", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3U2DValue_f0f815c9ec", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
    self.typeValue = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3U2DType_c8c48a1118.self, forKey: .typeValue)
    self.value = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3U2DValue_f0f815c9ec.self, forKey: .value)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(typeValue, forKey: .typeValue)
    try container.encode(value, forKey: .value)
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4U2DType_4311a74add: String, Codable, Sendable {
  case `orientation` = "orientation"
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4U2DValue_d61b01c8cb: String, Codable, Sendable {
  case `portrait` = "portrait"
  case `landscapeLeft` = "landscapeLeft"
  case `upsideDown` = "upsideDown"
  case `landscapeRight` = "landscapeRight"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4_feff20c88b: Codable, Sendable, RemoteModelMetadata {
  public var typeValue: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4U2DType_4311a74add
  public var value: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4U2DValue_d61b01c8cb
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "type", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4U2DType_4311a74add", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "value", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4U2DValue_d61b01c8cb", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
    self.typeValue = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4U2DType_4311a74add.self, forKey: .typeValue)
    self.value = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4U2DValue_d61b01c8cb.self, forKey: .value)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(typeValue, forKey: .typeValue)
    try container.encode(value, forKey: .value)
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D5U2DType_3ac0e8087f: String, Codable, Sendable {
  case `reduceMotion` = "reduceMotion"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D5_ca98effeea: Codable, Sendable, RemoteModelMetadata {
  public var enabled: Bool
  public var typeValue: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D5U2DType_3ac0e8087f
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "enabled", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D5U2DType_3ac0e8087f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
    self.typeValue = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D5U2DType_3ac0e8087f.self, forKey: .typeValue)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(enabled, forKey: .enabled)
    try container.encode(typeValue, forKey: .typeValue)
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D6U2DType_d4757acfcd: String, Codable, Sendable {
  case `network` = "network"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D6_596b826e91: Codable, Sendable, RemoteModelMetadata {
  public var enabled: Bool
  public var typeValue: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D6U2DType_d4757acfcd
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "enabled", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D6U2DType_d4757acfcd", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
    self.typeValue = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D6U2DType_d4757acfcd.self, forKey: .typeValue)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(enabled, forKey: .enabled)
    try container.encode(typeValue, forKey: .typeValue)
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D7U2DType_1a0723da99: String, Codable, Sendable {
  case `location` = "location"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D7_dfbf83bd74: Codable, Sendable, RemoteModelMetadata {
  public var latitude: Double
  public var longitude: Double
  public var typeValue: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D7U2DType_1a0723da99
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "latitude", typeName: "Double", required: true, nullable: false, minimum: -90, maximum: 90, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "longitude", typeName: "Double", required: true, nullable: false, minimum: -180, maximum: 180, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D7U2DType_1a0723da99", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
    self.typeValue = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D7U2DType_1a0723da99.self, forKey: .typeValue)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(latitude, forKey: .latitude)
    try container.encode(longitude, forKey: .longitude)
    try container.encode(typeValue, forKey: .typeValue)
  }
}
