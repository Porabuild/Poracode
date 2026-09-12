import Foundation

/// Port-forwarding credentials come from the paired-host registry and the vault
/// for exactly the connection identifier that was asked for.
///
/// Resolution never consults "the selected host", so a host switch that lands
/// while this runs cannot hand one desktop's endpoint or credential to another
/// desktop's forward. The registry record's scopes travel with the credential
/// so the caller can intersect them with the live profile grant.
extension HostCatalog: PortForwardingCredentialRepository {
  func portForwardingCredentials(
    for connectionID: ClientConnectionID
  ) async throws -> PortForwardingHostCredentials? {
    let catalog = try snapshot()
    guard let record = catalog.hosts.first(where: { $0.connectionId == connectionID }),
      let credential = try token(for: connectionID), !credential.isEmpty
    else { return nil }
    return PortForwardingHostCredentials(
      connectionID: connectionID,
      endpoint: record.httpBaseURL,
      token: credential,
      protocolVersion: record.protocolVersion,
      scopes: Set(record.scopes)
    )
  }
}
