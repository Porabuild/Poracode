// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItem_da546ba4a0: Codable, Sendable, RemoteModelMetadata {
  public var agentId: String
  public var attempt: RemoteField<Int64> = .missing
  public var chat: RemoteField<[ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DChatU2DItem_4878a3657a]> = .missing
  public var durationMs: RemoteField<Int64> = .missing
  public var label: String
  public var lastProgressAt: RemoteField<Int64> = .missing
  public var lastToolName: RemoteField<String> = .missing
  public var model: RemoteField<String> = .missing
  public var phaseIndex: RemoteField<Int64> = .missing
  public var phaseTitle: RemoteField<String> = .missing
  public var promptPreview: RemoteField<String> = .missing
  public var queuedAt: RemoteField<Int64> = .missing
  public var resultPreview: RemoteField<String> = .missing
  public var startedAt: RemoteField<Int64> = .missing
  public var state: RemoteField<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DState_5a17efba35> = .missing
  public var tokens: RemoteField<Int64> = .missing
  public var toolCalls: RemoteField<Int64> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "attempt", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "chat", typeName: "[ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DChatU2DItem_4878a3657a]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "durationMs", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "label", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastProgressAt", typeName: "Int64", required: false, nullable: false, minimum: -9007199254740991, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastToolName", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "model", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "phaseIndex", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "phaseTitle", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "promptPreview", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "queuedAt", typeName: "Int64", required: false, nullable: false, minimum: -9007199254740991, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "resultPreview", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "startedAt", typeName: "Int64", required: false, nullable: false, minimum: -9007199254740991, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "state", typeName: "ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItemU2DState_5a17efba35", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "tokens", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "toolCalls", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentId = "agentId"
    case attempt = "attempt"
    case chat = "chat"
    case durationMs = "durationMs"
    case label = "label"
    case lastProgressAt = "lastProgressAt"
    case lastToolName = "lastToolName"
    case model = "model"
    case phaseIndex = "phaseIndex"
    case phaseTitle = "phaseTitle"
    case promptPreview = "promptPreview"
    case queuedAt = "queuedAt"
    case resultPreview = "resultPreview"
    case startedAt = "startedAt"
    case state = "state"
    case tokens = "tokens"
    case toolCalls = "toolCalls"
  }
}

public struct ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItem_59cd628901: Codable, Sendable, RemoteModelMetadata {
  public var agents: [ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItem_da546ba4a0]
  public var detail: RemoteField<String> = .missing
  public var title: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agents", typeName: "[ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItem_da546ba4a0]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "detail", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agents = "agents"
    case detail = "detail"
    case title = "title"
  }
}

public enum ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DStatus_3a008e3c40: String, Codable, Sendable {
  case running = "running"
  case completed = "completed"
  case failed = "failed"
  case cancelled = "cancelled"
  case unknown = "unknown"
}

public struct ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1_f9da03570b: Codable, Sendable, RemoteModelMetadata {
  public var agentCount: Int64
  public var defaultModel: RemoteField<String> = .missing
  public var durationMs: RemoteField<Int64> = .missing
  public var phases: [ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItem_59cd628901]
  public var runId: String
  public var scriptPath: RemoteField<String> = .missing
  public var startTime: RemoteField<Int64> = .missing
  public var status: ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DStatus_3a008e3c40
  public var summary: RemoteField<String> = .missing
  public var taskId: RemoteField<String> = .missing
  public var totalTokens: RemoteField<Int64> = .missing
  public var totalToolCalls: RemoteField<Int64> = .missing
  public var unphasedAgents: [ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItem_da546ba4a0]
  public var workflowName: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "agentCount", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "defaultModel", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "durationMs", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "phases", typeName: "[ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItem_59cd628901]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "scriptPath", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "startTime", typeName: "Int64", required: false, nullable: false, minimum: -9007199254740991, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DStatus_3a008e3c40", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "summary", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "taskId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "totalTokens", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "totalToolCalls", typeName: "Int64", required: false, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "unphasedAgents", typeName: "[ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1U2DPhasesU2DItemU2DAgentsU2DItem_da546ba4a0]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "workflowName", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case agentCount = "agentCount"
    case defaultModel = "defaultModel"
    case durationMs = "durationMs"
    case phases = "phases"
    case runId = "runId"
    case scriptPath = "scriptPath"
    case startTime = "startTime"
    case status = "status"
    case summary = "summary"
    case taskId = "taskId"
    case totalTokens = "totalTokens"
    case totalToolCalls = "totalToolCalls"
    case unphasedAgents = "unphasedAgents"
    case workflowName = "workflowName"
  }
}

