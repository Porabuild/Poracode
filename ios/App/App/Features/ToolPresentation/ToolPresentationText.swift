import Foundation

struct RichToolTextPart: Sendable, Equatable {
  let text: String
  let language: String
  static let empty = Self(text: "", language: "plain")
}

/// Executes only the closed generic reference vocabulary; no tool/provider names.
enum RichToolTextProjection {
  struct Section: Identifiable {
    let id: Int
    let descriptor: RichToolSection
    let part: RichToolTextPart
  }
  static func sections(_ presentation: RichToolPresentation, item: RichRuntimeItem) -> [Section] {
    var sections: [Section] = []
    for (index, section) in presentation.sections.enumerated() {
      let part = resolve(section.source, payload: item.payload, streams: item.streams)
      guard !part.text.isEmpty, section.onlyLanguage == nil || section.onlyLanguage == part.language else { continue }
      sections.append(.init(id: index, descriptor: section, part: part))
      if section.replaceFollowing { break }
    }
    return sections
  }
  static func resolve(_ source: RichToolTextSource, payload: RichJSON?, streams: [String: String]) -> RichToolTextPart {
    switch source {
    case .value(let source): return resolve(source, payload: payload, streams: streams)
    case .firstNonempty(let sources):
      for source in sources {
        let part = resolve(source, payload: payload, streams: streams)
        if !part.text.isEmpty { return part }
      }
      return .empty
    }
  }

  private static func resolve(_ source: RichToolValueSource, payload: RichJSON?, streams: [String: String]) -> RichToolTextPart {
    let root = source.root == .payload ? payload : .object(streams.mapValues(RichJSON.string))
    guard let value = read(root, path: source.path), value != .null, accepts(value, source.accept) else { return .empty }
    switch source.format {
    case .terminal:
      return value.stringValue.map { .init(text: RichToolTerminalText.strip($0), language: "plain") } ?? .empty
    case .json: return .init(text: json(value), language: "json")
    case .textList:
      guard let values = value.arrayValue else { return .empty }
      let parts = values.compactMap { read($0, path: source.eachPath)?.stringValue }
        .filter { !$0.isEmpty }.map(pretty)
      return parts.isEmpty ? .empty : .init(text: parts.joined(separator: "\n\n"), language: parts.allSatisfy(isJSON) ? "json" : "plain")
    case .value:
      switch value {
      case .string(let text): return part(pretty(text))
      case .number(let value): return .init(text: NSDecimalNumber(decimal: value).stringValue, language: "plain")
      case .bool(let value): return .init(text: value ? "true" : "false", language: "plain")
      case .object, .array: return .init(text: json(value), language: "json")
      case .null: return .empty
      }
    }
  }

  static func read(_ value: RichJSON?, path: [RichToolPathKey]) -> RichJSON? {
    var current = value
    for key in path {
      switch (current, key) {
      case (.object(let values), .key(let key)): current = values[key]
      case (.object(let values), .index(let index)): current = values[String(index)]
      case (.array(let values), .index(let index)): current = values.indices.contains(index) ? values[index] : nil
      case (.array(let values), .key(let key)):
        guard let index = Int(key), String(index) == key, values.indices.contains(index) else { return nil }
        current = values[index]
      default: return nil
      }
    }
    return current
  }

  private static func accepts(_ value: RichJSON, _ accept: RichToolValueSource.Accept?) -> Bool {
    switch (accept, value) {
    case (nil, _): true
    case (.string, .string): true
    case (.nonString, .string): false
    case (.nonString, _): true
    case (.scalar, .string), (.scalar, .number), (.scalar, .bool): true
    case (.object, .object), (.object, .array): true
    default: false
    }
  }

  static func json(_ value: RichJSON) -> String {
    var text = ""
    appendJSON(value, level: 0, to: &text)
    return text
  }

  private static func appendJSON(_ value: RichJSON, level: Int, to text: inout String) {
    let indent = String(repeating: " ", count: level * 2)
    let childIndent = indent + "  "
    switch value {
    case .object(let values):
      if values.isEmpty { text += "{}"; return }
      text += "{\n"
      for (index, key) in values.keys.sorted().enumerated() {
        text += childIndent + quoted(key) + ": "
        appendJSON(values[key]!, level: level + 1, to: &text)
        text += index + 1 < values.count ? ",\n" : "\n"
      }
      text += indent + "}"
    case .array(let values):
      if values.isEmpty { text += "[]"; return }
      text += "[\n"
      for (index, value) in values.enumerated() {
        text += childIndent; appendJSON(value, level: level + 1, to: &text)
        text += index + 1 < values.count ? ",\n" : "\n"
      }
      text += indent + "]"
    case .string(let value): text += quoted(value)
    case .number(let value): text += NSDecimalNumber(decimal: value).stringValue
    case .bool(let value): text += value ? "true" : "false"
    case .null: text += "null"
    }
  }

  private static func quoted(_ value: String) -> String {
    let encoder = JSONEncoder(); encoder.outputFormatting = [.withoutEscapingSlashes]
    return (try? encoder.encode(value)).flatMap { String(data: $0, encoding: .utf8) } ?? "\"\""
  }

  private static func structured(_ text: String) -> RichJSON? {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard (trimmed.hasPrefix("{") && trimmed.hasSuffix("}")) || (trimmed.hasPrefix("[") && trimmed.hasSuffix("]")),
      let value = try? RichJSON.decode(Data(trimmed.utf8)) else { return nil }
    return value.objectValue != nil || value.arrayValue != nil ? value : nil
  }
  private static func isJSON(_ text: String) -> Bool { structured(text) != nil }
  private static func pretty(_ text: String) -> String { structured(text).map(json) ?? text }
  private static func part(_ text: String) -> RichToolTextPart {
    let diff = text.range(of: #"(?m)^diff --git [^\n]+$"#, options: .regularExpression) != nil
      && text.range(of: #"(?m)^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@"#, options: .regularExpression) != nil
    return .init(text: text, language: diff ? "diff" : (isJSON(text) ? "json" : "plain"))
  }
}
