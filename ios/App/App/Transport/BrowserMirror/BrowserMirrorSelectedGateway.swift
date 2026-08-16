import Foundation

protocol BrowserMirrorCredentialRepository: Sendable {
  func credentials(for connectionID: BrowserMirrorConnectionID) async throws
    -> BrowserMirrorHostCredentials?
}

protocol BrowserMirrorGateway: Sendable {
  func state(lease: BrowserMirrorHostLease) async throws -> BrowserMirrorState
  func command(
    _ command: BrowserMirrorCommand,
    lease: BrowserMirrorHostLease
  ) async throws -> BrowserMirrorState
}

actor BrowserMirrorSelectedGateway: BrowserMirrorGateway {
  typealias AccessProvider = @MainActor @Sendable () -> BrowserMirrorHostAccess?
  typealias APIFactory = @Sendable (String, String) throws -> any BrowserMirrorRemoteAPI

  private let credentials: any BrowserMirrorCredentialRepository
  private let accessProvider: AccessProvider
  private let makeAPI: APIFactory

  init(
    credentials: any BrowserMirrorCredentialRepository,
    accessProvider: @escaping AccessProvider,
    makeAPI: @escaping APIFactory
  ) {
    self.credentials = credentials
    self.accessProvider = accessProvider
    self.makeAPI = makeAPI
  }

  func state(lease: BrowserMirrorHostLease) async throws -> BrowserMirrorState {
    let api = try await selectedAPI(lease: lease, capability: .read)
    let value = try await api.fetchState()
    try await validateCurrent(lease: lease, capability: .read)
    return value
  }

  func command(
    _ command: BrowserMirrorCommand,
    lease: BrowserMirrorHostLease
  ) async throws -> BrowserMirrorState {
    let api = try await selectedAPI(lease: lease, capability: .operate)
    do {
      let value = try await api.perform(command)
      try await validateCurrent(lease: lease, capability: .operate)
      return value
    } catch BrowserMirrorFailure.ambiguousMutation {
      throw BrowserMirrorFailure.ambiguousMutation
    } catch is CancellationError {
      throw BrowserMirrorFailure.ambiguousMutation
    } catch {
      throw error
    }
  }

  private func selectedAPI(
    lease: BrowserMirrorHostLease,
    capability: BrowserMirrorCapability
  ) async throws -> any BrowserMirrorRemoteAPI {
    try await validateCurrent(lease: lease, capability: capability)
    guard let credential = try await credentials.credentials(for: lease.connectionID) else {
      throw BrowserMirrorFailure.transport
    }
    let recheck = try await validatedAccess(lease: lease, capability: capability)
    guard credential.connectionID == lease.connectionID else {
      throw CancellationError()
    }
    // The credential must belong to the desktop the selection was resolved against.
    if let expected = recheck.expectedDesktopID, credential.desktopID != expected {
      throw CancellationError()
    }
    guard credential.protocolVersion == BrowserMirrorRemoteV3Adapter.protocolVersion else {
      throw BrowserMirrorFailure.protocolIncompatible
    }
    guard credential.scopes.contains(capability.rawValue) else {
      throw BrowserMirrorFailure.missingScope
    }
    return try makeAPI(credential.endpoint, credential.token)
  }

  private func validateCurrent(
    lease: BrowserMirrorHostLease,
    capability: BrowserMirrorCapability
  ) async throws {
    _ = try await validatedAccess(lease: lease, capability: capability)
  }

  @discardableResult
  private func validatedAccess(
    lease: BrowserMirrorHostLease,
    capability: BrowserMirrorCapability
  ) async throws -> BrowserMirrorHostAccess {
    guard let access = await accessProvider(), access.lease == lease else {
      throw CancellationError()
    }
    try BrowserMirrorAccessPolicy.validate(
      access,
      lease: lease,
      capability: capability
    )
    return access
  }
}

enum BrowserMirrorAccessPolicy {
  static func validate(
    _ access: BrowserMirrorHostAccess,
    lease: BrowserMirrorHostLease,
    capability: BrowserMirrorCapability
  ) throws {
    guard access.lease == lease else { throw CancellationError() }
    guard access.protocolVersion == BrowserMirrorRemoteV3Adapter.protocolVersion else {
      throw BrowserMirrorFailure.protocolIncompatible
    }
    guard access.isForeground else {
      throw BrowserMirrorFailure.unavailable(.background)
    }
    guard access.isOnline else {
      throw BrowserMirrorFailure.unavailable(.offline)
    }
    guard access.isReady else {
      throw BrowserMirrorFailure.unavailable(.notReady)
    }
    guard access.capabilities.contains(capability) else {
      throw BrowserMirrorFailure.missingScope
    }
  }
}
