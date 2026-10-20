import Foundation

enum ForgeReviewOperation: String, CaseIterable, Sendable {
  case forgeClosePr
  case forgeCreatePr
  case forgeEditPr
  case forgeEditPrComment
  case forgeGetPrChecks
  case forgeGetPrDetails
  case forgeGetPrDiff
  case forgeGetPrFiles
  case forgeGetPrForBranch
  case forgeGetPrReviewComments
  case forgeGetPrReviewGuide
  case forgeGetPrViewedFiles
  case forgeGetRepository
  case forgeListPrs
  case forgeListPullRequests
  case forgeMarkPrReady
  case forgeMergePr
  case forgeMergePrAtHead
  case forgePostPrComment
  case forgeReopenPr
  case forgeSetPrFileViewed
  case forgeSubmitPrReview
  case forgeUpdatePrBranch
  case forgeWritePrReviewGuide

  var scope: GitHubProcedureScope {
    switch self {
    case .forgeClosePr, .forgeCreatePr, .forgeEditPr, .forgeEditPrComment, .forgeMarkPrReady, .forgeMergePr, .forgeMergePrAtHead, .forgePostPrComment, .forgeReopenPr, .forgeSetPrFileViewed, .forgeSubmitPrReview, .forgeUpdatePrBranch, .forgeWritePrReviewGuide: .operate
    default: .read
    }
  }

  var hasResult: Bool {
    switch self {
    case .forgeClosePr, .forgeEditPr, .forgeEditPrComment, .forgeMarkPrReady, .forgeMergePr, .forgeMergePrAtHead, .forgeReopenPr, .forgeSubmitPrReview, .forgeUpdatePrBranch: false
    default: true
    }
  }
}

/// Application facade over generated roots. No native copy of the wire schemas.
enum ForgeReviewRemoteV3Contract {
  static func checkMetadata(_ operation: ForgeReviewOperation) throws {
    guard let descriptor = RemoteContractMetadata.procedures.first(where: { $0.name == operation.rawValue }),
      descriptor.owner == "projectLocation", descriptor.scope == operation.scope.rawValue,
      descriptor.resultKind == (operation.hasResult ? "json" : "omitted")
    else { throw GitHubOperationsFailure.invalidResponse }
  }

  static func request(_ operation: ForgeReviewOperation, payload: GitHubDocument) throws -> Data {
    try checkMetadata(operation)
    let input = try JSONEncoder().encode(payload.value)
    let canonical: Data
    switch operation {
    case .forgeClosePr: canonical = try checked(input, RemoteRootCodecs.procedureU2EForgeClosePrU2ERequest)
    case .forgeCreatePr: canonical = try checked(input, RemoteRootCodecs.procedureU2EForgeCreatePrU2ERequest)
    case .forgeEditPr: canonical = try checked(input, RemoteRootCodecs.procedureU2EForgeEditPrU2ERequest)
    case .forgeEditPrComment: canonical = try checked(input, RemoteRootCodecs.procedureU2EForgeEditPrCommentU2ERequest)
    case .forgeGetPrChecks: canonical = try checked(input, RemoteRootCodecs.procedureU2EForgeGetPrChecksU2ERequest)
    case .forgeGetPrDetails: canonical = try checked(input, RemoteRootCodecs.procedureU2EForgeGetPrDetailsU2ERequest)
    case .forgeGetPrDiff: canonical = try checked(input, RemoteRootCodecs.procedureU2EForgeGetPrDiffU2ERequest)
    case .forgeGetPrFiles: canonical = try checked(input, RemoteRootCodecs.procedureU2EForgeGetPrFilesU2ERequest)
    case .forgeGetPrForBranch: canonical = try checked(input, RemoteRootCodecs.procedureU2EForgeGetPrForBranchU2ERequest)
    case .forgeGetPrReviewComments: canonical = try checked(input, RemoteRootCodecs.procedureU2EForgeGetPrReviewCommentsU2ERequest)
    case .forgeGetPrReviewGuide: canonical = try checked(input, RemoteRootCodecs.procedureU2EForgeGetPrReviewGuideU2ERequest)
    case .forgeGetPrViewedFiles: canonical = try checked(input, RemoteRootCodecs.procedureU2EForgeGetPrViewedFilesU2ERequest)
    case .forgeGetRepository: canonical = try checked(input, RemoteRootCodecs.procedureU2EForgeGetRepositoryU2ERequest)
    case .forgeListPrs: canonical = try checked(input, RemoteRootCodecs.procedureU2EForgeListPrsU2ERequest)
    case .forgeListPullRequests: canonical = try checked(input, RemoteRootCodecs.procedureU2EForgeListPullRequestsU2ERequest)
    case .forgeMarkPrReady: canonical = try checked(input, RemoteRootCodecs.procedureU2EForgeMarkPrReadyU2ERequest)
    case .forgeMergePr: canonical = try checked(input, RemoteRootCodecs.procedureU2EForgeMergePrU2ERequest)
    case .forgeMergePrAtHead: canonical = try checked(input, RemoteRootCodecs.procedureU2EForgeMergePrAtHeadU2ERequest)
    case .forgePostPrComment: canonical = try checked(input, RemoteRootCodecs.procedureU2EForgePostPrCommentU2ERequest)
    case .forgeReopenPr: canonical = try checked(input, RemoteRootCodecs.procedureU2EForgeReopenPrU2ERequest)
    case .forgeSetPrFileViewed: canonical = try checked(input, RemoteRootCodecs.procedureU2EForgeSetPrFileViewedU2ERequest)
    case .forgeSubmitPrReview: canonical = try checked(input, RemoteRootCodecs.procedureU2EForgeSubmitPrReviewU2ERequest)
    case .forgeUpdatePrBranch: canonical = try checked(input, RemoteRootCodecs.procedureU2EForgeUpdatePrBranchU2ERequest)
    case .forgeWritePrReviewGuide: canonical = try checked(input, RemoteRootCodecs.procedureU2EForgeWritePrReviewGuideU2ERequest)
    }
    let value = try JSONSerialization.jsonObject(with: canonical)
    return try checked(JSONSerialization.data(withJSONObject: ["procedure": operation.rawValue, "payload": value]), RemoteRootCodecs.routeU2EProcedureU2DCallU2ERequest)
  }

