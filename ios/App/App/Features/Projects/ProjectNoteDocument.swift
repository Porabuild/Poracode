import Foundation
import UIKit

enum ProjectNoteFormat: String, CaseIterable, Hashable, Sendable {
  case bold
  case italic
}

struct ProjectNoteTextRun: Equatable, Sendable {
  let text: String
  let formats: Set<ProjectNoteFormat>
}

struct ProjectNoteParagraph: Equatable, Sendable {
  let runs: [ProjectNoteTextRun]
}

/// Native interpretation of the shared ProseMirror notes document. Bold and
/// italic are the two formatting marks exposed by the PWA Notes bubble menu,
/// so they round-trip through UIKit instead of being flattened to plain text.
enum ProjectNoteDocument {
  static func text(_ document: JSONValue?) -> String {
    collectText(document).trimmingCharacters(in: CharacterSet(charactersIn: "\n"))
  }

  static func fromText(_ text: String) -> JSONValue? {
    guard !text.isEmpty else { return nil }
    return document(
      from: text.components(separatedBy: "\n").map {
        ProjectNoteParagraph(
          runs: $0.isEmpty ? [] : [ProjectNoteTextRun(text: $0, formats: [])]
        )
      }
    )
  }

  static func paragraphs(_ document: JSONValue?) -> [ProjectNoteParagraph] {
    guard case .object(let root) = document,
      case .array(let content)? = root["content"]
    else {
      let value = text(document)
      return value.isEmpty
        ? []
        : value.components(separatedBy: "\n").map {
          ProjectNoteParagraph(
            runs: $0.isEmpty ? [] : [ProjectNoteTextRun(text: $0, formats: [])]
          )
        }
    }
    let blocks = content.flatMap(blockParagraphs)
    if !blocks.isEmpty { return blocks }
    let value = text(document)
    return value.isEmpty
      ? []
      : [ProjectNoteParagraph(runs: [ProjectNoteTextRun(text: value, formats: [])])]
  }

  static func document(from paragraphs: [ProjectNoteParagraph]) -> JSONValue? {
    guard !paragraphs.isEmpty else { return nil }
    return .object([
      "type": .string("doc"),
      "content": .array(
        paragraphs.map { paragraph in
          .object([
            "type": .string("paragraph"),
            "content": .array(paragraph.runs.compactMap(textNode)),
          ])
        }
      ),
    ])
  }

  static func attributedText(_ document: JSONValue?) -> NSAttributedString {
    let output = NSMutableAttributedString(string: "")
    for (index, paragraph) in paragraphs(document).enumerated() {
      if index > 0 {
        output.append(NSAttributedString(string: "\n", attributes: attributes(for: [])))
      }
      for run in paragraph.runs {
        output.append(
          NSAttributedString(string: run.text, attributes: attributes(for: run.formats))
        )
      }
    }
    return output
  }

  static func document(from attributedText: NSAttributedString) -> JSONValue? {
    guard attributedText.length > 0 else { return nil }
    let value = attributedText.string as NSString
    var paragraphs: [ProjectNoteParagraph] = []
    var lineStart = 0

    while lineStart <= value.length {
      let search = NSRange(location: lineStart, length: value.length - lineStart)
      let newline = value.range(of: "\n", options: [], range: search)
      let lineEnd = newline.location == NSNotFound ? value.length : newline.location
      let lineRange = NSRange(location: lineStart, length: lineEnd - lineStart)
      paragraphs.append(ProjectNoteParagraph(runs: runs(in: attributedText, range: lineRange)))
      guard newline.location != NSNotFound else { break }
      lineStart = NSMaxRange(newline)
    }
    return document(from: paragraphs)
  }

  static func font(for formats: Set<ProjectNoteFormat>) -> UIFont {
    let base = UIFont.preferredFont(forTextStyle: .body)
    var traits: UIFontDescriptor.SymbolicTraits = []
    if formats.contains(.bold) { traits.insert(.traitBold) }
    if formats.contains(.italic) { traits.insert(.traitItalic) }
    guard !traits.isEmpty,
      let descriptor = base.fontDescriptor.withSymbolicTraits(traits)
    else { return base }
    return UIFont(descriptor: descriptor, size: base.pointSize)
  }

