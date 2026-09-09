// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteprojectU2DCommandResponseU2DProjectU2DLastDraftConfig_a0f4181c86: Codable, Sendable, RemoteModelMetadata {
  public var agentKind: String
  public var approvalPolicy: RemoteField<String> = .missing
  public var approvalsReviewer: RemoteField<String> = .missing
  public var browserMcp: RemoteField<Bool> = .missing
  public var chromeMcp: RemoteField<Bool> = .missing
  public var computerUse: RemoteField<Bool> = .missing
  public var contextSize: RemoteField<String> = .missing
  public var crossagentMcp: RemoteField<Bool> = .missing
  public var effort: RemoteField<String> = .missing
  public var executionEnvironment: RemoteField<ProcedurerollbackThreadConversationRequestU2DConfigU2DExecutionEnvironment_4cd2587996> = .missing
  public var fast: RemoteField<Bool> = .missing
  public var mode: RemoteField<ProcedurerollbackThreadConversationRequestU2DConfigU2DMode_01e21946e9> = .missing
  public var model: String
  public var sandboxMode: RemoteField<String> = .missing
  public var thinking: RemoteField<Bool> = .missing
  public var worktreeMode: RemoteField<Bool> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "approvalPolicy", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "approvalsReviewer", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "browserMcp", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "chromeMcp", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "computerUse", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "contextSize", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "crossagentMcp", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "effort", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "executionEnvironment", typeName: "ProcedurerollbackThreadConversationRequestU2DConfigU2DExecutionEnvironment_4cd2587996", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "fast", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mode", typeName: "ProcedurerollbackThreadConversationRequestU2DConfigU2DMode_01e21946e9", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "model", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sandboxMode", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
    case mode = "mode"
    case model = "model"
    case sandboxMode = "sandboxMode"
    case thinking = "thinking"
    case worktreeMode = "worktreeMode"
  }
}

public struct RouteprojectU2DCommandResponseU2DProjectU2DScripts_51d89a5cbb: Codable, Sendable, RemoteModelMetadata {
  public var actions: [RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1U2DActionsU2DItem_1544bc59ff]
  public var cleanupScript: RemoteField<String> = .missing
  public var setupScript: RemoteField<String> = .missing
  public var worktreeCopyPatterns: RemoteField<[String]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "actions", typeName: "[RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DScriptsU2DOptionU2D1U2DActionsU2DItem_1544bc59ff]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cleanupScript", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "setupScript", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeCopyPatterns", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case actions = "actions"
    case cleanupScript = "cleanupScript"
    case setupScript = "setupScript"
    case worktreeCopyPatterns = "worktreeCopyPatterns"
  }
}

public struct RouteprojectU2DCommandResponseU2DProject_e21c843ae3: Codable, Sendable, RemoteModelMetadata {
  public var createdAt: String
  public var disabled: RemoteField<Bool> = .missing
  public var ghAccount: RemoteField<ProcedureghCancelWorkflowRunRequestU2DGhAccount_5646cf57ff> = .missing
  public var icon: RemoteField<String> = .missing
  public var id: String
  public var lastDraftConfig: RemoteField<RouteprojectU2DCommandResponseU2DProjectU2DLastDraftConfig_a0f4181c86> = .missing
  public var location: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public var name: String
  public var remoteId: RemoteField<String> = .missing
  public var remoteServerId: RemoteField<String> = .missing
  public var scripts: RemoteField<RouteprojectU2DCommandResponseU2DProjectU2DScripts_51d89a5cbb> = .missing
  public var searchSettings: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab> = .missing
  public var workspaceId: RemoteField<String> = .missing
  public var worktreeLocation: RemoteField<RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DWorktreeLocationU2DOptionU2D1_7eb7e8f44a> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "createdAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "disabled", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ghAccount", typeName: "ProcedureghCancelWorkflowRunRequestU2DGhAccount_5646cf57ff", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "icon", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastDraftConfig", typeName: "RouteprojectU2DCommandResponseU2DProjectU2DLastDraftConfig_a0f4181c86", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "location", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "remoteId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "remoteServerId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scripts", typeName: "RouteprojectU2DCommandResponseU2DProjectU2DScripts_51d89a5cbb", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "searchSettings", typeName: "RouteprojectU2DCommandRequestU2DOptionU2D4U2DPatchU2DSearchSettingsU2DOptionU2D1_3ccadafaab", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "workspaceId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public struct RouteprojectU2DCommandResponse_265118ebb2: Codable, Sendable, RemoteModelMetadata {
  public var project: RemoteField<RouteprojectU2DCommandResponseU2DProject_e21c843ae3> = .missing
  public var projects: [RouteprojectU2DCommandResponseU2DProject_e21c843ae3]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "project", typeName: "RouteprojectU2DCommandResponseU2DProject_e21c843ae3", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projects", typeName: "[RouteprojectU2DCommandResponseU2DProject_e21c843ae3]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case project = "project"
    case projects = "projects"
  }
}

