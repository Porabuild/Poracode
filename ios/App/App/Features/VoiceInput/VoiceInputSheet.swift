import SwiftUI
import UIKit
import AVFAudio

struct VoiceInputSheet: View {
  private enum Destination: Hashable { case audio }
  let session: AppSession
  @Bindable var controller: VoiceInputController
  let insert: () -> Void
  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL
  @State private var started = Date()
  @State private var path: [Destination] = []

  var body: some View {
    NavigationStack(path: $path) {
      List {
        Section {
          Label(controller.options.backend == .onDevice ? VoiceStrings.local : VoiceStrings.host,
            systemImage: controller.options.backend == .onDevice ? "iphone" : "server.rack")
            .font(.subheadline)
          Text(controller.options.backend == .onDevice ? VoiceStrings.localHint : VoiceStrings.hostHint)
            .font(.footnote).foregroundStyle(.secondary)
        }
        Section {
          switch controller.phase {
          case .idle, .starting:
            ProgressView(VoiceStrings.starting)
          case .recording:
            TimelineView(.periodic(from: started, by: 0.15)) { time in
              VStack(alignment: .leading, spacing: 12) {
                Label(VoiceStrings.recording, systemImage: "record.circle.fill").foregroundStyle(.red)
                Text(controller.recordingStartedAt ?? started, style: .timer).monospacedDigit().font(.title2)
                ProgressView(value: Double(controller.inputLevel))
                  .accessibilityLabel(VoiceStrings.microphone)
                Text(VoiceStrings.recordingLimit).font(.footnote).foregroundStyle(.secondary)
              }
            }
            Button(VoiceStrings.stop, systemImage: "stop.fill") { controller.finishRecording() }
              .accessibilityIdentifier("native-e2e.voice.stop")
          case .transcribing:
            ProgressView(value: controller.progress?.fraction) {
              Text(controller.progress.map { VoiceStrings.phase($0.phase) } ?? VoiceStrings.transcribing)
            }
            if !controller.transcript.isEmpty { Text(controller.transcript).foregroundStyle(.secondary) }
          case .ready:
            TextEditor(text: $controller.transcript).frame(minHeight: 150)
              .accessibilityLabel(VoiceStrings.review)
              .accessibilityIdentifier("native-e2e.voice.transcript")
            Text(VoiceStrings.reviewHint).font(.footnote).foregroundStyle(.secondary)
          case .failed:
            if let failure = controller.failure { Text(VoiceStrings.failure(failure)).foregroundStyle(.secondary) }
            if controller.failure == .microphoneDenied {
              Text(VoiceStrings.microphoneHint).font(.footnote)
              Button(VoiceStrings.openSettings) {
                if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
              }
            }
            Button(VoiceStrings.retry) { started = Date(); controller.retry() }.disabled(!controller.canRetry)
          case .cancelled:
            EmptyView()
          }
        }
        Section { NavigationLink(VoiceStrings.audio, value: Destination.audio) }
      }
      .navigationDestination(for: Destination.self) { _ in AudioSettingsView(session: session) }
      .navigationTitle(controller.phase == .ready ? VoiceStrings.review : VoiceStrings.title)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(RichChatStrings.cancel) { controller.cancel(); dismiss() }
            .accessibilityIdentifier("native-e2e.voice.cancel")
        }
        if controller.phase == .ready {
          ToolbarItem(placement: .confirmationAction) {
            Button(VoiceStrings.confirm, action: insert)
              .disabled(controller.transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
              .accessibilityLabel(VoiceStrings.insert)
              .accessibilityIdentifier("native-e2e.voice.insert")
          }
        }
      }
    }
    .statusBarHidden(false)
    .poracodeFormSheetSizing()
    .presentationDetents([.large])
    .onAppear { controller.begin() }
    .onReceive(NotificationCenter.default.publisher(for: AVAudioSession.interruptionNotification)) { note in
      if note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt == AVAudioSession.InterruptionType.began.rawValue {
        controller.interrupted()
      }
    }
    .accessibilityIdentifier("native-e2e.voice.sheet")
  }
}
