// GENERATED FILE. Do not edit by hand.
import Foundation
public typealias ProcedurereadThreadBackgroundTasksResult_f5906c75b7 = [ProcedurereadThreadBackgroundTasksResultU2DItem_ebe931a38f]

public enum ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItemU2DOptionU2D1U2DKind_236d6f96ed: String, Codable, Sendable {
  case `native` = "native"
}

public struct ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItemU2DOptionU2D1_c538d0467a: Codable, Sendable, RemoteModelMetadata {
  public var kind: ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItemU2DOptionU2D1U2DKind_236d6f96ed
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItemU2DOptionU2D1U2DKind_236d6f96ed", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
  }
}

public enum ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992: Codable, Sendable {
  case option1(ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItemU2DOptionU2D1_c538d0467a)
  case option2(ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("native")]), let value = try? container.decode(ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItemU2DOptionU2D1_c538d0467a.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("wsl")]), let value = try? container.decode(ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996.self) {
      matches.append((2, .option2(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992" : "Ambiguous union ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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

public struct ProcedurerefreshAgentStatusesRequestU2DScope_be6dbda06a: Codable, Sendable, RemoteModelMetadata {
  public var agentKinds: [String]
  public var envs: RemoteField<[ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKinds", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 1, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "envs", typeName: "[ProcedurerefreshAgentStatusesRequestU2DScopeU2DEnvsU2DItem_2583fd7992]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentKinds = "agentKinds"
    case envs = "envs"
  }
}

public struct ProcedurerefreshAgentStatusesRequest_0cf7156720: Codable, Sendable, RemoteModelMetadata {
  public var scope: RemoteField<ProcedurerefreshAgentStatusesRequestU2DScope_be6dbda06a> = .missing
  public var wslDistros: RemoteField<[String]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "scope", typeName: "ProcedurerefreshAgentStatusesRequestU2DScope_be6dbda06a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslDistros", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case scope = "scope"
    case wslDistros = "wslDistros"
  }
}

public enum ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1U2DType_aaf42afe3b: String, Codable, Sendable {
  case `envU5FVar` = "env_var"
}

public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1U2DVarsU2DItem_8103808258: Codable, Sendable, RemoteModelMetadata {
  public var label: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var name: String
  public var optional: RemoteField<Bool> = .missing
  public var secret: RemoteField<Bool> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "label", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "optional", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "secret", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case label = "label"
    case name = "name"
    case optional = "optional"
    case secret = "secret"
  }
}

public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1_cdc63841ca: Codable, Sendable, RemoteModelMetadata {
  public var description: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var id: String
  public var link: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var name: String
  public var typeValue: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1U2DType_aaf42afe3b
  public var vars: [ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1U2DVarsU2DItem_8103808258]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "description", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "link", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1U2DType_aaf42afe3b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "vars", typeName: "[ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1U2DVarsU2DItem_8103808258]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case description = "description"
    case id = "id"
    case link = "link"
    case name = "name"
    case typeValue = "type"
    case vars = "vars"
  }
}

public enum ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2U2DType_c4197e46f3: String, Codable, Sendable {
  case `terminal` = "terminal"
}

public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2_8ab3ef50fe: Codable, Sendable, RemoteModelMetadata {
  public var args: RemoteField<[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]> = .missing
  public var description: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var env: RemoteField<ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67> = .missing
  public var id: String
  public var name: String
  public var typeValue: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2U2DType_c4197e46f3
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "args", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "description", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "env", typeName: "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2U2DType_c4197e46f3", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case args = "args"
    case description = "description"
    case env = "env"
    case id = "id"
    case name = "name"
    case typeValue = "type"
  }
}

public enum ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3U2DType_a5b7c88e39: String, Codable, Sendable {
  case `agent` = "agent"
}

public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3_0fd7e0ac40: Codable, Sendable, RemoteModelMetadata {
  public var description: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var id: String
  public var name: String
  public var typeValue: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3U2DType_a5b7c88e39> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "description", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3U2DType_a5b7c88e39", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case description = "description"
    case id = "id"
    case name = "name"
    case typeValue = "type"
  }
}

public enum ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966: Codable, Sendable {
  case option1(ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1_cdc63841ca)
  case option2(ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2_8ab3ef50fe)
  case option3(ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3_0fd7e0ac40)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966)] = []
    if RemoteUnionProbe.matchesObject(decoder), let value = try? container.decode(ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1_cdc63841ca.self) {
      self = .option1(value); return
    }
    if RemoteUnionProbe.matchesObject(decoder), let value = try? container.decode(ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2_8ab3ef50fe.self) {
      self = .option2(value); return
    }
    if RemoteUnionProbe.matchesObject(decoder), let value = try? container.decode(ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3_0fd7e0ac40.self) {
      self = .option3(value); return
    }
    throw DecodingError.typeMismatch(ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966.self, .init(codingPath: decoder.codingPath, debugDescription: "No union option matched ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966"))
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

public enum ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DAuthState_2363c4dd0a: String, Codable, Sendable {
  case `authenticated` = "authenticated"
  case `missing` = "missing"
  case `unknown` = "unknown"
}

public enum ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b: Codable, Sendable {
  case option1(Bool)
  case option2(ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b)] = []
    if RemoteUnionProbe.matchesBool(decoder), let value = try? container.decode(Bool.self) {
      self = .option1(value); return
    }
    if RemoteUnionProbe.matchesString(decoder), let value = try? container.decode(ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b.self) {
      self = .option2(value); return
    }
    throw DecodingError.typeMismatch(ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b.self, .init(codingPath: decoder.codingPath, debugDescription: "No union option matched ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b"))
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    }
  }
}

