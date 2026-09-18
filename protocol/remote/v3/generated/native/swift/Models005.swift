// GENERATED FILE. Do not edit by hand.
import Foundation
public struct ProcedureghDispatchWorkflowRequest_e56382aee3: Codable, Sendable, RemoteModelMetadata {
  public var ghAccount: RemoteField<ProcedureghCancelWorkflowRunRequestU2DGhAccount_5646cf57ff> = .missing
  public var inputs: RemoteField<ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894> = .missing
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public var ref: RemoteField<String> = .missing
  public var workflowId: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "ghAccount", typeName: "ProcedureghCancelWorkflowRunRequestU2DGhAccount_5646cf57ff", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "inputs", typeName: "ProcedureghDispatchWorkflowRequestU2DInputs_fd056ca894", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ref", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "workflowId", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case ghAccount = "ghAccount"
    case inputs = "inputs"
    case projectLocation = "projectLocation"
    case ref = "ref"
    case workflowId = "workflowId"
  }
}

public struct ProcedureghGetPrChecksRequest_50e8e4265c: Codable, Sendable, RemoteModelMetadata {
  public var branch: String
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "branch", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case branch = "branch"
    case projectLocation = "projectLocation"
  }
}

public struct ProcedureghGetPrChecksResultU2DChecksU2DItem_0d39188d7c: Codable, Sendable, RemoteModelMetadata {
  public var completedAt: RemoteField<String> = .missing
  public var conclusion: String
  public var name: String
  public var startedAt: RemoteField<String> = .missing
  public var state: String
  public var url: RemoteField<String> = .missing
  public var workflowName: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "completedAt", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "conclusion", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "startedAt", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "state", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "url", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "workflowName", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
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

public struct ProcedureghGetPrChecksResult_437e2d5d20: Codable, Sendable, RemoteModelMetadata {
  public var checks: [ProcedureghGetPrChecksResultU2DChecksU2DItem_0d39188d7c]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "checks", typeName: "[ProcedureghGetPrChecksResultU2DChecksU2DItem_0d39188d7c]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case checks = "checks"
  }
}

public struct ProcedureghGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a: Codable, Sendable, RemoteModelMetadata {
  public var avatarUrl: RemoteField<String> = .missing
  public var login: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "avatarUrl", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "login", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case avatarUrl = "avatarUrl"
    case login = "login"
  }
}

public struct ProcedureghGetPrDetailsResultU2DDetailsU2DCommentsU2DItem_839da5c7aa: Codable, Sendable, RemoteModelMetadata {
  public var author: ProcedureghGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a
  public var body: String
  public var createdAt: String
  public var id: String
  public var url: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "author", typeName: "ProcedureghGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "body", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "createdAt", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "url", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case author = "author"
    case body = "body"
    case createdAt = "createdAt"
    case id = "id"
    case url = "url"
  }
}

public struct ProcedureghGetPrDetailsResultU2DDetailsU2DCommitsU2DItem_9edd0cfb1c: Codable, Sendable, RemoteModelMetadata {
  public var abbreviatedOid: String
  public var author: RemoteField<ProcedureghGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a> = .missing
  public var authoredDate: String
  public var messageBody: RemoteField<String> = .missing
  public var messageHeadline: String
  public var oid: String
  public var url: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "abbreviatedOid", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "author", typeName: "ProcedureghGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "authoredDate", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "messageBody", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "messageHeadline", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "oid", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "url", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case abbreviatedOid = "abbreviatedOid"
    case author = "author"
    case authoredDate = "authoredDate"
    case messageBody = "messageBody"
    case messageHeadline = "messageHeadline"
    case oid = "oid"
    case url = "url"
  }
}

public typealias ProcedureghGetPrDetailsResultU2DDetailsU2DMergedBy_da37aeddd0 = ProcedureghGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a?

public enum ProcedureghGetPrDetailsResultU2DDetailsU2DReviewsU2DItemU2DState_d2a18aed5c: String, Codable, Sendable {
  case aPPROVED = "APPROVED"
  case cHANGESU5FREQUESTED = "CHANGES_REQUESTED"
  case cOMMENTED = "COMMENTED"
  case dISMISSED = "DISMISSED"
  case pENDING = "PENDING"
}

public struct ProcedureghGetPrDetailsResultU2DDetailsU2DReviewsU2DItem_dba220fea4: Codable, Sendable, RemoteModelMetadata {
  public var author: ProcedureghGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a
  public var body: String
  public var id: String
  public var state: ProcedureghGetPrDetailsResultU2DDetailsU2DReviewsU2DItemU2DState_d2a18aed5c
  public var submittedAt: RemoteField<String> = .missing
  public var url: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "author", typeName: "ProcedureghGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "body", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "state", typeName: "ProcedureghGetPrDetailsResultU2DDetailsU2DReviewsU2DItemU2DState_d2a18aed5c", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "submittedAt", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "url", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case author = "author"
    case body = "body"
    case id = "id"
    case state = "state"
    case submittedAt = "submittedAt"
    case url = "url"
  }
}

