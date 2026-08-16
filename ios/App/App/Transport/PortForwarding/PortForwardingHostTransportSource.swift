import Foundation

protocol PortForwardingCredentialRepository: Sendable {
  func portForwardingCredentials(for connectionID: ClientConnectionID) async throws
    -> PortForwardingHostCredentials?
}

actor PortForwardingExactHostTransportSource {
  typealias AccessProvider = @MainActor @Sendable () -> PortForwardingHostAccess?
  typealias APIFactory = @Sendable (String, String) throws -> any PortForwardingRemoteAPI

  private let credentials: any PortForwardingCredentialRepository
  private let accessProvider: AccessProvider
  private let makeAPI: APIFactory

  init(
    credentials: any PortForwardingCredentialRepository,
    accessProvider: @escaping AccessProvider,
    makeAPI: @escaping APIFactory
  ) {
    self.credentials = credentials
    self.accessProvider = accessProvider
    self.makeAPI = makeAPI
  }

  func selection(for lease: PortForwardingHostLease) async throws
    -> PortForwardingTransportSelection?
  {
    try Task.checkCancellation()
    guard let access = await accessProvider(), access.lease == lease else {
      throw CancellationError()
    }
    guard access.protocolVersion == PortForwardingRemoteV3Contract.protocolVersion else {
      throw PortForwardingFailure.protocolIncompatible
    }
    guard
      let credential = try await credentials.portForwardingCredentials(
        for: lease.connectionID)
    else { return nil }
    try Task.checkCancellation()
    guard credential.connectionID == lease.connectionID,
      await accessProvider()?.lease == lease
    else { throw CancellationError() }
    guard credential.protocolVersion == PortForwardingRemoteV3Contract.protocolVersion else {
      throw PortForwardingFailure.protocolIncompatible
    }
    let granted = Set(credential.scopes.compactMap(PortForwardingCapability.init(rawValue:)))
    let exact = PortForwardingHostAccess(
      lease: access.lease,
      protocolVersion: access.protocolVersion,
      isOnline: access.isOnline,
      isReady: access.isReady,
      isForeground: access.isForeground,
      capabilities: access.capabilities.intersection(granted)
    )
    return PortForwardingTransportSelection(
      access: exact, api: try makeAPI(credential.endpoint, credential.token))
  }
}
