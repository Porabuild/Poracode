// GENERATED FILE. Do not edit by hand.
import Foundation
public enum RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8: String, Codable, Sendable {
  case `off` = "off"
  case `fix` = "fix"
  case `merge` = "merge"
}

public typealias RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22 = [String: Int64]

public struct RoutesettingsU2DReadResponseU2DSettingsU2DUsage_18dc352c9a: Codable, Sendable, RemoteModelMetadata {
  public var autoRefresh: Bool
  public var collapsedProviders: [ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]
  public var disabledProviders: [ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]
  public var providerOrder: [ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]
  public var providerRefreshIntervals: RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22
  public var refreshIntervalMinutes: Int64
  public var selectedRingGroups: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986
  public var showEstimatedCost: Bool
  public var showInSidebar: Bool
  public var sidebarHiddenProviders: [ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "autoRefresh", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "collapsedProviders", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabledProviders", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerOrder", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerRefreshIntervals", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refreshIntervalMinutes", typeName: "Int64", required: true, nullable: false, minimum: 2, maximum: 120, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "selectedRingGroups", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "showEstimatedCost", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "showInSidebar", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sidebarHiddenProviders", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case autoRefresh = "autoRefresh"
    case collapsedProviders = "collapsedProviders"
    case disabledProviders = "disabledProviders"
    case providerOrder = "providerOrder"
    case providerRefreshIntervals = "providerRefreshIntervals"
    case refreshIntervalMinutes = "refreshIntervalMinutes"
    case selectedRingGroups = "selectedRingGroups"
    case showEstimatedCost = "showEstimatedCost"
    case showInSidebar = "showInSidebar"
    case sidebarHiddenProviders = "sidebarHiddenProviders"
  }
}

