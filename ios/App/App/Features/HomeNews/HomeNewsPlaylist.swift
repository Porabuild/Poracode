import Foundation

enum HomeNewsKind: String, Codable, CaseIterable, Sendable {
  case insight, changelog, announcement, discovery, usage, tip, promotion
}

struct HomeNewsPlaylistEntry: Codable, Equatable, Sendable, Identifiable {
  let id: String
  let kind: HomeNewsKind
  var urgent: Bool? = nil
}

/// The PWA's mulberry32 visit generator; wrapping arithmetic is intentional.
struct HomeNewsRandom {
  private var state: UInt32
  init(seed: UInt32) { state = seed }

  mutating func next() -> Double {
    state &+= 0x6d2b79f5
    var value = (state ^ (state >> 15)) &* (state | 1)
    value ^= value &+ ((value ^ (value >> 7)) &* (value | 61))
    return Double(value ^ (value >> 14)) / 4_294_967_296
  }

  mutating func shuffled<T>(_ items: [T]) -> [T] {
    guard items.count > 1 else { return items }
    var copy = items
    for index in stride(from: copy.count - 1, through: 1, by: -1) {
      let other = Int(next() * Double(index + 1))
      copy.swapAt(index, other)
    }
    return copy
  }
}

enum HomeNewsPlaylist {
  static let maximumItems = 12
  static let promotionSpacing = 4
  private struct RankedQueue {
    let items: [HomeNewsPlaylistEntry]
    let rank: Double
    let index: Int
  }

  /// Source order and random draws match newsPlaylist.ts, including empty sources.
  static func build(_ sources: [HomeNewsKind: [HomeNewsPlaylistEntry]], seed: UInt32) -> [HomeNewsPlaylistEntry] {
    var random = HomeNewsRandom(seed: seed)
    let usage = sources[.usage] ?? []
    let kinds: [HomeNewsKind] = [.insight, .changelog, .announcement, .discovery, .tip, .usage]
    var ranked: [RankedQueue] = []
    for (index, kind) in kinds.enumerated() {
      let rank = random.next()
      let items = kind == .usage ? usage.filter { $0.urgent != true } : sources[kind] ?? []
      if !items.isEmpty { ranked.append(.init(items: items, rank: rank, index: index)) }
    }
    ranked.sort {
      $0.rank == $1.rank ? $0.index < $1.index : $0.rank < $1.rank
    }
    var queues = ranked.map(\.items)
    var base = usage.filter { $0.urgent == true }
    while base.count < maximumItems, queues.contains(where: { !$0.isEmpty }) {
      for index in queues.indices where !queues[index].isEmpty && base.count < maximumItems {
        base.append(queues[index].removeFirst())
      }
    }
    var promotions = random.shuffled(sources[.promotion] ?? [])
    guard !base.isEmpty else { return promotions }
    var result: [HomeNewsPlaylistEntry] = []
    var sincePromotion = 0
    for (index, entry) in base.enumerated() {
      result.append(entry)
      sincePromotion += 1
      if !promotions.isEmpty, index == 0 || sincePromotion >= promotionSpacing {
        result.append(promotions.removeFirst())
        sincePromotion = 0
      }
    }
    return result
  }
}
