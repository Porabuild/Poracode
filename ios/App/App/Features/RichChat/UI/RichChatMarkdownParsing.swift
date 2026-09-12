import Foundation

enum RichChatMarkdownBlock: Equatable {
  case heading(level: Int, text: String)
  case paragraph(String)
  case orderedList([String])
  case unorderedList([String])
  case code(language: String?, source: String)
  case table(headers: [String], rows: [[String]])
  case quote(String)
}

enum RichChatMarkdownParser {
  static func parse(_ source: String) -> [RichChatMarkdownBlock] {
    let lines = source.components(separatedBy: .newlines)
    var blocks: [RichChatMarkdownBlock] = []
    var index = 0

    while index < lines.count {
      let line = lines[index]
      if line.trimmingCharacters(in: .whitespaces).isEmpty {
        index += 1
        continue
      }

      if line.hasPrefix("```") {
        let language = String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces)
        index += 1
        var code: [String] = []
        while index < lines.count, !lines[index].hasPrefix("```") {
          code.append(lines[index])
          index += 1
        }
        if index < lines.count { index += 1 }
        blocks.append(
          .code(language: language.isEmpty ? nil : language, source: code.joined(separator: "\n")))
        continue
      }

      if let heading = heading(from: line) {
        blocks.append(heading)
        index += 1
        continue
      }

      if index + 1 < lines.count, isTableRow(line), isTableDivider(lines[index + 1]) {
        let headers = tableCells(line)
        index += 2
        var rows: [[String]] = []
        while index < lines.count, isTableRow(lines[index]) {
          rows.append(tableCells(lines[index]))
          index += 1
        }
        blocks.append(.table(headers: headers, rows: rows))
        continue
      }

      if line.trimmingCharacters(in: .whitespaces).hasPrefix(">") {
        var quote: [String] = []
        while index < lines.count {
          let candidate = lines[index].trimmingCharacters(in: .whitespaces)
          guard candidate.hasPrefix(">") else { break }
          quote.append(String(candidate.dropFirst()).trimmingCharacters(in: .whitespaces))
          index += 1
        }
        blocks.append(.quote(quote.joined(separator: "\n")))
        continue
      }

      if orderedItem(from: line) != nil {
        var items: [String] = []
        while index < lines.count, let item = orderedItem(from: lines[index]) {
          items.append(item)
          index += 1
        }
        blocks.append(.orderedList(items))
        continue
      }

      if let firstItem = unorderedItem(from: line) {
        var items = [firstItem]
        index += 1
        while index < lines.count, let item = unorderedItem(from: lines[index]) {
          items.append(item)
          index += 1
        }
        blocks.append(.unorderedList(items))
        continue
      }

      var paragraph = [line]
      index += 1
      while index < lines.count, !startsBlock(lines[index], next: lines[safe: index + 1]) {
        paragraph.append(lines[index])
        index += 1
      }
      blocks.append(.paragraph(paragraph.joined(separator: "\n")))
    }

    return blocks
  }

  private static func heading(from line: String) -> RichChatMarkdownBlock? {
    let prefix = line.prefix { $0 == "#" }
    guard (1...6).contains(prefix.count), line.dropFirst(prefix.count).first == " " else {
      return nil
    }
    return .heading(level: prefix.count, text: String(line.dropFirst(prefix.count + 1)))
  }

  private static func orderedItem(from line: String) -> String? {
    let trimmed = line.trimmingCharacters(in: .whitespaces)
    guard let separator = trimmed.firstIndex(of: ".") else { return nil }
    let number = trimmed[..<separator]
    let remainder = trimmed[trimmed.index(after: separator)...]
    guard !number.isEmpty, number.allSatisfy(\.isNumber), remainder.first == " " else {
      return nil
    }
    return String(remainder.dropFirst())
  }

  private static func unorderedItem(from line: String) -> String? {
    let trimmed = line.trimmingCharacters(in: .whitespaces)
    guard trimmed.hasPrefix("- ") || trimmed.hasPrefix("* ") else { return nil }
    return String(trimmed.dropFirst(2))
  }

  private static func isTableRow(_ line: String) -> Bool {
    line.contains("|") && tableCells(line).count > 1
  }

  private static func isTableDivider(_ line: String) -> Bool {
    let cells = tableCells(line)
    return !cells.isEmpty
      && cells.allSatisfy { cell in
        let divider = cell.replacingOccurrences(of: ":", with: "")
          .trimmingCharacters(in: .whitespaces)
        return divider.count >= 3 && divider.allSatisfy { $0 == "-" }
      }
  }

  private static func tableCells(_ line: String) -> [String] {
    var trimmed = line.trimmingCharacters(in: .whitespaces)
    if trimmed.hasPrefix("|") { trimmed.removeFirst() }
    if trimmed.hasSuffix("|") { trimmed.removeLast() }
    return trimmed.split(separator: "|", omittingEmptySubsequences: false).map {
      String($0).trimmingCharacters(in: .whitespaces)
    }
  }

  private static func startsBlock(_ line: String, next: String?) -> Bool {
    let trimmed = line.trimmingCharacters(in: .whitespaces)
    return trimmed.isEmpty || line.hasPrefix("```") || heading(from: line) != nil
      || trimmed.hasPrefix(">") || orderedItem(from: line) != nil
      || unorderedItem(from: line) != nil
      || (next.map { isTableRow(line) && isTableDivider($0) } ?? false)
  }
}

extension Array {
  fileprivate subscript(safe index: Index) -> Element? {
    indices.contains(index) ? self[index] : nil
  }
}