public struct RoutesettingsU2DReadResponseU2DSettings_3c34bc0d5f: Codable, Sendable, RemoteModelMetadata {
  public var agentSettings: RoutesettingsU2DReadResponseU2DSettingsU2DAgentSettings_deb61378c1
  public var commitGenEffort: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var commitGenFast: Bool
  public var commitGenModel: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var commitGenProvider: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var commitGenSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = .missing
  public var conflictResolverEffort: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var conflictResolverFast: Bool
  public var conflictResolverModel: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var conflictResolverPresentationMode: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6
  public var conflictResolverProvider: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var conflictResolverSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = .missing
  public var crews: RemoteField<[RoutesettingsU2DReadResponseU2DSettingsU2DCrewsU2DItem_261c257787]> = .missing
  public var disabledAgents: [ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]
  public var disabledBuiltInMcpServers: RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServers_65899fb957
  public var enabledMcpServers: RoutesettingsU2DReadResponseU2DSettingsU2DEnabledMcpServers_2d677fb041
  public var experimentJudgeSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = .missing
  public var followUpBehavior: RoutesettingsU2DReadResponseU2DSettingsU2DFollowUpBehavior_6fcb1a55c0
  public var hiddenModels: RoutesettingsU2DReadResponseU2DSettingsU2DHiddenModels_86d5d72e84
  public var memory: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DMemory_df5d50a751> = .missing
  public var prAutomationDefault: RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8
  public var prMergeMethod: ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DMergeMethodsU2DItem_9c01de6b08
  public var providerOrder: [ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]
  public var searchExclude: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a> = .missing
  public var searchUseIgnoreFiles: RemoteField<Bool> = .missing
  public var titleGenEffort: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var titleGenFast: Bool
  public var titleGenModel: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var titleGenProvider: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var titleGenSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = .missing
  public var usage: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DUsage_18dc352c9a> = .missing
  public var worktreeBasePath: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var worktreeStorageMode: RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19
  public var wslCommitGenEffort: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var wslCommitGenFast: Bool
  public var wslCommitGenModel: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var wslCommitGenProvider: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var wslCommitGenSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = .missing
  public var wslConflictResolverEffort: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var wslConflictResolverFast: Bool
  public var wslConflictResolverModel: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var wslConflictResolverPresentationMode: ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6
  public var wslConflictResolverProvider: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var wslConflictResolverSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = .missing
  public var wslTitleGenEffort: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var wslTitleGenFast: Bool
  public var wslTitleGenModel: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var wslTitleGenProvider: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var wslTitleGenSelection: RemoteField<ProcedureextractContextRequestU2DSelection_32c3720f64> = .missing
  public var wslWorktreeBasePath: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentSettings", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DAgentSettings_deb61378c1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "commitGenEffort", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "commitGenFast", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "commitGenModel", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "commitGenProvider", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "commitGenSelection", typeName: "ProcedureextractContextRequestU2DSelection_32c3720f64", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "conflictResolverEffort", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "conflictResolverFast", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "conflictResolverModel", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "conflictResolverPresentationMode", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "conflictResolverProvider", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "conflictResolverSelection", typeName: "ProcedureextractContextRequestU2DSelection_32c3720f64", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "crews", typeName: "[RoutesettingsU2DReadResponseU2DSettingsU2DCrewsU2DItem_261c257787]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 24, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabledAgents", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabledBuiltInMcpServers", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServers_65899fb957", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "enabledMcpServers", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DEnabledMcpServers_2d677fb041", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "experimentJudgeSelection", typeName: "ProcedureextractContextRequestU2DSelection_32c3720f64", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "followUpBehavior", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DFollowUpBehavior_6fcb1a55c0", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "hiddenModels", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DHiddenModels_86d5d72e84", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "memory", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DMemory_df5d50a751", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prAutomationDefault", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prMergeMethod", typeName: "ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DMergeMethodsU2DItem_9c01de6b08", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerOrder", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "searchExclude", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "searchUseIgnoreFiles", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "titleGenEffort", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "titleGenFast", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "titleGenModel", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "titleGenProvider", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "titleGenSelection", typeName: "ProcedureextractContextRequestU2DSelection_32c3720f64", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "usage", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DUsage_18dc352c9a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeBasePath", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeStorageMode", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslCommitGenEffort", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslCommitGenFast", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslCommitGenModel", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslCommitGenProvider", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslCommitGenSelection", typeName: "ProcedureextractContextRequestU2DSelection_32c3720f64", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslConflictResolverEffort", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslConflictResolverFast", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslConflictResolverModel", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslConflictResolverPresentationMode", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBindingU2DOwnerU2DPresentationMode_6508684ba6", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslConflictResolverProvider", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslConflictResolverSelection", typeName: "ProcedureextractContextRequestU2DSelection_32c3720f64", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslTitleGenEffort", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslTitleGenFast", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslTitleGenModel", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslTitleGenProvider", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslTitleGenSelection", typeName: "ProcedureextractContextRequestU2DSelection_32c3720f64", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslWorktreeBasePath", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentSettings = "agentSettings"
    case commitGenEffort = "commitGenEffort"
    case commitGenFast = "commitGenFast"
    case commitGenModel = "commitGenModel"
    case commitGenProvider = "commitGenProvider"
    case commitGenSelection = "commitGenSelection"
    case conflictResolverEffort = "conflictResolverEffort"
    case conflictResolverFast = "conflictResolverFast"
    case conflictResolverModel = "conflictResolverModel"
    case conflictResolverPresentationMode = "conflictResolverPresentationMode"
    case conflictResolverProvider = "conflictResolverProvider"
    case conflictResolverSelection = "conflictResolverSelection"
    case crews = "crews"
    case disabledAgents = "disabledAgents"
    case disabledBuiltInMcpServers = "disabledBuiltInMcpServers"
    case enabledMcpServers = "enabledMcpServers"
    case experimentJudgeSelection = "experimentJudgeSelection"
    case followUpBehavior = "followUpBehavior"
    case hiddenModels = "hiddenModels"
    case memory = "memory"
    case prAutomationDefault = "prAutomationDefault"
    case prMergeMethod = "prMergeMethod"
    case providerOrder = "providerOrder"
    case searchExclude = "searchExclude"
    case searchUseIgnoreFiles = "searchUseIgnoreFiles"
    case titleGenEffort = "titleGenEffort"
    case titleGenFast = "titleGenFast"
    case titleGenModel = "titleGenModel"
    case titleGenProvider = "titleGenProvider"
    case titleGenSelection = "titleGenSelection"
    case usage = "usage"
    case worktreeBasePath = "worktreeBasePath"
    case worktreeStorageMode = "worktreeStorageMode"
    case wslCommitGenEffort = "wslCommitGenEffort"
    case wslCommitGenFast = "wslCommitGenFast"
    case wslCommitGenModel = "wslCommitGenModel"
    case wslCommitGenProvider = "wslCommitGenProvider"
    case wslCommitGenSelection = "wslCommitGenSelection"
    case wslConflictResolverEffort = "wslConflictResolverEffort"
    case wslConflictResolverFast = "wslConflictResolverFast"
    case wslConflictResolverModel = "wslConflictResolverModel"
    case wslConflictResolverPresentationMode = "wslConflictResolverPresentationMode"
    case wslConflictResolverProvider = "wslConflictResolverProvider"
    case wslConflictResolverSelection = "wslConflictResolverSelection"
    case wslTitleGenEffort = "wslTitleGenEffort"
    case wslTitleGenFast = "wslTitleGenFast"
    case wslTitleGenModel = "wslTitleGenModel"
    case wslTitleGenProvider = "wslTitleGenProvider"
    case wslTitleGenSelection = "wslTitleGenSelection"
    case wslWorktreeBasePath = "wslWorktreeBasePath"
  }
}

public struct RoutesettingsU2DReadResponse_c97f9f21e9: Codable, Sendable, RemoteModelMetadata {
  public var settings: RoutesettingsU2DReadResponseU2DSettings_3c34bc0d5f
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "settings", typeName: "RoutesettingsU2DReadResponseU2DSettings_3c34bc0d5f", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case settings = "settings"
  }
}

public typealias RoutesettingsU2DWriteRequestU2DDisabledBuiltInMcpServers_79608b5ece = [String: Bool]

