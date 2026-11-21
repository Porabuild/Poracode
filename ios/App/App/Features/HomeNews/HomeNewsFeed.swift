import Foundation

enum HomeNewsFailure: Error { case invalidDocument, response }

private let newsLocaleOrderKey = CodingUserInfoKey(rawValue: "home-news-locale-order")!
private let newsFeatureIDsKey = CodingUserInfoKey(rawValue: "home-news-feature-ids")!

struct HomeNewsLocalizedText: Decodable, Equatable, Sendable {
  struct Entry: Equatable, Sendable { let locale: String; var text: String }
  let entries: [Entry]

  init(from decoder: any Decoder) throws {
    let values = try [String: String](from: decoder)
    let path = decoder.codingPath.map(\.stringValue).joined(separator: ".")
    let orders = decoder.userInfo[newsLocaleOrderKey] as? [String: [String]] ?? [:]
    let keys = orders[path] ?? values.keys.sorted()
    var result: [Entry] = []
    for key in keys {
      guard let raw = values[key] else { continue }
      let clean = raw.unicodeScalars.map { $0.properties.generalCategory == .control ? " " : String($0) }
        .joined().replacingOccurrences(of: "\u{feff}", with: " ")
        .split(whereSeparator: \.isWhitespace).joined(separator: " ")
      let maximum = decoder.codingPath.last?.stringValue == "label" ? 32 : 140
      guard !clean.isEmpty, clean.utf16.count <= maximum else { continue }
      let locale = key.lowercased()
      if let index = result.firstIndex(where: { $0.locale == locale }) { result[index].text = clean }
      else { result.append(.init(locale: locale, text: clean)) }
    }
    guard result.contains(where: { $0.locale == "en" }) else { throw HomeNewsFailure.invalidDocument }
    entries = result
  }

  func resolve(_ locale: String) -> String {
    let normalized = locale.lowercased().replacingOccurrences(of: "_", with: "-")
    let language = normalized.split(separator: "-").first.map(String.init) ?? normalized
    return entries.first { $0.locale == normalized }?.text
      ?? entries.first { $0.locale.split(separator: "-").first.map(String.init) == language }?.text
      ?? entries.first { $0.locale == "en" }?.text ?? ""
  }
}

struct HomeNewsFeedTemplate: Decodable, Equatable, Sendable {
  enum Name: String, Decodable, Sendable { case stars = "github-stars-milestone", issues = "good-first-issues" }
  let name: Name
  let count: Int64
}

struct HomeNewsFeedAction: Decodable, Equatable, Sendable {
  enum Kind: String, Decodable, Sendable { case url, feature; case whatsNew = "whats-new" }
  let type: Kind
  var url: String? = nil
  var feature: String? = nil
  var label: HomeNewsLocalizedText? = nil
  private enum CodingKeys: String, CodingKey { case type, url, feature, label }

  init(from decoder: any Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    type = try values.decode(Kind.self, forKey: .type)
    switch type {
    case .url:
      let value = try values.decode(String.self, forKey: .url)
      guard HomeNewsFeed.isAllowedURL(value) else { throw HomeNewsFailure.invalidDocument }
      url = value
      label = try values.newsOptional(HomeNewsLocalizedText.self, forKey: .label)
    case .feature:
      let value = try values.decode(String.self, forKey: .feature)
      guard (decoder.userInfo[newsFeatureIDsKey] as? Set<String>)?.contains(value) == true else { throw HomeNewsFailure.invalidDocument }
      feature = value
    case .whatsNew: break
    }
  }
}

struct HomeNewsFeedItem: Decodable, Equatable, Sendable {
  enum Kind: String, Decodable, Sendable { case announcement, community }
  let id: String
  let kind: Kind
  let text: HomeNewsLocalizedText?
  let template: HomeNewsFeedTemplate?
  let action: HomeNewsFeedAction?
  let start: String?
  let end: String?
  let minAppVersion: String?
  let maxAppVersion: String?
  let platforms: [String]?
  let unlessUsed: [String]?
  let onlyIfUsed: [String]?
  let weight: Int?
  private enum CodingKeys: String, CodingKey {
    case id, kind, text, template, action, start, end, minAppVersion, maxAppVersion, platforms, unlessUsed, onlyIfUsed, weight
  }

  init(from decoder: any Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    id = try values.decode(String.self, forKey: .id)
    guard id.range(of: #"^[a-z0-9][a-z0-9-]{1,63}$"#, options: .regularExpression) != nil else { throw HomeNewsFailure.invalidDocument }
    kind = try values.decode(Kind.self, forKey: .kind)
    text = try values.newsOptional(HomeNewsLocalizedText.self, forKey: .text)
    template = try values.newsOptional(HomeNewsFeedTemplate.self, forKey: .template)
    guard (text == nil) != (template == nil) else { throw HomeNewsFailure.invalidDocument }
    if let template { guard template.count > 0, template.count <= 9_007_199_254_740_991 else { throw HomeNewsFailure.invalidDocument } }
    action = try values.newsOptional(HomeNewsFeedAction.self, forKey: .action)
    start = try values.newsOptional(String.self, forKey: .start)
    end = try values.newsOptional(String.self, forKey: .end)
    for date in [start, end].compactMap({ $0 }) { guard HomeNewsFeed.instant(date) != nil else { throw HomeNewsFailure.invalidDocument } }
    minAppVersion = try values.newsOptional(String.self, forKey: .minAppVersion)
    maxAppVersion = try values.newsOptional(String.self, forKey: .maxAppVersion)
    platforms = try values.newsOptional([String].self, forKey: .platforms)
    if let platforms, !platforms.allSatisfy({ ["darwin", "win32", "linux", "web", "ios"].contains($0) }) { throw HomeNewsFailure.invalidDocument }
    unlessUsed = try values.newsOptional([String].self, forKey: .unlessUsed)
    onlyIfUsed = try values.newsOptional([String].self, forKey: .onlyIfUsed)
    weight = try values.newsOptional(Int.self, forKey: .weight)
    if let weight, !(1...5).contains(weight) { throw HomeNewsFailure.invalidDocument }
  }
}

struct HomeNewsFeed: Equatable, Sendable {
  let paused: Bool
  let items: [HomeNewsFeedItem]
  let knownFeatureIDs: Set<String>

