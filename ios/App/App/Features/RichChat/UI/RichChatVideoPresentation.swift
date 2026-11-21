import Foundation

struct RichVideoPresentation: Equatable, Sendable, Identifiable {
  let target: String
  let name: String
  let externalURL: URL?
  var id: String { target }

  static func resolve(_ source: String, name: String? = nil, mimeType: String? = nil) -> Self? {
    let source = source.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !source.isEmpty, !source.unicodeScalars.contains(where: { $0.value < 32 || $0.value == 127 }) else { return nil }
    let webURL = URL(string: source).flatMap { ["http", "https"].contains($0.scheme?.lowercased() ?? "") ? $0 : nil }
    guard webURL != nil || RichChatFilePolicy.isSafeFileSource(source) else { return nil }
    guard let target = webURL?.absoluteString ?? RichChatFilePolicy.localPath(from: source) else { return nil }
    let path = webURL?.path ?? target
    let ext = (path as NSString).pathExtension.lowercased()
    guard mimeType?.lowercased().hasPrefix("video/") == true
      || ["mp4", "m4v", "mov", "webm", "mkv", "avi", "mpeg", "mpg", "ogv"].contains(ext)
    else { return nil }
    return Self(target: target, name: name?.isEmpty == false ? name! : RichChatFilePolicy.basename(path), externalURL: webURL)
  }
}

/// Mirrors desktop's typed files, completed Markdown links, and successful
/// MCP resource/resource_link video results. Code examples never become media.
enum RichChatVideoPresentation {
  static func videos(in items: [RichRuntimeItem]) -> [RichVideoPresentation] {
    var seen = Set<String>()
    return items.reversed().filter { $0.parentItemID == nil }.flatMap(videos(for:))
      .filter { seen.insert($0.id).inserted }
  }

  static func videos(for item: RichRuntimeItem) -> [RichVideoPresentation] {
    var result: [RichVideoPresentation] = []
    if item.type == RichItemType.userMessage || item.type == RichItemType.assistantMessage {
      for block in (RichContentDecoder.decodeMessageContent(item.payload) ?? []).reversed() {
        if case .file(let path, let name, let mimeType, _) = block,
          let video = RichVideoPresentation.resolve(path, name: name, mimeType: mimeType) {
          result.append(video)
        }
      }
      if item.type == RichItemType.assistantMessage, item.state == .completed {
        result += markdownVideos(RichChatPresentation.messageBody(for: item)).reversed()
      }
    } else if item.state == .completed,
      ["tool_call", "mcp_tool_call", "dynamic_tool_call", "image_view", "command_execution", "file_change", "web_search"].contains(item.type),
      let payload = item.payload?.objectValue, payload["status"]?.stringValue == "success",
      let value = payload["result"], value.objectValue?["isError"]?.boolValue != true {
      let content = value.arrayValue ?? value.objectValue?["content"]?.arrayValue ?? []
      for block in content.reversed() {
        guard let object = block.objectValue else { continue }
        let resource = object["type"]?.stringValue == "resource" ? object["resource"]?.objectValue
          : object["type"]?.stringValue == "resource_link" ? object : nil
        if let resource, let uri = resource["uri"]?.stringValue,
          let video = RichVideoPresentation.resolve(uri, name: resource["name"]?.stringValue, mimeType: resource["mimeType"]?.stringValue) {
          result.append(video)
        }
      }
    }
    return result
  }

  static func markdownVideos(_ text: String) -> [RichVideoPresentation] {
    let lower = text.lowercased()
    guard text.contains("[") || lower.contains("<video") || lower.contains("<source"),
      let parsed = try? AttributedString(markdown: text)
    else { return [] }
    var result: [RichVideoPresentation] = []
    var html = RichChatHTMLVideoCollector()
    for run in parsed.runs {
      let value = String(parsed[run.range].characters)
      let intent = run.inlinePresentationIntent ?? []
      if intent.contains(.inlineHTML) || intent.contains(.blockHTML) {
        result += html.consume(value)
      } else if html.isVisible, let link = run.link ?? run.imageURL {
        let source = RichChatFilePolicy.decodedMarkdownDestination(link.absoluteString) ?? link.absoluteString
        if let video = RichVideoPresentation.resolve(source, name: value) { result.append(video) }
      }
    }
    return result
  }
}

/// HTML is never rendered or executed here. Only visible video/source targets
/// become candidates, with comment and hidden-element state spanning runs.
private struct RichChatHTMLVideoCollector {
  private var hidden: [String] = []
  private var inComment = false
  private var insideVideo = false
  var isVisible: Bool { hidden.isEmpty && !inComment }
  private static let hiddenTags: Set<String> = ["script", "style", "template", "textarea", "title", "noscript", "iframe", "object"]
  private static let tokens = try! NSRegularExpression(pattern: #"<!--|-->|</?([A-Za-z][A-Za-z0-9:-]*)\b[^>]*>"#)
  private static let source = try! NSRegularExpression(pattern: #"(?i)(?:^|\s)src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#)
  private static let title = try! NSRegularExpression(pattern: #"(?i)(?:^|\s)title\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#)
  private static let entities = try! NSRegularExpression(pattern: #"&(?:#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]+);"#)

  mutating func consume(_ value: String) -> [RichVideoPresentation] {
    var result: [RichVideoPresentation] = []
    for match in Self.tokens.matches(in: value, range: NSRange(value.startIndex..., in: value)) {
      guard let range = Range(match.range, in: value) else { continue }
      let tag = String(value[range])
      if tag == "<!--" { inComment = true; continue }
      if tag == "-->" { inComment = false; continue }
      guard !inComment, let nameRange = Range(match.range(at: 1), in: value) else { continue }
      let name = value[nameRange].lowercased()
      let closing = tag.hasPrefix("</")
      if Self.hiddenTags.contains(name) {
        if closing, hidden.last == name { hidden.removeLast() }
        else if !closing && !tag.hasSuffix("/>") { hidden.append(name) }
        continue
      }
      guard hidden.isEmpty else { continue }
      if name == "video" {
        if closing { insideVideo = false; continue }
        insideVideo = !tag.hasSuffix("/>")
      }
      guard !closing, name == "video" || (name == "source" && insideVideo),
        let source = Self.attribute(Self.source, in: tag),
        let video = RichVideoPresentation.resolve(source, name: Self.attribute(Self.title, in: tag), mimeType: "video/*")
      else { continue }
      result.append(video)
    }
    return result
  }

  private static func attribute(_ expression: NSRegularExpression, in tag: String) -> String? {
    guard let match = expression.firstMatch(in: tag, range: NSRange(tag.startIndex..., in: tag)),
      let range = (1...3).compactMap({ Range(match.range(at: $0), in: tag) }).first
    else { return nil }
    let value = String(tag[range])
    let decoded = NSMutableString(string: value)
    for entity in entities.matches(in: value, range: NSRange(value.startIndex..., in: value)).reversed() {
      guard let range = Range(entity.range, in: value),
        let parsed = try? AttributedString(markdown: String(value[range])) else { continue }
      decoded.replaceCharacters(in: entity.range, with: String(parsed.characters))
    }
    return decoded as String
  }
}
