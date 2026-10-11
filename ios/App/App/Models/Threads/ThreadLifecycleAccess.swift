import Foundation

struct ThreadHostIdentity: Hashable, Sendable {
  let clientConnectionID: ClientConnectionID
  let desktopID: String
  let host: String
}

struct ThreadHostLease: Hashable, Sendable {
  let identity: ThreadHostIdentity
  let generation: UInt64
}

struct ThreadLifecycleTarget: Hashable, Sendable {
  let lease: ThreadHostLease
  let threadID: String
}

struct ThreadSessionAccess: Equatable, Sendable {
  let lease: ThreadHostLease
  let isOnline: Bool
  let isReady: Bool
  let isForeground: Bool
  let scopes: Set<String>
}

enum ThreadSessionAvailability: Equatable, Sendable {
  case offline
  case notReady
  case background
}

enum ThreadLifecycleGatewayError: Error, Equatable, Sendable {
  case unavailable(ThreadSessionAvailability)
  case invalidRequest
  case http(statusCode: Int, code: String?, missingScope: String?)
  case invalidResponse
  case ambiguousOutcome
  case transport
}

protocol ThreadLifecycleGateway: Sendable {
  func startExistingThread(
    target: ThreadLifecycleTarget,
    request: ThreadStartExistingRequest,
    commandID: String
  ) async throws -> String

  func runThreadCommand(
    target: ThreadLifecycleTarget,
    command: ThreadRemoteCommand,
    commandID: String?
  ) async throws
}
