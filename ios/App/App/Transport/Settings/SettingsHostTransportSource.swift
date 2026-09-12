import Foundation

protocol SettingsCredentialRepository: Sendable {
  func settingsCredentials(for connectionID: ClientConnectionID) async throws
    -> SettingsHostCredentials?
}

extension HostCatalog: SettingsCredentialRepository {
  func settingsCredentials(for connectionID: ClientConnectionID) async throws
    -> SettingsHostCredentials?
  {
    // Actor isolation makes the registry record and exact vault account lookup one uninterrupted
    // operation. Selection is deliberately irrelevant: credentials are keyed by the requested id.
    let catalog = try snapshot()
    guard let record = catalog.hosts.first(where: { $0.connectionId == connectionID }),
      let token = try token(for: connectionID), !token.isEmpty
    else { return nil }
    return SettingsHostCredentials(
      connectionID: connectionID,
      endpoint: record.httpBaseURL,
      token: token,
      protocolVersion: record.protocolVersion,
      scopes: Set(record.scopes)
    )
  }
}

struct SettingsTransportSelection: Sendable {
  let access: SettingsSessionAccess
  let api: any SettingsRemoteAPI
}

/// Resolves a transport from the exact host vault account for a captured lease. It never falls
/// back to the selected host's token, and repeats the lease check after the credential await.
actor SettingsExactHostTransportSource {
  typealias AccessProvider = @MainActor @Sendable () -> SettingsSessionAccess?
  typealias APIFactory = @Sendable (String, String) -> any SettingsRemoteAPI

  private let credentials: any SettingsCredentialRepository
  private let accessProvider: AccessProvider
  private let makeAPI: APIFactory

  init(
    credentials: any SettingsCredentialRepository,
    accessProvider: @escaping AccessProvider,
    makeAPI: @escaping APIFactory = { endpoint, token in
      RemoteAPIClient(endpoint: endpoint, accessToken: token)
    }
  ) {
    self.credentials = credentials
    self.accessProvider = accessProvider
    self.makeAPI = makeAPI
  }

  func selection(for lease: SettingsHostLease) async throws -> SettingsTransportSelection? {
    try Task.checkCancellation()
    guard let access = await accessProvider(), access.lease == lease else {
      throw CancellationError()
    }
    guard access.protocolVersion == SettingsRemoteV3Contract.protocolVersion else {
      throw SettingsGatewayError.protocolIncompatible
    }
    guard let credential = try await credentials.settingsCredentials(
      for: lease.connectionID
    ) else {
      return nil
    }
    try Task.checkCancellation()
    guard credential.connectionID == lease.connectionID else { throw CancellationError() }
    guard credential.protocolVersion == SettingsRemoteV3Contract.protocolVersion else {
      throw SettingsGatewayError.protocolIncompatible
    }
    guard await accessProvider()?.lease == lease else { throw CancellationError() }
    let credentialCapabilities = Set(credential.scopes.compactMap(SettingsCapability.init(rawValue:)))
    let exactAccess = SettingsSessionAccess(
      lease: access.lease,
      protocolVersion: access.protocolVersion,
      isOnline: access.isOnline,
      isReady: access.isReady,
      capabilities: access.capabilities.intersection(credentialCapabilities)
    )
    return SettingsTransportSelection(
      access: exactAccess,
      api: makeAPI(credential.endpoint, credential.token)
    )
  }
}
