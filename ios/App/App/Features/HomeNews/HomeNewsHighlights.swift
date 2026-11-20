import Foundation

struct HomeNewsHighlight: Equatable, Sendable, Identifiable {
  let id: String
  let version: String
  let change: ChangelogChange
  let position: Int
  let total: Int

  var headline: String {
    let headline = change.headline?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return headline.isEmpty ? change.text : headline
  }
}

struct HomeNewsHighlightHistory: Codable, Equatable, Sendable {
  var shown: [String: Int] = [:]
  var retired: [String] = []
}

enum HomeNewsHighlights {
  static func id(version: String, change: ChangelogChange) -> String {
    var hash: UInt32 = 0x811c9dc5
    for unit in ((change.label ?? "") + "\u{0}" + change.text).utf16 {
      hash = (hash ^ UInt32(unit)) &* 0x01000193
    }
    return "\(version):\(String(hash, radix: 36))"
  }

  static func pool(_ releases: [ChangelogRelease], currentVersion: String) -> [HomeNewsHighlight] {
    ChangelogDocument(releases: releases).newestFirst
      .filter { ChangelogVersion.compare($0.version, currentVersion) <= 0 }
      .prefix(3).flatMap { release in
        release.changes.enumerated().map { index, change in
          HomeNewsHighlight(id: id(version: release.version, change: change), version: release.version,
            change: change, position: index + 1, total: release.changes.count)
        }
      }
  }

  static func pick(_ pool: [HomeNewsHighlight], history: HomeNewsHighlightHistory, count: Int = 3, seed: UInt32) -> [HomeNewsHighlight] {
    var random = HomeNewsRandom(seed: seed)
    var versions: [String: Int] = [:]
    for item in pool where versions[item.version] == nil { versions[item.version] = versions.count }
    let retired = Set(history.retired)
    return pool.filter { !retired.contains($0.id) && (history.shown[$0.id] ?? 0) < 2 }
      .map { (item: $0, tie: random.next()) }.sorted {
        let leftCount = history.shown[$0.item.id] ?? 0, rightCount = history.shown[$1.item.id] ?? 0
        if leftCount != rightCount { return leftCount < rightCount }
        let leftVersion = versions[$0.item.version] ?? 0, rightVersion = versions[$1.item.version] ?? 0
        if leftVersion != rightVersion { return leftVersion < rightVersion }
        let leftKind = weight($0.item.change.kind), rightKind = weight($1.item.change.kind)
        if leftKind != rightKind { return leftKind > rightKind }
        return $0.tie < $1.tie
      }.prefix(max(0, count)).map(\.item)
  }

  static func recordShown(_ id: String, poolIDs: Set<String>, history: inout HomeNewsHighlightHistory) {
    history.shown = history.shown.filter { poolIDs.contains($0.key) }
    history.shown[id, default: 0] += 1
    history.retired = history.retired.filter(poolIDs.contains)
  }

  private static func weight(_ kind: ChangelogChange.Kind) -> Int {
    switch kind { case .added: 3; case .improved: 2; case .fixed: 1 }
  }
}
