// GENERATED FILE. Do not edit by hand.
import Foundation
public enum RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b: Codable, Sendable {
  case option1(Bool)
  case option2(String)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaultsU2DValue_2b4ffb830b)] = []
    if RemoteUnionProbe.matchesBool(decoder), let value = try? container.decode(Bool.self) {
      self = .option1(value); return
    }
    if RemoteUnionProbe.matchesString(decoder), let value = try? container.decode(String.self) {
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
  public var approvalPolicy: RemoteField<String> = .missing
  public var sandboxMode: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "approvalPolicy", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sandboxMode", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public enum RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DLiveInputMode_cb81a9dbb8: String, Codable, Sendable {
  case terminal = "terminal"
  case server = "server"
}

public enum RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D1U2DType_e841af2cbd: String, Codable, Sendable {
  case toggle = "toggle"
}

public struct RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D1_fb3dd6021c: Codable, Sendable, RemoteModelMetadata {
  public var defaultValue: Bool
  public var description: String
  public var env: ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67
  public var key: String
  public var label: String
  public var platforms: RemoteField<[String]> = .missing
  public var typeValue: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D1U2DType_e841af2cbd
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "default", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "description", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "env", typeName: "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "key", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "platforms", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
  public var defaultValue: String
  public var description: String
  public var envVar: String
  public var key: String
  public var label: String
  public var options: [RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd]
  public var platforms: RemoteField<[String]> = .missing
  public var typeValue: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D2U2DType_36b9fe91ec
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "default", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "description", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "envVar", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "key", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "options", typeName: "[RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "platforms", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public struct RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGui_97f51a15a8: Codable, Sendable, RemoteModelMetadata {
  public var approvalPolicies: RemoteField<[RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd]> = .missing
  public var bypassPermissions: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DBypassPermissions_97dee2d496> = .missing
  public var contextSizes: RemoteField<[RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd]> = .missing
  public var defaultApprovalPolicy: RemoteField<String> = .missing
  public var defaultApprovalsReviewer: RemoteField<String> = .missing
  public var defaultContextSize: RemoteField<String> = .missing
  public var defaultEffort: RemoteField<String> = .missing
  public var defaultHiddenModels: RemoteField<[String]> = .missing
  public var defaultSandboxMode: RemoteField<String> = .missing
  public var disabledSkillNames: RemoteField<[String]> = .missing
  public var efforts: RemoteField<[String]> = .missing
  public var fastDisabledReason: RemoteField<String> = .missing
  public var fastModels: RemoteField<[String]> = .missing
  public var liveInputMode: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DLiveInputMode_cb81a9dbb8> = .missing
  public var modelContextSizes: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelContextSizes_e163a1a222> = .missing
  public var modelDefaultEfforts: RemoteField<ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67> = .missing
  public var modelEfforts: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelContextSizes_e163a1a222> = .missing
  public var modelSubProvider: RemoteField<ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67> = .missing
  public var models: RemoteField<[RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd]> = .missing
  public var modes: RemoteField<[ProcedurerollbackThreadConversationRequestU2DConfigU2DMode_01e21946e9]> = .missing
  public var presentationMode: RemoteField<ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6> = .missing
  public var presentationModes: RemoteField<[ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6]> = .missing
  public var requiresTerminalFocusBeforeInput: RemoteField<Bool> = .missing
  public var runtimeLabel: RemoteField<String> = .missing
  public var sandboxModes: RemoteField<[RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd]> = .missing
  public var settingDefs: RemoteField<[RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa]> = .missing
  public var showRuntimeLabelInPicker: RemoteField<Bool> = .missing
  public var slashCommands: RemoteField<[RouteagentU2DSlashU2DCommandsResponseU2DCommandsU2DItem_7324613e41]> = .missing
  public var subProviders: RemoteField<[RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd]> = .missing
  public var supportsDirectInput: RemoteField<Bool> = .missing
  public var supportsResume: RemoteField<Bool> = .missing
  public var thinkingModels: RemoteField<[String]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "approvalPolicies", typeName: "[RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "bypassPermissions", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DBypassPermissions_97dee2d496", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "contextSizes", typeName: "[RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "defaultApprovalPolicy", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "defaultApprovalsReviewer", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "defaultContextSize", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "defaultEffort", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "defaultHiddenModels", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "defaultSandboxMode", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabledSkillNames", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "efforts", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fastDisabledReason", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fastModels", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "liveInputMode", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DLiveInputMode_cb81a9dbb8", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "modelContextSizes", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelContextSizes_e163a1a222", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "modelDefaultEfforts", typeName: "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "modelEfforts", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DModelContextSizes_e163a1a222", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "modelSubProvider", typeName: "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "models", typeName: "[RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "modes", typeName: "[ProcedurerollbackThreadConversationRequestU2DConfigU2DMode_01e21946e9]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentationMode", typeName: "ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentationModes", typeName: "[ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "requiresTerminalFocusBeforeInput", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeLabel", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sandboxModes", typeName: "[RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "settingDefs", typeName: "[RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "showRuntimeLabelInPicker", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "slashCommands", typeName: "[RouteagentU2DSlashU2DCommandsResponseU2DCommandsU2DItem_7324613e41]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "subProviders", typeName: "[RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "supportsDirectInput", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "supportsResume", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "thinkingModels", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case approvalPolicies = "approvalPolicies"
    case bypassPermissions = "bypassPermissions"
    case contextSizes = "contextSizes"
    case defaultApprovalPolicy = "defaultApprovalPolicy"
    case defaultApprovalsReviewer = "defaultApprovalsReviewer"
    case defaultContextSize = "defaultContextSize"
    case defaultEffort = "defaultEffort"
    case defaultHiddenModels = "defaultHiddenModels"
    case defaultSandboxMode = "defaultSandboxMode"
    case disabledSkillNames = "disabledSkillNames"
    case efforts = "efforts"
    case fastDisabledReason = "fastDisabledReason"
    case fastModels = "fastModels"
    case liveInputMode = "liveInputMode"
    case modelContextSizes = "modelContextSizes"
    case modelDefaultEfforts = "modelDefaultEfforts"
    case modelEfforts = "modelEfforts"
    case modelSubProvider = "modelSubProvider"
    case models = "models"
    case modes = "modes"
    case presentationMode = "presentationMode"
    case presentationModes = "presentationModes"
    case requiresTerminalFocusBeforeInput = "requiresTerminalFocusBeforeInput"
    case runtimeLabel = "runtimeLabel"
    case sandboxModes = "sandboxModes"
    case settingDefs = "settingDefs"
    case showRuntimeLabelInPicker = "showRuntimeLabelInPicker"
    case slashCommands = "slashCommands"
    case subProviders = "subProviders"
    case supportsDirectInput = "supportsDirectInput"
    case supportsResume = "supportsResume"
    case thinkingModels = "thinkingModels"
  }
}

public struct RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilities_baebb62c82: Codable, Sendable, RemoteModelMetadata {
  public var gui: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGui_97f51a15a8> = .missing
  public var terminal: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGui_97f51a15a8> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "gui", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGui_97f51a15a8", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "terminal", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGui_97f51a15a8", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case gui = "gui"
    case terminal = "terminal"
  }
}

public enum RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationMode_c9a954a3af: String, Codable, Sendable {
  case terminal = "terminal"
  case gui = "gui"
}
