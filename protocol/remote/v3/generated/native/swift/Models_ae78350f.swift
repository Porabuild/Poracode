// GENERATED FILE. Do not edit by hand.
import Foundation
public enum ProceduremanageAgentPluginsResultU2DPackagesU2DItemU2DStatus_0488c0e7c6: String, Codable, Sendable {
  case `active` = "active"
  case `failed` = "failed"
  case `configured` = "configured"
}

public struct ProceduremanageAgentPluginsResultU2DPackagesU2DItem_e5b87d3305: Codable, Sendable, RemoteModelMetadata {
  public var id: RemoteField<String> = .missing
  public var latestVersion: RemoteField<String> = .missing
  public var outdated: Bool
  public var server: Bool
  public var status: ProceduremanageAgentPluginsResultU2DPackagesU2DItemU2DStatus_0488c0e7c6
  public var target: String
  public var terminal: Bool
  public var updating: RemoteField<Bool> = .missing
  public var version: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "latestVersion", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "outdated", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "server", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "ProceduremanageAgentPluginsResultU2DPackagesU2DItemU2DStatus_0488c0e7c6", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "target", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "terminal", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "updating", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case latestVersion = "latestVersion"
    case outdated = "outdated"
    case server = "server"
    case status = "status"
    case target = "target"
    case terminal = "terminal"
    case updating = "updating"
    case version = "version"
  }
}

public struct ProceduremanageAgentPluginsResult_50c013e0fb: Codable, Sendable, RemoteModelMetadata {
  public var packages: [ProceduremanageAgentPluginsResultU2DPackagesU2DItem_e5b87d3305]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "packages", typeName: "[ProceduremanageAgentPluginsResultU2DPackagesU2DItem_e5b87d3305]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case packages = "packages"
  }
}

public struct ProceduremanageModelProvidersRequestU2DOptionU2D1_7345318207: Codable, Sendable, RemoteModelMetadata {
  public var action: ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0
  public var agentKind: String
  public var env: ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProcedurehexVoiceRequestU2DOptionU2D5U2DAction_862e6a81a0", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "env", typeName: "ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case agentKind = "agentKind"
    case env = "env"
  }
}

public enum ProceduremanageModelProvidersRequestU2DOptionU2D2U2DAction_a2bcbae622: String, Codable, Sendable {
  case `save` = "save"
}

public enum ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURLU2DOptionU2D1_b426243b00: String, Codable, Sendable {
  case `anonymous` = ""
}

public enum ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURL_088c86edf1: Codable, Sendable {
  case option1(ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURLU2DOptionU2D1_b426243b00)
  case option2(String)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURL_088c86edf1)] = []
    if RemoteUnionProbe.matchesString(decoder, literals: [.string("")]), let value = try? container.decode(ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURLU2DOptionU2D1_b426243b00.self) {
      self = .option1(value); return
    }
    if RemoteUnionProbe.matchesString(decoder, maxLength: 2048), let value = try? container.decode(String.self) {
      self = .option2(value); return
    }
    throw DecodingError.typeMismatch(ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURL_088c86edf1.self, .init(codingPath: decoder.codingPath, debugDescription: "No union option matched ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURL_088c86edf1"))
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    }
  }
}

public enum ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DProtocol_14a995c938: String, Codable, Sendable {
  case `openaiU2DCompletions` = "openai-completions"
  case `openaiU2DResponses` = "openai-responses"
  case `anthropicU2DMessages` = "anthropic-messages"
}

public struct ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProvider_9b6b648329: Codable, Sendable, RemoteModelMetadata {
  public var baseURL: ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURL_088c86edf1
  public var id: String
  public var modelIds: [String]
  public var name: String
  public var protocolValue: ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DProtocol_14a995c938
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "baseURL", typeName: "ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURL_088c86edf1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: "^[^\\p{Cc}]+$", format: nil, semanticValidatorIds: ["model-provider.id-safe"]),
    .init(wireName: "modelIds", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 200, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 256, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "protocol", typeName: "ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DProtocol_14a995c938", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case baseURL = "baseURL"
    case id = "id"
    case modelIds = "modelIds"
    case name = "name"
    case protocolValue = "protocol"
  }
}

public struct ProceduremanageModelProvidersRequestU2DOptionU2D2_6554493bfa: Codable, Sendable, RemoteModelMetadata {
  public var action: ProceduremanageModelProvidersRequestU2DOptionU2D2U2DAction_a2bcbae622
  public var agentKind: String
  public var apiKey: RemoteField<String> = .missing
  public var create: Bool
  public var env: ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992
  public var provider: ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProvider_9b6b648329
  public var revision: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProceduremanageModelProvidersRequestU2DOptionU2D2U2DAction_a2bcbae622", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "apiKey", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 16384, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "create", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "env", typeName: "ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "provider", typeName: "ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProvider_9b6b648329", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "revision", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case agentKind = "agentKind"
    case apiKey = "apiKey"
    case create = "create"
    case env = "env"
    case provider = "provider"
    case revision = "revision"
  }
}

public enum ProceduremanageModelProvidersRequestU2DOptionU2D3U2DAction_034741cb26: String, Codable, Sendable {
  case `remove` = "remove"
}

public struct ProceduremanageModelProvidersRequestU2DOptionU2D3_f51831115e: Codable, Sendable, RemoteModelMetadata {
  public var action: ProceduremanageModelProvidersRequestU2DOptionU2D3U2DAction_034741cb26
  public var agentKind: String
  public var env: ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992
  public var providerId: String
  public var revision: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "action", typeName: "ProceduremanageModelProvidersRequestU2DOptionU2D3U2DAction_034741cb26", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "env", typeName: "ProcedureapplyNativeMcpSetupRequestU2DEnv_2583fd7992", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "revision", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case action = "action"
    case agentKind = "agentKind"
    case env = "env"
    case providerId = "providerId"
    case revision = "revision"
  }
}

