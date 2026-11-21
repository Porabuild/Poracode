import AVFAudio
import Foundation

@MainActor enum VoiceAudioSessionClaim {
  enum Purpose { case capture, routing }
  private static var owner: UUID?
  private static var purpose: Purpose?
  static var isCapturing: Bool { owner != nil && purpose == .capture }
  static var isRouting: Bool { owner != nil && purpose == .routing }
  static func acquire(_ candidate: UUID, purpose: Purpose = .capture) -> Bool {
    guard owner == nil else { return false }
    owner = candidate
    self.purpose = purpose
    return true
  }
  @discardableResult static func release(_ candidate: UUID) -> Bool {
    guard owner == candidate else { return false }
    owner = nil
    purpose = nil
    return true
  }
}

@MainActor protocol VoiceAudioRecording: AnyObject {
  var finished: ((Bool) -> Void)? { get set }
  var level: Float { get }
  func start(microphoneID: String) async throws
  func stop() throws -> URL
  func discard()
}

/// Uses the system recorder for bounded 16 kHz mono PCM16 WAV capture. Only
/// the folder minted by this recorder can be removed during cancellation.
@MainActor final class VoiceAudioRecorder: NSObject, VoiceAudioRecording, @preconcurrency AVAudioRecorderDelegate {
  static let maximumSeconds: TimeInterval = 300
  private let identity = UUID()
  private var recorder: AVAudioRecorder?
  private var folder: URL?
  private var previousCategory: AVAudioSession.Category?
  private var previousMode: AVAudioSession.Mode?
  private var previousOptions: AVAudioSession.CategoryOptions?
  var finished: ((Bool) -> Void)?

  var level: Float {
    guard let recorder, recorder.isRecording else { return 0 }
    recorder.updateMeters()
    return min(1, max(0, pow(10, recorder.averagePower(forChannel: 0) / 20)))
  }

  func start(microphoneID: String) async throws {
    guard VoiceAudioSessionClaim.acquire(identity) else { throw VoiceInputFailure.busy }
    do {
      guard await AVAudioApplication.requestRecordPermission() else { throw VoiceInputFailure.microphoneDenied }
      try Task.checkCancellation()
      let audio = AVAudioSession.sharedInstance()
      previousCategory = audio.category; previousMode = audio.mode; previousOptions = audio.categoryOptions
      try audio.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .allowBluetoothHFP])
      try audio.setActive(true)
      if !microphoneID.isEmpty {
        guard let input = audio.availableInputs?.first(where: { $0.uid == microphoneID }) else {
          throw VoiceInputFailure.microphoneUnavailable
        }
        try audio.setPreferredInput(input)
      } else { try audio.setPreferredInput(nil) }
      let folder = FileManager.default.temporaryDirectory.appendingPathComponent("poracode-voice-" + identity.uuidString, isDirectory: true)
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false,
        attributes: [.posixPermissions: 0o700, .protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
      self.folder = folder
      let recorder = try AVAudioRecorder(url: folder.appendingPathComponent("recording.wav"), settings: [
        AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 16_000,
        AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 16,
        AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsFloatKey: false,
      ])
      recorder.delegate = self
      recorder.isMeteringEnabled = true
      self.recorder = recorder
      guard recorder.prepareToRecord(), recorder.record(forDuration: Self.maximumSeconds) else { throw VoiceInputFailure.recording }
    } catch {
      discard()
      throw error
    }
  }

  func stop() throws -> URL {
    guard let recorder else { throw VoiceInputFailure.recording }
    recorder.delegate = nil
    recorder.stop()
    releaseAudioSession()
    let size = try recorder.url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
    guard size > 44, size <= VoiceWav.maximumSamples * 2 + 65_536 else { throw VoiceInputFailure.recording }
    return recorder.url
  }

  func discard() {
    recorder?.delegate = nil; recorder?.stop(); recorder = nil
    releaseAudioSession()
    if let folder { try? FileManager.default.removeItem(at: folder) }
    folder = nil
  }

  private func releaseAudioSession() {
    guard VoiceAudioSessionClaim.release(identity) else { return }
    let audio = AVAudioSession.sharedInstance()
    if let previousCategory, let previousMode, let previousOptions, audio.mode == .measurement {
      try? audio.setActive(false, options: .notifyOthersOnDeactivation)
      try? audio.setCategory(previousCategory, mode: previousMode, options: previousOptions)
    }
    previousCategory = nil; previousMode = nil; previousOptions = nil
  }

  func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
    guard self.recorder === recorder else { return }
    finished?(flag)
  }

  func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: (any Error)?) {
    guard self.recorder === recorder else { return }
    finished?(false)
  }
}
