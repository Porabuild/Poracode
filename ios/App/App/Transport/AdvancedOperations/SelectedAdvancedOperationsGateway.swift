import Foundation

struct AdvancedOperationsTransportSelection: Sendable {
  let access: AdvancedOperationSessionAccess
  let api: any AdvancedOperationsRemoteAPI
}

/// Rejects stale host, session, owner, or generation completions before state can install.
actor SelectedAdvancedOperationsGateway: AdvancedOperationsGateway {
  typealias SelectionProvider =
    @MainActor @Sendable () -> AdvancedOperationsTransportSelection?

  private let selectionProvider: SelectionProvider

  init(selectionProvider: @escaping SelectionProvider) {
    self.selectionProvider = selectionProvider
  }

  func call(
    _ request: AdvancedOperationRequest,
    lease: AdvancedOperationLease
  ) async throws -> AdvancedOperationResult {
    try Task.checkCancellation()
    guard lease.isValid,
      request.owner == lease.owner,
      request.owner.kind == request.procedure.metadata.owner
    else {
      throw AdvancedOperationFailure.invalidRequest
    }

    let selection = try await requireCurrent(lease, scope: request.procedure.metadata.scope)
    do {
      let result = try await selection.api.remoteCall(request)
      try Task.checkCancellation()
      _ = try await requireCurrent(lease, scope: request.procedure.metadata.scope)
      return result
    } catch is CancellationError {
      throw CancellationError()
    } catch let error as AdvancedOperationsTransportError {
      _ = try await requireCurrent(lease, scope: request.procedure.metadata.scope)
      throw Self.normalize(error)
    } catch let failure as AdvancedOperationFailure {
      throw failure
    } catch {
      _ = try await requireCurrent(lease, scope: request.procedure.metadata.scope)
      throw AdvancedOperationFailure.transport
    }
  }

  private func requireCurrent(
    _ lease: AdvancedOperationLease,
    scope: AdvancedOperationScope
  ) async throws -> AdvancedOperationsTransportSelection {
    guard let selection = await selectionProvider(), selection.access.lease == lease else {
      throw CancellationError()
    }
    guard selection.access.isOnline else {
      throw AdvancedOperationFailure.unavailable(.offline)
    }
    guard selection.access.isReady else {
      throw AdvancedOperationFailure.unavailable(.notReady)
    }
    guard selection.access.isForeground else {
      throw AdvancedOperationFailure.unavailable(.background)
    }
    guard selection.access.scopes.contains(scope) else {
      throw AdvancedOperationFailure.missingScope(scope)
    }
    return selection
  }

  private static func normalize(
    _ error: AdvancedOperationsTransportError
  ) -> AdvancedOperationFailure {
    switch error {
    case .invalidRequest:
      .invalidRequest
    case .rejected(let statusCode, let rawCode):
      .rejected(statusCode: statusCode, code: sanitizedCode(rawCode))
    case .invalidResponse:
      .invalidResponse
    case .ambiguousDelivery:
      .ambiguousDelivery
    case .transport:
      .transport
    }
  }

  private static func sanitizedCode(_ value: String?) -> String? {
    guard let value, !value.isEmpty, value.utf8.count <= 64 else { return nil }
    let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789_-")
    guard value.unicodeScalars.allSatisfy(allowed.contains) else { return nil }
    return value
  }
}
