import Foundation

enum RichDiffSide: String, Sendable, Equatable, Codable {
  case old
  case new
}

enum RichContentSource: String, Sendable, Equatable, Codable {
  case attachment
  case mention
}

enum RichContentBlock: Sendable, Equatable {
  case text(text: String)
  case skill(name: String, invocation: String, pluginID: String?, pluginName: String?)
  case mcp(name: String)
  case diffComment(path: String, lineNumber: Int64, side: RichDiffSide, staged: Bool, body: String)
  case image(
    mimeType: String,
    dataURL: String,
    path: String?,
    name: String?,
    source: RichContentSource?
  )
  case file(path: String, name: String?, mimeType: String?, source: RichContentSource?)
}

enum RichItemState: String, Sendable, Equatable, Codable {
  case started
  case updated
  case completed
}

struct RichRuntimeItem: Sendable, Equatable, Identifiable {
  let id: String
  let type: String
  var state: RichItemState
  var payload: RichJSON?
  var streams: [String: String]
  let parentItemID: String?
}

enum RichPayloadPatch: Sendable, Equatable {
  case omitted
  case clear
  case value(RichJSON)

  static func decode(from object: [String: RichJSON], key: String = "payload") -> Self {
    guard let value = object[key] else { return .omitted }
    return value == .null ? .clear : .value(value)
  }
}

enum RichItemType {
  static let userMessage = "user_message"
  static let assistantMessage = "assistant_message"
  static let reasoning = "reasoning"
  static let plan = "plan"
  static let goal = "goal"
  static let error = "error"
  static let pendingRequest = "pending_request"

  static let toolLike: Set<String> = [
    "tool_call", "mcp_tool_call", "image_view", "dynamic_tool_call",
  ]
  static let groupable = toolLike.union([
    reasoning, "command_execution", "file_change", "web_search",
  ])
}

enum RichContentDecoder {
  static func decodeBlock(_ value: RichJSON) throws -> RichContentBlock {
    guard let object = value.objectValue,
      let kind = RichDecoding.requiredString(object, "kind")
    else { throw RichDomainDecodeError.invalidContentBlock }

    switch kind {
    case "text":
      guard let text = RichDecoding.requiredString(object, "text") else { break }
      return .text(text: text)
    case "skill":
      guard let name = RichDecoding.requiredString(object, "name"),
        let invocation = RichDecoding.requiredString(object, "invocation"),
        let pluginID = validOptionalString(object, "pluginId", allowEmpty: false),
        let pluginName = validOptionalString(object, "pluginName", allowEmpty: false)
      else { break }
      return .skill(
        name: name,
        invocation: invocation,
        pluginID: pluginID.value,
        pluginName: pluginName.value
      )
    case "mcp":
      guard let name = RichDecoding.requiredString(object, "name") else { break }
      return .mcp(name: name)
    case "diff_comment":
      guard let path = RichDecoding.requiredString(object, "path"),
        let line = object["lineNumber"]?.exactInt64Value, line > 0,
        let sideText = RichDecoding.requiredString(object, "side"),
        let side = RichDiffSide(rawValue: sideText),
        let staged = object["staged"]?.boolValue,
        let body = RichDecoding.requiredString(object, "body")
      else { break }
      return .diffComment(path: path, lineNumber: line, side: side, staged: staged, body: body)
    case "image":
      guard let mimeType = RichDecoding.requiredString(object, "mimeType"),
        let dataURL = RichDecoding.requiredString(object, "dataUrl"),
        let path = validOptionalString(object, "path"),
        let name = validOptionalString(object, "name"),
        let source = validSource(object)
      else { break }
      return .image(
        mimeType: mimeType,
        dataURL: dataURL,
        path: path.value,
        name: name.value,
        source: source
      )
    case "file":
      guard let path = RichDecoding.requiredString(object, "path"),
        let name = validOptionalString(object, "name"),
        let mime = validOptionalString(object, "mimeType"),
        let source = validSource(object)
      else { break }
      return .file(path: path, name: name.value, mimeType: mime.value, source: source)
    default:
      break
    }
    throw RichDomainDecodeError.invalidContentBlock
  }

  static func decodeBlocks(_ value: RichJSON) throws -> [RichContentBlock] {
    guard let values = value.arrayValue else { throw RichDomainDecodeError.invalidContentBlock }
    return try values.map(decodeBlock)
  }

  static func decodeMessageContent(_ payload: RichJSON?) -> [RichContentBlock]? {
    guard let content = payload?.objectValue?["content"] else { return nil }
    return try? decodeBlocks(content)
  }

  static func decodeRuntimeItem(_ value: RichJSON) throws -> RichRuntimeItem {
    guard let object = value.objectValue,
      let id = RichDecoding.requiredString(object, "id", allowEmpty: false),
      let type = RichDecoding.requiredString(object, "type", allowEmpty: false),
      let stateText = RichDecoding.requiredString(object, "state"),
      let state = RichItemState(rawValue: stateText),
      let streamObject = object["streams"]?.objectValue
    else { throw RichDomainDecodeError.invalidRuntimeItem }

    var streams: [String: String] = [:]
    for (key, raw) in streamObject {
      guard let text = raw.stringValue else { throw RichDomainDecodeError.invalidRuntimeItem }
      streams[key] = text
    }
    let parent = RichDecoding.optionalString(object, "parentItemId", allowEmpty: false)
    guard parent != .invalid else { throw RichDomainDecodeError.invalidRuntimeItem }
    let payload = object["payload"].flatMap { $0 == .null ? nil : $0 }
    return RichRuntimeItem(
      id: id,
      type: type,
      state: state,
      payload: payload,
      streams: streams,
      parentItemID: parent.value
    )
  }

  static func decodeRuntimeItems(_ value: RichJSON) throws -> [RichRuntimeItem] {
    guard let values = value.arrayValue else { throw RichDomainDecodeError.invalidRuntimeItem }
    return try values.map(decodeRuntimeItem)
  }

  private struct ValidOptionalString { let value: String? }

  private static func validOptionalString(
    _ object: [String: RichJSON], _ key: String, allowEmpty: Bool = true
  ) -> ValidOptionalString? {
    switch RichDecoding.optionalString(object, key, allowEmpty: allowEmpty) {
    case .absent: ValidOptionalString(value: nil)
    case .invalid: nil
    case .value(let value): ValidOptionalString(value: value)
    }
  }

  private static func validSource(_ object: [String: RichJSON]) -> RichContentSource?? {
    switch RichDecoding.optionalString(object, "source") {
    case .absent: return .some(nil)
    case .invalid: return nil
    case .value(let value): return RichContentSource(rawValue: value).map(Optional.some)
    }
  }
}
