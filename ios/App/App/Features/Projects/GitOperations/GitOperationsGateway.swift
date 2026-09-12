import Foundation

protocol GitOperationsGateway: Sendable {
  func call(
    _ request: GitOperationRequest,
    lease: ProjectWorkspaceLease
  ) async throws -> GitOperationResult
}

struct GitOperationsTransportSelection: Sendable {
  let context: ProjectWorkspaceContext
  let api: any GitOperationsRemoteAPI
}
