// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RoutesettingsU2DReadResponseU2DSettingsU2DUsage_18dc352c9a: Codable, Sendable, RemoteModelMetadata {
  public var autoRefresh: Bool
  public var collapsedProviders: [String]
  public var disabledProviders: [String]
  public var providerOrder: [String]
  public var providerRefreshIntervals: RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22
  public var refreshIntervalMinutes: Int64
  public var selectedRingGroups: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986
  public var showEstimatedCost: Bool
  public var showInSidebar: Bool
  public var sidebarHiddenProviders: [String]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "autoRefresh", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "collapsedProviders", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabledProviders", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerOrder", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerRefreshIntervals", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refreshIntervalMinutes", typeName: "Int64", required: true, nullable: false, minimum: 2, maximum: 120, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "selectedRingGroups", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "showEstimatedCost", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "showInSidebar", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sidebarHiddenProviders", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public struct RoutesettingsU2DReadResponseU2DSettings_57f3fe3c43: Codable, Sendable, RemoteModelMetadata {
  public var agentSettings: RoutesettingsU2DReadResponseU2DSettingsU2DAgentSettings_deb61378c1
  public var commitGenEffort: String
  public var commitGenFast: Bool
  public var commitGenModel: String
  public var commitGenProvider: String
  public var conflictResolverEffort: String
  public var conflictResolverFast: Bool
  public var conflictResolverModel: String
  public var conflictResolverPresentationMode: ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6
  public var conflictResolverProvider: String
  public var disabledAgents: [String]
  public var disabledBuiltInMcpServers: RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServers_65899fb957
  public var enabledMcpServers: RoutesettingsU2DReadResponseU2DSettingsU2DEnabledMcpServers_2d677fb041
  public var hiddenModels: RoutesettingsU2DReadResponseU2DSettingsU2DHiddenModels_86d5d72e84
  public var prAutomationDefault: RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8
  public var prMergeMethod: RoutesettingsU2DReadResponseU2DSettingsU2DPrMergeMethod_9c01de6b08
  public var providerOrder: [String]
  public var searchExclude: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a> = .missing
  public var searchUseIgnoreFiles: RemoteField<Bool> = .missing
  public var titleGenEffort: String
  public var titleGenFast: Bool
  public var titleGenModel: String
  public var titleGenProvider: String
  public var usage: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DUsage_18dc352c9a> = .missing
  public var worktreeBasePath: String
  public var worktreeStorageMode: RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19
  public var wslCommitGenEffort: String
  public var wslCommitGenFast: Bool
  public var wslCommitGenModel: String
  public var wslCommitGenProvider: String
  public var wslConflictResolverEffort: String
  public var wslConflictResolverFast: Bool
  public var wslConflictResolverModel: String
  public var wslConflictResolverPresentationMode: ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6
  public var wslConflictResolverProvider: String
  public var wslTitleGenEffort: String
  public var wslTitleGenFast: Bool
  public var wslTitleGenModel: String
  public var wslTitleGenProvider: String
  public var wslWorktreeBasePath: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentSettings", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DAgentSettings_deb61378c1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "commitGenEffort", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "commitGenFast", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "commitGenModel", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "commitGenProvider", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "conflictResolverEffort", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "conflictResolverFast", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "conflictResolverModel", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "conflictResolverPresentationMode", typeName: "ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "conflictResolverProvider", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabledAgents", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabledBuiltInMcpServers", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DDisabledBuiltInMcpServers_65899fb957", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "enabledMcpServers", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DEnabledMcpServers_2d677fb041", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "hiddenModels", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DHiddenModels_86d5d72e84", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prAutomationDefault", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prMergeMethod", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DPrMergeMethod_9c01de6b08", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerOrder", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "searchExclude", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "searchUseIgnoreFiles", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "titleGenEffort", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "titleGenFast", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "titleGenModel", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "titleGenProvider", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "usage", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DUsage_18dc352c9a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeBasePath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeStorageMode", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslCommitGenEffort", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslCommitGenFast", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslCommitGenModel", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslCommitGenProvider", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslConflictResolverEffort", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslConflictResolverFast", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslConflictResolverModel", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslConflictResolverPresentationMode", typeName: "ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslConflictResolverProvider", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslTitleGenEffort", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslTitleGenFast", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslTitleGenModel", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslTitleGenProvider", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslWorktreeBasePath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentSettings = "agentSettings"
    case commitGenEffort = "commitGenEffort"
    case commitGenFast = "commitGenFast"
    case commitGenModel = "commitGenModel"
    case commitGenProvider = "commitGenProvider"
    case conflictResolverEffort = "conflictResolverEffort"
    case conflictResolverFast = "conflictResolverFast"
    case conflictResolverModel = "conflictResolverModel"
    case conflictResolverPresentationMode = "conflictResolverPresentationMode"
    case conflictResolverProvider = "conflictResolverProvider"
    case disabledAgents = "disabledAgents"
    case disabledBuiltInMcpServers = "disabledBuiltInMcpServers"
    case enabledMcpServers = "enabledMcpServers"
    case hiddenModels = "hiddenModels"
    case prAutomationDefault = "prAutomationDefault"
    case prMergeMethod = "prMergeMethod"
    case providerOrder = "providerOrder"
    case searchExclude = "searchExclude"
    case searchUseIgnoreFiles = "searchUseIgnoreFiles"
    case titleGenEffort = "titleGenEffort"
    case titleGenFast = "titleGenFast"
    case titleGenModel = "titleGenModel"
    case titleGenProvider = "titleGenProvider"
    case usage = "usage"
    case worktreeBasePath = "worktreeBasePath"
    case worktreeStorageMode = "worktreeStorageMode"
    case wslCommitGenEffort = "wslCommitGenEffort"
    case wslCommitGenFast = "wslCommitGenFast"
    case wslCommitGenModel = "wslCommitGenModel"
    case wslCommitGenProvider = "wslCommitGenProvider"
    case wslConflictResolverEffort = "wslConflictResolverEffort"
    case wslConflictResolverFast = "wslConflictResolverFast"
    case wslConflictResolverModel = "wslConflictResolverModel"
    case wslConflictResolverPresentationMode = "wslConflictResolverPresentationMode"
    case wslConflictResolverProvider = "wslConflictResolverProvider"
    case wslTitleGenEffort = "wslTitleGenEffort"
    case wslTitleGenFast = "wslTitleGenFast"
    case wslTitleGenModel = "wslTitleGenModel"
    case wslTitleGenProvider = "wslTitleGenProvider"
    case wslWorktreeBasePath = "wslWorktreeBasePath"
  }
}

