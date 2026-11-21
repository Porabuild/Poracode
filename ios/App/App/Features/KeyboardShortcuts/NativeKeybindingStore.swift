import Foundation
import Observation

/// Browser/PWA bindings are browser-owned, so native bindings belong to this
/// device too. Version 1 is a new native slot using the existing PWA document.
@MainActor @Observable final class NativeKeybindingStore {
  static let shared = NativeKeybindingStore()
  nonisolated static let storageKey = "com.poracode.keyboard-shortcuts.v1"
  private(set) var document: NativeKeybindingDocument
  private(set) var storageIssue: NativeKeybindingFailure?
  var canEdit: Bool { storageIssue == nil }
  var entries: [NativeKeybindingEntry] { canEdit ? document.entries : [] }
  let defaults: NativeKeybindingDocument
  @ObservationIgnored private let preferences: UserDefaults

  init(preferences: UserDefaults = .standard, defaults: NativeKeybindingDocument = NativeShortcutPlatformPolicy.defaults) {
    self.preferences = preferences; self.defaults = defaults; document = defaults
    guard let stored = preferences.object(forKey: Self.storageKey) else { return }
    guard let data = stored as? Data else { storageIssue = .invalidDocument; return }
    do {
      var decoded = try NativeKeybindingDocument(data: data)
      let migrated = decoded.migrateLegacySearch()
      document = decoded
      if migrated { preferences.set(try decoded.encoded(), forKey: Self.storageKey) }
    } catch {
      storageIssue = error as? NativeKeybindingFailure ?? .invalidDocument
    }
  }

  func replace(at index: Int, with chord: NativeKeyChord, expected: NativeKeybindingEntry? = nil) throws {
    guard canEdit else { throw NativeKeybindingFailure.unavailableStorage }
    guard document.entries.indices.contains(index) else { throw NativeKeybindingFailure.invalidDocument }
    if let expected, document.entries[index] != expected { throw NativeKeybindingFailure.changedDocument }
    var next = document
    // A native replacement overrides the Apple chord while retaining imported
    // arguments, conditions, platform keys, and unknown additive fields.
    next.entries[index].fields["mac"] = .string(chord.canonical)
    try persist(next)
  }

  func append(command: String, chord: NativeKeyChord, condition: String?) throws {
    var next = document
    next.entries.append(try NativeKeybindingEntry(command: command, key: chord.canonical, condition: condition))
    try persist(next)
  }

  func remove(at index: Int, expected: NativeKeybindingEntry? = nil) throws {
    guard canEdit else { throw NativeKeybindingFailure.unavailableStorage }
    guard document.entries.indices.contains(index) else { throw NativeKeybindingFailure.invalidDocument }
    if let expected, document.entries[index] != expected { throw NativeKeybindingFailure.changedDocument }
    var next = document; next.entries.remove(at: index)
    try persist(next)
  }

  func reset(command: String) throws {
    var next = document
    next.entries.removeAll { $0.command == command }
    next.entries += defaults.entries.filter { $0.command == command }
    try persist(next)
  }

  func conflict(for chord: NativeKeyChord, excluding command: String) -> String? {
    entries.first { $0.command != command && $0.chord == chord }?.command
  }

  /// Recovery is an explicit user-confirmed operation; unreadable and future
  /// documents otherwise remain byte-for-byte untouched.
  func resetAll() {
    preferences.removeObject(forKey: Self.storageKey)
    document = defaults
    storageIssue = nil
  }

  private func persist(_ next: NativeKeybindingDocument) throws {
    guard canEdit else { throw NativeKeybindingFailure.unavailableStorage }
    let bytes = try next.encoded()
    _ = try NativeKeybindingDocument(data: bytes)
    preferences.set(bytes, forKey: Self.storageKey)
    document = next
  }
}

enum NativeKeyboardDefaults {
  static let document: NativeKeybindingDocument = {
    guard let url = Bundle.main.url(forResource: "NativeKeyboardDefaults", withExtension: "json"),
      let bytes = try? Data(contentsOf: url), let decoded = try? NativeKeybindingDocument(data: bytes) else {
      return NativeKeybindingDocument(entries: [])
    }
    return decoded
  }()
}
