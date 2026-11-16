import Foundation

enum VoiceStrings {
  static func value(_ text: String) -> String {
    String(localized: String.LocalizationValue(text), table: "VoiceInput")
  }
  static var title: String { value("Voice input") }
  static var audio: String { value("Audio") }
  static var description: String { value("Choose how you record and where your speech is transcribed.") }
  static var microphone: String { value("Microphone") }
  static var systemDefault: String { value("System default") }
  static var showButton: String { value("Show voice input button") }
  static var testMicrophone: String { value("Test microphone") }
  static var language: String { value("Voice input language") }
  static var backend: String { value("Transcription backend") }
  static var local: String { value("Built-in · This device") }
  static var host: String { value("Hex · Host engine") }
  static var model: String { value("Voice model") }
  static var tiny: String { value("Fastest (Whisper tiny)") }
  static var base: String { value("Better (Whisper base)") }
  static var acceleration: String { value("Use hardware acceleration") }
  static var setup: String { value("Hex setup") }
  static var install: String { value("Install engine") }
  static var remove: String { value("Remove engine") }
  static var removeTitle: String { value("Remove Hex engine?") }
  static var removeBody: String { value("This removes only the engine installed by Poracode. Downloaded models and external Hex installations are kept.") }
  static var prepare: String { value("Prepare model") }
  static var setupRequired: String { value("Setup required") }
  static var preparing: String { value("Preparing model…") }
  static var installing: String { value("Installing engine…") }
  static var ready: String { value("Ready") }
  static var start: String { value("Start voice input") }
  static var starting: String { value("Starting voice input") }
  static var stop: String { value("Stop voice input") }
  static var recording: String { value("Recording") }
  static var recordingLimit: String { value("Recording stops automatically at five minutes.") }
  static var downloading: String { value("Downloading voice model...") }
  static var loading: String { value("Loading model…") }
  static var uploading: String { value("Uploading audio…") }
  static var transcribing: String { value("Transcribing voice") }
  static var review: String { value("Review dictation") }
  static var insert: String { value("Insert into draft") }
  static var confirm: String { value("Insert") }
  static var reviewHint: String { value("Review the transcript before inserting it into your message.") }
  static var microphoneDenied: String { value("Microphone permission was denied.") }
  static var microphoneUnavailable: String { value("No microphone found.") }
  static var openSettings: String { value("Open Settings") }
  static var microphoneHint: String { value("Enable microphone access in your system settings, then try again.") }
  static var noSpeech: String { value("No speech detected.") }
  static var failed: String { value("Voice input could not complete. Try again.") }
  static var busy: String { value("Another window is using the microphone.") }
  static var settingsIncompatible: String { value("These voice settings require a newer app. Reset them to use this version.") }
  static var reset: String { value("Reset voice settings") }
  static var retry: String { value("Try again") }
  static var sourceChanged: String { value("The connected Poracode host is unavailable. Reconnect and try again.") }
  static var localHint: String { value("Audio is transcribed on this device.") }
  static var hostHint: String { value("Audio is sent to the selected host for transcription.") }
  static func phase(_ phase: VoiceInputProgress.Phase) -> String {
    switch phase { case .downloading: downloading; case .loading: loading; case .uploading: uploading; case .transcribing: transcribing }
  }
  static func failure(_ error: VoiceInputFailure) -> String {
    switch error {
    case .microphoneDenied: microphoneDenied
    case .microphoneUnavailable: microphoneUnavailable
    case .noSpeech: noSpeech
    case .busy: busy
    case .settingsIncompatible: settingsIncompatible
    case .hostUnavailable: sourceChanged
    case .incompatible: value("The Hex engine is incompatible with this host or Poracode version.")
    case .recording, .transcription: failed
    case .hex(let code):
      switch code {
      case "not_ready": value("Prepare the selected Hex model in Audio settings before recording.")
      case "unavailable": value("Hex is unavailable on this host. Install a compatible Hex executable and restart Poracode, or choose the built-in backend.")
      case "busy": value("Hex is busy with another voice request. Try again shortly.")
      case "timeout": value("Hex timed out. Please try again.")
      case "unsupported": value("Managed Hex installation is not available on this host.")
      case "integrity": value("The downloaded Hex engine failed its integrity or signature check.")
      case "permission_denied": value("Poracode does not have permission to install or run the Hex engine.")
      case "download_failed": value("The Hex engine download failed. Check your connection and try again.")
      case "incompatible": value("The Hex engine is incompatible with this host or Poracode version.")
      case "disconnected": sourceChanged
      case "cancelled": value("Voice transcription cancelled.")
      default: value("Hex could not process this request. Check the model and language in Audio settings.")
      }
    }
  }
}
