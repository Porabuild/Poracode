// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteshellU2DSnapshotResponseU2DGitStateU2DProjectsU2DValue_18a5d3fa6e: Codable, Sendable, RemoteModelMetadata {
  public var branches: RemoteField<ProceduregitListBranchesResult_458a450839> = .missing
  public var ghAvailable: RemoteField<Bool> = .missing
  public var ref: RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValueU2DProject_83470ce639
  public var refreshedAt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var status: RemoteField<ProceduregetGitStatusResult_c1d4a9f752> = .missing
  public var worktrees: RemoteField<[ProceduregitListWorktreesResultU2DWorktreesU2DItem_0288aefad6]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "branches", typeName: "ProceduregitListBranchesResult_458a450839", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ghAvailable", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ref", typeName: "RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValueU2DProject_83470ce639", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refreshedAt", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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
  public var core: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var details: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var diff: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var files: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var reviewThreads: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "core", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "details", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "diff", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "files", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reviewThreads", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public struct RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequestsU2DValueU2DRef_2558986145: Codable, Sendable, RemoteModelMetadata {
  public var hostId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var prNumber: Int64
  public var projectId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "hostId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prNumber", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case hostId = "hostId"
    case prNumber = "prNumber"
    case projectId = "projectId"
  }
}

public struct RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequestsU2DValue_5a8fe22d39: Codable, Sendable, RemoteModelMetadata {
  public var data: ProcedureghCreatePrResult_a4457c545e
  public var details: RemoteField<ProcedureghGetPrDetailsResultU2DDetails_9f1da8cf54> = .missing
  public var diff: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var files: RemoteField<[ProcedureghGetPrFilesResultU2DFilesU2DItem_63c18b52ff]> = .missing
  public var freshness: RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequestsU2DValueU2DFreshness_0bd7710eac
  public var ref: RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequestsU2DValueU2DRef_2558986145
  public var reviewThreads: RemoteField<[ProcedureghGetPrReviewCommentsResultU2DThreadsU2DItem_9199b6e9ea]> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "data", typeName: "ProcedureghCreatePrResult_a4457c545e", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "details", typeName: "ProcedureghGetPrDetailsResultU2DDetails_9f1da8cf54", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "diff", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "files", typeName: "[ProcedureghGetPrFilesResultU2DFilesU2DItem_63c18b52ff]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "freshness", typeName: "RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequestsU2DValueU2DFreshness_0bd7710eac", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ref", typeName: "RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequestsU2DValueU2DRef_2558986145", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reviewThreads", typeName: "[ProcedureghGetPrReviewCommentsResultU2DThreadsU2DItem_9199b6e9ea]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case data = "data"
    case details = "details"
    case diff = "diff"
    case files = "files"
    case freshness = "freshness"
    case ref = "ref"
    case reviewThreads = "reviewThreads"
  }
}

public typealias RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequests_4c858ee6a4 = [String: RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequestsU2DValue_5a8fe22d39]

public struct RouteshellU2DSnapshotResponseU2DGitStateU2DTargetsU2DValueU2DRef_725be166aa: Codable, Sendable, RemoteModelMetadata {
  public var hostId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var projectId: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var worktreePath: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "hostId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreePath", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case hostId = "hostId"
    case projectId = "projectId"
    case worktreePath = "worktreePath"
  }
}

public struct RouteshellU2DSnapshotResponseU2DGitStateU2DTargetsU2DValue_d68bbd0856: Codable, Sendable, RemoteModelMetadata {
  public var pullRequestKey: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var ref: RouteshellU2DSnapshotResponseU2DGitStateU2DTargetsU2DValueU2DRef_725be166aa
  public var refreshedAt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var sourceInfo: RemoteField<ProceduregitGetWorktreeSourceBranchResult_4864c5f65a> = .missing
  public var status: RemoteField<ProceduregetGitStatusResult_c1d4a9f752> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "pullRequestKey", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ref", typeName: "RouteshellU2DSnapshotResponseU2DGitStateU2DTargetsU2DValueU2DRef_725be166aa", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refreshedAt", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sourceInfo", typeName: "ProceduregitGetWorktreeSourceBranchResult_4864c5f65a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "ProceduregetGitStatusResult_c1d4a9f752", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case pullRequestKey = "pullRequestKey"
    case ref = "ref"
    case refreshedAt = "refreshedAt"
    case sourceInfo = "sourceInfo"
    case status = "status"
  }
}

public typealias RouteshellU2DSnapshotResponseU2DGitStateU2DTargets_7675a7cd6a = [String: RouteshellU2DSnapshotResponseU2DGitStateU2DTargetsU2DValue_d68bbd0856]

