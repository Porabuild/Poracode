import Foundation

extension BrowserMirrorConnectionID {
  init(_ value: ClientConnectionID) {
    self.init(rawValue: value.rawValue)
  }

  var clientConnectionID: ClientConnectionID? {
    ClientConnectionID(rawValue: rawValue)
  }
}

/// Credentials for Browser Mirror come from the paired-host registry and the vault, and
/// only ever for the exact connection identifier that was asked for. Nothing is derived
/// from the currently selected host inside this resolution step.
extension HostCatalog: BrowserMirrorCredentialRepository {
  func credentials(
    for connectionID: BrowserMirrorConnectionID
  ) async throws -> BrowserMirrorHostCredentials? {
    guard let clientConnectionID = connectionID.clientConnectionID else { return nil }
    let catalog = try snapshot()
    guard
      let record = catalog.hosts.first(where: { $0.connectionId == clientConnectionID }),
      let token = try token(for: clientConnectionID),
      !token.isEmpty
    else { return nil }
    return BrowserMirrorHostCredentials(
      connectionID: connectionID,
      endpoint: record.httpBaseURL,
      token: token,
      protocolVersion: record.protocolVersion,
      scopes: Set(record.scopes),
      desktopID: record.desktopId
    )
  }
}

enum BrowserMirrorTransportFactory {
  /// Production gateway: exact-host credential resolution plus a generated-root HTTP API.
  static func makeGateway(
    credentials: any BrowserMirrorCredentialRepository,
    accessProvider: @escaping @MainActor @Sendable () -> BrowserMirrorHostAccess?
  ) -> any BrowserMirrorGateway {
    BrowserMirrorSelectedGateway(
      credentials: credentials,
      accessProvider: accessProvider,
      makeAPI: { endpoint, token in
        GeneratedBrowserMirrorRemoteAPI(
          http: BrowserMirrorHTTPClient(endpoint: endpoint, token: token)
        )
      }
    )
  }
}
