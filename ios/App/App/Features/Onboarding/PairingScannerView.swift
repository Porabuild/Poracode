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
  @State private var selectedPhoto: PhotosPickerItem?
  @State private var isDecodingPhoto = false
  @State private var photoError: String?

  var body: some View {
    ZStack {
      Color.black.ignoresSafeArea()
      content
    }
    .overlay(alignment: .topTrailing) { closeButton }
    .preferredColorScheme(.dark)
    .task { await model.start() }
    .onDisappear { model.stop() }
    .onChange(of: model.accepted) { _, candidate in
      guard let candidate else { return }
      dismiss()
      onCandidate(candidate)
    }
    .onChange(of: selectedPhoto) { _, item in
      guard let item else { return }
      Task { await decodePhoto(item) }
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
          notice: model.notice,
          animatesSweep: !reduceMotion
        )
      }
      .accessibilityIdentifier("native-e2e.pair.scan.viewfinder")
      .safeAreaInset(edge: .bottom, spacing: 0) { scannerFallbackBar }
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
    PairingScannerGuidanceCard(
      guidance: guidance,
      action: action,
      photoSelection: $selectedPhoto,
      isDecodingPhoto: isDecodingPhoto,
      photoError: photoError,
      usePairingLink: {
        dismiss()
        onUsePairingLink()
      },
      useManualEntry: {
        dismiss()
        onUseManualEntry()
      }
    )
    .padding(24)
  }

  private var scannerFallbackBar: some View {
    let decodingPhoto = isDecodingPhoto
    return VStack(spacing: 8) {
      if let photoError {
        Text(photoError)
          .font(.footnote)
          .foregroundStyle(.white.opacity(0.8))
          .multilineTextAlignment(.center)
      }
      HStack(spacing: 12) {
        PhotosPicker(selection: $selectedPhoto, matching: .images) {
          Label(
            decodingPhoto ? OnboardingStrings.scanPhotoReading : OnboardingStrings.scanPhoto,
            systemImage: decodingPhoto ? "hourglass" : "photo"
          )
          .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .disabled(decodingPhoto)
        Button {
          dismiss()
          onUsePairingLink()
        } label: {
          Label(OnboardingStrings.scanUsePairingLink, systemImage: "link")
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
      }
    }
    .padding(.horizontal, 20)
    .padding(.vertical, 14)
    .background(.ultraThinMaterial)
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
      if !model.propose(payload: payload) {
        photoError = OnboardingStrings.scanPhotoInvalid
      }
    } catch is CancellationError {
    } catch {
      photoError = OnboardingStrings.scanPhotoNoCode
    }
  }

  private var closeButton: some View {
    Button {
      dismiss()
    } label: {
      Image(systemName: "xmark")
        .font(.headline)
        .foregroundStyle(.white)
        .padding(12)
        .background(.black.opacity(0.4), in: Circle())
    }
    .buttonStyle(.plain)
    .padding(16)
    .accessibilityLabel(OnboardingStrings.scanClose)
    .accessibilityIdentifier("native-e2e.pair.scan.close")
  }

  private func openSystemSettings() {
    guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
    UIApplication.shared.open(url)
  }
}
