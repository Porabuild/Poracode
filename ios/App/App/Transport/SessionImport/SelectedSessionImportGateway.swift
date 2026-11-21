import Foundation

protocol SessionImportGateway: Sendable {
  func list(_ filter: SessionImportFilter, lease: SettingsHostLease) async throws -> SessionImportListing
  func register(path: String, lease: SettingsHostLease) async throws -> RemoteProject
  func importSession(_ command: SessionImportCommand, threadID: String, lease: SettingsHostLease) async throws
}

struct SessionImportTransportSelection: Sendable {
  let access: SettingsSessionAccess
  let api: any SessionImportRemoteAPI
}

/// Reuses the settings authority's exact vault lookup and generation checks.
/// Catalog visibility never supplies credentials or grants command authority.
actor SelectedSessionImportGateway: SessionImportGateway {
  typealias SelectionProvider = @Sendable (SettingsHostLease) async throws -> SessionImportTransportSelection?
  private let selection: SelectionProvider

  init(selection: @escaping SelectionProvider) { self.selection = selection }

  init(source: SettingsExactHostTransportSource) {
    selection = { lease in
      guard let selected = try await source.selection(for: lease),
        let api = selected.api as? any SessionImportRemoteAPI else { return nil }
      return .init(access: selected.access, api: api)
    }
  }

  func list(_ filter: SessionImportFilter, lease: SettingsHostLease) async throws -> SessionImportListing {
    try await execute(lease, scopes: [.projectsManage]) { try await $0.listCLISessions(filter) }
  }

  func register(path: String, lease: SettingsHostLease) async throws -> RemoteProject {
    try await execute(lease, scopes: [.projectsManage]) { try await $0.registerImportProject(path: path) }
  }

  func importSession(_ command: SessionImportCommand, threadID: String, lease: SettingsHostLease) async throws {
    try await execute(lease, scopes: [.sessionOperate]) { try await $0.importCLISession(command, threadID: threadID) }
  }

  private func execute<Value: Sendable>(_ lease: SettingsHostLease, scopes: [SettingsCapability],
    operation: @Sendable (any SessionImportRemoteAPI) async throws -> Value
  ) async throws -> Value {
    do {
      try Task.checkCancellation()
      guard let selected = try await selection(lease) else { throw SessionImportFailure.unavailable(.transport) }
      guard selected.access.lease == lease else { throw CancellationError() }
      for scope in scopes {
        if let failure = selected.access.gate(scope) { throw SessionImportFailure.unavailable(failure) }
      }
      let result = try await operation(selected.api)
      try Task.checkCancellation()
      guard try await selection(lease)?.access.lease == lease else { throw CancellationError() }
      return result
    } catch let error as RemoteClientError {
      let failure: SettingsOperationFailure = error.status == 401 ? .authenticationExpired
        : error.status == 403 ? .authorizationDenied : .transport
      throw SessionImportFailure.unavailable(failure)
    } catch let error as SettingsGatewayError {
      throw SessionImportFailure.unavailable(.map(error))
    }
  }
}
