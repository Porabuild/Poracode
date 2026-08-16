import Foundation

struct RichGoalPresentation: Equatable, Sendable {
  let objective: String
  let status: String
  let availableActions: Set<String>
}

enum RichImagePresentation: Equatable, Sendable, Identifiable {
  case inline(source: String, classification: RichInlineImageClassification)
  case local(path: String)
  case remote(RichRemoteImageReference)

  var id: String {
    switch self {
    case .inline(let source, _): "inline:\(source.hashValue)"
    case .local(let path): "local:\(path)"
    case .remote(let reference):
      "remote:\(reference.threadID):\(reference.itemID):\(reference.path.count)"
    }
  }
}

/// Display-ready context-window occupancy. Only ever built from values the
/// desktop actually reported — never from a local token estimate.
struct RichContextUsagePresentation: Equatable, Sendable {
  let usedTokens: Int64?
  let maxTokens: Int64
  let remainingTokens: Int64?
  let percent: Int?
}

enum RichChatPresentation {
  private static let preferredStreams = [
    "assistant_text", "reasoning_text", "plan_text", "command_output",
    "file_change_output",
  ]

  static func text(for item: RichRuntimeItem) -> String {
    let stream = preferredStreams.compactMap { item.streams[$0] }
      .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
      .joined(separator: "\n")
    if !stream.isEmpty { return stream }
    let blockText = (RichContentDecoder.decodeMessageContent(item.payload) ?? [])
      .compactMap(text)
      .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
      .joined(separator: "\n")
    if !blockText.isEmpty { return blockText }
    guard let object = item.payload?.objectValue else { return "" }
    for key in ["title", "name", "summary", "message", "command", "path", "result"] {
      if let value = object[key]?.stringValue, !value.isEmpty { return value }
    }
    return ""
  }

  static func images(for item: RichRuntimeItem) -> [RichImagePresentation] {
    var values: [RichImagePresentation] = []
    for block in RichContentDecoder.decodeMessageContent(item.payload) ?? [] {
      switch block {
      case .image(_, let source, let path, _, _):
        if let classification = RichImagePolicy.classify(source) {
          values.append(.inline(source: source, classification: classification))
        } else if let path, !path.isEmpty {
          values.append(.local(path: path))
        }
      case .file(let path, _, let mimeType, _)
      where mimeType?.lowercased().hasPrefix("image/") == true:
        values.append(.local(path: path))
      default:
        break
      }
    }
    collectRemoteImages(item.payload, into: &values, depth: 0)
    var seen: Set<String> = []
    return values.filter { seen.insert($0.id).inserted }.prefix(8).map { $0 }
  }

  static func latestGoal(in items: [RichRuntimeItem]) -> RichGoalPresentation? {
    guard
      let payload = items.reversed().first(where: { $0.type == RichItemType.goal })?.payload?
        .objectValue,
      payload["action"]?.stringValue != "cleared",
      let objective = payload["objective"]?.stringValue?
        .trimmingCharacters(in: .whitespacesAndNewlines),
      !objective.isEmpty
    else { return nil }
    let allowed = Set(["edit", "pause", "resume", "clear"])
    let actions = Set(
      (payload["availableActions"]?.arrayValue ?? []).compactMap(\.stringValue)
        .filter(allowed.contains)
    )
    return RichGoalPresentation(
      objective: objective,
      status: payload["status"]?.stringValue ?? "active",
      availableActions: actions
    )
  }

  /// Mirrors the Android dock rule: a positive reported window plus at least one
  /// reported occupancy signal. Anything less stays hidden rather than guessed.
  static func contextUsage(_ usage: RichContextUsage?) -> RichContextUsagePresentation? {
    guard let usage, let maxTokens = usage.maxTokens,
      usage.usedTokens != nil || !(usage.breakdown ?? []).isEmpty
    else { return nil }
    let used = usage.usedTokens
    let percent = used.map {
      min(100, max(0, Int((Double($0) / Double(maxTokens) * 100).rounded())))
    }
    return RichContextUsagePresentation(
      usedTokens: used,
      maxTokens: maxTokens,
      remainingTokens: used.map { max(0, maxTokens - $0) },
      percent: percent
    )
  }

  static func requestResolution(
    request: RichOpenRequest,
    optionIDs: [String]
  ) -> RichChatRequestResolution? {
    guard let primary = optionIDs.first else { return nil }
    var response: [String: RichJSON] = ["optionId": .string(primary)]
    if optionIDs.count > 1 {
      response["optionIds"] = .array(optionIDs.map(RichJSON.string))
    }
    return RichChatRequestResolution(
      requestID: request.requestID,
      method: "requestPermission",
      response: .object(response)
    )
  }

  static func typeLabel(for item: RichRuntimeItem) -> String {
    switch item.type {
    case RichItemType.userMessage: RichChatStrings.you
    case RichItemType.assistantMessage: RichChatStrings.assistant
    case RichItemType.reasoning: RichChatStrings.reasoning
    case "command_execution": RichChatStrings.command
    case "file_change": RichChatStrings.fileChanges
    case "web_search": RichChatStrings.webSearch
    case "image_view": RichChatStrings.image
    default: RichChatStrings.activity
    }
  }

  static func inlineImageData(
    source: String,
    classification: RichInlineImageClassification
  ) -> Data? {
    let encoded: String
    switch classification.kind {
    case .rawSVG:
      return nil
    case .base64:
      encoded = source
    case .dataURL:
      guard let comma = source.firstIndex(of: ","),
        source[..<comma].localizedCaseInsensitiveContains(";base64")
      else { return nil }
      encoded = String(source[source.index(after: comma)...])
    }
    return Data(base64Encoded: encoded, options: [.ignoreUnknownCharacters])
  }

  private static func text(_ block: RichContentBlock) -> String? {
    switch block {
    case .text(let text): text
    case .skill(_, let invocation, _, _): invocation
    case .mcp(let name): name
    case .diffComment(let path, let line, _, _, let body): "\(path):\(line)\n\(body)"
    case .file(let path, let name, _, _): name ?? path
    case .image(_, _, let path, let name, _): name ?? path
    }
  }

  private static func collectRemoteImages(
    _ value: RichJSON?,
    into output: inout [RichImagePresentation],
    depth: Int
  ) {
    guard let value, depth <= 8, output.count < 8 else { return }
    if let reference = RichImagePolicy.decodeRemoteReference(value) {
      output.append(.remote(reference))
      return
    }
    switch value {
    case .object(let object):
      for child in object.values { collectRemoteImages(child, into: &output, depth: depth + 1) }
    case .array(let array):
      for child in array { collectRemoteImages(child, into: &output, depth: depth + 1) }
    default:
      break
    }
  }
}
