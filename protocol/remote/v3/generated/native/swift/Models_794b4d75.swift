// GENERATED FILE. Do not edit by hand.
import Foundation
public enum ProcedurelistSkillMarketplaceResultU2DSkillsU2DItemU2DSecurityGrade_e987f23b08: String, Codable, Sendable {
  case `a` = "A"
  case `b` = "B"
  case `c` = "C"
  case `d` = "D"
  case `f` = "F"
}

public struct ProcedurelistSkillMarketplaceResultU2DSkillsU2DItem_4dea101cb6: Codable, Sendable, RemoteModelMetadata {
  public var description: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var id: String
  public var installs: RemoteField<Int64> = .missing
  public var marketplace: ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa
  public var name: String
  public var official: Bool
  public var rank: Int64
  public var securityGrade: RemoteField<ProcedurelistSkillMarketplaceResultU2DSkillsU2DItemU2DSecurityGrade_e987f23b08> = .missing
  public var securityScore: RemoteField<Double> = .missing
  public var skillId: String
  public var source: String
  public var sourcePath: RemoteField<String> = .missing
  public var sourceRef: RemoteField<String> = .missing
  public var sourceUrl: RemoteField<String> = .missing
  public var stars: RemoteField<Int64> = .missing
  public var updatedAt: RemoteField<String> = .missing
  public var votes: RemoteField<Int64> = .missing
  public var weeklyInstalls: RemoteField<[Int64]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "description", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "installs", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "marketplace", typeName: "ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "official", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "rank", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "securityGrade", typeName: "ProcedurelistSkillMarketplaceResultU2DSkillsU2DItemU2DSecurityGrade_e987f23b08", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "securityScore", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: 100, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "skillId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "source", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sourcePath", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sourceRef", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sourceUrl", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: "uri", semanticValidatorIds: []),
    .init(wireName: "stars", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "updatedAt", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "votes", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "weeklyInstalls", typeName: "[Int64]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case description = "description"
    case id = "id"
    case installs = "installs"
    case marketplace = "marketplace"
    case name = "name"
    case official = "official"
    case rank = "rank"
    case securityGrade = "securityGrade"
    case securityScore = "securityScore"
    case skillId = "skillId"
    case source = "source"
    case sourcePath = "sourcePath"
    case sourceRef = "sourceRef"
    case sourceUrl = "sourceUrl"
    case stars = "stars"
    case updatedAt = "updatedAt"
    case votes = "votes"
    case weeklyInstalls = "weeklyInstalls"
  }
}

public struct ProcedurelistSkillMarketplaceResult_89033d459d: Codable, Sendable, RemoteModelMetadata {
  public var marketplace: ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa
  public var skills: [ProcedurelistSkillMarketplaceResultU2DSkillsU2DItem_4dea101cb6]
  public var total: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "marketplace", typeName: "ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "skills", typeName: "[ProcedurelistSkillMarketplaceResultU2DSkillsU2DItem_4dea101cb6]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "total", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case marketplace = "marketplace"
    case skills = "skills"
    case total = "total"
  }
}

public struct ProcedurelistThreadSessionActionsResultU2DActionsU2DItem_2e59da965e: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
  }
}

public struct ProcedurelistThreadSessionActionsResult_825afc62b8: Codable, Sendable, RemoteModelMetadata {
  public var actions: [ProcedurelistThreadSessionActionsResultU2DActionsU2DItem_2e59da965e]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "actions", typeName: "[ProcedurelistThreadSessionActionsResultU2DActionsU2DItem_2e59da965e]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 100, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case actions = "actions"
  }
}

public struct ProcedurelogoutAcpAgentRequest_afbd186700: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: String
  public var envKind: RemoteField<ProcedureauthenticateAcpAgentRequestU2DEnvKind_9eed5c4959> = .missing
  public var wslDistro: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "envKind", typeName: "ProcedureauthenticateAcpAgentRequestU2DEnvKind_9eed5c4959", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslDistro", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentKind = "agentKind"
    case envKind = "envKind"
    case wslDistro = "wslDistro"
  }
}

public struct ProcedurelspStartRequest_0fbb6754fb: Codable, Sendable, RemoteModelMetadata {
  public var languageId: String
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public var sessionId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "languageId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sessionId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case languageId = "languageId"
    case projectLocation = "projectLocation"
    case sessionId = "sessionId"
  }
}

public struct ProceduremoveProjectEntryRequest_47c3f1ae81: Codable, Sendable, RemoteModelMetadata {
  public var nextParentPath: RemoteField<String> = .missing
  public var path: String
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "nextParentPath", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case nextParentPath = "nextParentPath"
    case path = "path"
    case projectLocation = "projectLocation"
  }
}

public struct ProcedurepauseThreadFollowUpsRequest_d42717fff2: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case threadId = "threadId"
  }
}

public struct ProcedurepluginAccountsRequestU2DOptionU2D1_eb2d4e479c: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0
  public var pluginName: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
    self.action = try container.decode(ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0.self, forKey: .action)
    self.pluginName = try container.decode(String.self, forKey: .pluginName)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(action, forKey: .action)
    try container.encode(pluginName, forKey: .pluginName)
  }
}

public struct ProcedurepluginAccountsRequestU2DOptionU2D2_f277d5baa2: Codable, Sendable, RemoteModelMetadata {
  public var accountId: RemoteField<String> = .missing
  public var action: ProcedurehexVoiceRequestU2DOptionU2D7U2DAction_236e9131b0
  public var label: String
  public var pluginName: String
  public var serverName: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "accountId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$", format: "uuid", semanticValidatorIds: []),
    .init(wireName: "action", typeName: "ProcedurehexVoiceRequestU2DOptionU2D7U2DAction_236e9131b0", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "pluginName", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["plugin.valid-name"]),
    .init(wireName: "serverName", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case accountId = "accountId"
    case action = "action"
    case label = "label"
    case pluginName = "pluginName"
    case serverName = "serverName"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.accountId = try container.decode(RemoteField<String>.self, forKey: .accountId)
    self.action = try container.decode(ProcedurehexVoiceRequestU2DOptionU2D7U2DAction_236e9131b0.self, forKey: .action)
    self.label = try container.decode(String.self, forKey: .label)
    self.pluginName = try container.decode(String.self, forKey: .pluginName)
    self.serverName = try container.decode(String.self, forKey: .serverName)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(accountId, forKey: .accountId)
    try container.encode(action, forKey: .action)
    try container.encode(label, forKey: .label)
    try container.encode(pluginName, forKey: .pluginName)
    try container.encode(serverName, forKey: .serverName)
  }
}

public enum ProcedurepluginAccountsRequestU2DOptionU2D3U2DAction_12d1900fc0: String, Codable, Sendable {
  case `select` = "select"
  case `logout` = "logout"
}

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
