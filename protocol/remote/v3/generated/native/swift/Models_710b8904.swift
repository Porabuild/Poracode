// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProcedurepluginCatalogRequestU2DOptionU2D3_5a7fa7d249: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurepluginCatalogRequestU2DOptionU2D3U2DAction_d296b974b4
  public var source: ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurepluginCatalogRequestU2DOptionU2D3U2DAction_d296b974b4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "source", typeName: "ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case source = "source"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.action = try container.decode(ProcedurepluginCatalogRequestU2DOptionU2D3U2DAction_d296b974b4.self, forKey: .action)
    self.source = try container.decode(ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09.self, forKey: .source)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(action, forKey: .action)
    try container.encode(source, forKey: .source)
  }
}

public enum ProcedurepluginCatalogRequestU2DOptionU2D4U2DAction_231ec8a79b: String, Codable, Sendable {
  case `refresh` = "refresh"
}

public struct ProcedurepluginCatalogRequestU2DOptionU2D4_8fd899986e: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurepluginCatalogRequestU2DOptionU2D4U2DAction_231ec8a79b
  public var catalogId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurepluginCatalogRequestU2DOptionU2D4U2DAction_231ec8a79b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "catalogId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case catalogId = "catalogId"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.action = try container.decode(ProcedurepluginCatalogRequestU2DOptionU2D4U2DAction_231ec8a79b.self, forKey: .action)
    self.catalogId = try container.decode(String.self, forKey: .catalogId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(action, forKey: .action)
    try container.encode(catalogId, forKey: .catalogId)
  }
}

public enum ProcedurepluginCatalogRequestU2DOptionU2D5U2DAction_a29fb46577: String, Codable, Sendable {
  case `removeU2DSource` = "remove-source"
}

public struct ProcedurepluginCatalogRequestU2DOptionU2D5_bfc61ac710: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurepluginCatalogRequestU2DOptionU2D5U2DAction_a29fb46577
  public var catalogId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurepluginCatalogRequestU2DOptionU2D5U2DAction_a29fb46577", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "catalogId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case catalogId = "catalogId"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.action = try container.decode(ProcedurepluginCatalogRequestU2DOptionU2D5U2DAction_a29fb46577.self, forKey: .action)
    self.catalogId = try container.decode(String.self, forKey: .catalogId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(action, forKey: .action)
    try container.encode(catalogId, forKey: .catalogId)
  }
}

public enum ProcedurepluginCatalogRequestU2DOptionU2D6U2DAction_bb92475a93: String, Codable, Sendable {
  case `inspect` = "inspect"
}

public struct ProcedurepluginCatalogRequestU2DOptionU2D6_c6137caf01: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurepluginCatalogRequestU2DOptionU2D6U2DAction_bb92475a93
  public var catalogId: String
  public var entryName: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurepluginCatalogRequestU2DOptionU2D6U2DAction_bb92475a93", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "catalogId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "entryName", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["plugin.valid-name"]),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case catalogId = "catalogId"
    case entryName = "entryName"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.action = try container.decode(ProcedurepluginCatalogRequestU2DOptionU2D6U2DAction_bb92475a93.self, forKey: .action)
    self.catalogId = try container.decode(String.self, forKey: .catalogId)
    self.entryName = try container.decode(String.self, forKey: .entryName)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(action, forKey: .action)
    try container.encode(catalogId, forKey: .catalogId)
    try container.encode(entryName, forKey: .entryName)
  }
}

public enum ProcedurepluginCatalogRequestU2DOptionU2D7U2DAction_a4b7ae3e0e: String, Codable, Sendable {
  case `install` = "install"
  case `update` = "update"
}

