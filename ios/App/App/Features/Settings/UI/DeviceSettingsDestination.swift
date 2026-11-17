import SwiftUI

/// Remote PWA Settings destinations, using native pages and exact-host gateways.
enum DeviceSettingsDestination: String, CaseIterable, Hashable, Sendable {
  case profile, workspaces, general, appearance, audio, notifications
  case shortcuts
  case terminal, git, worktrees
  case models = "agentsGeneral"
  case aiHelpers = "ai"
  case crews, usage
  case sessionImport = "import"
  case connections = "remoteServers"
  case changelog

  static let personal: [Self] = [.profile, .workspaces, .general, .shortcuts, .appearance, .audio, .notifications]
  static let workspace: [Self] = [.terminal, .git, .worktrees]
  static let agents: [Self] = [.models, .aiHelpers, .crews, .usage, .sessionImport]

  var title: String {
    switch self {
    case .profile: SettingsUIStrings.profileTitle
    case .workspaces: HomeStrings.workspaces
    case .general: SettingsUIStrings.generalTitle
    case .shortcuts: NativeShortcutStrings.title
    case .appearance: SettingsUIStrings.appearanceTitle
    case .audio: VoiceStrings.audio
    case .notifications: SettingsUIStrings.notificationsTitle
    case .terminal: SettingsUIStrings.terminalTitle
    case .git: SettingsUIStrings.gitTitle
    case .worktrees: SettingsUIStrings.worktreeSection
    case .models: SettingsUIStrings.models
    case .aiHelpers: SettingsUIStrings.aiHelpers
    case .crews: CrewStrings.title
    case .usage: SettingsUIStrings.usageTitle
    case .sessionImport: SessionImportStrings.title
    case .connections: HomeStrings.connections
    case .changelog: ChangelogStrings.title
    }
  }

  var systemImage: String {
    switch self {
    case .profile: "person.crop.circle"
    case .workspaces: "square.stack.3d.up"
    case .general: "gearshape"
    case .shortcuts: "keyboard"
    case .appearance: "circle.lefthalf.filled"
    case .audio: "mic"
    case .notifications: "bell"
    case .terminal: "terminal"
    case .git: "arrow.triangle.branch"
    case .worktrees: "folder.badge.gearshape"
    case .models: "cpu"
    case .aiHelpers: "sparkles"
    case .crews: "person.2"
    case .usage: "chart.bar"
    case .sessionImport: "tray.and.arrow.down"
    case .connections: "server.rack"
    case .changelog: "megaphone"
    }
  }

  var description: String? {
    switch self {
    case .general: SettingsUIStrings.generalDescription
    case .shortcuts: NativeShortcutStrings.summary
    case .appearance: SettingsUIStrings.appearanceDescription
    case .audio: VoiceStrings.description
    case .notifications: SettingsUIStrings.notificationsDescription
    case .terminal: SettingsUIStrings.terminalDescription
    case .git: SettingsUIStrings.gitDescription
    default: nil
    }
  }

  var requiresSelectedHost: Bool {
    switch self {
    case .worktrees, .models, .aiHelpers, .crews, .usage, .sessionImport: true
    default: false
    }
  }
}

struct DeviceSettingsDestinationView: View {
  @Bindable var session: AppSession
  let destination: DeviceSettingsDestination

  var body: some View {
    Group {
    switch destination {
    case .profile: SettingsMoreRouteView(session: session, route: .profile)
    case .workspaces: HomeWorkspaceSettingsView(session: session)
    case .general: GeneralSettingsView()
    case .shortcuts: NativeShortcutSettingsView()
    case .appearance: AppearanceSettingsView()
    case .audio: AudioSettingsView(session: session)
    case .notifications: NotificationSettingsView()
    case .terminal: TerminalSettingsView()
    case .git: GitSettingsView(session: session)
    case .worktrees: SettingsMoreRouteView(session: session, route: .workspace, title: destination.title)
    case .models: SettingsMoreRouteView(session: session, route: .agents, title: destination.title)
    case .aiHelpers: SettingsMoreRouteView(session: session, route: .generation, title: destination.title)
    case .crews: CrewsSettingsView(session: session)
    case .usage: SettingsMoreRouteView(session: session, route: .usage)
    case .sessionImport: SessionImportView(session: session)
    case .connections: HostSwitcherView(session: session)
    case .changelog: ChangelogView()
    }
    }
    .onAppear { HomeNewsMemoryStore.shared.recordSignal("settings:\(destination.rawValue)") }
  }
}

struct DeviceSettingsDestinationLink: View {
  @Bindable var session: AppSession
  let destination: DeviceSettingsDestination

  var body: some View {
    NavigationLink {
      DeviceSettingsDestinationView(session: session, destination: destination)
    } label: {
      DeviceSettingsLabel(title: destination.title, description: destination.description, systemImage: destination.systemImage)
    }
    .disabled(destination.requiresSelectedHost && session.currentSettingsHostSelection == nil)
    .accessibilityIdentifier("native-e2e.settings.\(destination.rawValue)")
  }
}

struct DeviceSettingsLabel: View {
  let title: String
  var description: String? = nil
  let systemImage: String

  var body: some View {
    Label {
      VStack(alignment: .leading, spacing: 2) {
        Text(title).foregroundStyle(.primary)
        if let description {
          Text(description).font(.caption).foregroundStyle(.secondary).lineLimit(2)
        }
      }
    } icon: {
      Image(systemName: systemImage).foregroundStyle(.secondary)
    }
    .padding(.vertical, description == nil ? 0 : 2)
  }
}
