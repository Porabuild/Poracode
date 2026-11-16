import Foundation

enum CrewMutationFailure: Error, Equatable, Sendable {
  case invalidCrew, limitReached, conflict, notApplied
}

enum CrewMutation: Sendable {
  case upsert(SavedCrew, basedOn: SavedCrew?)
  case delete(SavedCrew)
  case favorite(id: String, value: Bool)
  case used(id: String, at: Double)

  /// Merge only the intended record/fields into the latest host projection.
  /// Picker metadata and unrelated records are never rebuilt from an editor.
  func applying(to original: [JSONValue], now: Double) throws -> [JSONValue] {
    var records = original
    switch self {
    case .upsert(var proposed, let baseline):
      proposed.name = proposed.name.trimmingCharacters(in: CrewWire.whitespace)
      proposed.roles = CrewWire.normalized(proposed.roles)
      guard proposed.isValid else { throw CrewMutationFailure.invalidCrew }
      let index = records.firstIndex { $0.objectValue?["id"]?.stringValue == proposed.id }
      let current = index.flatMap { SavedCrew(wire: records[$0]) }
      if let baseline, current?.editableValue != baseline.editableValue { throw CrewMutationFailure.conflict }
      if let index {
        guard var current else { throw CrewMutationFailure.conflict }
        current.name = proposed.name; current.lead = proposed.lead
        current.policy = proposed.policy; current.roles = proposed.roles; current.updatedAt = now
        records[index] = current.wire
      } else {
        guard records.count < 24 else { throw CrewMutationFailure.limitReached }
        proposed.updatedAt = now
        records.append(proposed.wire)
      }
    case .delete(let baseline):
      guard let index = records.firstIndex(where: { $0.objectValue?["id"]?.stringValue == baseline.id }) else { return records }
      guard SavedCrew(wire: records[index])?.editableValue == baseline.editableValue else { throw CrewMutationFailure.conflict }
      records.remove(at: index)
    case .favorite(let id, let value):
      guard let index = records.firstIndex(where: { $0.objectValue?["id"]?.stringValue == id }),
        var raw = records[index].objectValue else { throw CrewMutationFailure.conflict }
      raw["favorite"] = .bool(value)
      records[index] = .object(raw)
    case .used(let id, let at):
      guard at.isFinite, at >= 0, at.rounded(.towardZero) == at,
        let index = records.firstIndex(where: { $0.objectValue?["id"]?.stringValue == id }),
        var raw = records[index].objectValue else { throw CrewMutationFailure.conflict }
      raw["lastUsedAt"] = .number(at)
      records[index] = .object(raw)
    }
    return records
  }

  func isSatisfied(by records: [JSONValue]) -> Bool {
    switch self {
    case .upsert(var expected, _):
      expected.name = expected.name.trimmingCharacters(in: CrewWire.whitespace)
      expected.roles = CrewWire.normalized(expected.roles)
      return records.first { $0.objectValue?["id"]?.stringValue == expected.id }
        .flatMap(SavedCrew.init(wire:))?.editableValue == expected.editableValue
    case .delete(let crew):
      return !records.contains { $0.objectValue?["id"]?.stringValue == crew.id }
    case .favorite(let id, let expected):
      return records.first { $0.objectValue?["id"]?.stringValue == id }?.objectValue?["favorite"]?.boolValue == expected
    case .used(let id, let expected):
      return records.first { $0.objectValue?["id"]?.stringValue == id }?.objectValue?["lastUsedAt"]?.numberValue == expected
    }
  }
}

extension SavedCrew {
  /// Metadata changes do not invalidate a form opened before a picker use.
  var editableValue: JSONValue {
    .object(["name": .string(name), "lead": lead.wire, "policy": .string(policy.rawValue),
      "roles": .array(roles.map { role in
        var semantic = role
        semantic.parallel = role.parallelCount
        return semantic.runtimeWire
      })])
  }
}