  private struct Envelope: Decodable {
    let version: Int
    let paused: Bool?
    let items: [JSONValue]
    private enum CodingKeys: String, CodingKey { case version, paused, items }
    init(from decoder: any Decoder) throws {
      let values = try decoder.container(keyedBy: CodingKeys.self)
      version = try values.decode(Int.self, forKey: .version)
      paused = try values.newsOptional(Bool.self, forKey: .paused)
      items = try values.decode([JSONValue].self, forKey: .items)
    }
  }

  static func parse(_ data: Data, knownFeatureIDs: Set<String>) throws -> Self {
    guard data.count <= 1_024 * 1_024 else { throw HomeNewsFailure.invalidDocument }
    let envelope = try JSONDecoder().decode(Envelope.self, from: data)
    guard envelope.version == 1 else { throw HomeNewsFailure.invalidDocument }
    let orders = try HomeNewsLocaleOrder(data: data).objects
    var seen = Set<String>()
    var items: [HomeNewsFeedItem] = []
    for (index, candidate) in envelope.items.prefix(50).enumerated() {
      let decoder = JSONDecoder()
      decoder.userInfo[newsFeatureIDsKey] = knownFeatureIDs
      decoder.userInfo[newsLocaleOrderKey] = ["text": orders["items[\(index)].text"] ?? [], "action.label": orders["items[\(index)].action.label"] ?? []]
      guard let encoded = try? JSONEncoder().encode(candidate),
        let item = try? decoder.decode(HomeNewsFeedItem.self, from: encoded), seen.insert(item.id).inserted else { continue }
      items.append(item)
    }
    return Self(paused: envelope.paused == true, items: items, knownFeatureIDs: knownFeatureIDs)
  }

  func selected(now: Double, version: String, platform: String, isFeatureUsed: (String) -> Bool?) -> [HomeNewsFeedItem] {
    guard !paused else { return [] }
    func condition(_ ids: [String]?, used: Bool) -> Bool {
      (ids ?? []).allSatisfy { knownFeatureIDs.contains($0) && isFeatureUsed($0) == used }
    }
    return items.enumerated().filter { _, item in
      if let start = item.start, let date = Self.instant(start), date > now { return false }
      if let end = item.end, let date = Self.instant(end), date <= now { return false }
      if let minimum = item.minAppVersion, ChangelogVersion.compare(version, minimum) < 0 { return false }
      if let maximum = item.maxAppVersion, ChangelogVersion.compare(version, maximum) > 0 { return false }
      if let platforms = item.platforms, !platforms.contains(platform) { return false }
      return condition(item.unlessUsed, used: false) && condition(item.onlyIfUsed, used: true)
    }.sorted {
      let left = $0.element.weight ?? 1, right = $1.element.weight ?? 1
      return left == right ? $0.offset < $1.offset : left > right
    }.map(\.element)
  }

  static func isAllowedURL(_ value: String) -> Bool {
    guard let url = URL(string: value)?.standardized,
      let components = URLComponents(url: url, resolvingAgainstBaseURL: true), components.scheme?.lowercased() == "https",
      (components.user ?? "").isEmpty, (components.password ?? "").isEmpty,
      let host = components.host?.lowercased(), ["poracode.com", "www.poracode.com", "x.com", "github.com"].contains(host) else { return false }
    if host == "github.com" {
      let path = components.percentEncodedPath.lowercased()
      guard path.hasPrefix("/porabuild/"), !path.contains("%5c") else { return false }
      if path.split(separator: "/").contains(where: {
        let decoded = String($0).removingPercentEncoding ?? String($0)
        return decoded == "." || decoded == ".." || decoded.contains("\\")
      }) { return false }
    }
    return true
  }

  static func instant(_ value: String) -> Double? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: value) { return date.timeIntervalSince1970 * 1_000 }
    formatter.formatOptions = [.withInternetDateTime]
    if let date = formatter.date(from: value) { return date.timeIntervalSince1970 * 1_000 }
    formatter.formatOptions = [.withFullDate]
    return formatter.date(from: value).map { $0.timeIntervalSince1970 * 1_000 }
  }
}

private extension KeyedDecodingContainer {
  func newsOptional<T: Decodable>(_ type: T.Type, forKey key: Key) throws -> T? {
    contains(key) ? try decode(type, forKey: key) : nil
  }
}
