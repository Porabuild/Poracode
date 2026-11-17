// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilities_93a8d764db: Codable, Sendable, RemoteModelMetadata {
  public var gui: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGui_6d501e487e> = .missing
  public var terminal: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGui_6d501e487e> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "gui", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGui_6d501e487e", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "terminal", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGui_6d501e487e", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case gui = "gui"
    case terminal = "terminal"
  }
}

public enum ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationMode_c9a954a3af: String, Codable, Sendable {
  case `terminal` = "terminal"
  case `gui` = "gui"
}

public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DThreadTitleCommandsU2DItem_8b1889f351: Codable, Sendable, RemoteModelMetadata {
  public var argumentSubcommands: RemoteField<[String]> = .missing
  public var command: String
  public var controlArguments: RemoteField<[String]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "argumentSubcommands", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "command", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "controlArguments", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case argumentSubcommands = "argumentSubcommands"
    case command = "command"
    case controlArguments = "controlArguments"
  }
}

public struct ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilities_de2055b6e4: Codable, Sendable, RemoteModelMetadata {
  public var agentSettingsDefaults: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaults_cff1242509> = .missing
  public var approvalPolicies: [ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd]
  public var bypassPermissions: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DBypassPermissions_edbbbb70d0> = .missing
  public var contextSizeChangeReloadsSession: RemoteField<Bool> = .missing
  public var contextSizeReloadStopsSubagents: RemoteField<Bool> = .missing
  public var contextSizes: RemoteField<[ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd]> = .missing
  public var crossagentMcpRouting: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DCrossagentMcpRouting_d1d29954f5> = .missing
  public var defaultApprovalPolicy: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var defaultApprovalsReviewer: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var defaultContextSize: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var defaultEffort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var defaultHiddenModels: RemoteField<[String]> = .missing
  public var defaultSandboxMode: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var disabledSkillNames: RemoteField<[String]> = .missing
  public var efforts: [String]
  public var fastDisabledReason: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var fastModels: RemoteField<[String]> = .missing
  public var liveInputMode: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DLiveInputMode_88480e7409
  public var liveVoice: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DLiveVoice_62c3e7fb25> = .missing
  public var mcpConfigSource: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpConfigSource_96776c817a> = .missing
  public var mcpScope: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpScope_65e6698fa7> = .missing
  public var modelContextSizes: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelContextSizes_e163a1a222> = .missing
  public var modelDefaultEfforts: RemoteField<ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67> = .missing
  public var modelEfforts: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelEfforts_b4a8e17084
  public var modelFamilies: RemoteField<[ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItem_1be1630ac3]> = .missing
  public var modelSubProvider: RemoteField<ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67> = .missing
  public var models: [ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd]
  public var modes: [ProcedureconnectThreadVoiceRequestU2DConfigU2DMode_01e21946e9]
  public var presentationCapabilities: RemoteField<ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilities_93a8d764db> = .missing
  public var presentationMode: ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationMode_c9a954a3af
  public var presentationModes: RemoteField<[ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6]> = .missing
  public var readsImageAttachmentsFromHost: RemoteField<Bool> = .missing
  public var readsPdfAttachmentsFromHost: RemoteField<Bool> = .missing
  public var reportsSkillCatalog: RemoteField<Bool> = .missing
  public var requiresTerminalFocusBeforeInput: RemoteField<Bool> = .missing
  public var requiresWorkspaceLocalAttachments: RemoteField<Bool> = .missing
  public var runtimeLabel: RemoteField<String> = .missing
  public var sandboxModes: [ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd]
  public var settingDefs: [ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa]
  public var showRuntimeLabelInPicker: RemoteField<Bool> = .missing
  public var slashCommands: RemoteField<[ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSlashCommandsU2DItem_7324613e41]> = .missing
  public var subProviders: RemoteField<[ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd]> = .missing
  public var supportsDirectInput: Bool
  public var supportsOneShot: RemoteField<Bool> = .missing
  public var supportsReadOnlyOneShotWorkspace: RemoteField<Bool> = .missing
  public var supportsResume: Bool
  public var supportsTextOnlyOneShot: RemoteField<Bool> = .missing
  public var thinkingModels: RemoteField<[String]> = .missing
  public var threadTitleCommands: RemoteField<[ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DThreadTitleCommandsU2DItem_8b1889f351]> = .missing
  public var utilityRank: RemoteField<Int64> = .missing
  public var workflowLabel: RemoteField<String> = .missing
  public var workflowModels: RemoteField<[String]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentSettingsDefaults", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DAgentSettingsDefaults_cff1242509", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "approvalPolicies", typeName: "[ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "bypassPermissions", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DBypassPermissions_edbbbb70d0", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "contextSizeChangeReloadsSession", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "contextSizeReloadStopsSubagents", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "contextSizes", typeName: "[ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "crossagentMcpRouting", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DCrossagentMcpRouting_d1d29954f5", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "defaultApprovalPolicy", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "defaultApprovalsReviewer", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "defaultContextSize", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "defaultEffort", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "defaultHiddenModels", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "defaultSandboxMode", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabledSkillNames", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "efforts", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fastDisabledReason", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fastModels", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "liveInputMode", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DLiveInputMode_88480e7409", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "liveVoice", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DLiveVoice_62c3e7fb25", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mcpConfigSource", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpConfigSource_96776c817a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mcpScope", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DMcpScope_65e6698fa7", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "modelContextSizes", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelContextSizes_e163a1a222", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "modelDefaultEfforts", typeName: "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "modelEfforts", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelEfforts_b4a8e17084", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "modelFamilies", typeName: "[ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DModelFamiliesU2DItem_1be1630ac3]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "modelSubProvider", typeName: "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "models", typeName: "[ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "modes", typeName: "[ProcedureconnectThreadVoiceRequestU2DConfigU2DMode_01e21946e9]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentationCapabilities", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilities_93a8d764db", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentationMode", typeName: "ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationMode_c9a954a3af", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentationModes", typeName: "[ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "readsImageAttachmentsFromHost", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "readsPdfAttachmentsFromHost", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reportsSkillCatalog", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "requiresTerminalFocusBeforeInput", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "requiresWorkspaceLocalAttachments", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeLabel", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sandboxModes", typeName: "[ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "settingDefs", typeName: "[ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItem_97d27c4efa]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "showRuntimeLabelInPicker", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "slashCommands", typeName: "[ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSlashCommandsU2DItem_7324613e41]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "subProviders", typeName: "[ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DApprovalPoliciesU2DItem_a59d7f7afd]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "supportsDirectInput", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "supportsOneShot", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "supportsReadOnlyOneShotWorkspace", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "supportsResume", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "supportsTextOnlyOneShot", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "thinkingModels", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadTitleCommands", typeName: "[ProcedurerefreshAgentStatusesResultU2DWindowsU2DItemU2DCapabilitiesU2DThreadTitleCommandsU2DItem_8b1889f351]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "utilityRank", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "workflowLabel", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "workflowModels", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentSettingsDefaults = "agentSettingsDefaults"
    case approvalPolicies = "approvalPolicies"
    case bypassPermissions = "bypassPermissions"
    case contextSizeChangeReloadsSession = "contextSizeChangeReloadsSession"
    case contextSizeReloadStopsSubagents = "contextSizeReloadStopsSubagents"
    case contextSizes = "contextSizes"
    case crossagentMcpRouting = "crossagentMcpRouting"
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
    case liveVoice = "liveVoice"
    case mcpConfigSource = "mcpConfigSource"
    case mcpScope = "mcpScope"
    case modelContextSizes = "modelContextSizes"
    case modelDefaultEfforts = "modelDefaultEfforts"
    case modelEfforts = "modelEfforts"
    case modelFamilies = "modelFamilies"
    case modelSubProvider = "modelSubProvider"
    case models = "models"
    case modes = "modes"
    case presentationCapabilities = "presentationCapabilities"
    case presentationMode = "presentationMode"
    case presentationModes = "presentationModes"
    case readsImageAttachmentsFromHost = "readsImageAttachmentsFromHost"
    case readsPdfAttachmentsFromHost = "readsPdfAttachmentsFromHost"
    case reportsSkillCatalog = "reportsSkillCatalog"
    case requiresTerminalFocusBeforeInput = "requiresTerminalFocusBeforeInput"
    case requiresWorkspaceLocalAttachments = "requiresWorkspaceLocalAttachments"
    case runtimeLabel = "runtimeLabel"
    case sandboxModes = "sandboxModes"
    case settingDefs = "settingDefs"
    case showRuntimeLabelInPicker = "showRuntimeLabelInPicker"
    case slashCommands = "slashCommands"
    case subProviders = "subProviders"
    case supportsDirectInput = "supportsDirectInput"
    case supportsOneShot = "supportsOneShot"
    case supportsReadOnlyOneShotWorkspace = "supportsReadOnlyOneShotWorkspace"
    case supportsResume = "supportsResume"
    case supportsTextOnlyOneShot = "supportsTextOnlyOneShot"
    case thinkingModels = "thinkingModels"
    case threadTitleCommands = "threadTitleCommands"
    case utilityRank = "utilityRank"
    case workflowLabel = "workflowLabel"
    case workflowModels = "workflowModels"
  }
}
