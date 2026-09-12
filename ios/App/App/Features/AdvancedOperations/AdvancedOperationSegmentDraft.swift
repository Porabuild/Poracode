import Foundation

enum AdvancedSegmentKind: String, CaseIterable, Identifiable, Sendable {
  case text
  case file
  case attachment
  case diffComment
  case skill
  case mcp

  var id: String { rawValue }
  var title: String { AdvancedOperationsStrings.segmentKind(self) }
}

/// Editable members of a segment draft.
enum AdvancedSegmentFieldKey: String, CaseIterable, Identifiable, Sendable {
  case content
  case path
  case mimeType
  case lineNumber
  case side
  case staged
  case body
  case name
  case invocation
  case provider
  case scope
  case pluginId
  case pluginName
  case identifier

  var id: String { rawValue }
  var title: String { AdvancedOperationsStrings.segmentField(self) }
}

extension AdvancedSegmentKind {
  /// Fields the editor shows for this kind, in wire order.
  var fields: [AdvancedSegmentFieldKey] {
    switch self {
    case .text: [.content]
    case .file: [.path]
    case .attachment: [.path, .mimeType]
    case .diffComment: [.path, .lineNumber, .side, .staged, .body]
    case .skill: [.name, .path, .invocation, .provider, .scope, .pluginId, .pluginName]
    case .mcp: [.identifier, .name]
    }
  }
}

/// Editable form of one structured composer segment.
///
/// Every wire field of every segment kind is representable, so no segment kind
/// loses data on the way to the request.
struct AdvancedSegmentDraft: Identifiable, Equatable, Sendable {
  let id: UUID
  var kind: AdvancedSegmentKind
  var content = ""
  var path = ""
  var mimeType = ""
  var lineNumber = ""
  var side: AdvancedDiffSide = .new
  var staged = false
  var body = ""
  var name = ""
  var invocation = ""
  var provider = ""
  var scope: AdvancedSkillScope = .project
  var pluginId = ""
  var pluginName = ""
  var identifier = ""

  init(id: UUID = UUID(), kind: AdvancedSegmentKind = .text) {
    self.id = id
    self.kind = kind
  }
}

extension AdvancedSegmentDraft {
  /// Generic access for the editor. `side`, `staged`, and `scope` are edited
  /// through their own typed properties.
  subscript(text key: AdvancedSegmentFieldKey) -> String {
    get {
      switch key {
      case .content: content
      case .path: path
      case .mimeType: mimeType
      case .lineNumber: lineNumber
      case .body: body
      case .name: name
      case .invocation: invocation
      case .provider: provider
      case .pluginId: pluginId
      case .pluginName: pluginName
      case .identifier: identifier
      case .side, .staged, .scope: ""
      }
    }
    set {
      switch key {
      case .content: content = newValue
      case .path: path = newValue
      case .mimeType: mimeType = newValue
      case .lineNumber: lineNumber = newValue
      case .body: body = newValue
      case .name: name = newValue
      case .invocation: invocation = newValue
      case .provider: provider = newValue
      case .pluginId: pluginId = newValue
      case .pluginName: pluginName = newValue
      case .identifier: identifier = newValue
      case .side, .staged, .scope: break
      }
    }
  }
}

enum AdvancedSegmentBuilder {
  static func segments(_ drafts: [AdvancedSegmentDraft]) throws -> [AdvancedThreadInputSegment] {
    try drafts.enumerated().map { try segment($0.element, index: $0.offset) }
  }

  static func segment(
    _ draft: AdvancedSegmentDraft,
    index: Int
  ) throws -> AdvancedThreadInputSegment {
    switch draft.kind {
    case .text:
      return .text(content: try text(draft.content, index: index))
    case .file:
      return .file(path: try text(draft.path, index: index))
    case .attachment:
      return .attachment(
        path: try text(draft.path, index: index),
        mimeType: AdvancedInputParsing.optional(draft.mimeType)
      )
    case .diffComment:
      return .diffComment(
        path: try text(draft.path, index: index),
        lineNumber: try AdvancedInputParsing.lineNumber(draft.lineNumber, index: index),
        side: draft.side,
        staged: draft.staged,
        body: try text(draft.body, index: index)
      )
    case .skill:
      return .skill(
        name: try text(draft.name, index: index),
        path: try text(draft.path, index: index),
        invocation: try text(draft.invocation, index: index),
        provider: try text(draft.provider, index: index),
        scope: draft.scope,
        pluginId: AdvancedInputParsing.optional(draft.pluginId),
        pluginName: AdvancedInputParsing.optional(draft.pluginName)
      )
    case .mcp:
      return .mcp(
        id: try text(draft.identifier, index: index),
        name: try text(draft.name, index: index)
      )
    }
  }

  /// Segment values are submitted verbatim; blanks are rejected instead of
  /// being silently dropped.
  private static func text(_ value: String, index: Int) throws -> String {
    guard !AdvancedInputParsing.isBlank(value) else {
      throw AdvancedFormValidationError.missingSegmentField(index: index)
    }
    return value
  }
}

extension AdvancedThreadInputSegment {
  var kind: AdvancedSegmentKind {
    switch self {
    case .text: .text
    case .file: .file
    case .attachment: .attachment
    case .diffComment: .diffComment
    case .skill: .skill
    case .mcp: .mcp
    }
  }
}
