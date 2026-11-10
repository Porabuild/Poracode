import Foundation

/// Mirrors `splitInlineVisuals` in `src/shared/inlineVisuals.ts`, pinned by
/// `protocol/remote/v3/fixtures/rich-inline-visuals.json`.
enum RichInlineVisualPart: Equatable {
  case markdown(String)
  case visual(version: Int, title: String, html: String, complete: Bool)
  case native(version: Int, title: String, source: String, complete: Bool)
}

/// One rendered unit of an assistant reply. Native visuals keep their fenced
/// source on mobile; authored HTML runs only in the sandboxed web view.
enum RichInlineVisualBlock: Equatable {
  case markdown(String)
  case html(RichHtmlVisualPresentation)
  case source(language: String, source: String)
}

struct RichHtmlVisualPresentation: Hashable {
  enum SourceOnlyReason: Equatable {
    case incomplete, unsupported, limited, tooLarge
  }

  let title: String
  let html: String
  let version: Int
  let complete: Bool
  let limited: Bool

  var sourceOnlyReason: SourceOnlyReason? {
    if !complete { return .incomplete }
    if version != RichInlineVisualParser.formatVersion { return .unsupported }
    if limited { return .limited }
    if html.utf8.count > RichInlineVisualParser.maxSourceBytes { return .tooLarge }
    return nil
  }
}

enum RichInlineVisualParser {
  static let formatVersion = 1
  /// Each preview owns its own web view and sandboxed frames.
  static let maxPreviewsPerMessage = 4
  /// The sandbox proxy bounds the whole document, leaving room for the bootstrap.
  static let maxSourceBytes = 256 * 1024 - 8 * 1024
  /// Reported page heights clamp to this CSS px range.
  static let minHeight: Double = 80
  static let maxHeight: Double = 2000
  static let elisionNoticePrefix = "[... poracode elided "
  static let elisionHeadUTF16Units = 256_128

  /// Blocks for a settled reply, or nil when it holds no visual fence or when
  /// retained history cannot prove that a fenced body is intact.
  static func blocks(for text: String, settled: Bool) -> [RichInlineVisualBlock]? {
    guard settled, text.contains("poracode-html-v") || text.contains("poracode-visual-v"),
      !isElided(text)
    else { return nil }
    let parts = split(text)
    guard parts.contains(where: { if case .markdown = $0 { false } else { true } }) else {
      return nil
    }
    var previews = 0
    return parts.map { part in
      switch part {
      case .markdown(let text):
        return .markdown(text)
      case .visual(let version, let title, let html, let complete):
        defer { previews += 1 }
        return .html(
          RichHtmlVisualPresentation(
            title: title, html: html, version: version, complete: complete,
            limited: previews >= maxPreviewsPerMessage))
      case .native(let version, let title, let source, _):
        return .source(
          language: title.isEmpty
            ? "poracode-visual-v\(version)" : "poracode-visual-v\(version) \(title)",
          source: source)
      }
    }
  }

  /// Only absolute, credential-free web URLs leave the sandbox, after confirmation.
  static func linkURL(_ text: String?) -> URL? {
    guard let text, text.utf16.count <= 2048, let url = URL(string: text),
      ["http", "https"].contains(url.scheme?.lowercased() ?? ""), url.host?.isEmpty == false,
      url.user == nil, url.password == nil
    else { return nil }
    return url
  }

  static func isElided(_ text: String) -> Bool {
    guard let range = text.range(of: elisionNoticePrefix) else { return false }
    return range.upperBound.utf16Offset(in: text) <= elisionHeadUTF16Units
  }

  static func split(_ text: String) -> [RichInlineVisualPart] {
    var parts: [RichInlineVisualPart] = []
    var markdown = ""
    var fence: (marker: Unicode.Scalar, length: Int)?
    var pending: (native: Bool, version: Int, title: String, body: String)?
    for line in lines(text) {
      let match = fenceMatch(withoutLineEnding(line))
      if let open = fence {
        let closes =
          match.map {
            $0.marker == open.marker && $0.length >= open.length && jsTrim($0.info).isEmpty
          } ?? false
        if closes {
          if let visual = pending {
            parts.append(part(visual, complete: true))
            pending = nil
          } else {
            markdown += line
          }
          fence = nil
        } else if pending != nil {
          pending?.body += line
        } else {
          markdown += line
        }
        continue
      }
      if let match, !(match.marker == "`" && match.info.unicodeScalars.contains("`")) {
        fence = (match.marker, match.length)
        if let header = header(jsTrim(match.info)) {
          if !markdown.isEmpty { parts.append(.markdown(markdown)) }
          markdown = ""
          pending = (header.native, header.version, header.title, "")
          continue
        }
      }
      markdown += line
    }
    if let visual = pending { parts.append(part(visual, complete: false)) }
    if !markdown.isEmpty { parts.append(.markdown(markdown)) }
    return parts
  }

