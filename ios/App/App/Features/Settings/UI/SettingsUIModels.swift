import Foundation

enum SettingsScreenRoute: String, CaseIterable, Hashable, Identifiable, Sendable {
  case agents
  case usage
  case devices
  case activity
  case tokens
  case profile
  case generation
  case workspace

  var id: Self { self }
  var requiredCapability: SettingsCapability { .sessionRead }
}

struct SettingsHostSelection: Equatable, Sendable {
  let name: String
  let access: SettingsSessionAccess

  var lease: SettingsHostLease { access.lease }

  func gate(_ capability: SettingsCapability) -> SettingsOperationFailure? {
    access.gate(capability)
  }
}

struct SettingsProfileQuery: Equatable, Hashable, Sendable {
  var scope: SettingsProfileScope = .device
  var deviceID: String?
  var provider: String?
  var window: SettingsProfileWindow = .all

  func request(timeZone: TimeZone = .current, date: Date = Date()) -> SettingsProfileStatsRequest {
    SettingsProfileStatsRequest(
      utcOffsetMinutes: Double(timeZone.secondsFromGMT(for: date)) / 60,
      scope: scope,
      deviceId: scope == .device ? deviceID : nil,
      provider: provider,
      window: window
    )
  }
}

struct SettingsRefreshIdentity: Hashable, Sendable {
  let connectionID: ClientConnectionID?
  let generation: UInt64?
  let protocolVersion: Int?
  let isOnline: Bool
  let isReady: Bool
  let capabilities: Set<SettingsCapability>
  let route: SettingsScreenRoute
  let query: SettingsProfileQuery

  init(
    selection: SettingsHostSelection?,
    route: SettingsScreenRoute,
    query: SettingsProfileQuery
  ) {
    connectionID = selection?.lease.connectionID
    generation = selection?.lease.generation
    protocolVersion = selection?.access.protocolVersion
    isOnline = selection?.access.isOnline ?? false
    isReady = selection?.access.isReady ?? false
    capabilities = selection?.access.capabilities ?? []
    self.route = route
    self.query = query
  }
}

enum SettingsMutationNotice: Equatable, Sendable {
  case saved
  case ambiguousRefreshed
  case ambiguousRefreshFailed
}

struct SettingsProfileIdentityDraft: Equatable, Sendable {
  static let nameLimit = 80
  static let handleLimit = 40
  static let avatarColorLimit = 64

  var name: String
  var handle: String
  var avatarColor: String
  private let plan: String?

  init(_ identity: SettingsProfileIdentity) {
    name = identity.name
    handle = identity.handle
    avatarColor = identity.avatarColor
    plan = identity.plan
  }

  var isValid: Bool {
    name.count <= Self.nameLimit
      && handle.count <= Self.handleLimit
      && avatarColor.count <= Self.avatarColorLimit
  }

  var value: SettingsProfileIdentity {
    SettingsProfileIdentity(name: name, handle: handle, avatarColor: avatarColor, plan: plan)
  }
}

struct SettingsAgentPresentation: Equatable, Identifiable, Sendable {
  let id: String
  let label: String
  let kind: String
  let installed: Bool
  let authState: SettingsAgentAuthState?

  init(_ status: SettingsAgentStatus, environment: String) {
    id = "\(environment):\(status.kind)"
    label = status.label
    kind = status.kind
    installed = status.installed
    authState = status.authState
  }
}

enum SettingsReplayAgentLoadState: Equatable, Sendable {
  case notLoaded
  case loadedEmpty
  case populated
}

/// Redacted row consumed by SwiftUI. Deliberately excludes the retained wire payload,
/// capabilities, configuration, endpoints, tokens, and command metadata.
struct SettingsReplayAgentRow: Equatable, Identifiable, Sendable {
  let id: String
  let label: String
  let kind: String
  let installed: Bool
  let authState: AgentStatusRecord.AuthState
  let distro: String?
}

struct SettingsReplayAgentEnvironment: Equatable, Sendable {
  let loadState: SettingsReplayAgentLoadState
  let agents: [SettingsReplayAgentRow]
}

