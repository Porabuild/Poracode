import Foundation

/// Non-secret host identity plus the exact live-session identity a resolution
/// must still match when it completes.
struct AdvancedOperationsHostBinding: Equatable, Hashable, Sendable {
  let host: AdvancedOperationHostIdentity
  let sessionID: UUID
  let sessionGeneration: UInt64
  let endpoint: String
  let protocolVersion: Int
  /// Scopes granted by the live profile. Intersected with the registry record.
  let profileScopes: Set<String>
}

struct AdvancedOperationsHostCredentials: Sendable {
  let connectionID: ClientConnectionID
  let desktopID: String
  let endpoint: String
  let credential: String
  let protocolVersion: Int
  let scopes: Set<String>
}

protocol AdvancedOperationsCredentialRepository: Sendable {
  func advancedOperationsCredentials(
    for connectionID: ClientConnectionID
  ) async throws -> AdvancedOperationsHostCredentials?
}

/// Credentials come from the paired-host registry and the vault for exactly the
/// connection that was asked for. Nothing is derived from "the selected host"
/// inside this step, so a host switch mid-resolution cannot be papered over.
extension HostCatalog: AdvancedOperationsCredentialRepository {
  func advancedOperationsCredentials(
    for connectionID: ClientConnectionID
  ) async throws -> AdvancedOperationsHostCredentials? {
    let catalog = try snapshot()
    guard let record = catalog.hosts.first(where: { $0.connectionId == connectionID }),
      let credential = try token(for: connectionID), !credential.isEmpty
    else { return nil }
    return AdvancedOperationsHostCredentials(
      connectionID: connectionID,
      desktopID: record.desktopId,
      endpoint: record.httpBaseURL,
      credential: credential,
      protocolVersion: record.protocolVersion,
      scopes: Set(record.scopes)
    )
  }
}

/// One host binding resolved all the way down to an authenticated API.
struct AdvancedOperationsResolvedHost: Sendable {
  let binding: AdvancedOperationsHostBinding
  /// Profile ∩ registry ∩ vault-backed record scopes, mapped to feature scopes.
  let grantedScopes: Set<AdvancedOperationScope>
  let api: any AdvancedOperationsRemoteAPI
}

/// Resolves the exact selected host's vault account for the current binding.
///
/// The binding is read before the credential await and again afterwards, so a
/// host switch, profile change, or generation bump that lands mid-resolution
/// discards the result instead of attaching another host's endpoint or
/// credential to this feature's work.
actor AdvancedOperationsExactHostTransportSource {
  typealias BindingProvider = @MainActor @Sendable () -> AdvancedOperationsHostBinding?
  typealias APIFactory = @Sendable (String, String) throws -> any AdvancedOperationsRemoteAPI

  private let credentials: any AdvancedOperationsCredentialRepository
  private let bindingProvider: BindingProvider
  private let makeAPI: APIFactory

  init(
    credentials: any AdvancedOperationsCredentialRepository,
    bindingProvider: @escaping BindingProvider,
    makeAPI: @escaping APIFactory = { endpoint, credential in
      AdvancedOperationsRemoteTransport(
        http: try AdvancedOperationsHTTPClient(endpoint: endpoint, credential: credential)
      )
    }
  ) {
    self.credentials = credentials
    self.bindingProvider = bindingProvider
    self.makeAPI = makeAPI
  }

  func resolve() async throws -> AdvancedOperationsResolvedHost? {
    try Task.checkCancellation()
    guard let binding = await bindingProvider() else { return nil }
    guard binding.protocolVersion == ProtocolConstants.remoteProtocolVersion else {
      return nil
    }
    guard
      let credential = try await credentials.advancedOperationsCredentials(
        for: binding.host.connectionID
      )
    else { return nil }
    try Task.checkCancellation()
    guard await bindingProvider() == binding,
      credential.connectionID == binding.host.connectionID,
      credential.desktopID == binding.host.desktopID,
      credential.endpoint == binding.endpoint,
      credential.protocolVersion == binding.protocolVersion,
      credential.protocolVersion == ProtocolConstants.remoteProtocolVersion
    else { return nil }

    let granted = Set(
      binding.profileScopes
        .intersection(credential.scopes)
        .compactMap(AdvancedOperationScope.init(rawValue:))
    )
    return AdvancedOperationsResolvedHost(
      binding: binding,
      grantedScopes: granted,
      api: try makeAPI(credential.endpoint, credential.credential)
    )
  }
}
