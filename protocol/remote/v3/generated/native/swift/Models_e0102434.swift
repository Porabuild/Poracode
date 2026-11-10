// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteshellU2DSnapshotResponseU2DWorkspacesU2DItem_33250cfe65: Codable, Sendable, RemoteModelMetadata {
  public var id: String
  public var name: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case name = "name"
  }
}

public struct RouteshellU2DSnapshotResponse_893eca5a7b: Codable, Sendable, RemoteModelMetadata {
  public var gitState: RemoteField<RouteshellU2DSnapshotResponseU2DGitState_039d29a220> = .missing
  public var gitSummariesByThread: RemoteField<RouteshellU2DSnapshotResponseU2DGitSummariesByThread_aca97eda78> = .missing
  public var projects: [RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_9ee4a9aa10]
  public var projectsNextCursor: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var reads: RemoteField<RouteprojectU2DListQueryU2DReads_4659e6d395> = .missing
  public var runtimeSummariesByThread: RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThread_fc9d6f4c26
  public var snapshotEpoch: RemoteField<String> = .missing
  public var snapshotSeq: Int64
  public var threads: [RouteshellU2DSnapshotResponseU2DThreadsU2DItem_aae5723e41]
  public var threadsNextCursor: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var updatedAt: String
  public var workspaces: RemoteField<[RouteshellU2DSnapshotResponseU2DWorkspacesU2DItem_33250cfe65]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "gitState", typeName: "RouteshellU2DSnapshotResponseU2DGitState_039d29a220", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "gitSummariesByThread", typeName: "RouteshellU2DSnapshotResponseU2DGitSummariesByThread_aca97eda78", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projects", typeName: "[RouteprojectU2DCommandResponseU2DOptionU2D1U2DProject_9ee4a9aa10]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectsNextCursor", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reads", typeName: "RouteprojectU2DListQueryU2DReads_4659e6d395", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "runtimeSummariesByThread", typeName: "RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThread_fc9d6f4c26", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "snapshotEpoch", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 128, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "snapshotSeq", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threads", typeName: "[RouteshellU2DSnapshotResponseU2DThreadsU2DItem_aae5723e41]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadsNextCursor", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "updatedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "workspaces", typeName: "[RouteshellU2DSnapshotResponseU2DWorkspacesU2DItem_33250cfe65]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case gitState = "gitState"
    case gitSummariesByThread = "gitSummariesByThread"
    case projects = "projects"
    case projectsNextCursor = "projectsNextCursor"
    case reads = "reads"
    case runtimeSummariesByThread = "runtimeSummariesByThread"
    case snapshotEpoch = "snapshotEpoch"
    case snapshotSeq = "snapshotSeq"
    case threads = "threads"
    case threadsNextCursor = "threadsNextCursor"
    case updatedAt = "updatedAt"
    case workspaces = "workspaces"
  }
}

public enum RouteterminalU2DStartRequestU2DWindowsShellRuntime_9368b22ce4: String, Codable, Sendable {
  case `preferred` = "preferred"
  case `powershell` = "powershell"
}

public struct RouteterminalU2DStartRequest_b03238f553: Codable, Sendable, RemoteModelMetadata {
  public var initialSize: RemoteField<ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09> = .missing
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public var shellId: String
  public var startInHome: RemoteField<Bool> = .missing
  public var windowsShellRuntime: RemoteField<RouteterminalU2DStartRequestU2DWindowsShellRuntime_9368b22ce4> = .missing
  public var worktreePath: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "initialSize", typeName: "ProcedureensureThreadRunningRequestU2DInitialSize_55ee222c09", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "shellId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "startInHome", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "windowsShellRuntime", typeName: "RouteterminalU2DStartRequestU2DWindowsShellRuntime_9368b22ce4", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreePath", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case initialSize = "initialSize"
    case projectLocation = "projectLocation"
    case shellId = "shellId"
    case startInHome = "startInHome"
    case windowsShellRuntime = "windowsShellRuntime"
    case worktreePath = "worktreePath"
  }
}

public struct RouteterminalU2DWriteRequest_6c6fca7050: Codable, Sendable, RemoteModelMetadata {
  public var data: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "data", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case data = "data"
  }
}

public enum RoutethreadU2DAgentU2DVisionQueryU2DPreview_2eb2bd4b48: String, Codable, Sendable {
  case `n0` = "0"
  case `n1` = "1"
}