public typealias ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaults_cff1242509 = [String: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b]

public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd: Codable, Sendable, RemoteModelMetadata {
  public var description: RemoteField<String> = .missing
  public var id: String
  public var label: String
  public var tooltipDescription: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "description", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tooltipDescription", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case description = "description"
    case id = "id"
    case label = "label"
    case tooltipDescription = "tooltipDescription"
  }
}

public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DBypassPermissions_edbbbb70d0: Codable, Sendable, RemoteModelMetadata {
  public var approvalPolicy: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var preferDeclaredApprovalPolicy: RemoteField<Bool> = .missing
  public var sandboxMode: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "approvalPolicy", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "preferDeclaredApprovalPolicy", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sandboxMode", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case approvalPolicy = "approvalPolicy"
    case preferDeclaredApprovalPolicy = "preferDeclaredApprovalPolicy"
    case sandboxMode = "sandboxMode"
  }
}

public enum ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DCrossagentMcpRouting_d1d29954f5: String, Codable, Sendable {
  case `threadU2DToken` = "thread-token"
  case `providerU2DSession` = "provider-session"
}

public enum ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DLiveInputMode_88480e7409: String, Codable, Sendable {
  case `terminal` = "terminal"
  case `server` = "server"
}

public enum ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DLiveVoiceU2DTransport_9a8b3412f7: String, Codable, Sendable {
  case `webrtc` = "webrtc"
}

public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DLiveVoice_62c3e7fb25: Codable, Sendable, RemoteModelMetadata {
  public var dataChannel: String
  public var transport: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DLiveVoiceU2DTransport_9a8b3412f7
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "dataChannel", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "transport", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DLiveVoiceU2DTransport_9a8b3412f7", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case dataChannel = "dataChannel"
    case transport = "transport"
  }
}

public enum ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpConfigSource_96776c817a: String, Codable, Sendable {
  case `thread` = "thread"
  case `agentSettings` = "agentSettings"
}

public enum ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpScopeU2DGui_38b68e422d: String, Codable, Sendable {
  case `none` = "none"
  case `launch` = "launch"
  case `always` = "always"
}

public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpScope_65e6698fa7: Codable, Sendable, RemoteModelMetadata {
  public var gui: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpScopeU2DGui_38b68e422d> = .missing
  public var terminal: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpScopeU2DGui_38b68e422d> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "gui", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpScopeU2DGui_38b68e422d", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "terminal", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpScopeU2DGui_38b68e422d", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case gui = "gui"
    case terminal = "terminal"
  }
}

public typealias ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelContextSizes_e163a1a222 = [String: [String]]

public typealias ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelEfforts_b4a8e17084 = [String: [String]]

public enum ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindingsU2DEffort_b6a98d4e6e: String, Codable, Sendable {
  case `model` = "model"
  case `config` = "config"
}

public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindings_369773f703: Codable, Sendable, RemoteModelMetadata {
  public var effort: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindingsU2DEffort_b6a98d4e6e
  public var fast: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindingsU2DEffort_b6a98d4e6e
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "effort", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindingsU2DEffort_b6a98d4e6e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fast", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindingsU2DEffort_b6a98d4e6e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case effort = "effort"
    case fast = "fast"
  }
}

public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DMembersU2DItem_413ace8627: Codable, Sendable, RemoteModelMetadata {
  public var effort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var fast: RemoteField<Bool> = .missing
  public var model: String
  public var selections: ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "effort", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fast", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "model", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "selections", typeName: "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case effort = "effort"
    case fast = "fast"
    case model = "model"
    case selections = "selections"
  }
}

public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DRedundantValues_47eb55b96b: Codable, Sendable, RemoteModelMetadata {
  public var contextSize: RemoteField<[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]> = .missing
  public var effort: RemoteField<[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]> = .missing
  public var fast: RemoteField<[Bool]> = .missing
  public var thinking: RemoteField<[Bool]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .reject
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "contextSize", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "effort", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fast", typeName: "[Bool]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "thinking", typeName: "[Bool]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case contextSize = "contextSize"
    case effort = "effort"
    case fast = "fast"
    case thinking = "thinking"
  }
  public init(from decoder: Decoder) throws {
    let all = try decoder.container(keyedBy: RemoteCodingKey.self).allKeys.map(\.stringValue)
    let known = Set(Self.fields.map(\.wireName))
    guard all.allSatisfy(known.contains) else { throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown field in strict object")) }
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.contextSize = try container.decode(RemoteField<[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]>.self, forKey: .contextSize)
    self.effort = try container.decode(RemoteField<[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]>.self, forKey: .effort)
    self.fast = try container.decode(RemoteField<[Bool]>.self, forKey: .fast)
    self.thinking = try container.decode(RemoteField<[Bool]>.self, forKey: .thinking)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(contextSize, forKey: .contextSize)
    try container.encode(effort, forKey: .effort)
    try container.encode(fast, forKey: .fast)
    try container.encode(thinking, forKey: .thinking)
  }
}

public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DSelectorsU2DItemU2DOptionsU2DItem_85cd2a40f7: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public var label: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case label = "label"
  }
}
