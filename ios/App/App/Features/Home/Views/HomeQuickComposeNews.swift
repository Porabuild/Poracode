import SwiftUI

extension HomeQuickComposeView {
  var showsNews: Bool { newsEnabled && launchSeed == nil && onNewsAction != nil }

  struct NewsRefreshKey: Equatable {
    let lease: SettingsHostLease?
    let readable: Bool
    let enabled: Bool
    let offset: Double
  }

  var newsRefreshKey: NewsRefreshKey {
    let selection = session.currentSettingsHostSelection
    return .init(lease: selection?.lease, readable: selection?.gate(.sessionRead) == nil,
      enabled: showsNews, offset: Double(TimeZone.current.secondsFromGMT()) / 60)
  }

  var newsLine: some View {
    let lease = session.currentSettingsHostSelection?.lease
    return HomeNewsLineView(visit: newsVisit, model: newsModel, composerControlsPresented: draft.selector != nil, compact: isCompactHeight,
      canOpenFeature: newsCanOpenFeature, preparePresentation: { draft.promptFocused = false }) { action in
      guard lease == session.currentSettingsHostSelection?.lease, ownsCurrentConnection else { return }
      if case .feature(let id) = action, ["plugins", "mcp-servers", "crossagents", "skills"].contains(id) {
        isExpanded = true
        draft.promptFocused = false
        draft.selector = .add
        draft.selectorPath = [id == "plugins" || id == "crossagents" ? .plugins : id == "skills" ? .skills : .mcp]
        let signal = id == "mcp-servers" ? "mcpServers" : id == "crossagents" ? "plugins" : id
        HomeNewsMemoryStore.shared.recordSignal("settings:\(signal)")
      } else { onNewsAction?(action) }
    }
  }

  var newsModel: HomeNewsCards.Model {
    let memory = HomeNewsMemoryStore.shared
    let selection = session.currentSettingsHostSelection
    let data = newsHostData.lease == selection?.lease && selection?.gate(.sessionRead) == nil ? newsHostData.snapshot : nil
    let threads = session.state.snapshot?.threads ?? []
    var context = HomeNewsFeatureContext()
    context.signals = Set(memory.value.signals)
    context.stats = data?.stats
    context.savedCrews = data?.settings?.crews?.count ?? 0
    context.threadsWithCrew = threads.contains { $0.config.crew != nil }
    context.threadsInWorktree = threads.contains { !($0.worktreePath ?? "").isEmpty }
    context.threadsWithPullRequest = threads.contains { session.gitSummary(forThread: $0.id)?.pullRequest != nil }
    context.schedules = data?.schedules
    context.mcpServers = data?.mcpServers ?? 0
    context.workspaces = workspace.preferences.workspaces.count
    context.remoteServers = session.state.hosts.count
    context.readyAgents = session.state.replay.agentStatuses.ordered.filter { $0.installed && $0.authState == .authenticated }.count
    for server in ["chrome", "computer_use", "browser", "crossagents"] {
      if (data?.stats?.mcps ?? []).contains(where: { row in
        let name = row.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return row.runCount > 0 && (name == server || name.hasPrefix("\(server)__") || name.hasPrefix("\(server).") || name.hasPrefix("mcp__\(server)__"))
      }) { context.usedMCP.insert(server) }
    }
    let catalog = HomeNewsCatalog.bundled
    let labels = Dictionary(uniqueKeysWithValues: catalog.usageProviders.map { ($0.id, $0.label) })
    let supported = Set(catalog.features.map(\.id).filter(newsCanOpenFeature))
    let input = HomeNewsCardInputs(context: context, usage: data?.usage ?? [], disabledUsageProviders: Set(data?.settings?.usage?.disabledProviders ?? []),
      usageLabels: labels, releases: ChangelogStore.shared.releases, feed: HomeNewsFeedStore.shared.feed,
      memory: memory.value, hiddenIDs: memory.hiddenIDs, supportedFeatures: supported, tips: [],
      version: session.profile?.appVersion ?? "0.0.0", locale: newsLocale, activity: newsActivity)
    return HomeNewsCards.build(input, visit: newsVisit)
  }

  func newsCanOpenFeature(_ id: String) -> Bool {
    switch id {
    case "crews", "worktrees", "schedules", "pull-requests", "workspaces", "voice-input", "session-import": return true
    case "browser": return session.currentBrowserMirrorAccess != nil
    case "skills": return skillPickerContext != nil
    case "crossagents":
      guard let project = selectedProject, let agent = selectedAgent else { return false }
      return ComposerPluginCatalog.rows(document: draft.tools.document.document, agentKind: agent.kind,
        capabilities: HomeComposerCatalog.capabilities(for: agent, presentationMode: draft.presentationMode),
        presentation: draft.presentationMode, location: project.location).contains { $0.plugin == .crossagents }
    case "mcp-servers", "plugins": return selectedProject != nil && selectedAgent != nil
    case "ai-git": return selectedProject != nil
    // Native theme creation is not implemented yet. Do not advertise an inert CTA.
    default: return false
    }
  }

  func refreshNews() async {
    guard showsNews else { newsHostData.activate(nil); return }
    async let host: Void = newsHostData.refresh(selection: session.currentSettingsHostSelection,
      utcOffsetMinutes: Double(TimeZone.current.secondsFromGMT()) / 60)
    async let feed: Void = HomeNewsFeedStore.shared.refresh()
    if ChangelogStore.shared.state == .idle { await ChangelogStore.shared.refresh() }
    _ = await (host, feed)
  }
}