public struct RoutethreadU2DAgentU2DVisionQuery_5ffd0d821b: Codable, Sendable, RemoteModelMetadata {
  public var preview: RemoteField<RoutethreadU2DAgentU2DVisionQueryU2DPreview_2eb2bd4b48> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "preview", typeName: "RoutethreadU2DAgentU2DVisionQueryU2DPreview_2eb2bd4b48", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case preview = "preview"
  }
}

public enum RoutethreadU2DAgentU2DVisionResponseU2DOptionU2D1U2DSource_9addfc34d2: String, Codable, Sendable {
  case `browser` = "browser"
  case `chrome` = "chrome"
  case `computer` = "computer"
}

public enum RoutethreadU2DAgentU2DVisionResponseU2DOptionU2D1U2DStatus_cf7eae9345: String, Codable, Sendable {
  case `running` = "running"
  case `idle` = "idle"
  case `error` = "error"
}

public struct RoutethreadU2DAgentU2DVisionResponseU2DOptionU2D1_1e25c599a6: Codable, Sendable, RemoteModelMetadata {
  public var capturedAt: RemoteField<Double> = .missing
  public var image: RemoteField<String> = .missing
  public var source: RoutethreadU2DAgentU2DVisionResponseU2DOptionU2D1U2DSource_9addfc34d2
  public var status: RoutethreadU2DAgentU2DVisionResponseU2DOptionU2D1U2DStatus_cf7eae9345
  public var streamVersion: RemoteField<ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72> = .missing
  public var target: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var toolName: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var updatedAt: Double
  public var version: ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "capturedAt", typeName: "Double", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "image", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: 3145728, minItems: nil, maxItems: nil, pattern: "^data:image\\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$", format: nil, semanticValidatorIds: []),
    .init(wireName: "source", typeName: "RoutethreadU2DAgentU2DVisionResponseU2DOptionU2D1U2DSource_9addfc34d2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "RoutethreadU2DAgentU2DVisionResponseU2DOptionU2D1U2DStatus_cf7eae9345", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "streamVersion", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "target", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "toolName", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "updatedAt", typeName: "Double", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "version", typeName: "ProcedureconnectThreadVoiceRequestU2DConfigU2DCrewU2DOptionU2D1U2DOptionU2D1U2DVersion_7f9f5a0d72", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case capturedAt = "capturedAt"
    case image = "image"
    case source = "source"
    case status = "status"
    case streamVersion = "streamVersion"
    case target = "target"
    case toolName = "toolName"
    case updatedAt = "updatedAt"
    case version = "version"
  }
}

public typealias RoutethreadU2DAgentU2DVisionResponse_af80d04059 = RoutethreadU2DAgentU2DVisionResponseU2DOptionU2D1_1e25c599a6?

public struct RoutethreadU2DCheckpointU2DRevertRequest_40f9a6009b: Codable, Sendable, RemoteModelMetadata {
  public var checkpointItemId: String
  public var operationKey: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "checkpointItemId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "operationKey", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 8, maxLength: 110, minItems: nil, maxItems: nil, pattern: "^[A-Za-z0-9._:-]+$", format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case checkpointItemId = "checkpointItemId"
    case operationKey = "operationKey"
  }
}

public enum RoutethreadU2DCheckpointU2DRevertResponseU2DFilesPhase_efc124973b: String, Codable, Sendable {
  case `pending` = "pending"
  case `completed` = "completed"
  case `failed` = "failed"
  case `skippedU5FNoU5FLocation` = "skipped_no_location"
  case `skippedU5FMissingU5FCheckpoint` = "skipped_missing_checkpoint"
}

public enum RoutethreadU2DCheckpointU2DRevertResponseU2DOutcome_08ce03e607: String, Codable, Sendable {
  case `completed` = "completed"
  case `completedU5FLocalU5FOnly` = "completed_local_only"
  case `ambiguous` = "ambiguous"
  case `failed` = "failed"
  case `noop` = "noop"
}

public enum RoutethreadU2DCheckpointU2DRevertResponseU2DProviderPhase_11ada4e73a: String, Codable, Sendable {
  case `pending` = "pending"
  case `completed` = "completed"
  case `failed` = "failed"
  case `ambiguous` = "ambiguous"
  case `skippedU5FNoU5FTurns` = "skipped_no_turns"
  case `skippedU5FMissingU5FCheckpoint` = "skipped_missing_checkpoint"
}

