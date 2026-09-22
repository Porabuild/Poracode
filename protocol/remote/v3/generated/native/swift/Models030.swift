// GENERATED FILE. Do not edit by hand.
import Foundation
public struct RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValue_a20681cb35: Codable, Sendable, RemoteModelMetadata {
  public var project: RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValueU2DProject_83470ce639
  public var pullRequestKeys: [ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]
  public var refreshedAt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var viewerLogin: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "project", typeName: "RouteshellU2DSnapshotResponseU2DGitStateU2DProjectPullRequestListsU2DValueU2DProject_83470ce639", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "pullRequestKeys", typeName: "[ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "refreshedAt", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "viewerLogin", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public enum RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAttention_58edfaf9f7: String, Codable, Sendable {
  case none = "none"
  case working = "working"
  case needsU5FApproval = "needs_approval"
  case needsU5FReply = "needs_reply"
  case error = "error"
}

public enum RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DThreadStatusSource_8f73948792: String, Codable, Sendable {
  case cliU5FHook = "cli_hook"
  case terminalU5FParse = "terminal_parse"
  case server = "server"
}

public struct RouteshellU2DSnapshotResponseU2DThreadsU2DItem_9f0c1cf2ff: Codable, Sendable, RemoteModelMetadata {
  public var activeTurnStartedAt: RemoteField<String> = .missing
  public var agentInstanceId: RemoteField<String> = .missing
  public var agentKind: String
  public var archived: Bool
  public var archivedAt: RemoteField<String> = .missing
  public var attention: RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAttention_58edfaf9f7
  public var canResumeWithConfig: Bool
  public var config: ProcedureconnectThreadVoiceRequestU2DConfig_023567f089
  public var createdAt: String
  public var done: Bool
  public var doneAt: RemoteField<String> = .missing
  public var errorMessage: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var groupId: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var groupName: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var id: String
  public var lastTurnEndedAt: RemoteField<String> = .missing
  public var lastTurnStartedAt: RemoteField<String> = .missing
  public var parentThreadId: RemoteField<String> = .missing
  public var prNumber: RemoteField<Double> = .missing
  public var presentationMode: RemoteField<ProcedureensureThreadRunningRequestU2DPresentationMode_6508684ba6> = .missing
  public var projectId: String
  public var remoteId: RemoteField<String> = .missing
  public var remoteServerId: RemoteField<String> = .missing
  public var sessionRef: RemoteField<ProcedureensureThreadRunningRequestU2DSessionRef_3b70e9f118> = .missing
  public var slashCommands: RemoteField<[RouteagentU2DSlashU2DCommandsResponseU2DCommandsU2DItem_7324613e41]> = .missing
  public var starred: Bool
  public var status: ProcedureensureThreadRunningRequestU2DProviderSwitchU2DPreviousStatus_8c61ed237d
  public var threadStatusSource: RemoteField<RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DThreadStatusSource_8f73948792> = .missing
  public var title: String
  public var updatedAt: String
  public var workspaceId: RemoteField<String> = .missing
  public var worktreeBranch: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var worktreePath: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "activeTurnStartedAt", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "agentInstanceId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 120, minItems: nil, maxItems: nil, pattern: "^[a-z0-9][a-z0-9_\\-:.]*$", format: nil, semanticValidatorIds: []),
    .init(wireName: "agentKind", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "archived", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "archivedAt", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "attention", typeName: "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DAttention_58edfaf9f7", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "canResumeWithConfig", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "config", typeName: "ProcedureconnectThreadVoiceRequestU2DConfig_023567f089", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "createdAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "done", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "doneAt", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "errorMessage", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "groupId", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "groupName", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastTurnEndedAt", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "lastTurnStartedAt", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "parentThreadId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prNumber", typeName: "Double", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "presentationMode", typeName: "ProcedureensureThreadRunningRequestU2DPresentationMode_6508684ba6", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "remoteId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "remoteServerId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "sessionRef", typeName: "ProcedureensureThreadRunningRequestU2DSessionRef_3b70e9f118", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "slashCommands", typeName: "[RouteagentU2DSlashU2DCommandsResponseU2DCommandsU2DItem_7324613e41]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "starred", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "status", typeName: "ProcedureensureThreadRunningRequestU2DProviderSwitchU2DPreviousStatus_8c61ed237d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadStatusSource", typeName: "RouteshellU2DSnapshotResponseU2DThreadsU2DItemU2DThreadStatusSource_8f73948792", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "updatedAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "workspaceId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreeBranch", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "worktreePath", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case activeTurnStartedAt = "activeTurnStartedAt"
    case agentInstanceId = "agentInstanceId"
    case agentKind = "agentKind"
    case archived = "archived"
    case archivedAt = "archivedAt"
    case attention = "attention"
    case canResumeWithConfig = "canResumeWithConfig"
    case config = "config"
    case createdAt = "createdAt"
    case done = "done"
    case doneAt = "doneAt"
    case errorMessage = "errorMessage"
    case groupId = "groupId"
    case groupName = "groupName"
    case id = "id"
    case lastTurnEndedAt = "lastTurnEndedAt"
    case lastTurnStartedAt = "lastTurnStartedAt"
    case parentThreadId = "parentThreadId"
    case prNumber = "prNumber"
    case presentationMode = "presentationMode"
    case projectId = "projectId"
    case remoteId = "remoteId"
    case remoteServerId = "remoteServerId"
    case sessionRef = "sessionRef"
    case slashCommands = "slashCommands"
    case starred = "starred"
    case status = "status"
    case threadStatusSource = "threadStatusSource"
    case title = "title"
    case updatedAt = "updatedAt"
    case workspaceId = "workspaceId"
    case worktreeBranch = "worktreeBranch"
    case worktreePath = "worktreePath"
  }
}
