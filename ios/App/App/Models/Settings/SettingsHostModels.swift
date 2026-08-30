import Foundation

struct SettingsHostLease: Equatable, Hashable, Sendable {
  let connectionID: ClientConnectionID
  let generation: UInt64
}

enum SettingsCapability: String, CaseIterable, Hashable, Sendable {
  case sessionRead = "session:read"
  case sessionOperate = "session:operate"
  case projectsManage = "projects:manage"
}

struct SettingsSessionAccess: Equatable, Sendable {
  let lease: SettingsHostLease
  let protocolVersion: Int
  let isOnline: Bool
  let isReady: Bool
  let capabilities: Set<SettingsCapability>

  func gate(_ capability: SettingsCapability) -> SettingsOperationFailure? {
    guard protocolVersion == 3 else { return .protocolIncompatible }
    guard isOnline else { return .offline }
    guard isReady else { return .notReady }
    guard capabilities.contains(capability) else { return .capabilityMissing(capability.rawValue) }
    return nil
  }
}

struct SettingsHostCredentials: Sendable {
  let connectionID: ClientConnectionID
  let endpoint: String
  let token: String
  let protocolVersion: Int
  let scopes: Set<String>
}

enum SettingsOperationFailure: Error, Equatable, Sendable {
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

enum SettingsGatewayError: Error, Equatable, Sendable {
  case http(statusCode: Int, code: String?, missingScope: String?)
  case protocolIncompatible
  case invalidResponse
  case transport
  case ambiguousOutcome
}

extension SettingsOperationFailure {
  static func map(_ error: any Error) -> SettingsOperationFailure {
    guard let error = error as? SettingsGatewayError else { return .transport }
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
