// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatch_cadb9042bb: Codable, Sendable, RemoteModelMetadata {
  public var disabled: RemoteField<Bool> = .missing
  public var ghAccount: RemoteField<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff> = .missing
  public var icon: RemoteField<String> = .missing
  public var mcpServers: RemoteField<[ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1]> = .missing
  public var name: RemoteField<String> = .missing
  public var scripts: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1_cd124b21d9> = .missing
  public var searchSettings: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab> = .missing
  public var worktreeLocation: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1_7eb7e8f44a> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "disabled", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ghAccount", typeName: "ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "icon", typeName: "String", required: false, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mcpServers", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServer_c04b1452d1]", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scripts", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1_cd124b21d9", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "searchSettings", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeLocation", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1_7eb7e8f44a", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case disabled = "disabled"
    case ghAccount = "ghAccount"
    case icon = "icon"
    case mcpServers = "mcpServers"
    case name = "name"
    case scripts = "scripts"
    case searchSettings = "searchSettings"
    case worktreeLocation = "worktreeLocation"
  }
}

public struct RouteprojectU2DCommandRequestU2DOptionU2D4_9bdd26dd83: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteprojectU2DCommandRequestU2DOptionU2D4U2DKind_cbc64d1458
  public var patch: RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatch_cadb9042bb
  public var projectId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DKind_cbc64d1458", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "patch", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatch_cadb9042bb", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case patch = "patch"
    case projectId = "projectId"
  }
}

public enum RouteprojectU2DCommandRequestU2DOptionU2D5U2DKind_88444d52d4: String, Codable, Sendable {
  case relocate = "relocate"
}

public struct RouteprojectU2DCommandRequestU2DOptionU2D5_27aa975674: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteprojectU2DCommandRequestU2DOptionU2D5U2DKind_88444d52d4
  public var path: String
  public var projectId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D5U2DKind_88444d52d4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case path = "path"
    case projectId = "projectId"
  }
}

public struct RouteprojectU2DCommandRequestU2DOptionU2D6_37addcca5b: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteexperimentU2DCommandRequestU2DOptionU2D3U2DKind_034741cb26
  public var projectId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteexperimentU2DCommandRequestU2DOptionU2D3U2DKind_034741cb26", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case projectId = "projectId"
  }
}

public enum RouteprojectU2DCommandRequestU2DOptionU2D7U2DKind_701d7d6274: String, Codable, Sendable {
  case reorder = "reorder"
}

public struct RouteprojectU2DCommandRequestU2DOptionU2D7_580efa06e9: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteprojectU2DCommandRequestU2DOptionU2D7U2DKind_701d7d6274
  public var placement: RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e
  public var projectId: String
  public var targetProjectId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D7U2DKind_701d7d6274", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "placement", typeName: "RoutebrowserU2DCommandRequestU2DOptionU2D4U2DPosition_3512bd687e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "targetProjectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case placement = "placement"
    case projectId = "projectId"
    case targetProjectId = "targetProjectId"
  }
}

public enum RouteprojectU2DCommandRequestU2DOptionU2D8U2DKind_96cd458fa9: String, Codable, Sendable {
  case setU2DWorkspace = "set-workspace"
}

public struct RouteprojectU2DCommandRequestU2DOptionU2D8_ebfa6f1c64: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteprojectU2DCommandRequestU2DOptionU2D8U2DKind_96cd458fa9
  public var projectId: String
  public var workspaceId: RemoteField<String>
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D8U2DKind_96cd458fa9", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "workspaceId", typeName: "String", required: true, nullable: true, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case projectId = "projectId"
    case workspaceId = "workspaceId"
  }
}

public enum RouteprojectU2DCommandRequestU2DOptionU2D9U2DKind_93f8fa8787: String, Codable, Sendable {
  case setU2DDraftU2DConfig = "set-draft-config"
}

