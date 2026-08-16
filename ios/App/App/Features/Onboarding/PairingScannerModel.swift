import AVFoundation
import Observation

/// Drives the pairing-code scanner: authorization, camera lifecycle, and payload
/// validation. Every failure mode is distinct so the UI can offer actionable copy
/// plus both fallbacks, and a decoded code is only ever *proposed* — pairing itself
/// stays on the caller's normal submit path with its consent gates.
@MainActor
@Observable
final class PairingScannerModel {
  enum Phase: Equatable {
    case preparing
    case scanning
    /// `AVCaptureDevice.authorizationStatus` is `.denied` or `.restricted`.
    case permissionDenied
    /// No capture device — the iOS Simulator lands here.
    case noCamera
    /// A device exists but the session could not start.
    case failed
  }

  private(set) var phase: Phase = .preparing
  /// Inline correction shown while the scanner stays open (unrelated code in frame).
  private(set) var notice: String?
  /// Set once a decoded payload validates as a pairing link.
  private(set) var accepted: PairingURL.PairingCandidate?

  private var camera: PairingScanCamera?
  private var noticeTask: Task<Void, Never>?

  var captureSession: AVCaptureSession? { camera?.captureSession }

  func start() async {
    guard accepted == nil else { return }
    notice = nil
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      await activate()
    case .notDetermined:
      phase = .preparing
      if await AVCaptureDevice.requestAccess(for: .video) {
        await activate()
      } else {
        phase = .permissionDenied
      }
    case .denied, .restricted:
      phase = .permissionDenied
    @unknown default:
      phase = .permissionDenied
    }
  }

  /// Stops the session and releases the camera.
  func stop() {
    noticeTask?.cancel()
    noticeTask = nil
    notice = nil
    camera?.stop()
  }

  private func activate() async {
    let camera =
      camera
      ?? PairingScanCamera { [weak self] payload in
        self?.handle(payload: payload)
      }
    self.camera = camera
    phase = .preparing
    do {
      try await camera.start()
      phase = .scanning
    } catch PairingScanCamera.Failure.noCamera {
      phase = .noCamera
    } catch {
      phase = .failed
    }
  }

  private func handle(payload: String) {
    guard phase == .scanning, accepted == nil else { return }
    let trimmed = payload.trimmingCharacters(in: .whitespacesAndNewlines)
    guard
      let url = URL(string: trimmed),
      let candidate = PairingURL.validatedPairingCandidate(from: url)
    else {
      reject()
      return
    }
    camera?.setDelivering(false)
    noticeTask?.cancel()
    noticeTask = nil
    notice = nil
    accepted = candidate
  }

  /// A stray QR code must not dump the user back to the start: correct inline and
  /// keep the session running.
  private func reject() {
    guard notice == nil else { return }
    notice = OnboardingStrings.scanInvalidCode
    camera?.setDelivering(false)
    noticeTask?.cancel()
    noticeTask = Task { [weak self] in
      try? await Task.sleep(for: .seconds(2.5))
      guard !Task.isCancelled else { return }
      self?.notice = nil
      self?.camera?.setDelivering(true)
    }
  }
}
