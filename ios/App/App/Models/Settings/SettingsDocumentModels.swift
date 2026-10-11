import Foundation

enum SettingsAgentValue: Codable, Equatable, Sendable {
  case bool(Bool)
  case string(String)

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if let value = try? container.decode(Bool.self) {
      self = .bool(value)
    } else {
      self = .string(try container.decode(String.self))
    }
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .bool(let value): try container.encode(value)
    case .string(let value): try container.encode(value)
    }
  }
}

enum SettingsPresentationMode: String, Codable, Sendable {
  case terminal, gui
}

enum SettingsWorktreeStorageMode: String, Codable, Sendable {
  case global
  case projectRelative = "project-relative"
}

enum SettingsPRAutomationDefault: String, Codable, Sendable {
  case off, fix, merge
}

enum SettingsPRMergeMethod: String, Codable, Sendable {
  case merge, squash, rebase
}

struct SettingsUsagePreferences: Codable, Equatable, Sendable {
  var autoRefresh: Bool
  var refreshIntervalMinutes: Int
  var providerRefreshIntervals: [String: Int]
  var showEstimatedCost: Bool
  var showInSidebar: Bool
  var sidebarHiddenProviders: [String]
  var disabledProviders: [String]
  var providerOrder: [String]
  var collapsedProviders: [String]
  var selectedRingGroups: [String: String]

  var settingsJSON: SettingsJSON {
    .object([
      "autoRefresh": .bool(autoRefresh),
      "refreshIntervalMinutes": .integer(Int64(refreshIntervalMinutes)),
      "providerRefreshIntervals": .object(
        providerRefreshIntervals.mapValues { .integer(Int64($0)) }
      ),
      "showEstimatedCost": .bool(showEstimatedCost),
      "showInSidebar": .bool(showInSidebar),
      "sidebarHiddenProviders": .array(sidebarHiddenProviders.map(SettingsJSON.string)),
      "disabledProviders": .array(disabledProviders.map(SettingsJSON.string)),
      "providerOrder": .array(providerOrder.map(SettingsJSON.string)),
      "collapsedProviders": .array(collapsedProviders.map(SettingsJSON.string)),
      "selectedRingGroups": .object(selectedRingGroups.mapValues(SettingsJSON.string)),
    ])
  }
}

struct SettingsDocument: Codable, Equatable, Sendable {
  let agentSettings: [String: [String: SettingsAgentValue]]
  let hiddenModels: [String: [String]]
  let disabledAgents: [String]
  let providerOrder: [String]
  var usage: SettingsUsagePreferences? = nil
  let enabledMcpServers: [String: Bool]
  let disabledBuiltInMcpServers: [String: Bool]
  let titleGenProvider: String
  let titleGenModel: String
  let titleGenEffort: String
  let titleGenFast: Bool
  let commitGenProvider: String
  let commitGenModel: String
  let commitGenEffort: String
  let commitGenFast: Bool
  let conflictResolverProvider: String
  let conflictResolverModel: String
  let conflictResolverEffort: String
  let conflictResolverFast: Bool
  let conflictResolverPresentationMode: SettingsPresentationMode
  let wslTitleGenProvider: String
  let wslTitleGenModel: String
  let wslTitleGenEffort: String
  let wslTitleGenFast: Bool
  let wslCommitGenProvider: String
  let wslCommitGenModel: String
  let wslCommitGenEffort: String
  let wslCommitGenFast: Bool
  let wslConflictResolverProvider: String
  let wslConflictResolverModel: String
  let wslConflictResolverEffort: String
  let wslConflictResolverFast: Bool
  let wslConflictResolverPresentationMode: SettingsPresentationMode
  let worktreeStorageMode: SettingsWorktreeStorageMode
  let worktreeBasePath: String
  let wslWorktreeBasePath: String
  var searchUseIgnoreFiles: Bool? = nil
  var searchExclude: [String: Bool]? = nil
  let prAutomationDefault: SettingsPRAutomationDefault
  let prMergeMethod: SettingsPRMergeMethod
}

struct SettingsReadResponse: Codable, Equatable, Sendable {
  let settings: SettingsDocument
}

enum SettingsPatchKey: String, Codable, CaseIterable, Sendable {
  case agentSettings, hiddenModels, disabledAgents, providerOrder, usage
  case enabledMcpServers, disabledBuiltInMcpServers
  case titleGenProvider, titleGenModel, titleGenEffort, titleGenFast
  case commitGenProvider, commitGenModel, commitGenEffort, commitGenFast
  case conflictResolverProvider, conflictResolverModel, conflictResolverEffort
  case conflictResolverFast, conflictResolverPresentationMode
  case wslTitleGenProvider, wslTitleGenModel, wslTitleGenEffort, wslTitleGenFast
  case wslCommitGenProvider, wslCommitGenModel, wslCommitGenEffort, wslCommitGenFast
  case wslConflictResolverProvider, wslConflictResolverModel, wslConflictResolverEffort
  case wslConflictResolverFast, wslConflictResolverPresentationMode
  case worktreeStorageMode, worktreeBasePath, wslWorktreeBasePath
  case searchUseIgnoreFiles, searchExclude
  case prAutomationDefault, prMergeMethod
}

/// Sparse settings mutation. A missing dictionary key is omitted; `.null` remains distinguishable
/// and will be rejected by the authoritative generated request codec because no patch field is
/// nullable in remote-v3.
struct SettingsPatch: Codable, Equatable, Sendable {
  private(set) var values: [SettingsPatchKey: SettingsJSON]

  init(values: [SettingsPatchKey: SettingsJSON] = [:]) { self.values = values }

  subscript(key: SettingsPatchKey) -> SettingsJSON? {
    get { values[key] }
    set { values[key] = newValue }
  }

  init(from decoder: Decoder) throws {
    let object = try [String: SettingsJSON](from: decoder)
    var values: [SettingsPatchKey: SettingsJSON] = [:]
    for (key, value) in object {
      guard let stableKey = SettingsPatchKey(rawValue: key) else {
        throw DecodingError.dataCorrupted(
          .init(codingPath: decoder.codingPath, debugDescription: "Unknown settings patch key")
        )
      }
      values[stableKey] = value
    }
    self.values = values
  }

  func encode(to encoder: Encoder) throws {
    try Dictionary(uniqueKeysWithValues: values.map { ($0.key.rawValue, $0.value) })
      .encode(to: encoder)
  }
}
