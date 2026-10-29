import Foundation

/// Enforces client connection, host lease, project identity/location, and generation.
actor SelectedGitHubOperationsGateway: GitHubOperationsGateway, ForgeReviewGateway {
  typealias SelectionProvider =
    @MainActor @Sendable () -> GitHubTransportSelection?
  typealias SelectionResolver =
    @Sendable (GitHubProjectLease) async throws -> GitHubTransportSelection?

  private let selectionResolver: SelectionResolver

  init(selectionProvider: @escaping SelectionProvider) {
    selectionResolver = { _ in await selectionProvider() }
  }

  init(selectionResolver: @escaping SelectionResolver) {
    self.selectionResolver = selectionResolver
  }

  func call(
    _ request: GitHubOperationRequest,
    lease: GitHubProjectLease
  ) async throws -> GitHubOperationResult {
    try Task.checkCancellation()
    guard lease.isConsistent, request.ownerLocation == lease.location else {
      throw GitHubOperationsFailure.invalidResponse
    }

    let metadata = GitHubOperationsRemoteV3Contract.metadata(for: request.procedure)
    guard ownerMatchesMetadata(request, metadata: metadata) else {
      throw GitHubOperationsFailure.invalidResponse
    }
    guard let selection = try await selectionResolver(lease),
      selection.context.isConsistent,
      selection.context.isUsable,
      selection.context.lease == lease
    else { throw CancellationError() }
    guard selection.context.permits(metadata.scope) else {
      throw GitHubOperationsFailure.capabilityMissing
    }

    let result = try await selection.api.remoteGitHubOperation(request)
    try Task.checkCancellation()
    guard let current = try await selectionResolver(lease),
      current.context.isConsistent,
      current.context.isUsable,
      current.context.lease == lease,
      request.ownerLocation == lease.location
    else { throw CancellationError() }
    return result
  }

  private func ownerMatchesMetadata(
    _ request: GitHubOperationRequest,
    metadata: GitHubProcedureMetadata
  ) -> Bool {
    switch (metadata.owner, request) {
    case (.runtime, .ghListAccounts), (.runtime, .ghListRepos): true
    case (.runtime, _): false
    case (.projectLocation, .ghListAccounts), (.projectLocation, .ghListRepos): false
    case (.projectLocation, _): true
    }
  }

  func callForge(
    _ operation: ForgeReviewOperation,
    payload: GitHubDocument,
    lease: GitHubProjectLease
  ) async throws -> GitHubDocument {
    try Task.checkCancellation()
    try ForgeReviewRemoteV3Contract.checkMetadata(operation)
    let expectedLocation = try JSONDecoder().decode(GitHubJSONValue.self, from: JSONEncoder().encode(lease.location))
    guard lease.isConsistent, payload["projectLocation"] == expectedLocation else {
      throw GitHubOperationsFailure.invalidResponse
    }
    guard let selection = try await selectionResolver(lease),
      selection.context.isUsable, selection.context.lease == lease
    else { throw CancellationError() }
    guard selection.context.permits(operation.scope), let api = selection.api as? any ForgeReviewRemoteAPI else {
      throw GitHubOperationsFailure.capabilityMissing
    }
    let result = try await api.remoteForgeReviewOperation(operation, payload: payload)
    try Task.checkCancellation()
    guard let current = try await selectionResolver(lease),
      current.context.isUsable, current.context.lease == lease
    else { throw CancellationError() }
    return result
  }
}
