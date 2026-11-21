import SwiftUI

enum SettingsSearchField: Hashable, Sendable {
  case language, contentLanguage, homeShortcuts
  case appearanceMode, customTheme, theme, chatTextSize
  case terminalFont, agentTerminalTextSize, projectTerminalTextSize
  case microphone, dictationButton, dictationLanguage, dictationBackend
  case notificationsEnabled, notificationSound, notificationPresentation
  case notificationDone, notificationAttention, notificationError
  case gitDefaultAction, gitMergeMethod, worktreeStorage
  case titleGeneration, commitGeneration, conflictResolution
}

enum SettingsSearchDestination: Hashable {
  case device(DeviceSettingsDestination)
  case host(SettingsScreenRoute)
  case desktop, createPRAction, schedules, prWatches, hostUpdate, environments, globalMCP, integrations

  var label: (title: String, description: String?, symbol: String) {
    switch self {
    case .device(let page): (page.title, page.description, page.systemImage)
    case .host(let page):
      (SettingsUIStrings.routeTitle(page), SettingsUIStrings.routeDescription(page), page.searchSymbol)
    case .desktop: (SettingsUIStrings.desktopSettingsTitle, SettingsUIStrings.desktopSettingsDescription, "desktopcomputer")
    case .createPRAction: (SettingsUIStrings.defaultCreatePRAction, nil, "arrow.triangle.pull")
    case .schedules: (RemoteIntegrationsStrings.schedules, RemoteIntegrationsStrings.schedulesDescription, "calendar.badge.clock")
    case .prWatches: (RemoteIntegrationsStrings.prWatches, nil, "arrow.triangle.branch")
    case .hostUpdate: (RemoteIntegrationsStrings.update, nil, "arrow.down.circle")
    case .environments: (EnvironmentStrings.title, EnvironmentStrings.subtitle, "server.rack")
    case .globalMCP: (ProjectSettingsStrings.mcpServers, nil, "server.rack")
    case .integrations: (SettingsIntegrationsStrings.title, nil, "puzzlepiece.extension")
    }
  }

  var requiresHost: Bool {
    switch self {
    case .device(let page): page.requiresSelectedHost
    case .createPRAction: false
    default: true
    }
  }

  var fields: [(SettingsSearchField, String)] {
    switch self {
    case .device(.general): [(.language, SettingsUIStrings.language), (.contentLanguage, SettingsUIStrings.commitPRLanguage),
      (.homeShortcuts, SettingsUIStrings.homeShortcuts)]
    case .device(.appearance): [(.appearanceMode, SettingsUIStrings.appearanceMode),
      (.customTheme, String(localized: "Custom theme", table: "CustomThemes")),
      (.theme, SettingsUIStrings.theme), (.chatTextSize, SettingsUIStrings.chatTextSize)]
    case .device(.terminal): [(.terminalFont, TerminalStrings.fontTitle),
      (.agentTerminalTextSize, SettingsUIStrings.agentTerminalTextSize), (.projectTerminalTextSize, SettingsUIStrings.projectTerminalTextSize)]
    case .device(.audio): [(.microphone, VoiceStrings.microphone), (.dictationButton, VoiceStrings.showButton),
      (.dictationLanguage, VoiceStrings.language), (.dictationBackend, VoiceStrings.backend)]
    case .device(.notifications): [(.notificationsEnabled, String(localized: "notifications.enable")),
      (.notificationSound, SettingsUIStrings.notificationSound), (.notificationPresentation, SettingsUIStrings.notificationPresentation),
      (.notificationDone, SettingsUIStrings.notificationDone), (.notificationAttention, SettingsUIStrings.notificationNeedsAttention),
      (.notificationError, SettingsUIStrings.notificationError)]
    case .device(.git): [(.gitDefaultAction, SettingsUIStrings.defaultAction), (.gitMergeMethod, SettingsUIStrings.mergeMethod)]
    case .device(.worktrees), .host(.workspace): [(.worktreeStorage, SettingsUIStrings.storageMode)]
    case .device(.aiHelpers), .host(.generation): [(.titleGeneration, SettingsUIStrings.titleGeneration),
      (.commitGeneration, SettingsUIStrings.commitGeneration), (.conflictResolution, SettingsUIStrings.conflictResolution)]
    default: []
    }
  }
}

extension SettingsScreenRoute {
  var searchSymbol: String {
    switch self {
    case .profile: "person.crop.circle"
    case .usage: "gauge.with.dots.needle.67percent"
    case .generation: "sparkles"
    case .agents: "cpu"
    case .devices: "desktopcomputer"
    case .activity: "chart.bar.xaxis"
    case .tokens: "number.circle"
    case .workspace: "folder.badge.gearshape"
    }
  }
}

struct SettingsSearchHit: Identifiable {
  struct ID: Hashable {
    let destination: SettingsSearchDestination
    let field: SettingsSearchField?
  }

  let id: ID
  let title: String
  let description: String?
  let symbol: String
}

enum NativeSettingsSearch {
  static func isActive(_ query: String) -> Bool { !query.allSatisfy(\.isWhitespace) }

