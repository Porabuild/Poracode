import Foundation

protocol PortForwardingGateway: Sendable {
  func scan(lease: PortForwardingHostLease) async throws -> PortForwardingSnapshot
  func start(port: Int, lease: PortForwardingHostLease) async throws -> PortForward
  func open(forwardID: String, lease: PortForwardingHostLease) async throws
  func stop(forwardID: String, lease: PortForwardingHostLease) async throws
}

extension PortForwardingFailure {
  static func map(_ error: any Error) -> PortForwardingFailure {
    if let failure = error as? PortForwardingFailure { return failure }
    return .transport
  }
}
