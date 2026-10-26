// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProcedureforgeConvertPrToDraftRequest_1c60a16c12: Codable, Sendable, RemoteModelMetadata {
  public var forgeAccount: ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b
  public var forgeRepository: String
  public var prNumber: Int64
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "forgeAccount", typeName: "ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "forgeRepository", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prNumber", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case forgeAccount = "forgeAccount"
    case forgeRepository = "forgeRepository"
    case prNumber = "prNumber"
    case projectLocation = "projectLocation"
  }
}

public struct ProcedureforgeCreatePrRequest_0b938cf4ea: Codable, Sendable, RemoteModelMetadata {
  public var baseBranch: String
  public var body: RemoteField<String> = .missing
  public var branch: String
  public var forgeAccount: RemoteField<ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b> = .missing
  public var forgeRepository: RemoteField<String> = .missing
  public var isDraft: RemoteField<Bool> = .missing
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public var title: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "baseBranch", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "body", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "branch", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "forgeAccount", typeName: "ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "forgeRepository", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "isDraft", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case baseBranch = "baseBranch"
    case body = "body"
    case branch = "branch"
    case forgeAccount = "forgeAccount"
    case forgeRepository = "forgeRepository"
    case isDraft = "isDraft"
    case projectLocation = "projectLocation"
    case title = "title"
  }
}

public enum ProcedureforgeCreatePrResultU2DMergeStateStatus_ecf46d0165: String, Codable, Sendable {
  case `bEHIND` = "BEHIND"
  case `bLOCKED` = "BLOCKED"
  case `cLEAN` = "CLEAN"
  case `dIRTY` = "DIRTY"
  case `dRAFT` = "DRAFT"
  case `hASU5FHOOKS` = "HAS_HOOKS"
  case `uNKNOWN` = "UNKNOWN"
  case `uNSTABLE` = "UNSTABLE"
}

public enum ProcedureforgeCreatePrResultU2DMergeable_05ab37f667: String, Codable, Sendable {
  case `mERGEABLE` = "MERGEABLE"
  case `cONFLICTING` = "CONFLICTING"
  case `uNKNOWN` = "UNKNOWN"
}

public enum ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DCommentEditingU2DItem_46c9cbbd3d: String, Codable, Sendable {
  case `conversation` = "conversation"
  case `inline` = "inline"
}

public enum ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DMergeMethodsU2DItem_9c01de6b08: String, Codable, Sendable {
  case `merge` = "merge"
  case `squash` = "squash"
  case `rebase` = "rebase"
}

public enum ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DReviewDecisionsU2DItem_c0551fbf08: String, Codable, Sendable {
  case `approve` = "approve"
  case `requestU2DChanges` = "request-changes"
  case `comment` = "comment"
}

public enum ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DViewedFiles_ae682752b1: String, Codable, Sendable {
  case `forge` = "forge"
  case `host` = "host"
}

public struct ProcedureforgeCreatePrResultU2DSourceU2DCapabilities_3ad15ffc16: Codable, Sendable, RemoteModelMetadata {
  public var adminMerge: Bool
  public var autoFix: Bool
  public var autoMerge: Bool
  public var checks: Bool
  public var commentEditing: RemoteField<[ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DCommentEditingU2DItem_46c9cbbd3d]> = .missing
  public var commitDiffs: RemoteField<ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1> = .missing
  public var convertToDraft: RemoteField<ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1> = .missing
  public var draft: Bool
  public var edit: Bool
  public var expectedHeadMerge: Bool
  public var labels: RemoteField<ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1> = .missing
  public var mergeMethods: [ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DMergeMethodsU2DItem_9c01de6b08]
  public var reactions: RemoteField<[String]> = .missing
  public var rebaseBranch: Bool
  public var reopen: Bool
  public var reviewDecisions: [ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DReviewDecisionsU2DItem_c0551fbf08]
  public var reviewDrafts: RemoteField<ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1> = .missing
  public var reviewGuides: RemoteField<ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1> = .missing
  public var reviewRequests: RemoteField<ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1> = .missing
  public var reviewThreads: Bool
  public var updateBranch: Bool
  public var viewedFiles: RemoteField<ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DViewedFiles_ae682752b1> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "adminMerge", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "autoFix", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "autoMerge", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "checks", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "commentEditing", typeName: "[ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DCommentEditingU2DItem_46c9cbbd3d]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "commitDiffs", typeName: "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "convertToDraft", typeName: "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "draft", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "edit", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "expectedHeadMerge", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "labels", typeName: "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mergeMethods", typeName: "[ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DMergeMethodsU2DItem_9c01de6b08]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reactions", typeName: "[String]", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: 32, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "rebaseBranch", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reopen", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reviewDecisions", typeName: "[ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DReviewDecisionsU2DItem_c0551fbf08]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reviewDrafts", typeName: "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reviewGuides", typeName: "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reviewRequests", typeName: "ProcedureensureThreadRunningRequestU2DMentionHandoff_d2dd3595e1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reviewThreads", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "updateBranch", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "viewedFiles", typeName: "ProcedureforgeCreatePrResultU2DSourceU2DCapabilitiesU2DViewedFiles_ae682752b1", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case adminMerge = "adminMerge"
    case autoFix = "autoFix"
    case autoMerge = "autoMerge"
    case checks = "checks"
    case commentEditing = "commentEditing"
    case commitDiffs = "commitDiffs"
    case convertToDraft = "convertToDraft"
    case draft = "draft"
    case edit = "edit"
    case expectedHeadMerge = "expectedHeadMerge"
    case labels = "labels"
    case mergeMethods = "mergeMethods"
    case reactions = "reactions"
    case rebaseBranch = "rebaseBranch"
    case reopen = "reopen"
    case reviewDecisions = "reviewDecisions"
    case reviewDrafts = "reviewDrafts"
    case reviewGuides = "reviewGuides"
    case reviewRequests = "reviewRequests"
    case reviewThreads = "reviewThreads"
    case updateBranch = "updateBranch"
    case viewedFiles = "viewedFiles"
  }
}