public enum ProceduremanageModelProvidersRequest_925f63aff8: Codable, Sendable {
  case option1(ProceduremanageModelProvidersRequestU2DOptionU2D1_7345318207)
  case option2(ProceduremanageModelProvidersRequestU2DOptionU2D2_6554493bfa)
  case option3(ProceduremanageModelProvidersRequestU2DOptionU2D3_f51831115e)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProceduremanageModelProvidersRequest_925f63aff8)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("list")]), let value = try? container.decode(ProceduremanageModelProvidersRequestU2DOptionU2D1_7345318207.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("save")]), let value = try? container.decode(ProceduremanageModelProvidersRequestU2DOptionU2D2_6554493bfa.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "action", literals: [.string("remove")]), let value = try? container.decode(ProceduremanageModelProvidersRequestU2DOptionU2D3_f51831115e.self) {
      matches.append((3, .option3(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched ProceduremanageModelProvidersRequest_925f63aff8" : "Ambiguous union ProceduremanageModelProvidersRequest_925f63aff8 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(ProceduremanageModelProvidersRequest_925f63aff8.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public typealias ProceduremanageModelProvidersResultU2DOptionU2D1U2DOk_b1c287ee97 = Bool

public enum ProceduremanageModelProvidersResultU2DOptionU2D1U2DReason_ca6c162ad5: String, Codable, Sendable {
  case `conflict` = "conflict"
  case `rejected` = "rejected"
  case `credential` = "credential"
}

public struct ProceduremanageModelProvidersResultU2DOptionU2D1_a8610758db: Codable, Sendable, RemoteModelMetadata {
  public var ok: ProceduremanageModelProvidersResultU2DOptionU2D1U2DOk_b1c287ee97
  public var reason: ProceduremanageModelProvidersResultU2DOptionU2D1U2DReason_ca6c162ad5
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "ok", typeName: "ProceduremanageModelProvidersResultU2DOptionU2D1U2DOk_b1c287ee97", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reason", typeName: "ProceduremanageModelProvidersResultU2DOptionU2D1U2DReason_ca6c162ad5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case ok = "ok"
    case reason = "reason"
  }
}

public struct ProceduremanageModelProvidersResultU2DOptionU2D2U2DCatalogU2DItem_e727dd4d36: Codable, Sendable, RemoteModelMetadata {
  public var baseURL: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var id: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public var name: ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "baseURL", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "ProcedureapplyNativeMcpSetupResultU2DCandidatesU2DItemU2DId_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case baseURL = "baseURL"
    case id = "id"
    case name = "name"
  }
}

public struct ProceduremanageModelProvidersResultU2DOptionU2D2U2DProvidersU2DItem_263fd4191f: Codable, Sendable, RemoteModelMetadata {
  public var baseURL: ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURL_088c86edf1
  public var credentialConfigured: Bool
  public var custom: Bool
  public var id: String
  public var modelIds: [String]
  public var name: String
  public var protocolValue: ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DProtocol_14a995c938
  public var removable: Bool
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "baseURL", typeName: "ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DBaseURL_088c86edf1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "credentialConfigured", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "custom", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: "^[^\\p{Cc}]+$", format: nil, semanticValidatorIds: ["model-provider.id-safe"]),
    .init(wireName: "modelIds", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 200, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 256, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "protocol", typeName: "ProceduremanageModelProvidersRequestU2DOptionU2D2U2DProviderU2DProtocol_14a995c938", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "removable", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case baseURL = "baseURL"
    case credentialConfigured = "credentialConfigured"
    case custom = "custom"
    case id = "id"
    case modelIds = "modelIds"
    case name = "name"
    case protocolValue = "protocol"
    case removable = "removable"
  }
}

public struct ProceduremanageModelProvidersResultU2DOptionU2D2_3f0ca82dd7: Codable, Sendable, RemoteModelMetadata {
  public var catalog: [ProceduremanageModelProvidersResultU2DOptionU2D2U2DCatalogU2DItem_e727dd4d36]
  public var ok: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1
  public var providers: [ProceduremanageModelProvidersResultU2DOptionU2D2U2DProvidersU2DItem_263fd4191f]
  public var revision: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "catalog", typeName: "[ProceduremanageModelProvidersResultU2DOptionU2D2U2DCatalogU2DItem_e727dd4d36]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ok", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DRolesU2DItemU2DNoEdits_d2dd3595e1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providers", typeName: "[ProceduremanageModelProvidersResultU2DOptionU2D2U2DProvidersU2DItem_263fd4191f]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "revision", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case catalog = "catalog"
    case ok = "ok"
    case providers = "providers"
    case revision = "revision"
  }
}

public enum ProceduremanageModelProvidersResult_7fdba00683: Codable, Sendable {
  case option1(ProceduremanageModelProvidersResultU2DOptionU2D1_a8610758db)
  case option2(ProceduremanageModelProvidersResultU2DOptionU2D2_3f0ca82dd7)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProceduremanageModelProvidersResult_7fdba00683)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "ok", literals: [.bool(false)]), let value = try? container.decode(ProceduremanageModelProvidersResultU2DOptionU2D1_a8610758db.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "ok", literals: [.bool(true)]), let value = try? container.decode(ProceduremanageModelProvidersResultU2DOptionU2D2_3f0ca82dd7.self) {
      matches.append((2, .option2(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched ProceduremanageModelProvidersResult_7fdba00683" : "Ambiguous union ProceduremanageModelProvidersResult_7fdba00683 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(ProceduremanageModelProvidersResult_7fdba00683.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
