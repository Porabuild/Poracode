import Foundation

/// The unchanged public document consumed by the PWA's shared/changelog.ts.
/// Unknown additive keys are ignored; malformed known fields reject the document.
struct ChangelogDocument: Codable, Equatable, Sendable {
  let releases: [ChangelogRelease]

  static let maximumBytes = 8 * 1024 * 1024

  static func parse(_ data: Data) throws -> Self {
    guard data.count <= maximumBytes else { throw ChangelogFailure.invalidDocument }
    return try JSONDecoder().decode(Self.self, from: data)
  }

  var newestFirst: [ChangelogRelease] {
    releases.enumerated().sorted {
      let order = ChangelogVersion.compare($0.element.version, $1.element.version)
      return order == 0 ? $0.offset < $1.offset : order > 0
    }.map(\.element)
  }
}

struct ChangelogRelease: Codable, Equatable, Sendable {
  let version: String
  let date: String
  let title: String
  let tagline: String?
  let summary: String
  let changes: [ChangelogChange]

  private enum CodingKeys: String, CodingKey { case version, date, title, tagline, summary, changes }

  init(from decoder: any Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    version = try values.decode(String.self, forKey: .version)
    date = try values.decode(String.self, forKey: .date)
    title = try values.decode(String.self, forKey: .title)
    summary = try values.decode(String.self, forKey: .summary)
    changes = try values.decode([ChangelogChange].self, forKey: .changes)
    // Optional means absent, not null, matching the public Zod schema.
    tagline = values.contains(.tagline) ? try values.decode(String.self, forKey: .tagline) : nil
    if let tagline, tagline.range(of: #"^\S+ \S+$"#, options: .regularExpression) == nil {
      throw ChangelogFailure.invalidDocument
    }
  }

  /// Parse a calendar day in the current zone, avoiding UTC-midnight date drift.
  func calendarDate(timeZone: TimeZone = .autoupdatingCurrent) -> Date? {
    let parts = date.split(separator: "-", omittingEmptySubsequences: false)
    guard parts.count == 3, parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
      let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]) else { return nil }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    let components = DateComponents(year: year, month: month, day: day)
    guard let result = calendar.date(from: components) else { return nil }
    let checked = calendar.dateComponents([.year, .month, .day], from: result)
    guard checked.year == year, checked.month == month, checked.day == day else { return nil }
    return result
  }
}

struct ChangelogChange: Codable, Equatable, Sendable {
  enum Kind: String, Codable, CaseIterable, Sendable { case added, improved, fixed }
  let kind: Kind
  let label: String?
  let text: String
  let headline: String?
  let feature: String?

  private enum CodingKeys: String, CodingKey { case kind, label, text, headline, feature }

  init(from decoder: any Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    kind = try values.decode(Kind.self, forKey: .kind)
    text = try values.decode(String.self, forKey: .text)
    label = values.contains(.label) ? try values.decode(String.self, forKey: .label) : nil
    headline = values.contains(.headline) ? try values.decode(String.self, forKey: .headline) : nil
    feature = values.contains(.feature) ? try values.decode(String.self, forKey: .feature) : nil
  }
}

enum ChangelogVersion {
  /// Matches the PWA's permissive numeric-core comparison, including old notes.
  static func compare(_ first: String, _ second: String) -> Int {
    let a = segments(first), b = segments(second)
    for index in 0..<max(a.count, b.count) {
      let left = index < a.count ? a[index] : 0, right = index < b.count ? b[index] : 0
      if left != right { return left > right ? 1 : -1 }
    }
    return 0
  }

  private static func segments(_ value: String) -> [Double] {
    var core = value.trimmingCharacters(in: .whitespacesAndNewlines)
    if core.first == "v" || core.first == "V" { core.removeFirst() }
    core = String(core.prefix { $0 != "-" && $0 != "+" })
    return core.split(separator: ".", omittingEmptySubsequences: false).map {
      let digits = $0.trimmingCharacters(in: .whitespacesAndNewlines).utf8.prefix { (48...57).contains($0) }
      guard let number = Double(String(decoding: digits, as: UTF8.self)), number.isFinite else { return 0 }
      return number
    }
  }
}

enum ChangelogFailure: Error, Equatable { case invalidDocument, response }
