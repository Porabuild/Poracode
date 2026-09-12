import SwiftUI

enum RichChatSyntaxTokenKind: Equatable {
  case plain
  case keyword
  case string
  case number
  case function
  case comment
  case markup
}

struct RichChatSyntaxToken: Equatable {
  let text: String
  let kind: RichChatSyntaxTokenKind
}

enum RichChatSyntaxHighlighter {
  private static let keywords: Set<String> = [
    "async", "await", "break", "case", "catch", "class", "const", "continue", "default",
    "do", "else", "enum", "export", "extends", "false", "finally", "for", "from", "func",
    "function", "guard", "if", "import", "in", "interface", "let", "nil", "null", "private",
    "protocol", "public", "return", "static", "struct", "switch", "throw", "throws", "true",
    "try", "type", "var", "while",
  ]

  private static let expression = try! NSRegularExpression(
    pattern:
      #"(?s:/\*.*?\*/)|(?://[^\n]*)|(?:"(?:\\.|[^"\\])*")|(?:'(?:\\.|[^'\\])*')|\b(?:async|await|break|case|catch|class|const|continue|default|do|else|enum|export|extends|false|finally|for|from|func|function|guard|if|import|in|interface|let|nil|null|private|protocol|public|return|static|struct|switch|throw|throws|true|try|type|var|while)\b|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][A-Za-z0-9_$]*(?=\s*\()"#
  )

  static func tokens(source: String, language: String?) -> [RichChatSyntaxToken] {
    guard supports(language), !source.isEmpty else {
      return source.isEmpty ? [] : [RichChatSyntaxToken(text: source, kind: .plain)]
    }

    if isMarkdown(language) {
      return markdownTokens(source)
    }

    let sourceString = source as NSString
    let matches = expression.matches(
      in: source,
      range: NSRange(location: 0, length: sourceString.length)
    )
    var result: [RichChatSyntaxToken] = []
    var cursor = 0
    for match in matches {
      if match.range.location > cursor {
        result.append(
          RichChatSyntaxToken(
            text: sourceString.substring(
              with: NSRange(location: cursor, length: match.range.location - cursor)),
            kind: .plain
          ))
      }
      let text = sourceString.substring(with: match.range)
      result.append(RichChatSyntaxToken(text: text, kind: kind(for: text)))
      cursor = NSMaxRange(match.range)
    }
    if cursor < sourceString.length {
      result.append(
        RichChatSyntaxToken(
          text: sourceString.substring(from: cursor),
          kind: .plain
        ))
    }
    return result
  }

  static func attributed(
    source: String,
    language: String?,
    colorScheme: ColorScheme
  ) -> AttributedString {
    tokens(source: source, language: language).reduce(into: AttributedString()) { output, token in
      var segment = AttributedString(token.text)
      if let color = color(for: token.kind, colorScheme: colorScheme) {
        segment.foregroundColor = color
      }
      output += segment
    }
  }

  private static func supports(_ language: String?) -> Bool {
    guard let language = language?.lowercased() else { return false }
    return [
      "bash", "javascript", "js", "json", "jsx", "python", "sh", "shell", "swift", "ts",
      "tsx", "typescript", "zsh", "markdown", "md", "mdx",
    ].contains(language)
  }

  private static func isMarkdown(_ language: String?) -> Bool {
    guard let language = language?.lowercased() else { return false }
    return ["markdown", "md", "mdx"].contains(language)
  }

  private static func markdownTokens(_ source: String) -> [RichChatSyntaxToken] {
    let expression = try! NSRegularExpression(
      pattern: #"(?:^\s{0,3}(?:#{1,6}|[-*+]|>)\s+)|(?:`[^`]+`)|(?:\[[^\]]+\]\([^\)]+\))|(?:\*\*[^*]+\*\*)|(?:__[^_]+__)"#,
      options: [.anchorsMatchLines]
    )
    let sourceString = source as NSString
    let matches = expression.matches(
      in: source,
      range: NSRange(location: 0, length: sourceString.length)
    )
    var result: [RichChatSyntaxToken] = []
    var cursor = 0
    for match in matches {
      if match.range.location > cursor {
        result.append(
          RichChatSyntaxToken(
            text: sourceString.substring(
              with: NSRange(location: cursor, length: match.range.location - cursor)),
            kind: .plain
          ))
      }
      result.append(
        RichChatSyntaxToken(
          text: sourceString.substring(with: match.range),
          kind: .markup
        ))
      cursor = NSMaxRange(match.range)
    }
    if cursor < sourceString.length {
      result.append(
        RichChatSyntaxToken(text: sourceString.substring(from: cursor), kind: .plain)
      )
    }
    return result
  }

  private static func kind(for token: String) -> RichChatSyntaxTokenKind {
    if token.hasPrefix("//") || token.hasPrefix("/*") { return .comment }
    if token.hasPrefix("\"") || token.hasPrefix("'") { return .string }
    if keywords.contains(token) { return .keyword }
    if token.first?.isNumber == true { return .number }
    return .function
  }

  private static func color(
    for kind: RichChatSyntaxTokenKind,
    colorScheme: ColorScheme
  ) -> Color? {
    switch (colorScheme, kind) {
    case (_, .plain): nil
    case (.dark, .keyword): Color(red: 1.00, green: 0.48, blue: 0.45)
    case (.dark, .string): Color(red: 0.65, green: 0.84, blue: 1.00)
    case (.dark, .number): Color(red: 0.47, green: 0.75, blue: 1.00)
    case (.dark, .function): Color(red: 0.82, green: 0.66, blue: 1.00)
    case (.dark, .comment): Color(red: 0.55, green: 0.59, blue: 0.65)
    case (.dark, .markup): Color(red: 0.51, green: 0.72, blue: 1.00)
    case (.light, .keyword): Color(red: 0.82, green: 0.18, blue: 0.22)
    case (.light, .string): Color(red: 0.03, green: 0.33, blue: 0.63)
    case (.light, .number): Color(red: 0.02, green: 0.33, blue: 0.64)
    case (.light, .function): Color(red: 0.42, green: 0.25, blue: 0.66)
    case (.light, .comment): Color(red: 0.42, green: 0.47, blue: 0.52)
    case (.light, .markup): Color(red: 0.12, green: 0.36, blue: 0.68)
    @unknown default: nil
    }
  }
}
