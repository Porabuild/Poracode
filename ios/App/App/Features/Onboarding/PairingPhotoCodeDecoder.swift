import CoreImage
import Foundation
import Vision

enum PairingPhotoCodeDecoder {
  enum Failure: Error, Equatable {
    case invalidImage
    case noQRCode
  }

  static func decode(_ data: Data) async throws -> String {
    try await Task.detached(priority: .userInitiated) {
      guard let image = CIImage(data: data) else { throw Failure.invalidImage }
      if let payload = try? visionPayload(in: image) { return payload }
      if let payload = coreImagePayload(in: image) { return payload }
      throw Failure.noQRCode
    }.value
  }

  private static func visionPayload(in image: CIImage) throws -> String {
    let request = VNDetectBarcodesRequest()
    request.symbologies = [.qr]
    try VNImageRequestHandler(ciImage: image).perform([request])
    return try validated(request.results?.compactMap(\.payloadStringValue).first)
  }

  private static func coreImagePayload(in image: CIImage) -> String? {
    let context = CIContext(options: [.useSoftwareRenderer: true])
    let detector = CIDetector(
      ofType: CIDetectorTypeQRCode,
      context: context,
      options: [CIDetectorAccuracy: CIDetectorAccuracyHigh]
    )
    let payload = detector?.features(in: image)
      .compactMap { ($0 as? CIQRCodeFeature)?.messageString }
      .first
    return try? validated(payload)
  }

  private static func validated(_ payload: String?) throws -> String {
    guard let payload, !payload.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw Failure.noQRCode
    }
    return payload
  }
}