  static func result(_ operation: ForgeReviewOperation, response: Data) throws -> GitHubDocument {
    try checkMetadata(operation)
    guard let envelope = try JSONDecoder().decode(GitHubJSONValue.self, from: response).objectValue else { throw GitHubOperationsFailure.invalidResponse }
    if !operation.hasResult {
      guard envelope.isEmpty else { throw GitHubOperationsFailure.invalidResponse }
      return GitHubDocument(value: .null)
    }
    guard Set(envelope.keys) == ["result"], let value = envelope["result"] else { throw GitHubOperationsFailure.invalidResponse }
    let raw = try JSONEncoder().encode(value)
    let canonical: Data
    switch operation {
    case .forgeCreatePr: canonical = try checked(raw, RemoteRootCodecs.procedureU2EForgeCreatePrU2EResult)
    case .forgeGetPrChecks: canonical = try checked(raw, RemoteRootCodecs.procedureU2EForgeGetPrChecksU2EResult)
    case .forgeGetPrDetails: canonical = try checked(raw, RemoteRootCodecs.procedureU2EForgeGetPrDetailsU2EResult)
    case .forgeGetPrDiff: canonical = try checked(raw, RemoteRootCodecs.procedureU2EForgeGetPrDiffU2EResult)
    case .forgeGetPrFiles: canonical = try checked(raw, RemoteRootCodecs.procedureU2EForgeGetPrFilesU2EResult)
    case .forgeGetPrForBranch: canonical = try checked(raw, RemoteRootCodecs.procedureU2EForgeGetPrForBranchU2EResult)
    case .forgeGetPrReviewComments: canonical = try checked(raw, RemoteRootCodecs.procedureU2EForgeGetPrReviewCommentsU2EResult)
    case .forgeGetPrReviewGuide: canonical = try checked(raw, RemoteRootCodecs.procedureU2EForgeGetPrReviewGuideU2EResult)
    case .forgeGetPrViewedFiles: canonical = try checked(raw, RemoteRootCodecs.procedureU2EForgeGetPrViewedFilesU2EResult)
    case .forgeGetRepository: canonical = try checked(raw, RemoteRootCodecs.procedureU2EForgeGetRepositoryU2EResult)
    case .forgeListPrs: canonical = try checked(raw, RemoteRootCodecs.procedureU2EForgeListPrsU2EResult)
    case .forgeListPullRequests: canonical = try checked(raw, RemoteRootCodecs.procedureU2EForgeListPullRequestsU2EResult)
    case .forgePostPrComment: canonical = try checked(raw, RemoteRootCodecs.procedureU2EForgePostPrCommentU2EResult)
    case .forgeSetPrFileViewed: canonical = try checked(raw, RemoteRootCodecs.procedureU2EForgeSetPrFileViewedU2EResult)
    case .forgeWritePrReviewGuide: canonical = try checked(raw, RemoteRootCodecs.procedureU2EForgeWritePrReviewGuideU2EResult)
    default: throw GitHubOperationsFailure.invalidResponse
    }
    return GitHubDocument(value: try JSONDecoder().decode(GitHubJSONValue.self, from: canonical))
  }

  private static func checked<Value: Codable & Sendable>(_ raw: Data, _ codec: RemoteRootCodec<Value>) throws -> Data {
    try GitHubOperationsRemoteV3Contract.canonical(raw, codec: codec, boundary: "Source review procedure")
  }
}
