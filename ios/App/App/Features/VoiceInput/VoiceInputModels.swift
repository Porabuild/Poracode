import Foundation

enum VoiceInputFailure: Error, Equatable {
  case microphoneDenied, microphoneUnavailable, busy, recording, transcription, noSpeech
  case hostUnavailable, incompatible, settingsIncompatible
  case hex(String)
}

struct VoiceInputOwner: Hashable {
  let lease: RichChatHostLease
  let conversationID: String
}

struct VoiceInputProgress: Sendable {
  enum Phase: Sendable { case downloading, loading, uploading, transcribing }
  let phase: Phase
  var fraction: Double?
  var partial: String?
}

protocol VoiceTranscribing: Sendable {
  func checkReady(_ options: VoiceInputPreferences) async throws
  func transcribe(file: URL, options: VoiceInputPreferences,
    progress: @escaping @Sendable (VoiceInputProgress) -> Void) async throws -> String
  func cancel() async
}

struct VoiceDraftSnapshot: Equatable {
  let text: String
  let selection: NSRange?

  /// A late transcript never replaces edits made since recording began.
  /// NSRange conversion also refuses a caret splitting a surrogate pair.
  func inserting(_ transcript: String, into current: String) -> (text: String, selection: NSRange) {
    let speech = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !speech.isEmpty else { return (current, NSRange(location: current.utf16.count, length: 0)) }
    let range = current == text ? selection.flatMap { value -> Range<String.Index>? in
      let count = current.utf16.count
      guard value.location >= 0, value.length >= 0, value.location <= count, value.length <= count - value.location,
        let range = Range(value, in: current),
        NSRange(range, in: current) == value,
        (range.lowerBound == current.endIndex || current.indices.contains(range.lowerBound)),
        (range.upperBound == current.endIndex || current.indices.contains(range.upperBound)) else { return nil }
      return range
    } : nil
    let insertion = range ?? current.endIndex..<current.endIndex
    let prefix = String(current[..<insertion.lowerBound])
    let suffix = String(current[insertion.upperBound...])
    let leading = prefix.last.map { $0.isWhitespace ? "" : " " } ?? ""
    let trailing = suffix.first.map { $0.isWhitespace ? "" : " " } ?? ""
    let added = leading + speech + trailing
    return (prefix + added + suffix, NSRange(location: prefix.utf16.count + added.utf16.count, length: 0))
  }
}
