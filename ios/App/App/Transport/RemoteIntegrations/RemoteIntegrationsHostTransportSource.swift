import Foundation

protocol RemoteIntegrationsCredentialRepository: Sendable {
  func remoteIntegrationsCredentials(
    for connectionID: ClientConnectionID
  ) async throws -> RemoteIntegrationsHostCredentials?
}

extension HostCatalog: RemoteIntegrationsCredentialRepository {
  func remoteIntegrationsCredentials(
    for connectionID: ClientConnectionID
  ) async throws -> RemoteIntegrationsHostCredentials? {
    let catalog = try snapshot()
    guard let record = catalog.hosts.first(where: { $0.connectionId == connectionID }),
      let token = try token(for: connectionID),
      !token.isEmpty
    else { return nil }
    return RemoteIntegrationsHostCredentials(
      connectionID: connectionID,
      endpoint: record.httpBaseURL,
      token: token,
      protocolVersion: record.protocolVersion,
      scopes: Set(record.scopes),
      environment: await environmentTransportContext(for: record)
    )
  }
}

struct RemoteIntegrationsTransportSelection: Sendable {
  let access: RemoteIntegrationsHostAccess
  let api: any RemoteIntegrationsRemoteAPI
}

/// Resolves credentials only for the exact selected host and captured work generation.
actor RemoteIntegrationsExactHostTransportSource {
  typealias AccessProvider = @MainActor @Sendable () -> RemoteIntegrationsHostAccess?
  typealias APIFactory =
    @Sendable (String, String, RemoteEnvironmentContext?) -> any RemoteIntegrationsRemoteAPI

  private let credentials: any RemoteIntegrationsCredentialRepository
  private let accessProvider: AccessProvider
  private let makeAPI: APIFactory

  /// The one production factory: bound endpoint + child bearer + resolved
  /// parent context. Tests inject a URLProtocol-backed session to capture the
  /// exact headers this factory produces.
  static func productionAPIFactory(session: URLSession? = nil) -> APIFactory {
    { endpoint, token, environment in
      RemoteAPIClient(
        endpoint: endpoint,
        accessToken: token,
        session: session,
        environment: environment
      )
    }
  }

  init(
    credentials: any RemoteIntegrationsCredentialRepository,
    accessProvider: @escaping AccessProvider,
    makeAPI: @escaping APIFactory =
      RemoteIntegrationsExactHostTransportSource.productionAPIFactory()
  ) {
    self.credentials = credentials
    self.accessProvider = accessProvider
    self.makeAPI = makeAPI
  }

  func selection(
    for lease: RemoteIntegrationsHostLease
  ) async throws -> RemoteIntegrationsTransportSelection? {
    try Task.checkCancellation()
    guard let access = await accessProvider(), access.lease == lease else {
      throw CancellationError()
    }
    guard access.protocolVersion == RemoteIntegrationsRemoteV3Contract.protocolVersion else {
      throw RemoteIntegrationsGatewayError.protocolIncompatible
    }
    guard
      let credential = try await credentials.remoteIntegrationsCredentials(
        for: lease.connectionID
      )
    else { return nil }
    try Task.checkCancellation()
    guard credential.connectionID == lease.connectionID else { throw CancellationError() }
    guard credential.protocolVersion == RemoteIntegrationsRemoteV3Contract.protocolVersion else {
      throw RemoteIntegrationsGatewayError.protocolIncompatible
    }
    guard await accessProvider()?.lease == lease else { throw CancellationError() }
    let credentialCapabilities = Set(
      credential.scopes.compactMap(RemoteIntegrationsCapability.init(rawValue:))
    )
    let exactAccess = RemoteIntegrationsHostAccess(
      lease: access.lease,
      protocolVersion: access.protocolVersion,
      isOnline: access.isOnline,
      isReady: access.isReady,
      capabilities: access.capabilities.intersection(credentialCapabilities)
    )
    return RemoteIntegrationsTransportSelection(
      access: exactAccess,
      api: makeAPI(credential.endpoint, credential.token, credential.environment)
    )
  }
}
