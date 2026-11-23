import Foundation
import SwiftUI

// MARK: - Host Agent Updates, Account Resolution & ACP Registry Procedures (10 procedures)

enum HostAgentRegistryWire {
  static func call(procedure: String, payload: [String: Any], api: RemoteAPIClient) async throws -> [String: Any] {
    let body = try JSONSerialization.data(withJSONObject: ["procedure": procedure, "payload": payload])
    let data = try await api.requestData(path: "/api/git/call", method: "POST", jsonBody: body)
    return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
  }

  static func getLatestAgentVersion(agentKind: String, api: RemoteAPIClient) async throws -> [String: Any] {
    try await call(procedure: "getLatestAgentVersion", payload: ["agentKind": agentKind], api: api)
  }

  static func updateAgentBinary(agentKind: String, api: RemoteAPIClient) async throws -> [String: Any] {
    try await call(procedure: "updateAgentBinary", payload: ["agentKind": agentKind], api: api)
  }

  static func resolveAgentAccount(agentKind: String, api: RemoteAPIClient) async throws -> [String: Any] {
    try await call(procedure: "resolveAgentAccount", payload: ["agentKind": agentKind], api: api)
  }

  static func listAcpRegistry(api: RemoteAPIClient) async throws -> [String: Any] {
    try await call(procedure: "listAcpRegistry", payload: [:], api: api)
  }

  static func installAcpRegistryAgent(agentId: String, api: RemoteAPIClient) async throws -> [String: Any] {
    try await call(procedure: "installAcpRegistryAgent", payload: ["agentId": agentId], api: api)
  }

  static func updateAcpRegistryAgent(agentId: String, api: RemoteAPIClient) async throws -> [String: Any] {
    try await call(procedure: "updateAcpRegistryAgent", payload: ["agentId": agentId], api: api)
  }

  static func removeAcpRegistryAgent(agentId: String, api: RemoteAPIClient) async throws -> [String: Any] {
    try await call(procedure: "removeAcpRegistryAgent", payload: ["agentId": agentId], api: api)
  }

  static func setAcpRegistryAgentAuth(agentId: String, auth: [String: Any], api: RemoteAPIClient) async throws -> [String: Any] {
    try await call(procedure: "setAcpRegistryAgentAuth", payload: ["agentId": agentId, "auth": auth], api: api)
  }

  static func authenticateAcpAgent(agentId: String, api: RemoteAPIClient) async throws -> [String: Any] {
    try await call(procedure: "authenticateAcpAgent", payload: ["agentId": agentId], api: api)
  }

  static func logoutAcpAgent(agentId: String, api: RemoteAPIClient) async throws -> [String: Any] {
    try await call(procedure: "logoutAcpAgent", payload: ["agentId": agentId], api: api)
  }
}

struct AcpRegistryEntry: Identifiable, Equatable {
  let id: String
  let name: String
  let installed: Bool
  let version: String?
}

struct AcpRegistryManagementView: View {
  let api: RemoteAPIClient?
  @State private var entries: [AcpRegistryEntry] = []
  @State private var loading = false
  @State private var statusMessage: String?

  var body: some View {
    List {
      if loading { ProgressView() }
      if let statusMessage {
        Text(statusMessage).font(.footnote).foregroundStyle(.secondary)
      }
      ForEach(entries) { entry in
        HStack {
          VStack(alignment: .leading, spacing: 2) {
            Text(entry.name).font(.body)
            if let version = entry.version {
              Text(version).font(.caption).foregroundStyle(.secondary)
            }
          }
          Spacer()
          if entry.installed {
            Button("Update") { perform { try await HostAgentRegistryWire.updateAcpRegistryAgent(agentId: entry.id, api: $0) } }
              .poracodeSurfaceButtonStyle()
            Button("Remove", role: .destructive) { perform { try await HostAgentRegistryWire.removeAcpRegistryAgent(agentId: entry.id, api: $0) } }
              .poracodeSurfaceButtonStyle()
          } else {
            Button("Install") { perform { try await HostAgentRegistryWire.installAcpRegistryAgent(agentId: entry.id, api: $0) } }
              .poracodeSurfaceButtonStyle()
          }
        }
      }
    }
    .navigationTitle("ACP Registry")
    .task { await refresh() }
  }

