// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProcedurepluginAccountsRequestU2DOptionU2D3_9a9f19f594: Codable, Sendable, RemoteModelMetadata {
  public var accountId: String
  public var action: ProcedurepluginAccountsRequestU2DOptionU2D3U2DAction_12d1900fc0
  public var pluginName: String
  public var serverName: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "accountId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "action", typeName: "ProcedurepluginAccountsRequestU2DOptionU2D3U2DAction_12d1900fc0", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pluginName", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["plugin.valid-name"]),
    .init(wireName: "serverName", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case accountId = "accountId"
    case action = "action"
    case pluginName = "pluginName"
    case serverName = "serverName"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.accountId = try container.decode(String.self, forKey: .accountId)
    self.action = try container.decode(ProcedurepluginAccountsRequestU2DOptionU2D3U2DAction_12d1900fc0.self, forKey: .action)
    self.pluginName = try container.decode(String.self, forKey: .pluginName)
    self.serverName = try container.decode(String.self, forKey: .serverName)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(accountId, forKey: .accountId)
    try container.encode(action, forKey: .action)
    try container.encode(pluginName, forKey: .pluginName)
    try container.encode(serverName, forKey: .serverName)
  }
}

public enum ProcedurepluginAccountsRequest_1dd12d57c3: Codable, Sendable {
  case option1(ProcedurepluginAccountsRequestU2DOptionU2D1_eb2d4e479c)
  case option2(ProcedurepluginAccountsRequestU2DOptionU2D2_f277d5baa2)
  case option3(ProcedurepluginAccountsRequestU2DOptionU2D3_9a9f19f594)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedurepluginAccountsRequest_1dd12d57c3)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("list")]), let value = try? container.decode(ProcedurepluginAccountsRequestU2DOptionU2D1_eb2d4e479c.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("begin")]), let value = try? container.decode(ProcedurepluginAccountsRequestU2DOptionU2D2_f277d5baa2.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("select"), .string("logout")]), let value = try? container.decode(ProcedurepluginAccountsRequestU2DOptionU2D3_9a9f19f594.self) {
      matches.append((3, .option3(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched ProcedurepluginAccountsRequest_1dd12d57c3" : "Ambiguous union ProcedurepluginAccountsRequest_1dd12d57c3 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(ProcedurepluginAccountsRequest_1dd12d57c3.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public enum ProcedurepluginAccountsResultU2DAccountsU2DItemU2DStatus_894deff77e: String, Codable, Sendable {
  case `connected` = "connected"
  case `expired` = "expired"
  case `disconnected` = "disconnected"
}

public struct ProcedurepluginAccountsResultU2DAccountsU2DItem_8a3bbd41df: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public var label: String
  public var pluginName: String
  public var scopes: [ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]
  public var selected: Bool
  public var serverName: String
  public var status: ProcedurepluginAccountsResultU2DAccountsU2DItemU2DStatus_894deff77e
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "pluginName", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["plugin.valid-name"]),
    .init(wireName: "scopes", typeName: "[ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "selected", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "serverName", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "ProcedurepluginAccountsResultU2DAccountsU2DItemU2DStatus_894deff77e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case label = "label"
    case pluginName = "pluginName"
    case scopes = "scopes"
    case selected = "selected"
    case serverName = "serverName"
    case status = "status"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.label = try container.decode(String.self, forKey: .label)
    self.pluginName = try container.decode(String.self, forKey: .pluginName)
    self.scopes = try container.decode([ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b].self, forKey: .scopes)
    self.selected = try container.decode(Bool.self, forKey: .selected)
    self.serverName = try container.decode(String.self, forKey: .serverName)
    self.status = try container.decode(ProcedurepluginAccountsResultU2DAccountsU2DItemU2DStatus_894deff77e.self, forKey: .status)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(label, forKey: .label)
    try container.encode(pluginName, forKey: .pluginName)
    try container.encode(scopes, forKey: .scopes)
    try container.encode(selected, forKey: .selected)
    try container.encode(serverName, forKey: .serverName)
    try container.encode(status, forKey: .status)
  }
}

public struct ProcedurepluginAccountsResult_609b25af4b: Codable, Sendable, RemoteModelMetadata {
  public var accountId: RemoteField<String> = .missing
  public var accounts: [ProcedurepluginAccountsResultU2DAccountsU2DItem_8a3bbd41df]
  public var authorization: RemoteField<ProcedurebeginMcpServerOauthResult_6a2d40d38c> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "accountId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "accounts", typeName: "[ProcedurepluginAccountsResultU2DAccountsU2DItem_8a3bbd41df]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "authorization", typeName: "ProcedurebeginMcpServerOauthResult_6a2d40d38c", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case accountId = "accountId"
    case accounts = "accounts"
    case authorization = "authorization"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.accountId = try container.decode(RemoteField<String>.self, forKey: .accountId)
    self.accounts = try container.decode([ProcedurepluginAccountsResultU2DAccountsU2DItem_8a3bbd41df].self, forKey: .accounts)
    self.authorization = try container.decode(RemoteField<ProcedurebeginMcpServerOauthResult_6a2d40d38c>.self, forKey: .authorization)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(accountId, forKey: .accountId)
    try container.encode(accounts, forKey: .accounts)
    try container.encode(authorization, forKey: .authorization)
  }
}

public struct ProcedurepluginCatalogRequestU2DOptionU2D1_6021714d61: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.action = try container.decode(ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0.self, forKey: .action)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(action, forKey: .action)
  }
}

