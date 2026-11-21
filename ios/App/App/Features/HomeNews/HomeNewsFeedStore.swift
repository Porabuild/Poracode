import Foundation
import Observation

struct HomeNewsCachedFeed: Codable, Sendable {
  let fetchedAt: Double
  let document: Data
}

actor HomeNewsFeedCache {
  private struct Envelope: Codable { let formatVersion: Int; let feed: HomeNewsCachedFeed }
  private struct PublicHeader: Decodable { let version: Int }
  private let storage: VersionedJSONCacheFile
  static let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("PoracodeNews")

  init(directory: URL = HomeNewsFeedCache.directory) {
    storage = VersionedJSONCacheFile(file: directory.appendingPathComponent("feed.json"),
      maximumBytes: 2 * 1_024 * 1_024, formatVersion: 1)
  }

  func read() -> HomeNewsCachedFeed? {
    guard let data = storage.read(), let envelope = try? JSONDecoder().decode(Envelope.self, from: data),
      envelope.formatVersion == 1,
      let header = try? JSONDecoder().decode(PublicHeader.self, from: envelope.feed.document), header.version == 1 else { return nil }
    return envelope.feed
  }

  func write(_ feed: HomeNewsCachedFeed) {
    // First native public-news cache. Preserve future envelopes on downgrade.
    if let bytes = storage.read(), let previous = try? JSONDecoder().decode(Envelope.self, from: bytes) {
      guard let header = try? JSONDecoder().decode(PublicHeader.self, from: previous.feed.document), header.version == 1 else { return }
    }
    guard let data = try? JSONEncoder().encode(Envelope(formatVersion: 1, feed: feed)) else { return }
    storage.write(data)
  }
}

@MainActor @Observable final class HomeNewsFeedStore {
  static let shared = HomeNewsFeedStore()
  static let feedURL = URL(string: "https://poracode.com/news.json")!
  private(set) var feed: HomeNewsFeed?
  private var fetchedAt: Double = 0
  private var failedAt: Double = 0
  @ObservationIgnored private let client: any PublicJSONLoading
  @ObservationIgnored private let cache: HomeNewsFeedCache
  @ObservationIgnored private let featureIDs: Set<String>
  @ObservationIgnored private var hydrated = false
  @ObservationIgnored private var task: Task<Void, Never>?

  init(client: (any PublicJSONLoading)? = nil, cache: HomeNewsFeedCache = HomeNewsFeedCache(), featureIDs: Set<String>? = nil) {
    self.client = client ?? PublicJSONClient(url: Self.defaultURL(), maximumBytes: 1_024 * 1_024)
    self.cache = cache
    self.featureIDs = featureIDs ?? HomeNewsCatalog.bundled.featureIDs
  }

  func refresh(force: Bool = false, now: Double = Date().timeIntervalSince1970 * 1_000) async {
    if let task { await task.value; return }
    let pending = Task {
      defer { self.task = nil }
      if !self.hydrated {
        if let saved = await self.cache.read(),
          let feed = try? HomeNewsFeed.parse(saved.document, knownFeatureIDs: self.featureIDs) {
          self.feed = feed
          self.fetchedAt = min(now, saved.fetchedAt)
        }
        self.hydrated = true
      }
      if !force, now - self.fetchedAt < 6 * 60 * 60_000 || now - self.failedAt < 60 * 60_000 { return }
      do {
        let document = try await self.client.load()
        let feed = try HomeNewsFeed.parse(document, knownFeatureIDs: self.featureIDs)
        self.feed = feed
        self.fetchedAt = now
        await self.cache.write(.init(fetchedAt: now, document: document))
      } catch { self.failedAt = now }
    }
    task = pending
    await pending.value
  }

  private static func defaultURL() -> URL {
    #if DEBUG && targetEnvironment(simulator)
    if ProcessInfo.processInfo.arguments.contains("-native-e2e-fresh-state"),
      let value = ProcessInfo.processInfo.environment["NATIVE_E2E_NEWS_URL"], let url = URL(string: value),
      url.scheme == "http", url.host == "127.0.0.1", url.user == nil, url.password == nil { return url }
    #endif
    return feedURL
  }
}
