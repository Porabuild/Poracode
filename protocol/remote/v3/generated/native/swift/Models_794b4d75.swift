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
  public var description: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = .missing
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
    .init(wireName: "description", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public enum ProceduremanageAgentCredentialsRequestU2DAction_336de6f9a1: String, Codable, Sendable {
  case `list` = "list"
  case `remove` = "remove"
}

public struct ProceduremanageAgentCredentialsRequest_ca5c527c98: Codable, Sendable, RemoteModelMetadata {
  public var action: ProceduremanageAgentCredentialsRequestU2DAction_336de6f9a1
  public var agentKind: String
  public var credentialId: RemoteField<String> = .missing
  public var env: ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProceduremanageAgentCredentialsRequestU2DAction_336de6f9a1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "credentialId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 512, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
    .init(wireName: "env", typeName: "ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = ["agent-credentials.id-required"]
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case agentKind = "agentKind"
    case credentialId = "credentialId"
    case env = "env"
  }
}

public struct ProceduremanageAgentCredentialsResultU2DProvidersU2DItem_0a5d0a3885: Codable, Sendable, RemoteModelMetadata {
  public var detail: RemoteField<String> = .missing
  public var id: RemoteField<String> = .missing
  public var label: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "detail", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case detail = "detail"
    case id = "id"
    case label = "label"
  }
}

public struct ProceduremanageAgentCredentialsResult_65ec808e7a: Codable, Sendable, RemoteModelMetadata {
  public var providers: [ProceduremanageAgentCredentialsResultU2DProvidersU2DItem_0a5d0a3885]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "providers", typeName: "[ProceduremanageAgentCredentialsResultU2DProvidersU2DItem_0a5d0a3885]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case providers = "providers"
  }
}

public enum ProceduremanageAgentPluginsRequestU2DAction_5deb110d95: String, Codable, Sendable {
  case `list` = "list"
  case `check` = "check"
  case `install` = "install"
  case `update` = "update"
  case `remove` = "remove"
}

public struct ProceduremanageAgentPluginsRequest_c61abfd0f3: Codable, Sendable, RemoteModelMetadata {
  public var action: ProceduremanageAgentPluginsRequestU2DAction_5deb110d95
  public var agentKind: String
  public var env: ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992
  public var target: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProceduremanageAgentPluginsRequestU2DAction_5deb110d95", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "env", typeName: "ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "target", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 512, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: ["string.trim"]),
  ]
  public static let semanticValidatorIds: [String] = ["agent-plugins.target-required"]
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case agentKind = "agentKind"
    case env = "env"
    case target = "target"
  }
}
