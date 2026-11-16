import Foundation

/// Display blocks validated by the generated V5 codec, never tool-specific parsing.
struct RichResolvedToolBody: Sendable, Equatable {
  enum Block: Sendable, Equatable {
    case markdown(String), code(String)
    case list(count: String, rows: [Row])
  }
  struct Row: Sendable, Equatable {
    let title: String?
    let summary: String
    let detail: String?
    let fields: [Field]
  }
  struct Field: Sendable, Equatable {
    let label: String
    let text: String
    let isCode: Bool
  }
  let blocks: [Block]
  /// An empty advisory body cannot hide the only canonical rejection details.
  var replacesCanonicalSections: Bool { !blocks.isEmpty }

  init?(_ value: RichJSON) {
    guard let values = value.objectValue?["blocks"]?.arrayValue, values.count <= 8 else { return nil }
    var blocks: [Block] = []
    for value in values {
      guard let object = value.objectValue, let kind = object["kind"]?.stringValue else { return nil }
      switch kind {
      case "markdown", "code":
        guard let text = object["text"]?.stringValue else { return nil }
        if kind == "code" {
          guard ["plain", "json"].contains(object["language"]?.stringValue ?? "") else { return nil }
          blocks.append(.code(text))
        } else { blocks.append(.markdown(text)) }
      case "disclosure-list":
        guard object["label"]?.stringValue == "results", let count = object["countLabel"]?.stringValue,
          let values = object["rows"]?.arrayValue, values.count <= 4096 else { return nil }
        var rows: [Row] = []
        for value in values {
          guard let row = value.objectValue, let summary = row["summary"]?.stringValue,
            let values = row["fields"]?.arrayValue, values.count <= 4096 else { return nil }
          if let title = row["title"], title.stringValue == nil { return nil }
          if let detail = row["detail"], detail.stringValue == nil { return nil }
          var fields: [Field] = []
          for value in values {
            guard let field = value.objectValue, let label = field["label"]?.stringValue,
              let text = field["text"]?.stringValue, let kind = field["kind"]?.stringValue,
              ["text", "code"].contains(kind) else { return nil }
            fields.append(.init(label: label, text: text, isCode: kind == "code"))
          }
          rows.append(.init(title: row["title"]?.stringValue, summary: summary,
            detail: row["detail"]?.stringValue, fields: fields))
        }
        blocks.append(.list(count: count, rows: rows))
      default: return nil
      }
    }
    self.blocks = blocks
  }
}

struct RichResolvedToolBodyRecord: Sendable, Equatable {
  let request: RichRuntimeItemHeadingRequest
  let body: RichResolvedToolBody

  func displayBody(for item: RichRuntimeItem, projection: RichRuntimeItemHeadingProjection?) -> RichResolvedToolBody? {
    displayBody(matching: RichRuntimeItemHeadingRequest(item, projection: projection))
  }

  func displayBody(matching current: RichRuntimeItemHeadingRequest?) -> RichResolvedToolBody? {
    guard request.version == 5, request == current else { return nil }
    return body
  }
}
