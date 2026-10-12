// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3_0fd7e0ac40: Codable, Sendable, RemoteModelMetadata {
  public var description: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var id: String
  public var name: String
  public var typeValue: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3U2DType_a5b7c88e39> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "description", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3U2DType_a5b7c88e39", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case description = "description"
    case id = "id"
    case name = "name"
    case typeValue = "type"
  }
}

public enum RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966: Codable, Sendable {
  case option1(RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1_cdc63841ca)
  case option2(RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2_8ab3ef50fe)
  case option3(RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3_0fd7e0ac40)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966)] = []
    if RemoteUnionProbe.matchesObject(decoder), let value = try? container.decode(RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1_cdc63841ca.self) {
      self = .option1(value); return
    }
    if RemoteUnionProbe.matchesObject(decoder), let value = try? container.decode(RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2_8ab3ef50fe.self) {
      self = .option2(value); return
    }
    if RemoteUnionProbe.matchesObject(decoder), let value = try? container.decode(RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3_0fd7e0ac40.self) {
      self = .option3(value); return
    }
    throw DecodingError.typeMismatch(RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966.self, .init(codingPath: decoder.codingPath, debugDescription: "No union option matched RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItem_9dee5b4966"))
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

public enum RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthState_2363c4dd0a: String, Codable, Sendable {
  case authenticated = "authenticated"
  case missing = "missing"
  case unknown = "unknown"
}

public enum RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b: Codable, Sendable {
  case option1(Bool)
  case option2(ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b)] = []
    if RemoteUnionProbe.matchesBool(decoder), let value = try? container.decode(Bool.self) {
      self = .option1(value); return
    }
    if RemoteUnionProbe.matchesString(decoder), let value = try? container.decode(ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b.self) {
      self = .option2(value); return
    }
    throw DecodingError.typeMismatch(RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b.self, .init(codingPath: decoder.codingPath, debugDescription: "No union option matched RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b"))
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    }
  }
}

public typealias RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaults_cff1242509 = [String: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b]

public struct RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd: Codable, Sendable, RemoteModelMetadata {
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

public struct RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DBypassPermissions_97dee2d496: Codable, Sendable, RemoteModelMetadata {
  public var approvalPolicy: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var sandboxMode: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "approvalPolicy", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sandboxMode", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case approvalPolicy = "approvalPolicy"
    case sandboxMode = "sandboxMode"
  }
}

public enum RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DCrossagentMcpRouting_d1d29954f5: String, Codable, Sendable {
  case threadU2DToken = "thread-token"
  case providerU2DSession = "provider-session"
}

public enum RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DLiveInputMode_88480e7409: String, Codable, Sendable {
  case terminal = "terminal"
  case server = "server"
}

public enum RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DLiveVoiceU2DTransport_9a8b3412f7: String, Codable, Sendable {
  case webrtc = "webrtc"
}

public struct RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DLiveVoice_62c3e7fb25: Codable, Sendable, RemoteModelMetadata {
  public var dataChannel: String
  public var transport: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DLiveVoiceU2DTransport_9a8b3412f7
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "dataChannel", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "transport", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DLiveVoiceU2DTransport_9a8b3412f7", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case dataChannel = "dataChannel"
    case transport = "transport"
  }
}

public enum RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DMcpConfigSource_96776c817a: String, Codable, Sendable {
  case thread = "thread"
  case agentSettings = "agentSettings"
}

public enum RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DMcpScopeU2DGui_38b68e422d: String, Codable, Sendable {
  case none = "none"
  case launch = "launch"
  case always = "always"
}

public struct RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DMcpScope_65e6698fa7: Codable, Sendable, RemoteModelMetadata {
  public var gui: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DMcpScopeU2DGui_38b68e422d> = .missing
  public var terminal: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DMcpScopeU2DGui_38b68e422d> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "gui", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DMcpScopeU2DGui_38b68e422d", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "terminal", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DMcpScopeU2DGui_38b68e422d", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case gui = "gui"
    case terminal = "terminal"
  }
}

public typealias RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelContextSizes_e163a1a222 = [String: [String]]

public typealias RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelEfforts_b4a8e17084 = [String: [String]]

