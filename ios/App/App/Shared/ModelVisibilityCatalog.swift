import Foundation

/// Client-only settings projection, matching the PWA's modelVisibilityCatalog.
/// Exact advertised IDs remain the preference authority, including all family members.
struct ModelVisibilityTarget: Equatable {
  let key: String
  let modelIDs: [String]
}

struct ModelVisibilityRow: Identifiable, Equatable {
  let id: String
  let label: String
  var detail: String?
  var groupID: String?
  var groupLabel: String?
  let isFamily: Bool
  var badges: [String] = []
  var targets: [ModelVisibilityTarget]
  var searchText: String

  func matches(_ query: String) -> Bool {
    query.split(whereSeparator: \.isWhitespace).allSatisfy {
      searchText.localizedStandardContains(String($0))
    }
  }
}

struct ModelVisibilitySurface: Identifiable, Equatable {
  let id: String
  let label: String
  let mode: ThreadPresentationMode
  let key: String
  let capabilities: [String: JSONValue]
  let rows: [ModelVisibilityRow]
}

struct ModelVisibilityGroup: Identifiable, Equatable {
  let id: String
  let label: String
  let surfaces: [ModelVisibilitySurface]
  let rows: [ModelVisibilityRow]
}

enum ModelVisibilityCheckState {
  case all, some, none
}

struct ModelVisibilityCatalog: Equatable {
  let groups: [ModelVisibilityGroup]
  var rows: [ModelVisibilityRow] { groups.flatMap(\.rows) }

  init(agents: [AgentStatusRecord], providerOrder: [String] = []) {
    var seen = Set<String>()
    groups = ComposerProviderCatalog.ordered(agents.filter { $0.installed && seen.insert($0.kind).inserted },
      providerOrder: providerOrder).compactMap { agent in
      let surfaces = ModelVisibilitySurfaceBuilder.surfaces(agent)
      guard !surfaces.isEmpty else { return nil }
      return .init(id: agent.kind, label: agent.label, surfaces: surfaces,
        rows: ModelVisibilityRows.unified(surfaces))
    }
  }

  /// Shared keys union defaults, except IDs another surface explicitly shows.
  /// A saved empty list is authoritative; unrelated/retired IDs survive row edits.
  func effectiveHidden(saved: [String: [String]]) -> [String: Set<String>] {
    let surfaces = Dictionary(grouping: groups.flatMap(\.surfaces), by: \.key)
    return surfaces.mapValues { values in
      if let key = values.first?.key, let saved = saved[key] { return Set(saved) }
      var hidden = Set<String>(), visible = Set<String>()
      for surface in values {
        let defaults = Set(surface.capabilities["defaultHiddenModels"]?.arrayValue?.compactMap(\.stringValue) ?? [])
        hidden.formUnion(defaults)
        for model in surface.capabilities["models"]?.arrayValue ?? [] {
          if let id = model["id"]?.stringValue, !defaults.contains(id) { visible.insert(id) }
        }
      }
      return hidden.subtracting(visible)
    }
  }

  static func state(_ row: ModelVisibilityRow, hidden: [String: Set<String>]) -> ModelVisibilityCheckState {
    let hiddenTargets = row.targets.filter { target in
      target.modelIDs.allSatisfy { hidden[target.key]?.contains($0) == true }
    }.count
    if hiddenTargets == 0 { return .all }
    return hiddenTargets == row.targets.count ? .none : .some
  }

  static func state(_ rows: [ModelVisibilityRow], hidden: [String: Set<String>]) -> ModelVisibilityCheckState {
    let states = rows.map { state($0, hidden: hidden) }
    if states.allSatisfy({ $0 == .all }) { return .all }
    return states.allSatisfy({ $0 == .none }) ? .none : .some
  }

  static func visibleCount(_ rows: [ModelVisibilityRow], hidden: [String: Set<String>]) -> Int {
    rows.filter { state($0, hidden: hidden) != .none }.count
  }

  static func toggling(_ rows: [ModelVisibilityRow], visible: Bool,
    hidden: [String: Set<String>]) -> [String: [String]] {
    var changes: [String: Set<String>] = [:]
    for target in rows.flatMap(\.targets) {
      var ids = changes[target.key] ?? hidden[target.key] ?? []
      if visible { ids.subtract(target.modelIDs) } else { ids.formUnion(target.modelIDs) }
      changes[target.key] = ids
    }
    return changes.mapValues { $0.sorted() }
  }

  /// Explicit Show all/Hide all replaces the displayed catalog keys, just as PWA does.
  func settingAll(visible: Bool) -> [String: [String]] {
    Self.toggling(rows, visible: visible, hidden: [:])
  }
}
