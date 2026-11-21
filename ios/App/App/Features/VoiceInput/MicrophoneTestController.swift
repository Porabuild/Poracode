import AVFAudio
import Observation

@MainActor @Observable final class MicrophoneTestController {
  private(set) var active = false
  private(set) var starting = false
  private(set) var failure: VoiceInputFailure?
  private let recorder = VoiceAudioRecorder()
  private var work: Task<Void, Never>?
  var level: Float { recorder.level }

  init() { recorder.finished = { [weak self] _ in self?.stop() } }
  func start(_ microphoneID: String) {
    guard !starting, !active else { return }
    starting = true; failure = nil
    work = Task { [weak self] in
      guard let self else { return }
      defer { self.starting = false }
      do {
        try await self.recorder.start(microphoneID: microphoneID)
        try Task.checkCancellation()
        self.active = true
      } catch {
        self.recorder.discard()
        if !Task.isCancelled { self.failure = error as? VoiceInputFailure ?? .recording }
      }
    }
  }
  func stop() { work?.cancel(); recorder.discard(); active = false }
}
