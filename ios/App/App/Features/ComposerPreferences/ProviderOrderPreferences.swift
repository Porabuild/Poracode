import Foundation

/// Machine identity is relative to one paired authority, never its display name
/// or the currently selected host. Native and WSL environments stay distinct.
struct ProviderOrderMachine: Hashable, Sendable, Identifiable {
  let connectionID: ClientConnectionID
  let distro: String?

  init(connectionID: ClientConnectionID, distro: String? = nil) {
    self.connectionID = connectionID
    self.distro = distro.flatMap { $0.isEmpty ? nil : $0 }
  }

  init(connectionID: ClientConnectionID, location: ProjectLocation?) {
    self.init(connectionID: connectionID, distro: location?.distro)
  }

  var id: String {
    let fields: [JSONValue] = [.string(connectionID.rawValue), distro.map(JSONValue.string) ?? .null]
    return (try? JSONEncoder().encode(fields))?.base64EncodedString() ?? ""
  }
}

/// Optional client-owned v1 subdocument in ComposerPreferencesStore. Remote
/// PWA overrides are also client-owned and excluded from REMOTE_SETTINGS_KEYS.
/// Older native v1 readers preserve this unknown section when saving presets.
struct ProviderOrderPreferences: Equatable, Sendable {
  private(set) var rawValue: JSONValue?

  init(rawValue: JSONValue? = nil) { self.rawValue = rawValue }

  var canEdit: Bool {
    guard let rawValue else { return true }
    guard let object = rawValue.objectValue, object["version"] == .number(1),
      object["mode"] == nil || ["synced", "per-machine"].contains(object["mode"]?.stringValue ?? ""),
      object["machines"] == nil || object["machines"]?.objectValue != nil else { return false }
    return true
  }

  var isSynced: Bool { !canEdit || object["mode"]?.stringValue != "per-machine" }

  func canEdit(_ machine: ProviderOrderMachine) -> Bool {
    canEdit && (machines[machine.id] == nil || Self.isEditableEntry(machines[machine.id]))
  }

  func order(for machine: ProviderOrderMachine?, fallback: [String]) -> [String] {
    guard !isSynced, let machine,
      let raw = machines[machine.id]?.objectValue?["providerOrder"],
      let order = Self.decodeOrder(raw) else { return fallback }
    return order
  }

  func hasOverride(for machine: ProviderOrderMachine) -> Bool {
    machines[machine.id]?.objectValue?["providerOrder"] != nil
  }

  @discardableResult mutating func setSynced(_ synced: Bool) -> Bool {
    guard canEdit else { return false }
    var next = object
    next["version"] = .number(1)
    next["mode"] = .string(synced ? "synced" : "per-machine")
    rawValue = .object(next)
    return true
  }

  @discardableResult mutating func setOrder(_ order: [String], for machine: ProviderOrderMachine) -> Bool {
    guard canEdit(machine) else { return false }
    var seen = Set<String>()
    let normalized = order.filter { !$0.isEmpty && seen.insert($0).inserted }
    var entries = machines
    var entry = entries[machine.id]?.objectValue ?? [:]
    entry["providerOrder"] = normalized.isEmpty ? nil : .array(normalized.map(JSONValue.string))
    entries[machine.id] = .object(entry)
    var next = object
    next["version"] = .number(1)
    next["machines"] = .object(entries)
    rawValue = .object(next)
    return true
  }

  /// The settings UI calls this only after the selected host acknowledges the
  /// adopted order. A future/opaque machine entry blocks clearing, not reading.
  @discardableResult mutating func lockToHostOrder() -> Bool {
    guard canEdit, machines.values.allSatisfy({ Self.isEditableEntry($0) }) else { return false }
    var next = object
    next["version"] = .number(1)
    next["mode"] = .string("synced")
    next["machines"] = .object(machines.mapValues { raw in
      var entry = raw.objectValue ?? [:]
      entry.removeValue(forKey: "providerOrder")
      return .object(entry)
    })
    rawValue = .object(next)
    return true
  }

  var canLockToHostOrder: Bool { canEdit && machines.values.allSatisfy { Self.isEditableEntry($0) } }
  private var object: [String: JSONValue] { rawValue?.objectValue ?? [:] }
  private var machines: [String: JSONValue] { object["machines"]?.objectValue ?? [:] }

  private static func isEditableEntry(_ value: JSONValue?) -> Bool {
    guard let object = value?.objectValue else { return false }
    return object["providerOrder"] == nil || object["providerOrder"].flatMap(decodeOrder) != nil
  }

  private static func decodeOrder(_ value: JSONValue) -> [String]? {
    guard let values = value.arrayValue else { return nil }
    let strings = values.compactMap(\.stringValue)
    return strings.count == values.count ? strings : nil
  }
}