public struct RoutesettingsU2DReadResponse_cb1609a78d: Codable, Sendable, RemoteModelMetadata {
  public var settings: RoutesettingsU2DReadResponseU2DSettings_57f3fe3c43
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "settings", typeName: "RoutesettingsU2DReadResponseU2DSettings_57f3fe3c43", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case settings = "settings"
  }
}

public typealias RoutesettingsU2DWriteRequestU2DDisabledBuiltInMcpServers_79608b5ece = [String: Bool]

public struct RoutesettingsU2DWriteRequestU2DUsage_b6aaa17d32: Codable, Sendable, RemoteModelMetadata {
  public var autoRefresh: RemoteField<Bool> = .missing
  public var collapsedProviders: RemoteField<[String]> = .missing
  public var disabledProviders: RemoteField<[String]> = .missing
  public var providerOrder: RemoteField<[String]> = .missing
  public var providerRefreshIntervals: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22> = .missing
  public var refreshIntervalMinutes: RemoteField<Int64> = .missing
  public var selectedRingGroups: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986> = .missing
  public var showEstimatedCost: RemoteField<Bool> = .missing
  public var showInSidebar: RemoteField<Bool> = .missing
  public var sidebarHiddenProviders: RemoteField<[String]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "autoRefresh", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "collapsedProviders", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabledProviders", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerOrder", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerRefreshIntervals", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DUsageU2DProviderRefreshIntervals_ea08f63f22", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refreshIntervalMinutes", typeName: "Int64", required: false, nullable: false, minimum: 2, maximum: 120, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "selectedRingGroups", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DEnv_c3ac213986", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "showEstimatedCost", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "showInSidebar", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sidebarHiddenProviders", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public struct RoutesettingsU2DWriteRequest_b5c2da7c66: Codable, Sendable, RemoteModelMetadata {
  public var agentSettings: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DAgentSettings_deb61378c1> = .missing
  public var commitGenEffort: RemoteField<String> = .missing
  public var commitGenFast: RemoteField<Bool> = .missing
  public var commitGenModel: RemoteField<String> = .missing
  public var commitGenProvider: RemoteField<String> = .missing
  public var conflictResolverEffort: RemoteField<String> = .missing
  public var conflictResolverFast: RemoteField<Bool> = .missing
  public var conflictResolverModel: RemoteField<String> = .missing
  public var conflictResolverPresentationMode: RemoteField<ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6> = .missing
  public var conflictResolverProvider: RemoteField<String> = .missing
  public var disabledAgents: RemoteField<[String]> = .missing
  public var disabledBuiltInMcpServers: RemoteField<RoutesettingsU2DWriteRequestU2DDisabledBuiltInMcpServers_79608b5ece> = .missing
  public var enabledMcpServers: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a> = .missing
  public var hiddenModels: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DHiddenModels_86d5d72e84> = .missing
  public var prAutomationDefault: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8> = .missing
  public var prMergeMethod: RemoteField<RoutesettingsU2DReadResponseU2DSettingsU2DPrMergeMethod_9c01de6b08> = .missing
  public var providerOrder: RemoteField<[String]> = .missing
  public var searchExclude: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a> = .missing
  public var searchUseIgnoreFiles: RemoteField<Bool> = .missing
  public var titleGenEffort: RemoteField<String> = .missing
  public var titleGenFast: RemoteField<Bool> = .missing
  public var titleGenModel: RemoteField<String> = .missing
  public var titleGenProvider: RemoteField<String> = .missing
  public var usage: RemoteField<RoutesettingsU2DWriteRequestU2DUsage_b6aaa17d32> = .missing
  public var worktreeBasePath: RemoteField<String> = .missing
  public var worktreeStorageMode: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19> = .missing
  public var wslCommitGenEffort: RemoteField<String> = .missing
  public var wslCommitGenFast: RemoteField<Bool> = .missing
  public var wslCommitGenModel: RemoteField<String> = .missing
  public var wslCommitGenProvider: RemoteField<String> = .missing
  public var wslConflictResolverEffort: RemoteField<String> = .missing
  public var wslConflictResolverFast: RemoteField<Bool> = .missing
  public var wslConflictResolverModel: RemoteField<String> = .missing
  public var wslConflictResolverPresentationMode: RemoteField<ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6> = .missing
  public var wslConflictResolverProvider: RemoteField<String> = .missing
  public var wslTitleGenEffort: RemoteField<String> = .missing
  public var wslTitleGenFast: RemoteField<Bool> = .missing
  public var wslTitleGenModel: RemoteField<String> = .missing
  public var wslTitleGenProvider: RemoteField<String> = .missing
  public var wslWorktreeBasePath: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentSettings", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DAgentSettings_deb61378c1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "commitGenEffort", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "commitGenFast", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "commitGenModel", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "commitGenProvider", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "conflictResolverEffort", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "conflictResolverFast", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "conflictResolverModel", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "conflictResolverPresentationMode", typeName: "ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "conflictResolverProvider", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabledAgents", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabledBuiltInMcpServers", typeName: "RoutesettingsU2DWriteRequestU2DDisabledBuiltInMcpServers_79608b5ece", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "enabledMcpServers", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "hiddenModels", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DHiddenModels_86d5d72e84", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prAutomationDefault", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DPrAutomationDefault_6df05d56a8", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prMergeMethod", typeName: "RoutesettingsU2DReadResponseU2DSettingsU2DPrMergeMethod_9c01de6b08", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerOrder", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "searchExclude", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "searchUseIgnoreFiles", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "titleGenEffort", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "titleGenFast", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "titleGenModel", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "titleGenProvider", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "usage", typeName: "RoutesettingsU2DWriteRequestU2DUsage_b6aaa17d32", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeBasePath", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeStorageMode", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslCommitGenEffort", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslCommitGenFast", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslCommitGenModel", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslCommitGenProvider", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslConflictResolverEffort", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslConflictResolverFast", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslConflictResolverModel", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslConflictResolverPresentationMode", typeName: "ProcedurescanSkillsRequestU2DPresentationMode_6508684ba6", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslConflictResolverProvider", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslTitleGenEffort", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslTitleGenFast", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslTitleGenModel", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslTitleGenProvider", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "wslWorktreeBasePath", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentSettings = "agentSettings"
    case commitGenEffort = "commitGenEffort"
    case commitGenFast = "commitGenFast"
    case commitGenModel = "commitGenModel"
    case commitGenProvider = "commitGenProvider"
    case conflictResolverEffort = "conflictResolverEffort"
    case conflictResolverFast = "conflictResolverFast"
    case conflictResolverModel = "conflictResolverModel"
    case conflictResolverPresentationMode = "conflictResolverPresentationMode"
    case conflictResolverProvider = "conflictResolverProvider"
    case disabledAgents = "disabledAgents"
    case disabledBuiltInMcpServers = "disabledBuiltInMcpServers"
    case enabledMcpServers = "enabledMcpServers"
    case hiddenModels = "hiddenModels"
    case prAutomationDefault = "prAutomationDefault"
    case prMergeMethod = "prMergeMethod"
    case providerOrder = "providerOrder"
    case searchExclude = "searchExclude"
    case searchUseIgnoreFiles = "searchUseIgnoreFiles"
    case titleGenEffort = "titleGenEffort"
    case titleGenFast = "titleGenFast"
    case titleGenModel = "titleGenModel"
    case titleGenProvider = "titleGenProvider"
    case usage = "usage"
    case worktreeBasePath = "worktreeBasePath"
    case worktreeStorageMode = "worktreeStorageMode"
    case wslCommitGenEffort = "wslCommitGenEffort"
    case wslCommitGenFast = "wslCommitGenFast"
    case wslCommitGenModel = "wslCommitGenModel"
    case wslCommitGenProvider = "wslCommitGenProvider"
    case wslConflictResolverEffort = "wslConflictResolverEffort"
    case wslConflictResolverFast = "wslConflictResolverFast"
    case wslConflictResolverModel = "wslConflictResolverModel"
    case wslConflictResolverPresentationMode = "wslConflictResolverPresentationMode"
    case wslConflictResolverProvider = "wslConflictResolverProvider"
    case wslTitleGenEffort = "wslTitleGenEffort"
    case wslTitleGenFast = "wslTitleGenFast"
    case wslTitleGenModel = "wslTitleGenModel"
    case wslTitleGenProvider = "wslTitleGenProvider"
    case wslWorktreeBasePath = "wslWorktreeBasePath"
  }
}

