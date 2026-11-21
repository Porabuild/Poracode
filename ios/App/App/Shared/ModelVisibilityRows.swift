import Foundation

enum ModelVisibilityRows {
  private struct UnifiedRow {
    var row: ModelVisibilityRow
    var owners: Set<String>
    var knownIDs: Set<String>
  }

  static func surface(id: String, key: String, capabilities: [String: JSONValue],
    provider: String, surface: String) -> [ModelVisibilityRow] {
    let families = ModelFamilies.project(capabilities)
    let familyByMember = Dictionary(uniqueKeysWithValues: families.flatMap { family in
      family.members.map { ($0.model, family) }
    })
    let fastIDs = Set(capabilities["fastModels"]?.arrayValue?.compactMap(\.stringValue) ?? [])
    var seen = Set<String>()
    return (capabilities["models"]?.arrayValue ?? []).compactMap { model in
      guard let modelID = model["id"]?.stringValue, modelID != "auto", !modelID.isEmpty else { return nil }
      let family = familyByMember[modelID]
      let representative = family?.model ?? modelID
      guard seen.insert(representative).inserted else { return nil }
      let ids = family?.members.map(\.model) ?? [modelID]
      let label = family?.label ?? model["label"]?.stringValue ?? modelID
      let detail = contextHint(model: representative, capabilities: capabilities)
      let group = subProvider(model: representative, capabilities: capabilities)
      let fast = ids.contains { fastIDs.contains($0) } ? "fast" : ""
      let search = [key, provider, surface, representative, label, detail ?? "", group?.label ?? "", model["description"]?.stringValue ?? "", fast] + ids
      return .init(id: "\(id):\(representative)", label: label, detail: detail,
        groupID: group?.id, groupLabel: group?.label, isFamily: family != nil, targets: [.init(key: key, modelIDs: ids)],
        searchText: search.joined(separator: "\n"))
    }
  }

  static func unified(_ surfaces: [ModelVisibilitySurface]) -> [ModelVisibilityRow] {
    if surfaces.count == 1 { return surfaces[0].rows }
    let ordered = surfaces.enumerated().sorted {
      if ($0.element.mode == .gui) != ($1.element.mode == .gui) { return $0.element.mode == .gui }
      return $0.offset < $1.offset
    }.map(\.element)
    var merged: [UnifiedRow] = []
    for surface in ordered {
      for row in surface.rows {
        let ids = Set(row.targets.flatMap(\.modelIDs).map { $0.lowercased() })
        let match = merged.firstIndex { candidate in
          !candidate.owners.contains(surface.id) && candidate.row.isFamily == row.isFamily
            && !ids.isDisjoint(with: candidate.knownIDs)
        } ?? merged.firstIndex { candidate in
          guard !candidate.owners.contains(surface.id), candidate.row.isFamily == row.isFamily else { return false }
          return normalized(candidate.row.label) == normalized(row.label)
            && normalized(candidate.row.detail) == normalized(row.detail)
            && (candidate.row.groupID == nil || row.groupID == nil || normalized(candidate.row.groupID) == normalized(row.groupID))
        }
        if let match {
          merged[match].row.targets += row.targets
          merged[match].row.searchText += "\n" + row.searchText
          if merged[match].row.groupID == nil {
            merged[match].row.groupID = row.groupID
            merged[match].row.groupLabel = row.groupLabel
          }
          if merged[match].row.detail == nil { merged[match].row.detail = row.detail }
          merged[match].owners.insert(surface.id)
          merged[match].knownIDs.formUnion(ids)
        } else {
          merged.append(.init(row: row, owners: [surface.id], knownIDs: ids))
        }
      }
    }
    return merged.map { candidate in
      var row = candidate.row
      if candidate.owners.count < surfaces.count {
        row.badges = surfaces.filter { candidate.owners.contains($0.id) }.map(\.label)
      }
      return row
    }
  }

  private static func normalized(_ value: String?) -> String {
    (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  }

  private static func contextHint(model: String, capabilities: [String: JSONValue]) -> String? {
    let concrete = capabilities["modelContextSizes"]?[model]?.arrayValue?.compactMap(\.stringValue).filter { $0.lowercased() != "default" } ?? []
    guard concrete.count == 1, let id = concrete.first else { return nil }
    return capabilities["contextSizes"]?.arrayValue?.first { $0["id"]?.stringValue == id }?["label"]?.stringValue ?? id.uppercased()
  }

  private static func subProvider(model: String, capabilities: [String: JSONValue]) -> (id: String, label: String)? {
    let explicit = capabilities["modelSubProvider"]?[model]?.stringValue
    let prefix = model.firstIndex { $0 == "/" || $0 == ":" }.map { String(model[..<$0]) }
    guard let id = explicit ?? prefix, !id.isEmpty else { return nil }
    let label = capabilities["subProviders"]?.arrayValue?.first { $0["id"]?.stringValue == id }?["label"]?.stringValue
      ?? id.split(whereSeparator: { $0 == "-" || $0 == "_" }).map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined(separator: " ")
    return (id, label)
  }
}
