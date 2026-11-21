import Foundation
import Observation

@MainActor
@Observable
final class GitHubWorkflowController {
  private(set) var workflows: [GitHubWorkflowSummary] = []
  private(set) var documents: [GitHubProcedure: GitHubDocument] = [:]
  private(set) var loadState: GitHubLoadState = .idle
  private(set) var failure: GitHubOperationsFailure?

  private var runListWorkflowID: Int64?
  private let gateway: any GitHubOperationsGateway
  private let runtime = GitHubControllerRuntime()

  init(gateway: any GitHubOperationsGateway) {
    self.gateway = gateway
  }

  func activate(_ context: GitHubControllerContext) {
    if runtime.activate(context) { reset() }
  }

  func deactivate() {
    runtime.deactivate()
    reset()
  }

  func enterBackground() {
    runtime.enterBackground()
    if case .loading = loadState { loadState = .idle }
  }

  func leaveBackground(_ context: GitHubControllerContext) {
    if runtime.leaveBackground(context) { reset() }
  }

  func runs(for workflowID: Int64) -> [GitHubWorkflowRun] {
    guard runListWorkflowID == workflowID, let document = documents[.ghListWorkflowRuns]
    else { return [] }
    return GitHubResultProjection.workflowRuns(
      .json(procedure: .ghListWorkflowRuns, document: document)
    ) ?? []
  }

  func load(_ request: GitHubOperationRequest) async {
    guard Self.supported.contains(request.procedure),
      request.procedure.metadata.scope == .read
    else { return }
    let capture: GitHubControllerCapture
    switch runtime.capture(for: request) {
    case .success(let value): capture = value
    case .failure(let value):
      failure = value
      loadState = .failed(value)
      return
    }

    loadState = .loading(request.procedure)
    runtime.readTask.launch { [weak self] taskOwner in
      guard let self else { return }
      do {
        let result = try await self.gateway.call(request, lease: capture.lease)
        try Task.checkCancellation()
        guard self.runtime.owns(capture), self.runtime.readTask.owns(taskOwner),
          let document = result.document,
          result.procedure == request.procedure
        else { return }
        self.documents[result.procedure] = document
        if case .ghListWorkflowRuns(let list) = request {
          self.runListWorkflowID = list.workflowId
        }
        if result.procedure == .ghListWorkflows {
          guard let value = GitHubResultProjection.workflows(result) else {
            throw GitHubOperationsFailure.invalidResponse
          }
          self.workflows = value
        }
        self.failure = nil
        self.loadState = .loaded
      } catch is CancellationError {
        guard self.runtime.owns(capture), self.runtime.readTask.owns(taskOwner) else { return }
        self.loadState = .idle
      } catch {
        guard self.runtime.owns(capture), self.runtime.readTask.owns(taskOwner) else { return }
        let mapped = GitHubFailureMapper.map(error)
        self.failure = mapped
        self.loadState = .failed(mapped)
      }
    }
    await runtime.readTask.wait()
  }

  private func reset() {
    workflows = []
    documents = [:]
    runListWorkflowID = nil
    loadState = .idle
    failure = nil
  }

  private static let supported: Set<GitHubProcedure> = [
    .ghListWorkflows, .ghListWorkflowRuns, .ghGetWorkflowRun,
    .ghGetWorkflowDefinition,
  ]
}
