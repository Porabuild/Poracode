import AVFoundation
import SwiftUI
import UIKit

/// Whether the scan route can work at all on this device, decided without ever
/// prompting: no capture device (the iOS Simulator), or access already refused.
/// `AVCaptureDevice.requestAccess` is deliberately *not* called here — asking for
/// the camera must stay a consequence of tapping Scan.
enum OnboardingScanAvailability {
  static var isScanningUnavailable: Bool {
    if AVCaptureDevice.default(for: .video) == nil { return true }
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .denied, .restricted: return true
    default: return false
    }
  }
}

/// Camera plumbing for the pairing-code scanner.
///
/// The `AVCaptureSession` is confined to `queue`: device discovery, configuration,
/// `startRunning()`, and `stopRunning()` all run there so the main actor never blocks on the
/// camera. Decoded payloads are published back on the main actor. `@unchecked Sendable` is
/// sound because every mutable member is touched only from that queue; `captureSession` is
/// handed to the preview layer as an opaque reference and is never mutated on the main actor.
final class PairingScanCamera: NSObject, @unchecked Sendable {
  enum Failure: Error, Equatable {
    /// No usable capture device at all — the iOS Simulator lands here.
    case noCamera
    /// A device exists but the session or the QR output could not be built.
    case sessionUnavailable
  }

  private let session = AVCaptureSession()
  private let queue = DispatchQueue(label: "app.poracode.pairing-scanner", qos: .userInitiated)
  private let onPayload: @Sendable @MainActor (String) -> Void
  private var isConfigured = false
  private var isDelivering = false

  init(onPayload: @escaping @Sendable @MainActor (String) -> Void) {
    self.onPayload = onPayload
    super.init()
  }

  var captureSession: AVCaptureSession { session }

  /// Configures (once) and starts the session off the main thread.
  func start() async throws {
    try await withCheckedThrowingContinuation {
      (continuation: CheckedContinuation<Void, any Error>) in
      queue.async { [self] in
        do {
          try configureIfNeeded()
          if !session.isRunning { session.startRunning() }
          isDelivering = true
          continuation.resume()
        } catch {
          continuation.resume(throwing: error)
        }
      }
    }
  }

  /// Releases the camera. Safe to call more than once.
  func stop() {
    queue.async { [self] in
      isDelivering = false
      if session.isRunning { session.stopRunning() }
    }
  }

  /// Pauses/resumes payload delivery without tearing the session down, so a stray
  /// code in frame cannot spam the UI while the correction is on screen.
  func setDelivering(_ delivering: Bool) {
    queue.async { [self] in
      isDelivering = delivering
    }
  }

  private func configureIfNeeded() throws {
    guard !isConfigured else { return }
    guard
      let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
        ?? AVCaptureDevice.default(for: .video)
    else {
      throw Failure.noCamera
    }

    let input: AVCaptureDeviceInput
    do {
      input = try AVCaptureDeviceInput(device: device)
    } catch {
      throw Failure.sessionUnavailable
    }

    session.beginConfiguration()
    defer { session.commitConfiguration() }
    guard session.canAddInput(input) else { throw Failure.sessionUnavailable }
    session.addInput(input)

    let output = AVCaptureMetadataOutput()
    guard session.canAddOutput(output) else { throw Failure.sessionUnavailable }
    session.addOutput(output)
    guard output.availableMetadataObjectTypes.contains(.qr) else {
      throw Failure.sessionUnavailable
    }
    output.metadataObjectTypes = [.qr]
    output.setMetadataObjectsDelegate(self, queue: queue)
    isConfigured = true
  }
}

extension PairingScanCamera: AVCaptureMetadataOutputObjectsDelegate {
  func metadataOutput(
    _: AVCaptureMetadataOutput,
    didOutput metadataObjects: [AVMetadataObject],
    from _: AVCaptureConnection
  ) {
    guard isDelivering else { return }
    let payload = metadataObjects
      .compactMap { $0 as? AVMetadataMachineReadableCodeObject }
      .filter { $0.type == .qr }
      .compactMap(\.stringValue)
      .first { !$0.isEmpty }
    guard let payload else { return }
    let publish = onPayload
    Task { @MainActor in
      publish(payload)
    }
  }
}

/// Live camera preview backed by `AVCaptureVideoPreviewLayer`.
struct PairingCameraPreview: UIViewRepresentable {
  let session: AVCaptureSession

  func makeUIView(context _: Context) -> PreviewView {
    let view = PreviewView()
    view.backgroundColor = .black
    view.previewLayer.videoGravity = .resizeAspectFill
    view.previewLayer.session = session
    return view
  }

  func updateUIView(_ view: PreviewView, context _: Context) {
    if view.previewLayer.session !== session {
      view.previewLayer.session = session
    }
  }

  final class PreviewView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }

    var previewLayer: AVCaptureVideoPreviewLayer {
      // Guaranteed by `layerClass` above.
      guard let layer = layer as? AVCaptureVideoPreviewLayer else {
        return AVCaptureVideoPreviewLayer()
      }
      return layer
    }
  }
}
