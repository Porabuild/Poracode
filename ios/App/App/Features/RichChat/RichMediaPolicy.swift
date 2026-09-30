import Foundation

enum RichInlineImageKind: Sendable, Equatable {
  case dataURL
  case rawSVG
  case base64
}

struct RichInlineImageClassification: Sendable, Equatable {
  let kind: RichInlineImageKind
  let mimeType: String
}

enum RichImagePathPart: Sendable, Equatable {
  case key(String)
  case index(Int64)
}

struct RichRemoteImageReference: Sendable, Equatable {
  let threadID: String
  let itemID: String
  let path: [RichImagePathPart]
  let mimeType: String
  let bytes: Int64
  let width: Int64?
  let height: Int64?
  let preview: String?
}

struct RichOmittedPayload: Sendable, Equatable {
  let bytes: Int64
}

enum RichImagePolicy {
  private static let signatures: [(String, String)] = [
    ("iVBORw0KGgo", "image/png"),
    ("/9j/", "image/jpeg"),
    ("R0lGOD", "image/gif"),
    ("UklGR", "image/webp"),
    ("PHN2Zw", "image/svg+xml"),
    ("PD94bWwg", "image/svg+xml"),
  ]

  /// Allows only self-contained image bytes. Remote/local/script URLs are never displayable.
  static func classify(_ source: String) -> RichInlineImageClassification? {
    let trimmed = source.drop(while: { $0.isWhitespace })
    let head = String(trimmed.prefix(16)).lowercased()
    if head.hasPrefix("data:image/") {
      let metadata = trimmed.prefix { $0 != "," }
      let mime = metadata.dropFirst(5).prefix { $0 != ";" }.lowercased()
      return RichInlineImageClassification(
        kind: .dataURL,
        mimeType: mime.hasPrefix("image/") ? String(mime) : "image/png"
      )
    }
    if head.hasPrefix("<svg") || head.hasPrefix("<?xml") {
      return RichInlineImageClassification(kind: .rawSVG, mimeType: "image/svg+xml")
    }
    for (prefix, mime) in signatures where source.hasPrefix(prefix) {
      return RichInlineImageClassification(kind: .base64, mimeType: mime)
    }
    return nil
  }

  static func decodeRemoteReference(_ value: RichJSON?) -> RichRemoteImageReference? {
    guard let marker = value?.objectValue?["__poracodeImageRef"]?.objectValue,
      let threadID = RichDecoding.requiredString(marker, "threadId", allowEmpty: false),
      let itemID = RichDecoding.requiredString(marker, "itemId", allowEmpty: false),
      let mime = RichDecoding.requiredString(marker, "mime"), mime.hasPrefix("image/"),
      let bytes = marker["bytes"]?.exactInt64Value, bytes >= 0,
      let rawPath = marker["path"]?.arrayValue, !rawPath.isEmpty
    else { return nil }

    var path: [RichImagePathPart] = []
    for part in rawPath {
      if let key = part.stringValue {
        path.append(.key(key))
      } else if let index = part.exactInt64Value, index >= 0 {
        path.append(.index(index))
      } else {
        return nil
      }
    }
    guard let width = optionalNonnegativeInteger(marker, "width"),
      let height = optionalNonnegativeInteger(marker, "height")
    else { return nil }
    let preview = RichDecoding.optionalString(marker, "preview")
    guard preview != .invalid else { return nil }
    if let source = preview.value {
      guard
        source.trimmingCharacters(in: .whitespacesAndNewlines)
          .lowercased().hasPrefix("data:image/")
      else { return nil }
    }
    return RichRemoteImageReference(
      threadID: threadID,
      itemID: itemID,
      path: path,
      mimeType: mime,
      bytes: bytes,
      width: width.value,
      height: height.value,
      preview: preview.value
    )
  }

  static func decodeOmitted(_ value: RichJSON?) -> RichOmittedPayload? {
    guard let marker = value?.objectValue?["__poracodeOmitted"]?.objectValue,
      let bytes = marker["bytes"]?.exactInt64Value, bytes >= 0
    else { return nil }
    return RichOmittedPayload(bytes: bytes)
  }

  static func isSafe(_ block: RichContentBlock) -> Bool {
    guard case .image(let mime, let dataURL, _, _, _) = block,
      let classification = classify(dataURL)
    else { return false }
    return classification.mimeType.caseInsensitiveCompare(mime) == .orderedSame
  }

  private struct OptionalInteger { let value: Int64? }

  private static func optionalNonnegativeInteger(
    _ object: [String: RichJSON], _ key: String
  ) -> OptionalInteger? {
    guard let raw = object[key] else { return OptionalInteger(value: nil) }
    guard raw != .null, let value = raw.exactInt64Value, value >= 0 else { return nil }
    return OptionalInteger(value: value)
  }
}

enum RichAttachmentError: String, Sendable, Equatable {
  case empty = "empty_attachment"
  case tooLarge = "attachment_too_large"
  case invalid = "invalid_attachment"
}

struct RichAttachmentDecision: Sendable, Equatable {
  let queryValid: Bool
  let bodyWithinLimit: Bool
  let accepted: Bool
  let error: RichAttachmentError?
}

enum RichAttachmentPolicy {
  static let maximumBytes: Int64 = 20 * 1_024 * 1_024
  /// Matches JavaScript/Zod string length semantics used by the wire boundary.
  static let maximumNameUTF16Units = 255

  static func evaluate(name: String, byteCount: Int64) -> RichAttachmentDecision {
    let queryValid = !name.isEmpty && name.utf16.count <= maximumNameUTF16Units
    let bodyWithinLimit = (0...maximumBytes).contains(byteCount)
    let accepted = queryValid && bodyWithinLimit && byteCount > 0
    let error: RichAttachmentError?
    if accepted {
      error = nil
    } else if !queryValid || byteCount < 0 {
      error = .invalid
    } else if !bodyWithinLimit {
      error = .tooLarge
    } else {
      error = .empty
    }
    return RichAttachmentDecision(
      queryValid: queryValid,
      bodyWithinLimit: bodyWithinLimit,
      accepted: accepted,
      error: error
    )
  }
}