public struct RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfigU2DOptionU2D1_05ae4f0709: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: String
  public var approvalPolicy: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var approvalsReviewer: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var browserMcp: RemoteField<Bool> = .missing
  public var chromeMcp: RemoteField<Bool> = .missing
  public var computerUse: RemoteField<Bool> = .missing
  public var contextSize: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var crossagentMcp: RemoteField<Bool> = .missing
  public var effort: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var executionEnvironment: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996> = .missing
  public var fast: RemoteField<Bool> = .missing
  public var importedFrom: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DImportedFrom_3471186f13> = .missing
  public var mode: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DMode_01e21946e9> = .missing
  public var model: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var sandboxMode: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var selectionBinding: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBinding_a11ab76af3> = .missing
  public var thinking: RemoteField<Bool> = .missing
  public var worktreeMode: RemoteField<Bool> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "approvalPolicy", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "approvalsReviewer", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "browserMcp", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "chromeMcp", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "computerUse", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "contextSize", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "crossagentMcp", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "effort", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "executionEnvironment", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DExecutionEnvironment_4cd2587996", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fast", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "importedFrom", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DImportedFrom_3471186f13", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mode", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DMode_01e21946e9", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "model", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sandboxMode", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "selectionBinding", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DSelectionBinding_a11ab76af3", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "thinking", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeMode", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentKind = "agentKind"
    case approvalPolicy = "approvalPolicy"
    case approvalsReviewer = "approvalsReviewer"
    case browserMcp = "browserMcp"
    case chromeMcp = "chromeMcp"
    case computerUse = "computerUse"
    case contextSize = "contextSize"
    case crossagentMcp = "crossagentMcp"
    case effort = "effort"
    case executionEnvironment = "executionEnvironment"
    case fast = "fast"
    case importedFrom = "importedFrom"
    case mode = "mode"
    case model = "model"
    case sandboxMode = "sandboxMode"
    case selectionBinding = "selectionBinding"
    case thinking = "thinking"
    case worktreeMode = "worktreeMode"
  }
}

public typealias RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfig_0d58902a07 = RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfigU2DOptionU2D1_05ae4f0709?

public struct RouteprojectU2DCommandRequestU2DOptionU2D9_45f6b50cb9: Codable, Sendable, RemoteModelMetadata {
  public var kind: RouteprojectU2DCommandRequestU2DOptionU2D9U2DKind_93f8fa8787
  public var lastDraftConfig: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfigU2DOptionU2D1_05ae4f0709>
  public var projectId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D9U2DKind_93f8fa8787", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastDraftConfig", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfigU2DOptionU2D1_05ae4f0709", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case lastDraftConfig = "lastDraftConfig"
    case projectId = "projectId"
  }
}

