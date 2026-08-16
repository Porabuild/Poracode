import Foundation

struct GitHubOperationsHostCredentials: Sendable {
  let connectionId: ClientConnectionID
  let desktopId: String
  let endpoint: String
  let token: String
  let protocolVersion: Int
  let scopes: Set<String>
}

protocol GitHubOperationsCredentialRepository: Sendable {
  func gitHubOperationsCredentials(
    for connectionId: ClientConnectionID
  ) async throws -> GitHubOperationsHostCredentials?
}

extension HostCatalog: GitHubOperationsCredentialRepository {
  func gitHubOperationsCredentials(
    for connectionId: ClientConnectionID
  ) async throws -> GitHubOperationsHostCredentials? {
    let catalog = try snapshot()
    guard let record = catalog.hosts.first(where: { $0.connectionId == connectionId }),
      let token = try token(for: connectionId), !token.isEmpty
    else { return nil }
    return GitHubOperationsHostCredentials(
      connectionId: connectionId,
      desktopId: record.desktopId,
      endpoint: record.httpBaseURL,
      token: token,
      protocolVersion: record.protocolVersion,
      scopes: Set(record.scopes)
    )
  }
}

/// Resolves the exact selected host's vault account for a captured GitHub lease.
/// Selection is checked before and after the credential await so another host's
/// endpoint or bearer token can never be attached to stale project work.
actor GitHubOperationsExactHostTransportSource {
  typealias ContextProvider = @MainActor @Sendable () -> GitHubControllerContext?
  typealias APIFactory = @Sendable (URL, String) -> any GitHubOperationsRemoteAPI

  private let credentials: any GitHubOperationsCredentialRepository
  private let contextProvider: ContextProvider
  private let makeAPI: APIFactory

  init(
    credentials: any GitHubOperationsCredentialRepository,
    contextProvider: @escaping ContextProvider,
    makeAPI: @escaping APIFactory = { endpoint, token in
      GitHubOperationsHTTPTransport(endpoint: endpoint, accessToken: token)
    }
  ) {
    self.credentials = credentials
    self.contextProvider = contextProvider
    self.makeAPI = makeAPI
  }

  func selection(for lease: GitHubProjectLease) async throws -> GitHubTransportSelection? {
    try Task.checkCancellation()
    guard let context = await contextProvider(), context.lease == lease, context.isUsable else {
      throw CancellationError()
    }
    let connectionId = ClientConnectionID(lease.clientConnectionId)
    guard
      let credential = try await credentials.gitHubOperationsCredentials(
        for: connectionId
      )
    else { return nil }
    try Task.checkCancellation()
    guard credential.connectionId.uuid == lease.clientConnectionId,
      credential.desktopId == lease.desktopId,
      credential.protocolVersion == ProtocolConstants.remoteProtocolVersion,
      let endpoint = URL(string: credential.endpoint)
    else { throw CancellationError() }
    guard await contextProvider()?.lease == lease else { throw CancellationError() }

    let exactContext = GitHubControllerContext(
      lease: context.lease,
      grantedScopes: context.grantedScopes.intersection(credential.scopes),
      isOnline: context.isOnline,
      isReady: context.isReady,
      isForeground: context.isForeground
    )
    return GitHubTransportSelection(
      context: exactContext,
      api: makeAPI(endpoint, credential.token)
    )
  }
}
