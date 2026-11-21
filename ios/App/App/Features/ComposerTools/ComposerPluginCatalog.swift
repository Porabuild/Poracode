import Foundation

struct ComposerPluginRow: Identifiable, Equatable {
  let plugin: HomeComposerMCP
  let enabled: Bool
  let editable: Bool
  var id: String { plugin.persistentID }
}

extension HomeComposerMCP {
  var persistentID: String { self == .computerUse ? "computer-use" : rawValue }
  var configKey: String {
    switch self {
    case .browser: "browserMcp"
    case .crossagents: "crossagentMcp"
    case .chrome: "chromeMcp"
    case .computerUse: "computerUse"
    }
  }

  func enabled(in configuration: ThreadConfig) -> Bool {
    switch self {
    case .browser: configuration.browserMcp == true
    case .crossagents: configuration.crossagentMcp == true
    case .chrome: configuration.chromeMcp == true
    case .computerUse: configuration.computerUse == true
    }
  }

  func set(_ value: Bool?, in configuration: inout ThreadLaunchConfiguration) {
    switch self {
    case .browser: configuration.browserMcp = value
    case .crossagents: configuration.crossagentMcp = value
    case .chrome: configuration.chromeMcp = value
    case .computerUse: configuration.computerUse = value
    }
  }
}

/// The same capability/location rules as the PWA composer registry. These
/// switches are standing host defaults; mentions are separate draft intent.
enum ComposerPluginCatalog {
  static func providerOwnsConfiguration(_ capabilities: [String: JSONValue]) -> Bool {
    capabilities["mcpConfigSource"]?.stringValue == "agentSettings"
  }

  static func rows(document: SettingsDocument?, agentKind: String,
    capabilities: [String: JSONValue], presentation: ThreadPresentationMode,
    location: ProjectLocation, launched: ThreadConfig? = nil
  ) -> [ComposerPluginRow] {
    let owned = providerOwnsConfiguration(capabilities)
    let scope = capabilities["mcpScope"]?.objectValue?[presentation.rawValue]?.stringValue
      ?? (presentation == .gui ? "launch" : "none")
    return HomeComposerMCP.allCases.compactMap { plugin in
      guard location.distro == nil || (plugin != .chrome && plugin != .computerUse) else { return nil }
      if let launched {
        return plugin.enabled(in: launched) ? .init(plugin: plugin, enabled: true, editable: false) : nil
      }
      guard document?.disabledBuiltInMcpServers[plugin.persistentID] != true else { return nil }
      let enabled: Bool
      if owned {
        if case .bool(let saved)? = document?.agentSettings[agentKind]?[plugin.configKey] { enabled = saved }
        else { enabled = capabilities["agentSettingsDefaults"]?.objectValue?[plugin.configKey]?.boolValue == true }
        guard enabled else { return nil }
      } else {
        guard scope != "none" else { return nil }
        enabled = document?.enabledMcpServers[plugin.persistentID] == true
      }
      return .init(plugin: plugin, enabled: enabled, editable: !owned)
    }
  }

  static func launchConfiguration(_ configuration: ThreadLaunchConfiguration,
    document: SettingsDocument, capabilities: [String: JSONValue], presentation: ThreadPresentationMode,
    location: ProjectLocation, mentionedIDs: Set<String>
  ) -> ThreadLaunchConfiguration {
    guard !providerOwnsConfiguration(capabilities) else { return configuration }
    var result = configuration
    let scope = capabilities["mcpScope"]?.objectValue?[presentation.rawValue]?.stringValue
      ?? (presentation == .gui ? "launch" : "none")
    for plugin in HomeComposerMCP.allCases {
      let available = location.distro == nil || (plugin != .chrome && plugin != .computerUse)
      let enabled = document.disabledBuiltInMcpServers[plugin.persistentID] != true
        && (mentionedIDs.contains(plugin.persistentID)
          || (scope != "none" && available && document.enabledMcpServers[plugin.persistentID] == true))
      plugin.set(enabled ? true : nil, in: &result)
    }
    return result
  }
}

struct ComposerCustomMCPRow: Identifiable, Equatable {
  let scope: GlobalMCPSettingsScope
  let server: ProjectMCPServer
  var id: String { "\(scope):\(server.id)" }

  /// Workspace names override global names case-insensitively and retain the
  /// global insertion position, matching mergeMcpServers in the shared model.
  static func merged(global: [ProjectMCPServer], workspace: [ProjectMCPServer], projectID: String?) -> [Self] {
    var order: [String] = []
    var rows: [String: Self] = [:]
    func insert(_ server: ProjectMCPServer, scope: GlobalMCPSettingsScope) {
      let name = server.name.lowercased()
      if rows[name] == nil { order.append(name) }
      rows[name] = Self(scope: scope, server: server)
    }
    for server in global { insert(server, scope: .global) }
    if let projectID { for server in workspace { insert(server, scope: .project(projectID)) } }
    return order.compactMap { rows[$0] }
  }
}