public enum RouteprojectU2DCommandRequest_f806b38202: Codable, Sendable {
  case option1(RouteprojectU2DCommandRequestU2DOptionU2D1_468209f9bb)
  case option2(RouteprojectU2DCommandRequestU2DOptionU2D2_2b7595c3da)
  case option3(RouteprojectU2DCommandRequestU2DOptionU2D3_da66851500)
  case option4(RouteprojectU2DCommandRequestU2DOptionU2D4_9bdd26dd83)
  case option5(RouteprojectU2DCommandRequestU2DOptionU2D5_27aa975674)
  case option6(RouteprojectU2DCommandRequestU2DOptionU2D6_37addcca5b)
  case option7(RouteprojectU2DCommandRequestU2DOptionU2D7_580efa06e9)
  case option8(RouteprojectU2DCommandRequestU2DOptionU2D8_ebfa6f1c64)
  case option9(RouteprojectU2DCommandRequestU2DOptionU2D9_45f6b50cb9)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteprojectU2DCommandRequest_f806b38202)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("add-existing")]), let value = try? container.decode(RouteprojectU2DCommandRequestU2DOptionU2D1_468209f9bb.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("create")]), let value = try? container.decode(RouteprojectU2DCommandRequestU2DOptionU2D2_2b7595c3da.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("clone")]), let value = try? container.decode(RouteprojectU2DCommandRequestU2DOptionU2D3_da66851500.self) {
      matches.append((3, .option3(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("update")]), let value = try? container.decode(RouteprojectU2DCommandRequestU2DOptionU2D4_9bdd26dd83.self) {
      matches.append((4, .option4(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("relocate")]), let value = try? container.decode(RouteprojectU2DCommandRequestU2DOptionU2D5_27aa975674.self) {
      matches.append((5, .option5(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("remove")]), let value = try? container.decode(RouteprojectU2DCommandRequestU2DOptionU2D6_37addcca5b.self) {
      matches.append((6, .option6(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("reorder")]), let value = try? container.decode(RouteprojectU2DCommandRequestU2DOptionU2D7_580efa06e9.self) {
      matches.append((7, .option7(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("set-workspace")]), let value = try? container.decode(RouteprojectU2DCommandRequestU2DOptionU2D8_ebfa6f1c64.self) {
      matches.append((8, .option8(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("set-draft-config")]), let value = try? container.decode(RouteprojectU2DCommandRequestU2DOptionU2D9_45f6b50cb9.self) {
      matches.append((9, .option9(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RouteprojectU2DCommandRequest_f806b38202" : "Ambiguous union RouteprojectU2DCommandRequest_f806b38202 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RouteprojectU2DCommandRequest_f806b38202.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
    }
    self = matches[0].1
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    case .option3(let value): try container.encode(value)
    case .option4(let value): try container.encode(value)
    case .option5(let value): try container.encode(value)
    case .option6(let value): try container.encode(value)
    case .option7(let value): try container.encode(value)
    case .option8(let value): try container.encode(value)
    case .option9(let value): try container.encode(value)
    }
  }
}

public struct RouteprojectU2DCommandResponseU2DOptionU2D1U2DProjectU2DScripts_51d89a5cbb: Codable, Sendable, RemoteModelMetadata {
  public var actions: [RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1U2DActionsU2DItem_1544bc59ff]
  public var cleanupScript: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var setupScript: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var worktreeCopyPatterns: RemoteField<[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "actions", typeName: "[RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1U2DActionsU2DItem_1544bc59ff]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public struct RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_3bac601a40: Codable, Sendable, RemoteModelMetadata {
  public var createdAt: String
  public var disabled: RemoteField<Bool> = .missing
  public var ghAccount: RemoteField<ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff> = .missing
  public var icon: RemoteField<String> = .missing
  public var id: String
  public var lastDraftConfig: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfigU2DOptionU2D1_05ae4f0709> = .missing
  public var location: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public var name: String
  public var remoteId: RemoteField<String> = .missing
  public var remoteServerId: RemoteField<String> = .missing
  public var scripts: RemoteField<RouteprojectU2DCommandResponseU2DOptionU2D1U2DProjectU2DScripts_51d89a5cbb> = .missing
  public var searchSettings: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab> = .missing
  public var workspaceId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var worktreeLocation: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1_7eb7e8f44a> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "createdAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabled", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ghAccount", typeName: "ProcedurecloneRepoRequestU2DSourceU2DOptionU2D2U2DAccount_5646cf57ff", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "icon", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastDraftConfig", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D9U2DLastDraftConfigU2DOptionU2D1_05ae4f0709", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "location", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "remoteId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "remoteServerId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scripts", typeName: "RouteprojectU2DCommandResponseU2DOptionU2D1U2DProjectU2DScripts_51d89a5cbb", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "searchSettings", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "workspaceId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeLocation", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1_7eb7e8f44a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case createdAt = "createdAt"
    case disabled = "disabled"
    case ghAccount = "ghAccount"
    case icon = "icon"
    case id = "id"
    case lastDraftConfig = "lastDraftConfig"
    case location = "location"
    case name = "name"
    case remoteId = "remoteId"
    case remoteServerId = "remoteServerId"
    case scripts = "scripts"
    case searchSettings = "searchSettings"
    case workspaceId = "workspaceId"
    case worktreeLocation = "worktreeLocation"
  }
}

public struct RouteprojectU2DCommandResponseU2DOptionU2D1_f83001b0f9: Codable, Sendable, RemoteModelMetadata {
  public var created: RemoteField<Bool> = .missing
  public var project: RemoteField<RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_3bac601a40> = .missing
  public var projects: [RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_3bac601a40]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "created", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "project", typeName: "RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_3bac601a40", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projects", typeName: "[RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_3bac601a40]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case created = "created"
    case project = "project"
    case projects = "projects"
  }
}

public struct RouteprojectU2DCommandResponseU2DOptionU2D2_ad7a7271b0: Codable, Sendable, RemoteModelMetadata {
  public var created: RemoteField<Bool> = .missing
  public var ok: ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1
  public var project: RemoteField<RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_3bac601a40> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "created", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ok", typeName: "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "project", typeName: "RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_3bac601a40", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case created = "created"
    case ok = "ok"
    case project = "project"
  }
}

public enum RouteprojectU2DCommandResponse_4b9241d0f3: Codable, Sendable {
  case option1(RouteprojectU2DCommandResponseU2DOptionU2D1_f83001b0f9)
  case option2(RouteprojectU2DCommandResponseU2DOptionU2D2_ad7a7271b0)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteprojectU2DCommandResponse_4b9241d0f3)] = []
    if RemoteUnionProbe.matchesObject(decoder), let value = try? container.decode(RouteprojectU2DCommandResponseU2DOptionU2D1_f83001b0f9.self) {
      self = .option1(value); return
    }
    if RemoteUnionProbe.matchesObject(decoder), let value = try? container.decode(RouteprojectU2DCommandResponseU2DOptionU2D2_ad7a7271b0.self) {
      self = .option2(value); return
    }
    throw DecodingError.typeMismatch(RouteprojectU2DCommandResponse_4b9241d0f3.self, .init(codingPath: decoder.codingPath, debugDescription: "No union option matched RouteprojectU2DCommandResponse_4b9241d0f3"))
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    }
  }
}

public enum RouteprojectU2DListQueryU2DMode_902ee7904a: String, Codable, Sendable {
  case page = "page"
  case inventory = "inventory"
}

public enum RouteprojectU2DListQueryU2DOrder_42146530bc: String, Codable, Sendable {
  case manual = "manual"
  case updated = "updated"
  case created = "created"
}

public enum RouteprojectU2DListQueryU2DReads_4659e6d395: String, Codable, Sendable {
  case boundedU2DV1 = "bounded-v1"
}
