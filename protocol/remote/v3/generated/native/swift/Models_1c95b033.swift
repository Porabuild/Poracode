// GENERATED FILE. Do not edit by hand.
import Foundation
public enum RouteprojectU2DCommandRequestU2DOptionU2D1U2DKind_4cb4c97502: String, Codable, Sendable {
  case `addU2DExisting` = "add-existing"
}

public struct RouteprojectU2DCommandRequestU2DOptionU2D1_468209f9bb: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteprojectU2DCommandRequestU2DOptionU2D1U2DKind_4cb4c97502
  public var name: RemoteField<String> = .missing
  public var path: String
  public var workspaceId: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D1U2DKind_4cb4c97502", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "workspaceId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case name = "name"
    case path = "path"
    case workspaceId = "workspaceId"
  }
}

public struct RouteprojectU2DCommandRequestU2DOptionU2D2_2b7595c3da: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteexperimentU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862
  public var name: String
  public var parentPath: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteexperimentU2DCommandRequestU2DOptionU2D1U2DKind_1f45188862", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "parentPath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case name = "name"
    case parentPath = "parentPath"
  }
}

public enum RouteprojectU2DCommandRequestU2DOptionU2D3U2DKind_8793e38088: String, Codable, Sendable {
  case `clone` = "clone"
}

public struct RouteprojectU2DCommandRequestU2DOptionU2D3_da66851500: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteprojectU2DCommandRequestU2DOptionU2D3U2DKind_8793e38088
  public var name: String
  public var parentPath: String
  public var source: ProcedurecloneRepoRequestU2DSource_76b2c94b29
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D3U2DKind_8793e38088", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "parentPath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "source", typeName: "ProcedurecloneRepoRequestU2DSource_76b2c94b29", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case name = "name"
    case parentPath = "parentPath"
    case source = "source"
  }
}

public enum RouteprojectU2DCommandRequestU2DOptionU2D4U2DKind_cbc64d1458: String, Codable, Sendable {
  case `update` = "update"
}

public typealias RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DGhAccount_eb2798e2cc = ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff?

public typealias RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DMcpServers_637f685cb2 = [ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1]?

public typealias RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DPinnedBranches_f26d9689fe = [String]?

public typealias RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DPluginOverrides_636da2bdcb = ProcedureconnectThreadVoiceRequestU2DConfigU2DMcpServerOverrides_6db96506f2?

public struct RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1U2DActionsU2DItem_1544bc59ff: Codable, Sendable, RemoteModelMetadata {
  public var command: String
  public var icon: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var id: String
  public var name: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "command", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "icon", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case command = "command"
    case icon = "icon"
    case id = "id"
    case name = "name"
  }
}

public struct RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1_cd124b21d9: Codable, Sendable, RemoteModelMetadata {
  public var actions: RemoteField<[RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1U2DActionsU2DItem_1544bc59ff]> = .missing
  public var cleanupScript: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var setupScript: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var worktreeCopyPatterns: RemoteField<[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "actions", typeName: "[RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1U2DActionsU2DItem_1544bc59ff]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cleanupScript", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "setupScript", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeCopyPatterns", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case actions = "actions"
    case cleanupScript = "cleanupScript"
    case setupScript = "setupScript"
    case worktreeCopyPatterns = "worktreeCopyPatterns"
  }
}

public typealias RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScripts_3155b0e864 = RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1_cd124b21d9?

public typealias RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a = [String: Bool]

public struct RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab: Codable, Sendable, RemoteModelMetadata {
  public var exclude: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a> = .missing
  public var useIgnoreFiles: RemoteField<Bool> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "exclude", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1U2DExclude_cda18ebe4a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "useIgnoreFiles", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case exclude = "exclude"
    case useIgnoreFiles = "useIgnoreFiles"
  }
}

public typealias RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettings_3e412d7b32 = RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab?

public enum RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19: String, Codable, Sendable {
  case `global` = "global"
  case `projectU2DRelative` = "project-relative"
}

public struct RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1_7eb7e8f44a: Codable, Sendable, RemoteModelMetadata {
  public var basePath: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var mode: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "basePath", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mode", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1U2DMode_953c573b19", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case basePath = "basePath"
    case mode = "mode"
  }
}

public typealias RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocation_137e14636e = RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1_7eb7e8f44a?

public struct RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatch_80fe2d5ae5: Codable, Sendable, RemoteModelMetadata {
  public var disabled: RemoteField<Bool> = .missing
  public var ghAccount: RemoteField<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff> = .missing
  public var icon: RemoteField<String> = .missing
  public var mcpServers: RemoteField<[ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1]> = .missing
  public var name: RemoteField<String> = .missing
  public var pinnedBranches: RemoteField<[String]> = .missing
  public var pluginOverrides: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DMcpServerOverrides_6db96506f2> = .missing
  public var scripts: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1_cd124b21d9> = .missing
  public var searchSettings: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab> = .missing
  public var worktreeBaseBranch: RemoteField<String> = .missing
  public var worktreeLocation: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1_7eb7e8f44a> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "disabled", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ghAccount", typeName: "ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "icon", typeName: "String", required: false, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mcpServers", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1]", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pinnedBranches", typeName: "[String]", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pluginOverrides", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DMcpServerOverrides_6db96506f2", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scripts", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1_cd124b21d9", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "searchSettings", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeBaseBranch", typeName: "String", required: false, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeLocation", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1_7eb7e8f44a", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case disabled = "disabled"
    case ghAccount = "ghAccount"
    case icon = "icon"
    case mcpServers = "mcpServers"
    case name = "name"
    case pinnedBranches = "pinnedBranches"
    case pluginOverrides = "pluginOverrides"
    case scripts = "scripts"
    case searchSettings = "searchSettings"
    case worktreeBaseBranch = "worktreeBaseBranch"
    case worktreeLocation = "worktreeLocation"
  }
}
