import Foundation
import SwiftUI

enum HomeShortcutID: RawRepresentable, CaseIterable, Codable, Identifiable, Hashable, Sendable {
  case pullRequests, githubActions, schedules
  case settings(DeviceSettingsDestination)

  static let core: [Self] = [.pullRequests, .githubActions, .schedules]
  static var allCases: [Self] { core + DeviceSettingsDestination.allCases.map(Self.settings) }
  var id: String { rawValue }

  var rawValue: String {
    switch self {
    case .pullRequests: "pullRequests"
    case .githubActions: "githubActions"
    case .schedules: "schedules"
    case .settings(let destination): "settings:\(destination.rawValue)"
    }
  }

  init?(rawValue: String) {
    switch rawValue {
    case "pullRequests": self = .pullRequests
    case "githubActions": self = .githubActions
    case "schedules": self = .schedules
    default:
      guard rawValue.hasPrefix("settings:"),
        let destination = DeviceSettingsDestination(rawValue: String(rawValue.dropFirst("settings:".count))) else { return nil }
      self = .settings(destination)
    }
  }

  init(from decoder: any Decoder) throws {
    let container = try decoder.singleValueContainer()
    let value = try container.decode(String.self)
    guard let decoded = Self(rawValue: value) else {
      throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unknown shortcut.")
    }
    self = decoded
  }

  func encode(to encoder: any Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(rawValue)
  }

  var title: String {
    switch self {
    case .pullRequests: PullRequestsStrings.title
    case .githubActions: HomeStrings.gitHubActions
    case .schedules: RemoteIntegrationsStrings.schedules
    case .settings(let destination): destination.title
    }
  }

  var systemImage: String {
    switch self {
    case .pullRequests: "arrow.triangle.pull"
    case .githubActions: "point.3.connected.trianglepath.dotted"
    case .schedules: "calendar.badge.clock"
    case .settings(let destination): destination.systemImage
    }
  }
}

struct HomeShortcutPreferences: Equatable {
  // Still the v1 string-array shape. Old three-shortcut payloads retain their
  // visibility; new Settings choices start hidden. Unknown future IDs survive edits.
  static let storageKey = "com.poracode.home.shortcuts.v1"
  static let `default` = HomeShortcutPreferences(hidden: [.githubActions], order: HomeShortcutID.core)
  static let defaultStorageValue = HomeShortcutPreferences.default.encoded

  private var storedHidden: Set<String>
  private var storedOrder: [String]

  var hidden: Set<HomeShortcutID> { Set(storedHidden.compactMap(HomeShortcutID.init(rawValue:))) }
  var order: [HomeShortcutID] { storedOrder.compactMap(HomeShortcutID.init(rawValue:)) }
  var visible: [HomeShortcutID] { order.filter { !storedHidden.contains($0.rawValue) } }

  /// Hidden pins remain reachable in More; unpinned Settings pages stay in Settings.
  var moreEntries: [HomeShortcutID] {
    order.filter { HomeShortcutID.core.contains($0) || !storedHidden.contains($0.rawValue) }
  }

  init(hidden: Set<HomeShortcutID>, order: [HomeShortcutID]) {
    self.init(payload: StoragePayload(hidden: hidden.map(\.rawValue), order: order.map(\.rawValue)))
  }

  init(storageValue: String) {
    guard let data = storageValue.data(using: .utf8),
      let payload = try? JSONDecoder().decode(StoragePayload.self, from: data) else {
      self = .default
      return
    }
    self.init(payload: payload)
  }

  private init(payload: StoragePayload) {
    var seen = Set<String>()
    storedOrder = payload.order.filter { seen.insert($0).inserted }
    storedHidden = Set(payload.hidden)
    for shortcut in HomeShortcutID.allCases where seen.insert(shortcut.rawValue).inserted {
      storedOrder.append(shortcut.rawValue)
      if case .settings = shortcut { storedHidden.insert(shortcut.rawValue) }
    }
  }

  mutating func setVisible(_ visible: Bool, for shortcut: HomeShortcutID) {
    if visible { storedHidden.remove(shortcut.rawValue) }
    else { storedHidden.insert(shortcut.rawValue) }
  }

  mutating func setAllVisible(_ visible: Bool) {
    let knownIDs = order.map(\.rawValue)
    if visible { storedHidden.subtract(knownIDs) }
    else { storedHidden.formUnion(knownIDs) }
  }

  mutating func move(fromOffsets: IndexSet, toOffset: Int) {
    var knownOrder = order
    knownOrder.move(fromOffsets: fromOffsets, toOffset: toOffset)
    var iterator = knownOrder.makeIterator()
    // Keep unavailable/future destinations in their original slots, as the PWA does.
    storedOrder = storedOrder.map { id in
      guard HomeShortcutID(rawValue: id) != nil else { return id }
      return iterator.next()?.rawValue ?? id
    }
  }

  var encoded: String {
    let payload = StoragePayload(hidden: storedHidden.sorted(), order: storedOrder)
    guard let data = try? JSONEncoder().encode(payload) else { return "" }
    return String(decoding: data, as: UTF8.self)
  }

  private struct StoragePayload: Codable {
    let hidden: [String]
    let order: [String]
  }
}
