import Foundation

extension AdvancedOperationsStrings {
  /// Failure text is derived only from the structured failure case. Server
  /// bodies, status text, and exception descriptions never reach the surface.
  static func failure(_ value: AdvancedOperationsInteractionFailure) -> String {
    switch value {
    case .validation(let error): validation(error)
    case .missingSession: localized("advancedOperations.failure.missingSession")
    case .unavailable(let availability): unavailable(availability)
    case .missingScope(let value): format("advancedOperations.failure.missingScope", scope(value))
    case .ownerChanged: localized("advancedOperations.failure.ownerChanged")
    case .busy: localized("advancedOperations.failure.busy")
    case .operation(let failure): operation(failure)
    }
  }

  static func validation(_ value: AdvancedFormValidationError) -> String {
    switch value {
    case .missingRequiredField(let key):
      format("advancedOperations.validation.missingField", field(key))
    case .invalidInteger(let key):
      format("advancedOperations.validation.invalidInteger", field(key))
    case .integerOutOfBounds(let key):
      format("advancedOperations.validation.integerOutOfBounds", field(key))
    case .invalidSegment(let index):
      segmentIssue("advancedOperations.validation.invalidSegment", index)
    case .missingSegmentField(let index):
      segmentIssue("advancedOperations.validation.missingSegmentField", index)
    case .ownerMismatch:
      localized("advancedOperations.validation.ownerMismatch")
    case .missingOwnerLocation:
      localized("advancedOperations.validation.missingOwnerLocation")
    }
  }

  static func unavailable(_ value: AdvancedOperationAvailability) -> String {
    switch value {
    case .offline: localized("advancedOperations.failure.offline")
    case .notReady: localized("advancedOperations.failure.notReady")
    case .background: localized("advancedOperations.failure.background")
    }
  }

  /// `rejected` deliberately drops the status code and host code: neither is
  /// meaningful to the user and both risk echoing host detail.
  static func operation(_ value: AdvancedOperationFailure) -> String {
    switch value {
    case .unavailable(let availability): unavailable(availability)
    case .invalidRequest: localized("advancedOperations.failure.invalidRequest")
    case .missingScope(let scopeValue):
      format("advancedOperations.failure.missingScope", scope(scopeValue))
    case .rejected: localized("advancedOperations.failure.rejected")
    case .invalidResponse: localized("advancedOperations.failure.invalidResponse")
    case .ambiguousDelivery: localized("advancedOperations.failure.ambiguousDelivery")
    case .transport: localized("advancedOperations.failure.transport")
    }
  }

  /// Confirmation copy names the operation and the redacted target only.
  static func confirmation(_ request: AdvancedOperationRequest) -> String {
    switch request {
    case .writeExternalFile(let value):
      format(
        "advancedOperations.confirm.writeExternalFile",
        AdvancedOperationRedaction.path(value.absolutePath)
      )
    case .renameProjectEntry(let value):
      String.localizedStringWithFormat(
        localized("advancedOperations.confirm.renameProjectEntry"),
        AdvancedOperationRedaction.path(value.path),
        AdvancedOperationRedaction.path(value.nextName)
      )
    case .moveProjectEntry(let value):
      String.localizedStringWithFormat(
        localized("advancedOperations.confirm.moveProjectEntry"),
        AdvancedOperationRedaction.path(value.path),
        value.nextParentPath.map(AdvancedOperationRedaction.path)
          ?? localized("advancedOperations.projectRoot")
      )
    case .deleteProjectEntry(let value):
      format(
        "advancedOperations.confirm.deleteProjectEntry",
        AdvancedOperationRedaction.path(value.path)
      )
    default:
      localized("advancedOperations.confirm.generic")
    }
  }

  private static func segmentIssue(_ key: String, _ index: Int) -> String {
    String.localizedStringWithFormat(localized(key), index + 1)
  }
}