public struct ProcedurepluginCatalogRequestU2DOptionU2D7_594d4a132e: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurepluginCatalogRequestU2DOptionU2D7U2DAction_a4b7ae3e0e
  public var catalogId: String
  public var entryName: String
  public var reviewDigest: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurepluginCatalogRequestU2DOptionU2D7U2DAction_a4b7ae3e0e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "catalogId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "entryName", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["plugin.valid-name"]),
    .init(wireName: "reviewDigest", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case catalogId = "catalogId"
    case entryName = "entryName"
    case reviewDigest = "reviewDigest"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.action = try container.decode(ProcedurepluginCatalogRequestU2DOptionU2D7U2DAction_a4b7ae3e0e.self, forKey: .action)
    self.catalogId = try container.decode(String.self, forKey: .catalogId)
    self.entryName = try container.decode(String.self, forKey: .entryName)
    self.reviewDigest = try container.decode(String.self, forKey: .reviewDigest)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(action, forKey: .action)
    try container.encode(catalogId, forKey: .catalogId)
    try container.encode(entryName, forKey: .entryName)
    try container.encode(reviewDigest, forKey: .reviewDigest)
  }
}

public enum ProcedurepluginCatalogRequestU2DOptionU2D8U2DAction_5b7ea40b41: String, Codable, Sendable {
  case `removeU2DPackage` = "remove-package"
}

public struct ProcedurepluginCatalogRequestU2DOptionU2D8_5db21c63a6: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurepluginCatalogRequestU2DOptionU2D8U2DAction_5b7ea40b41
  public var pluginName: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurepluginCatalogRequestU2DOptionU2D8U2DAction_5b7ea40b41", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pluginName", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["plugin.valid-name"]),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case pluginName = "pluginName"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.action = try container.decode(ProcedurepluginCatalogRequestU2DOptionU2D8U2DAction_5b7ea40b41.self, forKey: .action)
    self.pluginName = try container.decode(String.self, forKey: .pluginName)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(action, forKey: .action)
    try container.encode(pluginName, forKey: .pluginName)
  }
}