public struct RouteprojectU2DNotesU2DReadPath_05812a27bb: Codable, Sendable, RemoteModelMetadata {
  public var projectId: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case projectId = "projectId"
  }
}

public typealias RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DDoc_6e4ad57825 = RemoteJSONValue?

public struct RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810: Codable, Sendable, RemoteModelMetadata {
  public var createdAt: String
  public var done: Bool
  public var id: String
  public var text: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "createdAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "done", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "text", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case createdAt = "createdAt"
    case done = "done"
    case id = "id"
    case text = "text"
  }
}

public struct RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1_bc92ea89e2: Codable, Sendable, RemoteModelMetadata {
  public var doc: RemoteField<RemoteJSONValue>
  public var projectId: String
  public var todos: [RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810]
  public var updatedAt: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "doc", typeName: "RemoteJSONValue", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "todos", typeName: "[RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "updatedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case doc = "doc"
    case projectId = "projectId"
    case todos = "todos"
    case updatedAt = "updatedAt"
  }
}

public typealias RouteprojectU2DNotesU2DReadResponseU2DNotes_6df40201d8 = RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1_bc92ea89e2?

public struct RouteprojectU2DNotesU2DReadResponse_d1eba06c8a: Codable, Sendable, RemoteModelMetadata {
  public var notes: RemoteField<RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1_bc92ea89e2>
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "notes", typeName: "RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1_bc92ea89e2", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case notes = "notes"
  }
}

public struct RouteprojectU2DNotesU2DWriteRequest_7b212bbb53: Codable, Sendable, RemoteModelMetadata {
  public var doc: RemoteField<RemoteJSONValue>
  public var todos: [RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810]
  public var updatedAt: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "doc", typeName: "RemoteJSONValue", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "todos", typeName: "[RouteprojectU2DNotesU2DReadResponseU2DNotesU2DOptionU2D1U2DTodosU2DItem_93ea777810]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "updatedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case doc = "doc"
    case todos = "todos"
    case updatedAt = "updatedAt"
  }
}

public struct RouteprojectU2DSettingsResponse_c1417bffe5: Codable, Sendable, RemoteModelMetadata {
  public var mcpServers: RemoteField<[RoutemcpU2DSettingsU2DCommandResponseU2DServersU2DItem_d66267c393]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "mcpServers", typeName: "[RoutemcpU2DSettingsU2DCommandResponseU2DServersU2DItem_d66267c393]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case mcpServers = "mcpServers"
  }
}

public enum RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203: String, Codable, Sendable {
  case today = "today"
  case n7d = "7d"
  case n30d = "30d"
  case cycle = "cycle"
}

public struct RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCost_4147389dac: Codable, Sendable, RemoteModelMetadata {
  public var amount: Double
  public var currency: String
  public var estimated: Bool
  public var period: RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "amount", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "currency", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "estimated", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "period", typeName: "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case amount = "amount"
    case currency = "currency"
    case estimated = "estimated"
    case period = "period"
  }
}

public struct RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCredits_a39dd04104: Codable, Sendable, RemoteModelMetadata {
  public var balance: Double
  public var currency: RemoteField<String> = .missing
  public var label: RemoteField<String> = .missing
  public var unlimited: RemoteField<Bool> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "balance", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "currency", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "unlimited", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case balance = "balance"
    case currency = "currency"
    case label = "label"
    case unlimited = "unlimited"
  }
}

public enum RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DStatus_3466b9b69c: String, Codable, Sendable {
  case ok = "ok"
  case authU2DMissing = "auth-missing"
  case appU2DNotU2DRunning = "app-not-running"
  case rateU2DLimited = "rate-limited"
  case quotaU2DHit = "quota-hit"
  case unsupported = "unsupported"
  case error = "error"
}

