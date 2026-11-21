import XCTest
import AVFAudio
@testable import App

@MainActor final class VoiceInputTests: XCTestCase {
  func testRetainedSideCaptureSurvivesAReplacementPresenterButCancelsWhenHidden() async throws {
    let (session, _, _) = try await makeSession(apiFactory: { FakeRemoteAPI(endpoint: $0, accessToken: $1) })
    let state = ComposerVoiceState(session: session)
    let owner = VoiceInputOwner(lease: RichChatControllerTestValues.access().lease, conversationID: "side")
    var presented = true
    state.ownerIsPresented = { presented }
    state.updateOwners([owner])
    let recorder = VoiceRecorderDouble()
    let controller = VoiceInputController(owner: owner, options: .init(), recorder: recorder,
      transcriber: VoiceTranscriberDouble(), currentOwner: { state.owns(owner) ? owner : nil })
    let request = ComposerVoiceRequest(owner: owner, controller: controller, commit: { _ in XCTFail("Hidden capture committed") })
    state.request = request
    let old = UUID(), replacement = UUID()
    state.presenterAppeared(old)
    controller.begin()
    await settle { controller.phase == .recording }
    state.updateOwners([])
    state.presenterDisappeared(old)
    await Task.yield()
    XCTAssertTrue(state.owns(owner), "Logical presentation covers the gap between old and new views")
    state.presenterAppeared(replacement)
    state.dismiss(request, from: old)
    state.dismiss(request, from: replacement)
    XCTAssertTrue(state.request === request)
    XCTAssertEqual(controller.phase, .recording)
    XCTAssertEqual(recorder.discards, 0)
    presented = false
    state.refreshOwnership()
    XCTAssertNil(state.request)
    XCTAssertEqual(controller.phase, .cancelled)
    XCTAssertEqual(recorder.discards, 1)
  }

  func testRetiredVoiceSheetCannotDismissItsReplacementRequest() async throws {
    let (session, _, _) = try await makeSession(apiFactory: { FakeRemoteAPI(endpoint: $0, accessToken: $1) })
    let state = ComposerVoiceState(session: session)
    let owner = VoiceInputOwner(lease: RichChatControllerTestValues.access().lease, conversationID: "current")
    state.updateOwners([owner])
    let first = VoiceInputController(owner: owner, options: .init(), recorder: VoiceRecorderDouble(),
      transcriber: VoiceTranscriberDouble(), currentOwner: { owner })
    let secondRecorder = VoiceRecorderDouble()
    let second = VoiceInputController(owner: owner, options: .init(), recorder: secondRecorder,
      transcriber: VoiceTranscriberDouble(), currentOwner: { owner })
    let retired = ComposerVoiceRequest(owner: owner, controller: first, commit: { _ in })
    state.request = retired
    state.close(retired)
    let replacement = ComposerVoiceRequest(owner: owner, controller: second, commit: { _ in })
    state.request = replacement
    state.close(retired)
    XCTAssertTrue(state.request === replacement)
    XCTAssertEqual(secondRecorder.discards, 0)
    state.close(replacement)
    XCTAssertNil(state.request)
    XCTAssertEqual(secondRecorder.discards, 1)
  }

  func testRemovingTheOwningComposerCancelsItsRecording() async throws {
    let (session, _, _) = try await makeSession(apiFactory: { FakeRemoteAPI(endpoint: $0, accessToken: $1) })
    let state = ComposerVoiceState(session: session)
    let owner = VoiceInputOwner(lease: RichChatControllerTestValues.access().lease, conversationID: "removed")
    let recorder = VoiceRecorderDouble()
    let controller = VoiceInputController(owner: owner, options: .init(), recorder: recorder,
      transcriber: VoiceTranscriberDouble(), currentOwner: { owner })
    state.updateOwners([owner])
    state.request = ComposerVoiceRequest(owner: owner, controller: controller, commit: { _ in XCTFail("Cancelled recording committed") })
    controller.begin()
    await settle { controller.phase == .recording }
    state.updateOwners([])
    await settle { state.request == nil }
    XCTAssertEqual(controller.phase, .cancelled)
    XCTAssertEqual(recorder.discards, 1)
  }

