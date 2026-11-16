import Foundation

enum SettingsAgentAuthState: String, Codable, Sendable {
  case authenticated
  case missing
  case unknown
}

/// The agent capability surface evolves frequently. Its entire root-codec-canonicalized object is
/// retained so no authoritative field or omitted-vs-null distinction is projected away.
struct SettingsAgentStatus: Codable, Equatable, Sendable {
  let payload: SettingsJSON

  init(payload: SettingsJSON) throws {
    guard let object = payload.objectValue,
      object["kind"]?.stringValue?.isEmpty == false,
      object["label"]?.stringValue?.isEmpty == false,
      object["installed"]?.boolValue != nil,
      object["authState"]?.stringValue != nil,
      object["capabilities"]?.objectValue != nil
    else {
      throw DecodingError.dataCorrupted(
        .init(codingPath: [], debugDescription: "Invalid canonical agent status")
      )
    }
    self.payload = payload
  }

  init(from decoder: Decoder) throws {
    try self.init(payload: SettingsJSON(from: decoder))
  }

  func encode(to encoder: Encoder) throws { try payload.encode(to: encoder) }

  var kind: String { payload.objectValue?["kind"]?.stringValue ?? "" }
  var label: String { payload.objectValue?["label"]?.stringValue ?? "" }
  var installed: Bool { payload.objectValue?["installed"]?.boolValue ?? false }
  var identity: String {
    AgentStatusRecord.identity(kind: kind, environment: payload.objectValue?["envKind"]?.stringValue,
      distro: payload.objectValue?["envDistro"]?.stringValue)
  }
  /// Both settings and composer read the same validated status payload. This
  /// bridge is display-only; the lossless SettingsJSON remains the wire owner.
  var composerRecord: AgentStatusRecord? {
    guard let data = try? JSONEncoder().encode(payload),
      let value = try? JSONDecoder().decode(JSONValue.self, from: data) else { return nil }
    return try? AgentStatusRecord(wire: value)
  }
  var authState: SettingsAgentAuthState? {
    payload.objectValue?["authState"]?.stringValue.flatMap(SettingsAgentAuthState.init(rawValue:))
  }

  var models: [SettingsAgentModel] {
    guard let values = payload.objectValue?["capabilities"]?.objectValue?["models"]?.arrayValue
    else { return [] }
    return values.compactMap { value in
      guard let object = value.objectValue,
        let id = object["id"]?.stringValue,
        !id.isEmpty,
        id != "auto",
        let label = object["label"]?.stringValue,
        !label.isEmpty
      else { return nil }
      return SettingsAgentModel(id: id, label: label)
    }
  }

  var supportsOneShot: Bool {
    payload.objectValue?["capabilities"]?.objectValue?["supportsOneShot"]?.boolValue ?? false
  }

  var efforts: [String] {
    stringArray("efforts")
  }

  var fastModels: Set<String> {
    Set(stringArray("fastModels"))
  }

  private func stringArray(_ key: String) -> [String] {
    guard let values = payload.objectValue?["capabilities"]?.objectValue?[key]?.arrayValue else {
      return []
    }
    return values.compactMap(\.stringValue).filter { !$0.isEmpty }
  }
}

struct SettingsAgentModel: Equatable, Hashable, Identifiable, Sendable {
  let id: String
  let label: String
}

struct SettingsAgentStatuses: Codable, Equatable, Sendable {
  let windows: [SettingsAgentStatus]
  let wsl: [SettingsAgentStatus]
  let updatedAt: String

  /// The status endpoint owns complete native/project-distro inventories.
  /// Explicit discovery can additionally return a WSL distro absent from that
  /// endpoint. Retain other previously discovered distros, without reviving
  /// entries in the scope that was just scanned.
  func mergingDiscovery(_ discovered: SettingsAgentDiscoveryResult?,
    requestedDistros: [String], previous: SettingsAgentStatuses?) -> Self {
    let fetchedDistros = Set(wsl.map { $0.payload.objectValue?["envDistro"]?.stringValue ?? "" })
    let requested = Set(requestedDistros)
    let retained = (previous?.wsl ?? []).filter {
      !requested.contains($0.payload.objectValue?["envDistro"]?.stringValue ?? "")
    }
    var seen = Set<String>()
    let merged = wsl + ((discovered?.wsl ?? []) + retained).filter {
      !fetchedDistros.contains($0.payload.objectValue?["envDistro"]?.stringValue ?? "")
    }
    return .init(windows: windows, wsl: merged.filter {
      seen.insert($0.identity).inserted
    }, updatedAt: updatedAt)
  }
}

