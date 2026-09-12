import Foundation

struct RemoteIntegrationsHostLease: Equatable, Hashable, Sendable {
  let connectionID: ClientConnectionID
  let generation: UInt64
}

enum RemoteIntegrationsCapability: String, CaseIterable, Hashable, Sendable {
  case projectsManage = "projects:manage"
  case sessionRead = "session:read"
  case sessionOperate = "session:operate"
}

struct RemoteIntegrationsHostAccess: Equatable, Sendable {
  let lease: RemoteIntegrationsHostLease
  let protocolVersion: Int
  let isOnline: Bool
  let isReady: Bool
  let capabilities: Set<RemoteIntegrationsCapability>

  func gate(_ capability: RemoteIntegrationsCapability) -> RemoteIntegrationsFailure? {
    guard protocolVersion == RemoteIntegrationsRemoteV3Contract.protocolVersion else {
      return .protocolIncompatible
    }
    guard isOnline else { return .offline }
    guard isReady else { return .notReady }
    guard capabilities.contains(capability) else {
      return .capabilityMissing(capability.rawValue)
    }
    return nil
  }
}

struct RemoteIntegrationsHostSelection: Equatable, Sendable {
  let name: String
  let access: RemoteIntegrationsHostAccess

  var lease: RemoteIntegrationsHostLease { access.lease }
}

struct RemoteIntegrationsHostCredentials: Sendable {
  let connectionID: ClientConnectionID
  let endpoint: String
  let token: String
  let protocolVersion: Int
  let scopes: Set<String>
}

struct RemoteIntegrationsProjectOption: Equatable, Hashable, Identifiable, Sendable {
  let id: String
  let name: String
}

enum RemoteIntegrationsFailure: Error, Equatable, Sendable {
  case offline
  case notReady
  case protocolIncompatible
  case capabilityMissing(String)
  case authenticationExpired
  case authorizationDenied
  case rejected(statusCode: Int, code: String?)
  case invalidResponse
  case transport
  case ambiguousOutcome
}

enum RemoteIntegrationsGatewayError: Error, Equatable, Sendable {
  case http(statusCode: Int, code: String?, missingScope: String?)
  case protocolIncompatible
  case invalidResponse
  case transport
  case ambiguousOutcome
}

extension RemoteIntegrationsFailure {
  static func map(_ error: any Error) -> RemoteIntegrationsFailure {
    guard let error = error as? RemoteIntegrationsGatewayError else { return .transport }
    switch error {
    case .protocolIncompatible: return .protocolIncompatible
    case .invalidResponse: return .invalidResponse
    case .transport: return .transport
    case .ambiguousOutcome: return .ambiguousOutcome
    case .http(let status, let code, let missingScope):
      if status == 401 { return .authenticationExpired }
      if status == 403, let missingScope { return .capabilityMissing(missingScope) }
      if status == 403 { return .authorizationDenied }
      return .rejected(statusCode: status, code: code)
    }
  }
}

enum RemoteIntegrationsLoadState: Equatable, Sendable {
  case idle
  case loading
  case loaded
  case failed(RemoteIntegrationsFailure)
}

enum RemoteIntegrationsMutationNotice: Equatable, Sendable {
  case saved
  case ambiguousRefreshed
  case ambiguousRefreshFailed
}