  func testAudioSessionSelectionCannotStealAnotherWindowsCaptureClaim() {
    let first = UUID(), second = UUID()
    XCTAssertTrue(VoiceAudioSessionClaim.acquire(first))
    XCTAssertFalse(VoiceAudioSessionClaim.acquire(second))
    XCTAssertFalse(VoiceAudioSessionClaim.release(second))
    XCTAssertTrue(VoiceAudioSessionClaim.release(first))
    XCTAssertTrue(VoiceAudioSessionClaim.acquire(second))
    XCTAssertTrue(VoiceAudioSessionClaim.release(second))
  }
  func testDevicePreferencesRoundTripWithoutRewritingFutureData() throws {
    let name = "voice-unit-" + UUID().uuidString
    let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
    defer { defaults.removePersistentDomain(forName: name) }
    let store = VoicePreferencesStore(defaults: defaults)
    XCTAssertNil(defaults.data(forKey: VoicePreferencesStore.key), "reading defaults is not a write")
    store.value.model = .base; store.value.language = "uk"; store.value.microphoneID = "usb-input"
    let reopened = VoicePreferencesStore(defaults: defaults)
    XCTAssertEqual(reopened.value, store.value)
    let future = Data(#"{"version":2,"settings":{"future":"opaque"}}"#.utf8)
    defaults.set(future, forKey: VoicePreferencesStore.key)
    let oldClient = VoicePreferencesStore(defaults: defaults)
    XCTAssertTrue(oldClient.incompatible)
    oldClient.value.language = "fr"
    XCTAssertEqual(defaults.data(forKey: VoicePreferencesStore.key), future)
    oldClient.reset()
    XCTAssertFalse(oldClient.incompatible)
    XCTAssertEqual(VoicePreferencesStore(defaults: defaults).value.language, "en")
  }

  func testPreferenceEditsPreserveUnknownSameVersionFields() throws {
    let name = "voice-unit-" + UUID().uuidString
    let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
    defer { defaults.removePersistentDomain(forName: name) }
    let preferences = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(VoiceInputPreferences()))
    var value = try XCTUnwrap(preferences.objectValue)
    value["futureSetting"] = .string("keep")
    let wire = JSONValue.object(["version": .number(1), "settings": .object(value), "futureMetadata": .bool(true)])
    defaults.set(try JSONEncoder().encode(wire), forKey: VoicePreferencesStore.key)
    let store = VoicePreferencesStore(defaults: defaults)
    store.value.showButton = false
    let saved = try JSONDecoder().decode(JSONValue.self, from: XCTUnwrap(defaults.data(forKey: VoicePreferencesStore.key)))
    XCTAssertEqual(saved.objectValue?["futureMetadata"], .bool(true))
    XCTAssertEqual(saved.objectValue?["settings"]?.objectValue?["futureSetting"], .string("keep"))
  }

  func testDictationUsesTheCaretAndPreservesNewerDraftEdits() {
    let snapshot = VoiceDraftSnapshot(text: "Hello 🌍 friend", selection: NSRange(location: 6, length: 2))
    XCTAssertEqual(snapshot.inserting("world", into: snapshot.text).text, "Hello world friend")
    let changed = "Hello 🌍 friend — edited elsewhere"
    XCTAssertEqual(snapshot.inserting("spoken words", into: changed).text, changed + " spoken words")
    let invalid = VoiceDraftSnapshot(text: "🌍", selection: NSRange(location: 1, length: 0))
    XCTAssertEqual(invalid.inserting("safe", into: invalid.text).text, "🌍 safe")
  }

  func testRecordedWavIsCanonicalAndRejectsUnsupportedAudio() throws {
    let folder = try temporaryFolder()
    defer { try? FileManager.default.removeItem(at: folder) }
    let file = folder.appendingPathComponent("input.wav")
    let wave = Self.wave()
    try wave.write(to: file)
    XCTAssertEqual(try VoiceWav.canonical(file), wave)
    var wrongRate = wave; wrongRate[24] = 1
    try wrongRate.write(to: file)
    XCTAssertThrowsError(try VoiceWav.canonical(file))
    try wave.prefix(30).write(to: file)
    XCTAssertThrowsError(try VoiceWav.canonical(file))
  }