public struct RouteshellU2DSnapshotResponseU2DGitState_4331716fe2: Codable, Sendable, RemoteModelMetadata {
  public var projectPullRequestLists: RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestLists_d8ae5c3a60
  public var projects: RouteshellU2DSnapshotResponseU2DGitStateU2DProjects_1da8031b61
  public var pullRequestKeyByBranch: ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67
  public var pullRequests: RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequests_4c858ee6a4
  public var revision: Int64
  public var targets: RouteshellU2DSnapshotResponseU2DGitStateU2DTargets_7675a7cd6a
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "projectPullRequestLists", typeName: "RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestLists_d8ae5c3a60", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projects", typeName: "RouteshellU2DSnapshotResponseU2DGitStateU2DProjects_1da8031b61", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pullRequestKeyByBranch", typeName: "ProceduregetGitDiffBatchResultU2DStaged_e51d77fd67", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pullRequests", typeName: "RouteshellU2DSnapshotResponseU2DGitStateU2DPullRequests_4c858ee6a4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "revision", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "targets", typeName: "RouteshellU2DSnapshotResponseU2DGitStateU2DTargets_7675a7cd6a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case projectPullRequestLists = "projectPullRequestLists"
    case projects = "projects"
    case pullRequestKeyByBranch = "pullRequestKeyByBranch"
    case pullRequests = "pullRequests"
    case revision = "revision"
    case targets = "targets"
  }
}

public struct RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValueU2DPrU2DOptionU2D1_1c58197f24: Codable, Sendable, RemoteModelMetadata {
  public var checksStatus: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var isDraft: Bool
  public var number: Int64
  public var state: ProcedureghCreatePrResultU2DState_79fd49e14d
  public var title: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var url: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "checksStatus", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "isDraft", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "number", typeName: "Int64", required: true, nullable: false, minimum: -9007199254740991, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "state", typeName: "ProcedureghCreatePrResultU2DState_79fd49e14d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "url", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case checksStatus = "checksStatus"
    case isDraft = "isDraft"
    case number = "number"
    case state = "state"
    case title = "title"
    case url = "url"
  }
}

public typealias RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValueU2DPr_9d263023fc = RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValueU2DPrU2DOptionU2D1_1c58197f24?

public struct RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValue_b2a9cad3f0: Codable, Sendable, RemoteModelMetadata {
  public var ahead: Int64
  public var behind: Int64
  public var branch: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var isRepo: Bool
  public var pr: RemoteField<RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValueU2DPrU2DOptionU2D1_1c58197f24>
  public var totalDeletions: Int64
  public var totalInsertions: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "ahead", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "behind", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "branch", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "isRepo", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pr", typeName: "RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValueU2DPrU2DOptionU2D1_1c58197f24", required: true, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "totalDeletions", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "totalInsertions", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case ahead = "ahead"
    case behind = "behind"
    case branch = "branch"
    case isRepo = "isRepo"
    case pr = "pr"
    case totalDeletions = "totalDeletions"
    case totalInsertions = "totalInsertions"
  }
}

public typealias RouteshellU2DSnapshotResponseU2DGitSummariesByThread_aca97eda78 = [String: RouteshellU2DSnapshotResponseU2DGitSummariesByThreadU2DValue_b2a9cad3f0]

public typealias RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValueU2DContextUsage_e47ad2358c = ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b?

public enum RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValueU2DLatestItemState_2472eab79a: String, Codable, Sendable {
  case started = "started"
  case updated = "updated"
  case completed = "completed"
}

public struct RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValue_5d401c152e: Codable, Sendable, RemoteModelMetadata {
  public var contextUsage: RemoteField<ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b> = .missing
  public var itemCount: Int64
  public var latestItemId: RemoteField<String> = .missing
  public var latestItemState: RemoteField<RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValueU2DLatestItemState_2472eab79a> = .missing
  public var latestItemType: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "contextUsage", typeName: "ProceduresubagentSubscribeResultU2DHistoryU2DItemU2DOptionU2D9U2DUsage_80ac3a097b", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "itemCount", typeName: "Int64", required: true, nullable: false, minimum: 0, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "latestItemId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "latestItemState", typeName: "RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValueU2DLatestItemState_2472eab79a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "latestItemType", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case contextUsage = "contextUsage"
    case itemCount = "itemCount"
    case latestItemId = "latestItemId"
    case latestItemState = "latestItemState"
    case latestItemType = "latestItemType"
  }
}

public typealias RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThread_fc9d6f4c26 = [String: RouteshellU2DSnapshotResponseU2DRuntimeSummariesByThreadU2DValue_5d401c152e]

