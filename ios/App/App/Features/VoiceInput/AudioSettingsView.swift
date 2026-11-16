import AVFAudio
import SwiftUI
import UIKit

struct AudioSettingsView: View {
  @Environment(\.scenePhase) private var scenePhase
  @Bindable var session: AppSession
  @Bindable private var preferences = VoicePreferencesStore.shared
  @State private var microphoneTest = MicrophoneTestController()
  @State private var microphones: [AVAudioSessionPortDescription] = []
  @State private var hex: HexVoiceSettingsController?
  @State private var confirmsRemoval = false
  @State private var routeFailure: VoiceInputFailure?
  @Environment(\.openURL) private var openURL

  var body: some View {
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
          if #available(iOS 26.0, *) {
            VoiceSystemInputPicker(selection: $preferences.value.microphoneID, failure: $routeFailure)
              .frame(minHeight: 44)
          } else {
            Picker(VoiceStrings.microphone, selection: $preferences.value.microphoneID) {
              Text(VoiceStrings.systemDefault).tag("")
              ForEach(microphones, id: \.uid) { port in Text(port.portName).tag(port.uid) }
              if !preferences.value.microphoneID.isEmpty, !microphones.contains(where: { $0.uid == preferences.value.microphoneID }) {
                Text(VoiceStrings.microphoneUnavailable).tag(preferences.value.microphoneID)
              }
            }
          }
          if microphoneTest.active {
            TimelineView(.periodic(from: .now, by: 0.15)) { _ in
              ProgressView(value: Double(microphoneTest.level)).accessibilityLabel(VoiceStrings.microphone)
            }
            Button(VoiceStrings.stop) { microphoneTest.stop() }
          } else {
            Button(VoiceStrings.testMicrophone) { microphoneTest.start(preferences.value.microphoneID) }
              .disabled(microphoneTest.starting)
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
          Picker(VoiceStrings.backend, selection: $preferences.value.backend) {
            Text(VoiceStrings.local).tag(VoiceInputBackend.onDevice)
            Text(VoiceStrings.host).tag(VoiceInputBackend.hex)
          }
          .accessibilityIdentifier("native-e2e.audio.backend")
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
      }
      .disabled(preferences.incompatible)
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
    .onDisappear { microphoneTest.stop() }
    .onChange(of: scenePhase) { _, phase in if phase == .background { microphoneTest.stop() } }
    .confirmationDialog(VoiceStrings.removeTitle, isPresented: $confirmsRemoval, titleVisibility: .visible) {
      Button(VoiceStrings.remove, role: .destructive) { perform("remove_engine") }
      Button(RichChatStrings.cancel, role: .cancel) {}
    } message: { Text(VoiceStrings.removeBody) }
    .accessibilityIdentifier("native-e2e.audio.settings")
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
