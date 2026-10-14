import Foundation

struct RemoteIntegrationsAgentConfig: Codable, Equatable, Sendable {
  let model: String
  let effort: String?
  let fast: Bool?
  var preservedSelection: JSONValue? = nil

  init(model: String, effort: String? = nil, fast: Bool? = nil) {
    self.model = model
    self.effort = effort
    self.fast = fast
  }
}

enum RemoteIntegrationsHostUpdateStatus: Equatable, Sendable {
  struct Download: Equatable, Sendable {
    let percent: Double
    let bytesPerSecond: Double
    let transferred: Double
    let total: Double
  }

  case checking
  case available(version: String)
  case unavailable
  case downloading(Download)
  case downloaded(version: String)
  case failed
}

extension RemoteIntegrationsHostUpdateStatus: Codable {
  private enum CodingKeys: String, CodingKey {
    case type
    case version
    case percent
    case bytesPerSecond
    case transferred
    case total
  }

  private enum Kind: String, Codable {
    case checking
    case available = "update-available"
    case unavailable = "update-not-available"
    case downloading
    case downloaded
    case failed = "error"
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    switch try container.decode(Kind.self, forKey: .type) {
    case .checking: self = .checking
    case .available:
      self = .available(version: try container.decode(String.self, forKey: .version))
    case .unavailable: self = .unavailable
    case .downloading:
      self = .downloading(
        Download(
          percent: try container.decode(Double.self, forKey: .percent),
          bytesPerSecond: try container.decode(Double.self, forKey: .bytesPerSecond),
          transferred: try container.decode(Double.self, forKey: .transferred),
          total: try container.decode(Double.self, forKey: .total)
        )
      )
    case .downloaded:
      self = .downloaded(version: try container.decode(String.self, forKey: .version))
    case .failed:
      // Host-supplied updater messages and keys are deliberately discarded.
      self = .failed
    }
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .checking: try container.encode(Kind.checking, forKey: .type)
    case .available(let version):
      try container.encode(Kind.available, forKey: .type)
      try container.encode(version, forKey: .version)
    case .unavailable: try container.encode(Kind.unavailable, forKey: .type)
    case .downloading(let download):
      try container.encode(Kind.downloading, forKey: .type)
      try container.encode(download.percent, forKey: .percent)
      try container.encode(download.bytesPerSecond, forKey: .bytesPerSecond)
      try container.encode(download.transferred, forKey: .transferred)
      try container.encode(download.total, forKey: .total)
    case .downloaded(let version):
      try container.encode(Kind.downloaded, forKey: .type)
      try container.encode(version, forKey: .version)
    case .failed: try container.encode(Kind.failed, forKey: .type)
    }
  }
}

struct RemoteIntegrationsHostUpdateState: Codable, Equatable, Sendable {
  let currentVersion: String
  let status: RemoteIntegrationsHostUpdateStatus?
}


struct RemoteIntegrationsPRWatchKey: Codable, Equatable, Hashable, Sendable {
  let projectId: String
  let prNumber: Int
}

struct RemoteIntegrationsPRWatchInput: Codable, Equatable, Sendable {
  let projectId: String
  let prNumber: Int
  let headBranch: String
  let worktreePath: String?
  let watchEnabled: Bool
  let autoMerge: Bool
  let agentKind: String?
  let config: RemoteIntegrationsAgentConfig?
}

struct RemoteIntegrationsPRWatchAgentSync: Codable, Equatable, Sendable {
  let projectId: String
  let agentKind: String
  let config: RemoteIntegrationsAgentConfig
}

struct RemoteIntegrationsPRWatch: Codable, Equatable, Sendable {
  let projectId: String
  let prNumber: Int
  let headBranch: String
  let worktreePath: String?
  let watchEnabled: Bool
  let autoMerge: Bool
  let agentKind: String?
  let config: RemoteIntegrationsAgentConfig?

  // Preserve only whether a host diagnostic exists; never retain or display its contents.
  let hasLastError: Bool

  private enum CodingKeys: String, CodingKey {
    case projectId, prNumber, headBranch, worktreePath, watchEnabled, autoMerge, agentKind, config
    case lastError
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    projectId = try container.decode(String.self, forKey: .projectId)
    prNumber = try container.decode(Int.self, forKey: .prNumber)
    headBranch = try container.decode(String.self, forKey: .headBranch)
    worktreePath = try container.decodeIfPresent(String.self, forKey: .worktreePath)
    watchEnabled = try container.decode(Bool.self, forKey: .watchEnabled)
    autoMerge = try container.decode(Bool.self, forKey: .autoMerge)
    agentKind = try container.decodeIfPresent(String.self, forKey: .agentKind)
    config = try container.decodeIfPresent(RemoteIntegrationsAgentConfig.self, forKey: .config)
    hasLastError = try container.decodeIfPresent(String.self, forKey: .lastError) != nil
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(projectId, forKey: .projectId)
    try container.encode(prNumber, forKey: .prNumber)
    try container.encode(headBranch, forKey: .headBranch)
    try container.encodeIfPresent(worktreePath, forKey: .worktreePath)
    try container.encode(watchEnabled, forKey: .watchEnabled)
    try container.encode(autoMerge, forKey: .autoMerge)
    try container.encodeIfPresent(agentKind, forKey: .agentKind)
    try container.encodeIfPresent(config, forKey: .config)
    if hasLastError {
      try container.encode("redacted", forKey: .lastError)
    } else {
      try container.encodeNil(forKey: .lastError)
    }
  }
}

struct RemoteIntegrationsPRWatchResponse: Codable, Equatable, Sendable {
  let watch: RemoteIntegrationsPRWatch?
}

struct RemoteIntegrationsOKResponse: Codable, Equatable, Sendable {
  let ok: Bool
}

// Generated codecs validate this selection; keep its full validated JSON while
// projecting only the controls shown by the native editor.
extension RemoteIntegrationsAgentConfig {
  init(from decoder: Decoder) throws {
    let raw = try JSONValue(from: decoder)
    guard let model = raw["model"]?.stringValue else {
      throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Missing model"))
    }
    self.model = model
    effort = raw["effort"]?.stringValue
    fast = raw["fast"] == .bool(true) ? true : raw["fast"] == .bool(false) ? false : nil
    preservedSelection = raw
  }

  func encode(to encoder: Encoder) throws {
    if let preservedSelection { try preservedSelection.encode(to: encoder); return }
    var raw: [String: JSONValue] = ["model": .string(model)]
    if let effort { raw["effort"] = .string(effort) }
    if let fast { raw["fast"] = .bool(fast) }
    try JSONValue.object(raw).encode(to: encoder)
  }
}
