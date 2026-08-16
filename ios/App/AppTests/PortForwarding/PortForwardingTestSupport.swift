import Foundation
import XCTest

#if canImport(App)
  @testable import App
#else
  @testable import PortForwarding
#endif

#if canImport(FoundationNetworking)
  import FoundationNetworking
#endif

enum PortForwardingTestValues {
  static let connectionID = ClientConnectionID(
    UUID(uuidString: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")!)
  static let forwardID = "22222222-2222-4222-8222-222222222222"
  static let token = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"

  static func lease(generation: UInt64 = 7) -> PortForwardingHostLease {
    PortForwardingHostLease(
      connectionID: connectionID, connectionGeneration: generation)
  }

  static func access(
    lease: PortForwardingHostLease = lease(),
    online: Bool = true,
    ready: Bool = true,
    foreground: Bool = true,
    scopes: Set<PortForwardingCapability> = [.forward]
  ) -> PortForwardingHostAccess {
    PortForwardingHostAccess(
      lease: lease,
      protocolVersion: 3,
      isOnline: online,
      isReady: ready,
      isForeground: foreground,
      capabilities: scopes
    )
  }

  static func fixture(_ name: String) throws -> Data {
    let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
      .appendingPathComponent("Fixtures/\(name).json")
    return try Data(contentsOf: url)
  }

  static var snapshot: PortForwardingSnapshot {
    PortForwardingSnapshot(
      detected: [
        .init(port: 5173, protocolValue: .http, label: "Vite"),
        .init(port: 3000, protocolValue: .unknown, label: nil),
      ],
      forwards: [
        .init(
          id: "11111111-1111-4111-8111-111111111111",
          targetPort: 5173,
          listenPort: 45173,
          createdAt: 1_720_000_000_000
        )
      ]
    )
  }
}

@MainActor
final class PortForwardingSelectionBox: @unchecked Sendable {
  var selection: PortForwardingTransportSelection?
  init(_ selection: PortForwardingTransportSelection?) { self.selection = selection }
}

actor PortForwardingRemoteAPISpy: PortForwardingRemoteAPI {
  enum Outcome: Sendable {
    case success
    case failure(PortForwardingTransportError)
    case blocked
  }

  private var outcome: Outcome = .success
  private var calls: [PortForwardingRoute] = []
  private var continuation: CheckedContinuation<Void, Never>?

  func setOutcome(_ value: Outcome) { outcome = value }
  func recordedCalls() -> [PortForwardingRoute] { calls }
  func release() {
    continuation?.resume()
    continuation = nil
  }

  func remoteScan() async throws -> PortForwardingSnapshot {
    calls.append(.portsRead)
    try await resolve()
    return PortForwardingTestValues.snapshot
  }

  func remoteStart(port: Int) async throws -> PortForward {
    calls.append(.portForward)
    try await resolve()
    return .init(
      id: PortForwardingTestValues.forwardID,
      targetPort: port,
      listenPort: 43_000,
      createdAt: 1_720_000_001_000
    )
  }

  func remoteOpen(forwardID _: String) async throws {
    calls.append(.portEnter)
    try await resolve()
  }

  func remoteEntryURL(forwardID: String) async throws -> URL {
    calls.append(.portEnter)
    try await resolve()
    return URL(string: "https://desktop.test/ports/\(forwardID)")!
  }

  func remoteStop(forwardID _: String) async throws {
    calls.append(.portUnforward)
    try await resolve()
  }

  private func resolve() async throws {
    switch outcome {
    case .success: return
    case .failure(let error): throw error
    case .blocked:
      await withCheckedContinuation { continuation = $0 }
    }
  }
}

actor PortForwardingGatewaySpy: PortForwardingGateway {
  private(set) var calls: [PortForwardingRoute] = []
  var failure: PortForwardingFailure?

  func setFailure(_ value: PortForwardingFailure?) { failure = value }

  func scan(lease _: PortForwardingHostLease) async throws -> PortForwardingSnapshot {
    calls.append(.portsRead)
    if let failure { throw failure }
    return PortForwardingTestValues.snapshot
  }

  func start(port: Int, lease _: PortForwardingHostLease) async throws -> PortForward {
    calls.append(.portForward)
    if let failure { throw failure }
    return .init(
      id: PortForwardingTestValues.forwardID,
      targetPort: port,
      listenPort: 43_000,
      createdAt: 1_720_000_001_000
    )
  }

  func open(forwardID _: String, lease _: PortForwardingHostLease) async throws {
    calls.append(.portEnter)
    if let failure { throw failure }
  }

  func stop(forwardID _: String, lease _: PortForwardingHostLease) async throws {
    calls.append(.portUnforward)
    if let failure { throw failure }
  }
}
