import Foundation

struct HomeNewsTip: Equatable, Sendable {
  let commandID: String
  let text: String
  let keys: String
}

struct HomeNewsCardInputs {
  let context: HomeNewsFeatureContext
  let usage: [SettingsUsageSnapshot]
  let disabledUsageProviders: Set<String>
  let usageLabels: [String: String]
  let releases: [ChangelogRelease]
  let feed: HomeNewsFeed?
  let memory: HomeNewsMemory
  let hiddenIDs: Set<String>
  let supportedFeatures: Set<String>
  let tips: [HomeNewsTip]
  let version: String
  let locale: Locale
  let activity: Bool
}

@MainActor enum HomeNewsCards {
  struct Model {
    let items: [HomeNewsCard]
    let highlights: [HomeNewsHighlight]
  }

  static func build(_ input: HomeNewsCardInputs, visit: HomeNewsVisit, catalog: HomeNewsCatalog = .bundled) -> Model {
    var sources: [HomeNewsKind: [HomeNewsCard]] = [:]
    func copy(_ key: String) -> String { catalog.message(key, locale: input.locale) }
    if input.activity {
      var random = HomeNewsRandom(seed: visit.seed)
      sources[.insight] = random.shuffled(HomeNewsFacts.insights(input.context.stats))
        .filter { !input.hiddenIDs.contains($0.id) }.map { fact in
          var item = HomeNewsCard(id: fact.id, kind: .insight, icon: insightIcon(fact), text: HomeNewsFormatting.insight(fact, locale: input.locale),
            actionLabel: copy("View profile"), action: .profile)
          if case .weekPrompts(_, let daily, _) = fact { item.sparkline = daily.map(Double.init) }
          return item
        }
    }

    let pool = HomeNewsHighlights.pool(input.releases, currentVersion: input.version)
    sources[.changelog] = HomeNewsHighlights.pick(pool, history: visit.highlightsAtStart, seed: visit.seed ^ 0x9e3779b9)
      .filter { !input.hiddenIDs.contains("changelog:\($0.id)") }.map { highlight in
        HomeNewsCard(id: "changelog:\(highlight.id)", kind: .changelog, icon: highlightIcon(highlight.change.kind),
          text: highlight.headline, caption: HomeNewsFormatting.headlineCaption(highlight, locale: input.locale),
          actionLabel: copy("Show me"), highlight: highlight)
      }

    sources[.announcement] = (input.feed?.selected(now: visit.startedAt, version: input.version, platform: "ios", isFeatureUsed: input.context.isUsed) ?? [])
      .filter { !input.hiddenIDs.contains("remote:\($0.id)") }.prefix(3).compactMap { item in
        var action: HomeNewsCardAction?
        var label: String?
        if let target = item.action {
          switch target.type {
          case .url:
            guard let value = target.url, let url = URL(string: value) else { return nil }
            action = .external(url)
            label = target.label?.resolve(input.locale.identifier) ?? copy("Open")
          case .feature:
            guard let id = target.feature, input.supportedFeatures.contains(id), let feature = catalog.features.first(where: { $0.id == id }) else { return nil }
            action = .feature(id)
            label = HomeNewsCatalog.localized(feature.action, locale: input.locale)
          case .whatsNew: action = .whatsNew; label = copy("What's New")
          }
        }
        let text = item.text?.resolve(input.locale.identifier) ?? item.template.map { HomeNewsFormatting.template($0, locale: input.locale) } ?? ""
        return HomeNewsCard(id: "remote:\(item.id)", kind: .announcement, icon: item.kind == .community ? "heart" : "megaphone", text: text, actionLabel: label, action: action)
      }

    let fresh = newFeatures(input.releases, version: input.version, now: visit.startedAt, known: catalog.featureIDs)
    sources[.discovery] = HomeNewsDiscoveries.pick(catalog.features.filter { input.supportedFeatures.contains($0.id) }, context: input.context,
      history: visit.discoveriesAtStart, hidden: input.hiddenIDs, newFeatures: Set(fresh.keys), now: visit.startedAt, seed: visit.seed ^ 0x27d4eb2f).map { feature in
      var item = HomeNewsCard(id: "discover:\(feature.id)", kind: .discovery, icon: featureIcon(feature.icon),
        text: HomeNewsCatalog.localized(feature.pitch, locale: input.locale), actionLabel: HomeNewsCatalog.localized(feature.action, locale: input.locale), action: .feature(feature.id))
      if let note = fresh[feature.id] {
        item.text = note.change.headline?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? note.change.text
        item.caption = HomeNewsFormatting.text("news.new", locale: input.locale, arguments: [note.version])
      }
      return item
    }

    if input.activity, let fact = HomeNewsFacts.usage(input.usage, disabledProviders: input.disabledUsageProviders, labelFor: { input.usageLabels[$0] }), !input.hiddenIDs.contains(fact.id) {
      let percent = fact.window.usedPercent.rounded().formatted(.number.precision(.fractionLength(0)).locale(input.locale))
      let used = HomeNewsFormatting.text("news.used", locale: input.locale, arguments: [percent])
      let reset = SettingsUsagePresentation.resetCountdown(fact.window.resetsAt,
        now: Date(timeIntervalSince1970: visit.startedAt / 1_000))
      let caption = reset.flatMap { $0 == "now" ? nil : HomeNewsFormatting.text("news.reset", locale: input.locale, arguments: [$0]) }
      sources[.usage] = [HomeNewsCard(id: fact.id, kind: .usage, icon: "gauge.with.dots.needle.50percent",
        text: "\(fact.providerLabel) · \(fact.window.label) · \(used)", caption: caption, actionLabel: copy("Usage"), action: .usage,
        urgent: fact.urgent, usagePercent: fact.window.usedPercent)]
    }

    var tipRandom = HomeNewsRandom(seed: visit.seed ^ 0x85ebca6b)
    sources[.tip] = tipRandom.shuffled(input.tips).filter { !$0.keys.isEmpty && !input.hiddenIDs.contains("tip:\($0.commandID)") }.prefix(2).map { tip in
      HomeNewsCard(id: "tip:\(tip.commandID)", kind: .tip, icon: "keyboard", text: "\(tip.text)  \(tip.keys)", actionLabel: copy("Open"), action: .tip(tip.commandID))
    }
    sources[.promotion] = catalog.promotions.filter { !input.memory.dismissedPromotions.contains($0.id) }.compactMap { promotion in
      guard let url = URL(string: promotion.url), HomeNewsFeed.isAllowedURL(promotion.url) else { return nil }
      let text: String
      let label: String
      switch promotion.id {
      case "github-star": text = copy("Enjoying Poracode? A star helps others find it"); label = copy("Star on GitHub")
      case "x-poracode": text = copy("Release notes and tips, first on X"); label = HomeNewsFormatting.text("news.follow", locale: input.locale, arguments: ["@poracode"])
      case "x-creator": text = copy("Behind the scenes from the person building Poracode"); label = HomeNewsFormatting.text("news.follow", locale: input.locale, arguments: ["@serg_vecher"])
      default: return nil
      }
      return HomeNewsCard(id: "promotion:\(promotion.id)", kind: .promotion, icon: promotion.id == "github-star" ? "star" : "bubble", text: text,
        actionLabel: label, action: .external(url), longDwell: promotion.id != "x-creator")
    }
    var seen = Set<String>()
    let cards = HomeNewsKind.allCases.flatMap { sources[$0] ?? [] }.filter { seen.insert($0.id).inserted }
    let lookup = Dictionary(uniqueKeysWithValues: cards.map { ($0.id, $0) })
    let entries = sources.mapValues { $0.map { HomeNewsPlaylistEntry(id: $0.id, kind: $0.kind, urgent: $0.urgent) } }
    seen.removeAll()
    let items = HomeNewsPlaylist.build(entries, seed: visit.seed ^ 0x7f4a7c15).compactMap { entry -> HomeNewsCard? in
      guard seen.insert(entry.id).inserted else { return nil }
      return lookup[entry.id]
    }
    return Model(items: items, highlights: pool)
  }

