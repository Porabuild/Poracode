import Foundation

enum SideChatCommand {
  static func question(in draft: String) -> String? {
    let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard text.hasPrefix("/btw") else { return nil }
    let suffix = text.dropFirst(4)
    guard suffix.isEmpty || suffix.first?.isWhitespace == true else { return nil }
    return suffix.trimmingCharacters(in: .whitespacesAndNewlines)
  }
}

extension RichPromptSegment {
  /// The two native composer surfaces share the same canonical wire input.
  /// Keep every context field when transferring a draft between them.
  func lifecyclePromptSegment() throws -> ThreadPromptSegment {
    switch self {
    case .text(let content): .text(content: content)
    case .selectedText(let content): .selectedText(content: content)
    case .file(let path): .file(path: path)
    case .attachment(let path, let mime): .attachment(path: path, mimeType: mime)
    case .thread(let id, let title): .thread(threadID: id, title: title)
    case .mcp(let id, let name): .mcp(id: id, name: name)
    case .diffComment(let path, let line, let side, let staged, let body):
      .diffComment(path: path, lineNumber: Int(clamping: line), side: side == .old ? .old : .new, staged: staged, body: body)
    case .skill(let name, let path, let invocation, let provider, let scope, let pluginID, let pluginName):
      if let scope = ThreadPromptSegment.Scope(rawValue: scope) {
        .skill(name: name, path: path, invocation: invocation, provider: provider, scope: scope, pluginID: pluginID, pluginName: pluginName)
      } else { throw RichChatGatewayError.invalidRequest }
    }
  }
}
