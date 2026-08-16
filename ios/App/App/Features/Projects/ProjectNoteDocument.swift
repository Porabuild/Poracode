import Foundation

/// Plain-text interpretation of the shared notes document (ProseMirror JSON),
/// matching the Android client's `ProjectNoteDocument`. Native clients edit the
/// notes doc as plain text: paragraphs are separated by newlines, and every
/// text run inside a node is collected in document order.
enum ProjectNoteDocument {
  static func text(_ document: JSONValue?) -> String {
    collectText(document).trimmingCharacters(in: CharacterSet(charactersIn: "\n"))
  }

  static func fromText(_ text: String) -> JSONValue? {
    guard !text.isEmpty else { return nil }
    let paragraphs = text.components(separatedBy: "\n").map { line in
      JSONValue.object([
        "type": .string("paragraph"),
        "content": .array(
          line.isEmpty
            ? []
            : [.object(["type": .string("text"), "text": .string(line)])]
        ),
      ])
    }
    return .object(["type": .string("doc"), "content": .array(paragraphs)])
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
