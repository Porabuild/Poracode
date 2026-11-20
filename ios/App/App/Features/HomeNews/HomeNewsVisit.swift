import Foundation
import Observation

enum HomeNewsCardAction: Equatable, Sendable {
  case feature(String), profile, usage, tip(String), external(URL), whatsNew
}

struct HomeNewsCard: Equatable, Sendable, Identifiable {
  let id: String
  let kind: HomeNewsKind
  let icon: String
  var text: String
  var caption: String? = nil
  var actionLabel: String? = nil
  var action: HomeNewsCardAction? = nil
  var highlight: HomeNewsHighlight? = nil
  var urgent = false
  var longDwell = false
  var usagePercent: Double? = nil
  var sparkline: [Double] = []
}

/// One draft's visit survives layout replacement. Showing memory is captured
/// once so counting a showing does not reshuffle the visit's choices.
@MainActor @Observable final class HomeNewsVisit {
  let seed: UInt32
  let startedAt: Double
  let highlightsAtStart: HomeNewsHighlightHistory
  let discoveriesAtStart: [String: HomeNewsDiscoveryRecord]
  var userPaused = false
  private(set) var currentID: String?
  private(set) var index = 0
  private(set) var isTyping = false
  private(set) var typingUntil = Date.distantPast
  private var counted = Set<String>()

  init(seed: UInt32 = .random(in: .min ... .max), startedAt: Double = Date().timeIntervalSince1970 * 1_000,
    memory: HomeNewsMemory = HomeNewsMemoryStore.shared.value) {
    self.seed = seed
    self.startedAt = startedAt
    highlightsAtStart = memory.highlights
    discoveriesAtStart = memory.discoveries
  }

  func resolvedIndex(_ items: [HomeNewsCard]) -> Int {
    if let currentID, let found = items.firstIndex(where: { $0.id == currentID }) { return found }
    return min(index, max(0, items.count - 1))
  }

  func show(_ item: HomeNewsCard, index: Int, poolIDs: Set<String>, memory: HomeNewsMemoryStore) {
    currentID = item.id
    self.index = index
    guard counted.insert(item.id).inserted else { return }
    if let highlight = item.highlight { memory.recordHighlight(highlight.id, poolIDs: poolIDs) }
    if item.id.hasPrefix("discover:") { memory.recordDiscovery(String(item.id.dropFirst("discover:".count)), now: Date().timeIntervalSince1970 * 1_000) }
  }

  func step(_ delta: Int, items: [HomeNewsCard]) {
    guard !items.isEmpty else { return }
    let next = (resolvedIndex(items) + delta % items.count + items.count) % items.count
    currentID = items[next].id
    index = next
  }

  func noteTyping(now: Date = Date()) {
    isTyping = true
    typingUntil = now.addingTimeInterval(15)
  }

  func finishTyping(expected: Date) {
    guard typingUntil == expected else { return }
    isTyping = false
  }
}