public enum RoutethreadU2DCheckpointU2DRevertResponseU2DTruncatePhase_35962a43ae: String, Codable, Sendable {
  case `pending` = "pending"
  case `completed` = "completed"
  case `noop` = "noop"
}

public struct RoutethreadU2DCheckpointU2DRevertResponse_8dfc34ff21: Codable, Sendable, RemoteModelMetadata {
  public var filesPhase: RoutethreadU2DCheckpointU2DRevertResponseU2DFilesPhase_efc124973b
  public var numTurns: Int64
  public var outcome: RoutethreadU2DCheckpointU2DRevertResponseU2DOutcome_08ce03e607
  public var providerPhase: RoutethreadU2DCheckpointU2DRevertResponseU2DProviderPhase_11ada4e73a
  public var removedCompletedTurnAnchors: [ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]
  public var replayed: Bool
  public var truncatePhase: RoutethreadU2DCheckpointU2DRevertResponseU2DTruncatePhase_35962a43ae
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "filesPhase", typeName: "RoutethreadU2DCheckpointU2DRevertResponseU2DFilesPhase_efc124973b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "numTurns", typeName: "Int64", required: true, nullable: false, minimum: -9007199254740991, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "outcome", typeName: "RoutethreadU2DCheckpointU2DRevertResponseU2DOutcome_08ce03e607", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "providerPhase", typeName: "RoutethreadU2DCheckpointU2DRevertResponseU2DProviderPhase_11ada4e73a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "removedCompletedTurnAnchors", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "replayed", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "truncatePhase", typeName: "RoutethreadU2DCheckpointU2DRevertResponseU2DTruncatePhase_35962a43ae", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case filesPhase = "filesPhase"
    case numTurns = "numTurns"
    case outcome = "outcome"
    case providerPhase = "providerPhase"
    case removedCompletedTurnAnchors = "removedCompletedTurnAnchors"
    case replayed = "replayed"
    case truncatePhase = "truncatePhase"
  }
}

public enum RoutethreadU2DCommandRequestU2DOptionU2D10U2DKind_833ef472e7: String, Codable, Sendable {
  case `setU2DStarred` = "set-starred"
}

public struct RoutethreadU2DCommandRequestU2DOptionU2D10_ebd70a208b: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D10U2DKind_833ef472e7
  public var starred: Bool
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D10U2DKind_833ef472e7", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "starred", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case starred = "starred"
  }
}

public enum RoutethreadU2DCommandRequestU2DOptionU2D11U2DKind_49f72e8cc5: String, Codable, Sendable {
  case `setU2DWorktree` = "set-worktree"
}

public struct RoutethreadU2DCommandRequestU2DOptionU2D11_b79d8f64de: Codable, Sendable, RemoteModelMetadata {
  public var isNewWorktree: RemoteField<Bool> = .missing
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D11U2DKind_49f72e8cc5
  public var worktreeBranch: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var worktreePath: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "isNewWorktree", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D11U2DKind_49f72e8cc5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeBranch", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreePath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case isNewWorktree = "isNewWorktree"
    case kind = "kind"
    case worktreeBranch = "worktreeBranch"
    case worktreePath = "worktreePath"
  }
}

public enum RoutethreadU2DCommandRequestU2DOptionU2D12U2DKind_6a0abedb39: String, Codable, Sendable {
  case `deleteU2DWorktreeU2DGroup` = "delete-worktree-group"
}

public struct RoutethreadU2DCommandRequestU2DOptionU2D12_09765c7778: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D12U2DKind_6a0abedb39
  public var projectId: String
  public var threadIds: [String]
  public var worktreePath: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D12U2DKind_6a0abedb39", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadIds", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: 1, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreePath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case projectId = "projectId"
    case threadIds = "threadIds"
    case worktreePath = "worktreePath"
  }
}

public enum RoutethreadU2DCommandRequestU2DOptionU2D13U2DKind_53ceafeed2: String, Codable, Sendable {
  case `archive` = "archive"
}

public struct RoutethreadU2DCommandRequestU2DOptionU2D13_431be1ab7e: Codable, Sendable, RemoteModelMetadata {
  public var kind: RoutethreadU2DCommandRequestU2DOptionU2D13U2DKind_53ceafeed2
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "RoutethreadU2DCommandRequestU2DOptionU2D13U2DKind_53ceafeed2", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
  }
}

public enum RoutethreadU2DCommandRequestU2DOptionU2D14U2DKind_c7bfc39efc: String, Codable, Sendable {
  case `unarchive` = "unarchive"
}
