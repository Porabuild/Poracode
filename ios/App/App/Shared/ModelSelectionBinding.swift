import Foundation

/// Existing remote-v3 selection-binding v1. Legacy configurations without a
/// binding remain valid; this is a native reader/writer fix, not a new wire
/// version. Empty, false and absent carriers have distinct meanings.
enum ModelSelectionAxis: String, CaseIterable, Hashable, Sendable {
  case effort, fast, thinking, contextSize

  func accepts(_ value: JSONValue) -> Bool {
    switch (self, value) {
    case (.effort, .string), (.contextSize, .string), (.fast, .bool), (.thinking, .bool): true
    default: false
    }
  }

  func value(in configuration: ThreadConfig) -> JSONValue? {
    switch self {
    case .effort: configuration.effort.map(JSONValue.string)
    case .fast: configuration.fast.map(JSONValue.bool)
    case .thinking: configuration.thinking.map(JSONValue.bool)
    case .contextSize: configuration.contextSize.map(JSONValue.string)
    }
  }
}

struct ModelSelectionOwner: Hashable, Sendable {
  let agentKind: String
  var agentInstanceID: String? = nil
  let presentationMode: ThreadPresentationMode

  var isValid: Bool { !agentKind.isEmpty && agentInstanceID?.isEmpty != true }

  var wireValue: JSONValue {
    var object: [String: JSONValue] = [
      "agentKind": .string(agentKind), "presentationMode": .string(presentationMode.rawValue),
    ]
    if let agentInstanceID { object["agentInstanceId"] = .string(agentInstanceID) }
    return .object(object)
  }

  init(agentKind: String, agentInstanceID: String? = nil, presentationMode: ThreadPresentationMode) {
    self.agentKind = agentKind
    self.agentInstanceID = agentInstanceID
    self.presentationMode = presentationMode
  }

  init?(wireValue: JSONValue) {
    guard let object = wireValue.objectValue,
      Set(object.keys).isSubset(of: ["agentKind", "agentInstanceId", "presentationMode"]),
      let kind = object["agentKind"]?.stringValue, !kind.isEmpty,
      let rawMode = object["presentationMode"]?.stringValue,
      let mode = ThreadPresentationMode(rawValue: rawMode) else { return nil }
    if let instance = object["agentInstanceId"], instance.stringValue?.isEmpty != false { return nil }
    self.init(agentKind: kind, agentInstanceID: object["agentInstanceId"]?.stringValue, presentationMode: mode)
  }
}

/// A strict surface declaration, carried verbatim through family projection.
/// It authorizes recording only values actually present in a deliberate edit.
struct ModelSelectionRedundancy: Equatable, Sendable {
  let values: [ModelSelectionAxis: [JSONValue]]

  init?(wireValue: JSONValue) {
    guard let object = wireValue.objectValue else { return nil }
    var result: [ModelSelectionAxis: [JSONValue]] = [:]
    for (key, value) in object {
      guard let axis = ModelSelectionAxis(rawValue: key), let entries = value.arrayValue,
        entries.allSatisfy(axis.accepts) else { return nil }
      result[axis] = entries
    }
    values = result
  }

  var wireValue: JSONValue {
    .object(Dictionary(uniqueKeysWithValues: values.map { ($0.key.rawValue, .array($0.value)) }))
  }
}

struct ModelSelectionBinding: Codable, Hashable, Sendable {
  let owner: ModelSelectionOwner
  let model: String
  let inertValues: [ModelSelectionAxis: JSONValue]

  init?(owner: ModelSelectionOwner, model: String, inertValues: [ModelSelectionAxis: JSONValue]) {
    guard owner.isValid, !model.isEmpty, !inertValues.isEmpty,
      inertValues.allSatisfy({ $0.key.accepts($0.value) }) else { return nil }
    self.owner = owner
    self.model = model
    self.inertValues = inertValues
  }

  init(from decoder: Decoder) throws {
    let value = try JSONValue(from: decoder)
    guard let object = value.objectValue,
      Set(object.keys) == ["version", "kind", "owner", "model", "inertValues"],
      object["version"] == .number(1), object["kind"] == .string("family-member"),
      let ownerValue = object["owner"], let owner = ModelSelectionOwner(wireValue: ownerValue),
      let model = object["model"]?.stringValue,
      let rawValues = object["inertValues"]?.objectValue else {
      throw Self.invalid(decoder)
    }
    var values: [ModelSelectionAxis: JSONValue] = [:]
    for (key, value) in rawValues {
      guard let axis = ModelSelectionAxis(rawValue: key), axis.accepts(value) else { throw Self.invalid(decoder) }
      values[axis] = value
    }
    guard let binding = Self(owner: owner, model: model, inertValues: values) else { throw Self.invalid(decoder) }
    self = binding
  }

  func encode(to encoder: Encoder) throws { try wireValue.encode(to: encoder) }

  var wireValue: JSONValue {
    .object([
      "version": .number(1), "kind": .string("family-member"), "owner": owner.wireValue,
      "model": .string(model),
      "inertValues": .object(Dictionary(uniqueKeysWithValues: inertValues.map { ($0.key.rawValue, $0.value) })),
    ])
  }

  func matches(_ configuration: ThreadConfig, owner actualOwner: ModelSelectionOwner) -> Bool {
    owner == actualOwner && actualOwner.isValid && model == configuration.model
      && inertValues.allSatisfy { $0.key.value(in: configuration) == $0.value }
  }

  private static func invalid(_ decoder: Decoder) -> DecodingError {
    .dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unrecognized model selection binding"))
  }
}
