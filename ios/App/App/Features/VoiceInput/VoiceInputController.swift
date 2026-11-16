import Foundation
import Observation

@MainActor @Observable final class VoiceInputController {
  enum Phase: Equatable { case idle, starting, recording, transcribing, ready, failed, cancelled }
  private(set) var phase: Phase = .idle
  private(set) var progress: VoiceInputProgress?
  private(set) var failure: VoiceInputFailure?
  private(set) var recordingStartedAt: Date?
  var transcript = ""
  let owner: VoiceInputOwner
  let options: VoiceInputPreferences
  private let recorder: any VoiceAudioRecording
  private let transcriber: any VoiceTranscribing
  private let currentOwner: @MainActor () -> VoiceInputOwner?
  private var work: Task<Void, Never>?
  private var revision: UInt64 = 0
  private var recorded: URL?

  init(owner: VoiceInputOwner, options: VoiceInputPreferences, recorder: any VoiceAudioRecording,
    transcriber: any VoiceTranscribing, currentOwner: @escaping @MainActor () -> VoiceInputOwner?) {
    self.owner = owner; self.options = options; self.recorder = recorder
    self.transcriber = transcriber; self.currentOwner = currentOwner
    recorder.finished = { [weak self] succeeded in
      guard let self, self.phase == .recording else { return }
      if succeeded { self.finishRecording() }
      else { self.failure = .recording; self.phase = .failed; self.recorder.discard() }
    }
  }

  var inputLevel: Float { recorder.level }
  var canRetry: Bool { work == nil && phase == .failed && currentOwner() == owner }

  func begin() {
    guard work == nil, phase == .idle, currentOwner() == owner else { return }
    phase = .starting; failure = nil
    let epoch = revision
    work = Task { [weak self] in
      guard let self else { return }
      defer { if self.revision == epoch { self.work = nil } }
      do {
        try await self.transcriber.checkReady(self.options)
        try Task.checkCancellation()
        guard self.currentOwner() == self.owner else { throw VoiceInputFailure.hostUnavailable }
        try await self.recorder.start(microphoneID: self.options.microphoneID)
        try Task.checkCancellation()
        guard self.revision == epoch, self.currentOwner() == self.owner else { throw CancellationError() }
        self.recordingStartedAt = Date()
        self.phase = .recording
      } catch {
        self.recorder.discard()
        guard self.revision == epoch else { return }
        self.failure = Self.problem(error); self.phase = .failed
      }
    }
  }

  func finishRecording() {
    guard phase == .recording, work == nil else { return }
    do {
      recorded = try recorder.stop()
      transcribe()
    } catch {
      failure = Self.problem(error); phase = .failed; recorder.discard()
    }
  }

  func interrupted() {
    if phase == .recording { finishRecording() }
  }

  func retry() {
    guard canRetry else { return }
    if recorded != nil { transcribe() }
    else { phase = .idle; begin() }
  }

  private func transcribe() {
    guard let recorded, work == nil, currentOwner() == owner else { return }
    phase = .transcribing; failure = nil; transcript = ""
    let epoch = revision
    work = Task { [weak self] in
      guard let self else { return }
      defer { if self.revision == epoch { self.work = nil } }
      do {
        let rawText = try await self.transcriber.transcribe(file: recorded, options: self.options) { [weak self] update in
          Task { @MainActor in
            guard let self, self.revision == epoch, self.phase == .transcribing, self.currentOwner() == self.owner else { return }
            self.progress = update
            if let partial = update.partial { self.transcript = partial }
          }
        }
        try Task.checkCancellation()
        guard self.revision == epoch, self.currentOwner() == self.owner else { throw CancellationError() }
        let text = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { throw VoiceInputFailure.noSpeech }
        self.transcript = text; self.phase = .ready
        self.recorder.discard(); self.recorded = nil
      } catch {
        guard self.revision == epoch else { return }
        self.failure = Self.problem(error); self.phase = .failed
      }
    }
  }

  func cancel() {
    revision &+= 1; work?.cancel(); work = nil
    recorder.discard(); recorded = nil; phase = .cancelled
    let transcriber = transcriber
    Task { await transcriber.cancel() }
  }

  private static func problem(_ error: Error) -> VoiceInputFailure {
    error as? VoiceInputFailure ?? .transcription
  }
}
