// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProcedurelistProjectTreeRequest_26cfea8cde: Codable, Sendable, RemoteModelMetadata {
  public var directoryPath: RemoteField<String> = .missing
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "directoryPath", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case directoryPath = "directoryPath"
    case projectLocation = "projectLocation"
  }
}

public struct ProcedurelistProjectTreeResultU2DEntriesU2DItem_c073582d4f: Codable, Sendable, RemoteModelMetadata {
  public var hasChildren: RemoteField<Bool> = .missing
  public var name: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var path: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var typeValue: ProcedurebrowseHostDirectoryResultU2DEntriesU2DItemU2DType_8d3732b59a
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "hasChildren", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProcedurebrowseHostDirectoryResultU2DEntriesU2DItemU2DType_8d3732b59a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case hasChildren = "hasChildren"
    case name = "name"
    case path = "path"
    case typeValue = "type"
  }
}

public struct ProcedurelistProjectTreeResult_ccd3eb53d3: Codable, Sendable, RemoteModelMetadata {
  public var directoryPath: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var entries: [ProcedurelistProjectTreeResultU2DEntriesU2DItem_c073582d4f]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "directoryPath", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "entries", typeName: "[ProcedurelistProjectTreeResultU2DEntriesU2DItem_c073582d4f]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case directoryPath = "directoryPath"
    case entries = "entries"
  }
}

public enum ProcedurelistSkillMarketplaceRequestU2DSort_1eaf563a1e: String, Codable, Sendable {
  case rank = "rank"
  case stars = "stars"
  case recent = "recent"
  case votes = "votes"
}

public struct ProcedurelistSkillMarketplaceRequest_828172bf17: Codable, Sendable, RemoteModelMetadata {
  public var marketplace: ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa
  public var query: RemoteField<String> = .missing
  public var sort: RemoteField<ProcedurelistSkillMarketplaceRequestU2DSort_1eaf563a1e> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "marketplace", typeName: "ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "query", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 200, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sort", typeName: "ProcedurelistSkillMarketplaceRequestU2DSort_1eaf563a1e", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case marketplace = "marketplace"
    case query = "query"
    case sort = "sort"
  }
}

public enum ProcedurelistSkillMarketplaceResultU2DSkillsU2DItemU2DSecurityGrade_e987f23b08: String, Codable, Sendable {
  case a = "A"
  case b = "B"
  case c = "C"
  case d = "D"
  case f = "F"
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

public enum ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironmentU2DRuntime_1f6ff7bae5: String, Codable, Sendable {
  case host = "host"
  case wsl = "wsl"
}

public struct ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d: Codable, Sendable, RemoteModelMetadata {
  public var projectScoped: Bool
  public var runtime: ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironmentU2DRuntime_1f6ff7bae5
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "projectScoped", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtime", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironmentU2DRuntime_1f6ff7bae5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case projectScoped = "projectScoped"
    case runtime = "runtime"
  }
}

public struct ProcedureprobeMcpServerResultU2DOptionU2D1U2DServerInfo_820293e02a: Codable, Sendable, RemoteModelMetadata {
  public var name: RemoteField<String> = .missing
  public var version: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "name", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case name = "name"
    case version = "version"
  }
}

public enum ProcedureprobeMcpServerResultU2DOptionU2D1U2DStatus_7ce40fcb9f: String, Codable, Sendable {
  case available = "available"
}

public struct ProcedureprobeMcpServerResultU2DOptionU2D1_d92866345c: Codable, Sendable, RemoteModelMetadata {
  public var environment: ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d
  public var latencyMs: Int64
  public var serverInfo: RemoteField<ProcedureprobeMcpServerResultU2DOptionU2D1U2DServerInfo_820293e02a> = .missing
  public var status: ProcedureprobeMcpServerResultU2DOptionU2D1U2DStatus_7ce40fcb9f
  public var toolCount: Int64
  public var tools: RemoteField<[String]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "environment", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "latencyMs", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "serverInfo", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D1U2DServerInfo_820293e02a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D1U2DStatus_7ce40fcb9f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "toolCount", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tools", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case environment = "environment"
    case latencyMs = "latencyMs"
    case serverInfo = "serverInfo"
    case status = "status"
    case toolCount = "toolCount"
    case tools = "tools"
  }
}

public enum ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DAuthScheme_2d52ff1140: String, Codable, Sendable {
  case oauth = "oauth"
  case bearer = "bearer"
  case other = "other"
  case unknown = "unknown"
}

public enum ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29: String, Codable, Sendable {
  case authU2DRequired = "auth-required"
}

public struct ProcedureprobeMcpServerResultU2DOptionU2D2U2DError_f145218b6d: Codable, Sendable, RemoteModelMetadata {
  public var authScheme: RemoteField<ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DAuthScheme_2d52ff1140> = .missing
  public var code: ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29
  public var message: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "authScheme", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DAuthScheme_2d52ff1140", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "code", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "message", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case authScheme = "authScheme"
    case code = "code"
    case message = "message"
  }
}