  private static func part(
    _ visual: (native: Bool, version: Int, title: String, body: String), complete: Bool
  ) -> RichInlineVisualPart {
    visual.native
      ? .native(version: visual.version, title: visual.title, source: visual.body, complete: complete)
      : .visual(version: visual.version, title: visual.title, html: visual.body, complete: complete)
  }

  /// Lines keep their `\n`; scalars avoid treating `\r\n` as one character.
  private static func lines(_ text: String) -> [String] {
    let scalars = text.unicodeScalars
    var lines: [String] = []
    var start = scalars.startIndex
    var index = start
    while index < scalars.endIndex {
      let next = scalars.index(after: index)
      if scalars[index] == "\n" {
        lines.append(String(scalars[start..<next]))
        start = next
      }
      index = next
    }
    if start < scalars.endIndex { lines.append(String(scalars[start...])) }
    return lines
  }

  private static func withoutLineEnding(_ line: String) -> String.UnicodeScalarView {
    var scalars = line.unicodeScalars
    guard scalars.last == "\n" else { return scalars }
    scalars.removeLast()
    if scalars.last == "\r" { scalars.removeLast() }
    return scalars
  }

  /// `/^ {0,3}(`{3,}|~{3,})(.*)$/` without the JavaScript line terminators `.` refuses.
  private static func fenceMatch(_ body: String.UnicodeScalarView)
    -> (marker: Unicode.Scalar, length: Int, info: String)?
  {
    var index = body.startIndex
    var spaces = 0
    while index < body.endIndex, body[index] == " ", spaces < 3 {
      spaces += 1
      index = body.index(after: index)
    }
    guard index < body.endIndex, body[index] == "`" || body[index] == "~" else { return nil }
    let marker = body[index]
    var length = 0
    while index < body.endIndex, body[index] == marker {
      length += 1
      index = body.index(after: index)
    }
    let info = body[index...]
    guard length >= 3, !info.contains(where: { ["\r", "\u{2028}", "\u{2029}"].contains($0) })
    else { return nil }
    return (marker, length, String(info))
  }

  /// `/^poracode-(html|visual)-v(\d+)(?:[\t ]+(.*))?$/` on a trimmed info string.
  private static func header(_ info: String) -> (native: Bool, version: Int, title: String)? {
    let native: Bool
    let rest: Substring.UnicodeScalarView
    if info.hasPrefix("poracode-html-v") {
      native = false
      rest = info.unicodeScalars.dropFirst("poracode-html-v".unicodeScalars.count)
    } else if info.hasPrefix("poracode-visual-v") {
      native = true
      rest = info.unicodeScalars.dropFirst("poracode-visual-v".unicodeScalars.count)
    } else {
      return nil
    }
    let digits = rest.prefix { ("0"..."9").contains($0) }
    let remainder = rest.dropFirst(digits.count)
    guard !digits.isEmpty, remainder.first.map({ $0 == "\t" || $0 == " " }) ?? true else {
      return nil
    }
    let title = jsTrim(String(remainder.drop { $0 == "\t" || $0 == " " }))
    return (
      native, Int(String(digits)) ?? Int.max,
      String(decoding: title.utf16.prefix(200), as: UTF16.self)
    )
  }

  /// ECMAScript `String.prototype.trim` whitespace and line terminators.
  private static func jsTrim(_ text: String) -> String {
    let scalars = text.unicodeScalars
    guard let first = scalars.firstIndex(where: { !isJSWhitespace($0) }),
      let last = scalars.lastIndex(where: { !isJSWhitespace($0) })
    else { return "" }
    return String(scalars[first...last])
  }

  private static func isJSWhitespace(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar.value {
    case 0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F,
      0x3000, 0xFEFF:
      true
    default:
      false
    }
  }
}
