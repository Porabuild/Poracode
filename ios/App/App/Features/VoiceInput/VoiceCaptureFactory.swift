import Foundation

@MainActor enum VoiceCaptureFactory {
  static func make() -> any VoiceAudioRecording {
    #if DEBUG && targetEnvironment(simulator)
    // Explicit integration-test capture source. Recognition still runs through
    // the real selected backend; this never substitutes an ASR response or
    // falls back to the host machine's microphone when the fixture is missing.
    if ProcessInfo.processInfo.arguments.contains("-native-e2e-fresh-state"),
      ProcessInfo.processInfo.environment["NATIVE_E2E_VOICE_FILE"] == "1" {
      return VoiceFileCapture()
    }
    #endif
    return VoiceAudioRecorder()
  }
}

#if DEBUG && targetEnvironment(simulator)
@MainActor private final class VoiceFileCapture: VoiceAudioRecording {
  var finished: ((Bool) -> Void)?
  var level: Float { 0 }
  private let inline = ProcessInfo.processInfo.environment["NATIVE_E2E_VOICE_WAV"]
  private var file: URL { FileManager.default.temporaryDirectory.appendingPathComponent(
    inline == nil ? "native-e2e-voice.wav" : "native-e2e-voice-inline.wav") }
  func start(microphoneID: String) async throws {
    if let inline {
      guard inline.utf8.count <= 65_536, let data = Data(base64Encoded: inline) else { throw VoiceInputFailure.recording }
      try data.write(to: file, options: .atomic)
    }
    _ = try VoiceWav.canonical(file)
  }
  func stop() throws -> URL { _ = try VoiceWav.canonical(file); return file }
  func discard() { if inline != nil { try? FileManager.default.removeItem(at: file) } }
}
#endif
