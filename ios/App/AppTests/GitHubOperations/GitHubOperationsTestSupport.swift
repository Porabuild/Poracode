import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import GitHubOperations
#endif

enum GitHubOperationsSamples {
  static let posix = GitHubProjectLocation.posix(
    path: "/Users/dev/repo",
    remoteServerId: "server-posix"
  )
  static let windows = GitHubProjectLocation.windows(
    path: #"C:\work\repo"#,
    remoteServerId: "server-windows"
  )
  static let wsl = GitHubProjectLocation.wsl(
    distro: "Ubuntu-24.04",
    linuxPath: "/home/dev/repo",
    uncPath: #"\\wsl.localhost\Ubuntu-24.04\home\dev\repo"#,
    remoteServerId: "server-wsl"
  )

  static let lease = GitHubProjectLease(
    clientConnectionId: UUID(uuidString: "10000000-0000-0000-0000-000000000001")!,
    desktopId: "desktop-1",
    hostGeneration: 2,
    project: .init(projectId: "project-1", location: wsl),
    projectGeneration: 7
  )

  static let context = GitHubControllerContext(
    lease: lease,
    grantedScopes: ["session:read", "session:operate"]
  )

  static let allRequests: [GitHubOperationRequest] = [
    .ghCheckAvailable(.init(projectLocation: wsl, detail: .full)),
    .ghGetPrForBranch(.init(projectLocation: wsl, branch: "feature")),
    .ghListPrs(.init(projectLocation: wsl)),
    .ghListPullRequests(.init(projectLocation: wsl)),
    .ghGetPrChecks(.init(projectLocation: wsl, branch: "feature")),
    .ghGetPrFiles(.init(projectLocation: wsl, prNumber: 42)),
    .ghGetPrDiff(.init(projectLocation: wsl, prNumber: 42)),
    .ghGetPrDetails(.init(projectLocation: wsl, prNumber: 42)),
    .ghGetPrReviewComments(.init(projectLocation: wsl, prNumber: 42)),
    .ghListAccounts(.init(runtime: wsl)),
    .ghListRepos(.init(runtime: wsl, account: .init(host: "github.com", login: "dev"))),
    .ghListWorkflows(.init(projectLocation: wsl)),
    .ghListWorkflowRuns(.init(projectLocation: wsl, workflowId: 11)),
    .ghGetWorkflowRun(.init(projectLocation: wsl, runId: 22)),
    .ghGetWorkflowDefinition(.init(projectLocation: wsl, workflowId: 11, ref: "main")),
    .ghCreatePr(
      .init(
        projectLocation: wsl,
        branch: "feature",
        baseBranch: "main",
        title: "Change",
        body: "Body",
        isDraft: false
      )
    ),
    .ghMergePr(.init(projectLocation: wsl, prNumber: 42, method: .squash, admin: false)),
    .ghClosePr(.init(projectLocation: wsl, prNumber: 42)),
    .ghReopenPr(.init(projectLocation: wsl, prNumber: 42)),
    .ghMarkPrReady(.init(projectLocation: wsl, prNumber: 42)),
    .ghSubmitPrReview(
      .init(projectLocation: wsl, prNumber: 42, decision: .approve, body: "Approved")
    ),
    .ghUpdatePrBranch(.init(projectLocation: wsl, prNumber: 42, rebase: true)),
    .ghPostPrComment(.init(projectLocation: wsl, prNumber: 42, body: "Comment")),
    .ghDispatchWorkflow(
      .init(projectLocation: wsl, workflowId: 11, ref: "main", inputs: ["target": "test"])
    ),
    .ghRerunWorkflowRun(.init(projectLocation: wsl, runId: 22, failedOnly: true)),
    .ghCancelWorkflowRun(.init(projectLocation: wsl, runId: 22)),
    .ghDeleteWorkflowRun(.init(projectLocation: wsl, runId: 22)),
  ]

  static func response(for procedure: GitHubProcedure) throws -> Data {
    guard procedure.metadata.resultKind == .json else { return Data("{}".utf8) }
    return try JSONEncoder().encode(minimalValue(for: resultSchema(procedure)))
  }

  static func result(
    _ procedure: GitHubProcedure,
    object: [String: GitHubJSONValue] = [:]
  ) -> GitHubOperationResult {
    .json(procedure: procedure, document: .init(value: .object(object)))
  }