public typealias ProcedureworkflowGetRunResultU2DRun_74659b54c1 = ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1_f9da03570b?

public struct ProcedureworkflowGetRunResult_965bd4463b: Codable, Sendable, RemoteModelMetadata {
  public var mtimeMs: RemoteField<Double> = .missing
  public var run: RemoteField<ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1_f9da03570b>
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "mtimeMs", typeName: "Double", required: false, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "run", typeName: "ProcedureworkflowGetRunResultU2DRunU2DOptionU2D1_f9da03570b", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case mtimeMs = "mtimeMs"
    case run = "run"
  }
}

public struct ProcedurewriteExternalFileRequest_551f784ecd: Codable, Sendable, RemoteModelMetadata {
  public var absolutePath: String
  public var baseModifiedAtMs: Double
  public var content: String
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "absolutePath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "baseModifiedAtMs", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "content", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case absolutePath = "absolutePath"
    case baseModifiedAtMs = "baseModifiedAtMs"
    case content = "content"
    case projectLocation = "projectLocation"
  }
}

public struct ProcedurewriteExternalFileResult_c5c2ecebba: Codable, Sendable, RemoteModelMetadata {
  public var modifiedAtMs: Double
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "modifiedAtMs", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case modifiedAtMs = "modifiedAtMs"
  }
}

public struct ProcedurewriteProjectFileRequest_aba5d69bfd: Codable, Sendable, RemoteModelMetadata {
  public var baseModifiedAtMs: Double
  public var content: String
  public var path: String
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "baseModifiedAtMs", typeName: "Double", required: true, nullable: false, minimum: 0, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "content", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case baseModifiedAtMs = "baseModifiedAtMs"
    case content = "content"
    case path = "path"
    case projectLocation = "projectLocation"
  }
}

public enum RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1U2DType_aaf42afe3b: String, Codable, Sendable {
  case envU5FVar = "env_var"
}

public struct RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1U2DVarsU2DItem_8103808258: Codable, Sendable, RemoteModelMetadata {
  public var label: RemoteField<String> = .missing
  public var name: String
  public var optional: RemoteField<Bool> = .missing
  public var secret: RemoteField<Bool> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "label", typeName: "String", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public struct RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1_cdc63841ca: Codable, Sendable, RemoteModelMetadata {
  public var description: RemoteField<String> = .missing
  public var id: String
  public var link: RemoteField<String> = .missing
  public var name: String
  public var typeValue: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1U2DType_aaf42afe3b
  public var vars: [RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1U2DVarsU2DItem_8103808258]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "description", typeName: "String", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "link", typeName: "String", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1U2DType_aaf42afe3b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "vars", typeName: "[RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D1U2DVarsU2DItem_8103808258]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public enum RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2U2DType_c4197e46f3: String, Codable, Sendable {
  case terminal = "terminal"
}

public struct RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2_8ab3ef50fe: Codable, Sendable, RemoteModelMetadata {
  public var args: RemoteField<[String]> = .missing
  public var description: RemoteField<String> = .missing
  public var env: RemoteField<ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67> = .missing
  public var id: String
  public var name: String
  public var typeValue: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2U2DType_c4197e46f3
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "args", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "description", typeName: "String", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "env", typeName: "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D2U2DType_c4197e46f3", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public enum RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3U2DType_a5b7c88e39: String, Codable, Sendable {
  case agent = "agent"
}

public struct RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3_0fd7e0ac40: Codable, Sendable, RemoteModelMetadata {
  public var description: RemoteField<String> = .missing
  public var id: String
  public var name: String
  public var typeValue: RemoteField<RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DAuthMethodsU2DItemU2DOptionU2D3U2DType_a5b7c88e39> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "description", typeName: "String", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