public enum ProcedurepluginCatalogRequestU2DOptionU2D2U2DAction_b9817a8a76: String, Codable, Sendable {
  case `artwork` = "artwork"
}

public struct ProcedurepluginCatalogRequestU2DOptionU2D2U2DTargetU2DOptionU2D1_a833fbd1b7: Codable, Sendable, RemoteModelMetadata {
  public var catalogId: String
  public var entryName: String
  public var typeValue: ProcedurehexVoiceResultU2DOptionU2D2U2DKind_18e932ea73
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "catalogId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "entryName", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["plugin.valid-name"]),
    .init(wireName: "type", typeName: "ProcedurehexVoiceResultU2DOptionU2D2U2DKind_18e932ea73", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case catalogId = "catalogId"
    case entryName = "entryName"
    case typeValue = "type"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.catalogId = try container.decode(String.self, forKey: .catalogId)
    self.entryName = try container.decode(String.self, forKey: .entryName)
    self.typeValue = try container.decode(ProcedurehexVoiceResultU2DOptionU2D2U2DKind_18e932ea73.self, forKey: .typeValue)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(catalogId, forKey: .catalogId)
    try container.encode(entryName, forKey: .entryName)
    try container.encode(typeValue, forKey: .typeValue)
  }
}

public enum ProcedurepluginCatalogRequestU2DOptionU2D2U2DTargetU2DOptionU2D2U2DType_2f9c33522d: String, Codable, Sendable {
  case `plugin` = "plugin"
}

public struct ProcedurepluginCatalogRequestU2DOptionU2D2U2DTargetU2DOptionU2D2_8f06f12cab: Codable, Sendable, RemoteModelMetadata {
  public var pluginName: String
  public var projectFsPath: RemoteField<String> = .missing
  public var typeValue: ProcedurepluginCatalogRequestU2DOptionU2D2U2DTargetU2DOptionU2D2U2DType_2f9c33522d
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "pluginName", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["plugin.valid-name"]),
    .init(wireName: "projectFsPath", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 4096, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProcedurepluginCatalogRequestU2DOptionU2D2U2DTargetU2DOptionU2D2U2DType_2f9c33522d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case pluginName = "pluginName"
    case projectFsPath = "projectFsPath"
    case typeValue = "type"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.pluginName = try container.decode(String.self, forKey: .pluginName)
    self.projectFsPath = try container.decode(RemoteField<String>.self, forKey: .projectFsPath)
    self.typeValue = try container.decode(ProcedurepluginCatalogRequestU2DOptionU2D2U2DTargetU2DOptionU2D2U2DType_2f9c33522d.self, forKey: .typeValue)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(pluginName, forKey: .pluginName)
    try container.encode(projectFsPath, forKey: .projectFsPath)
    try container.encode(typeValue, forKey: .typeValue)
  }
}