public typealias ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5 = Double

public struct ProcedureprobeMcpServerResultU2DOptionU2D2_8ace86d01d: Codable, Sendable, RemoteModelMetadata {
  public var environment: ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d
  public var error: ProcedureprobeMcpServerResultU2DOptionU2D2U2DError_f145218b6d
  public var latencyMs: Int64
  public var status: ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29
  public var toolCount: ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "environment", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "error", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D2U2DError_f145218b6d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "latencyMs", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DCode_e527c3ee29", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "toolCount", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case environment = "environment"
    case error = "error"
    case latencyMs = "latencyMs"
    case status = "status"
    case toolCount = "toolCount"
  }
}

public enum ProcedureprobeMcpServerResultU2DOptionU2D3U2DErrorU2DCode_2fb9be13c5: String, Codable, Sendable {
  case authU2DRequired = "auth-required"
  case timeout = "timeout"
  case commandU2DNotU2DFound = "command-not-found"
  case connectionU2DFailed = "connection-failed"
  case protocolU2DError = "protocol-error"
  case invalidU2DConfig = "invalid-config"
  case probeU2DUnavailable = "probe-unavailable"
}

public struct ProcedureprobeMcpServerResultU2DOptionU2D3U2DError_5cb704413f: Codable, Sendable, RemoteModelMetadata {
  public var authScheme: RemoteField<ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DAuthScheme_2d52ff1140> = .missing
  public var code: ProcedureprobeMcpServerResultU2DOptionU2D3U2DErrorU2DCode_2fb9be13c5
  public var message: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "authScheme", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D2U2DErrorU2DAuthScheme_2d52ff1140", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "code", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D3U2DErrorU2DCode_2fb9be13c5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "message", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case authScheme = "authScheme"
    case code = "code"
    case message = "message"
  }
}

public enum ProcedureprobeMcpServerResultU2DOptionU2D3U2DStatus_fd6258ac65: String, Codable, Sendable {
  case unavailable = "unavailable"
}

public struct ProcedureprobeMcpServerResultU2DOptionU2D3_2a43ea36a6: Codable, Sendable, RemoteModelMetadata {
  public var environment: ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d
  public var error: ProcedureprobeMcpServerResultU2DOptionU2D3U2DError_5cb704413f
  public var latencyMs: Int64
  public var status: ProcedureprobeMcpServerResultU2DOptionU2D3U2DStatus_fd6258ac65
  public var toolCount: ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "environment", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D1U2DEnvironment_6b3ef80f7d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "error", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D3U2DError_5cb704413f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "latencyMs", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D3U2DStatus_fd6258ac65", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "toolCount", typeName: "ProcedureprobeMcpServerResultU2DOptionU2D2U2DToolCount_499c88c1c5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case environment = "environment"
    case error = "error"
    case latencyMs = "latencyMs"
    case status = "status"
    case toolCount = "toolCount"
  }
}

public enum ProcedureprobeMcpServerResult_bea1bdef18: Codable, Sendable {
  case option1(ProcedureprobeMcpServerResultU2DOptionU2D1_d92866345c)
  case option2(ProcedureprobeMcpServerResultU2DOptionU2D2_8ace86d01d)
  case option3(ProcedureprobeMcpServerResultU2DOptionU2D3_2a43ea36a6)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedureprobeMcpServerResult_bea1bdef18)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "status", literals: [.string("available")]), let value = try? container.decode(ProcedureprobeMcpServerResultU2DOptionU2D1_d92866345c.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "status", literals: [.string("auth-required")]), let value = try? container.decode(ProcedureprobeMcpServerResultU2DOptionU2D2_8ace86d01d.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "status", literals: [.string("unavailable")]), let value = try? container.decode(ProcedureprobeMcpServerResultU2DOptionU2D3_2a43ea36a6.self) {
      matches.append((3, .option3(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched ProcedureprobeMcpServerResult_bea1bdef18" : "Ambiguous union ProcedureprobeMcpServerResult_bea1bdef18 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(ProcedureprobeMcpServerResult_bea1bdef18.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct ProcedurequeueThreadFollowUpRequest_d62bd4c56f: Codable, Sendable, RemoteModelMetadata {
  public var clientContext: RemoteField<ProcedureensureThreadRunningRequestU2DClientContext_ee890c7da4> = .missing
  public var config: ProcedureconnectThreadVoiceRequestU2DConfig_023567f089
  public var prompt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var segments: RemoteField<[ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754]> = .missing
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "clientContext", typeName: "ProcedureensureThreadRunningRequestU2DClientContext_ee890c7da4", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "ProcedureconnectThreadVoiceRequestU2DConfig_023567f089", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prompt", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "segments", typeName: "[ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItem_a399fbc754]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case clientContext = "clientContext"
    case config = "config"
    case prompt = "prompt"
    case segments = "segments"
    case threadId = "threadId"
  }
}
