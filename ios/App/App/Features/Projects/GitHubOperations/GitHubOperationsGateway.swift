import Foundation

enum GitHubCapability: String, Codable, Equatable, Sendable {
  case sessionRead = "session:read"
  case sessionOperate = "session:operate"
}

struct GitHubControllerContext: Equatable, Sendable {
  let lease: GitHubProjectLease
  let grantedScopes: Set<String>
  var isOnline = true
  var isReady = true
  var isForeground = true

  var isConsistent: Bool { lease.isConsistent }
  var isUsable: Bool { isConsistent && isOnline && isReady && isForeground }

  func permits(_ scope: GitHubProcedureScope) -> Bool {
    grantedScopes.contains(scope.rawValue)
  }
}

enum GitHubOperationsFailure: Error, Equatable, Sendable {
  case notReady
  case capabilityMissing
  case authenticationExpired
  case authorizationDenied
  case rejected(statusCode: Int, code: String?)
  case transport
  case invalidResponse
  case ambiguousOutcome
  case busy
}

protocol GitHubOperationsGateway: Sendable {
  func call(
    _ request: GitHubOperationRequest,
    lease: GitHubProjectLease
  ) async throws -> GitHubOperationResult
}

protocol GitHubOperationsRemoteAPI: Sendable {
  func remoteGitHubOperation(
    _ request: GitHubOperationRequest
  ) async throws -> GitHubOperationResult
}

struct GitHubTransportSelection: Sendable {
  let context: GitHubControllerContext
  let api: any GitHubOperationsRemoteAPI
}
