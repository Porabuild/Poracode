import Foundation
import Observation

@MainActor
@Observable
final class GitHubWorkflowController {
  private(set) var workflows: [GitHubWorkflowSummary] = []
  private(set) var documents: [GitHubProcedure: GitHubDocument] = [:]
  private(set) var loadState: GitHubLoadState = .idle
  private(set) var failure: GitHubOperationsFailure?

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
          Self.supported.contains(result.procedure)
        else { return }
        self.documents[result.procedure] = document
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
    loadState = .idle
    failure = nil
  }

  private static let supported: Set<GitHubProcedure> = [
    .ghListWorkflows, .ghListWorkflowRuns, .ghGetWorkflowRun,
    .ghGetWorkflowDefinition,
  ]
}
