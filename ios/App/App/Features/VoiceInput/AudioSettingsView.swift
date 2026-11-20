import AVFAudio
import SwiftUI
import UIKit

struct AudioSettingsView: View {
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.settingsSearchField) private var settingsSearchField
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  @Bindable var session: AppSession
  @Bindable private var preferences = VoicePreferencesStore.shared
  @State private var microphoneTest = MicrophoneTestController()
  @State private var microphones: [AVAudioSessionPortDescription] = []
  @State private var hex: HexVoiceSettingsController?
  @State private var confirmsRemoval = false
  @State private var routeFailure: VoiceInputFailure?
  @State private var dictationTest: VoiceInputController?
  @Environment(\.openURL) private var openURL

  private enum PreviewAnchor { case end, idleStart }

  var body: some View {
    ScrollViewReader { scroll in
      settingsForm
        .task(id: settingsSearchField) { await scroll.scrollToSetting(settingsSearchField) }
        .onGeometryChange(for: CGSize.self) { $0.size } action: { _ in
          if dictationInProgress || dictationTest?.phase == .ready {
            scroll.scrollTo(PreviewAnchor.end, anchor: .bottom)
          }
        }
        .onChange(of: dictationTest?.phase) { _, phase in
          if phase == .recording || phase == .ready {
            scroll.scrollTo(PreviewAnchor.end, anchor: .bottom)
          }
        }
    }
    .toolbar {
      if let test = dictationTest, dictationInProgress {
        if horizontalSizeClass == .regular {
          ToolbarItemGroup(placement: .topBarTrailing) { dictationControls(test) }
        } else {
          ToolbarItemGroup(placement: .bottomBar) { dictationControls(test) }
        }
      }
    }
    .poracodeDrawerListStyle()
    .navigationTitle(VoiceStrings.audio).navigationBarTitleDisplayMode(.inline)
    .task(id: hexActivationID) {
      guard preferences.value.backend == .hex, let lease = session.currentRichChatAccess?.lease else { hex = nil; return }
      let controller = HexVoiceSettingsController(gateway: session.makeVoiceHexGateway(lease: lease))
      hex = controller
      await controller.refresh(language: preferences.value.language)
    }
    .task(id: backgroundRefreshID) {
      guard let hex, !hex.busy else { return }
      while hex.isInstalling || hex.isPreparing {
        do { try await Task.sleep(for: .seconds(1)) } catch { return }
        if Task.isCancelled { return }
        await hex.refresh(language: preferences.value.language)
      }
    }
    .onChange(of: preferences.value.language) { _, language in Task { await hex?.refresh(language: language) } }
    .onChange(of: microphoneTest.active) { refreshMicrophones() }
    .onChange(of: preferences.value.microphoneID) { microphoneTest.stop() }
    .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.routeChangeNotification)) { _ in refreshMicrophones() }
    .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.interruptionNotification)) { _ in microphoneTest.stop() }
    .onAppear { refreshMicrophones() }
    .onChange(of: dictationScope) { clearDictationTest() }
    .onDisappear { stopAudioTests() }
    .onChange(of: scenePhase) { _, phase in if phase == .background { stopAudioTests() } }
    .confirmationDialog(VoiceStrings.removeTitle, isPresented: $confirmsRemoval, titleVisibility: .visible) {
      Button(VoiceStrings.remove, role: .destructive) { perform("remove_engine") }
      Button(RichChatStrings.cancel, role: .cancel) {}
    } message: { Text(VoiceStrings.removeBody) }
    .accessibilityIdentifier("native-e2e.audio.settings")
  }

  private var settingsForm: some View {
    Form {
      if preferences.incompatible {
        Section {
          Text(VoiceStrings.settingsIncompatible)
          Button(VoiceStrings.reset) { preferences.reset() }
        }
      }
      Group {
        Section {
          Toggle(VoiceStrings.showButton, isOn: $preferences.value.showButton).poracodeSwitchStyle()
            .settingsSearchAnchor(.dictationButton)
          if #available(iOS 26.0, *) {
            VoiceSystemInputPicker(selection: $preferences.value.microphoneID, failure: $routeFailure)
              .frame(minHeight: 44)
              .settingsSearchAnchor(.microphone)
          } else {
            Picker(VoiceStrings.microphone, selection: $preferences.value.microphoneID) {
              Text(VoiceStrings.systemDefault).tag("")
              ForEach(microphones, id: \.uid) { port in Text(port.portName).tag(port.uid) }
              if !preferences.value.microphoneID.isEmpty, !microphones.contains(where: { $0.uid == preferences.value.microphoneID }) {
                Text(VoiceStrings.microphoneUnavailable).tag(preferences.value.microphoneID)
              }
            }
            .settingsSearchAnchor(.microphone)
          }
          if microphoneTest.active {
            TimelineView(.periodic(from: .now, by: 0.15)) { _ in
              ProgressView(value: Double(microphoneTest.level)).accessibilityLabel(VoiceStrings.microphone)
            }
            Button(VoiceStrings.stop) { microphoneTest.stop() }
          } else {
            Button(VoiceStrings.testMicrophone) { microphoneTest.start(preferences.value.microphoneID) }
              .disabled(microphoneTest.starting || dictationInProgress)
              .accessibilityIdentifier("native-e2e.audio.test")
          }
          if let failure = microphoneTest.failure { Text(VoiceStrings.failure(failure)).foregroundStyle(.secondary) }
          if let routeFailure { Text(VoiceStrings.failure(routeFailure)).foregroundStyle(.secondary) }
          if microphoneTest.failure == .microphoneDenied || routeFailure == .microphoneDenied {
            Button(VoiceStrings.openSettings) {
              if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
            }
          }
        } header: { Text(VoiceStrings.microphone) }
        Section {
          Picker(VoiceStrings.language, selection: $preferences.value.language) {
            ForEach(VoiceInputPreferences.languages, id: \.self) { code in
              Text(Locale.current.localizedString(forLanguageCode: code) ?? code).tag(code)
            }
          }
          .settingsSearchAnchor(.dictationLanguage)
          Picker(VoiceStrings.backend, selection: $preferences.value.backend) {
            Text(VoiceStrings.local).tag(VoiceInputBackend.onDevice)
            Text(VoiceStrings.host).tag(VoiceInputBackend.hex)
          }
          .accessibilityIdentifier("native-e2e.audio.backend")
          .settingsSearchAnchor(.dictationBackend)
          if preferences.value.backend == .onDevice {
            Picker(VoiceStrings.model, selection: $preferences.value.model) {
              Text(VoiceStrings.tiny).tag(VoiceWhisperModel.tiny)
              Text(VoiceStrings.base).tag(VoiceWhisperModel.base)
            }
            .accessibilityIdentifier("native-e2e.audio.local-model")
            Toggle(VoiceStrings.acceleration, isOn: $preferences.value.hardwareAcceleration).poracodeSwitchStyle()
            Text(VoiceStrings.localHint).font(.footnote).foregroundStyle(.secondary)
          }
        } header: { Text(VoiceStrings.transcribing) }
        if preferences.value.backend == .hex { hostSettings }
        dictationTestSection
      }
      .disabled(preferences.incompatible)
    }
  }

  private struct DictationScope: Equatable {
    let options: VoiceInputPreferences
    let lease: RichChatHostLease?

    @MainActor init?(preferences: VoicePreferencesStore, session: AppSession) {
      guard !preferences.incompatible else { return nil }
      var options = preferences.value
      // Composer button visibility does not change how the test records.
      options.showButton = true
      self.options = options
      if options.backend == .hex {
        guard let access = session.currentRichChatAccess, access.controllerGate(.sessionOperate) == nil else { return nil }
        lease = access.lease
      } else {
        lease = nil
      }
    }
  }

  private var dictationScope: DictationScope? { DictationScope(preferences: preferences, session: session) }

  private var dictationInProgress: Bool {
    switch dictationTest?.phase {
    case .starting, .recording, .transcribing: true
    default: false
    }
  }

  private var dictationTestSection: some View {
    Section(VoiceStrings.testDictation) {
      Text(VoiceStrings.testDictationHint).font(.footnote).foregroundStyle(.secondary)
      if let test = dictationTest, dictationInProgress {
        VoiceInputActivity(controller: test).id(PreviewAnchor.end)
      } else {
        if let test = dictationTest, test.phase == .ready {
          Text(test.transcript)
            .textSelection(.enabled)
            .accessibilityIdentifier("native-e2e.audio.dictation.transcript")
          Button(VoiceStrings.clearTranscript) { clearDictationTest() }
        } else {
          Text(VoiceStrings.testTranscriptHint).font(.footnote).foregroundStyle(.secondary)
        }
        if let test = dictationTest, test.phase == .failed, let failure = test.failure {
          Text(VoiceStrings.failure(failure)).foregroundStyle(.secondary)
          if failure == .microphoneDenied {
            Button(VoiceStrings.openSettings) {
              if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
            }
          }
          Button(VoiceStrings.retry) { test.retry() }
            .disabled(!test.canRetry || microphoneTest.active || microphoneTest.starting)
        }
        Button(VoiceStrings.start, systemImage: "mic") { startDictationTest() }
          .disabled(dictationScope == nil || microphoneTest.active || microphoneTest.starting)
          .accessibilityIdentifier("native-e2e.audio.dictation.start")
          .id(dictationTest?.phase == .ready ? PreviewAnchor.end : PreviewAnchor.idleStart)
      }
    }
  }

  @ViewBuilder
  private func dictationControls(_ test: VoiceInputController) -> some View {
    if test.phase == .recording {
      Button(VoiceStrings.stop, systemImage: "stop.fill") { test.finishRecording() }
        .accessibilityIdentifier("native-e2e.audio.dictation.stop")
    }
    Button(RichChatStrings.cancel, systemImage: "xmark") { clearDictationTest() }
      .accessibilityIdentifier("native-e2e.audio.dictation.cancel")
  }

  private func startDictationTest() {
    guard !microphoneTest.active, !microphoneTest.starting, !dictationInProgress,
      let scope = dictationScope,
      let transcriber = session.makeVoiceTranscriber(for: scope.options.backend, lease: scope.lease)
    else { return }
    clearDictationTest()
    let test = VoiceInputController(options: scope.options, recorder: VoiceCaptureFactory.make(),
      transcriber: transcriber, isCurrent: { [weak session, preferences] in
        guard let session else { return false }
        return DictationScope(preferences: preferences, session: session) == scope
      })
    dictationTest = test
    test.begin()
  }

  private func clearDictationTest() {
    dictationTest?.cancel()
    dictationTest = nil
  }

  private func stopAudioTests() {
    microphoneTest.stop()
    clearDictationTest()
  }

  @ViewBuilder private var hostSettings: some View {
    Section {
      if let hex {
        Text(hex.setup?["hostName"]?.stringValue ?? session.currentSettingsHostSelection?.name ?? VoiceStrings.host)
          .font(.subheadline.weight(.medium))
        Text(VoiceStrings.hostHint).font(.footnote).foregroundStyle(.secondary)
        if let version = hex.engine["version"]?.stringValue {
          LabeledContent(VoiceStrings.value("Version"), value: version)
        }
        if let bytes = hex.engine["downloadBytes"]?.numberInt, bytes > 0 {
          LabeledContent(VoiceStrings.value("Download size"),
            value: ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file))
        }
        if let failure = hex.failure { Text(VoiceStrings.failure(failure)).foregroundStyle(.secondary) }
        if hex.isInstalling || hex.isPreparing {
          ProgressView(value: (hex.isInstalling ? hex.engine["progress"] : hex.preparation?["progress"])?.numberValue.map { $0 / 100 }) {
            Text(hex.isInstalling ? VoiceStrings.installing : VoiceStrings.preparing)
          }
          Button(RichChatStrings.cancel) { perform(hex.isInstalling ? "cancel_install" : "cancel") }
        } else if hex.engine["state"]?.stringValue == "unsupported" {
          Text(VoiceStrings.failure(.hex("unsupported"))).foregroundStyle(.secondary)
        } else if hex.setup != nil, hex.engine["state"]?.stringValue != "installed" {
          Button(VoiceStrings.install) { perform("install") }.disabled(hex.busy)
            .accessibilityIdentifier("native-e2e.audio.hex.install")
        }
        if !hex.models.isEmpty {
          Picker(VoiceStrings.model, selection: $preferences.value.hexModel) {
            ForEach(hex.models, id: \.self) { model in
              if let id = model["id"]?.stringValue {
                Text(model["name"]?.stringValue ?? id).tag(id)
              }
            }
            if !hex.models.contains(where: { $0["id"]?.stringValue == preferences.value.hexModel }) {
              Text(preferences.value.hexModel).tag(preferences.value.hexModel)
            }
          }.disabled(hex.busy)
          Button(VoiceStrings.prepare) { perform("prepare") }
            .disabled(hex.busy || hex.engine["state"]?.stringValue != "installed")
            .accessibilityIdentifier("native-e2e.audio.hex.prepare")
          if let model = hex.models.first(where: { $0["id"]?.stringValue == preferences.value.hexModel }) {
            let ready = model["installed"]?.boolValue == true && model["verified"]?.boolValue == true
            Label(ready ? VoiceStrings.ready : VoiceStrings.setupRequired,
              systemImage: model["verified"]?.boolValue == true ? "checkmark.circle" : "arrow.down.circle")
              .foregroundStyle(.secondary)
              .accessibilityElement(children: .ignore)
              .accessibilityLabel(VoiceStrings.model)
              .accessibilityValue(ready ? VoiceStrings.ready : VoiceStrings.setupRequired)
              .accessibilityIdentifier("native-e2e.audio.hex.status")
          }
        }
        Button(HomeStrings.refresh) { Task { await hex.refresh(language: preferences.value.language) } }.disabled(hex.busy)
        if hex.engine["source"]?.stringValue == "managed", hex.engine["state"]?.stringValue == "installed" {
          Button(VoiceStrings.remove, role: .destructive) { confirmsRemoval = true }.disabled(hex.busy)
        }
      } else { Text(VoiceStrings.sourceChanged).foregroundStyle(.secondary) }
    } header: { Text(VoiceStrings.setup) }
  }

  private func perform(_ action: String) {
    guard let controller = hex else { return }
    let options = preferences.value
    Task { await controller.perform(action, model: options.hexModel, language: options.language) }
  }
  private var hexActivationID: String {
    let lease = session.currentRichChatAccess?.lease
    return "\(lease?.connectionID.rawValue ?? ""):\(lease?.generation ?? 0):\(preferences.value.backend.rawValue)"
  }
  private var backgroundRefreshID: String {
    "\(hexActivationID):\(hex?.busy == true):\(hex?.isInstalling == true):\(hex?.isPreparing == true)"
  }
  private func refreshMicrophones() {
    let audio = AVAudioSession.sharedInstance()
    var seen = Set<String>()
    microphones = ((audio.availableInputs ?? []) + audio.currentRoute.inputs).filter { seen.insert($0.uid).inserted }
  }
}
