// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProcedureimportSkillsRequest_8a62b43ffe: Codable, Sendable, RemoteModelMetadata {
  public var skills: [ProcedureimportSkillsRequestU2DSkillsU2DItem_a02c812507]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "skills", typeName: "[ProcedureimportSkillsRequestU2DSkillsU2DItem_a02c812507]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 1, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case skills = "skills"
  }
}

public struct ProcedureimportSkillsResult_82088d0ad1: Codable, Sendable, RemoteModelMetadata {
  public var imported: [ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "imported", typeName: "[ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case imported = "imported"
  }
}

public struct ProcedureinstallAcpRegistryAgentRequest_e484765a09: Codable, Sendable, RemoteModelMetadata {
  public var agentId: String
  public var target: RemoteField<ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "target", typeName: "ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentId = "agentId"
    case target = "target"
  }
}

public enum ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallKind_e5d4267d1d: String, Codable, Sendable {
  case `firstU2DClass` = "first-class"
  case `generic` = "generic"
}

public struct ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DNative_e1b186e080: Codable, Sendable, RemoteModelMetadata {
  public var installedAt: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var layoutVersion: RemoteField<Int64> = .missing
  public var target: String
  public var version: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "installedAt", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "layoutVersion", typeName: "Int64", required: false, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "target", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case installedAt = "installedAt"
    case layoutVersion = "layoutVersion"
    case target = "target"
    case version = "version"
  }
}

public typealias ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DWsl_e374b60989 = [String: ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DNative_e1b186e080]

public struct ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallations_9e2c34c258: Codable, Sendable, RemoteModelMetadata {
  public var native: RemoteField<ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DNative_e1b186e080> = .missing
  public var wsl: RemoteField<ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DWsl_e374b60989> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "native", typeName: "ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DNative_e1b186e080", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wsl", typeName: "ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DWsl_e374b60989", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case native = "native"
    case wsl = "wsl"
  }
}

public struct ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItem_76767b687c: Codable, Sendable, RemoteModelMetadata {
  public var adapterKind: String
  public var icon: RemoteField<ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b> = .missing
  public var id: String
  public var installKind: ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallKind_e5d4267d1d
  public var installations: RemoteField<ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallations_9e2c34c258> = .missing
  public var installedAt: String
  public var name: String
  public var version: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "adapterKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "icon", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "installKind", typeName: "ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallKind_e5d4267d1d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "installations", typeName: "ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallations_9e2c34c258", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "installedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case adapterKind = "adapterKind"
    case icon = "icon"
    case id = "id"
    case installKind = "installKind"
    case installations = "installations"
    case installedAt = "installedAt"
    case name = "name"
    case version = "version"
  }
}

public struct ProcedureinstallAcpRegistryAgentResult_4e9b40f602: Codable, Sendable, RemoteModelMetadata {
  public var installed: [ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItem_76767b687c]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "installed", typeName: "[ProcedureinstallAcpRegistryAgentResultU2DInstalledU2DItem_76767b687c]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case installed = "installed"
  }
}

public struct ProcedureinstallAgentHookPluginResult_482260ac5d: Codable, Sendable, RemoteModelMetadata {
  public var status: ProceduregetAgentHookPluginStatusesResultU2DItem_0f487f7300
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "status", typeName: "ProceduregetAgentHookPluginStatusesResultU2DItem_0f487f7300", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case status = "status"
  }
}

public enum ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa: String, Codable, Sendable {
  case `skillsU2DSh` = "skills-sh"
  case `skillsU2DDirectory` = "skills-directory"
}

