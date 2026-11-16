import Foundation
import Observation

enum VoiceInputBackend: String, Codable, CaseIterable, Sendable { case onDevice = "transformers", hex }
enum VoiceWhisperModel: String, Codable, CaseIterable, Sendable { case tiny, base }

struct VoiceInputPreferences: Codable, Equatable, Sendable {
  var showButton = true
  var microphoneID = ""
  var language = "en"
  var model: VoiceWhisperModel = .tiny
  var backend: VoiceInputBackend = .onDevice
  var hexModel = "parakeet_v3"
  var hardwareAcceleration = true
  static let languages = ["en", "es", "fr", "de", "it", "pt", "nl", "pl", "ru", "uk", "tr", "ar", "zh", "ja", "ko", "hi", "vi"]
}

/// Device-owned v1 data. Never patches a paired host's microphone or model
/// preferences. Unknown versions stay intact until an explicit Reset.
@MainActor @Observable final class VoicePreferencesStore {
  static let shared = VoicePreferencesStore()
  static let key = "ios.voiceInput.preferences.v1"
  var value = VoiceInputPreferences() { didSet { save() } }
  private(set) var incompatible = false
  private let defaults: UserDefaults
  private var retained: [String: JSONValue] = [:]

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    guard let data = defaults.data(forKey: Self.key) else { return }
    guard data.count <= 65_536, let object = try? JSONDecoder().decode([String: JSONValue].self, from: data),
      object["version"]?.numberInt == 1, let settings = object["settings"],
      let encoded = try? JSONEncoder().encode(settings),
      let decoded = try? JSONDecoder().decode(VoiceInputPreferences.self, from: encoded),
      VoiceInputPreferences.languages.contains(decoded.language),
      !decoded.hexModel.isEmpty, decoded.hexModel.utf16.count <= 128 else {
      incompatible = true
      return
    }
    retained = object
    value = decoded
  }

  func reset() {
    retained = [:]; incompatible = false
    value = VoiceInputPreferences()
  }

  private func save() {
    guard !incompatible, let data = try? JSONEncoder().encode(value),
      let known = try? JSONDecoder().decode([String: JSONValue].self, from: data) else { return }
    var object = retained
    object["version"] = .number(1)
    object["settings"] = .object((retained["settings"]?.objectValue ?? [:]).merging(known) { _, new in new })
    guard let encoded = try? JSONEncoder().encode(object) else { return }
    retained = object
    defaults.set(encoded, forKey: Self.key)
  }
}