  private func refresh() async {
    guard let api else { return }
    loading = true
    defer { loading = false }
    guard let response = try? await HostAgentRegistryWire.listAcpRegistry(api: api),
      let result = response["result"] as? [String: Any],
      let rawAgents = result["agents"] as? [[String: Any]]
    else { return }
    entries = rawAgents.compactMap { item in
      guard let id = item["id"] as? String else { return nil }
      return AcpRegistryEntry(
        id: id,
        name: (item["name"] as? String) ?? id,
        installed: (item["installed"] as? Bool) ?? false,
        version: item["version"] as? String
      )
    }
  }

  private func perform(_ action: @escaping (RemoteAPIClient) async throws -> [String: Any]) {
    guard let api else { return }
    Task {
      statusMessage = nil
      do {
        _ = try await action(api)
        await refresh()
      } catch {
        statusMessage = error.localizedDescription
      }
    }
  }
}

// MARK: - Plugin Package, Marketplace Catalog & Accounts (4 procedures)

enum HostPluginManagementWire {
  static func listPlugins(projectId: String? = nil, api: RemoteAPIClient) async throws -> [String: Any] {
    var payload: [String: Any] = [:]
    if let projectId { payload["projectId"] = projectId }
    return try await HostAgentRegistryWire.call(procedure: "listPlugins", payload: payload, api: api)
  }

  static func refreshPlugins(api: RemoteAPIClient) async throws -> [String: Any] {
    try await HostAgentRegistryWire.call(procedure: "refreshPlugins", payload: [:], api: api)
  }

  static func pluginCatalog(action: [String: Any], api: RemoteAPIClient) async throws -> [String: Any] {
    try await HostAgentRegistryWire.call(procedure: "pluginCatalog", payload: action, api: api)
  }

  static func pluginAccounts(action: [String: Any], api: RemoteAPIClient) async throws -> [String: Any] {
    try await HostAgentRegistryWire.call(procedure: "pluginAccounts", payload: action, api: api)
  }
}

struct HostPluginsManagementView: View {
  let api: RemoteAPIClient?
  var projectId: String? = nil
  @State private var plugins: [(id: String, name: String, enabled: Bool)] = []
  @State private var loading = false

  var body: some View {
    List {
      if loading { ProgressView() }
      if plugins.isEmpty && !loading {
        ContentUnavailableView("No plugins installed", systemImage: "puzzlepiece.extension")
      }
      ForEach(plugins, id: \.id) { plugin in
        HStack {
          Text(plugin.name)
          Spacer()
          Text(plugin.enabled ? "Enabled" : "Disabled")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }
    }
    .navigationTitle("Plugins")
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button {
          Task {
            guard let api else { return }
            _ = try? await HostPluginManagementWire.refreshPlugins(api: api)
            await load()
          }
        } label: { Image(systemName: "arrow.clockwise") }
      }
    }
    .task { await load() }
  }

  private func load() async {
    guard let api else { return }
    loading = true
    defer { loading = false }
    guard let response = try? await HostPluginManagementWire.listPlugins(projectId: projectId, api: api),
      let result = response["result"] as? [String: Any],
      let items = result["plugins"] as? [[String: Any]]
    else { return }
    plugins = items.compactMap { item in
      guard let id = item["id"] as? String else { return nil }
      return (id, (item["name"] as? String) ?? id, (item["enabled"] as? Bool) ?? true)
    }
  }
}

// MARK: - Memory Catalog & Sync (`memory-catalog`, `memory-sync`), Provider Usage & Environments Alignment, Hex Voice Wait

