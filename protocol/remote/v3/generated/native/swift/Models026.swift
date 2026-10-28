// GENERATED FILE. Do not edit by hand.
import Foundation
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

public enum RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8U2DDecision_ff4e0a6efa: String, Codable, Sendable {
  case `grant` = "grant"
  case `revoke` = "revoke"
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8U2DPermission_f6dd22a2a9: String, Codable, Sendable {
  case `camera` = "camera"
  case `microphone` = "microphone"
  case `photos` = "photos"
  case `contacts` = "contacts"
  case `calendar` = "calendar"
  case `location` = "location"
  case `notifications` = "notifications"
  case `motion` = "motion"
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8U2DType_592634b895: String, Codable, Sendable {
  case `permission` = "permission"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8_861b7e521a: Codable, Sendable, RemoteModelMetadata {
  public var applicationId: String
  public var decision: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8U2DDecision_ff4e0a6efa
  public var permission: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8U2DPermission_f6dd22a2a9
  public var typeValue: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8U2DType_592634b895
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "applicationId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 3, maxLength: 255, minItems: nil, maxItems: nil, pattern: "^[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+$", format: nil, semanticValidatorIds: []),
    .init(wireName: "decision", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8U2DDecision_ff4e0a6efa", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "permission", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8U2DPermission_f6dd22a2a9", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8U2DType_592634b895", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
    self.decision = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8U2DDecision_ff4e0a6efa.self, forKey: .decision)
    self.permission = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8U2DPermission_f6dd22a2a9.self, forKey: .permission)
    self.typeValue = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8U2DType_592634b895.self, forKey: .typeValue)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(applicationId, forKey: .applicationId)
    try container.encode(decision, forKey: .decision)
    try container.encode(permission, forKey: .permission)
    try container.encode(typeValue, forKey: .typeValue)
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D9U2DType_921834989f: String, Codable, Sendable {
  case `openUrl` = "openUrl"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D9_3935a65be8: Codable, Sendable, RemoteModelMetadata {
  public var typeValue: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D9U2DType_921834989f
  public var url: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "type", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D9U2DType_921834989f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "url", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 4096, minItems: nil, maxItems: nil, pattern: "^(?!(?:javascript|data|file|content|intent|about):)[A-Za-z][A-Za-z0-9+.-]*:\\/\\/[^\\s]+$", format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case typeValue = "type"
    case url = "url"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.typeValue = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D9U2DType_921834989f.self, forKey: .typeValue)
    self.url = try container.decode(String.self, forKey: .url)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(typeValue, forKey: .typeValue)
    try container.encode(url, forKey: .url)
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863: Codable, Sendable {
  case option1(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1_9d4f8a22a3)
  case option2(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2_0b5555e2ca)
  case option3(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3_72a4809a8d)
  case option4(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4_feff20c88b)
  case option5(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D5_ca98effeea)
  case option6(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D6_596b826e91)
  case option7(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D7_dfbf83bd74)
  case option8(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8_861b7e521a)
  case option9(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D9_3935a65be8)
  case option10(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D10_14f3c332d5)
  case option11(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D11_fd4fd2eb41)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("read")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D1_9d4f8a22a3.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("appearance")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D2_0b5555e2ca.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("textSize")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D3_72a4809a8d.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("orientation")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D4_feff20c88b.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("reduceMotion")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D5_ca98effeea.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("network")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D6_596b826e91.self) {
      matches.append((6, .option6(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("location")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D7_dfbf83bd74.self) {
      matches.append((7, .option7(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("permission")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D8_861b7e521a.self) {
      matches.append((8, .option8(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("openUrl")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D9_3935a65be8.self) {
      matches.append((9, .option9(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("launchApp")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D10_14f3c332d5.self) {
      matches.append((10, .option10(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("powerOff")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControlU2DOptionU2D11_fd4fd2eb41.self) {
      matches.append((11, .option11(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863" : "Ambiguous union RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
    }
    self = matches[0].1
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    case .option3(let value): try container.encode(value)
    case .option4(let value): try container.encode(value)
    case .option5(let value): try container.encode(value)
    case .option6(let value): try container.encode(value)
    case .option7(let value): try container.encode(value)
    case .option8(let value): try container.encode(value)
    case .option9(let value): try container.encode(value)
    case .option10(let value): try container.encode(value)
    case .option11(let value): try container.encode(value)
    }
  }
}

public enum RoutedeviceU2DActionRequestU2DOptionU2D6U2DKind_6eed5e1fa2: String, Codable, Sendable {
  case `control` = "control"
}

public struct RoutedeviceU2DActionRequestU2DOptionU2D6_0b2ba27512: Codable, Sendable, RemoteModelMetadata {
  public var control: RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863
  public var kind: RoutedeviceU2DActionRequestU2DOptionU2D6U2DKind_6eed5e1fa2
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "control", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutedeviceU2DActionRequestU2DOptionU2D6U2DKind_6eed5e1fa2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case control = "control"
    case kind = "kind"
    case version = "version"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.control = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DControl_9040d75863.self, forKey: .control)
    self.kind = try container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6U2DKind_6eed5e1fa2.self, forKey: .kind)
    self.version = try container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72.self, forKey: .version)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(control, forKey: .control)
    try container.encode(kind, forKey: .kind)
    try container.encode(version, forKey: .version)
  }
}

public enum RoutedeviceU2DActionRequest_c37d7c3aee: Codable, Sendable {
  case option1(RoutedeviceU2DActionRequestU2DOptionU2D1_6ddf4b7dc1)
  case option2(RoutedeviceU2DActionRequestU2DOptionU2D2_2c6061a21f)
  case option3(RoutedeviceU2DActionRequestU2DOptionU2D3_8c04d0a06a)
  case option4(RoutedeviceU2DActionRequestU2DOptionU2D4_83384e1a09)
  case option5(RoutedeviceU2DActionRequestU2DOptionU2D5_a36830c34a)
  case option6(RoutedeviceU2DActionRequestU2DOptionU2D6_0b2ba27512)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RoutedeviceU2DActionRequest_c37d7c3aee)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("tap")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D1_6ddf4b7dc1.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("swipe")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D2_2c6061a21f.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("text")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D3_8c04d0a06a.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("key")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D4_83384e1a09.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("start")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D5_a36830c34a.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("control")]), let value = try? container.decode(RoutedeviceU2DActionRequestU2DOptionU2D6_0b2ba27512.self) {
      matches.append((6, .option6(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RoutedeviceU2DActionRequest_c37d7c3aee" : "Ambiguous union RoutedeviceU2DActionRequest_c37d7c3aee matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RoutedeviceU2DActionRequest_c37d7c3aee.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
    }
    self = matches[0].1
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    case .option3(let value): try container.encode(value)
    case .option4(let value): try container.encode(value)
    case .option5(let value): try container.encode(value)
    case .option6(let value): try container.encode(value)
    }
  }
}

public enum RoutedeviceU2DActionResponseU2DControlsU2DAppearance_9ea58f9bfc: String, Codable, Sendable {
  case `light` = "light"
  case `dark` = "dark"
  case `system` = "system"
}

public struct RoutedeviceU2DActionResponseU2DControls_8971fe1e2b: Codable, Sendable, RemoteModelMetadata {
  public var appearance: RemoteField<RoutedeviceU2DActionResponseU2DControlsU2DAppearance_9ea58f9bfc> = .missing
  public var fontScale: RemoteField<Double> = .missing
  public var networkEnabled: RemoteField<Bool> = .missing
  public var reduceMotion: RemoteField<Bool> = .missing
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "appearance", typeName: "RoutedeviceU2DActionResponseU2DControlsU2DAppearance_9ea58f9bfc", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fontScale", typeName: "Double", required: false, nullable: false, minimum: nil, maximum: 10, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "networkEnabled", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reduceMotion", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case appearance = "appearance"
    case fontScale = "fontScale"
    case networkEnabled = "networkEnabled"
    case reduceMotion = "reduceMotion"
    case version = "version"
  }
}

public struct RoutedeviceU2DActionResponse_64ba4037c0: Codable, Sendable, RemoteModelMetadata {
  public var controls: RemoteField<RoutedeviceU2DActionResponseU2DControls_8971fe1e2b> = .missing
  public var delivered: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "controls", typeName: "RoutedeviceU2DActionResponseU2DControls_8971fe1e2b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "delivered", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case controls = "controls"
    case delivered = "delivered"
    case version = "version"
  }
}

public enum RoutedeviceU2DAttachRequestU2DAccess_9ca4aec6d4: String, Codable, Sendable {
  case `view` = "view"
  case `control` = "control"
}

public enum RoutedeviceU2DAttachRequestU2DAgentAccess_e6bc2fd97b: String, Codable, Sendable {
  case `none` = "none"
  case `view` = "view"
  case `control` = "control"
}
