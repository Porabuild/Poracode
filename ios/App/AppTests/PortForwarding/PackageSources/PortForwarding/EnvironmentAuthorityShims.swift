import Foundation

// Harness-only mirrors of the app environment parent-authority transport
// graph that the symlinked port-forwarding sources adopt:
//   - `ios/App/App/Models/RemoteModels.swift` (`RemoteClientError`)
//   - `ios/App/App/Transport/Environments/RemoteEnvironmentContext.swift`
//   - `ios/App/App/Transport/Environments/EnvironmentParentAuthority.swift`
//   - `ios/App/App/Transport/Environments/EnvironmentErrors.swift` (fail-closed 401)
//
// The production files cannot be symlinked wholesale: they also carry
// `HostCatalog`, `EnvironmentParentAuthorityStore`, `RemoteAPIClient`, and
// `PairingURL` extensions that drag in the whole app graph. These mirrors keep
// only the transport-facing definitions with production semantics — same
// member shape, same fail-closed rule — and must move together with the app
// definitions when they change. The environment-authority tests in
// PortForwardingHTTPTests pin that contract.
//
// Omitted on purpose (app-only seams, never called by the portable core):
// `RemoteEnvironmentContext.parentHeaderOnly` and `EnvironmentEndpoints` (they
// require the parent-authority store and endpoint resolution), plus the
// `HostCatalog`/`EnvironmentParentAuthorityStore` extensions.

/// Mirror of the app client error (`RemoteModels.swift`). The port-forwarding
/// HTTP client reads `status` and `code` off the fail-closed parent rejection,
/// so the full production shape is mirrored here — unlike the narrower
/// AdvancedOperations harness shim, which only ever needs `message`.
struct RemoteClientError: LocalizedError, Sendable, Equatable {
  var message: String
  var status: Int
  var code: String
  var responseEvidence: [String: String]?

  var errorDescription: String? { message }
}

enum RemoteEnvironmentErrorCode {
  static let parentNotPaired = "environment_parent_not_paired"
}

enum EnvironmentStrings {
  /// Harness mirror of `EnvironmentStrings.parentNotPairedMessage` (the app
  /// value is localized; the harness pins the default text).
  static let parentNotPairedMessage = "The parent desktop for this environment is not paired."
}

/// Mirror of the app single-construction point for environment transport
/// errors (`EnvironmentErrors.swift`). Only the fail-closed parent rejection
/// is reachable from the portable core.
enum EnvironmentTransportError {
  static func parentNotPaired() -> RemoteClientError {
    RemoteClientError(
      message: EnvironmentStrings.parentNotPairedMessage,
      status: 401,
      code: RemoteEnvironmentErrorCode.parentNotPaired
    )
  }
}

/// Mirror of the app `RemoteEnvironmentContext` (`RemoteEnvironmentContext.swift`):
/// everything a transport needs to talk to one host-owned environment through
/// its parent proxy. The child grant stays the client's own `Authorization`
/// bearer; the parent credential never becomes a child grant or pin.
struct RemoteEnvironmentContext: Sendable {
  let environmentId: String
  /// Verified child identity recorded at pairing (display and identity checks only).
  let expectedChildDesktopId: String?
  /// Live parent access token, or nil when the parent is not paired/unreadable.
  let parentAuthorizationToken: @Sendable () async -> String?
  /// Mints the parent environment-bound WS upgrade ticket.
  let mintParentWebSocketTicket: @Sendable () async throws -> String

  init(
    environmentId: String,
    expectedChildDesktopId: String?,
    parentAuthorizationToken: @escaping @Sendable () async -> String?,
    mintParentWebSocketTicket: @escaping @Sendable () async throws -> String
  ) {
    self.environmentId = environmentId
    self.expectedChildDesktopId = expectedChildDesktopId
    self.parentAuthorizationToken = parentAuthorizationToken
    self.mintParentWebSocketTicket = mintParentWebSocketTicket
  }

  /// Context that always fails closed: used when an endpoint is known to be
  /// an environment proxy but its parent record is missing on this device.
  static func parentMissing(environmentId: String) -> RemoteEnvironmentContext {
    RemoteEnvironmentContext(
      environmentId: environmentId,
      expectedChildDesktopId: nil,
      parentAuthorizationToken: { nil },
      mintParentWebSocketTicket: {
        throw EnvironmentTransportError.parentNotPaired()
      }
    )
  }
}

/// Mirror of the app `EnvironmentParentAuthority` (`EnvironmentParentAuthority.swift`):
/// one request-authorization seam for every transport bound to a host-owned
/// environment. A direct record resolves to no context and no header at all,
/// so a parent token can never leak to a non-environment endpoint.
struct EnvironmentParentAuthority: Sendable {
  private let parentTokenProvider: (@Sendable () async -> String?)?

  init(context: RemoteEnvironmentContext?) {
    parentTokenProvider = context?.parentAuthorizationToken
  }

  init(parentTokenProvider: (@Sendable () async -> String?)?) {
    self.parentTokenProvider = parentTokenProvider
  }

  /// No environment authority (direct host).
  static let direct = EnvironmentParentAuthority(parentTokenProvider: nil)

  var isEnvironmentBound: Bool { parentTokenProvider != nil }

  /// Parent bearer for the protocol header, or nil for a direct host.
  /// Throws the fail-closed `environment_parent_not_paired` error on an
  /// environment transport whose parent token is missing/empty — before any
  /// dial.
  func parentAuthorizationToken() async throws -> String? {
    guard let parentTokenProvider else { return nil }
    guard let token = await parentTokenProvider(), !token.isEmpty else {
      throw EnvironmentTransportError.parentNotPaired()
    }
    return token
  }

  /// Sets the parent authority header on a request. No-op for a direct host.
  func authorize(_ request: inout URLRequest) async throws {
    guard let token = try await parentAuthorizationToken() else { return }
    request.setValue(
      "Bearer \(token)",
      forHTTPHeaderField: ProtocolConstants.environmentAuthorizationHeader
    )
  }
}