enum HostMemoryAndUsageWire {
  static let memoryCatalogRouteId = "memory-catalog"
  static let memorySyncRouteId = "memory-sync"

  static let environmentRouteIds: [String] = [
    "environment-list",
    "environment-create",
    "environment-get",
    "environment-update",
    "environment-delete",
    "environment-connect",
    "environment-disconnect",
    "environment-pairing",
    "environment-upgrade",
    "environment-websocket-ticket",
    "environment-trust-probe",
    "environment-trust-accept",
    "environment-adopt-legacy",
  ]

  static func fetchMemoryCatalog(projectId: String? = nil, api: RemoteAPIClient) async throws -> [String: Any] {
    var query: [URLQueryItem] = []
    if let projectId { query.append(URLQueryItem(name: "projectId", value: projectId)) }
    let data = try await api.requestData(path: "/api/memory/catalog", queryItems: query)
    return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
  }

  static func runMemorySync(payload: [String: Any], api: RemoteAPIClient) async throws -> [String: Any] {
    let body = try JSONSerialization.data(withJSONObject: payload)
    let data = try await api.requestData(path: "/api/memory/sync", method: "POST", jsonBody: body)
    return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
  }

  static func getProviderUsage(providerId: String? = nil, api: RemoteAPIClient) async throws -> [String: Any] {
    var payload: [String: Any] = [:]
    if let providerId { payload["providerId"] = providerId }
    return try await HostAgentRegistryWire.call(procedure: "getProviderUsage", payload: payload, api: api)
  }

  static func refreshProviderUsage(providerId: String? = nil, api: RemoteAPIClient) async throws -> [String: Any] {
    var payload: [String: Any] = [:]
    if let providerId { payload["providerId"] = providerId }
    return try await HostAgentRegistryWire.call(procedure: "refreshProviderUsage", payload: payload, api: api)
  }

  /// Additive `supportsWait` / `wait` live capture dictation call matching shared renderer.
  static func transcribeWithWait(audioWavBase64: String, wait: Bool = true, api: RemoteAPIClient) async throws -> [String: Any] {
    let body = try JSONSerialization.data(withJSONObject: [
      "audioBase64": audioWavBase64,
      "supportsWait": true,
      "wait": wait,
    ])
    let data = try await api.requestData(path: "/api/voice/hex/transcribe", method: "POST", jsonBody: body)
    return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
  }
}

struct HostMemoryCatalogView: View {
  let api: RemoteAPIClient?
  var projectId: String? = nil
  @State private var entries: [(id: String, summary: String)] = []
  @State private var loading = false
  @State private var syncing = false

  var body: some View {
    List {
      if loading { ProgressView() }
      Section {
        Button(syncing ? "Syncing…" : "Sync across environments") {
          guard let api, !syncing else { return }
          syncing = true
          Task {
            defer { syncing = false }
            _ = try? await HostMemoryAndUsageWire.runMemorySync(payload: [:], api: api)
            await load()
          }
        }
        .disabled(syncing || api == nil)
      }
      Section("Learned memories") {
        if entries.isEmpty && !loading {
          Text("No learned memories yet.").foregroundStyle(.secondary).font(.footnote)
        }
        ForEach(entries, id: \.id) { entry in
          Text(entry.summary).font(.footnote)
        }
      }
    }
    .navigationTitle("Memory")
    .task { await load() }
  }

  private func load() async {
    guard let api else { return }
    loading = true
    defer { loading = false }
    guard let root = try? await HostMemoryAndUsageWire.fetchMemoryCatalog(projectId: projectId, api: api),
      let items = (root["entries"] as? [[String: Any]]) ?? (root["memories"] as? [[String: Any]])
    else { return }
    entries = items.compactMap { item in
      guard let id = item["id"] as? String else { return nil }
      let text = (item["summary"] as? String) ?? (item["content"] as? String) ?? (item["title"] as? String) ?? id
      return (id, text)
    }
  }
}