  private static func resultSchema(_ procedure: GitHubProcedure) -> RemoteSchema {
    switch procedure {
    case .ghCheckAvailable: RemoteRootCodecs.procedureU2EGhCheckAvailableU2EResult.schema
    case .ghGetPrForBranch: RemoteRootCodecs.procedureU2EGhGetPrForBranchU2EResult.schema
    case .ghListPrs: RemoteRootCodecs.procedureU2EGhListPrsU2EResult.schema
    case .ghListPullRequests: RemoteRootCodecs.procedureU2EGhListPullRequestsU2EResult.schema
    case .ghGetPrChecks: RemoteRootCodecs.procedureU2EGhGetPrChecksU2EResult.schema
    case .ghGetPrFiles: RemoteRootCodecs.procedureU2EGhGetPrFilesU2EResult.schema
    case .ghGetPrDiff: RemoteRootCodecs.procedureU2EGhGetPrDiffU2EResult.schema
    case .ghGetPrDetails: RemoteRootCodecs.procedureU2EGhGetPrDetailsU2EResult.schema
    case .ghGetPrReviewComments:
      RemoteRootCodecs.procedureU2EGhGetPrReviewCommentsU2EResult.schema
    case .ghListAccounts: RemoteRootCodecs.procedureU2EGhListAccountsU2EResult.schema
    case .ghListRepos: RemoteRootCodecs.procedureU2EGhListReposU2EResult.schema
    case .ghListWorkflows: RemoteRootCodecs.procedureU2EGhListWorkflowsU2EResult.schema
    case .ghListWorkflowRuns: RemoteRootCodecs.procedureU2EGhListWorkflowRunsU2EResult.schema
    case .ghGetWorkflowRun: RemoteRootCodecs.procedureU2EGhGetWorkflowRunU2EResult.schema
    case .ghGetWorkflowDefinition:
      RemoteRootCodecs.procedureU2EGhGetWorkflowDefinitionU2EResult.schema
    case .ghCreatePr: RemoteRootCodecs.procedureU2EGhCreatePrU2EResult.schema
    case .ghPostPrComment: RemoteRootCodecs.procedureU2EGhPostPrCommentU2EResult.schema
    default: preconditionFailure("Omitted procedures do not have result roots")
    }
  }

  private static func minimalValue(for schema: RemoteSchema) -> RemoteJSONValue {
    if let value = schema.defaultValue { return value }
    if let value = schema.literals.first { return value }
    if !schema.options.isEmpty { return minimalValue(for: schema.options[0]) }
    switch schema.type {
    case "null": return .null
    case "boolean": return .bool(false)
    case "integer":
      let lowerBound = schema.exclusiveMinimum.map { $0 + 1 } ?? schema.minimum ?? 0
      return .int(Int64(max(0, lowerBound)))
    case "number":
      let lowerBound = schema.exclusiveMinimum.map { $0 + 1 } ?? schema.minimum ?? 0
      return .double(max(0, lowerBound))
    case "string": return .string(sampleString(for: schema))
    case "array":
      let count = schema.minItems ?? 0
      let item = schema.items.map(minimalValue) ?? .null
      return .array(Array(repeating: item, count: count))
    case "object":
      return .object(
        Dictionary(
          uniqueKeysWithValues: schema.required.map { key in
            (key, minimalValue(for: schema.properties[key]!))
          })
      )
    default: return .null
    }
  }

  private static func sampleString(for schema: RemoteSchema) -> String {
    if schema.semanticIds.contains(where: { $0.contains("url") }) {
      return "https://example.test/value"
    }
    if schema.pattern?.contains("0-9a-f") == true {
      return String(repeating: "a", count: 40)
    }
    return String(repeating: "x", count: max(1, schema.minLength ?? 1))
  }
}

struct GitHubStubGateway: GitHubOperationsGateway {
  let handler:
    @Sendable (GitHubOperationRequest, GitHubProjectLease) async throws
      -> GitHubOperationResult

  func call(
    _ request: GitHubOperationRequest,
    lease: GitHubProjectLease
  ) async throws -> GitHubOperationResult {
    try await handler(request, lease)
  }
}

actor GitHubCallRecorder {
  private(set) var requests: [GitHubOperationRequest] = []
  private var waiters: [(count: Int, continuation: CheckedContinuation<Void, Never>)] = []

  func append(_ request: GitHubOperationRequest) {
    requests.append(request)
    let ready = waiters.filter { requests.count >= $0.count }
    waiters.removeAll { requests.count >= $0.count }
    for waiter in ready {
      waiter.continuation.resume()
    }
  }

  var count: Int { requests.count }

  func wait(untilCount count: Int) async {
    guard requests.count < count else { return }
    await withCheckedContinuation { continuation in
      waiters.append((count, continuation))
    }
  }
}

func gitHubRepositoryRoot(filePath: String = #filePath) -> URL {
  var url = URL(fileURLWithPath: filePath)
  while url.lastPathComponent != "lightcode" && url.pathComponents.count > 1 {
    url.deleteLastPathComponent()
  }
  return url
}