public struct ProcedureforgeCreatePrResultU2DSource_2e68c47efd: Codable, Sendable, RemoteModelMetadata {
  public var account: RemoteField<ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b> = .missing
  public var capabilities: ProcedureforgeCreatePrResultU2DSourceU2DCapabilities_3ad15ffc16
  public var forge: ProcedureforgeClosePrRequestU2DForgeAccountU2DForge_eaed3cfbf4
  public var host: String
  public var remote: String
  public var repository: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "account", typeName: "ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "capabilities", typeName: "ProcedureforgeCreatePrResultU2DSourceU2DCapabilities_3ad15ffc16", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "forge", typeName: "ProcedureforgeClosePrRequestU2DForgeAccountU2DForge_eaed3cfbf4", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "host", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "remote", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "repository", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case account = "account"
    case capabilities = "capabilities"
    case forge = "forge"
    case host = "host"
    case remote = "remote"
    case repository = "repository"
  }
}

public enum ProcedureforgeCreatePrResultU2DState_79fd49e14d: String, Codable, Sendable {
  case `open` = "open"
  case `draft` = "draft"
  case `merged` = "merged"
  case `closed` = "closed"
}

public struct ProcedureforgeCreatePrResult_ea7fc856bb: Codable, Sendable, RemoteModelMetadata {
  public var baseBranch: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var checksStatus: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var headSha: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var isCrossRepository: RemoteField<Bool> = .missing
  public var isDraft: Bool
  public var mergeStateStatus: RemoteField<ProcedureforgeCreatePrResultU2DMergeStateStatus_ecf46d0165> = .missing
  public var mergeable: RemoteField<ProcedureforgeCreatePrResultU2DMergeable_05ab37f667> = .missing
  public var number: Int64
  public var reviewDecision: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var source: RemoteField<ProcedureforgeCreatePrResultU2DSource_2e68c47efd> = .missing
  public var state: ProcedureforgeCreatePrResultU2DState_79fd49e14d
  public var title: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var updatedAt: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var url: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var viewerDidAuthor: RemoteField<Bool> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "baseBranch", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "checksStatus", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "headSha", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "isCrossRepository", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "isDraft", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mergeStateStatus", typeName: "ProcedureforgeCreatePrResultU2DMergeStateStatus_ecf46d0165", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mergeable", typeName: "ProcedureforgeCreatePrResultU2DMergeable_05ab37f667", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "number", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reviewDecision", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "source", typeName: "ProcedureforgeCreatePrResultU2DSource_2e68c47efd", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "state", typeName: "ProcedureforgeCreatePrResultU2DState_79fd49e14d", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "updatedAt", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "url", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "viewerDidAuthor", typeName: "Bool", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case baseBranch = "baseBranch"
    case checksStatus = "checksStatus"
    case headSha = "headSha"
    case isCrossRepository = "isCrossRepository"
    case isDraft = "isDraft"
    case mergeStateStatus = "mergeStateStatus"
    case mergeable = "mergeable"
    case number = "number"
    case reviewDecision = "reviewDecision"
    case source = "source"
    case state = "state"
    case title = "title"
    case updatedAt = "updatedAt"
    case url = "url"
    case viewerDidAuthor = "viewerDidAuthor"
  }
}