public struct RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DTokens_36a14ea6cf: Codable, Sendable, RemoteModelMetadata {
  public var cacheRead: RemoteField<Double> = .missing
  public var cacheWrite: RemoteField<Double> = .missing
  public var input: RemoteField<Double> = .missing
  public var output: RemoteField<Double> = .missing
  public var period: RemoteField<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203> = .missing
  public var total: RemoteField<Double> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "cacheRead", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "cacheWrite", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "input", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "output", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "period", typeName: "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DCostU2DPeriod_776626d203", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "total", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case cacheRead = "cacheRead"
    case cacheWrite = "cacheWrite"
    case input = "input"
    case output = "output"
    case period = "period"
    case total = "total"
  }
}

public enum RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DIdU2DOptionU2D1_9fef93fbe5: String, Codable, Sendable {
  case sessionU2D5h = "session-5h"
  case weekly = "weekly"
  case weeklyU2DOpus = "weekly-opus"
  case weeklyU2DSonnet = "weekly-sonnet"
  case weeklyU2DFable = "weekly-fable"
  case monthly = "monthly"
  case extraU2DUsage = "extra-usage"
  case cursorU2DAuto = "cursor-auto"
  case cursorU2DApi = "cursor-api"
}

public enum RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0: Codable, Sendable {
  case option1(RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DIdU2DOptionU2D1_9fef93fbe5)
  case option2(String)
  case option3(String)
  case option4(String)
  case option5(String)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0)] = []
    if RemoteUnionProbe.matchesString(decoder, literals: [.string("session-5h"), .string("weekly"), .string("weekly-opus"), .string("weekly-sonnet"), .string("weekly-fable"), .string("monthly"), .string("extra-usage"), .string("cursor-auto"), .string("cursor-api")]), let value = try? container.decode(RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DIdU2DOptionU2D1_9fef93fbe5.self) {
      self = .option1(value); return
    }
    if RemoteUnionProbe.matchesString(decoder, pattern: "^gemini:.+"), let value = try? container.decode(String.self) {
      self = .option2(value); return
    }
    if RemoteUnionProbe.matchesString(decoder, pattern: "^codex:.+"), let value = try? container.decode(String.self) {
      self = .option3(value); return
    }
    if RemoteUnionProbe.matchesString(decoder, pattern: "^antigravity:.+"), let value = try? container.decode(String.self) {
      self = .option4(value); return
    }
    if RemoteUnionProbe.matchesString(decoder, pattern: "^factory:.+"), let value = try? container.decode(String.self) {
      self = .option5(value); return
    }
    throw DecodingError.typeMismatch(RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0.self, .init(codingPath: decoder.codingPath, debugDescription: "No union option matched RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0"))
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .option1(let value): try container.encode(value)
    case .option2(let value): try container.encode(value)
    case .option3(let value): try container.encode(value)
    case .option4(let value): try container.encode(value)
    case .option5(let value): try container.encode(value)
    }
  }
}

public enum RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DUnit_c263982707: String, Codable, Sendable {
  case percent = "percent"
  case tokens = "tokens"
  case requests = "requests"
  case credits = "credits"
  case usd = "usd"
}

public struct RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItem_ab58da84ea: Codable, Sendable, RemoteModelMetadata {
  public var currency: RemoteField<String> = .missing
  public var id: RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0
  public var label: String
  public var limit: RemoteField<Double> = .missing
  public var resetsAt: RemoteField<Int64> = .missing
  public var unit: RemoteField<RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DUnit_c263982707> = .missing
  public var used: RemoteField<Double> = .missing
  public var usedPercent: Double
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "currency", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DId_7be168d0c0", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "limit", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "resetsAt", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "unit", typeName: "RouteproviderU2DUsageResponseU2DSnapshotsU2DItemU2DWindowsU2DItemU2DUnit_c263982707", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "used", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "usedPercent", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: 100, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case currency = "currency"
    case id = "id"
    case label = "label"
    case limit = "limit"
    case resetsAt = "resetsAt"
    case unit = "unit"
    case used = "used"
    case usedPercent = "usedPercent"
  }
}
