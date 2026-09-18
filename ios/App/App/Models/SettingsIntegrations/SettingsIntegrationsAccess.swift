import Foundation

struct SettingsIntegrationsHostLease: Equatable, Hashable, Sendable {
  let connectionID: ClientConnectionID
  let generation: UInt64
}

struct SettingsIntegrationsContext: Equatable, Hashable, Sendable {
  let lease: SettingsIntegrationsHostLease
  /// Local ownership identity. Requests continue to project only `projectLocation` on the wire.
  let projectIdentity: ProjectIdentity?
  let projectLocation: ProjectLocation?

  init(
    lease: SettingsIntegrationsHostLease,
    projectIdentity: ProjectIdentity? = nil,
    projectLocation: ProjectLocation?
  ) {
    self.lease = lease
    self.projectIdentity = projectIdentity
    self.projectLocation = projectLocation
  }
}

enum SettingsIntegrationsScope: String, CaseIterable, Hashable, Sendable {
  case read = "session:read"
  case operate = "session:operate"
}

struct SettingsIntegrationsAccess: Equatable, Hashable, Sendable {
  let context: SettingsIntegrationsContext
  let protocolVersion: Int
  let isOnline: Bool
  let isReady: Bool
  let scopes: Set<SettingsIntegrationsScope>

  func gate(_ scope: SettingsIntegrationsScope) -> SettingsIntegrationsFailure? {
    guard protocolVersion == SettingsIntegrationsRemoteV3Contract.protocolVersion else {
      return .protocolIncompatible
    }
    guard isOnline else { return .offline }
    guard isReady else { return .notReady }
    guard scopes.contains(scope) else { return .missingScope(scope) }
    return nil
  }
}

struct SettingsIntegrationsSelection: Equatable, Hashable, Sendable {
  let hostName: String
  let access: SettingsIntegrationsAccess

  var context: SettingsIntegrationsContext { access.context }
}

enum SettingsIntegrationsFailure: Error, Equatable, Sendable {
  case unavailable
  case offline
  case notReady
  case protocolIncompatible
  case missingScope(SettingsIntegrationsScope)
  case authenticationExpired
  case authorizationDenied
  case rejected
  case invalidResponse
  case transport
  case ambiguousOutcome
  case timedOut
}

enum SettingsIntegrationsGatewayError: Error, Equatable, Sendable {
  case http(statusCode: Int, code: String?, missingScope: SettingsIntegrationsScope?)
  case protocolIncompatible
  case invalidResponse
  case transport
  case ambiguousOutcome
}

extension SettingsIntegrationsFailure {
  static func map(_ error: any Error) -> Self {
    if error is SettingsIntegrationsTimeoutError { return .timedOut }
    guard let error = error as? SettingsIntegrationsGatewayError else { return .transport }
    switch error {
    case .protocolIncompatible: return .protocolIncompatible
    case .invalidResponse: return .invalidResponse
    case .transport: return .transport
    case .ambiguousOutcome: return .ambiguousOutcome
    case .http(let status, _, let missingScope):
      if status == 401 { return .authenticationExpired }
      if let missingScope { return .missingScope(missingScope) }
      if status == 403 { return .authorizationDenied }
      return .rejected
    }
  }
}

enum SettingsIntegrationsLoadState: Equatable, Sendable {
  case idle
  case loading
  case loaded
  case failed(SettingsIntegrationsFailure)
}

enum SettingsIntegrationsMutationNotice: Equatable, Sendable {
  case saved
  case ambiguousReconciled
  case ambiguousUnresolved
}

struct SettingsIntegrationsTimeoutError: Error, Equatable, Sendable {}