  static func results(_ query: String, desktopOnly: Bool, hasDesktop: Bool, offersEnvironments: Bool) -> [SettingsSearchHit] {
    let terms = query.split(whereSeparator: \.isWhitespace).map(String.init)
    guard !terms.isEmpty else { return [] }
    let common: [SettingsSearchDestination] = [.schedules, .prWatches, .hostUpdate, .globalMCP, .integrations]
    let routes: [SettingsSearchDestination]
    if desktopOnly {
      routes = SettingsScreenRoute.allCases.map(SettingsSearchDestination.host)
        + [.device(.git), .device(.crews), .device(.archived), .device(.sessionImport)] + common
    } else {
      routes = DeviceSettingsDestination.allCases.map(SettingsSearchDestination.device)
        + [.desktop, .createPRAction, .host(.devices), .host(.activity), .host(.tokens)] + common
    }
    let candidates = (routes + (offersEnvironments ? [.environments] : [])).flatMap { destination -> [SettingsSearchHit] in
      guard hasDesktop || !destination.requiresHost else { return [] }
      let label = destination.label
      let page = SettingsSearchHit(id: .init(destination: destination, field: nil), title: label.title,
        description: label.description, symbol: label.symbol)
      return [page] + destination.fields.map { field, title in
        SettingsSearchHit(id: .init(destination: destination, field: field), title: title,
          description: label.title, symbol: label.symbol)
      }
    }
    var titleMatches: [SettingsSearchHit] = []
    var contextMatches: [SettingsSearchHit] = []
    for hit in candidates {
      if terms.allSatisfy({ hit.title.localizedStandardContains($0) }) {
        titleMatches.append(hit)
      } else if terms.allSatisfy({ term in
        hit.title.localizedStandardContains(term) || hit.description?.localizedStandardContains(term) == true
      }) {
        contextMatches.append(hit)
      }
    }
    return titleMatches + contextMatches
  }
}

struct SettingsSearchResults<CreatePR: View>: View {
  @Bindable var session: AppSession
  let selection: SettingsHostSelection?
  let gateway: any SettingsSessionGateway
  let query: String
  var desktopOnly = false
  @ViewBuilder let createPR: () -> CreatePR

  var body: some View {
    let host = session.hosts.first { $0.connectionId == session.selectedConnectionId }
    let results = NativeSettingsSearch.results(query, desktopOnly: desktopOnly, hasDesktop: selection != nil,
      offersEnvironments: host?.hostCapabilities?.offersHostOwnedEnvironments == true)
    if results.isEmpty {
      ContentUnavailableView.search(text: query).listRowBackground(Color.clear)
    } else {
      ForEach(results) { hit in
        if hit.id.destination == .createPRAction {
          createPR()
        } else {
          NavigationLink {
            destination(hit.id.destination)
              .environment(\.settingsSearchField, hit.id.field)
          } label: {
            DeviceSettingsLabel(title: hit.title, description: hit.description, systemImage: hit.symbol)
          }
        }
      }
    }
  }

  @ViewBuilder private func destination(_ route: SettingsSearchDestination) -> some View {
    switch route {
    case .device(let page): DeviceSettingsDestinationView(session: session, destination: page)
    case .host(let page): SettingsMoreRouteView(session: session, route: page)
    case .desktop: SettingsHostView(session: session, selection: selection, gateway: gateway, usesStackNavigation: true)
    case .schedules: RemoteIntegrationsSessionView(session: session, initialRoute: .schedules, embeddedInNavigationStack: true)
    case .prWatches: RemoteIntegrationsSessionView(session: session, initialRoute: .prWatches, embeddedInNavigationStack: true)
    case .hostUpdate: RemoteIntegrationsSessionView(session: session, initialRoute: .update, embeddedInNavigationStack: true)
    case .environments:
      if let connection = session.selectedConnectionId {
        EnvironmentsView(session: session, boundConnectionId: connection).id(connection)
      }
    case .globalMCP: GlobalMCPSettingsView(session: session)
    case .integrations:
      SettingsIntegrationsSessionView(
        session: session,
        embeddedInNavigationStack: true,
        allowsRouteSelection: true
      )
    case .createPRAction: EmptyView()
    }
  }
}

private struct SettingsSearchFieldKey: EnvironmentKey {
  static let defaultValue: SettingsSearchField? = nil
}

extension EnvironmentValues {
  var settingsSearchField: SettingsSearchField? {
    get { self[SettingsSearchFieldKey.self] }
    set { self[SettingsSearchFieldKey.self] = newValue }
  }
}

extension View {
  @ViewBuilder func settingsSearchAnchor(_ field: SettingsSearchField?) -> some View {
    if let field { id(field) } else { self }
  }

  func settingsSearchScroll() -> some View {
    modifier(SettingsSearchScroll())
  }
}

private struct SettingsSearchScroll: ViewModifier {
  @Environment(\.settingsSearchField) private var field

  func body(content: Content) -> some View {
    if let field {
      ScrollViewReader { scroll in
        content.task(id: field) { await scroll.scrollToSetting(field) }
      }
    } else {
      content
    }
  }
}

extension ScrollViewProxy {
  @MainActor func scrollToSetting(_ field: SettingsSearchField?) async {
    guard let field else { return }
    await Task.yield()
    guard !Task.isCancelled else { return }
    scrollTo(field, anchor: .center)
  }
}
