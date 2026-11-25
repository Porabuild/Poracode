import Foundation

/// Saved settings are unversioned in the shared contract; runtime bindings are
/// explicitly v1. Unknown future runtime bindings remain opaque and inert.
struct ThreadCrewBinding: Equatable, Sendable {
  static let version = 1
  var crewID: String?
  var name: String?
  var policy: CrewPolicy
  var roles: [CrewRole]

  init(crewID: String? = nil, name: String? = nil, policy: CrewPolicy = .crewOnly, roles: [CrewRole]) {
    self.crewID = crewID; self.name = name; self.policy = policy; self.roles = roles
  }

  init?(wire: JSONValue?) {
    guard let raw = wire?.objectValue, raw["version"]?.numberInt == Self.version,
      Set(raw.keys).isSubset(of: ["version", "crewId", "name", "policy", "roles"]),
      let policy = raw["policy"]?.stringValue.flatMap(CrewPolicy.init(rawValue:)),
      let values = raw["roles"]?.arrayValue, (1...6).contains(values.count), values.allSatisfy(CrewRole.isClosedRuntimeValue),
      CrewWire.optionalText(raw, "crewId", maximum: 64),
      CrewWire.optionalText(raw, "name", maximum: 40) else { return nil }
    let parsed = values.compactMap(CrewRole.init(wire:))
    guard parsed.count == values.count else { return nil }
    self.init(crewID: raw["crewId"]?.stringValue, name: raw["name"]?.stringValue,
      policy: policy, roles: CrewWire.normalized(parsed))
    guard isValid else { return nil }
  }

  var isValid: Bool {
    (crewID.map { CrewWire.text($0, maximum: 64) } ?? true)
      && (name.map { CrewWire.text($0, maximum: 40) } ?? true)
      && (1...6).contains(roles.count) && roles.allSatisfy(\.isValid)
  }

  var wire: JSONValue {
    var raw: [String: JSONValue] = [:]
    raw["version"] = .number(Double(Self.version))
    raw["crewId"] = crewID.map(JSONValue.string); raw["name"] = name.map(JSONValue.string)
    raw["policy"] = .string(policy.rawValue); raw["roles"] = .array(roles.map(\.runtimeWire))
    return .object(raw)
  }
}

struct SavedCrew: Equatable, Identifiable, Sendable {
  var id: String
  var name: String
  var lead: CrewMemberSelection
  var policy: CrewPolicy
  var roles: [CrewRole]
  var favorite: Bool?
  var lastUsedAt: Double?
  var updatedAt: Double?
  private var retained: [String: JSONValue] = [:]

  init(id: String, name: String, lead: CrewMemberSelection, policy: CrewPolicy, roles: [CrewRole]) {
    self.id = id; self.name = name; self.lead = lead; self.policy = policy; self.roles = roles
  }

  init?(wire: JSONValue) {
    guard let raw = wire.objectValue, let id = raw["id"]?.stringValue,
      let name = raw["name"]?.stringValue, let leadValue = raw["lead"],
      let lead = CrewMemberSelection(wire: leadValue),
      let policy = raw["policy"]?.stringValue.flatMap(CrewPolicy.init(rawValue:)),
      let values = raw["roles"]?.arrayValue, (1...6).contains(values.count),
      raw["favorite"] == nil || raw["favorite"]?.boolValue != nil else { return nil }
    let roles = values.compactMap(CrewRole.init(wire:))
    guard roles.count == values.count else { return nil }
    for key in ["lastUsedAt", "updatedAt"] {
      guard raw[key] == nil || raw[key]?.numberInt.map({ $0 >= 0 }) == true else { return nil }
    }
    self.init(id: id, name: name, lead: lead, policy: policy, roles: roles)
    favorite = raw["favorite"]?.boolValue
    lastUsedAt = raw["lastUsedAt"]?.numberInt.map(Double.init)
    updatedAt = raw["updatedAt"]?.numberInt.map(Double.init)
    retained = raw
    guard isValid else { return nil }
  }

  var isValid: Bool {
    CrewWire.text(id, maximum: 64) && CrewWire.text(name, maximum: 40) && lead.isValid
      && (1...6).contains(roles.count) && roles.allSatisfy(\.isValid)
  }

  var binding: ThreadCrewBinding {
    .init(crewID: id, name: name, policy: policy, roles: CrewWire.normalized(roles))
  }

  var wire: JSONValue {
    var raw = retained
    raw["id"] = .string(id); raw["name"] = .string(name)
    raw["lead"] = lead.wire; raw["policy"] = .string(policy.rawValue)
    raw["roles"] = .array(roles.map(\.wire)); raw["favorite"] = favorite.map(JSONValue.bool)
    raw["lastUsedAt"] = lastUsedAt.map(JSONValue.number)
    raw["updatedAt"] = updatedAt.map(JSONValue.number)
    return .object(raw)
  }

  func updating(from binding: ThreadCrewBinding, lead: CrewMemberSelection, now: Double) -> Self {
    var next = self
    next.lead = lead; next.roles = CrewWire.normalized(binding.roles); next.policy = binding.policy
    next.updatedAt = now
    return next
  }
}

extension SettingsDocument {
  var savedCrews: [SavedCrew] {
    var ids = Set<String>()
    return (crews ?? []).compactMap(SavedCrew.init(wire:)).filter { ids.insert($0.id).inserted }
  }
}

/// The saved crew a fresh Home draft follows. A remembered project draft keeps
/// the binding and the lead from the draft that was never saved; once the saved
/// crews load, the saved version is authoritative. A configured (user-edited)
/// draft is never reconciled, and a lead that already matches needs no write
/// (`CrewInspectorCard.same` equates absent Fast with false).
@MainActor
enum HomeCrewRestore {
  /// Whether Send must wait for the first saved-crews load. A fresh draft whose
  /// effective configuration still carries the remembered crew binding would
  /// otherwise launch that unsaved-leak crew before `reconcileSavedCrew` runs.
  /// Crew-less drafts and user-edited drafts never wait.
  static func holdsLaunch(
    hasConfiguredConfiguration: Bool, crewsLoadPending: Bool, remembered: ThreadCrewBinding?
  ) -> Bool {
    !hasConfiguredConfiguration && crewsLoadPending && remembered?.crewID != nil
  }

  static func savedCrew(
    for remembered: ThreadCrewBinding?, in savedCrews: [SavedCrew],
    currentLead: CrewMemberSelection?, hasConfiguredConfiguration: Bool
  ) -> SavedCrew? {
    guard !hasConfiguredConfiguration, let remembered, let crewID = remembered.crewID,
      let saved = savedCrews.first(where: { $0.id == crewID }) else { return nil }
    let leadMatches = currentLead.map { CrewInspectorCard.same($0, saved.lead) } == true
    return leadMatches && remembered == saved.binding ? nil : saved
  }
}