struct SettingsAgentDiscoveryRequest: Codable, Equatable, Sendable {
  let wslDistros: [String]
}

struct SettingsAgentDiscoveryResult: Codable, Equatable, Sendable {
  let windows: [SettingsAgentStatus]
  let wsl: [SettingsAgentStatus]
  let fromCache: Bool
}

/// PWA settings treat old undistroed WSL statuses as part of the host pool.
/// A removed distro falls back to that pool, keeping the machine picker usable.
struct SettingsAgentMachineScope {
  let distros: [String]
  let distro: String?
  let agents: [AgentStatusRecord]

  init(statuses: SettingsAgentStatuses?, preferredDistro: String?) {
    let available = Set((statuses?.wsl ?? []).compactMap {
      $0.payload.objectValue?["envDistro"]?.stringValue
    }.filter { !$0.isEmpty }).sorted()
    distros = available
    distro = preferredDistro.flatMap { available.contains($0) ? $0 : nil }
    let candidates: [SettingsAgentStatus]
    if let distro {
      candidates = (statuses?.wsl ?? []).filter { $0.payload.objectValue?["envDistro"]?.stringValue == distro }
    } else {
      candidates = (statuses?.windows ?? []) + (statuses?.wsl ?? []).filter {
        ($0.payload.objectValue?["envDistro"]?.stringValue ?? "").isEmpty
      }
    }
    agents = candidates.compactMap(\.composerRecord)
  }
}

enum SettingsUsageStatus: String, Codable, Sendable {
  case ok
  case authMissing = "auth-missing"
  case appNotRunning = "app-not-running"
  case rateLimited = "rate-limited"
  case quotaHit = "quota-hit"
  case unsupported
  case error
}

enum SettingsUsageUnit: String, Codable, Sendable {
  case percent, tokens, requests, credits, usd
}

enum SettingsUsagePeriod: String, Codable, Sendable {
  case today
  case sevenDays = "7d"
  case thirtyDays = "30d"
  case cycle
}

struct SettingsUsageWindow: Codable, Equatable, Sendable {
  let id: String
  let label: String
  let usedPercent: Double
  let used: Double?
  let limit: Double?
  let unit: SettingsUsageUnit?
  let currency: String?
  let resetsAt: Int64?
}

struct SettingsUsageCost: Codable, Equatable, Sendable {
  let amount: Double
  let currency: String
  let period: SettingsUsagePeriod
  let estimated: Bool
}

struct SettingsUsageCredits: Codable, Equatable, Sendable {
  let balance: Double
  let currency: String?
  let label: String?
  let unlimited: Bool?
}

struct SettingsUsageTokens: Codable, Equatable, Sendable {
  let input: Double?
  let output: Double?
  let cacheRead: Double?
  let cacheWrite: Double?
  let total: Double?
  let period: SettingsUsagePeriod?
}

struct SettingsUsageSnapshot: Codable, Equatable, Sendable {
  let providerId: String
  let status: SettingsUsageStatus
  let windows: [SettingsUsageWindow]
  let fetchedAt: Int64
  let authenticatedAs: String?
  let plan: String?
  let error: String?
  let rateLimitedUntil: Int64?
  let cost: SettingsUsageCost?
  let credits: SettingsUsageCredits?
  let tokens: SettingsUsageTokens?
}

struct SettingsProviderUsage: Codable, Equatable, Sendable {
  let snapshots: [SettingsUsageSnapshot]
  let fromCache: Bool
  var ringLayouts: [String: SettingsUsageRingLayout]? = nil
}

struct SettingsUsageRingLayout: Codable, Equatable, Sendable {
  var outerWindowId: String? = nil
  var innerWindowId: String? = nil
}
