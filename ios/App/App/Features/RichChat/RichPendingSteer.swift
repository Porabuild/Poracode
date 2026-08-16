import Foundation

enum RichPromptSegment: Sendable, Equatable {
  case text(content: String)
  case file(path: String)
  case attachment(path: String, mimeType: String?)
  case diffComment(path: String, lineNumber: Int64, side: RichDiffSide, staged: Bool, body: String)
  case skill(
    name: String,
    path: String,
    invocation: String,
    provider: String,
    scope: String,
    pluginID: String?,
    pluginName: String?
  )
  case mcp(id: String, name: String)
}

struct RichPendingSteer: Sendable, Equatable, Identifiable {
  let id: String
  let prompt: String
  let segments: [RichPromptSegment]?
  let stagedAtMilliseconds: Double
}

struct RichPendingSteerEnvelope: Sendable, Equatable {
  let threadID: String
  let pending: RichPendingSteer?
}

struct RichSetPendingSteerInput: Sendable, Equatable {
  let prompt: String
  let segments: [RichPromptSegment]?
  let config: [String: RichJSON]
}

struct RichPendingSteerState: Sendable, Equatable {
  let threadID: String
  private(set) var pending: RichPendingSteer?

  init(threadID: String, pending: RichPendingSteer? = nil) {
    self.threadID = threadID
    self.pending = pending
  }

  mutating func apply(_ envelope: RichPendingSteerEnvelope) {
    guard envelope.threadID == threadID else { return }
    pending = envelope.pending
  }
}

enum RichPendingSteerDecoder {
  static func decodeSetBody(_ value: RichJSON) throws -> RichSetPendingSteerInput {
    guard let object = value.objectValue,
      let prompt = RichDecoding.requiredString(object, "prompt", allowEmpty: false),
      let config = object["config"]?.objectValue
    else { throw RichDomainDecodeError.invalidPendingSteer }
    return RichSetPendingSteerInput(
      prompt: prompt,
      segments: try decodeOptionalSegments(object),
      config: config
    )
  }

  static func isValidClearBody(_ value: RichJSON) -> Bool {
    value.objectValue?.isEmpty == true
  }

  static func decodeEnvelope(_ value: RichJSON) throws -> RichPendingSteerEnvelope {
    guard let object = value.objectValue,
      RichDecoding.requiredString(object, "type") == "thread-pending-steer",
      let threadID = RichDecoding.requiredString(object, "threadId", allowEmpty: false),
      let rawPending = object["pending"]
    else { throw RichDomainDecodeError.invalidPendingSteer }
    let pending = rawPending == .null ? nil : try decodePending(rawPending)
    return RichPendingSteerEnvelope(threadID: threadID, pending: pending)
  }

  static func decodeSegment(_ value: RichJSON) throws -> RichPromptSegment {
    guard let object = value.objectValue,
      let kind = RichDecoding.requiredString(object, "kind")
    else { throw RichDomainDecodeError.invalidPendingSteer }
    switch kind {
    case "text":
      guard let content = RichDecoding.requiredString(object, "content") else { break }
      return .text(content: content)
    case "file":
      guard let path = RichDecoding.requiredString(object, "path") else { break }
      return .file(path: path)
    case "attachment":
      guard let path = RichDecoding.requiredString(object, "path") else { break }
      let mime = RichDecoding.optionalString(object, "mimeType")
      guard mime != .invalid else { break }
      return .attachment(path: path, mimeType: mime.value)
    case "diff_comment":
      guard let path = RichDecoding.requiredString(object, "path", allowEmpty: false),
        let line = object["lineNumber"]?.exactInt64Value, line > 0,
        let sideText = RichDecoding.requiredString(object, "side"),
        let side = RichDiffSide(rawValue: sideText),
        let staged = object["staged"]?.boolValue,
        let body = RichDecoding.requiredString(object, "body", allowEmpty: false)
      else { break }
      return .diffComment(path: path, lineNumber: line, side: side, staged: staged, body: body)
    case "skill":
      guard let name = RichDecoding.requiredString(object, "name", allowEmpty: false),
        let path = RichDecoding.requiredString(object, "path", allowEmpty: false),
        let invocation = RichDecoding.requiredString(object, "invocation", allowEmpty: false),
        let provider = RichDecoding.requiredString(object, "provider", allowEmpty: false),
        let scope = RichDecoding.requiredString(object, "scope"),
        scope == "global" || scope == "project"
      else { break }
      let pluginID = RichDecoding.optionalString(object, "pluginId", allowEmpty: false)
      let pluginName = RichDecoding.optionalString(object, "pluginName", allowEmpty: false)
      guard pluginID != .invalid, pluginName != .invalid else { break }
      return .skill(
        name: name,
        path: path,
        invocation: invocation,
        provider: provider,
        scope: scope,
        pluginID: pluginID.value,
        pluginName: pluginName.value
      )
    case "mcp":
      guard let id = RichDecoding.requiredString(object, "id", allowEmpty: false),
        let name = RichDecoding.requiredString(object, "name", allowEmpty: false)
      else { break }
      return .mcp(id: id, name: name)
    default:
      break
    }
    throw RichDomainDecodeError.invalidPendingSteer
  }

  private static func decodePending(_ value: RichJSON) throws -> RichPendingSteer {
    guard let object = value.objectValue,
      let id = RichDecoding.requiredString(object, "id", allowEmpty: false),
      let prompt = RichDecoding.requiredString(object, "prompt"),
      let stagedDecimal = object["stagedAt"]?.decimalValue
    else { throw RichDomainDecodeError.invalidPendingSteer }
    let stagedAt = NSDecimalNumber(decimal: stagedDecimal).doubleValue
    guard stagedAt.isFinite else { throw RichDomainDecodeError.invalidPendingSteer }
    return RichPendingSteer(
      id: id,
      prompt: prompt,
      segments: try decodeOptionalSegments(object),
      stagedAtMilliseconds: stagedAt
    )
  }

  private static func decodeOptionalSegments(
    _ object: [String: RichJSON]
  ) throws -> [RichPromptSegment]? {
    switch RichDecoding.optionalArray(object, "segments") {
    case .absent: return nil
    case .invalid: throw RichDomainDecodeError.invalidPendingSteer
    case .value(let values): return try values.map(decodeSegment)
    }
  }
}
