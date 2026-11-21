import Foundation

/// Versioned hints beside complete transient events. Canonical data remains
/// usable when a hint or a future interpretation format cannot be displayed.
enum RichRuntimeItemHeadingSnapshot {
  struct Decoded {
    var headings: [String: RichRuntimeItemHeadingRecord] = [:]
    var bodies: [String: RichResolvedToolBodyRecord] = [:]
  }

  static func records(_ raw: AdvancedJSONValue?, projection: RichTimelineProjection,
    catalog: RichToolPresentationCatalog?) -> [String: RichRuntimeItemHeadingRecord] {
    decode(raw, projection: projection, catalog: catalog).headings
  }

  static func decode(_ raw: AdvancedJSONValue?, projection: RichTimelineProjection,
    catalog: RichToolPresentationCatalog?) -> Decoded {
    guard let raw, let data = try? JSONEncoder().encode(raw), data.count <= 2 * 1024 * 1024,
      let value = try? RichJSON.decode(data), let object = value.objectValue,
      object["version"]?.exactInt64Value == 1, let items = object["items"]?.arrayValue,
      items.count <= 4096 else { return .init() }
    var groups: [Int: [RichJSON]] = [:], seen = Set<String>()
    for item in items {
      guard let fields = item.objectValue, let version = fields["version"]?.exactInt64Value else { return .init() }
      guard [1, 2, 5].contains(version) else { continue }
      guard let entry = fields["entry"], let id = entry.objectValue?["itemId"]?.stringValue,
        seen.insert("\(version):\(id)").inserted else { return .init() }
      groups[Int(version), default: []].append(entry)
    }
    let byID = Dictionary(uniqueKeysWithValues: projection.rawItems.map { ($0.id, $0) })
    var decoded = Decoded()
    do {
      for version in groups.keys.sorted() {
        let entries = groups[version]!, batchSize = version == 5 ? 1 : 32
        for start in stride(from: 0, to: entries.count, by: batchSize) {
          let body: RichJSON = .object(["version": .number(Decimal(version)),
            "items": .array(Array(entries[start..<min(start + batchSize, entries.count)]))])
          let data = try JSONEncoder().encode(body)
          if version == 5 {
            for row in try GeneratedRemoteV3Contract.runtimeToolBodyResponse(data) {
              guard let item = byID[row.request.itemID],
                row.displayBody(for: item, projection: catalog?.itemTypes[item.type]?.bodyProjection) != nil else { continue }
              decoded.bodies[item.id] = row
            }
          } else {
            let rows = try GeneratedRemoteV3Contract.runtimeItemHeadingResponse(data, expectedVersion: version)
            for row in rows {
              guard let item = byID[row.request.itemID],
                let descriptor = catalog?.itemTypes[item.type]?.headerProjection,
                row.request == RichRuntimeItemHeadingRequest(item, projection: descriptor),
                row.heading.workflowMetadata == nil, row.heading.workflowView == nil else { continue }
              decoded.headings[item.id] = row
            }
          }
        }
      }
    } catch { return .init() }
    return decoded
  }
}