  static func formats(in font: UIFont?) -> Set<ProjectNoteFormat> {
    guard let font else { return [] }
    let traits = font.fontDescriptor.symbolicTraits
    var result = Set<ProjectNoteFormat>()
    if traits.contains(.traitBold) { result.insert(.bold) }
    if traits.contains(.traitItalic) { result.insert(.italic) }
    return result
  }

  private static func attributes(
    for formats: Set<ProjectNoteFormat>
  ) -> [NSAttributedString.Key: Any] {
    [
      .font: font(for: formats),
      .foregroundColor: UIColor.label,
    ]
  }

  private static func blockParagraphs(_ value: JSONValue) -> [ProjectNoteParagraph] {
    guard case .object(let object) = value else { return [] }
    switch object["type"] {
    case .string("paragraph"), .string("heading"):
      return [ProjectNoteParagraph(runs: inlineRuns(object["content"]))]
    default:
      guard case .array(let content)? = object["content"] else { return [] }
      return content.flatMap(blockParagraphs)
    }
  }

  private static func inlineRuns(_ value: JSONValue?) -> [ProjectNoteTextRun] {
    guard case .array(let values) = value else { return [] }
    var result: [ProjectNoteTextRun] = []
    for value in values {
      guard case .object(let object) = value else { continue }
      if case .string("hardBreak")? = object["type"] {
        append(ProjectNoteTextRun(text: "\n", formats: []), to: &result)
        continue
      }
      if case .string(let text)? = object["text"] {
        append(
          ProjectNoteTextRun(text: text, formats: formats(in: object["marks"])),
          to: &result
        )
      } else if object["content"] != nil {
        for run in inlineRuns(object["content"]) { append(run, to: &result) }
      }
    }
    return result
  }

  private static func formats(in value: JSONValue?) -> Set<ProjectNoteFormat> {
    guard case .array(let marks) = value else { return [] }
    return Set(
      marks.compactMap { mark in
        guard case .object(let object) = mark,
          case .string(let type)? = object["type"]
        else { return nil }
        return ProjectNoteFormat(rawValue: type)
      }
    )
  }

  private static func textNode(_ run: ProjectNoteTextRun) -> JSONValue? {
    guard !run.text.isEmpty else { return nil }
    var value: [String: JSONValue] = [
      "type": .string("text"),
      "text": .string(run.text),
    ]
    let marks = ProjectNoteFormat.allCases.filter(run.formats.contains)
    if !marks.isEmpty {
      value["marks"] = .array(marks.map { .object(["type": .string($0.rawValue)]) })
    }
    return .object(value)
  }

  private static func runs(
    in value: NSAttributedString,
    range: NSRange
  ) -> [ProjectNoteTextRun] {
    guard range.length > 0 else { return [] }
    var result: [ProjectNoteTextRun] = []
    value.enumerateAttribute(.font, in: range) { font, runRange, _ in
      let text = (value.string as NSString).substring(with: runRange)
      append(
        ProjectNoteTextRun(text: text, formats: formats(in: font as? UIFont)),
        to: &result
      )
    }
    return result
  }

  private static func append(
    _ run: ProjectNoteTextRun,
    to values: inout [ProjectNoteTextRun]
  ) {
    guard !run.text.isEmpty else { return }
    if let last = values.last, last.formats == run.formats {
      values[values.count - 1] = ProjectNoteTextRun(
        text: last.text + run.text,
        formats: last.formats
      )
    } else {
      values.append(run)
    }
  }

  private static func collectText(_ value: JSONValue?) -> String {
    switch value {
    case .none, .null:
      return ""
    case .string(let value):
      return value
    case .array(let values):
      return values.map(collectText).joined()
    case .object(let object):
      if case .string("hardBreak")? = object["type"] {
        return "\n"
      }
      if case .string(let direct)? = object["text"] {
        return direct
      }
      let nested = collectText(object["content"])
      switch object["type"] {
      case .string("paragraph"), .string("heading"):
        return nested + "\n"
      default:
        return nested
      }
    case .bool, .number:
      return ""
    }
  }
}
