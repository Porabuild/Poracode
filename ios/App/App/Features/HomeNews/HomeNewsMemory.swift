import Foundation
import Observation

struct HomeNewsDiscoveryRecord: Codable, Equatable, Sendable {
  var count: Int
  var lastShownAt: Double
}

struct HomeNewsMemory: Codable, Equatable, Sendable {
  var highlights = HomeNewsHighlightHistory()
  var discoveries: [String: HomeNewsDiscoveryRecord] = [:]
  var hidden: [String] = []
  var signals: [String] = []
  var dismissedPromotions: [String] = []
}

/// Device-owned reading memory. No host profile data or credentials are persisted.
@MainActor @Observable final class HomeNewsMemoryStore {
  static let shared = HomeNewsMemoryStore()
  // Initial native envelope. Future versions are preserved, never rewritten.
  nonisolated static let storageKey = "com.poracode.home.news.memory.v1"
  nonisolated static let maximumBytes = 256 * 1_024
  private struct Envelope: Codable { let version: Int; var memory: HomeNewsMemory }
  private(set) var value = HomeNewsMemory()
  private(set) var sessionHidden = Set<String>()
  private(set) var canPersist = true
  @ObservationIgnored private let defaults: UserDefaults

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    guard let stored = defaults.object(forKey: Self.storageKey) else { return }
    guard let data = stored as? Data, data.count <= Self.maximumBytes,
      let envelope = try? JSONDecoder().decode(Envelope.self, from: data), envelope.version == 1 else {
      canPersist = false
      return
    }
    value = envelope.memory
    value.hidden = Array(value.hidden.suffix(256))
    value.signals = Array(value.signals.suffix(256))
    value.highlights.shown = value.highlights.shown.mapValues { min(2, max(0, $0)) }
    value.discoveries = value.discoveries.mapValues {
      HomeNewsDiscoveryRecord(count: min(3, max(0, $0.count)), lastShownAt: $0.lastShownAt)
    }
  }

  var hiddenIDs: Set<String> { Set(value.hidden).union(sessionHidden) }

  func hide(_ id: String, forSession: Bool = false) {
    if forSession { sessionHidden.insert(id); return }
    guard !value.hidden.contains(id) else { return }
    value.hidden.append(id)
    value.hidden = Array(value.hidden.suffix(256))
    save()
  }

  func recordSignal(_ signal: String) {
    guard !value.signals.contains(signal) else { return }
    value.signals.append(signal)
    value.signals = Array(value.signals.suffix(256))
    save()
  }

  func recordHighlight(_ id: String, poolIDs: Set<String>) {
    HomeNewsHighlights.recordShown(id, poolIDs: poolIDs, history: &value.highlights)
    save()
  }

  func retireHighlight(_ id: String) {
    guard !value.highlights.retired.contains(id) else { return }
    value.highlights.retired.append(id)
    save()
  }

  func recordDiscovery(_ id: String, now: Double) {
    let previous = value.discoveries[id]?.count ?? 0
    value.discoveries[id] = .init(count: min(3, previous + 1), lastShownAt: now)
    save()
  }

  func dismissPromotion(_ id: String) {
    guard !value.dismissedPromotions.contains(id) else { return }
    value.dismissedPromotions.append(id)
    save()
  }

  private func save() {
    guard canPersist, let data = try? JSONEncoder().encode(Envelope(version: 1, memory: value)),
      data.count <= Self.maximumBytes else { return }
    defaults.set(data, forKey: Self.storageKey)
  }
}

enum HomeNewsPreferences {
  // These are UI preferences, like the browser's localStorage keys. Keep them
  // outside remote-editable host settings; host data remains read-only here.
  static let enabledKey = "com.poracode.home.news.enabled.v1"
  static let activityKey = "com.poracode.home.news.activity.v1"
}