public struct RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D1_66504fdb43: Codable, Sendable, RemoteModelMetadata {
  public var kind: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D1U2DKind_5465dd986b
  public var path: String
  public var remoteServerId: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D1U2DKind_5465dd986b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 4096, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "remoteServerId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case path = "path"
    case remoteServerId = "remoteServerId"
  }
}

public struct RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D2_8b72b09d5c: Codable, Sendable, RemoteModelMetadata {
  public var distro: String
  public var kind: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2U2DKind_2d8274eae5
  public var linuxPath: String
  public var remoteServerId: RemoteField<String> = .missing
  public var uncPath: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "distro", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "kind", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D2U2DKind_2d8274eae5", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "linuxPath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 4096, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "remoteServerId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "uncPath", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case distro = "distro"
    case kind = "kind"
    case linuxPath = "linuxPath"
    case remoteServerId = "remoteServerId"
    case uncPath = "uncPath"
  }
}

public struct RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D3_8850f6c7f1: Codable, Sendable, RemoteModelMetadata {
  public var kind: ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D3U2DKind_835d30ad47
  public var path: String
  public var remoteServerId: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "kind", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocationU2DOptionU2D3U2DKind_835d30ad47", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 4096, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "remoteServerId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case kind = "kind"
    case path = "path"
    case remoteServerId = "remoteServerId"
  }
}

public enum RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1: Codable, Sendable {
  case option1(RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D1_66504fdb43)
  case option2(RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D2_8b72b09d5c)
  case option3(RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D3_8850f6c7f1)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1)] = []
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("windows")]), let value = try? container.decode(RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D1_66504fdb43.self) {
      matches.append((1, .option1(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("wsl")]), let value = try? container.decode(RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D2_8b72b09d5c.self) {
      matches.append((2, .option2(value)))
    }
    if RemoteUnionProbe.matchesProperty(decoder, property: "kind", literals: [.string("posix")]), let value = try? container.decode(RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItemU2DOptionU2D3_8850f6c7f1.self) {
      matches.append((3, .option3(value)))
    }
    guard matches.count == 1 else {
      let detail = matches.isEmpty ? "No union option matched RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1" : "Ambiguous union RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1 matched options " + matches.map { String($0.0) }.joined(separator: ", ")
      throw DecodingError.typeMismatch(RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAdditionalDirectoriesU2DItem_137445efd1.self, .init(codingPath: decoder.codingPath, debugDescription: detail))
    }
    self = matches[0].1
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

public enum RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAttention_58edfaf9f7: String, Codable, Sendable {
  case none = "none"
  case working = "working"
  case needsU5FApproval = "needs_approval"
  case needsU5FReply = "needs_reply"
  case error = "error"
}

public struct RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DGroupsU2DItem_2e2f445a74: Codable, Sendable, RemoteModelMetadata {
  public var id: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var name: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "id", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case id = "id"
    case name = "name"
  }
}

public enum RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DRole_09201de15f: String, Codable, Sendable {
  case model = "model"
  case effort = "effort"
  case mode = "mode"
  case thinking = "thinking"
  case fast = "fast"
  case context = "context"
}

public struct RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DValuesU2DItem_0465e7aaae: Codable, Sendable, RemoteModelMetadata {
  public var group: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var name: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var value: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "group", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "value", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case group = "group"
    case name = "name"
    case value = "value"
  }
}

public struct RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1_84503a3e63: Codable, Sendable, RemoteModelMetadata {
  public var category: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var currentValue: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var groups: [RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DGroupsU2DItem_2e2f445a74]
  public var id: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var name: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var role: RemoteField<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DRole_09201de15f> = .missing
  public var typeValue: RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D2U2DType_36b9fe91ec
  public var values: [RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DValuesU2DItem_0465e7aaae]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "category", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "currentValue", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "groups", typeName: "[RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DGroupsU2DItem_2e2f445a74]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "role", typeName: "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DRole_09201de15f", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "RouteagentU2DStatusesResponseU2DWindowsU2DItemU2DCapabilitiesU2DPresentationCapabilitiesU2DGuiU2DSettingDefsU2DItemU2DOptionU2D2U2DType_36b9fe91ec", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "values", typeName: "[RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D1U2DValuesU2DItem_0465e7aaae]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case category = "category"
    case currentValue = "currentValue"
    case groups = "groups"
    case id = "id"
    case name = "name"
    case role = "role"
    case typeValue = "type"
    case values = "values"
  }
}

public enum RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DSessionConfigOptionsU2DOptionU2D1U2DItemU2DOptionU2D2U2DType_2c671d62fd: String, Codable, Sendable {
  case boolean = "boolean"
}