public enum RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindingsU2DEffort_b6a98d4e6e: String, Codable, Sendable {
  case model = "model"
  case config = "config"
}

public struct RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindings_369773f703: Codable, Sendable, RemoteModelMetadata {
  public var effort: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindingsU2DEffort_b6a98d4e6e
  public var fast: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindingsU2DEffort_b6a98d4e6e
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "effort", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindingsU2DEffort_b6a98d4e6e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fast", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindingsU2DEffort_b6a98d4e6e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case effort = "effort"
    case fast = "fast"
  }
}

public struct RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DMembersU2DItem_413ace8627: Codable, Sendable, RemoteModelMetadata {
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

public struct RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DRedundantValues_47eb55b96b: Codable, Sendable, RemoteModelMetadata {
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

public struct RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DSelectorsU2DItemU2DOptionsU2DItem_85cd2a40f7: Codable, Sendable, RemoteModelMetadata {
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

public struct RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DSelectorsU2DItem_b4441316f1: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public var labelKey: String
  public var options: [RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DSelectorsU2DItemU2DOptionsU2DItem_85cd2a40f7]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "labelKey", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "options", typeName: "[RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DSelectorsU2DItemU2DOptionsU2DItem_85cd2a40f7]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 1, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case labelKey = "labelKey"
    case options = "options"
  }
}

public struct RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItem_1be1630ac3: Codable, Sendable, RemoteModelMetadata {
  public var bindings: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindings_369773f703
  public var label: String
  public var members: [RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DMembersU2DItem_413ace8627]
  public var model: String
  public var redundantValues: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DRedundantValues_47eb55b96b> = .missing
  public var selectors: [RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DSelectorsU2DItem_b4441316f1]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "bindings", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DBindings_369773f703", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "members", typeName: "[RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DMembersU2DItem_413ace8627]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 1, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "model", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "redundantValues", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DRedundantValues_47eb55b96b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "selectors", typeName: "[RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItemU2DSelectorsU2DItem_b4441316f1]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case bindings = "bindings"
    case label = "label"
    case members = "members"
    case model = "model"
    case redundantValues = "redundantValues"
    case selectors = "selectors"
  }
}

public enum RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DLiveInputMode_cb81a9dbb8: String, Codable, Sendable {
  case terminal = "terminal"
  case server = "server"
}

public enum RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D1U2DType_e841af2cbd: String, Codable, Sendable {
  case toggle = "toggle"
}

public struct RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D1_fb3dd6021c: Codable, Sendable, RemoteModelMetadata {
  public var defaultValue: Bool
  public var description: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var env: ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67
  public var key: String
  public var label: String
  public var platforms: RemoteField<[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]> = .missing
  public var typeValue: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D1U2DType_e841af2cbd
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "default", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "description", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "env", typeName: "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "key", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "platforms", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D1U2DType_e841af2cbd", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case defaultValue = "default"
    case description = "description"
    case env = "env"
    case key = "key"
    case label = "label"
    case platforms = "platforms"
    case typeValue = "type"
  }
}

public enum RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D2U2DType_36b9fe91ec: String, Codable, Sendable {
  case select = "select"
}

public struct RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D2_9c44204b65: Codable, Sendable, RemoteModelMetadata {
  public var defaultValue: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var description: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var envVar: String
  public var key: String
  public var label: String
  public var options: [RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd]
  public var platforms: RemoteField<[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]> = .missing
  public var typeValue: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D2U2DType_36b9fe91ec
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "default", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "description", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "envVar", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "key", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "options", typeName: "[RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "platforms", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D2U2DType_36b9fe91ec", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case defaultValue = "default"
    case description = "description"
    case envVar = "envVar"
    case key = "key"
    case label = "label"
    case options = "options"
    case platforms = "platforms"
    case typeValue = "type"
  }
}

public enum RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa: Codable, Sendable {
  case option1(RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D1_fb3dd6021c)
  case option2(RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D2_9c44204b65)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("toggle")]), let value = try? container.decode(RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D1_fb3dd6021c.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "type", literals: [.string("select")]), let value = try? container.decode(RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D2_9c44204b65.self) {
      matches.append((2, .option2(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa" : "Ambiguous union RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
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
