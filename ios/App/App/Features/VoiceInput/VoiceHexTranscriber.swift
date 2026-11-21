import Foundation

actor VoiceHexTranscriber: VoiceTranscribing {
  private let gateway: any VoiceHexCalling
  private var jobID: String?
  init(gateway: any VoiceHexCalling) { self.gateway = gateway }

  func checkReady(_ options: VoiceInputPreferences) async throws {
    let result = try await gateway.call(.object(["action": .string("list"), "language": .string(options.language)]))
    guard result.objectValue?["kind"]?.stringValue == "catalog",
      let models = result.objectValue?["models"]?.arrayValue else { throw VoiceInputFailure.incompatible }
    guard models.contains(where: {
      let model = $0.objectValue
      return model?["id"]?.stringValue == options.hexModel && model?["installed"]?.boolValue == true
        && model?["verified"]?.boolValue == true
        && model?["languages"]?.arrayValue?.contains(.string(options.language)) == true
    }) else { throw VoiceInputFailure.hex("not_ready") }
  }

  func transcribe(file: URL, options: VoiceInputPreferences,
    progress: @escaping @Sendable (VoiceInputProgress) -> Void) async throws -> String {
    try await checkReady(options)
    let audio = try VoiceWav.canonical(file)
    let id = UUID().uuidString.lowercased()
    guard jobID == nil else { throw VoiceInputFailure.busy }
    jobID = id
    defer { if jobID == id { jobID = nil } }
    do {
      _ = try job(try await gateway.call(.object(["action": .string("begin"), "id": .string(id),
        "model": .string(options.hexModel), "language": .string(options.language)])), id: id)
      for offset in stride(from: 0, to: audio.count, by: VoiceWav.chunkBytes) {
        try Task.checkCancellation()
        let end = min(audio.count, offset + VoiceWav.chunkBytes)
        _ = try job(try await gateway.call(.object(["action": .string("append"), "id": .string(id),
          "offset": .number(Double(offset)), "audioBase64": .string(audio.subdata(in: offset..<end).base64EncodedString())])), id: id)
        progress(.init(phase: .uploading, fraction: Double(end) / Double(audio.count)))
      }
      var current = try job(try await gateway.call(.object(["action": .string("finish"), "id": .string(id)])), id: id)
      let deadline = ContinuousClock.now.advanced(by: .seconds(240))
      while true {
        try Task.checkCancellation()
        guard jobID == id else { throw CancellationError() }
        if current["phase"]?.stringValue == "done" { return current["transcript"]?.stringValue ?? "" }
        progress(.init(phase: current["phase"]?.stringValue == "loading" ? .loading : .transcribing,
          fraction: current["progress"]?.numberValue.map { $0 / 100 }))
        guard ContinuousClock.now < deadline else { throw VoiceInputFailure.hex("timeout") }
        try await Task.sleep(for: .milliseconds(400))
        current = try job(try await gateway.call(.object(["action": .string("status"), "id": .string(id)])), id: id)
      }
    } catch {
      // Cancellation is a fresh cleanup attempt; never replay an uncertain
      // append/finish request. The captured gateway still checks its host.
      let gateway = gateway
      _ = await Task { try? await gateway.call(.object(["action": .string("cancel"), "id": .string(id)])) }.value
      throw error
    }
  }

  func cancel() async {
    guard let id = jobID else { return }
    jobID = nil
    _ = try? await gateway.call(.object(["action": .string("cancel"), "id": .string(id)]))
  }

  private func job(_ value: JSONValue, id: String) throws -> [String: JSONValue] {
    guard value.objectValue?["kind"]?.stringValue == "job", let job = value.objectValue?["job"]?.objectValue,
      job["id"]?.stringValue == id else { throw VoiceInputFailure.incompatible }
    return job
  }
}
