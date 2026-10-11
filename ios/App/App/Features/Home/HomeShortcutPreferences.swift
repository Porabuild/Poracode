import Foundation
import SwiftUI

enum HomeShortcutID: String, CaseIterable, Codable, Identifiable {
  case pullRequests
  case githubActions
  case schedules

  var id: String { rawValue }

  var title: String {
    switch self {
    case .pullRequests:
      PullRequestsStrings.title
    case .githubActions:
      HomeStrings.gitHubActions
    case .schedules:
      RemoteIntegrationsStrings.schedules
    }
  }

  var systemImage: String {
    switch self {
    case .pullRequests:
      "arrow.triangle.pull"
    case .githubActions:
      "point.3.connected.trianglepath.dotted"
    case .schedules:
      "calendar.badge.clock"
    }
  }
}

struct HomeShortcutPreferences: Equatable {
  static let storageKey = "com.poracode.home.shortcuts.v1"
  static let `default` = HomeShortcutPreferences(
    hidden: [.githubActions],
    order: HomeShortcutID.allCases
  )
  static let defaultStorageValue = HomeShortcutPreferences.default.encoded

  var hidden: Set<HomeShortcutID>
  var order: [HomeShortcutID]

  var visible: [HomeShortcutID] {
    order.filter { !hidden.contains($0) }
  }

  init(hidden: Set<HomeShortcutID>, order: [HomeShortcutID]) {
    self.hidden = hidden.intersection(Set(HomeShortcutID.allCases))
    self.order = Self.normalized(order)
  }

  init(storageValue: String) {
    guard
      let data = storageValue.data(using: .utf8),
      let payload = try? JSONDecoder().decode(StoragePayload.self, from: data)
    else {
      self = .default
      return
    }

    self.init(
      hidden: Set(payload.hidden.compactMap(HomeShortcutID.init(rawValue:))),
      order: payload.order.compactMap(HomeShortcutID.init(rawValue:))
    )
  }

  mutating func setVisible(_ visible: Bool, for shortcut: HomeShortcutID) {
    if visible {
      hidden.remove(shortcut)
    } else {
      hidden.insert(shortcut)
    }
  }

  mutating func move(fromOffsets: IndexSet, toOffset: Int) {
    order.move(fromOffsets: fromOffsets, toOffset: toOffset)
  }

  var encoded: String {
    let payload = StoragePayload(
      hidden: HomeShortcutID.allCases.filter(hidden.contains).map(\.rawValue),
      order: order.map(\.rawValue)
    )
    guard let data = try? JSONEncoder().encode(payload) else { return "" }
    return String(decoding: data, as: UTF8.self)
  }

  private static func normalized(_ candidate: [HomeShortcutID]) -> [HomeShortcutID] {
    var seen = Set<HomeShortcutID>()
    var result = candidate.filter { seen.insert($0).inserted }
    result.append(contentsOf: HomeShortcutID.allCases.filter { seen.insert($0).inserted })
    return result
  }

  private struct StoragePayload: Codable {
    let hidden: [String]
    let order: [String]
  }
}

struct HomeShortcutSettingsView: View {
  @AppStorage(HomeShortcutPreferences.storageKey) private var storageValue =
    HomeShortcutPreferences.defaultStorageValue

  var body: some View {
    List {
      Section {
        ForEach(preferences.order) { shortcut in
          Toggle(isOn: visibilityBinding(for: shortcut)) {
            Label(shortcut.title, systemImage: shortcut.systemImage)
          }
        }
        .onMove(perform: move)
      } footer: {
        Text(SettingsUIStrings.homeShortcutsDescription)
      }
    }
    .navigationTitle(SettingsUIStrings.homeShortcuts)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar { EditButton() }
  }

  private var preferences: HomeShortcutPreferences {
    HomeShortcutPreferences(storageValue: storageValue)
  }

  private func visibilityBinding(for shortcut: HomeShortcutID) -> Binding<Bool> {
    Binding(
      get: { !preferences.hidden.contains(shortcut) },
      set: { visible in
        var updated = preferences
        updated.setVisible(visible, for: shortcut)
        storageValue = updated.encoded
      }
    )
  }

  private func move(fromOffsets: IndexSet, toOffset: Int) {
    var updated = preferences
    updated.move(fromOffsets: fromOffsets, toOffset: toOffset)
    storageValue = updated.encoded
  }
}
