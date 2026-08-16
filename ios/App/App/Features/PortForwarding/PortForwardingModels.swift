import Foundation

struct PortForwardingHostLease: Equatable, Hashable, Sendable {
  let connectionID: ClientConnectionID
  let connectionGeneration: UInt64
}

enum PortForwardingCapability: String, CaseIterable, Hashable, Sendable {
  case forward = "ports:forward"
}

struct PortForwardingHostAccess: Equatable, Sendable {
  let lease: PortForwardingHostLease
  let protocolVersion: Int
  let isOnline: Bool
  let isReady: Bool
  let isForeground: Bool
  let capabilities: Set<PortForwardingCapability>
}

struct PortForwardingHostCredentials: Sendable {
  let connectionID: ClientConnectionID
  let endpoint: String
  let token: String
  let protocolVersion: Int
  let scopes: Set<String>
}

enum PortForwardingDetectedProtocol: String, Codable, Equatable, Sendable {
  case http
  case unknown
}

struct PortForwardingDetectedPort: Codable, Equatable, Identifiable, Sendable {
  var id: Int { port }
  let port: Int
  let protocolValue: PortForwardingDetectedProtocol
  let label: String?

  private enum CodingKeys: String, CodingKey {
    case port
    case protocolValue = "protocol"
    case label
  }
}

struct PortForward: Codable, Equatable, Identifiable, Sendable {
  let id: String
  let targetPort: Int
  let listenPort: Int
  let createdAt: Int64
}

struct PortForwardingSnapshot: Codable, Equatable, Sendable {
  let detected: [PortForwardingDetectedPort]
  let forwards: [PortForward]

  static let empty = PortForwardingSnapshot(detected: [], forwards: [])
}

enum PortForwardingUnavailableReason: Equatable, Sendable {
  case offline
  case notReady
  case background
}

enum PortForwardingFailure: Error, Equatable, Sendable {
  case invalidRequest
  case unavailable(PortForwardingUnavailableReason)
  case protocolIncompatible
  case missingScope
  case authenticationExpired
  case authorizationDenied
  case rejected(statusCode: Int, code: String?)
  case invalidResponse
  case transport
  case ambiguousMutation
  case unsafeEntry
  case browserUnavailable
}

enum PortForwardingLoadState: Equatable, Sendable {
  case idle
  case scanning
  case ready
  case failed(PortForwardingFailure)
}

enum PortForwardingOperation: Equatable, Sendable {
  case none
  case starting(port: Int)
  case opening(forwardID: String)
  case stopping(forwardID: String)
}
