import Foundation
import Observation

/// Authored themes are device-owned preferences, as in the remote PWA.
/// Keep raw records so editing a known theme never erases a newer app's data.
@MainActor @Observable final class CustomThemeStore {
  static let shared = CustomThemeStore()
  // First native envelope. Existing ios.theme.preset selection remains valid.
  nonisolated static let storageKey = "com.poracode.custom-themes.v1"
  nonisolated static let maximumThemes = 100
  nonisolated static let maximumStorageBytes = 4 * 1_024 * 1_024
  private struct Envelope: Codable { let formatVersion: Int; var themes: [JSONValue] }
  private struct Header: Decodable { let formatVersion: Int }
  private(set) var themes: [NativeCustomTheme] = []
  private(set) var storageIssue: CustomThemeFailure?
  var canEdit: Bool { storageIssue == nil }
  @ObservationIgnored private let defaults: UserDefaults
  @ObservationIgnored private var raw: [JSONValue] = []

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    guard let stored = defaults.object(forKey: Self.storageKey) else { return }
    guard let data = stored as? Data, data.count <= Self.maximumStorageBytes,
      let header = try? JSONDecoder().decode(Header.self, from: data) else {
      storageIssue = .invalidDocument
      return
    }
    guard header.formatVersion == 1 else { storageIssue = .unsupportedVersion; return }
    guard let envelope = try? JSONDecoder().decode(Envelope.self, from: data), envelope.themes.count <= Self.maximumThemes else {
      storageIssue = .invalidDocument; return
    }
    raw = envelope.themes
    themes = Self.knownThemes(raw)
  }

  func saveAndApply(_ theme: NativeCustomTheme) throws {
    guard canEdit else { throw CustomThemeFailure.unavailableStorage }
    guard NativeCustomTheme.validID(theme.id) else { throw CustomThemeFailure.invalidDocument }
    let documentBytes = try theme.document.export()
    let matches = raw.indices.filter { raw[$0]["id"]?.stringValue == theme.id }
    // An opaque future record with the same ID cannot be replaced by a downgrade.
    guard matches.allSatisfy({ Self.decode(raw[$0]) != nil }) else { throw CustomThemeFailure.unavailableStorage }
    if matches.isEmpty, raw.count >= Self.maximumThemes { throw CustomThemeFailure.limitReached }
    let encoded = try JSONDecoder().decode(JSONValue.self, from: documentBytes)
    guard var object = encoded.objectValue else { throw CustomThemeFailure.invalidDocument }
    object["id"] = .string(theme.id)
    var next = raw
    if let first = matches.first {
      var previous = next[first].objectValue ?? [:]
      for mode in ["light", "dark"] {
        var palette = previous[mode]?.objectValue ?? [:]
        for field in CustomThemePalette.Field.allCases { palette.removeValue(forKey: field.rawValue) }
        palette.removeValue(forKey: "sidebarFill")
        palette.merge(object[mode]?.objectValue ?? [:]) { _, new in new }
        object[mode] = .object(palette)
      }
      previous.merge(object) { _, new in new }
      next[first] = .object(previous)
    } else { next.append(.object(object)) }
    try persist(next)
    defaults.set(theme.id, forKey: PoracodeThemePreset.storageKey)
  }

  func remove(_ id: String) throws {
    guard canEdit else { throw CustomThemeFailure.unavailableStorage }
    let next = raw.filter { value in value["id"]?.stringValue != id || Self.decode(value) == nil }
    guard next != raw else { return }
    try persist(next)
    if defaults.string(forKey: PoracodeThemePreset.storageKey) == id {
      defaults.set(PoracodeThemePreset.defaultID, forKey: PoracodeThemePreset.storageKey)
    }
  }

  private func persist(_ next: [JSONValue]) throws {
    let data = try JSONEncoder().encode(Envelope(formatVersion: 1, themes: next))
    guard data.count <= Self.maximumStorageBytes else { throw CustomThemeFailure.limitReached }
    defaults.set(data, forKey: Self.storageKey)
    raw = next
    themes = Self.knownThemes(next)
  }

  private static func knownThemes(_ values: [JSONValue]) -> [NativeCustomTheme] {
    var seen = Set<String>()
    return values.compactMap { value in
      guard let theme = decode(value), seen.insert(theme.id).inserted else { return nil }
      return theme
    }
  }

  private static func decode(_ value: JSONValue) -> NativeCustomTheme? {
    guard let id = value["id"]?.stringValue, NativeCustomTheme.validID(id),
      let bytes = try? JSONEncoder().encode(value), let document = try? JSONDecoder().decode(CustomThemeDocument.self, from: bytes) else { return nil }
    return NativeCustomTheme(id: id, document: document)
  }
}