public struct ProcedureinstallMarketplaceSkillRequest_0093611cbb: Codable, Sendable, RemoteModelMetadata {
  public var availability: RemoteField<ProcedureimportSkillsRequestU2DSkillsU2DItemU2DAvailability_9c8337f42f> = .missing
  public var destinationScope: ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11
  public var marketplace: ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa
  public var marketplaceSkillId: String
  public var projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = .missing
  public var replace: RemoteField<Bool> = .missing
  public var wslDistro: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "availability", typeName: "ProcedureimportSkillsRequestU2DSkillsU2DItemU2DAvailability_9c8337f42f", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "destinationScope", typeName: "ProcedureeditQueuedThreadFollowUpRequestU2DSegmentsU2DItemU2DOptionU2D5U2DScope_ac6ea0fc11", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "marketplace", typeName: "ProcedureinstallMarketplaceSkillRequestU2DMarketplace_118f67a0fa", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "marketplaceSkillId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "replace", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslDistro", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case availability = "availability"
    case destinationScope = "destinationScope"
    case marketplace = "marketplace"
    case marketplaceSkillId = "marketplaceSkillId"
    case projectLocation = "projectLocation"
    case replace = "replace"
    case wslDistro = "wslDistro"
  }
}

public struct ProcedureinstallMarketplaceSkillResult_d6e0ba68c8: Codable, Sendable, RemoteModelMetadata {
  public var installed: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "installed", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case installed = "installed"
  }
}

public struct ProcedureinvokeThreadSessionActionRequest_f614b14ae0: Codable, Sendable, RemoteModelMetadata {
  public var actionId: String
  public var payload: ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3U2DArguments_e6958017da
  public var threadId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "actionId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "payload", typeName: "ProcedurecontrolMcpAppRequestU2DActionU2DOptionU2D3U2DArguments_e6958017da", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case actionId = "actionId"
    case payload = "payload"
    case threadId = "threadId"
  }
}

public struct ProcedurelistAcpRegistryRequest_81055c9199: Codable, Sendable, RemoteModelMetadata {
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
  ]
  public static let semanticValidatorIds: [String] = []
}

public struct ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistributionU2DBinaryU2DValue_6cb914aa86: Codable, Sendable, RemoteModelMetadata {
  public var archive: String
  public var args: RemoteField<[ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]> = .missing
  public var cmd: String
  public var env: RemoteField<ProceduregetAgentConfigDefaultsResultU2DDefaults_e51d77fd67> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "archive", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: "uri", semanticValidatorIds: []),
    .init(wireName: "args", typeName: "[ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cmd", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "env", typeName: "ProceduregetAgentConfigDefaultsResultU2DDefaults_e51d77fd67", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case archive = "archive"
    case args = "args"
    case cmd = "cmd"
    case env = "env"
  }
}

public typealias ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistributionU2DBinary_c4f6ed0673 = [String: ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistributionU2DBinaryU2DValue_6cb914aa86]

public struct ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistributionU2DNpx_a987d8a0eb: Codable, Sendable, RemoteModelMetadata {
  public var args: RemoteField<[ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]> = .missing
  public var env: RemoteField<ProceduregetAgentConfigDefaultsResultU2DDefaults_e51d77fd67> = .missing
  public var package: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "args", typeName: "[ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "env", typeName: "ProceduregetAgentConfigDefaultsResultU2DDefaults_e51d77fd67", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "package", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case args = "args"
    case env = "env"
    case package = "package"
  }
}

public struct ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistribution_97a8dc6944: Codable, Sendable, RemoteModelMetadata {
  public var binary: RemoteField<ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistributionU2DBinary_c4f6ed0673> = .missing
  public var npx: RemoteField<ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistributionU2DNpx_a987d8a0eb> = .missing
  public var uvx: RemoteField<ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistributionU2DNpx_a987d8a0eb> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "binary", typeName: "ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistributionU2DBinary_c4f6ed0673", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "npx", typeName: "ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistributionU2DNpx_a987d8a0eb", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "uvx", typeName: "ProcedurelistAcpRegistryResultU2DAgentsU2DItemU2DDistributionU2DNpx_a987d8a0eb", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case binary = "binary"
    case npx = "npx"
    case uvx = "uvx"
  }
}