public enum ProcedurepluginCatalogRequestU2DOptionU2D2U2DTarget_750540082b: Codable, Sendable {
  case option1(ProcedurepluginCatalogRequestU2DOptionU2D2U2DTargetU2DOptionU2D1_a833fbd1b7)
  case option2(ProcedurepluginCatalogRequestU2DOptionU2D2U2DTargetU2DOptionU2D2_8f06f12cab)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedurepluginCatalogRequestU2DOptionU2D2U2DTarget_750540082b)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("catalog")]), let value = try? container.decode(ProcedurepluginCatalogRequestU2DOptionU2D2U2DTargetU2DOptionU2D1_a833fbd1b7.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("plugin")]), let value = try? container.decode(ProcedurepluginCatalogRequestU2DOptionU2D2U2DTargetU2DOptionU2D2_8f06f12cab.self) {
      matches.append((2, .option2(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched ProcedurepluginCatalogRequestU2DOptionU2D2U2DTarget_750540082b" : "Ambiguous union ProcedurepluginCatalogRequestU2DOptionU2D2U2DTarget_750540082b matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(ProcedurepluginCatalogRequestU2DOptionU2D2U2DTarget_750540082b.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
    }
    self = matches[0].1
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    }
  }
}

public struct ProcedurepluginCatalogRequestU2DOptionU2D2_413c12edf5: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurepluginCatalogRequestU2DOptionU2D2U2DAction_b9817a8a76
  public var target: ProcedurepluginCatalogRequestU2DOptionU2D2U2DTarget_750540082b
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurepluginCatalogRequestU2DOptionU2D2U2DAction_b9817a8a76", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "target", typeName: "ProcedurepluginCatalogRequestU2DOptionU2D2U2DTarget_750540082b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case target = "target"
    case version = "version"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.action = try container.decode(ProcedurepluginCatalogRequestU2DOptionU2D2U2DAction_b9817a8a76.self, forKey: .action)
    self.target = try container.decode(ProcedurepluginCatalogRequestU2DOptionU2D2U2DTarget_750540082b.self, forKey: .target)
    self.version = try container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72.self, forKey: .version)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(action, forKey: .action)
    try container.encode(target, forKey: .target)
    try container.encode(version, forKey: .version)
  }
}

public enum ProcedurepluginCatalogRequestU2DOptionU2D3U2DAction_d296b974b4: String, Codable, Sendable {
  case `add` = "add"
}

public enum ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D1U2DType_5e5498f4ef: String, Codable, Sendable {
  case `git` = "git"
}

public struct ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D1_ad589020ee: Codable, Sendable, RemoteModelMetadata {
  public var ref: RemoteField<String> = .missing
  public var typeValue: ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D1U2DType_5e5498f4ef
  public var url: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "ref", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D1U2DType_5e5498f4ef", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "url", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case ref = "ref"
    case typeValue = "type"
    case url = "url"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.ref = try container.decode(RemoteField<String>.self, forKey: .ref)
    self.typeValue = try container.decode(ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D1U2DType_5e5498f4ef.self, forKey: .typeValue)
    self.url = try container.decode(String.self, forKey: .url)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(ref, forKey: .ref)
    try container.encode(typeValue, forKey: .typeValue)
    try container.encode(url, forKey: .url)
  }
}

public enum ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D2U2DType_30397dadf4: String, Codable, Sendable {
  case `local` = "local"
}

public struct ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D2_9c3b27dde4: Codable, Sendable, RemoteModelMetadata {
  public var path: String
  public var typeValue: ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D2U2DType_30397dadf4
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D2U2DType_30397dadf4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
    self.path = try container.decode(String.self, forKey: .path)
    self.typeValue = try container.decode(ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D2U2DType_30397dadf4.self, forKey: .typeValue)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(path, forKey: .path)
    try container.encode(typeValue, forKey: .typeValue)
  }
}

public enum ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09: Codable, Sendable {
  case option1(ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D1_ad589020ee)
  case option2(ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D2_9c3b27dde4)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("git")]), let value = try? container.decode(ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D1_ad589020ee.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("local")]), let value = try? container.decode(ProcedurepluginCatalogRequestU2DOptionU2D3U2DSourceU2DOptionU2D2_9c3b27dde4.self) {
      matches.append((2, .option2(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09" : "Ambiguous union ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(ProcedurepluginCatalogRequestU2DOptionU2D3U2DSource_52056f3d09.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
    }
    self = matches[0].1
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    }
  }
}

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
