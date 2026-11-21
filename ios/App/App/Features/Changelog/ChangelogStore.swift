import Foundation
import Observation

/// Device-owned public content shared by native windows. Navigation and host
/// changes cannot cancel/replay an in-flight read or replace it with host data.
@MainActor @Observable final class ChangelogStore {
  enum State: Equatable { case idle, loading, loaded, failed }
  static let shared = ChangelogStore()
  private(set) var releases: [ChangelogRelease] = []
  private(set) var state = State.idle
  var isLoading: Bool { state == .loading }
  var refreshFailed: Bool { state == .failed }
  @ObservationIgnored private let client: any ChangelogLoading
  @ObservationIgnored private let cache: any ChangelogCaching
  @ObservationIgnored private var hydrated = false
  @ObservationIgnored private var task: Task<Void, Never>?

  init(client: any ChangelogLoading = ChangelogHTTPClient.makeDefault(),
    cache: any ChangelogCaching = ChangelogDiskCache()) {
    self.client = client
    self.cache = cache
  }

  func refresh() async {
    if let task { await task.value; return }
    let pending = Task {
      self.state = .loading
      defer { self.task = nil }
      if !self.hydrated {
        if let saved = await self.cache.read() { self.releases = saved.newestFirst }
        self.hydrated = true
      }
      do {
        let document = try await self.client.load()
        self.releases = document.newestFirst
        await self.cache.write(document)
        self.state = .loaded
      } catch {
        // Cached notes remain readable offline and after malformed responses.
        self.state = .failed
      }
    }
    task = pending
    await pending.value
  }
}