  func testSystemPcmWriterProducesUploadableCanonicalAudio() throws {
    let folder = try temporaryFolder()
    defer { try? FileManager.default.removeItem(at: folder) }
    let url = folder.appendingPathComponent("system.wav")
    do {
      let file = try AVAudioFile(forWriting: url, settings: [AVFormatIDKey: kAudioFormatLinearPCM,
        AVSampleRateKey: 16_000, AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 16,
        AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false])
      let buffer = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: 160))
      buffer.frameLength = 160
      buffer.floatChannelData?.pointee.initialize(repeating: 0, count: 160)
      try file.write(from: buffer)
    }
    let upload = try VoiceWav.canonical(url)
    XCTAssertEqual(upload.count, 44 + 160 * 2)
    XCTAssertEqual(upload.prefix(4), Data("RIFF".utf8))
  }

  func testHexGatewayRejectsRetiredHostResultsAndNeverFallsBack() async throws {
    let a = RichChatControllerTestValues.access(), b = RichChatControllerTestValues.access(host: RichChatControllerTestValues.hostB)
    let api = VoiceHexAPIDouble(), other = VoiceHexAPIDouble()
    var selected: VoiceHexSelection? = .init(lease: a.lease, canOperate: true, api: api)
    let gateway = SelectedVoiceHexGateway(lease: a.lease, selection: { selected })
    let request = Task { try await gateway.call(.object(["action": .string("setup")])) }
    await settle { await api.waiting }
    selected = .init(lease: b.lease, canOperate: true, api: other)
    await api.complete(.object(["kind": .string("cancelled")]))
    do { _ = try await request.value; XCTFail("Retired host accepted") }
    catch { XCTAssertEqual(error as? VoiceInputFailure, .hostUnavailable) }
    let calls = await other.calls
    XCTAssertEqual(calls, 0)
  }

  func testOlderHostProcedureRefusalIsReportedWithoutRetry() async throws {
    let access = RichChatControllerTestValues.access()
    let api = VoiceHexAPIDouble()
    await api.reject(.init(message: "fixture old host", status: 404, code: "procedure_not_found"))
    let gateway = SelectedVoiceHexGateway(lease: access.lease) { .init(lease: access.lease, canOperate: true, api: api) }
    do { _ = try await gateway.call(.object(["action": .string("setup")])); XCTFail("Old host accepted") }
    catch { XCTAssertEqual(error as? VoiceInputFailure, .incompatible) }
    let calls = await api.calls
    XCTAssertEqual(calls, 1)
  }

  func testRecorderCompletionPublishesOnlyToItsOriginalOwnerAndIgnoresLatePartials() async throws {
    let owner = VoiceInputOwner(lease: RichChatControllerTestValues.access().lease, conversationID: "original")
    var current: VoiceInputOwner? = owner
    let recorder = VoiceRecorderDouble(), engine = VoiceTranscriberDouble()
    let controller = VoiceInputController(owner: owner, options: .init(), recorder: recorder,
      transcriber: engine, currentOwner: { current })
    controller.begin()
    await settle { controller.phase == .recording }
    controller.finishRecording()
    await settle { await engine.waiting }
    await engine.complete("Full spoken message")
    await settle { controller.phase == .ready }
    await engine.partial("older partial")
    await Task.yield()
    XCTAssertEqual(controller.transcript, "Full spoken message")
    XCTAssertEqual(recorder.discards, 1)
    current = .init(lease: owner.lease, conversationID: "replacement")
    controller.cancel()
    XCTAssertEqual(controller.phase, .cancelled)
  }

  func testAHostSwitchWhileTranscribingCannotPublishIntoTheReplacementConversation() async {
    let owner = VoiceInputOwner(lease: RichChatControllerTestValues.access().lease, conversationID: "original")
    var current: VoiceInputOwner? = owner
    let recorder = VoiceRecorderDouble(), engine = VoiceTranscriberDouble()
    let controller = VoiceInputController(owner: owner, options: .init(), recorder: recorder,
      transcriber: engine, currentOwner: { current })
    controller.begin()
    await settle { controller.phase == .recording }
    controller.finishRecording()
    await settle { await engine.waiting }
    current = .init(lease: RichChatControllerTestValues.access(host: RichChatControllerTestValues.hostB).lease, conversationID: "original")
    controller.cancel()
    await engine.complete("Must not reach the new host")
    await Task.yield()
    XCTAssertEqual(controller.phase, .cancelled)
    XCTAssertTrue(controller.transcript.isEmpty)
  }

  func testOnDevicePreviewCanSelectItsEngineWithoutAHostLease() async throws {
    let (session, _, _) = try await makeSession(apiFactory: { FakeRemoteAPI(endpoint: $0, accessToken: $1) })
    XCTAssertTrue(session.makeVoiceTranscriber(for: .onDevice, lease: nil) is WhisperVoiceTranscriber)
    XCTAssertNil(session.makeVoiceTranscriber(for: .hex, lease: nil))
  }

  func testAudioInterruptionFinishesIntoReviewWithoutCommittingADraft() async {
    let owner = VoiceInputOwner(lease: RichChatControllerTestValues.access().lease, conversationID: "original")
    let recorder = VoiceRecorderDouble(), engine = VoiceTranscriberDouble()
    let controller = VoiceInputController(owner: owner, options: .init(), recorder: recorder,
      transcriber: engine, currentOwner: { owner })
    controller.begin()
    await settle { controller.phase == .recording }
    controller.interrupted()
    await settle { await engine.waiting }
    await engine.complete("Captured before interruption")
    await settle { controller.phase == .ready }
    XCTAssertEqual(controller.transcript, "Captured before interruption")
    XCTAssertEqual(recorder.discards, 1)
  }

  func testHexUploadsCanonicalChunksAndNeverResendsAnUncertainAppend() async throws {
    let directory = try temporaryFolder()
    defer { try? FileManager.default.removeItem(at: directory) }
    let file = directory.appendingPathComponent("speech.wav")
    try Self.wave().write(to: file)
    let gateway = VoiceHexDouble(), engine = VoiceHexTranscriber(gateway: gateway)
    let text = try await engine.transcribe(file: file, options: .init()) { _ in }
    XCTAssertEqual(text, "Host transcript")
    let requests = await gateway.requests
    XCTAssertEqual(requests.compactMap { $0.objectValue?["action"]?.stringValue }, ["list", "begin", "append", "finish"])
    let sent = try XCTUnwrap(requests.first { $0.objectValue?["action"] == .string("append") }?.objectValue)
    XCTAssertEqual(Data(base64Encoded: try XCTUnwrap(sent["audioBase64"]?.stringValue)), Self.wave())
    let failing = VoiceHexDouble(failAppend: true)
    do { _ = try await VoiceHexTranscriber(gateway: failing).transcribe(file: file, options: .init()) { _ in }; XCTFail("Uncertain append accepted") }
    catch {}
    let actions = await failing.requests.compactMap { $0.objectValue?["action"]?.stringValue }
    XCTAssertEqual(actions, ["list", "begin", "append", "cancel"])
  }

  private func temporaryFolder() throws -> URL {
    let path = FileManager.default.temporaryDirectory.appendingPathComponent("voice-tests-" + UUID().uuidString)
    try FileManager.default.createDirectory(at: path, withIntermediateDirectories: false)
    return path
  }
  private func settle(_ condition: () async -> Bool) async {
    for _ in 0..<500 { if await condition() { return }; await Task.yield() }
    XCTFail("Voice operation did not settle")
  }
  private static func wave() -> Data {
    // 16 kHz PCM16 mono, one sample. Golden RIFF header, not a model output.
    Data([82,73,70,70,38,0,0,0,87,65,86,69,102,109,116,32,16,0,0,0,1,0,1,0,
      128,62,0,0,0,125,0,0,2,0,16,0,100,97,116,97,2,0,0,0,0,0])
  }
}