public enum ProcedurepluginCatalogRequest_ded6409c4e: Codable, Sendable {
  case option1(ProcedurepluginCatalogRequestU2DOptionU2D1_6021714d61)
  case option2(ProcedurepluginCatalogRequestU2DOptionU2D2_413c12edf5)
  case option3(ProcedurepluginCatalogRequestU2DOptionU2D3_5a7fa7d249)
  case option4(ProcedurepluginCatalogRequestU2DOptionU2D4_8fd899986e)
  case option5(ProcedurepluginCatalogRequestU2DOptionU2D5_bfc61ac710)
  case option6(ProcedurepluginCatalogRequestU2DOptionU2D6_c6137caf01)
  case option7(ProcedurepluginCatalogRequestU2DOptionU2D7_594d4a132e)
  case option8(ProcedurepluginCatalogRequestU2DOptionU2D8_5db21c63a6)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedurepluginCatalogRequest_ded6409c4e)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("list")]), let value = try? container.decode(ProcedurepluginCatalogRequestU2DOptionU2D1_6021714d61.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("artwork")]), let value = try? container.decode(ProcedurepluginCatalogRequestU2DOptionU2D2_413c12edf5.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("add")]), let value = try? container.decode(ProcedurepluginCatalogRequestU2DOptionU2D3_5a7fa7d249.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("refresh")]), let value = try? container.decode(ProcedurepluginCatalogRequestU2DOptionU2D4_8fd899986e.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("remove-source")]), let value = try? container.decode(ProcedurepluginCatalogRequestU2DOptionU2D5_bfc61ac710.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("inspect")]), let value = try? container.decode(ProcedurepluginCatalogRequestU2DOptionU2D6_c6137caf01.self) {
      matches.append((6, .option6(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("install"), .string("update")]), let value = try? container.decode(ProcedurepluginCatalogRequestU2DOptionU2D7_594d4a132e.self) {
      matches.append((7, .option7(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("remove-package")]), let value = try? container.decode(ProcedurepluginCatalogRequestU2DOptionU2D8_5db21c63a6.self) {
      matches.append((8, .option8(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched ProcedurepluginCatalogRequest_ded6409c4e" : "Ambiguous union ProcedurepluginCatalogRequest_ded6409c4e matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(ProcedurepluginCatalogRequest_ded6409c4e.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
    }
  }
}

public struct ProcedurepluginCatalogResultU2DArtwork_9d92cfef95: Codable, Sendable, RemoteModelMetadata {
  public var dataUrl: RemoteField<String> = .missing
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "dataUrl", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 32768, minItems: nil, maxItems: nil, pattern: "^data:image\\/png;base64,[A-Za-z0-9+/]+={0,2}$", format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case dataUrl = "dataUrl"
    case version = "version"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.dataUrl = try container.decode(RemoteField<String>.self, forKey: .dataUrl)
    self.version = try container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72.self, forKey: .version)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(dataUrl, forKey: .dataUrl)
    try container.encode(version, forKey: .version)
  }
}

public enum ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D1U2DType_3b8bae8666: String, Codable, Sendable {
  case `path` = "path"
}

public struct ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D1_be1e614a67: Codable, Sendable, RemoteModelMetadata {
  public var path: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var typeValue: ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D1U2DType_3b8bae8666
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "path", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D1U2DType_3b8bae8666", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case path = "path"
    case typeValue = "type"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.path = try container.decode(ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b.self, forKey: .path)
    self.typeValue = try container.decode(ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D1U2DType_3b8bae8666.self, forKey: .typeValue)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(path, forKey: .path)
    try container.encode(typeValue, forKey: .typeValue)
  }
}

public struct ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D2_f86cfdbc9e: Codable, Sendable, RemoteModelMetadata {
  public var path: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var ref: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = .missing
  public var sha: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = .missing
  public var typeValue: ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D1U2DType_5e5498f4ef
  public var url: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "path", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ref", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sha", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D1U2DType_5e5498f4ef", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "url", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case path = "path"
    case ref = "ref"
    case sha = "sha"
    case typeValue = "type"
    case url = "url"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.path = try container.decode(ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b.self, forKey: .path)
    self.ref = try container.decode(RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>.self, forKey: .ref)
    self.sha = try container.decode(RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b>.self, forKey: .sha)
    self.typeValue = try container.decode(ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D1U2DType_5e5498f4ef.self, forKey: .typeValue)
    self.url = try container.decode(ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b.self, forKey: .url)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(path, forKey: .path)
    try container.encode(ref, forKey: .ref)
    try container.encode(sha, forKey: .sha)
    try container.encode(typeValue, forKey: .typeValue)
    try container.encode(url, forKey: .url)
  }
}

public enum ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D3U2DType_91b38b813d: String, Codable, Sendable {
  case `unsupported` = "unsupported"
}

public struct ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D3_bf331e27ae: Codable, Sendable, RemoteModelMetadata {
  public var kind: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var typeValue: ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D3U2DType_91b38b813d
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D3U2DType_91b38b813d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case typeValue = "type"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.kind = try container.decode(ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b.self, forKey: .kind)
    self.typeValue = try container.decode(ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D3U2DType_91b38b813d.self, forKey: .typeValue)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(kind, forKey: .kind)
    try container.encode(typeValue, forKey: .typeValue)
  }
}

public enum ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf: Codable, Sendable {
  case option1(ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D1_be1e614a67)
  case option2(ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D2_f86cfdbc9e)
  case option3(ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D3_bf331e27ae)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("path")]), let value = try? container.decode(ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D1_be1e614a67.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("git")]), let value = try? container.decode(ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D2_f86cfdbc9e.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("unsupported")]), let value = try? container.decode(ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSourceU2DOptionU2D3_bf331e27ae.self) {
      matches.append((3, .option3(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf" : "Ambiguous union ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(ProcedurepluginCatalogResultU2DCatalogsU2DItemU2DEntriesU2DItemU2DSource_c9da5a75bf.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
