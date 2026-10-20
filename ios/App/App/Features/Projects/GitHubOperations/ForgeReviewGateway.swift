import Foundation

protocol ForgeReviewRemoteAPI: Sendable {
  func remoteForgeReviewOperation(
    _ operation: ForgeReviewOperation,
    payload: GitHubDocument
  ) async throws -> GitHubDocument
}

protocol ForgeReviewGateway: Sendable {
  func callForge(
    _ operation: ForgeReviewOperation,
    payload: GitHubDocument,
    lease: GitHubProjectLease
  ) async throws -> GitHubDocument
}