public struct ProcedureghGetPrDetailsResultU2DDetails_9f1da8cf54: Codable, Sendable, RemoteModelMetadata {
  public var additions: Int64
  public var author: RemoteField<ProcedureghGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a> = .missing
  public var baseBranch: String
  public var body: String
  public var changedFiles: Int64
  public var checks: [ProcedureghGetPrChecksResultU2DChecksU2DItem_0d39188d7c]
  public var closedAt: RemoteField<String> = .missing
  public var comments: [ProcedureghGetPrDetailsResultU2DDetailsU2DCommentsU2DItem_839da5c7aa]
  public var commits: [ProcedureghGetPrDetailsResultU2DDetailsU2DCommitsU2DItem_9edd0cfb1c]
  public var createdAt: RemoteField<String> = .missing
  public var deletions: Int64
  public var headBranch: String
  public var mergedAt: RemoteField<String> = .missing
  public var mergedBy: RemoteField<ProcedureghGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a> = .missing
  public var number: Int64
  public var reviews: [ProcedureghGetPrDetailsResultU2DDetailsU2DReviewsU2DItem_dba220fea4]
  public var title: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "additions", typeName: "Int64", required: true, nullable: false, minimum: -9007199254740991, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "author", typeName: "ProcedureghGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "baseBranch", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "body", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "changedFiles", typeName: "Int64", required: true, nullable: false, minimum: -9007199254740991, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "checks", typeName: "[ProcedureghGetPrChecksResultU2DChecksU2DItem_0d39188d7c]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "closedAt", typeName: "String", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "comments", typeName: "[ProcedureghGetPrDetailsResultU2DDetailsU2DCommentsU2DItem_839da5c7aa]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "commits", typeName: "[ProcedureghGetPrDetailsResultU2DDetailsU2DCommitsU2DItem_9edd0cfb1c]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "createdAt", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "deletions", typeName: "Int64", required: true, nullable: false, minimum: -9007199254740991, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "headBranch", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mergedAt", typeName: "String", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "mergedBy", typeName: "ProcedureghGetPrDetailsResultU2DDetailsU2DAuthor_a99c73e81a", required: false, nullable: true, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "number", typeName: "Int64", required: true, nullable: false, minimum: nil, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "reviews", typeName: "[ProcedureghGetPrDetailsResultU2DDetailsU2DReviewsU2DItem_dba220fea4]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "title", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case additions = "additions"
    case author = "author"
    case baseBranch = "baseBranch"
    case body = "body"
    case changedFiles = "changedFiles"
    case checks = "checks"
    case closedAt = "closedAt"
    case comments = "comments"
    case commits = "commits"
    case createdAt = "createdAt"
    case deletions = "deletions"
    case headBranch = "headBranch"
    case mergedAt = "mergedAt"
    case mergedBy = "mergedBy"
    case number = "number"
    case reviews = "reviews"
    case title = "title"
  }
}

public struct ProcedureghGetPrDetailsResult_567aa4ef7f: Codable, Sendable, RemoteModelMetadata {
  public var details: ProcedureghGetPrDetailsResultU2DDetails_9f1da8cf54
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "details", typeName: "ProcedureghGetPrDetailsResultU2DDetails_9f1da8cf54", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case details = "details"
  }
}

public struct ProcedureghGetPrFilesResultU2DFilesU2DItem_63c18b52ff: Codable, Sendable, RemoteModelMetadata {
  public var additions: Int64
  public var deletions: Int64
  public var path: String
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "additions", typeName: "Int64", required: true, nullable: false, minimum: -9007199254740991, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "deletions", typeName: "Int64", required: true, nullable: false, minimum: -9007199254740991, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case additions = "additions"
    case deletions = "deletions"
    case path = "path"
  }
}

public struct ProcedureghGetPrFilesResult_24cb35c8f9: Codable, Sendable, RemoteModelMetadata {
  public var files: [ProcedureghGetPrFilesResultU2DFilesU2DItem_63c18b52ff]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "files", typeName: "[ProcedureghGetPrFilesResultU2DFilesU2DItem_63c18b52ff]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case files = "files"
  }
}

public typealias ProcedureghGetPrForBranchResult_452c70feef = ProcedureghCreatePrResult_a4457c545e?

public struct ProcedureghGetPrReviewCommentsResultU2DThreadsU2DItem_9199b6e9ea: Codable, Sendable, RemoteModelMetadata {
  public var comments: [ProcedureghGetPrDetailsResultU2DDetailsU2DCommentsU2DItem_839da5c7aa]
  public var id: String
  public var isOutdated: Bool
  public var isResolved: Bool
  public var line: RemoteField<Int64> = .missing
  public var path: RemoteField<String> = .missing
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "comments", typeName: "[ProcedureghGetPrDetailsResultU2DDetailsU2DCommentsU2DItem_839da5c7aa]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "id", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "isOutdated", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "isResolved", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "line", typeName: "Int64", required: false, nullable: false, minimum: -9007199254740991, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "path", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case comments = "comments"
    case id = "id"
    case isOutdated = "isOutdated"
    case isResolved = "isResolved"
    case line = "line"
    case path = "path"
  }
}

