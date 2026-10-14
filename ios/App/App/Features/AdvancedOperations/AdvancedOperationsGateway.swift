import Foundation

enum AdvancedOperationAvailability: Equatable, Sendable {
  case offline
  case notReady
  case background
}

enum AdvancedOperationFailure: Error, Equatable, Sendable {
  case unavailable(AdvancedOperationAvailability)
  case invalidRequest
  case missingScope(AdvancedOperationScope)
  case rejected(statusCode: Int, code: String?)
  case invalidResponse
  case ambiguousDelivery
  case transport
}

protocol AdvancedOperationsGateway: Sendable {
  func call(
    _ request: AdvancedOperationRequest,
    lease: AdvancedOperationLease
  ) async throws -> AdvancedOperationResult
}

enum AdvancedOperationControllerState: Equatable, Sendable {
  case idle
  case running(AdvancedOperationProcedure)
  case succeeded(AdvancedOperationProcedure, AdvancedOperationResult)
  case failed(AdvancedOperationProcedure, AdvancedOperationFailure)
}
