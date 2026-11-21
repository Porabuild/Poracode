import Foundation

enum CrewPolicy: String, CaseIterable, Sendable {
  case crewOnly = "crew-only"
  case crewFirst = "crew-first"
}

/// Native projection of the existing shared crew v1 vocabulary. Optional
/// values preserve absence, including Fast, instead of inventing defaults.
struct CrewMemberSelection: Equatable, Sendable {
  static let runtimeKeys: Set<String> = ["agentKind", "model", "effort", "fast", "contextSize"]
  var agentKind: String
  var model: String
  var effort: String?
  var fast: Bool?
  var contextSize: String?
  private var retained: [String: JSONValue] = [:]

  init(agentKind: String, model: String, effort: String? = nil, fast: Bool? = nil, contextSize: String? = nil) {
    self.agentKind = agentKind; self.model = model
    self.effort = effort; self.fast = fast; self.contextSize = contextSize
  }

  init?(wire: JSONValue) {
    guard let raw = wire.objectValue,
      let agent = raw["agentKind"]?.stringValue, let model = raw["model"]?.stringValue,
      CrewWire.optionalText(raw, "effort", maximum: 64),
      CrewWire.optionalText(raw, "contextSize", maximum: 64),
      raw["fast"] == nil || raw["fast"]?.boolValue != nil else { return nil }
    self.init(agentKind: agent, model: model, effort: raw["effort"]?.stringValue,
      fast: raw["fast"]?.boolValue, contextSize: raw["contextSize"]?.stringValue)
    retained = raw
    guard isValid else { return nil }
  }

  var isValid: Bool {
    CrewWire.text(agentKind, maximum: 128) && CrewWire.text(model, maximum: 256)
      && (effort.map { CrewWire.text($0, maximum: 64) } ?? true)
      && (contextSize.map { CrewWire.text($0, maximum: 64) } ?? true)
  }

  var wire: JSONValue {
    var raw = retained
    raw["agentKind"] = .string(agentKind); raw["model"] = .string(model)
    raw["effort"] = effort.map(JSONValue.string)
    raw["fast"] = fast.map(JSONValue.bool)
    raw["contextSize"] = contextSize.map(JSONValue.string)
    return .object(raw)
  }

  var runtimeWire: JSONValue { .object((wire.objectValue ?? [:]).filter { Self.runtimeKeys.contains($0.key) }) }

  /// Model-bound controls may keep empty inert carriers in ThreadConfig.
  /// Saved Crew members use optional nonempty axes; omit only these empty
  /// carriers when saving, without changing the lead's complete configuration.
  var savedSelection: Self {
    var value = self
    if value.effort?.isEmpty == true { value.effort = nil }
    if value.contextSize?.isEmpty == true { value.contextSize = nil }
    return value
  }
}

struct CrewRole: Equatable, Identifiable, Sendable {
  static let runtimeKeys: Set<String> = ["id", "label", "brief", "noEdits", "selection", "fallbacks", "parallel"]
  var id: String
  var label: String
  var brief: String?
  var noEdits = false
  var selection: CrewMemberSelection
  var fallbacks: [CrewMemberSelection]?
  var parallel: Int?
  private var retained: [String: JSONValue] = [:]

  init(id: String, label: String, brief: String? = nil, noEdits: Bool = false,
    selection: CrewMemberSelection, fallbacks: [CrewMemberSelection]? = nil, parallel: Int? = nil) {
    self.id = id; self.label = label; self.brief = brief; self.noEdits = noEdits
    self.selection = selection; self.fallbacks = fallbacks; self.parallel = parallel
  }

  init?(wire: JSONValue) {
    guard let raw = wire.objectValue, let id = raw["id"]?.stringValue,
      let label = raw["label"]?.stringValue, let value = raw["selection"],
      let selection = CrewMemberSelection(wire: value),
      CrewWire.optionalText(raw, "brief", maximum: 160, allowsEmpty: true),
      raw["noEdits"] == nil || raw["noEdits"] == .bool(true),
      raw["parallel"] == nil || raw["parallel"]?.numberInt != nil else { return nil }
    let fallbacks: [CrewMemberSelection]?
    if let value = raw["fallbacks"] {
      guard let rows = value.arrayValue else { return nil }
      let parsed = rows.compactMap(CrewMemberSelection.init(wire:))
      guard parsed.count == rows.count else { return nil }
      fallbacks = parsed
    } else { fallbacks = nil }
    self.init(id: id, label: label, brief: raw["brief"]?.stringValue,
      noEdits: raw["noEdits"] == .bool(true), selection: selection,
      fallbacks: fallbacks, parallel: raw["parallel"]?.numberInt)
    retained = raw
    guard isValid else { return nil }
  }

