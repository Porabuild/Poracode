import Foundation
import Observation

@MainActor
@Observable
final class GitHubPullRequestController {
  private(set) var pullRequests: [GitHubPullRequestSummary] = []
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
        guard self.runtime.owns(capture), self.runtime.readTask.owns(taskOwner) else { return }
        try self.install(result)
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

  private func install(_ result: GitHubOperationResult) throws {
    guard Self.supported.contains(result.procedure), let document = result.document else {
      throw GitHubOperationsFailure.invalidResponse
    }
    documents[result.procedure] = document
    if result.procedure == .ghListPrs || result.procedure == .ghListPullRequests {
      guard let value = GitHubResultProjection.pullRequests(result) else {
        throw GitHubOperationsFailure.invalidResponse
      }
      pullRequests = value
    }
  }

  private func reset() {
    pullRequests = []
    documents = [:]
    loadState = .idle
    failure = nil
  }

  private static let supported: Set<GitHubProcedure> = [
    .ghGetPrForBranch, .ghListPrs, .ghListPullRequests, .ghGetPrChecks,
    .ghGetPrFiles, .ghGetPrDiff, .ghGetPrDetails, .ghGetPrReviewComments,
  ]
}