public struct RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValueU2DProject_83470ce639: Codable, Sendable, RemoteModelMetadata {
  public var hostId: String
  public var projectId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "hostId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case hostId = "hostId"
    case projectId = "projectId"
  }
}

public struct RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValue_a20681cb35: Codable, Sendable, RemoteModelMetadata {
  public var project: RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValueU2DProject_83470ce639
  public var pullRequestKeys: [String]
  public var refreshedAt: String
  public var viewerLogin: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "project", typeName: "RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValueU2DProject_83470ce639", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pullRequestKeys", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refreshedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "viewerLogin", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case project = "project"
    case pullRequestKeys = "pullRequestKeys"
    case refreshedAt = "refreshedAt"
    case viewerLogin = "viewerLogin"
  }
}

public typealias RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestLists_d8ae5c3a60 = [String: RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValue_a20681cb35]

public struct RouteshellU2DSnapshotResponseU2DGitStateU2DProjectsU2DValue_18a5d3fa6e: Codable, Sendable, RemoteModelMetadata {
  public var branches: RemoteField<ProceduregitListBranchesResult_458a450839> = .missing
  public var ghAvailable: RemoteField<Bool> = .missing
  public var ref: RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValueU2DProject_83470ce639
  public var refreshedAt: String
  public var status: RemoteField<ProceduregetGitStatusResult_c1d4a9f752> = .missing
  public var worktrees: RemoteField<[ProceduregitListWorktreesResultU2DWorktreesU2DItem_0288aefad6]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "branches", typeName: "ProceduregitListBranchesResult_458a450839", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ghAvailable", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ref", typeName: "RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValueU2DProject_83470ce639", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refreshedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "ProceduregetGitStatusResult_c1d4a9f752", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktrees", typeName: "[ProceduregitListWorktreesResultU2DWorktreesU2DItem_0288aefad6]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case branches = "branches"
    case ghAvailable = "ghAvailable"
    case ref = "ref"
    case refreshedAt = "refreshedAt"
    case status = "status"
    case worktrees = "worktrees"
  }
}

public typealias RouteshellU2DSnapshotResponseU2DGitStateU2DProjects_1da8031b61 = [String: RouteshellU2DSnapshotResponseU2DGitStateU2DProjectsU2DValue_18a5d3fa6e]

public struct RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequestsU2DValueU2DFreshness_0bd7710eac: Codable, Sendable, RemoteModelMetadata {
  public var core: RemoteField<String> = .missing
  public var details: RemoteField<String> = .missing
  public var diff: RemoteField<String> = .missing
  public var files: RemoteField<String> = .missing
  public var reviewThreads: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "core", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "details", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "diff", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "files", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reviewThreads", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case core = "core"
    case details = "details"
    case diff = "diff"
    case files = "files"
    case reviewThreads = "reviewThreads"
  }
}