@MainActor private final class VoiceRecorderDouble: VoiceAudioRecording {
  var finished: ((Bool) -> Void)?
  var level: Float { 0.5 }
  var discards = 0
  func start(microphoneID: String) async throws {}
  func stop() throws -> URL { URL(fileURLWithPath: "/fixture/owned.wav") }
  func discard() { discards += 1 }
}

private actor VoiceTranscriberDouble: VoiceTranscribing {
  private var continuation: CheckedContinuation<String, any Error>?
  private var progress: (@Sendable (VoiceInputProgress) -> Void)?
  var waiting: Bool { continuation != nil }
  func checkReady(_ options: VoiceInputPreferences) async throws {}
  func cancel() async {}
  func transcribe(file: URL, options: VoiceInputPreferences,
    progress: @escaping @Sendable (VoiceInputProgress) -> Void) async throws -> String {
    self.progress = progress
    return try await withCheckedThrowingContinuation { continuation = $0 }
  }
  func complete(_ text: String) { continuation?.resume(returning: text); continuation = nil }
  func partial(_ text: String) { progress?(.init(phase: .transcribing, partial: text)) }
}

private actor VoiceHexDouble: VoiceHexCalling {
  private(set) var requests: [JSONValue] = []
  let failAppend: Bool
  init(failAppend: Bool = false) { self.failAppend = failAppend }
  func call(_ payload: JSONValue) async throws -> JSONValue {
    requests.append(payload)
    let value = payload.objectValue ?? [:], action = value["action"]?.stringValue ?? ""
    if action == "list" {
      return .object(["kind": .string("catalog"), "models": .array([.object(["id": .string("parakeet_v3"),
        "installed": .bool(true), "verified": .bool(true), "languages": .array([.string("en")])])])])
    }
    if action == "cancel" { return .object(["kind": .string("cancelled")]) }
    if action == "append", failAppend { throw VoiceInputFailure.hostUnavailable }
    return .object(["kind": .string("job"), "job": .object(["id": value["id"] ?? .null,
      "phase": .string(action == "finish" ? "done" : "uploading"), "transcript": .string("Host transcript")])])
  }
}

private actor VoiceHexAPIDouble: VoiceHexAPI {
  private(set) var calls = 0
  private var continuation: CheckedContinuation<JSONValue, any Error>?
  private var failure: RemoteClientError?
  var waiting: Bool { continuation != nil }
  func reject(_ error: RemoteClientError) { failure = error }
  func voiceHex(_ payload: JSONValue) async throws -> JSONValue {
    calls += 1
    if let failure { throw failure }
    return try await withCheckedThrowingContinuation { continuation = $0 }
  }
  func complete(_ value: JSONValue) { continuation?.resume(returning: value); continuation = nil }
}