public struct ProcedureforgeEditPrCommentRequest_cc9733aab3: Codable, Sendable, RemoteModelMetadata {
  public var body: String
  public var commentId: String
  public var expectedBody: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var forgeAccount: ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b
  public var forgeRepository: String
  public var prNumber: Int64
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public var threadId: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "body", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "commentId", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 256, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "expectedBody", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "forgeAccount", typeName: "ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "forgeRepository", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prNumber", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threadId", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: 256, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case body = "body"
    case commentId = "commentId"
    case expectedBody = "expectedBody"
    case forgeAccount = "forgeAccount"
    case forgeRepository = "forgeRepository"
    case prNumber = "prNumber"
    case projectLocation = "projectLocation"
    case threadId = "threadId"
  }
}

public struct ProcedureforgeEditPrRequest_3ee9ee08aa: Codable, Sendable, RemoteModelMetadata {
  public var baseBranch: RemoteField<String> = .missing
  public var body: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var forgeAccount: RemoteField<ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b> = .missing
  public var forgeRepository: RemoteField<String> = .missing
  public var prNumber: Int64
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public var title: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "baseBranch", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "body", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "forgeAccount", typeName: "ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "forgeRepository", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prNumber", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = ["forge.edit.fields"]
  private enum CodingKeys: String, CodingKey {
    case baseBranch = "baseBranch"
    case body = "body"
    case forgeAccount = "forgeAccount"
    case forgeRepository = "forgeRepository"
    case prNumber = "prNumber"
    case projectLocation = "projectLocation"
    case title = "title"
  }
}

public struct ProcedureforgeGetPrChecksRequest_1f21330aa4: Codable, Sendable, RemoteModelMetadata {
  public var branch: String
  public var forgeAccount: RemoteField<ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b> = .missing
  public var forgeRepository: RemoteField<String> = .missing
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "branch", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "forgeAccount", typeName: "ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "forgeRepository", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case branch = "branch"
    case forgeAccount = "forgeAccount"
    case forgeRepository = "forgeRepository"
    case projectLocation = "projectLocation"
  }
}

public struct ProcedureforgeGetPrChecksResultU2DChecksU2DItem_0d39188d7c: Codable, Sendable, RemoteModelMetadata {
  public var completedAt: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var conclusion: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var name: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var startedAt: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var state: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public var url: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var workflowName: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "completedAt", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "conclusion", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "startedAt", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "state", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "url", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "workflowName", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case completedAt = "completedAt"
    case conclusion = "conclusion"
    case name = "name"
    case startedAt = "startedAt"
    case state = "state"
    case url = "url"
    case workflowName = "workflowName"
  }
}

public struct ProcedureforgeGetPrChecksResult_437e2d5d20: Codable, Sendable, RemoteModelMetadata {
  public var checks: [ProcedureforgeGetPrChecksResultU2DChecksU2DItem_0d39188d7c]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "checks", typeName: "[ProcedureforgeGetPrChecksResultU2DChecksU2DItem_0d39188d7c]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case checks = "checks"
  }
}

public struct ProcedureforgeGetPrCommitDiffRequest_c70a9f8632: Codable, Sendable, RemoteModelMetadata {
  public var commit: String
  public var forgeAccount: ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b
  public var forgeRepository: String
  public var prNumber: Int64
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "commit", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: "^[0-9a-f]{7,64}$", format: nil, semanticValidatorIds: []),
    .init(wireName: "forgeAccount", typeName: "ProcedureforgeClosePrRequestU2DForgeAccount_c2bb40b82b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "forgeRepository", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "prNumber", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case commit = "commit"
    case forgeAccount = "forgeAccount"
    case forgeRepository = "forgeRepository"
    case prNumber = "prNumber"
    case projectLocation = "projectLocation"
  }
}

public struct ProcedureforgeGetPrCommitDiffResult_ecbd7591c9: Codable, Sendable, RemoteModelMetadata {
  public var diff: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "diff", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case diff = "diff"
  }
}

public struct ProcedureforgeGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a: Codable, Sendable, RemoteModelMetadata {
  public var avatarUrl: RemoteField<ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b> = .missing
  public var login: ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "avatarUrl", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "login", typeName: "ProcedurebeginMcpServerOauthRequestU2DServerU2DTransportU2DOptionU2D1U2DArgsU2DItem_bf0b727f7b", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case avatarUrl = "avatarUrl"
    case login = "login"
  }
}