public enum RoutesettingsU2DWriteRequestU2DFollowUpBehavior_49162371ff: String, Codable, Sendable {
  case `steer` = "steer"
  case `queue` = "queue"
}

public struct RoutesettingsU2DWriteRequestU2DMemory_5b89bc4512: Codable, Sendable, RemoteModelMetadata {
  public var archiveUnusedDays: RemoteField<Int64> = .missing
  public var captureCustomMinutes: RemoteField<Int64> = .missing
  public var captureEffort: RemoteField<String> = .missing
  public var captureFast: RemoteField<Bool> = .missing
  public var captureModel: RemoteField<String> = .missing
  public var captureProvider: RemoteField<String> = .missing
  public var captureTiming: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DMemoryU2DCaptureTiming_b0eed3c52a> = .missing
  public var deletePolicy: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DMemoryU2DDeletePolicy_b5556f3ec1> = .missing
  public var dreamCadence: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DMemoryU2DDreamCadence_51fc9e0635> = .missing
  public var dreamEffort: RemoteField<String> = .missing
  public var dreamFast: RemoteField<Bool> = .missing
  public var dreamModel: RemoteField<String> = .missing
  public var dreamProvider: RemoteField<String> = .missing
  public var enabled: RemoteField<Bool> = .missing
  public var learning: RemoteField<Bool> = .missing
  public var sessionTokenBudget: RemoteField<Int64> = .missing
  public var skillThreshold: RemoteField<Int64> = .missing
  public var suggestSkills: RemoteField<Bool> = .missing
  public var suppressNative: RemoteField<Bool> = .missing
  public var syncEnabled: RemoteField<Bool> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "archiveUnusedDays", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 3650, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "captureCustomMinutes", typeName: "Int64", required: false, nullable: false, minimum: 1, maximum: 240, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "captureEffort", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "captureFast", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "captureModel", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "captureProvider", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "captureTiming", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DMemoryU2DCaptureTiming_b0eed3c52a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "deletePolicy", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DMemoryU2DDeletePolicy_b5556f3ec1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "dreamCadence", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DMemoryU2DDreamCadence_51fc9e0635", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "dreamEffort", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "dreamFast", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "dreamModel", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "dreamProvider", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "enabled", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "learning", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sessionTokenBudget", typeName: "Int64", required: false, nullable: false, minimum: 200, maximum: 8000, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "skillThreshold", typeName: "Int64", required: false, nullable: false, minimum: 2, maximum: 20, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "suggestSkills", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "suppressNative", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "syncEnabled", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case archiveUnusedDays = "archiveUnusedDays"
    case captureCustomMinutes = "captureCustomMinutes"
    case captureEffort = "captureEffort"
    case captureFast = "captureFast"
    case captureModel = "captureModel"
    case captureProvider = "captureProvider"
    case captureTiming = "captureTiming"
    case deletePolicy = "deletePolicy"
    case dreamCadence = "dreamCadence"
    case dreamEffort = "dreamEffort"
    case dreamFast = "dreamFast"
    case dreamModel = "dreamModel"
    case dreamProvider = "dreamProvider"
    case enabled = "enabled"
    case learning = "learning"
    case sessionTokenBudget = "sessionTokenBudget"
    case skillThreshold = "skillThreshold"
    case suggestSkills = "suggestSkills"
    case suppressNative = "suppressNative"
    case syncEnabled = "syncEnabled"
  }
}

public struct RoutesettingsU2DWriteRequestU2DUsage_b6aaa17d32: Codable, Sendable, RemoteModelMetadata {
  public var autoRefresh: RemoteField<Bool> = .missing
  public var collapsedProviders: RemoteField<[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]> = .missing
  public var disabledProviders: RemoteField<[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]> = .missing
  public var providerOrder: RemoteField<[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]> = .missing
  public var providerRefreshIntervals: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22> = .missing
  public var refreshIntervalMinutes: RemoteField<Int64> = .missing
  public var selectedRingGroups: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986> = .missing
  public var showEstimatedCost: RemoteField<Bool> = .missing
  public var showInSidebar: RemoteField<Bool> = .missing
  public var sidebarHiddenProviders: RemoteField<[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "autoRefresh", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "collapsedProviders", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabledProviders", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerOrder", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerRefreshIntervals", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refreshIntervalMinutes", typeName: "Int64", required: false, nullable: false, minimum: 2, maximum: 120, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "selectedRingGroups", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "showEstimatedCost", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "showInSidebar", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sidebarHiddenProviders", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case autoRefresh = "autoRefresh"
    case collapsedProviders = "collapsedProviders"
    case disabledProviders = "disabledProviders"
    case providerOrder = "providerOrder"
    case providerRefreshIntervals = "providerRefreshIntervals"
    case refreshIntervalMinutes = "refreshIntervalMinutes"
    case selectedRingGroups = "selectedRingGroups"
    case showEstimatedCost = "showEstimatedCost"
    case showInSidebar = "showInSidebar"
    case sidebarHiddenProviders = "sidebarHiddenProviders"
  }
}
