import PhotosUI
import SwiftUI
import UIKit

/// Full-screen pairing-code scanner.
///
/// A decoded code is validated with `PairingURL` and handed back to the caller, which
/// submits it through the *same* path as a pasted link, so validation and the
/// pending-pairing consent card still run. This screen never pairs on its own, and
/// every failure state offers both fallbacks instead of dead-ending.
struct PairingScannerView: View {
  let onCandidate: (PairingURL.PairingCandidate) -> Void
  let onUsePairingLink: () -> Void
  let onUseManualEntry: () -> Void

  @Environment(\.dismiss) private var dismiss
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var model = PairingScannerModel()
  @State private var isShowingPhotoPicker = false
  @State private var selectedPhoto: PhotosPickerItem?
  @State private var isDecodingPhoto = false
  @State private var photoError: String?

  var body: some View {
    NavigationStack {
      ZStack {
        Color.black.ignoresSafeArea()
        content
      }
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(OnboardingStrings.scanClose, systemImage: "xmark") { dismiss() }
            .accessibilityIdentifier("native-e2e.pair.scan.close")
        }
        if model.phase != .preparing {
          ToolbarItemGroup(placement: .bottomBar) {
            Button(
              isDecodingPhoto ? OnboardingStrings.scanPhotoReading : OnboardingStrings.scanPhoto,
              systemImage: isDecodingPhoto ? "hourglass" : "photo"
            ) { isShowingPhotoPicker = true }
              .disabled(isDecodingPhoto)
              .accessibilityIdentifier("native-e2e.pair.scan.photo")
            Button(OnboardingStrings.scanUsePairingLink, systemImage: "link") {
              onUsePairingLink()
              dismiss()
            }
            .accessibilityIdentifier("native-e2e.pair.scan.use-link")
            if model.phase != .scanning {
              Button(OnboardingStrings.manualTitle, systemImage: "keyboard") {
                onUseManualEntry()
                dismiss()
              }
              .accessibilityIdentifier("native-e2e.pair.scan.use-manual")
            }
          }
        }
      }
      .photosPicker(isPresented: $isShowingPhotoPicker, selection: $selectedPhoto, matching: .images)
    }
    .foregroundStyle(.white, .white.opacity(0.7))
    .tint(.white)
    .preferredColorScheme(.dark)
    .task { await model.start() }
    .onDisappear { model.stop() }
    .onChange(of: model.accepted) { _, candidate in
      guard let candidate else { return }
      dismiss()
      onCandidate(candidate)
    }
    .task(id: selectedPhoto) {
      if let selectedPhoto { await decodePhoto(selectedPhoto) }
    }
  }

  @ViewBuilder
  private var content: some View {
    switch model.phase {
    case .preparing:
      VStack(spacing: 14) {
        ProgressView()
          .controlSize(.large)
        Text(OnboardingStrings.scanPreparing)
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }
      .accessibilityElement(children: .combine)
    case .scanning:
      ZStack {
        if let session = model.captureSession {
          PairingCameraPreview(session: session)
            .ignoresSafeArea()
        }
        PairingScannerViewfinder(
          hint: OnboardingStrings.scanHint,
          notice: photoError ?? model.notice,
          animatesSweep: !reduceMotion
        )
      }
      .accessibilityIdentifier("native-e2e.pair.scan.viewfinder")
    case .permissionDenied:
      guidanceCard(
        PairingScannerGuidance(
          systemImage: "lock.slash",
          title: OnboardingStrings.scanDeniedTitle,
          message: OnboardingStrings.scanDeniedMessage,
          actionTitle: OnboardingStrings.scanOpenSettings
        ),
        action: openSystemSettings
      )
    case .noCamera:
      guidanceCard(
        PairingScannerGuidance(
          systemImage: "video.slash",
          title: OnboardingStrings.scanNoCameraTitle,
          message: OnboardingStrings.scanNoCameraMessage,
          actionTitle: nil
        ),
        action: nil
      )
    case .failed:
      guidanceCard(
        PairingScannerGuidance(
          systemImage: "exclamationmark.triangle",
          title: OnboardingStrings.scanFailedTitle,
          message: OnboardingStrings.scanFailedMessage,
          actionTitle: OnboardingStrings.scanRetry
        ),
        action: { Task { await model.start() } }
      )
    }
  }

  private func guidanceCard(
    _ guidance: PairingScannerGuidance,
    action: (() -> Void)?
  ) -> some View {
    PairingScannerGuidanceCard(guidance: guidance, action: action, photoError: photoError)
      .padding(24)
  }

  private func decodePhoto(_ item: PhotosPickerItem) async {
    isDecodingPhoto = true
    photoError = nil
    defer {
      isDecodingPhoto = false
      selectedPhoto = nil
    }
    do {
      guard let data = try await item.loadTransferable(type: Data.self) else {
        photoError = OnboardingStrings.scanPhotoNoCode
        return
      }
      let payload = try await PairingPhotoCodeDecoder.decode(data)
      try Task.checkCancellation()
      if !model.propose(payload: payload) {
        photoError = OnboardingStrings.scanPhotoInvalid
      }
    } catch is CancellationError {
    } catch {
      if !Task.isCancelled { photoError = OnboardingStrings.scanPhotoNoCode }
    }
  }

  private func openSystemSettings() {
    guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
    UIApplication.shared.open(url)
  }
}