  var parallelCount: Int { parallel ?? 1 }
  var isValid: Bool {
    id.range(of: "^[a-z0-9][a-z0-9-]{0,31}$", options: .regularExpression) != nil
      && CrewWire.text(label, maximum: 24)
      && (brief.map { CrewWire.text($0, maximum: 160, allowsEmpty: true) } ?? true)
      && selection.isValid && (1...4).contains(parallelCount)
      && (fallbacks?.count ?? 0) <= 3 && (fallbacks?.allSatisfy(\.isValid) ?? true)
  }

  var wire: JSONValue {
    var raw = retained
    raw["id"] = .string(id); raw["label"] = .string(label)
    raw["brief"] = brief.map(JSONValue.string)
    raw["noEdits"] = noEdits ? .bool(true) : nil
    raw["selection"] = selection.wire
    raw["fallbacks"] = fallbacks.map { .array($0.map(\.wire)) }
    raw["parallel"] = parallel.map { .number(Double($0)) }
    return .object(raw)
  }

  var runtimeWire: JSONValue {
    var raw = (wire.objectValue ?? [:]).filter { Self.runtimeKeys.contains($0.key) }
    raw["selection"] = selection.runtimeWire
    raw["fallbacks"] = fallbacks.map { .array($0.map(\.runtimeWire)) }
    return .object(raw)
  }

  static func isClosedRuntimeValue(_ value: JSONValue) -> Bool {
    guard let raw = value.objectValue, Set(raw.keys).isSubset(of: runtimeKeys),
      let selection = raw["selection"]?.objectValue,
      Set(selection.keys).isSubset(of: CrewMemberSelection.runtimeKeys) else { return false }
    return raw["fallbacks"]?.arrayValue?.allSatisfy {
      guard let selection = $0.objectValue else { return false }
      return Set(selection.keys).isSubset(of: CrewMemberSelection.runtimeKeys)
    } ?? true
  }
}

enum CrewWire {
  // JavaScript trim/\s is the existing PWA wire normalization. Foundation's
  // whitespace set additionally contains NEL and omits BOM; substituting it
  // can merge distinct saved role labels or fail to normalize a valid label.
  static let whitespace = CharacterSet(charactersIn: "\u{0009}\u{000A}\u{000B}\u{000C}\u{000D}\u{0020}\u{00A0}\u{1680}\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}\u{2007}\u{2008}\u{2009}\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}\u{FEFF}")

  static func trimmed(_ value: String) -> String { value.trimmingCharacters(in: whitespace) }

  static func text(_ value: String, maximum: Int, allowsEmpty: Bool = false) -> Bool {
    (allowsEmpty || !value.isEmpty) && value.utf16.count <= maximum
  }

  static func optionalText(_ object: [String: JSONValue], _ key: String,
    maximum: Int, allowsEmpty: Bool = false) -> Bool {
    guard let raw = object[key] else { return true }
    return raw.stringValue.map { text($0, maximum: maximum, allowsEmpty: allowsEmpty) } ?? false
  }

  static func collapsed(_ value: String) -> String {
    value.components(separatedBy: whitespace).filter { !$0.isEmpty }.joined(separator: " ")
  }

  static func normalized(_ roles: [CrewRole]) -> [CrewRole] {
    var ids = Set<String>(), labels = Set<String>()
    return roles.compactMap { original in
      var role = original
      role.label = collapsed(role.label)
      if let brief = role.brief { role.brief = collapsed(brief).nilIfCrewEmpty }
      guard role.isValid, !ids.contains(role.id), !labels.contains(role.label.lowercased()) else { return nil }
      ids.insert(role.id); labels.insert(role.label.lowercased())
      return role
    }
  }
}

private extension String {
  var nilIfCrewEmpty: String? { isEmpty ? nil : self }
}
