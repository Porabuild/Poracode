import Foundation

protocol PortForwardingCredentialRepository: Sendable {
  func portForwardingCredentials(for connectionID: ClientConnectionID) async throws
    -> PortForwardingHostCredentials?
}

actor PortForwardingExactHostTransportSource {
  typealias AccessProvider = @MainActor @Sendable () -> PortForwardingHostAccess?
  typealias APIFactory =
    @Sendable (String, String, RemoteEnvironmentContext?) throws -> any PortForwardingRemoteAPI

  private struct CachedAPIKey: Equatable {
    let connectionID: ClientConnectionID
    let endpoint: String
    let token: String
    let environmentId: String?
  }

  private let credentials: any PortForwardingCredentialRepository
  private let accessProvider: AccessProvider
  private let makeAPI: APIFactory
  private var cachedAPI: (key: CachedAPIKey, api: any PortForwardingRemoteAPI)?

  /// Production factory: the parent authority for a host-owned environment
  /// record is attached to every port-forwarding HTTP dispatch; a direct host
  /// sends no parent header.
  static func productionMakeAPI(
    browser: PortForwardingBrowserOpener,
    session: URLSession? = nil
  ) -> APIFactory {
    { endpoint, token, environment in
      GeneratedPortForwardingRemoteAPI(
        http: try PortForwardingURLSessionHTTPClient(
          endpoint: endpoint,
          token: token,
          session: session,
          environmentAuthority: EnvironmentParentAuthority(context: environment)
        ),
        browser: browser
      )
    }
  }

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
      capabilities: access.capabilities.intersection(granted),
      // The credential grant carries scopes only; browser-entry authority is
      // the host's own handshake and carries through unchanged.
      browserForwardEntry: access.browserForwardEntry
    )
    let key = CachedAPIKey(
      connectionID: credential.connectionID,
      endpoint: credential.endpoint,
      token: credential.token,
      environmentId: credential.environment?.environmentId
    )
    let api: any PortForwardingRemoteAPI
    if let cachedAPI, cachedAPI.key == key {
      api = cachedAPI.api
    } else {
      let created = try makeAPI(credential.endpoint, credential.token, credential.environment)
      cachedAPI = (key, created)
      api = created
    }
    return PortForwardingTransportSelection(
      access: exact,
      api: api
    )
  }
}
