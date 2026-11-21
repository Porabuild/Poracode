import AVFAudio
import AVKit
import SwiftUI

/// iOS 26's native audio input menu includes current devices, level metering
/// and microphone modes. Earlier systems retain the ordinary settings picker.
@available(iOS 26.0, *)
struct VoiceSystemInputPicker: UIViewRepresentable {
  @Binding var selection: String
  @Binding var failure: VoiceInputFailure?
  func makeCoordinator() -> Coordinator { Coordinator(owner: self) }
  func makeUIView(context: Context) -> UIButton {
    let button = UIButton(type: .system)
    let interaction = AVInputPickerInteraction()
    interaction.delegate = context.coordinator
    button.addInteraction(interaction)
    context.coordinator.interaction = interaction
    button.addTarget(context.coordinator, action: #selector(Coordinator.present), for: .touchUpInside)
    button.accessibilityIdentifier = "native-e2e.audio.microphone-picker"
    return button
  }
  func updateUIView(_ button: UIButton, context: Context) {
    context.coordinator.owner = self
    let audio = AVAudioSession.sharedInstance()
    let selected = audio.availableInputs?.first { $0.uid == selection }?.portName ?? VoiceStrings.systemDefault
    var configuration = UIButton.Configuration.plain()
    configuration.title = VoiceStrings.microphone
    configuration.subtitle = selected
    configuration.image = UIImage(systemName: "mic")
    configuration.imagePadding = 10
    configuration.titleAlignment = .leading
    button.configuration = configuration
    button.contentHorizontalAlignment = .leading
    button.accessibilityLabel = VoiceStrings.microphone + ", " + selected
  }
  static func dismantleUIView(_ view: UIButton, coordinator: Coordinator) {
    coordinator.mounted = false
    coordinator.interaction?.dismiss()
    coordinator.restore()
  }

  @MainActor final class Coordinator: NSObject, @preconcurrency AVInputPickerInteraction.Delegate {
    var owner: VoiceSystemInputPicker
    var mounted = true
    var interaction: AVInputPickerInteraction?
    private let routeOwner = UUID()
    private var previous: (AVAudioSession.Category, AVAudioSession.Mode, AVAudioSession.CategoryOptions)?
    init(owner: VoiceSystemInputPicker) { self.owner = owner }

    @objc func present() {
      Task { @MainActor [weak self] in
        guard let self else { return }
        let allowed = await AVAudioApplication.requestRecordPermission()
        guard self.mounted else { return }
        guard allowed else { self.owner.failure = .microphoneDenied; return }
        let audio = AVAudioSession.sharedInstance()
        do {
          guard !VoiceAudioSessionClaim.isRouting else { throw VoiceInputFailure.busy }
          if !VoiceAudioSessionClaim.isCapturing {
            guard VoiceAudioSessionClaim.acquire(self.routeOwner, purpose: .routing) else { throw VoiceInputFailure.busy }
            self.previous = (audio.category, audio.mode, audio.categoryOptions)
          }
          if audio.category != .record && audio.category != .playAndRecord {
            guard self.previous != nil else { throw VoiceInputFailure.busy }
            try audio.setCategory(.playAndRecord, mode: .measurement, options: [.allowBluetoothHFP])
          }
          self.owner.failure = nil
          self.interaction?.present()
        } catch {
          self.owner.failure = error as? VoiceInputFailure ?? .microphoneUnavailable
          self.restore()
        }
      }
    }

    func inputPickerInteractionDidEndDismissing(_ inputPickerInteraction: AVInputPickerInteraction) {
      if mounted { owner.selection = AVAudioSession.sharedInstance().preferredInput?.uid ?? "" }
      restore()
    }
    func restore() {
      if let previous, VoiceAudioSessionClaim.release(routeOwner) {
        let audio = AVAudioSession.sharedInstance()
        if audio.category == .playAndRecord || audio.category == previous.0 {
          try? audio.setCategory(previous.0, mode: previous.1, options: previous.2)
        }
      }
      previous = nil
    }
  }
}
