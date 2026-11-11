// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProceduresubagentSubscribeResult_d4ae5f8c2b: Codable, Sendable, RemoteModelMetadata {
  public var history: [ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "history", typeName: "[ProceduresubagentSubscribeResultU2DHistoryU2DItem_9262f6553e]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case history = "history"
  }
}

public struct ProcedureupdateAcpRegistryAgentRequest_e484765a09: Codable, Sendable, RemoteModelMetadata {
  public var agentId: String
  public var target: RemoteField<ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "target", typeName: "ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentId = "agentId"
    case target = "target"
  }
}

public enum ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallKind_e5d4267d1d: String, Codable, Sendable {
  case `firstU2DClass` = "first-class"
  case `generic` = "generic"
}

public struct ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DNative_e1b186e080: Codable, Sendable, RemoteModelMetadata {
  public var installedAt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var layoutVersion: RemoteField<Int64> = .missing
  public var target: String
  public var version: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "installedAt", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public typealias ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DWsl_e374b60989 = [String: ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DNative_e1b186e080]

public struct ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallations_9e2c34c258: Codable, Sendable, RemoteModelMetadata {
  public var native: RemoteField<ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DNative_e1b186e080> = .missing
  public var wsl: RemoteField<ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DWsl_e374b60989> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "native", typeName: "ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DNative_e1b186e080", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wsl", typeName: "ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallationsU2DWsl_e374b60989", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case native = "native"
    case wsl = "wsl"
  }
}

public struct ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItem_76767b687c: Codable, Sendable, RemoteModelMetadata {
  public var adapterKind: String
  public var icon: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var id: String
  public var installKind: ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallKind_e5d4267d1d
  public var installations: RemoteField<ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallations_9e2c34c258> = .missing
  public var installedAt: String
  public var name: String
  public var version: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "adapterKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "icon", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "installKind", typeName: "ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallKind_e5d4267d1d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "installations", typeName: "ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItemU2DInstallations_9e2c34c258", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public struct ProcedureupdateAcpRegistryAgentResult_4e9b40f602: Codable, Sendable, RemoteModelMetadata {
  public var installed: [ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItem_76767b687c]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "installed", typeName: "[ProcedureupdateAcpRegistryAgentResultU2DInstalledU2DItem_76767b687c]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case installed = "installed"
  }
}

public struct ProcedureupdateAgentBinaryRequest_580654e207: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: String
  public var envKind: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DEnvKind_9eed5c4959
  public var wslDistro: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "envKind", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DEnvKind_9eed5c4959", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslDistro", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentKind = "agentKind"
    case envKind = "envKind"
    case wslDistro = "wslDistro"
  }
}

public enum ProcedureupdateAgentBinaryResultU2DStrategy_b82b9e494d: String, Codable, Sendable {
  case `builtU2DIn` = "built-in"
  case `npmU2DGlobal` = "npm-global"
  case `pnpmU2DGlobal` = "pnpm-global"
  case `bunU2DGlobal` = "bun-global"
  case `brew` = "brew"
  case `winget` = "winget"
  case `installer` = "installer"
  case `unsupported` = "unsupported"
}

public struct ProcedureupdateAgentBinaryResult_0d863fe350: Codable, Sendable, RemoteModelMetadata {
  public var ok: Bool
  public var output: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var strategy: RemoteField<ProcedureupdateAgentBinaryResultU2DStrategy_b82b9e494d> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "ok", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "output", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "strategy", typeName: "ProcedureupdateAgentBinaryResultU2DStrategy_b82b9e494d", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case ok = "ok"
    case output = "output"
    case strategy = "strategy"
  }
}

public struct ProcedurewaitMcpServerOauthRequest_e9df8b4f3d: Codable, Sendable, RemoteModelMetadata {
  public var flowId: String
  public var projectLocation: RemoteField<ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "flowId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case flowId = "flowId"
    case projectLocation = "projectLocation"
  }
}

public enum ProcedurewaitMcpServerOauthResult_51cc694dc5: Codable, Sendable {
  case option1(ProcedurebeginMcpServerOauthResultU2DOptionU2D1_47fd370c6d)
  case option2(ProcedurebeginMcpServerOauthResultU2DOptionU2D3_43639d56ca)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedurewaitMcpServerOauthResult_51cc694dc5)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "status", literals: [.string("authorized")]), let value = try? container.decode(ProcedurebeginMcpServerOauthResultU2DOptionU2D1_47fd370c6d.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "status", literals: [.string("error")]), let value = try? container.decode(ProcedurebeginMcpServerOauthResultU2DOptionU2D3_43639d56ca.self) {
      matches.append((2, .option2(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched ProcedurewaitMcpServerOauthResult_51cc694dc5" : "Ambiguous union ProcedurewaitMcpServerOauthResult_51cc694dc5 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(ProcedurewaitMcpServerOauthResult_51cc694dc5.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct ProcedureworkflowAgentChatRequest_014d2dfae8: Codable, Sendable, RemoteModelMetadata {
  public var agentFinished: Bool
  public var agentId: String
  public var location: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public var threadId: String
  public var transcriptDir: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentFinished", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "agentId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "location", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "transcriptDir", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentFinished = "agentFinished"
    case agentId = "agentId"
    case location = "location"
    case threadId = "threadId"
    case transcriptDir = "transcriptDir"
  }
}
