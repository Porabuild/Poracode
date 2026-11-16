import XCTest
@testable import App

final class HomeNewsRulesTests: XCTestCase {
  private struct Fixture: Decodable {
    struct RandomCase: Decodable { let seed: UInt32; let values: [Double]; let shuffled: [String] }
    struct PlaylistCase: Decodable { let seed: UInt32; let sources: [String: [HomeNewsPlaylistEntry]]; let expected: [String] }
    struct StatsCase: Decodable { let input: SettingsProfileCoreStats; let expected: [ExpectedFact] }
    struct ExpectedFact: Decodable {
      let id: String
      var current: Int64?; var longest: Int64?; var prompts: Int64?; var daily: [Int64]?
      var busiestDay: String?; var label: String?; var percent: Double?; var hour: Int64?; var minutes: Int64?
      var fact: HomeNewsInsightFact? {
        switch id {
        case "insight:streak": .streak(current: current!, longest: longest!)
        case "insight:week-prompts": .weekPrompts(prompts: prompts!, daily: daily!, busiestDay: busiestDay)
        case "insight:top-model": .topModel(label: label!, percent: percent!)
        case "insight:active-hour": .activeHour(hour!)
        case "insight:longest-task": .longestTask(minutes: minutes!)
        default: nil
        }
      }
    }
    struct Highlights: Decodable {
      struct Pick: Decodable { let history: HomeNewsHighlightHistory; let seed: UInt32; let expected: [String] }
      let releases: [ChangelogRelease]; let currentVersion: String
      let expectedPool: [ExpectedHighlight]; let cases: [Pick]
    }
    struct ExpectedHighlight: Decodable { let id: String; let position: Int; let total: Int }
    let randomCases: [RandomCase]
    let playlists: [PlaylistCase]
    let stats: [StatsCase]
    let highlights: Highlights
  }

  func testVisitRandomnessAndShuffleMatchPWAUnsignedArithmetic() throws {
    for sample in try fixture().randomCases {
      var random = HomeNewsRandom(seed: sample.seed)
      XCTAssertEqual(sample.values.map { _ in random.next() }, sample.values)
      random = HomeNewsRandom(seed: sample.seed)
      XCTAssertEqual(random.shuffled(["a", "b", "c", "d", "e"]), sample.shuffled)
    }
  }

  func testPlaylistMatchesPWASourceRankingUrgencyAndPromotionSpacing() throws {
    for sample in try fixture().playlists {
      let kinds: [String: HomeNewsKind] = ["insights": .insight, "changelog": .changelog, "announcements": .announcement,
        "discovery": .discovery, "usage": .usage, "tips": .tip, "promotions": .promotion]
      let sources = Dictionary(uniqueKeysWithValues: sample.sources.compactMap { key, value in
        kinds[key].map { ($0, value) }
      })
      XCTAssertEqual(HomeNewsPlaylist.build(sources, seed: sample.seed).map(\.id), sample.expected)
    }
  }

  func testPersonalFactsMatchPWAThresholdsRoundingAndFirstBusiestDayTie() throws {
    XCTAssertTrue(HomeNewsFacts.insights(nil).isEmpty)
    for sample in try fixture().stats {
      XCTAssertEqual(HomeNewsFacts.insights(sample.input), sample.expected.compactMap(\.fact))
    }
  }

  func testHighlightIDsAndSelectionMatchPWAUnicodeAndRetirementHistory() throws {
    let sample = try fixture().highlights
    let pool = HomeNewsHighlights.pool(sample.releases, currentVersion: sample.currentVersion)
    XCTAssertEqual(pool.map(\.id), sample.expectedPool.map(\.id))
    XCTAssertEqual(pool.map(\.position), sample.expectedPool.map(\.position))
    XCTAssertEqual(pool.map(\.total), sample.expectedPool.map(\.total))
    for pick in sample.cases {
      XCTAssertEqual(HomeNewsHighlights.pick(pool, history: pick.history, seed: pick.seed).map(\.id), pick.expected)
    }
  }

  @MainActor func testAssembledCardsLeadWithQuotaAndExcludeAllPersonalFactsWhenDisabled() throws {
    let usage = try JSONDecoder().decode(SettingsProviderUsage.self, from: Data(#"{"fromCache":false,"snapshots":[{"providerId":"claude","status":"ok","fetchedAt":1000000000,"windows":[{"id":"weekly","label":"Weekly","usedPercent":93,"resetsAt":1003600000}]}]}"#.utf8))
    var context = HomeNewsFeatureContext()
    context.stats = try fixture().stats[1].input
    let catalog = HomeNewsCatalog.bundled
    let labels = Dictionary(uniqueKeysWithValues: catalog.usageProviders.map { ($0.id, $0.label) })
    let visit = HomeNewsVisit(seed: 1, startedAt: 1_000_000_000, memory: HomeNewsMemory())
    func build(activity: Bool) throws -> HomeNewsCards.Model {
      HomeNewsCards.build(.init(context: context, usage: usage.snapshots, disabledUsageProviders: [], usageLabels: labels,
        releases: try fixture().highlights.releases, feed: nil, memory: HomeNewsMemory(), hiddenIDs: [],
        supportedFeatures: [], tips: [], version: "99.0.0", locale: Locale(identifier: "en"), activity: activity), visit: visit)
    }
    let model = try build(activity: true)
    XCTAssertEqual(model.items.first?.id, "usage:claude:weekly")
    XCTAssertTrue(model.items.first?.text.contains("93%") == true)
    XCTAssertTrue(model.items.contains { $0.id == "insight:streak" })
    let filtered = try build(activity: false)
    XCTAssertFalse(filtered.items.contains { $0.kind == .insight || $0.kind == .usage })
    XCTAssertFalse(filtered.items.isEmpty, "Turning off personal facts must retain public news")
  }

  private func fixture() throws -> Fixture {
    try ProjectFixtureLoader.decode(Fixture.self, named: "client-news-rules.json")
  }
}