public struct ProcedureghGetPrReviewCommentsResult_2cb7b58fd1: Codable, Sendable, RemoteModelMetadata {
  public var comments: [ProcedureghGetPrDetailsResultU2DDetailsU2DCommentsU2DItem_839da5c7aa]
  public var threads: [ProcedureghGetPrReviewCommentsResultU2DThreadsU2DItem_9199b6e9ea]
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "comments", typeName: "[ProcedureghGetPrDetailsResultU2DDetailsU2DCommentsU2DItem_839da5c7aa]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "threads", typeName: "[ProcedureghGetPrReviewCommentsResultU2DThreadsU2DItem_9199b6e9ea]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case comments = "comments"
    case threads = "threads"
  }
}

public struct ProcedureghGetWorkflowDefinitionRequest_30b422e470: Codable, Sendable, RemoteModelMetadata {
  public var ghAccount: RemoteField<ProcedureghCancelWorkflowRunRequestU2DGhAccount_5646cf57ff> = .missing
  public var projectLocation: ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154
  public var ref: RemoteField<String> = .missing
  public var workflowId: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "ghAccount", typeName: "ProcedureghCancelWorkflowRunRequestU2DGhAccount_5646cf57ff", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "projectLocation", typeName: "ProcedurebeginMcpServerOauthRequestU2DProjectLocation_080f9cc154", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ref", typeName: "String", required: false, nullable: false, minimum: nil, maximum: nil, minLength: 1, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "workflowId", typeName: "Int64", required: true, nullable: false, minimum: 1, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case ghAccount = "ghAccount"
    case projectLocation = "projectLocation"
    case ref = "ref"
    case workflowId = "workflowId"
  }
}

public enum ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4: Codable, Sendable {
  case option1(String)
  case option2(Double)
  case option3(Bool)
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    var matches: [(Int, ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4)] = []
    if RemoteUnionProbe.matchesString(decoder), let value = try? container.decode(String.self) {
      self = .option1(value); return
    }
    if RemoteUnionProbe.matchesNumber(decoder, integer: false), let value = try? container.decode(Double.self) {
      self = .option2(value); return
    }
    if RemoteUnionProbe.matchesBool(decoder), let value = try? container.decode(Bool.self) {
      self = .option3(value); return
    }
    throw DecodingError.typeMismatch(ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4.self, .init(codingPath: decoder.codingPath, debugDescription: "No union option matched ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4"))
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

public enum ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DType_f450768848: String, Codable, Sendable {
  case boolean = "boolean"
  case choice = "choice"
  case environment = "environment"
  case number = "number"
  case string = "string"
}

public struct ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItem_efedb06a4d: Codable, Sendable, RemoteModelMetadata {
  public var defaultValue: RemoteField<ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4> = .missing
  public var description: String
  public var name: String
  public var options: [String]
  public var required: Bool
  public var typeValue: ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DType_f450768848
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "defaultValue", typeName: "ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DDefaultValue_1994cc63e4", required: false, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "description", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "name", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "options", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "required", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "type", typeName: "ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItemU2DType_f450768848", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case defaultValue = "defaultValue"
    case description = "description"
    case name = "name"
    case options = "options"
    case required = "required"
    case typeValue = "type"
  }
}

public struct ProcedureghGetWorkflowDefinitionResultU2DDefinition_02179e6a4b: Codable, Sendable, RemoteModelMetadata {
  public var defaultBranch: String
  public var dispatchable: Bool
  public var inputs: [ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItem_efedb06a4d]
  public var ref: String
  public var triggers: [String]
  public var workflowId: Int64
  public static let unknownFieldPolicy: RemoteUnknownFieldPolicy = .strip
  public static let fields: [RemoteFieldDescriptor] = [
    .init(wireName: "defaultBranch", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "dispatchable", typeName: "Bool", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "inputs", typeName: "[ProcedureghGetWorkflowDefinitionResultU2DDefinitionU2DInputsU2DItem_efedb06a4d]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "ref", typeName: "String", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "triggers", typeName: "[String]", required: true, nullable: false, minimum: nil, maximum: nil, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
    .init(wireName: "workflowId", typeName: "Int64", required: true, nullable: false, minimum: -9007199254740991, maximum: 9007199254740991, minLength: nil, maxLength: nil, minItems: nil, maxItems: nil, pattern: nil, format: nil, semanticValidatorIds: []),
  ]
  public static let semanticValidatorIds: [String] = []
  private enum CodingKeys: String, CodingKey {
    case defaultBranch = "defaultBranch"
    case dispatchable = "dispatchable"
    case inputs = "inputs"
    case ref = "ref"
    case triggers = "triggers"
    case workflowId = "workflowId"
  }
}