struct SettingsReplayAgentPresentation: Equatable, Sendable {
  let windows: SettingsReplayAgentEnvironment
  let wsl: SettingsReplayAgentEnvironment

  static let notLoaded = SettingsReplayAgentPresentation(
    windows: SettingsReplayAgentEnvironment(loadState: .notLoaded, agents: []),
    wsl: SettingsReplayAgentEnvironment(loadState: .notLoaded, agents: [])
  )
}

/// Exact-host projection from the replay reducer into the Settings SwiftUI policy.
/// Full environment lists establish loaded/empty state. Incremental patches overlay
/// only the matching Windows kind or WSL kind+distro and cannot erase siblings.
enum SettingsReplayAgentController {
  static func presentation(
    requestedConnectionID: ClientConnectionID?,
    selectedConnectionID: ClientConnectionID?,
    replay: HostReplayState,
    fallbackConnectionID: ClientConnectionID? = nil,
    fallback: SettingsAgentStatuses? = nil
  ) -> SettingsReplayAgentPresentation {
    guard let requestedConnectionID, requestedConnectionID == selectedConnectionID else {
      return .notLoaded
    }
    let exactFallback = fallbackConnectionID == requestedConnectionID ? fallback : nil
    return SettingsReplayAgentPresentation(
      windows: environment(
        loaded: replay.windowsStatusesLoaded,
        base: replay.windowsAgentStatuses,
        patches: replay.agentStatuses.ordered.filter {
          $0.envKind == .windows
            && replay.agentStatusRevisionByIdentity[$0.identity, default: 0]
              > replay.windowsStatusesRevision
        },
        fallback: exactFallback?.windows,
        key: { $0.kind },
        distro: { _ in nil }
      ),
      wsl: environment(
        loaded: replay.wslStatusesLoaded,
        base: replay.wslAgentStatuses,
        patches: replay.agentStatuses.ordered.filter {
          $0.envKind == .wsl
            && replay.agentStatusRevisionByIdentity[$0.identity, default: 0]
              > replay.wslStatusesRevision
        },
        fallback: exactFallback?.wsl,
        key: { "\($0.kind)|\($0.envDistro ?? "")" },
        distro: { $0.envDistro }
      )
    )
  }

  private static func environment(
    loaded: Bool,
    base: [AgentStatusRecord],
    patches: [AgentStatusRecord],
    fallback: [SettingsAgentStatus]?,
    key: (AgentStatusRecord) -> String,
    distro: (AgentStatusRecord) -> String?
  ) -> SettingsReplayAgentEnvironment {
    if !loaded, patches.isEmpty, let fallback {
      let rows = fallback.map { record in
        SettingsReplayAgentRow(
          id: record.kind,
          label: record.label,
          kind: record.kind,
          installed: record.installed,
          authState: authState(record.authState),
          distro: nil
        )
      }
      return SettingsReplayAgentEnvironment(
        loadState: rows.isEmpty ? .loadedEmpty : .populated,
        agents: rows
      )
    }
    var order: [String] = []
    var records: [String: AgentStatusRecord] = [:]
    for record in base + patches {
      let identity = key(record)
      if records.updateValue(record, forKey: identity) == nil { order.append(identity) }
    }
    let rows = order.compactMap { identity -> SettingsReplayAgentRow? in
      guard let record = records[identity] else { return nil }
      return SettingsReplayAgentRow(
        id: identity,
        label: record.label,
        kind: record.kind,
        installed: record.installed,
        authState: record.authState,
        distro: distro(record)
      )
    }
    let state: SettingsReplayAgentLoadState =
      if rows.isEmpty {
        loaded ? .loadedEmpty : .notLoaded
      } else {
        .populated
      }
    return SettingsReplayAgentEnvironment(loadState: state, agents: rows)
  }

  private static func authState(
    _ state: SettingsAgentAuthState?
  ) -> AgentStatusRecord.AuthState {
    switch state {
    case .authenticated: .authenticated
    case .missing: .missing
    case .unknown, nil: .unknown
    }
  }
}
