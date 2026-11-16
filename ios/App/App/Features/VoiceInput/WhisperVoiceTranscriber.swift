import Foundation
@preconcurrency import WhisperKit

/// Core ML Whisper, matching the PWA's multilingual tiny/base model choices.
/// No microphone audio leaves this device for this backend.
actor WhisperVoiceTranscriber: VoiceTranscribing {
  func checkReady(_ options: VoiceInputPreferences) async throws { try Task.checkCancellation() }
  func cancel() async {}

  func transcribe(file: URL, options: VoiceInputPreferences,
    progress: @escaping @Sendable (VoiceInputProgress) -> Void) async throws -> String {
    try Task.checkCancellation()
    let base = try Self.modelDirectory()
    progress(.init(phase: .downloading))
    let folder = try await WhisperKit.download(variant: "openai_whisper-" + options.model.rawValue,
      downloadBase: base, progressCallback: { value in
        progress(.init(phase: .downloading, fraction: value.fractionCompleted))
      })
    try Task.checkCancellation()
    progress(.init(phase: .loading))
    var compute: ModelComputeOptions?
    #if targetEnvironment(simulator)
    compute = .init(melCompute: .cpuOnly, audioEncoderCompute: .cpuOnly, textDecoderCompute: .cpuOnly)
    #else
    if !options.hardwareAcceleration {
      compute = .init(melCompute: .cpuOnly, audioEncoderCompute: .cpuOnly, textDecoderCompute: .cpuOnly)
    }
    #endif
    let kit = try await WhisperKit(WhisperKitConfig(modelFolder: folder.path, computeOptions: compute,
      verbose: false, logLevel: .error, prewarm: false, load: true, download: false))
    try Task.checkCancellation()
    progress(.init(phase: .transcribing))
    let results = try await kit.transcribe(audioPath: file.path,
      decodeOptions: .init(language: options.language, skipSpecialTokens: true, withoutTimestamps: true,
        concurrentWorkerCount: 1)) { value in
      progress(.init(phase: .transcribing, partial: value.text))
      return !Task.isCancelled
    }
    try Task.checkCancellation()
    return results.map(\.text).joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private static func modelDirectory() throws -> URL {
    // Versioned by the exact Core ML consumer. A package/model-format upgrade
    // must deliberately retain or invalidate this cache.
    var directory = try FileManager.default.url(for: .applicationSupportDirectory,
      in: .userDomainMask, appropriateFor: nil, create: true)
      .appendingPathComponent("VoiceModels/whisperkit-1.1.1-v1", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    var values = URLResourceValues(); values.isExcludedFromBackup = true
    try directory.setResourceValues(values)
    return directory
  }
}

struct ComposerVoiceTranscriber: VoiceTranscribing {
  let local: any VoiceTranscribing
  let hex: any VoiceTranscribing
  func checkReady(_ options: VoiceInputPreferences) async throws {
    try await (options.backend == .onDevice ? local : hex).checkReady(options)
  }
  func transcribe(file: URL, options: VoiceInputPreferences,
    progress: @escaping @Sendable (VoiceInputProgress) -> Void) async throws -> String {
    try await (options.backend == .onDevice ? local : hex).transcribe(file: file, options: options, progress: progress)
  }
  func cancel() async { await local.cancel(); await hex.cancel() }
}
