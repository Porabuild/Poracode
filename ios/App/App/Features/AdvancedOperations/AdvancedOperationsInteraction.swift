import Foundation

/// Every way a submission can stop, including the ones that never reach the
/// transport. No case carries a server body or an exception description.
enum AdvancedOperationsInteractionFailure: Error, Equatable, Sendable {
  case validation(AdvancedFormValidationError)
  case missingSession
  case unavailable(AdvancedOperationAvailability)
  case missingScope(AdvancedOperationScope)
  case ownerChanged
  case busy
  case operation(AdvancedOperationFailure)

  init(_ failure: AdvancedOperationFailure) {
    switch failure {
    case .unavailable(let availability): self = .unavailable(availability)
    case .missingScope(let scope): self = .missingScope(scope)
    default: self = .operation(failure)
    }
  }

  /// Whether the host may have applied a mutation whose outcome is unknown.
  var isAmbiguous: Bool { self == .operation(.ambiguousDelivery) }
}

/// A mutation awaiting explicit confirmation.
///
/// The request and lease are captured whole at UI receipt and are never
/// rebuilt from live state when the user confirms.
struct AdvancedPendingMutation: Identifiable, Equatable, Sendable {
  let id: UUID
  let request: AdvancedOperationRequest
  let lease: AdvancedOperationLease

  init(id: UUID = UUID(), request: AdvancedOperationRequest, lease: AdvancedOperationLease) {
    self.id = id
    self.request = request
    self.lease = lease
  }

  var procedure: AdvancedOperationProcedure { request.procedure }
  var title: String { AdvancedOperationsStrings.action(procedure) }
  var message: String { AdvancedOperationsStrings.confirmation(request) }
  var confirmTitle: String { AdvancedOperationsStrings.confirm }
  var isDestructive: Bool {
    AdvancedOperationsPresentation.role(procedure) == .destructive
  }
}

/// One dispatch attempt, tagged with the exact owner it was issued under.
struct AdvancedOperationCapture: Equatable, Sendable {
  let request: AdvancedOperationRequest
  let lease: AdvancedOperationLease
  let generation: UInt64

  var procedure: AdvancedOperationProcedure { request.procedure }
}
