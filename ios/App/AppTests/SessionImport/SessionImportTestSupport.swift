import XCTest
@testable import App

func cliSession(id: String = "s", cwdExists: Bool = true, model: String? = "model-a") -> ImportableCLISession {
  .init(id: id, agentKind: "fixture", providerSessionId: id, path: "/sessions/\(id).jsonl",
    cwd: "/repo", updatedAt: "2026-11-14T00:00:00Z", preview: "Fix the form",
    title: nil, model: model, cwdExists: cwdExists)
}

func importListing(_ sessions: [ImportableCLISession], superseded: Bool? = nil) -> SessionImportListing {
  .init(sessions: sessions, facets: .init(agentKinds: ["fixture"], folders: ["/repo"]), truncated: false, superseded: superseded)
}

func importProject(id: String = "p", path: String = "/repo") -> RemoteProject {
  .init(id: id, name: id, location: .posix(path: path), createdAt: "2026-11-14T00:00:00Z")
}

func importAgent() throws -> AgentStatusRecord {
  try .init(wire: .object([
    "kind": .string("fixture"), "label": .string("Fixture"), "installed": .bool(true), "authState": .string("authenticated"),
    "capabilities": .object(["models": .array([.object(["id": .string("model-a"), "label": .string("Model A")])])])
  ]))
}

actor ImportGatewayFake: SessionImportGateway, SessionImportRemoteAPI {
  var listing = importListing([cliSession()])
  var listCalls = 0
  var registrations: [String] = []
  var commands: [(String, SessionImportCommand)] = []
  var error: SessionImportFailure?
  func setError(_ error: SessionImportFailure?) { self.error = error }
  func setListing(_ listing: SessionImportListing) { self.listing = listing }
  func list(_ filter: SessionImportFilter, lease: SettingsHostLease) async throws -> SessionImportListing {
    listCalls += 1
    return listing
  }
  func register(path: String, lease: SettingsHostLease) async throws -> RemoteProject {
    registrations.append(path)
    return importProject(id: "registered", path: path)
  }
  func importSession(_ command: SessionImportCommand, threadID: String, lease: SettingsHostLease) async throws {
    commands.append((threadID, command))
    if let error { throw error }
  }
  func listCLISessions(_ filter: SessionImportFilter) async throws -> SessionImportListing {
    try await list(filter, lease: .init(connectionID: ClientConnectionID(), generation: 1))
  }
  func registerImportProject(path: String) async throws -> RemoteProject {
    try await register(path: path, lease: .init(connectionID: ClientConnectionID(), generation: 1))
  }
  func importCLISession(_ command: SessionImportCommand, threadID: String) async throws {
    try await importSession(command, threadID: threadID, lease: .init(connectionID: ClientConnectionID(), generation: 1))
  }
}

@MainActor final class ImportTestLatch {
  private var signalled = false
  private var waiting: CheckedContinuation<Void, Never>?
  func wait() async {
    if signalled { return }
    await withCheckedContinuation { waiting = $0 }
  }
  func signal() { signalled = true; waiting?.resume(); waiting = nil }
}

actor ImportSelectionSequence {
  let first: SettingsHostLease
  let replacement: SettingsHostLease
  let api: ImportGatewayFake
  private var count = 0
  init(first: SettingsHostLease, replacement: SettingsHostLease, api: ImportGatewayFake) {
    self.first = first; self.replacement = replacement; self.api = api
  }
  func next() -> SessionImportTransportSelection {
    count += 1
    return .init(access: .init(lease: count == 1 ? first : replacement,
      protocolVersion: ProtocolConstants.remoteProtocolVersion, isOnline: true,
      isReady: true, capabilities: [.projectsManage, .sessionOperate]), api: api)
  }
}
