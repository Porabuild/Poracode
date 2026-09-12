import Foundation

struct SettingsIntegrationsHostCredentials: Sendable {
  let connectionID: ClientConnectionID
  let endpoint: String
  let token: String
  let protocolVersion: Int
  let scopes: Set<String>
}

protocol SettingsIntegrationsCredentialRepository: Sendable {
  func settingsIntegrationsCredentials(
    for connectionID: ClientConnectionID
  ) async throws -> SettingsIntegrationsHostCredentials?
}

extension HostCatalog: SettingsIntegrationsCredentialRepository {
  func settingsIntegrationsCredentials(
    for connectionID: ClientConnectionID
  ) async throws -> SettingsIntegrationsHostCredentials? {
    let catalog = try snapshot()
    guard let record = catalog.hosts.first(where: { $0.connectionId == connectionID }),
      let token = try token(for: connectionID), !token.isEmpty
    else { return nil }
    return .init(
      connectionID: connectionID,
      endpoint: record.httpBaseURL,
      token: token,
      protocolVersion: record.protocolVersion,
      scopes: Set(record.scopes)
    )
  }
}

actor SettingsIntegrationsExactHostTransportSource {
  typealias AccessProvider = @MainActor @Sendable () -> SettingsIntegrationsAccess?
  typealias APIFactory = @Sendable (String, String) -> any SettingsIntegrationsRemoteAPI

  private let credentials: any SettingsIntegrationsCredentialRepository
  private let accessProvider: AccessProvider
  private let makeAPI: APIFactory

  init(
    credentials: any SettingsIntegrationsCredentialRepository,
    accessProvider: @escaping AccessProvider,
    makeAPI: @escaping APIFactory = { endpoint, token in
      RemoteAPIClient(endpoint: endpoint, accessToken: token)
    }
  ) {
    self.credentials = credentials
    self.accessProvider = accessProvider
    self.makeAPI = makeAPI
  }

  func selection(
    for context: SettingsIntegrationsContext
  ) async throws -> SettingsIntegrationsTransportSelection? {
    try Task.checkCancellation()
    guard let access = await accessProvider(), access.context == context else {
      throw CancellationError()
    }
    guard access.protocolVersion == SettingsIntegrationsRemoteV3Contract.protocolVersion else {
      throw SettingsIntegrationsGatewayError.protocolIncompatible
    }
    guard
      let credential = try await credentials.settingsIntegrationsCredentials(
        for: context.lease.connectionID
      )
    else { return nil }
    try Task.checkCancellation()
    guard credential.connectionID == context.lease.connectionID else { throw CancellationError() }
    guard credential.protocolVersion == SettingsIntegrationsRemoteV3Contract.protocolVersion else {
      throw SettingsIntegrationsGatewayError.protocolIncompatible
    }
    guard await accessProvider()?.context == context else { throw CancellationError() }
    let credentialScopes = Set(
      credential.scopes.compactMap(SettingsIntegrationsScope.init(rawValue:))
    )
    let exactAccess = SettingsIntegrationsAccess(
      context: context,
      protocolVersion: access.protocolVersion,
      isOnline: access.isOnline,
      isReady: access.isReady,
      scopes: access.scopes.intersection(credentialScopes)
    )
    return .init(
      access: exactAccess,
      api: makeAPI(credential.endpoint, credential.token)
    )
  }
}
