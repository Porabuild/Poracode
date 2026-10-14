import Foundation

/// Enforces the exact host, work, project, location, and relocation generation lease.
actor SelectedGitOperationsGateway: GitOperationsGateway {
  typealias SelectionProvider =
    @MainActor @Sendable () -> GitOperationsTransportSelection?

  private let selectionProvider: SelectionProvider

  init(selectionProvider: @escaping SelectionProvider) {
    self.selectionProvider = selectionProvider
  }

  func call(
    _ request: GitOperationRequest,
    lease: ProjectWorkspaceLease
  ) async throws -> GitOperationResult {
    try Task.checkCancellation()
    guard lease.isConsistent, request.ownerLocation == lease.location else {
      throw ProjectSessionGatewayError.invalidResponse
    }

    let metadata = GitOperationsRemoteV3Contract.metadata(for: request.procedure)
    let capability: ProjectControllerCapability =
      metadata.scope == .read ? .sessionRead : .sessionOperate
    guard ownerMatchesMetadata(request, metadata: metadata) else {
      throw ProjectSessionGatewayError.invalidResponse
    }

    let selection = await selectionProvider()
    guard let selection,
      selection.context.isConsistent,
      selection.context.lease == lease
    else { throw CancellationError() }

    if let failure = selection.context.session.gate(capability) {
      throw Self.gatewayError(for: failure, requiredScope: capability.rawValue)
    }

    do {
      let value = try await selection.api.remoteGitOperation(request)
      try Task.checkCancellation()
      let current = await selectionProvider()
      guard current?.context.isConsistent == true,
        current?.context == selection.context,
        current?.context.lease == lease,
        request.ownerLocation == lease.location
      else { throw CancellationError() }
      return value
    } catch is CancellationError {
      throw CancellationError()
    } catch GitOperationsRemoteMutationError.ambiguousOutcome {
      throw ProjectSessionGatewayError.ambiguousOutcome
    } catch let error as RemoteClientError {
      throw Self.normalize(error, requiredScope: capability.rawValue)
    } catch let error as ProjectSessionGatewayError {
      throw error
    } catch {
      throw ProjectSessionGatewayError.transport(nil)
    }
  }

  private func ownerMatchesMetadata(
    _ request: GitOperationRequest,
    metadata: GitOperationMetadata
  ) -> Bool {
    switch (metadata.owner, request) {
    case (.worktreeLocation, .gitAbortMerge),
      (.worktreeLocation, .gitFinishMerge),
      (.worktreeLocation, .gitPullFromSource):
      true
    case (.projectLocation, .gitAbortMerge),
      (.projectLocation, .gitFinishMerge),
      (.projectLocation, .gitPullFromSource),
      (.worktreeLocation, _):
      false
    case (.projectLocation, _):
      true
    }
  }

  private static func gatewayError(
    for failure: ProjectOperationFailure,
    requiredScope: String
  ) -> ProjectSessionGatewayError {
    switch failure {
    case .capabilityMissing:
      .http(statusCode: 403, code: "missing_scope", missingScope: requiredScope)
    case .authenticationExpired:
      .http(statusCode: 401, code: "invalid_access_token", missingScope: nil)
    case .authorizationDenied:
      .http(statusCode: 403, code: "forbidden", missingScope: nil)
    default:
      .transport(nil)
    }
  }

  private static func normalize(
    _ error: RemoteClientError,
    requiredScope: String
  ) -> ProjectSessionGatewayError {
    if error.code == "invalid_response" { return .invalidResponse }
    guard error.status > 0 else { return .transport(nil) }
    let code = sanitizedCode(error.code)
    let missingScope = error.status == 403 && code == "missing_scope" ? requiredScope : nil
    return .http(statusCode: error.status, code: code, missingScope: missingScope)
  }

  private static func sanitizedCode(_ value: String) -> String? {
    guard !value.isEmpty, value.utf8.count <= 64 else { return nil }
    let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789_-")
    guard value.unicodeScalars.allSatisfy(allowed.contains) else { return nil }
    return value
  }
}