  private struct Fresh { let version: String; let change: ChangelogChange }
  private static func newFeatures(_ releases: [ChangelogRelease], version: String, now: Double, known: Set<String>) -> [String: Fresh] {
    var result: [String: Fresh] = [:]
    for release in ChangelogDocument(releases: releases).newestFirst {
      guard ChangelogVersion.compare(release.version, version) <= 0, let date = HomeNewsFeed.instant(release.date), date <= now, now - date <= 30 * 24 * 60 * 60_000 else { continue }
      for change in release.changes {
        guard let id = change.feature, known.contains(id), result[id] == nil else { continue }
        result[id] = Fresh(version: release.version, change: change)
      }
    }
    return result
  }

  private static func insightIcon(_ fact: HomeNewsInsightFact) -> String {
    switch fact { case .streak: "flame"; case .weekPrompts: "chart.xyaxis.line"; case .topModel: "cpu"; case .activeHour: "clock"; case .longestTask: "timer" }
  }
  private static func highlightIcon(_ kind: ChangelogChange.Kind) -> String {
    switch kind { case .added: "plus"; case .improved: "arrow.up"; case .fixed: "wrench" }
  }
  private static func featureIcon(_ token: String) -> String {
    switch token {
    case "Users": "person.2"
    case "Globe": "globe"
    case "MonitorCog", "AppWindow": "macwindow"
    case "Network": "network"
    case "GitBranch": "arrow.triangle.branch"
    case "CalendarClock": "calendar.badge.clock"
    case "GitPullRequest": "arrow.triangle.pull"
    case "Sparkles": "sparkles"
    case "Plug": "powerplug"
    case "Puzzle": "puzzlepiece"
    case "Palette": "paintpalette"
    case "Smartphone": "iphone"
    case "Import": "tray.and.arrow.down"
    case "Layers": "square.stack.3d.up"
    case "GitCommitHorizontal": "arrow.triangle.branch"
    case "Mic": "mic"
    default: "lightbulb"
    }
  }
}

private extension String {
  var nilIfEmpty: String? { isEmpty ? nil : self }
}
